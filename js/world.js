'use strict';
// ---------------------------------------------------------------------------
// World storage: chunks, block access, lighting, block updates, liquids,
// tile entities (chests / furnaces) and persistence.
// ---------------------------------------------------------------------------

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_VOL);
    this.meta = new Uint8Array(CHUNK_VOL);
    this.light = new Uint8Array(CHUNK_VOL);
    this.lit = false;
    this.dirty = true;       // needs remesh
    this.urgent = false;     // remesh this frame (player edit)
    this.modified = false;   // differs from generated terrain
    this.mesh = null;        // set by renderer
    this.maxY = WORLD_H - 1;
  }
}

// Shared scratch buffers for lighting
const LPAD = 15, LR = CHUNK + LPAD * 2, LAREA = LR * LR;
const L_FILT = new Uint8Array(LAREA * WORLD_H);
const L_SKY = new Uint8Array(LAREA * WORLD_H);
const L_BLK = new Uint8Array(LAREA * WORLD_H);
const L_HM = new Int16Array(LAREA);
const L_QUEUE = new Int32Array(LAREA * WORLD_H);

class World {
  constructor(seed, saveData) {
    this.seed = seed;
    this.gen = new TerrainGenerator(seed);
    this.chunks = new Map();
    this.saved = new Map();      // key -> {b, m} base64 RLE
    this.tiles = new Map();      // "x,y,z" -> tile entity
    this.lightQueue = new Set(); // chunk keys needing relight
    this.ticks = new Map();      // "x,y,z" -> {x,y,z,t}
    this.tickTimer = 0;
    this.listeners = [];         // block change listeners
    if (saveData) {
      for (const k in saveData.chunks || {}) this.saved.set(k, saveData.chunks[k]);
      for (const k in saveData.tiles || {}) this.tiles.set(k, saveData.tiles[k]);
    }
  }

