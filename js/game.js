'use strict';
// ---------------------------------------------------------------------------
// Game: main loop, chunk streaming, input, interaction, mobs, day/night
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = { renderDist: 8, fov: 70, sensitivity: 100, brightness: 50, music: 40, sound: 70, bobbing: true, clouds: true, invertY: false, showFps: false };
const DAY_TICKS = 24000;

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.settings = Object.assign({}, DEFAULT_SETTINGS);
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('blockhaven_settings')) || {}); } catch (e) { /* ignore */ }
    buildAtlas();
    initBlockTables();
    this.renderer = new Renderer(canvas);
    this.renderer.uploadAtlas();
    this.audio = new AudioEngine();
    this.player = new Player();
    this.ui = new UI(this);
    this.particles = new ParticleSystem();
    this.entities = [];
    this.dyn = new DynamicMesh(65536);
    this.dynTrans = new DynamicMesh(16384);
    this.hand = new DynamicMesh(1024);
    this.keys = {};
    this.mouse = [false, false, false];
    this.input = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };
    this.state = 'menu';
    this.time = 1000;
    this.realTime = 0;
    this.thirdPerson = 0;
    this.hideHud = false;
    this.debug = false;
    this.breaking = null;
    this.useCooldown = 0; this.attackCooldown = 0; this.eatTimer = 0;
    this.tickAcc = 0; this.spawnTimer = 0; this.saveTimer = 0;
    this.fps = 0; this.frames = 0; this.fpsTimer = 0;
    this.lastW = 0; this.lastSpace = 0;
    this.offsets = [];
    this.applySettings();
    this.player.inventory.onChange = () => { this.invDirty = true; };
    this.initInput();
    this.world = null;
    this.startMenuWorld();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  applySettings() {
    const s = this.settings;
    this.audio.setVolumes(s.sound / 100, s.music / 100);
    this.computeOffsets(s.renderDist);
  }
  saveSettings() { try { localStorage.setItem('blockhaven_settings', JSON.stringify(this.settings)); } catch (e) { /* ignore */ } }

  computeOffsets(R) {
    const list = [];
    const M = R + 2;
    for (let dz = -M; dz <= M; dz++) for (let dx = -M; dx <= M; dx++) {
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d <= R + 1.5) list.push([dx, dz, d]);
    }
    list.sort((a, b) => a[2] - b[2]);
    this.offsets = list;
  }

  // ---- World lifecycle ------------------------------------------------------------
  setWorld(world) {
    if (this.world) for (const c of this.world.chunks.values()) this.renderer.deleteChunkMesh(c);
    this.world = world;
    this.entities = [];
    this.particles.list = [];
    world.listeners.push({
      onNaturalBreak: (x, y, z, id) => {
        const d = blockDrop(id, 0);
        if (d && this.state === 'playing') this.spawnDrop(d, 1, x + 0.5, y + 0.3, z + 0.5);
        this.particles.blockBreak(x, y, z, id);
      },
      onTileRemoved: (x, y, z, te) => {
        if (te && te.items) for (const s of te.items) if (s) this.spawnDrop(s.id, s.count, x + 0.5, y + 0.5, z + 0.5, s.dmg ? { dmg: s.dmg } : null);
        if (this.ui.furnace === te || this.ui.chestItems === (te && te.items)) this.ui.close();
      },
    });
    this.renderer.buildClouds(world.seed);
  }

  startMenuWorld() {
    const seeds = [12345, 777, 2024, 31337, 4242];
    const w = new World(seeds[Math.floor(Math.random() * seeds.length)]);
    this.setWorld(w);
    const sp = w.gen.findSpawn();
    this.menuCam = { x: sp.x, y: sp.y + 18, z: sp.z, yaw: 0, pitch: -0.25 };
    this.state = 'menu';
    document.getElementById('hud').style.display = 'none';
    document.getElementById('clickhint').style.display = 'none';
    this.ui.showMainMenu();
  }

  startWorld(id) {
    this.audio.init();
    const meta = SaveManager.getMeta(id);
    if (!meta) return;
    const data = SaveManager.loadWorld(id);
    this.worldId = id;
    this.ui.root.innerHTML = ''; this.ui.root.className = ''; this.ui.screen = null;
    const world = new World(meta.seed, data ? data.world : null);
    this.setWorld(world);
    this.player = new Player();
    this.player.inventory.onChange = () => { this.invDirty = true; };
    if (data && data.player) {
      this.player.load(data.player);
      this.time = data.time || 1000;
    } else {
      const sp = world.gen.findSpawn();
      this.player.x = sp.x; this.player.y = sp.y + 1; this.player.z = sp.z;
      this.player.spawn = { x: sp.x, y: sp.y + 1, z: sp.z };
      this.player.mode = meta.mode;
      this.player.yaw = Math.PI * 0.25;
      this.time = 1000;
      this.needsSafePlacement = true;
    }
    this.state = 'loading';
    this.loadStart = performance.now();
    this.ui.showLoading('Generating terrain...', 0);
    this.invDirty = true;
  }

  saveGame(silent) {
    if (this.state !== 'playing' || !this.worldId) return;
    const data = { version: 1, time: this.time, player: this.player.serialize(), world: this.world.serialize() };
    const ok = SaveManager.saveWorld(this.worldId, data);
    if (!silent) this.ui.toast(ok ? 'World saved' : 'Save failed: browser storage is full');
  }

  quitToTitle() {
    this.saveGame(true);
    this.ui.close();
    this.unlockPointer();
    this.worldId = null;
    this.startMenuWorld();
  }

  setMode(mode) {
    this.player.mode = mode;
    if (mode === 'survival') this.player.flying = false;
    this.ui.toast('Game mode set to ' + (mode === 'creative' ? 'Creative' : 'Survival'));
    this.invDirty = true;
  }

  // Put the player on real ground (not on top of a tree) near their current column
  placePlayerSafely() {
    const p = this.player, w = this.world;
    const isGround = (b) => SOLID[b] && OPAQUE[b] && !(b === B.OAK_LOG || b === B.BIRCH_LOG || b === B.SPRUCE_LOG);
    const bx = Math.floor(p.x), bz = Math.floor(p.z);
    for (let r = 0; r <= 6; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const x = bx + dx, z = bz + dz;
      let y = WORLD_H - 2;
      while (y > 0) {
        const b = w.getBlock(x, y, z);
        if (isGround(b) || b === B.WATER || b === B.LAVA) break;
        if (b === B.OAK_LOG || b === B.BIRCH_LOG || b === B.SPRUCE_LOG) { y = -1; break; }
        y--;
      }
      if (y <= 0) continue;
      const g = w.getBlock(x, y, z);
      if (g === B.LAVA) continue;
      if (SOLID[w.getBlock(x, y + 1, z)] || SOLID[w.getBlock(x, y + 2, z)]) continue;
      p.x = x + 0.5; p.z = z + 0.5; p.y = y + 1.01;
      p.vx = p.vy = p.vz = 0; p.fallDist = 0;
      return;
    }
    p.vx = p.vy = p.vz = 0; p.fallDist = 0;
  }

  isDay() { const t = this.time % DAY_TICKS; return t < 12500 || t > 23500; }

  // ---- Input -------------------------------------------------------------------------
  initInput() {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.keys = {}; this.mouse = [false, false, false]; });
    this.canvas.addEventListener('mousedown', (e) => {
      this.audio.init();
      if (this.state !== 'playing' || this.ui.isOpen()) return;
      if (!this.pointerLocked()) { this.lockPointer(); return; }
      this.mouse[e.button] = true;
      if (e.button === 0) { this.breakRepeat = 0; this.player.swing = 1; this.onLeftPress(); }
      if (e.button === 2) { this.useCooldown = 0; }
      if (e.button === 1) { e.preventDefault(); this.pickBlock(); }
    });
    window.addEventListener('mouseup', (e) => { this.mouse[e.button] = false; if (e.button === 2) this.eatTimer = 0; });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked() || this.state !== 'playing') return;
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return; // ignore lock-acquire jumps
      const s = this.settings.sensitivity / 100 * 0.0022;
      this.player.yaw -= e.movementX * s;
      this.player.pitch -= e.movementY * s * (this.settings.invertY ? -1 : 1);
      this.player.pitch = clamp(this.player.pitch, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
    });
    window.addEventListener('wheel', (e) => {
      if (this.state !== 'playing' || this.ui.isOpen()) return;
      const inv = this.player.inventory;
      inv.selected = (inv.selected + (e.deltaY > 0 ? 1 : 8)) % 9;
      this.onSlotChange();
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      if (!this.pointerLocked() && this.state === 'playing' && !this.ui.isOpen()) this.ui.showPause();
    });
    window.addEventListener('beforeunload', () => this.saveGame(true));
    window.addEventListener('resize', () => this.renderer.resize());
  }

  pointerLocked() { return document.pointerLockElement === this.canvas; }
  lockPointer() { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } }
  unlockPointer() { if (document.pointerLockElement) document.exitPointerLock(); }

  onSlotChange() {
    const s = this.player.inventory.held();
    if (s) this.ui.showItemName(itemName(s.id));
    this.breaking = null; this.eatTimer = 0;
    this.invDirty = true;
  }

  onKey(e, down) {
    const code = e.code;
    if (['F1', 'F3', 'F5', 'Tab'].includes(code)) e.preventDefault();
    if (this.state !== 'playing') { this.keys[code] = false; return; }
    const ui = this.ui;
    if (down && !e.repeat) {
      if (code === 'Escape') {
        if (ui.isGuiScreen()) { ui.close(); return; }
        if (ui.screen === 'pause') { ui.close(); return; }
        if (ui.screen === 'options' || ui.screen === 'controls') { ui.showPause(); return; }
        if (!ui.isOpen()) { ui.showPause(); return; }
      }
      if (code === 'KeyE') {
        if (ui.isGuiScreen()) { ui.close(); return; }
        if (!ui.isOpen()) { ui.openInventory(); return; }
      }
    }
    if (ui.isOpen()) { this.keys[code] = false; return; }
    this.keys[code] = down;
    if (!down || e.repeat) return;
    const inv = this.player.inventory;
    if (code.startsWith('Digit')) { const n = +code.slice(5); if (n >= 1 && n <= 9) { inv.selected = n - 1; this.onSlotChange(); } }
    if (code === 'KeyQ') { this.dropHeld(e.ctrlKey); }
    if (code === 'F3') this.debug = !this.debug;
    if (code === 'F5') this.thirdPerson = (this.thirdPerson + 1) % 3;
    if (code === 'F1') { this.hideHud = !this.hideHud; document.getElementById('hud').style.display = this.hideHud ? 'none' : ''; }
    if (code === 'Space') {
      const now = performance.now();
      if (this.player.mode === 'creative' && now - this.lastSpace < 300) { this.player.flying = !this.player.flying; this.player.vy = 0; }
      this.lastSpace = now;
    }
    if (code === 'KeyW') {
      const now = performance.now();
      if (now - this.lastW < 280) this.sprintTap = true;
      this.lastW = now;
    }
  }

  updateInput() {
    const k = this.keys, i = this.input;
    i.forward = !!(k.KeyW || k.ArrowUp); i.back = !!(k.KeyS || k.ArrowDown);
    i.left = !!(k.KeyA || k.ArrowLeft); i.right = !!(k.KeyD || k.ArrowRight);
    i.jump = !!k.Space; i.sneak = !!(k.ShiftLeft || k.ShiftRight);
    if (!i.forward) this.sprintTap = false;
    i.sprint = !!(k.ControlLeft || k.ControlRight || this.sprintTap);
  }

  // ---- Interaction -----------------------------------------------------------------------
  reach() { return this.player.mode === 'creative' ? 5.5 : 4.6; }

  findTarget() {
    const p = this.player;
    const [dx, dy, dz] = p.lookDir();
    const ex = p.x, ey = p.eyeY, ez = p.z;
    const hit = raycastBlocks(this.world, ex, ey, ez, dx, dy, dz, this.reach());
    let ent = null, entDist = hit ? hit.dist : this.reach();
    entDist = Math.min(entDist, 3.6);
    for (const e of this.entities) {
      if (!e.isMob || e.deathTime > 0) continue;
      const hw = e.w / 2;
      const d = rayBox(ex, ey, ez, dx, dy, dz, e.x - hw, e.y, e.z - hw, e.x + hw, e.y + e.h, e.z + hw);
      if (d !== null && d < entDist) { entDist = d; ent = e; }
    }
    this.target = ent ? null : hit;
    this.targetEntity = ent;
  }

  onLeftPress() {
    if (this.targetEntity) this.attack(this.targetEntity);
    else if (this.player.mode === 'creative' && this.target) { this.breakBlock(this.target); this.breakRepeat = 0.25; }
  }

  attack(e) {
    if (this.attackCooldown > 0) return;
    const p = this.player;
    const held = p.inventory.held();
    const def = held ? itemDef(held.id) : null;
    let dmg = def && def.damage ? def.damage : 1;
    const crit = p.vy < -0.5 && !p.onGround;
    if (crit) { dmg *= 1.5; for (let i = 0; i < 6; i++) this.particles.flame(e.x, e.y + e.h * Math.random(), e.z); }
    if (e.damage(dmg, this, p.x, p.z, p.sprinting ? 1.4 : 1)) {
      if (def && def.tool && p.mode === 'survival') { if (p.inventory.damageHeld(def.tool === 'sword' ? 1 : 2)) this.audio.play('dig_glass'); }
      p.exhaustion += 0.1;
    }
    this.attackCooldown = 0.25;
    p.swing = 1;
  }

  breakBlock(t) {
    const w = this.world, p = this.player;
    const id = w.getBlock(t.x, t.y, t.z);
    if (id === B.AIR || BLOCKS[id].hardness < 0) return;
    const heldId = p.inventory.heldId();
    if (p.mode === 'creative' && heldId >= 256 && ITEMS[heldId].tool === 'sword') return;
    w.setBlock(t.x, t.y, t.z, B.AIR);
    this.audio.playDig(id, t.x, t.y, t.z);
    this.particles.blockBreak(t.x, t.y, t.z, id);
    if (p.mode === 'survival') {
      const drop = blockDrop(id, heldId);
      if (drop) this.spawnDrop(drop, 1, t.x + 0.5, t.y + 0.3, t.z + 0.5);
      const def = itemDef(heldId);
      if (def && def.tool) { if (p.inventory.damageHeld(def.tool === 'sword' ? 2 : 1)) this.audio.play('dig_glass'); }
      p.exhaustion += 0.005;
    }
    w.processLightQueue(true);
    this.breaking = null;
  }

  updateBreaking(dt) {
    const p = this.player;
    if (!this.mouse[0] || this.ui.isOpen()) { this.breaking = null; return; }
    p.swing = Math.max(p.swing, 0.6);
    if (this.targetEntity) { if (this.attackCooldown <= 0) this.attack(this.targetEntity); this.breaking = null; return; }
    const t = this.target;
    if (!t) { this.breaking = null; return; }
    if (p.mode === 'creative') {
      this.breakRepeat -= dt;
      if (this.breakRepeat <= 0) { this.breakBlock(t); this.breakRepeat = 0.25; }
      return;
    }
    const id = this.world.getBlock(t.x, t.y, t.z);
    if (!this.breaking || this.breaking.x !== t.x || this.breaking.y !== t.y || this.breaking.z !== t.z || this.breaking.id !== id) {
      this.breaking = { x: t.x, y: t.y, z: t.z, id, progress: 0, time: breakTime(id, p.inventory.heldId(), false), hitTimer: 0 };
    }
    const b = this.breaking;
    if (!isFinite(b.time)) return;
    b.progress += dt / Math.max(b.time, 0.05);
    b.hitTimer -= dt;
    if (b.hitTimer <= 0) {
      b.hitTimer = 0.24;
      this.audio.playDig(id, t.x, t.y, t.z, 0.35);
      for (let i = 0; i < 2; i++) this.particles.blockHit(t.x, t.y, t.z, t.nx, t.ny, t.nz, id);
    }
    if (b.progress >= 1) this.breakBlock(t);
  }

  updateUse(dt) {
    const p = this.player;
    if (!this.mouse[2] || this.ui.isOpen()) { this.eatTimer = 0; return; }
    const held = p.inventory.held();
    const def = held ? itemDef(held.id) : null;
    // eating
    if (def && def.food && !(this.target && BLOCKS[this.world.getBlock(this.target.x, this.target.y, this.target.z)].interact && !this.input.sneak)) {
      if (p.food >= 20 && p.mode === 'survival') return;
      this.eatTimer += dt;
      if (Math.floor(this.eatTimer * 5) !== Math.floor((this.eatTimer - dt) * 5)) this.audio.play('eat', undefined, undefined, undefined, 0.6);
      if (this.eatTimer >= 1.4) {
        this.eatTimer = 0;
        p.eat(def.food);
        if (p.mode === 'survival') {
          p.inventory.consumeHeld(1);
          if (def.returns) { const left = p.inventory.add(def.returns, 1); if (left) this.dropFromPlayer(def.returns, left); }
        }
        this.audio.play('burp');
        if (held.id === I.ROTTEN_FLESH && Math.random() < 0.5) p.exhaustion += 8;
      }
      return;
    }
    this.useCooldown -= dt;
    if (this.useCooldown > 0) return;
    this.useCooldown = 0.22;
    this.useItem();
  }

  useItem() {
    const p = this.player, w = this.world, t = this.target;
    const held = p.inventory.held();
    const heldId = held ? held.id : 0;
    // interact with block
    if (t && !this.input.sneak) {
      const bid = w.getBlock(t.x, t.y, t.z);
      const def = BLOCKS[bid];
      if (def.interact) {
        this.mouse[2] = false;
        if (def.interact === 'crafting') this.ui.openCrafting();
        else if (def.interact === 'chest') { this.ui.openChest(w.getTile(t.x, t.y, t.z, 'chest')); this.audio.play('door', t.x, t.y, t.z); }
        else if (def.interact === 'furnace') this.ui.openFurnace(w.getTile(t.x, t.y, t.z, 'furnace'));
        else if (def.interact === 'bed') this.trySleep(t.x, t.y, t.z);
        else if (def.interact === 'harvest') {
          w.setBlock(t.x, t.y, t.z, B.BERRY_BUSH_EMPTY);
          this.spawnDrop(I.SWEET_BERRIES, 1 + Math.floor(Math.random() * 3), t.x + 0.5, t.y + 0.5, t.z + 0.5);
          this.audio.play('dig_grass', t.x, t.y, t.z);
          p.swing = 1;
        }
        return;
      }
      if (bid === B.TNT && heldId === I.FLINT_AND_STEEL) {
        w.setBlock(t.x, t.y, t.z, B.AIR);
        this.entities.push(new PrimedTNT(t.x + 0.5, t.y, t.z + 0.5));
        this.audio.play('ignite', t.x, t.y, t.z); this.audio.play('fuse', t.x, t.y, t.z);
        if (p.mode === 'survival') p.inventory.damageHeld(1);
        p.swing = 1;
        return;
      }
    }
    if (!held) return;
    // buckets
    // lily pads go on top of still water
    if (heldId === B.LILY_PAD) {
      const [dx, dy, dz] = p.lookDir();
      const h = raycastBlocks(w, p.x, p.eyeY, p.z, dx, dy, dz, this.reach(), true);
      if (h && h.id === B.WATER && w.getBlock(h.x, h.y + 1, h.z) === B.AIR) {
        w.setBlock(h.x, h.y + 1, h.z, B.LILY_PAD);
        this.audio.playDig(B.LILY_PAD, h.x, h.y + 1, h.z, 0.8);
        if (p.mode === 'survival') p.inventory.consumeHeld(1);
        p.swing = 1;
      }
      return;
    }
    if (heldId === I.BUCKET) {
      const [dx, dy, dz] = p.lookDir();
      const h = raycastBlocks(w, p.x, p.eyeY, p.z, dx, dy, dz, this.reach(), true);
      if (h && h.id === B.WATER && w.getMeta(h.x, h.y, h.z) === 0) {
        w.setBlock(h.x, h.y, h.z, B.AIR);
        if (p.mode === 'survival') { p.inventory.consumeHeld(1); const left = p.inventory.add(I.WATER_BUCKET, 1); if (left) this.dropFromPlayer(I.WATER_BUCKET, 1); }
        this.audio.play('bucket');
        w.processLightQueue(true);
      }
      return;
    }
    if (!t) return;
    let px = t.x + t.nx, py = t.y + t.ny, pz = t.z + t.nz;
    const tb = w.getBlock(t.x, t.y, t.z);
    if (BLOCKS[tb].replaceable && tb !== B.WATER && tb !== B.LAVA) { px = t.x; py = t.y; pz = t.z; }
    if (py < 0 || py >= WORLD_H) return;
    const cur = w.getBlock(px, py, pz);
    if (!BLOCKS[cur].replaceable) return;
    if (heldId === I.WATER_BUCKET) {
      w.setBlock(px, py, pz, B.WATER, 0);
      if (p.mode === 'survival') { p.inventory.slots[p.inventory.selected] = makeStack(I.BUCKET, 1); p.inventory.changed(); }
      this.audio.play('splash', px, py, pz);
      w.processLightQueue(true);
      p.swing = 1;
      return;
    }
    const placeId = heldId >= 256 ? ITEMS[heldId].places : heldId;
    if (!placeId) return;
    const id = placeId;
    let meta = 0;
    const below = w.getBlock(px, py - 1, pz);
    if (id === B.TORCH) {
      if (t.ny === -1 && py !== t.y) return;
      const supp = (x, y, z) => SOLID[w.getBlock(x, y, z)] && OPAQUE[w.getBlock(x, y, z)];
      if (px === t.x && py === t.y && pz === t.z) { if (!supp(px, py - 1, pz)) return; meta = 0; }
      else if (t.ny === 1) meta = 0;
      else if (t.nx === 1) meta = 1; else if (t.nx === -1) meta = 2; else if (t.nz === 1) meta = 3; else if (t.nz === -1) meta = 4;
      if (meta === 0 && !supp(px, py - 1, pz)) return;
      if (meta !== 0 && !supp(t.x, t.y, t.z)) return;
    } else if (DOUBLE_LOWER[id]) {
      if (!(below === B.GRASS || below === B.DIRT || below === B.SNOW_GRASS) || !BLOCKS[w.getBlock(px, py + 1, pz)].replaceable) return;
      w.setBlock(px, py + 1, pz, DOUBLE_LOWER[id], 0, { noUpdate: true });
    } else if (RENDER[id] === RT_CROSS) {
      if (!w.plantSupported(id, px, py, pz)) return;
    } else if (id === B.CACTUS) {
      if (below !== B.SAND && below !== B.CACTUS) return;
    }
    if (BLOCKS[id].facing) {
      const [dx, , dz] = p.lookDir();
      if (Math.abs(dz) >= Math.abs(dx)) meta = dz < 0 ? 0 : 2; else meta = dx < 0 ? 3 : 1;
    }
    if (SOLID[id]) {
      // don't place inside entities
      const hw = p.w / 2;
      if (p.x + hw > px && p.x - hw < px + 1 && p.y + p.h > py && p.y < py + 1 && !(p.mode === 'creative' && p.flying && false)) return;
      for (const e of this.entities) {
        if (!e.isMob) continue;
        const ew = e.w / 2;
        if (e.x + ew > px && e.x - ew < px + 1 && e.y + e.h > py && e.y < py + 1) return;
      }
    }
    w.setBlock(px, py, pz, id, meta);
    this.audio.playDig(id, px, py, pz, 0.8);
    if (p.mode === 'survival') p.inventory.consumeHeld(1);
    p.swing = 1;
    w.processLightQueue(true);
  }

  trySleep(x, y, z) {
    const p = this.player;
    p.spawn = { x: x + 0.5, y: y + 1, z: z + 0.5 };
    if (this.isDay()) { this.ui.toast('Respawn point set. You can only sleep at night.'); return; }
    for (const e of this.entities) if (e.isMob && e.T.hostile && Math.hypot(e.x - x, e.y - y, e.z - z) < 8) { this.ui.toast('You may not rest now; there are monsters nearby'); return; }
    const fade = document.getElementById('sleep');
    fade.style.opacity = 1;
    this.sleeping = true;
    setTimeout(() => {
      this.time = Math.ceil(this.time / DAY_TICKS) * DAY_TICKS + 200;
      for (const e of this.entities) if (e.isMob && e.T.hostile) e.dead = true;
      fade.style.opacity = 0;
      this.sleeping = false;
      this.ui.toast('Good morning! Respawn point set.');
    }, 1800);
  }

  pickBlock() {
    const t = this.target;
    if (!t) return;
    let id = this.world.getBlock(t.x, t.y, t.z);
    if (id === B.FURNACE_LIT) id = B.FURNACE;
    if (id === B.GRASS || id === B.SNOW_GRASS) id = id;
    const inv = this.player.inventory;
    for (let i = 0; i < 9; i++) if (inv.slots[i] && inv.slots[i].id === id) { inv.selected = i; this.onSlotChange(); return; }
    if (this.player.mode === 'creative') {
      let slot = inv.slots.slice(0, 9).findIndex((s) => !s);
      if (slot < 0) slot = inv.selected;
      inv.slots[slot] = makeStack(id, 64);
      inv.selected = slot;
      this.onSlotChange();
    }
  }

  dropHeld(all) {
    const inv = this.player.inventory;
    const s = inv.held();
    if (!s) return;
    const n = all ? s.count : 1;
    this.dropFromPlayer(s.id, n, s.dmg);
    inv.consumeHeld(n);
    this.player.swing = 1;
  }

  dropFromPlayer(id, count, dmg) {
    const p = this.player;
    const [dx, dy, dz] = p.lookDir();
    const d = new ItemDrop(id, count, p.x + dx * 0.3, p.eyeY - 0.3, p.z + dz * 0.3, dmg ? { dmg } : null);
    d.vx = dx * 6; d.vy = dy * 6 + 2; d.vz = dz * 6;
    d.pickupDelay = 1.5;
    this.entities.push(d);
  }

  spawnDrop(id, count, x, y, z, extra, scatter) {
    const max = maxStack(id);
    while (count > 0) {
      const n = Math.min(count, max);
      const d = new ItemDrop(id, n, x, y, z, extra);
      if (scatter) { d.vx *= 2; d.vz *= 2; d.vy = 5; d.pickupDelay = 2; }
      this.entities.push(d);
      count -= n;
    }
  }

  explode(x, y, z, power, source) {
    const w = this.world;
    const r = power;
    this.audio.play('explode', x, y, z, 1.4);
    this.particles.explosion(x, y, z, r);
    this.shake = Math.max(this.shake || 0, clamp(1 - Math.hypot(this.player.x - x, this.player.y - y, this.player.z - z) / 24, 0, 1));
    const rr = Math.ceil(r);
    for (let dy = -rr; dy <= rr; dy++) for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > r * (0.7 + Math.random() * 0.35)) continue;
      const bx = Math.floor(x + dx), by = Math.floor(y + dy), bz = Math.floor(z + dz);
      const id = w.getBlock(bx, by, bz);
      if (id === B.AIR || id === B.BEDROCK || id === B.OBSIDIAN || id === B.WATER || id === B.LAVA) continue;
      if (id === B.TNT) { w.setBlock(bx, by, bz, B.AIR, 0); this.entities.push(new PrimedTNT(bx + 0.5, by, bz + 0.5, 0.5 + Math.random() * 1.0)); continue; }
      w.setBlock(bx, by, bz, B.AIR, 0);
      if (Math.random() < 0.25) { const drop = blockDrop(id, TOOLS.diamond_pickaxe); if (drop) this.spawnDrop(drop, 1, bx + 0.5, by + 0.5, bz + 0.5); }
    }
    w.processLightQueue(true);
    // damage
    const hurt = (e, isPlayer) => {
      const ex = e.x - x, ey = e.y + e.h / 2 - y, ez = e.z - z;
      const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (d > r * 2) return;
      const impact = 1 - d / (r * 2);
      const dmg = Math.floor((impact * impact + impact) / 2 * 7 * r + 1);
      const kx = ex / (d || 1), ky = ey / (d || 1), kz = ez / (d || 1);
      if (isPlayer) { if (e.damage(dmg, this, source instanceof Mob ? 'creeper' : 'explosion')) { e.vx += kx * impact * 14; e.vy += ky * impact * 10 + 3; e.vz += kz * impact * 14; } }
      else if (e.isMob) { e.invuln = 0; e.damage(dmg, this, x, z, impact * 2); }
      else if (e instanceof ItemDrop && Math.random() < 0.3) e.dead = true;
    };
    hurt(this.player, true);
    for (const e of this.entities) if (e !== source) hurt(e, false);
  }

  // ---- Mob spawning -------------------------------------------------------------------------
  updateSpawning(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 1;
    const p = this.player, w = this.world;
    let passive = 0, hostile = 0;
    for (const e of this.entities) {
      if (!e.isMob) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d > 96 || (e.T.hostile && d > 72) || (e.T.hostile && this.isDay() && e.type === 'creeper' && d > 32 && Math.random() < 0.02)) { e.dead = true; continue; }
      if (e.T.hostile) hostile++; else passive++;
    }
    const dayLight = this.skyLightLevel();
    for (let attempt = 0; attempt < 4; attempt++) {
      const a = Math.random() * Math.PI * 2, d = 22 + Math.random() * 30;
      const x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d);
      if (!w.isLoaded(x, z) || !w.isLoaded(x + 1, z + 1)) continue;
      let y = WORLD_H - 2;
      while (y > 0 && !SOLID[w.getBlock(x, y, z)] && w.getBlock(x, y, z) !== B.WATER) y--;
      const ground = w.getBlock(x, y, z);
      let sy = y + 1;
      const underground = Math.random() < 0.5 && hostile < 10;
      if (underground) {
        // try a random cave spot below surface
        let found = false;
        for (let k = 0; k < 8 && !found; k++) {
          const yy = 6 + Math.floor(Math.random() * Math.max(1, y - 10));
          if (SOLID[w.getBlock(x, yy - 1, z)] && w.getBlock(x, yy, z) === B.AIR && w.getBlock(x, yy + 1, z) === B.AIR) { sy = yy; found = true; }
        }
        if (!found) continue;
      } else if (!SOLID[ground]) continue;
      if (w.getBlock(x, sy, z) !== B.AIR || w.getBlock(x, sy + 1, z) !== B.AIR) continue;
      const sky = w.getSky(x, sy, z), blk = w.getBlockLight(x, sy, z);
      const eff = Math.max(blk, sky - (15 - dayLight));
      if (!underground && ground === B.GRASS && sky >= 13 && passive < 10 && Math.random() < 0.6) {
        const type = Math.random() < 0.55 ? 'pig' : 'sheep';
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const ox = x + Math.floor(Math.random() * 5) - 2, oz = z + Math.floor(Math.random() * 5) - 2;
          let oy = sy + 2;
          while (oy > 1 && !SOLID[w.getBlock(ox, oy - 1, oz)]) oy--;
          if (w.getBlock(ox, oy - 1, oz) === B.GRASS) this.entities.push(new Mob(type, ox + 0.5, oy, oz + 0.5));
        }
        passive += n;
      } else if (eff <= 7 && hostile < 12 && ground !== B.WATER) {
        const type = Math.random() < 0.6 ? 'zombie' : 'creeper';
        this.entities.push(new Mob(type, x + 0.5, sy, z + 0.5));
        hostile++;
      }
    }
  }

  skyLightLevel() {
    // 4 at midnight .. 15 at day
    return Math.round(4 + 11 * this.daylight01());
  }
  daylight01() {
    const a = (this.time % DAY_TICKS) / DAY_TICKS * Math.PI * 2;
    return clamp(Math.sin(a) * 2.2 + 0.45, 0, 1);
  }

  // ---- Chunk streaming ------------------------------------------------------------------------
  updateChunks(budget, cx, cz) {
    const w = this.world, R = this.settings.renderDist;
    const t0 = performance.now();
    // unload
    for (const c of w.chunks.values()) {
      if (Math.abs(c.cx - cx) > R + 3 || Math.abs(c.cz - cz) > R + 3) { this.renderer.deleteChunkMesh(c); w.unloadChunk(c); }
    }
    // urgent: relight + remesh edited chunks immediately
    w.processLightQueue(true);
    for (const c of w.chunks.values()) {
      if (c.urgent && c.lit && c.dirty && w.neighborsLit(c.cx, c.cz)) {
        this.renderer.uploadChunk(c, buildChunkMesh(w, c)); c.dirty = false; c.urgent = false;
      }
    }
    let loading = 0;
    for (const [dx, dz, d] of this.offsets) {
      if (performance.now() - t0 > budget) { loading++; break; }
      const x = cx + dx, z = cz + dz;
      let c = w.getChunk(x, z);
      if (!c) { c = w.loadChunk(x, z); loading++; continue; }
      if (d > R + 0.5) continue;
      if (!c.lit) { if (w.neighborsGenerated(x, z)) { w.computeLight(c); c.dirty = true; } else loading++; continue; }
      if (c.dirty) {
        if (w.neighborsLit(x, z)) { this.renderer.uploadChunk(c, buildChunkMesh(w, c)); c.dirty = false; c.urgent = false; }
        else loading++;
      }
    }
    return loading;
  }

  // ---- Main loop --------------------------------------------------------------------------------
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    this.realTime += dt;
    this.frames++; this.fpsTimer += dt;
    if (this.fpsTimer >= 1) { this.fps = Math.round(this.frames / this.fpsTimer); this.frames = 0; this.fpsTimer = 0; }
    try {
      if (this.state === 'menu') this.updateMenu(dt);
      else if (this.state === 'loading') this.updateLoading(dt);
      else if (this.state === 'playing') this.updatePlaying(dt);
      this.renderFrame(dt);
    } catch (err) {
      console.error(err);
      if (!this.reportedError) { this.reportedError = true; this.ui.toast('Error: ' + err.message); }
    }
  }

  updateMenu(dt) {
    const c = this.menuCam;
    c.yaw += dt * 0.04;
    this.time = 3000;
    this.updateChunks(10, Math.floor(c.x / 16), Math.floor(c.z / 16));
    this.particles.update(dt, this.world);
    this.audio.updateMusic(dt, true);
  }

  updateLoading(dt) {
    const p = this.player;
    const cx = Math.floor(p.x / 16), cz = Math.floor(p.z / 16);
    this.updateChunks(30, cx, cz);
    // ready when nearby chunks are meshed
    let ready = 0, total = 0;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      total++;
      const c = this.world.getChunk(cx + dx, cz + dz);
      if (c && c.mesh && !c.dirty) ready++;
    }
    this.ui.showLoading('Generating terrain...', ready / total);
    if (ready === total || performance.now() - this.loadStart > 20000) {
      if (this.needsSafePlacement) { this.placePlayerSafely(); this.player.spawn = { x: this.player.x, y: this.player.y, z: this.player.z }; this.needsSafePlacement = false; }
      this.ui.hideLoading();
      document.getElementById('hud').style.display = '';
      this.state = 'playing';
      this.lockPointer();
      this.ui.toast('Welcome to Blockhaven! Press E for inventory, Esc for menu.');
      this.invDirty = true;
    }
  }

  updatePlaying(dt) {
    const ui = this.ui, p = this.player, w = this.world;
    const paused = ui.screen === 'pause' || ui.screen === 'options' || ui.screen === 'controls';
    this.updateInput();
    if (!paused) {
      this.time += dt * 20;
      this.tickAcc += dt;
      while (this.tickAcc >= 0.05) { this.tickAcc -= 0.05; w.tick(); w.randomTicks(p.x, p.z); }
      w.updateFurnaces(dt);
      if (ui.screen === 'furnace') { this.furnaceRefresh = (this.furnaceRefresh || 0) + dt; if (this.furnaceRefresh > 0.25) { this.furnaceRefresh = 0; ui.refresh(); } }
      if (this.attackCooldown > 0) this.attackCooldown -= dt;
      const noInput = ui.isOpen();
      const inp = noInput ? { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false } : this.input;
      // keep player still until chunk under them exists
      if (w.isLoaded(Math.floor(p.x), Math.floor(p.z))) p.update(dt, inp, this);
      if (!p.dead) {
        this.findTarget();
        if (!noInput) { this.updateBreaking(dt); this.updateUse(dt); }
      } else { this.target = null; this.targetEntity = null; }
      for (const e of this.entities) e.update(dt, this);
      // merge item drops
      this.entities = this.entities.filter((e) => !e.dead);
      this.particles.update(dt, w);
      this.updateSpawning(dt);
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.5);
      this.saveTimer += dt;
      if (this.saveTimer > 45) { this.saveTimer = 0; this.saveGame(true); }
    }
    this.updateChunks(8, Math.floor(p.x / 16), Math.floor(p.z / 16));
    this.audio.listener = { x: p.x, y: p.eyeY, z: p.z, yaw: p.yaw };
    this.audio.updateMusic(dt, true);
    document.getElementById('clickhint').style.display = !this.pointerLocked() && !ui.isOpen() ? 'block' : 'none';
    if (this.invDirty) { this.invDirty = false; ui.updateHUD(); if (ui.isGuiScreen()) ui.refresh(); }
    else ui.updateHUD();
  }

  // ---- Rendering -----------------------------------------------------------------------------------
  renderFrame(dt) {
    const r = this.renderer, w = this.world;
    const day = this.state === 'menu' ? 1 : this.daylight01();
    const a = (this.time % DAY_TICKS) / DAY_TICKS * Math.PI * 2;
    const sunDir = [Math.cos(a), Math.sin(a), 0.15];
    const dayTop = [0.38, 0.6, 1.0], dayHor = [0.7, 0.82, 1.0], nightTop = [0.004, 0.006, 0.025], nightHor = [0.03, 0.04, 0.09];
    const sunset = Math.exp(-Math.sin(a) * Math.sin(a) * 18) * (Math.cos(a) > -2 ? 1 : 0);
    let fog = [0, 1, 2].map((i) => lerp(nightHor[i], dayHor[i], day));
    fog = [lerp(fog[0], 0.95, sunset * 0.45), lerp(fog[1], 0.55, sunset * 0.45), lerp(fog[2], 0.35, sunset * 0.45)];
    const top = [0, 1, 2].map((i) => lerp(nightTop[i], dayTop[i], day));
    let cam;
    const p = this.player;
    this.dyn.reset(); this.dynTrans.reset(); this.hand.reset();
    let underwater = false;
    if (this.state === 'menu' || this.state === 'loading') {
      cam = this.state === 'menu' ? this.menuCam : { x: p.x, y: p.y + 1.62, z: p.z, yaw: p.yaw, pitch: p.pitch };
    } else {
      const bob = this.settings.bobbing ? p.bobAmt : 0;
      cam = { x: p.x, y: p.eyeY + Math.abs(Math.cos(p.bob)) * 0.08 * bob, z: p.z, yaw: p.yaw, pitch: p.pitch, roll: Math.sin(p.bob) * 0.012 * bob };
      cam.x += Math.cos(p.yaw) * Math.sin(p.bob) * 0.04 * bob; cam.z -= Math.sin(p.yaw) * Math.sin(p.bob) * 0.04 * bob;
      if (p.hurtTime > 0) cam.roll = (cam.roll || 0) + Math.sin(p.hurtTime / 0.4 * Math.PI) * 0.12;
      if (this.shake > 0) { cam.x += (Math.random() - 0.5) * this.shake * 0.3; cam.y += (Math.random() - 0.5) * this.shake * 0.3; }
      if (p.dead) { cam.roll = 0.6; cam.y = p.y + 0.3; }
      if (this.thirdPerson) {
        const [dx, dy, dz] = p.lookDir();
        const sgn = this.thirdPerson === 1 ? -1 : 1;
        const h = raycastBlocks(w, cam.x, cam.y, cam.z, dx * sgn, dy * sgn, dz * sgn, 4);
        const dist = h ? Math.max(0.3, h.dist - 0.25) : 4;
        cam.x += dx * sgn * dist; cam.y += dy * sgn * dist; cam.z += dz * sgn * dist;
        if (this.thirdPerson === 2) { cam.yaw += Math.PI; cam.pitch = -cam.pitch; }
        const sky = w.getSky(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z)), blk = w.getBlockLight(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z));
        drawModel(this.dyn, 'player', p.x, p.y, p.z, p.yaw, p.bob * 1.4, p.bobAmt, p.pitch, sky, blk, p.hurtTime > 0 ? 3 : 0, { swing: p.swing });
      }
      underwater = w.getBlock(Math.floor(cam.x), Math.floor(cam.y), Math.floor(cam.z)) === B.WATER;
      // entities
      for (const e of this.entities) {
        if (Math.abs(e.x - cam.x) > 96 || Math.abs(e.z - cam.z) > 96) continue;
        e.render(this.dyn, w, cam);
      }
      this.particles.render(this.dynTrans, w, cam);
      // break overlay
      if (this.breaking && this.breaking.progress > 0) {
        const b = this.breaking, st = Math.min(9, Math.floor(b.progress * 10));
        Mat4.identity(_m);
        Mat4.translate(_m, _m, b.x - 0.003, b.y - 0.003, b.z - 0.003);
        Mat4.scale(_m, _m, 1.006, 1.006, 1.006);
        const tl = tileIndex('destroy_' + st);
        this.dyn.box(_m, [tl, tl, tl, tl, tl, tl], 15, 15, 0);
      }
      if (!this.thirdPerson && !p.dead) this.buildHand(dt);
    }
    this.particlesMenu = null;
    const sel = this.target && !this.thirdPerson && this.state === 'playing' ? this.selectionBox(this.target) : null;
    if (this.realTime - (this.lastAnim || 0) > 0.1) { this.lastAnim = this.realTime; r.animateAtlas(this.realTime); }
    const chunks = this.world.chunks.values();
    r.render({
      cam, fov: this.settings.fov * (p.sprinting && this.state === 'playing' ? 1.1 : 1) * (underwater ? 0.92 : 1), renderDist: this.settings.renderDist,
      chunks, time: this.realTime, daylight: lerp(0.13, 1, day), skyTint: [lerp(0.55, 1, day), lerp(0.62, 1, day), 1],
      fogColor: fog, skyTop: top, sunDir, night: 1 - day, sunset, underwater, brightness: this.settings.brightness / 100,
      dyn: this.dyn, dynTrans: this.dynTrans, hand: this.hand, selection: sel, clouds: this.settings.clouds,
    });
    document.getElementById('underwater').style.opacity = underwater ? 1 : 0;
    this.updateDebug(cam);
  }

  selectionBox(t) {
    const id = this.world.getBlock(t.x, t.y, t.z);
    if (RENDER[id] === RT_CROSS) return { x0: t.x + 0.15, y0: t.y, z0: t.z + 0.15, x1: t.x + 0.85, y1: t.y + 0.8, z1: t.z + 0.85 };
    if (RENDER[id] === RT_FLAT) return { x0: t.x, y0: t.y, z0: t.z, x1: t.x + 1, y1: t.y + 0.03, z1: t.z + 1 };
    if (id === B.BED) return { x0: t.x, y0: t.y, z0: t.z, x1: t.x + 1, y1: t.y + 0.5625, z1: t.z + 1 };
    if (id === B.TORCH) return { x0: t.x + 0.38, y0: t.y, z0: t.z + 0.38, x1: t.x + 0.62, y1: t.y + 0.65, z1: t.z + 0.62 };
    return { x0: t.x, y0: t.y, z0: t.z, x1: t.x + 1, y1: t.y + 1, z1: t.z + 1 };
  }

  buildHand(dt) {
    const p = this.player, w = this.world;
    const held = p.inventory.held();
    const sky = w.getSky(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z));
    const blk = w.getBlockLight(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z));
    const bobOn = this.settings.bobbing ? p.bobAmt : 0;
    const bx = Math.sin(p.bob) * 0.04 * bobOn, by = -Math.abs(Math.cos(p.bob)) * 0.04 * bobOn;
    const sw = p.swing;
    const swingA = Math.sin(sw * Math.PI);
    const swingB = Math.sin(Math.sqrt(sw) * Math.PI);
    let eatY = 0;
    if (this.eatTimer > 0) eatY = Math.abs(Math.sin(this.eatTimer * 18)) * 0.05 - 0.1;
    const m = _m;
    Mat4.identity(m);
    Mat4.translate(m, m, 0.56 + bx - swingB * 0.25 - (this.eatTimer > 0 ? 0.25 : 0), -0.52 + by + swingB * 0.12 + eatY, -0.72 - swingA * 0.15);
    if (!held) {
      Mat4.rotateX(m, m, 0.2 + swingA * 0.6);
      Mat4.rotateY(m, m, -0.15 - swingB * 0.4);
      Mat4.translate(m, m, -0.1, -0.15, -0.1);
      Mat4.scale(m, m, 0.22, 0.22, 0.75);
      const sk = tileIndex('player_skin');
      this.hand.box(m, [sk, sk, sk, sk, sk, sk], sky, blk, 0);
      return;
    }
    const id = held.id;
    if (id < 256 && (RENDER[id] === RT_CUBE || RENDER[id] === RT_CACTUS)) {
      Mat4.rotateX(m, m, swingA * 0.5);
      Mat4.rotateY(m, m, Math.PI / 4 - swingB * 0.4);
      Mat4.scale(m, m, 0.4, 0.4, 0.4);
      Mat4.translate(m, m, -0.5, -0.5, -0.5);
      const t = []; for (let f = 0; f < 6; f++) t.push(FACE_TEX[id * 6 + f]);
      if (BLOCKS[id].facing) t[4] = FRONT_TEX[id];
      this.hand.box(m, t, sky, blk, 0);
    } else {
      const tile = itemTile(id);
      Mat4.rotateX(m, m, swingA * 0.9);
      Mat4.rotateY(m, m, -0.35 - swingB * 0.3);
      Mat4.rotateZ(m, m, -0.1);
      Mat4.translate(m, m, -0.28, -0.15, 0);
      Mat4.scale(m, m, 0.6, 0.6, 0.6);
      const P = (a, b, c) => { const o = [0, 0, 0]; Mat4.transformPoint(m, a, b, c, o); return o; };
      // thin extruded sprite: front and back + a slightly offset copy for thickness
      this.hand.quad(P(0, 0, 0), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0), tile, null, sky, blk, 1, 0);
      this.hand.quad(P(0, 0, -0.04), P(1, 0, -0.04), P(1, 1, -0.04), P(0, 1, -0.04), tile, null, sky, blk, 0.7, 0);
    }
  }

  updateDebug(cam) {
    const d = document.getElementById('debug');
    if (this.state !== 'playing' || (!this.debug && !this.settings.showFps)) { d.style.display = 'none'; return; }
    d.style.display = 'block';
    if (!this.debug) { d.textContent = this.fps + ' fps'; return; }
    const p = this.player, w = this.world;
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    const col = w.gen.column(bx, bz);
    const dirs = ['north (-Z)', 'west (-X)', 'south (+Z)', 'east (+X)'];
    const yawN = ((p.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const facing = dirs[Math.round(yawN / (Math.PI / 2)) % 4];
    const t = this.target;
    const lines = [
      `Blockhaven 1.0 (${this.fps} fps)`,
      `Chunks: ${this.renderer.stats.chunks} rendered / ${w.chunks.size} loaded, ${this.renderer.stats.faces | 0} faces`,
      `Entities: ${this.entities.length}  Particles: ${this.particles.list.length}`,
      '',
      `XYZ: ${p.x.toFixed(3)} / ${p.y.toFixed(3)} / ${p.z.toFixed(3)}`,
      `Block: ${bx} ${by} ${bz}   Chunk: ${bx >> 4} ${bz >> 4}`,
      `Facing: ${facing}`,
      `Biome: ${BIOME_NAMES[col.biome]}`,
      `Light: sky ${w.getSky(bx, by, bz)}  block ${w.getBlockLight(bx, by, bz)}`,
      `Time: day ${Math.floor(this.time / DAY_TICKS)}, ${Math.floor(this.time % DAY_TICKS)} ticks`,
      `Seed: ${w.seed}`,
      t ? `Looking at: ${itemName(w.getBlock(t.x, t.y, t.z))} (${t.x}, ${t.y}, ${t.z})` : '',
    ];
    d.textContent = lines.join('\n');
  }
}
