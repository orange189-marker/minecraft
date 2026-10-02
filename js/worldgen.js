'use strict';
// ---------------------------------------------------------------------------
// Terrain generator: biomes, height map, caves, ores, trees and plants.
// All functions are deterministic from the world seed.
// ---------------------------------------------------------------------------

const BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, BIRCH_FOREST: 4, DESERT: 5, TAIGA: 6, SNOWY: 7, MOUNTAINS: 8, FROZEN_OCEAN: 9 };
const BIOME_NAMES = ['Ocean', 'Beach', 'Plains', 'Forest', 'Birch Forest', 'Desert', 'Taiga', 'Snowy Tundra', 'Mountains', 'Frozen Ocean'];

class TerrainGenerator {
  constructor(seed) {
    this.seed = seed | 0;
    const s = this.seed;
    this.nCont = new SimplexNoise(s + 1);
    this.nDetail = new SimplexNoise(s + 2);
    this.nMount = new SimplexNoise(s + 3);
    this.nRidge = new SimplexNoise(s + 4);
    this.nTemp = new SimplexNoise(s + 5);
    this.nHumid = new SimplexNoise(s + 6);
    this.nCave1 = new SimplexNoise(s + 7);
    this.nCave2 = new SimplexNoise(s + 8);
    this.nCave3 = new SimplexNoise(s + 9);
    this.nSurf = new SimplexNoise(s + 10);
    this.nFlower = new SimplexNoise(s + 11);
    this.colCache = new Map();
  }

  // Returns {h, biome} for world column
  column(x, z) {
    const key = x * 73856093 ^ z * 19349663;
    const cached = this.colCache.get(key);
    if (cached && cached.x === x && cached.z === z) return cached;
    const c = this.nCont.fbm2(x / 820, z / 820, 4) * 1.35 + 0.12;
    const hill = this.nDetail.fbm2(x / 110, z / 110, 4);
    const fine = this.nDetail.noise2D(x / 26 + 100, z / 26 - 100);
    const mm = smoothstep(0.1, 0.55, this.nMount.fbm2(x / 520, z / 520, 3));
    const rr = 1 - Math.abs(this.nRidge.fbm2(x / 190, z / 190, 4));
    const ridge = rr * rr;
    const temp = this.nTemp.fbm2(x / 1000, z / 1000, 3) * 1.5;
    const humid = this.nHumid.fbm2(x / 760, z / 760, 3) * 1.5;

    let h;
    if (c < 0) {
      h = SEA_LEVEL + c * 34 + hill * 3;
    } else {
      const land = smoothstep(0, 0.12, c);
      h = SEA_LEVEL + 1 + c * 16 + hill * (4 + 10 * land) + fine * 1.5;
      h += mm * ridge * 62 * land;
    }
    if (temp > 0.35 && humid < 0.05 && c > 0) h = lerp(h, SEA_LEVEL + 3 + c * 10 + hill * 3, 0.6); // flatter deserts
    h = Math.floor(clamp(h, 6, WORLD_H - 12));

    let biome;
    if (h < SEA_LEVEL - 1) biome = temp < -0.45 ? BIOME.FROZEN_OCEAN : BIOME.OCEAN;
    else if (h <= SEA_LEVEL + 1 && c < 0.06 && temp > -0.4) biome = BIOME.BEACH;
    else if (mm * ridge > 0.42 && h > 88) biome = BIOME.MOUNTAINS;
    else if (temp > 0.35 && humid < 0.05) biome = BIOME.DESERT;
    else if (temp < -0.45) biome = BIOME.SNOWY;
    else if (temp < -0.15) biome = BIOME.TAIGA;
    else if (humid > 0.2) biome = temp > 0.15 ? BIOME.BIRCH_FOREST : BIOME.FOREST;
    else biome = humid > -0.05 && hill > 0.15 ? BIOME.FOREST : BIOME.PLAINS;

    const res = { x, z, h, biome, temp, humid };
    if (this.colCache.size > 20000) this.colCache.clear();
    this.colCache.set(key, res);
    return res;
  }