  getChunk(cx, cz) { return this.chunks.get(chunkKey(cx, cz)); }

  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= WORLD_H) return B.AIR;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c) return B.AIR;
    return c.blocks[(y * 16 + (z & 15)) * 16 + (x & 15)];
  }

  getMeta(x, y, z) {
    if (y < 0 || y >= WORLD_H) return 0;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c) return 0;
    return c.meta[(y * 16 + (z & 15)) * 16 + (x & 15)];
  }

  isLoaded(x, z) { const c = this.chunks.get(chunkKey(x >> 4, z >> 4)); return !!(c && c.lit); }

  getSky(x, y, z) {
    if (y >= WORLD_H) return 15;
    if (y < 0) return 0;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c || !c.lit) return 15;
    return c.light[(y * 16 + (z & 15)) * 16 + (x & 15)] >> 4;
  }
  getBlockLight(x, y, z) {
    if (y >= WORLD_H || y < 0) return 0;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c || !c.lit) return 0;
    return c.light[(y * 16 + (z & 15)) * 16 + (x & 15)] & 15;
  }

  // --- Chunk lifecycle -------------------------------------------------------
  loadChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    const c = new Chunk(cx, cz);
    const s = this.saved.get(key);
    if (s) {
      c.blocks.set(rleDecode(b64ToBytes(s.b), CHUNK_VOL));
      c.meta.set(rleDecode(b64ToBytes(s.m), CHUNK_VOL));
      c.modified = true;
    } else {
      this.gen.generate(c);
    }
    this.chunks.set(key, c);
    return c;
  }

  unloadChunk(c) {
    if (c.modified) this.saveChunk(c);
    this.chunks.delete(chunkKey(c.cx, c.cz));
  }

  saveChunk(c) {
    this.saved.set(chunkKey(c.cx, c.cz), { b: bytesToB64(rleEncode(c.blocks)), m: bytesToB64(rleEncode(c.meta)) });
  }

  neighborsGenerated(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!this.chunks.has(chunkKey(cx + dx, cz + dz))) return false;
    return true;
  }
  neighborsLit(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const c = this.chunks.get(chunkKey(cx + dx, cz + dz)); if (!c || !c.lit) return false; }
    return true;
  }

  // --- Lighting ----------------------------------------------------------------
  // Computes light for a chunk inside a padded region so results are exact
  // without needing persistent cross-chunk propagation state.
  computeLight(chunk) {
    const cx = chunk.cx, cz = chunk.cz;
    const filt = L_FILT, sky = L_SKY, blk = L_BLK, hm = L_HM, q = L_QUEUE;
    const H = WORLD_H;
    filt.fill(15); sky.fill(0); blk.fill(0);
    let qh = 0, qt = 0;
    const emitters = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const ch = this.chunks.get(chunkKey(cx + dx, cz + dz));
      if (!ch) continue;
      const ox = dx * 16 + LPAD, oz = dz * 16 + LPAD;
      const lx0 = Math.max(0, -ox), lx1 = Math.min(15, LR - 1 - ox);
      const lz0 = Math.max(0, -oz), lz1 = Math.min(15, LR - 1 - oz);
      const bl = ch.blocks;
      for (let y = 0; y < H; y++) {
        for (let lz = lz0; lz <= lz1; lz++) {
          const src = (y * 16 + lz) * 16;
          const dst = (y * LR + lz + oz) * LR + ox;
          for (let lx = lx0; lx <= lx1; lx++) {
            const id = bl[src + lx];
            filt[dst + lx] = FILTER[id];
            if (EMIT[id]) emitters.push(dst + lx, EMIT[id]);
          }
        }
      }
    }
    // sky: heightmap + straight-down full light
    for (let c = 0; c < LAREA; c++) {
      let y = H - 1;
      while (y >= 0 && filt[y * LAREA + c] === 0) { sky[y * LAREA + c] = 15; y--; }
      hm[c] = y + 1;
    }
    for (let z = 0; z < LR; z++) for (let x = 0; x < LR; x++) {
      const c = z * LR + x;
      let mx = hm[c];
      if (x > 0) mx = Math.max(mx, hm[c - 1]);
      if (x < LR - 1) mx = Math.max(mx, hm[c + 1]);
      if (z > 0) mx = Math.max(mx, hm[c - LR]);
      if (z < LR - 1) mx = Math.max(mx, hm[c + LR]);
      for (let y = hm[c]; y < mx && y < H; y++) q[qt++] = y * LAREA + c;
      if (hm[c] < H && hm[c] >= mx) q[qt++] = hm[c] * LAREA + c;
    }
    this._propagate(sky, filt, q, qh, qt);
    // block light
    qt = 0;
    for (let i = 0; i < emitters.length; i += 2) { blk[emitters[i]] = emitters[i + 1]; q[qt++] = emitters[i]; }
    this._propagate(blk, filt, q, 0, qt);

    // copy center region, detect change extents
    const out = chunk.light;
    let changed = false, minX = 16, maxX = -1, minZ = 16, maxZ = -1;
    for (let y = 0; y < H; y++) for (let lz = 0; lz < 16; lz++) {
      const src = (y * LR + lz + LPAD) * LR + LPAD, dst = (y * 16 + lz) * 16;
      for (let lx = 0; lx < 16; lx++) {
        const v = (sky[src + lx] << 4) | blk[src + lx];
        if (out[dst + lx] !== v) {
          out[dst + lx] = v; changed = true;
          if (lx < minX) minX = lx; if (lx > maxX) maxX = lx; if (lz < minZ) minZ = lz; if (lz > maxZ) maxZ = lz;
        }
      }
    }
    chunk.lit = true;
    return changed ? { minX, maxX, minZ, maxZ } : null;
  }

  _propagate(lv, filt, q, qh, qt) {
    const H = WORLD_H;
    while (qh < qt) {
      const i = q[qh++];
      const L = lv[i];
      if (L <= 1) continue;
      const y = (i / LAREA) | 0, rem = i - y * LAREA, z = (rem / LR) | 0, x = rem - z * LR;
      // 6 neighbours
      let n, f, nl;
      if (x > 0) { n = i - 1; f = filt[n]; if (f < 15) { nl = L - (f > 1 ? f : 1); if (nl > lv[n]) { lv[n] = nl; q[qt++] = n; } } }
      if (x < LR - 1) { n = i + 1; f = filt[n]; if (f < 15) { nl = L - (f > 1 ? f : 1); if (nl > lv[n]) { lv[n] = nl; q[qt++] = n; } } }
      if (z > 0) { n = i - LR; f = filt[n]; if (f < 15) { nl = L - (f > 1 ? f : 1); if (nl > lv[n]) { lv[n] = nl; q[qt++] = n; } } }
      if (z < LR - 1) { n = i + LR; f = filt[n]; if (f < 15) { nl = L - (f > 1 ? f : 1); if (nl > lv[n]) { lv[n] = nl; q[qt++] = n; } } }
      if (y > 0) { n = i - LAREA; f = filt[n]; if (f < 15) { nl = L - (f > 1 ? f : 1); if (nl > lv[n]) { lv[n] = nl; q[qt++] = n; } } }
      if (y < H - 1) { n = i + LAREA; f = filt[n]; if (f < 15) { nl = L - (f > 1 ? f : 1); if (nl > lv[n]) { lv[n] = nl; q[qt++] = n; } } }
      if (qt >= q.length - 8) break;
    }
  }

  relightChunk(c, urgent) {
    const ch = this.computeLight(c);
    if (!ch) return;
    c.dirty = true; if (urgent) c.urgent = true;
    const mark = (dx, dz) => { const n = this.getChunk(c.cx + dx, c.cz + dz); if (n) { n.dirty = true; if (urgent) n.urgent = true; } };
    const w = ch.minX === 0, e = ch.maxX === 15, nn = ch.minZ === 0, s = ch.maxZ === 15;
    if (w) mark(-1, 0); if (e) mark(1, 0); if (nn) mark(0, -1); if (s) mark(0, 1);
    if (w && nn) mark(-1, -1); if (w && s) mark(-1, 1); if (e && nn) mark(1, -1); if (e && s) mark(1, 1);
  }

  processLightQueue(urgent) {
    for (const key of this.lightQueue) {
      const c = this.chunks.get(key);
      if (c && c.lit) this.relightChunk(c, urgent);
    }
    this.lightQueue.clear();
  }

  // --- Block modification ------------------------------------------------------
  setBlock(x, y, z, id, meta = 0, opts = {}) {
    if (y < 0 || y >= WORLD_H) return false;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c) return false;
    const lx = x & 15, lz = z & 15, idx = (y * 16 + lz) * 16 + lx;
    const old = c.blocks[idx];
    if (old === id && c.meta[idx] === meta) return false;
    c.blocks[idx] = id;
    c.meta[idx] = meta;
    c.modified = true;
    c.dirty = true; c.urgent = true;
    // neighbouring meshes when on border
    if (lx === 0) this._markDirty(c.cx - 1, c.cz); if (lx === 15) this._markDirty(c.cx + 1, c.cz);
    if (lz === 0) this._markDirty(c.cx, c.cz - 1); if (lz === 15) this._markDirty(c.cx, c.cz + 1);
    if (lx === 0 && lz === 0) this._markDirty(c.cx - 1, c.cz - 1); if (lx === 15 && lz === 15) this._markDirty(c.cx + 1, c.cz + 1);
    if (lx === 0 && lz === 15) this._markDirty(c.cx - 1, c.cz + 1); if (lx === 15 && lz === 0) this._markDirty(c.cx + 1, c.cz - 1);
    // relight affected chunks if light properties changed
    if (FILTER[old] !== FILTER[id] || EMIT[old] !== EMIT[id]) {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const ncx = c.cx + dx, ncz = c.cz + dz;
        const bx0 = ncx * 16, bz0 = ncz * 16;
        const ddx = x < bx0 ? bx0 - x : x > bx0 + 15 ? x - bx0 - 15 : 0;
        const ddz = z < bz0 ? bz0 - z : z > bz0 + 15 ? z - bz0 - 15 : 0;
        if (ddx <= LPAD && ddz <= LPAD) this.lightQueue.add(chunkKey(ncx, ncz));
      }
    }
    // tile entities
    const tk = blockKey(x, y, z);
    if (this.tiles.has(tk) && id !== old && !((old === B.FURNACE || old === B.FURNACE_LIT) && (id === B.FURNACE || id === B.FURNACE_LIT))) {
      if (!opts.keepTile) { const te = this.tiles.get(tk); this.tiles.delete(tk); for (const l of this.listeners) l.onTileRemoved && l.onTileRemoved(x, y, z, te); }
    }
    if (!opts.noUpdate) {
      this.scheduleTick(x, y, z, 1);
      this.scheduleTick(x + 1, y, z, 1); this.scheduleTick(x - 1, y, z, 1);
      this.scheduleTick(x, y + 1, z, 1); this.scheduleTick(x, y - 1, z, 1);
      this.scheduleTick(x, y, z + 1, 1); this.scheduleTick(x, y, z - 1, 1);
    }
    for (const l of this.listeners) l.onBlockChanged && l.onBlockChanged(x, y, z, old, id);
    return true;
  }

  _markDirty(cx, cz) { const n = this.getChunk(cx, cz); if (n) { n.dirty = true; n.urgent = true; } }

  scheduleTick(x, y, z, delay) {
    if (y < 0 || y >= WORLD_H) return;
    const k = blockKey(x, y, z);
    const ex = this.ticks.get(k);
    if (ex && ex.t <= delay) return;
    this.ticks.set(k, { x, y, z, t: delay });
  }

  // Called ~20 times per second
  tick() {
    if (this.ticks.size === 0) return;
    const due = [];
    for (const [k, t] of this.ticks) {
      t.t--;
      if (t.t <= 0) { due.push(t); this.ticks.delete(k); }
    }
    let n = 0;
    for (const t of due) {
      if (n++ > 400) { this.scheduleTick(t.x, t.y, t.z, 1); continue; }
      this.updateBlock(t.x, t.y, t.z);
    }
  }

  updateBlock(x, y, z) {
    if (!this.isLoaded(x, z)) return;
    const id = this.getBlock(x, y, z);
    const below = this.getBlock(x, y - 1, z);
    const def = BLOCKS[id];
    if (!def) return;
    if (def.gravity) {
      if (below === B.AIR || below === B.WATER || below === B.LAVA || BLOCKS[below].replaceable) {
        let ny = y - 1;
        while (ny > 0) {
          const b = this.getBlock(x, ny - 1, z);
          if (!(b === B.AIR || b === B.WATER || b === B.LAVA || BLOCKS[b].replaceable)) break;
          ny--;
        }
        this.setBlock(x, y, z, B.AIR);
        this.setBlock(x, ny, z, id);
      }
      return;
    }
    if (id === B.FARMLAND) {
      const ab = this.getBlock(x, y + 1, z);
      if (SOLID[ab] && OPAQUE[ab]) this.setBlock(x, y, z, B.DIRT);
      return;
    }
    if (def.render === RT_CROSS || def.render === RT_CROP || id === B.LILY_PAD) {
      if (!this.plantSupported(id, x, y, z)) {
        // the second half of a tall plant vanishes without dropping anything
        if (DOUBLE_UPPER[id] && this.getBlock(x, y - 1, z) !== DOUBLE_UPPER[id]) this.setBlock(x, y, z, B.AIR);
        else if (DOUBLE_LOWER[id] && this.getBlock(x, y + 1, z) !== DOUBLE_LOWER[id]) this.setBlock(x, y, z, B.AIR);
        else this.breakBlockNaturally(x, y, z);
      }
      return;
    }
    if (id === B.CACTUS) {
      if (below !== B.SAND && below !== B.CACTUS) this.breakBlockNaturally(x, y, z);
      return;
    }
    if (id === B.TORCH) {
      const m = this.getMeta(x, y, z);
      const sup = m === 0 ? [0, -1, 0] : m === 1 ? [-1, 0, 0] : m === 2 ? [1, 0, 0] : m === 3 ? [0, 0, -1] : [0, 0, 1];
      if (!SOLID[this.getBlock(x + sup[0], y + sup[1], z + sup[2])] || !OPAQUE[this.getBlock(x + sup[0], y + sup[1], z + sup[2])]) this.breakBlockNaturally(x, y, z);
      return;
    }
    if (id === B.GRASS || id === B.SNOW_GRASS) {
      const ab = this.getBlock(x, y + 1, z);
      if (OPAQUE[ab]) this.setBlock(x, y, z, B.DIRT, 0, { noUpdate: true });
      return;
    }
    if (id === B.WATER) { this.updateWater(x, y, z); return; }
  }

  // Random ticks: sapling growth and grass spreading near the player
  randomTicks(px, pz) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const c = this.getChunk(pcx + dx, pcz + dz);
      if (!c || !c.lit) continue;
      for (let k = 0; k < 16; k++) {
        const lx = (Math.random() * 16) | 0, lz = (Math.random() * 16) | 0, y = 1 + ((Math.random() * Math.min(WORLD_H - 2, c.maxY + 1)) | 0);
        const id = c.blocks[(y * 16 + lz) * 16 + lx];
        const x = c.cx * 16 + lx, z = c.cz * 16 + lz;
        if (id === B.SAPLING_OAK || id === B.SAPLING_BIRCH || id === B.SAPLING_SPRUCE) {
          if (Math.random() < 0.12 && this.getSky(x, y + 1, z) >= 9) this.growTree(x, y, z, id);
        } else if (id === B.FARMLAND) {
          this.tickFarmland(x, y, z);
        } else if (BLOCKS[id] && BLOCKS[id].crop) {
          this.tickCrop(x, y, z, id);
        } else if (id === B.SUGAR_CANE) {
          if (Math.random() < 0.1 && this.getBlock(x, y + 1, z) === B.AIR && !(this.getBlock(x, y - 1, z) === B.SUGAR_CANE && this.getBlock(x, y - 2, z) === B.SUGAR_CANE)) this.setBlock(x, y + 1, z, B.SUGAR_CANE, 0, { noUpdate: true });
        } else if (id === B.BERRY_BUSH_EMPTY) {
          if (Math.random() < 0.08) this.setBlock(x, y, z, B.BERRY_BUSH, 0, { noUpdate: true });
        } else if (id === B.DIRT) {
          const above = this.getBlock(x, y + 1, z);
          if (OPAQUE[above] || RENDER[above] === RT_LIQUID || this.getSky(x, y + 1, z) < 9) continue;
          let near = false;
          for (let oy = -1; oy <= 1 && !near; oy++) for (let oz = -1; oz <= 1 && !near; oz++) for (let ox = -1; ox <= 1; ox++) if (this.getBlock(x + ox, y + oy, z + oz) === B.GRASS) { near = true; break; }
          if (near) this.setBlock(x, y, z, B.GRASS, 0, { noUpdate: true });
        }
      }
    }
  }

  isHydrated(x, y, z) {
    for (let dy = 0; dy <= 1; dy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++)
      if (this.getBlock(x + dx, y + dy, z + dz) === B.WATER) return true;
    return false;
  }

  tickFarmland(x, y, z) {
    const m = this.getMeta(x, y, z);
    if (this.isHydrated(x, y, z)) { if (m !== 7) this.setBlock(x, y, z, B.FARMLAND, 7, { noUpdate: true }); return; }
    if (m > 0) { this.setBlock(x, y, z, B.FARMLAND, m - 1, { noUpdate: true }); return; }
    const above = this.getBlock(x, y + 1, z);
    if (!(BLOCKS[above] && BLOCKS[above].crop) && Math.random() < 0.15) this.setBlock(x, y, z, B.DIRT);
  }

  tickCrop(x, y, z, id) {
    const below = this.getBlock(x, y - 1, z);
    if (below !== B.FARMLAND) return; // wild crops don't grow
    if (Math.max(this.getSky(x, y, z), this.getBlockLight(x, y, z)) < 9) return;
    const wet = this.getMeta(x, y - 1, z) > 0;
    const m = this.getMeta(x, y, z);
    if (m < 7) { if (Math.random() < (wet ? 0.6 : 0.3)) this.setBlock(x, y, z, id, m + 1, { noUpdate: true }); return; }
    const fruit = BLOCKS[id].fruit;
    if (fruit && Math.random() < 0.4) this.growFruit(x, y, z, fruit);
  }

  growFruit(x, y, z, fruit) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.getBlock(x + dx, y, z + dz) === fruit) return false;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const [dx, dz] = dirs[Math.floor(Math.random() * 4)];
    const b = this.getBlock(x + dx, y, z + dz), g = this.getBlock(x + dx, y - 1, z + dz);
    if ((b === B.AIR || BLOCKS[b].replaceable) && (g === B.DIRT || g === B.GRASS || g === B.FARMLAND)) { this.setBlock(x + dx, y, z + dz, fruit); return true; }
    return false;
  }

  // Bone meal: returns true if it did something
  applyBoneMeal(x, y, z) {
    const id = this.getBlock(x, y, z), def = BLOCKS[id];
    if (def && def.crop) {
      const m = this.getMeta(x, y, z);
      if (m >= 7) return def.fruit ? this.growFruit(x, y, z, def.fruit) : false;
      this.setBlock(x, y, z, id, Math.min(7, m + 2 + Math.floor(Math.random() * 3)));
      return true;
    }
    if (id === B.SAPLING_OAK || id === B.SAPLING_BIRCH || id === B.SAPLING_SPRUCE) { if (Math.random() < 0.45) this.growTree(x, y, z, id); return true; }
    if (id === B.BERRY_BUSH_EMPTY) { this.setBlock(x, y, z, B.BERRY_BUSH); return true; }
    if (id === B.SUGAR_CANE) {
      let top = y; while (this.getBlock(x, top + 1, z) === B.SUGAR_CANE) top++;
      if (this.getBlock(x, top + 1, z) === B.AIR && top - y < 3) { this.setBlock(x, top + 1, z, B.SUGAR_CANE); return true; }
      return false;
    }
    if (id === B.GRASS) {
      // sprout grass and flowers around
      const flowers = [B.DANDELION, B.ROSE, B.AZURE_BLUET, B.OXEYE_DAISY, B.CORNFLOWER];
      for (let k = 0; k < 24; k++) {
        const gx = x + Math.floor(Math.random() * 7) - 3, gz = z + Math.floor(Math.random() * 7) - 3;
        if (this.getBlock(gx, y, gz) !== B.GRASS || this.getBlock(gx, y + 1, gz) !== B.AIR) continue;
        const r = Math.random();
        this.setBlock(gx, y + 1, gz, r < 0.12 ? flowers[Math.floor(Math.random() * flowers.length)] : B.TALLGRASS, 0, { noUpdate: true });
      }
      return true;
    }
    return false;
  }

  growTree(x, y, z, sapling) {
    const type = sapling === B.SAPLING_BIRCH ? 2 : sapling === B.SAPLING_SPRUCE ? 3 : (Math.random() < 0.1 ? 4 : 1);
    const need = type === 3 ? 8 : 6;
    for (let k = 1; k <= need; k++) { const b = this.getBlock(x, y + k, z); if (b !== B.AIR && !(BLOCKS[b].replaceable) && RENDER[b] !== RT_CROSS) return false; }
    this.setBlock(x, y, z, B.AIR, 0, { noUpdate: true });
    TerrainGenerator.treeShape((tx, ty, tz, id, onlyAir) => {
      const wx = x + tx, wz = z + tz;
      if (ty < 1 || ty >= WORLD_H) return;
      const cur = this.getBlock(wx, ty, wz);
      if (onlyAir && cur !== B.AIR && !BLOCKS[cur].replaceable && RENDER[cur] !== RT_CROSS) return;
      if (!onlyAir && cur !== B.AIR && OPAQUE[cur] && cur !== B.GRASS && cur !== B.DIRT) return;
      this.setBlock(wx, ty, wz, id, 0, { noUpdate: true });
    }, 0, y, 0, type, Math.random());
    return true;
  }

  plantSupported(id, x, y, z) {
    const below = this.getBlock(x, y - 1, z);
    if (DOUBLE_UPPER[id]) return below === DOUBLE_UPPER[id];
    if (DOUBLE_LOWER[id] && this.getBlock(x, y + 1, z) !== DOUBLE_LOWER[id]) return false;
    switch (id) {
      case B.DEAD_BUSH: return below === B.SAND || below === B.DIRT || below === B.GRASS;
      case B.WHEAT: case B.CARROTS: case B.POTATOES: case B.BEETROOTS: case B.PUMPKIN_STEM: case B.MELON_STEM:
        return below === B.FARMLAND || below === B.GRASS || below === B.DIRT;  // wild crops grow on grass
      case B.LILY_PAD: return below === B.WATER;
      case B.BROWN_MUSHROOM: case B.RED_MUSHROOM: return !!(OPAQUE[below] && SOLID[below]);
      case B.SUGAR_CANE: {
        if (below === B.SUGAR_CANE) return true;
        if (!(below === B.GRASS || below === B.DIRT || below === B.SAND)) return false;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.getBlock(x + dx, y - 1, z + dz) === B.WATER) return true;
        return false;
      }
      default: return below === B.GRASS || below === B.DIRT || below === B.SNOW_GRASS;
    }
  }

  breakBlockNaturally(x, y, z) {
    const id = this.getBlock(x, y, z), meta = this.getMeta(x, y, z);
    this.setBlock(x, y, z, B.AIR);
    for (const l of this.listeners) l.onNaturalBreak && l.onNaturalBreak(x, y, z, id, meta);
  }

  canFlowInto(id) { return id === B.AIR || (BLOCKS[id] && BLOCKS[id].replaceable && id !== B.WATER && id !== B.LAVA); }

  updateWater(x, y, z) {
    let level = this.getMeta(x, y, z);
    if (level !== 0) {
      let nl;
      const fromAbove = this.getBlock(x, y + 1, z) === B.WATER;
      if (fromAbove) nl = 8;
      else {
        let best = 99, sources = 0;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dz] of dirs) {
          if (this.getBlock(x + dx, y, z + dz) !== B.WATER) continue;
          const m = this.getMeta(x + dx, y, z + dz);
          if (m === 0) sources++;
          const eff = m === 8 ? 0 : m;
          if (eff < best) best = eff;
        }
        nl = best + 1;
        const below = this.getBlock(x, y - 1, z);
        if (sources >= 2 && (SOLID[below] || (below === B.WATER && this.getMeta(x, y - 1, z) === 0))) nl = 0;
      }
      if (!fromAbove && nl > 7) { this.setBlock(x, y, z, B.AIR); return; }
      if (nl !== level) { this.setBlock(x, y, z, B.WATER, nl); level = nl; return; }
    }
    // spread
    const below = this.getBlock(x, y - 1, z);
    if (below === B.LAVA) { this.setBlock(x, y - 1, z, B.OBSIDIAN); return; }
    if (this.canFlowInto(below) && y > 0) { this.dropPlantIfAny(x, y - 1, z); this.setBlock(x, y - 1, z, B.WATER, 8); return; }
    const eff = level === 8 ? 0 : level;
    if (eff >= 7) return;
    if (below === B.WATER && this.getMeta(x, y - 1, z) !== 0) return;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nb = this.getBlock(x + dx, y, z + dz);
      if (nb === B.LAVA) { this.setBlock(x + dx, y, z + dz, B.OBSIDIAN); continue; }
      if (this.canFlowInto(nb)) { this.dropPlantIfAny(x + dx, y, z + dz); this.setBlock(x + dx, y, z + dz, B.WATER, eff + 1); }
      else if (nb === B.WATER) {
        const m = this.getMeta(x + dx, y, z + dz);
        if (m !== 0 && m !== 8 && m > eff + 1) this.setBlock(x + dx, y, z + dz, B.WATER, eff + 1);
      }
    }
  }

  dropPlantIfAny(x, y, z) {
    const id = this.getBlock(x, y, z);
    if (id !== B.AIR) for (const l of this.listeners) l.onNaturalBreak && l.onNaturalBreak(x, y, z, id);
  }

  // --- Tile entities -----------------------------------------------------------
  getTile(x, y, z, create) {
    const k = blockKey(x, y, z);
    let t = this.tiles.get(k);
    if (!t && create) {
      if (create === 'chest') t = { type: 'chest', items: new Array(27).fill(null) };
      else if (create === 'furnace') t = { type: 'furnace', items: [null, null, null], burn: 0, burnMax: 0, cook: 0 };
      this.tiles.set(k, t);
    }
    return t;
  }

  updateFurnaces(dt) {
    for (const [k, t] of this.tiles) {
      if (t.type !== 'furnace') continue;
      const [sx, sy, sz] = k.split(',').map(Number);
      if (!this.isLoaded(sx, sz)) continue;
      const input = t.items[0], fuel = t.items[1], out = t.items[2];
      const result = input ? SMELTING[input.id] : null;
      const canCook = result && (!out || (out.id === result && out.count < maxStack(result)));
      const wasBurning = t.burn > 0;
      if (t.burn > 0) t.burn -= dt;
      if (t.burn <= 0 && canCook && fuel && FUEL[fuel.id]) {
        t.burn = t.burnMax = FUEL[fuel.id];
        if (fuel.id === I.WATER_BUCKET) { /* not fuel */ }
        if (fuel.id === I.LAVA_BUCKET) t.items[1] = { id: I.BUCKET, count: 1 };
        else { fuel.count--; if (fuel.count <= 0) t.items[1] = null; }
      }
      if (t.burn > 0 && canCook) {
        t.cook += dt;
        if (t.cook >= 10) {
          t.cook = 0;
          input.count--; if (input.count <= 0) t.items[0] = null;
          if (out) out.count++; else t.items[2] = { id: result, count: 1 };
        }
      } else if (t.cook > 0) t.cook = Math.max(0, t.cook - dt * 2);
      if (t.burn < 0) t.burn = 0;
      const burning = t.burn > 0;
      if (burning !== wasBurning) {
        const cur = this.getBlock(sx, sy, sz);
        const m = this.getMeta(sx, sy, sz);
        if (cur === B.FURNACE || cur === B.FURNACE_LIT) this.setBlock(sx, sy, sz, burning ? B.FURNACE_LIT : B.FURNACE, m, { noUpdate: true, keepTile: true });
      }
    }
  }

  // --- Persistence --------------------------------------------------------------
  serialize() {
    for (const c of this.chunks.values()) if (c.modified) this.saveChunk(c);
    const chunks = {};
    for (const [k, v] of this.saved) chunks[k] = v;
    const tiles = {};
    for (const [k, v] of this.tiles) tiles[k] = v;
    return { chunks, tiles };
  }
}