  treeAt(x, z, col) {
    let density;
    switch (col.biome) {
      case BIOME.FOREST: density = 0.045; break;
      case BIOME.BIRCH_FOREST: density = 0.04; break;
      case BIOME.TAIGA: density = 0.035; break;
      case BIOME.SNOWY: density = 0.004; break;
      case BIOME.PLAINS: density = 0.003; break;
      case BIOME.MOUNTAINS: density = 0.006; break;
      default: return 0;
    }
    if (col.h <= SEA_LEVEL || col.h > 105) return 0;
    const r = hash2(x, z, this.seed + 77);
    if (r >= density) return 0;
    switch (col.biome) {
      case BIOME.BIRCH_FOREST: return r < density * 0.7 ? 2 : 1;
      case BIOME.FOREST: return r < density * 0.2 ? 2 : (r < density * 0.28 ? 4 : 1);
      case BIOME.TAIGA: case BIOME.SNOWY: return 3;
      case BIOME.MOUNTAINS: return col.h > 95 ? 3 : 1;
      default: return 1;
    }
  }

  generate(chunk) {
    const cx = chunk.cx, cz = chunk.cz, x0 = cx * CHUNK, z0 = cz * CHUNK;
    const blocks = chunk.blocks;
    const seed = this.seed;
    const cols = new Array(256);
    let maxH = 0;
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const col = this.column(x0 + lx, z0 + lz);
      cols[lz * 16 + lx] = col;
      if (col.h > maxH) maxH = col.h;
    }

    // --- Cave noise lattice (stride 4) for trilinear interpolation ---
    const LY = Math.ceil((maxH + 2) / 4) + 1;
    const lat = new Float32Array(5 * 5 * LY);
    const cav = new Float32Array(5 * 5 * LY);
    for (let iy = 0; iy < LY; iy++) for (let iz = 0; iz < 5; iz++) for (let ix = 0; ix < 5; ix++) {
      const wx = x0 + ix * 4, wy = iy * 4, wz = z0 + iz * 4;
      const a = this.nCave1.noise3D(wx / 52, wy / 30, wz / 52);
      const b = this.nCave2.noise3D(wx / 52, wy / 30, wz / 52);
      lat[(iy * 5 + iz) * 5 + ix] = a * a + b * b;
      cav[(iy * 5 + iz) * 5 + ix] = this.nCave3.noise3D(wx / 90, wy / 46, wz / 90);
    }
    const sample = (arr, lx, y, lz) => {
      const fx = lx / 4, fy = y / 4, fz = lz / 4;
      const ix = Math.min(3, fx | 0), iy = Math.min(LY - 2, fy | 0), iz = Math.min(3, fz | 0);
      const tx = fx - ix, ty = fy - iy, tz = fz - iz;
      const i000 = (iy * 5 + iz) * 5 + ix;
      const c00 = lerp(arr[i000], arr[i000 + 1], tx);
      const c10 = lerp(arr[i000 + 5], arr[i000 + 6], tx);
      const c01 = lerp(arr[i000 + 25], arr[i000 + 26], tx);
      const c11 = lerp(arr[i000 + 30], arr[i000 + 31], tx);
      return lerp(lerp(c00, c10, tz), lerp(c01, c11, tz), ty);
    };

    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const col = cols[lz * 16 + lx];
      const h = col.h, biome = col.biome;
      const wx = x0 + lx, wz = z0 + lz;
      const sn = this.nSurf.noise2D(wx / 12, wz / 12);
      let top, filler, fillerDepth = 3 + ((sn + 1) * 1.5 | 0), deep = B.STONE;
      switch (biome) {
        case BIOME.DESERT: top = B.SAND; filler = B.SAND; deep = B.SANDSTONE; break;
        case BIOME.BEACH: top = B.SAND; filler = B.SAND; deep = B.SANDSTONE; break;
        case BIOME.OCEAN: case BIOME.FROZEN_OCEAN:
          top = sn > 0.35 ? B.CLAY : (sn < -0.3 ? B.GRAVEL : B.SAND); filler = top === B.CLAY ? B.CLAY : B.SAND; fillerDepth = 2; break;
        case BIOME.SNOWY: top = B.SNOW_GRASS; filler = B.DIRT; break;
        case BIOME.TAIGA: top = h > SEA_LEVEL + 12 ? B.SNOW_GRASS : B.GRASS; filler = B.DIRT; break;
        case BIOME.MOUNTAINS:
          if (h > 100 + sn * 4) { top = B.SNOW; filler = B.STONE; } else if (h > 92 || sn > 0.3) { top = B.STONE; filler = B.STONE; } else { top = B.GRASS; filler = B.DIRT; }
          break;
        default: top = B.GRASS; filler = B.DIRT;
      }
      if (h < SEA_LEVEL && (top === B.GRASS || top === B.SNOW_GRASS)) top = B.DIRT;
      const isOcean = biome === BIOME.OCEAN || biome === BIOME.FROZEN_OCEAN;

      for (let y = 0; y < WORLD_H; y++) {
        const idx = (y * 16 + lz) * 16 + lx;
        let id = B.AIR;
        if (y === 0) id = B.BEDROCK;
        else if (y < 4 && hash3(wx, y, wz, seed) < 0.6 - y * 0.15) id = B.BEDROCK;
        else if (y < h - fillerDepth) id = deep;
        else if (y < h) id = filler;
        else if (y === h) id = top;
        else if (y <= SEA_LEVEL) id = (y === SEA_LEVEL && (biome === BIOME.FROZEN_OCEAN || biome === BIOME.SNOWY)) ? B.ICE : B.WATER;

        // carve caves
        if (id !== B.AIR && id !== B.BEDROCK && id !== B.WATER && id !== B.ICE && y > 0) {
          const nearSurf = y > h - 5;
          if (!(isOcean && y > h - 8) && !(nearSurf && h <= SEA_LEVEL + 1)) {
            const spag = sample(lat, lx, y, lz);
            const thr = 0.011 + (y < 40 ? 0.006 : 0);
            let carve = spag < thr;
            if (!carve && y < 50 && !nearSurf) carve = sample(cav, lx, y, lz) > 0.62 - (50 - y) * 0.004;
            if (carve) id = y <= 10 ? B.LAVA : B.AIR;
          }
        }
        blocks[idx] = id;
      }
    }

    // --- Ores ---
    const rng = mulberry32(seed ^ Math.imul(cx, 341873128) ^ Math.imul(cz, 132897987));
    const vein = (ore, count, size, minY, maxY) => {
      for (let i = 0; i < count; i++) {
        let x = rng() * 16, y = minY + rng() * (maxY - minY), z = rng() * 16;
        for (let k = 0; k < size; k++) {
          const ix = x | 0, iy = y | 0, iz = z | 0;
          if (ix >= 0 && ix < 16 && iz >= 0 && iz < 16 && iy > 0 && iy < WORLD_H) {
            const idx = (iy * 16 + iz) * 16 + ix;
            if (blocks[idx] === B.STONE) blocks[idx] = ore;
          }
          x += rng() * 2 - 1; y += rng() * 2 - 1; z += rng() * 2 - 1;
        }
      }
    };
    vein(B.COAL_ORE, 18, 10, 5, 110);
    vein(B.IRON_ORE, 12, 7, 5, 64);
    vein(B.GOLD_ORE, 3, 6, 5, 32);
    vein(B.DIAMOND_ORE, 2, 5, 5, 16);
    vein(B.GRAVEL, 6, 18, 5, 90);
    vein(B.DIRT, 6, 18, 20, 100);

    // --- Surface decorations (plants) ---
    const at = (lx, y, lz) => (y * 16 + lz) * 16 + lx;
    const isAir = (lx, y, lz) => y < WORLD_H && blocks[at(lx, y, lz)] === B.AIR;
    const nearWater = (lx, y, lz) => {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = lx + dx, nz = lz + dz;
        if (nx < 0 || nx > 15 || nz < 0 || nz > 15) continue;
        if (blocks[at(nx, y, nz)] === B.WATER) return true;
      }
      return false;
    };
    const placeDouble = (lx, y, lz, lower) => {
      if (!isAir(lx, y, lz) || !isAir(lx, y + 1, lz)) return;
      blocks[at(lx, y, lz)] = lower; blocks[at(lx, y + 1, lz)] = DOUBLE_LOWER[lower];
    };
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const col = cols[lz * 16 + lx];
      const y = col.h + 1;
      if (y >= WORLD_H - 3) continue;
      const ground = blocks[at(lx, y - 1, lz)];
      if (blocks[at(lx, y, lz)] !== B.AIR) {
        // lily pads on calm shallow water
        if (blocks[at(lx, y, lz)] === B.WATER && col.h >= SEA_LEVEL - 4 && blocks[at(lx, SEA_LEVEL + 1, lz)] === B.AIR && blocks[at(lx, SEA_LEVEL, lz)] === B.WATER &&
          (col.biome === BIOME.OCEAN && col.humid > 0.25) && hash2(x0 + lx, z0 + lz, seed + 41) < 0.08) blocks[at(lx, SEA_LEVEL + 1, lz)] = B.LILY_PAD;
        continue;
      }
      const wx = x0 + lx, wz = z0 + lz;
      const r = hash2(wx, wz, seed + 31);
      const r2 = hash2(wx, wz, seed + 32);
      const patch = this.nFlower.noise2D(wx / 48, wz / 48);   // which flower grows here (clusters)
      const meadow = this.nFlower.noise2D(wx / 90 + 300, wz / 90 - 300); // flower field density
      if (ground === B.GRASS || ground === B.DIRT) {
        // sugar cane along water
        if (nearWater(lx, y - 1, lz) && r < 0.12) {
          const hgt = 1 + Math.floor(r2 * 3);
          for (let k = 0; k < hgt && isAir(lx, y + k, lz); k++) blocks[at(lx, y + k, lz)] = B.SUGAR_CANE;
          continue;
        }
        if (ground === B.DIRT) continue;
        let flowers, flowerRate, grassRate, tallRate = 0.02;
        switch (col.biome) {
          case BIOME.PLAINS:
            flowers = patch < -0.45 ? [B.SUNFLOWER] : patch < -0.15 ? [B.TULIP_RED, B.TULIP_ORANGE, B.TULIP_WHITE, B.TULIP_PINK] : patch < 0.2 ? [B.DANDELION, B.ROSE, B.OXEYE_DAISY] : patch < 0.5 ? [B.AZURE_BLUET, B.CORNFLOWER, B.OXEYE_DAISY] : [B.ROSE, B.CORNFLOWER, B.DANDELION];
            flowerRate = meadow > 0.35 ? 0.22 : 0.018; grassRate = 0.28; tallRate = 0.05; break;
          case BIOME.FOREST:
            flowers = patch < -0.3 ? [B.LILAC, B.ROSE_BUSH, B.PEONY] : patch < 0.2 ? [B.DANDELION, B.ROSE, B.LILY_OF_THE_VALLEY] : [B.ALLIUM, B.TULIP_PINK, B.LILY_OF_THE_VALLEY, B.CORNFLOWER];
            flowerRate = meadow > 0.3 ? 0.16 : 0.015; grassRate = 0.14; break;
          case BIOME.BIRCH_FOREST:
            flowers = patch < 0 ? [B.LILAC, B.PEONY, B.ALLIUM] : [B.ALLIUM, B.AZURE_BLUET, B.OXEYE_DAISY, B.LILY_OF_THE_VALLEY];
            flowerRate = meadow > 0.3 ? 0.14 : 0.02; grassRate = 0.14; break;
          case BIOME.TAIGA:
            flowers = [B.CORNFLOWER, B.DANDELION]; flowerRate = 0.006; grassRate = 0.1; break;
          case BIOME.MOUNTAINS:
            flowers = [B.CORNFLOWER, B.AZURE_BLUET, B.ALLIUM]; flowerRate = 0.03; grassRate = 0.12; break;
          default:
            flowers = [B.DANDELION, B.ROSE]; flowerRate = 0.01; grassRate = 0.1;
        }
        if (col.humid > 0.45 && nearWater(lx, y - 1, lz) && r < 0.3) { blocks[at(lx, y, lz)] = B.BLUE_ORCHID; continue; }
        if (r < flowerRate) {
          const f = flowers[Math.floor(r2 * flowers.length)];
          if (DOUBLE_LOWER[f]) placeDouble(lx, y, lz, f); else blocks[at(lx, y, lz)] = f;
        } else if (r < flowerRate + grassRate) {
          const taiga = col.biome === BIOME.TAIGA;
          if (r2 < tallRate * 4) placeDouble(lx, y, lz, taiga ? B.LARGE_FERN : B.TALL_GRASS);
          else blocks[at(lx, y, lz)] = taiga && r2 < 0.5 ? B.FERN : B.TALLGRASS;
        } else if (r < flowerRate + grassRate + 0.012) {
          if (col.biome === BIOME.TAIGA) blocks[at(lx, y, lz)] = B.BERRY_BUSH;
          else if (col.biome === BIOME.FOREST || col.biome === BIOME.BIRCH_FOREST) blocks[at(lx, y, lz)] = r2 < 0.25 ? (r2 < 0.12 ? B.BROWN_MUSHROOM : B.RED_MUSHROOM) : B.BUSH;
          else if (col.biome === BIOME.PLAINS && r2 < 0.08) blocks[at(lx, y, lz)] = B.PUMPKIN;
          else blocks[at(lx, y, lz)] = B.BUSH;
        }
      } else if (ground === B.SAND) {
        if (nearWater(lx, y - 1, lz) && r < 0.1 && col.biome !== BIOME.OCEAN) {
          const hgt = 1 + Math.floor(r2 * 3);
          for (let k = 0; k < hgt && isAir(lx, y + k, lz); k++) blocks[at(lx, y + k, lz)] = B.SUGAR_CANE;
        } else if (col.biome === BIOME.DESERT) {
          if (r < 0.006) {
            const hgt = 1 + Math.floor(r2 * 3);
            for (let k = 0; k < hgt && y + k < WORLD_H; k++) blocks[at(lx, y + k, lz)] = B.CACTUS;
          } else if (r < 0.014) blocks[at(lx, y, lz)] = B.DEAD_BUSH;
        }
      }
    }
    // mushrooms on dark cave floors
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const top = cols[lz * 16 + lx].h - 6;
      for (let y = 12; y < top; y++) {
        if (blocks[at(lx, y, lz)] !== B.AIR || blocks[at(lx, y - 1, lz)] !== B.STONE) continue;
        const r = hash3(x0 + lx, y, z0 + lz, seed + 51);
        if (r < 0.006) blocks[at(lx, y, lz)] = r < 0.003 ? B.BROWN_MUSHROOM : B.RED_MUSHROOM;
      }
    }

    // --- Trees (including those rooted in neighbouring chunks) ---
    for (let wz = z0 - 3; wz < z0 + 19; wz++) for (let wx = x0 - 3; wx < x0 + 19; wx++) {
      const col = (wx >= x0 && wx < x0 + 16 && wz >= z0 && wz < z0 + 16) ? cols[(wz - z0) * 16 + (wx - x0)] : this.column(wx, wz);
      const type = this.treeAt(wx, wz, col);
      if (!type) continue;
      if (col.biome === BIOME.DESERT || col.biome === BIOME.BEACH) continue;
      // ground must be soil (check only if inside chunk; outside assume from biome)
      if (wx >= x0 && wx < x0 + 16 && wz >= z0 && wz < z0 + 16) {
        const g = blocks[(col.h * 16 + (wz - z0)) * 16 + (wx - x0)];
        if (g !== B.GRASS && g !== B.DIRT && g !== B.SNOW_GRASS) continue;
      }
      this.placeTree(chunk, wx - x0, col.h + 1, wz - z0, type, hash2(wx, wz, seed + 99));
    }
  }

  placeTree(chunk, lx, y, lz, type, r) {
    const blocks = chunk.blocks;
    const set = (x, yy, z, id, onlyAir) => {
      if (x < 0 || x > 15 || z < 0 || z > 15 || yy < 1 || yy >= WORLD_H) return;
      const idx = (yy * 16 + z) * 16 + x;
      const cur = blocks[idx];
      if (onlyAir && cur !== B.AIR && cur !== B.TALLGRASS && cur !== B.FERN && cur !== B.SNOW) return;
      blocks[idx] = id;
    };
    TerrainGenerator.treeShape(set, lx, y, lz, type, r);
  }

  // Writes a tree through the given setter(x, y, z, id, onlyAir)
  static treeShape(set, lx, y, lz, type, r) {
    if (type === 1 || type === 2 || type === 4) {
      const log = type === 2 ? B.BIRCH_LOG : B.OAK_LOG, leaves = type === 2 ? B.BIRCH_LEAVES : B.OAK_LEAVES;
      const hgt = (type === 2 ? 5 : 4) + Math.floor(r * 3) + (type === 4 ? 3 : 0);
      const top = y + hgt;
      for (let yy = top - 3; yy <= top; yy++) {
        const rad = yy >= top - 1 ? 1 : 2;
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && (yy === top || hash3(lx + dx, yy, lz + dz, 5) < 0.5)) continue;
          set(lx + dx, yy, lz + dz, leaves, true);
        }
      }
      if (type === 4) { // big oak: extra canopy layer
        for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dz * dz <= 9) set(lx + dx, top - 2, lz + dz, leaves, true);
      }
      for (let yy = y; yy < top; yy++) set(lx, yy, lz, log, false);
      set(lx, y - 1, lz, B.DIRT, false);
    } else if (type === 3) {
      const hgt = 6 + Math.floor(r * 4);
      const top = y + hgt;
      let rad = 0;
      for (let yy = top; yy >= y + 2; yy--) {
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > rad + (rad > 1 ? 1 : 0)) continue;
          set(lx + dx, yy, lz + dz, B.SPRUCE_LEAVES, true);
        }
        rad = rad >= 2 + (yy < top - 4 ? 1 : 0) ? 1 : rad + 1;
      }
      set(lx, top + 1, lz, B.SPRUCE_LEAVES, true);
      for (let yy = y; yy < top; yy++) set(lx, yy, lz, B.SPRUCE_LOG, false);
    }
  }

  findSpawn() {
    for (let r = 0; r < 2000; r += 8) {
      for (let a = 0; a < 16; a++) {
        const x = Math.round(Math.cos(a / 16 * Math.PI * 2) * r), z = Math.round(Math.sin(a / 16 * Math.PI * 2) * r);
        const col = this.column(x, z);
        if (col.h > SEA_LEVEL + 1 && col.h < 90 && col.biome !== BIOME.OCEAN && col.biome !== BIOME.BEACH) return { x: x + 0.5, z: z + 0.5, y: col.h + 1 };
      }
    }
    return { x: 0.5, z: 0.5, y: 90 };
  }
}
