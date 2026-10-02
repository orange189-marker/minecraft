'use strict';
// ---------------------------------------------------------------------------
// Entities: mobs, dropped items, primed TNT and particles
// ---------------------------------------------------------------------------

const GRAVITY = 28;

class Entity {
  constructor(x, y, z, w, h) {
    this.x = x; this.y = y; this.z = z; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.onGround = false; this.inWater = false; this.inLava = false;
    this.dead = false; this.age = 0; this.collidedH = false;
  }
  physics(dt, world, drag = 0.0) {
    this.inWater = aabbTouches(world, this, B.WATER, 0, 0.6);
    this.inLava = aabbTouches(world, this, B.LAVA, 0, 0.6);
    if (this.inWater || this.inLava) {
      this.vy -= GRAVITY * 0.18 * dt;
      this.vy *= Math.pow(0.2, dt);
      this.vx *= Math.pow(0.15, dt); this.vz *= Math.pow(0.15, dt);
    } else {
      this.vy -= GRAVITY * dt;
      this.vy = Math.max(this.vy, -60);
    }
    const r = moveWithCollision(world, this, this.vx * dt, this.vy * dt, this.vz * dt);
    this.onGround = r.y && this.vy < 0;
    if (r.y) this.vy = 0;
    if (r.x) this.vx = 0;
    if (r.z) this.vz = 0;
    this.collidedH = r.x || r.z;
    if (this.onGround) { const f = Math.pow(0.002, dt); this.vx *= f; this.vz *= f; }
    if (this.y < -64) this.dead = true;
  }
}

// ---- Mob models --------------------------------------------------------------
// Each part: size [w,h,d], pivot [x,y,z], off (box min relative to pivot), tiles, anim
function part(size, pivot, off, tiles, anim) { return { size, pivot, off, tiles, anim }; }
function tiles6(side, top, bottom, front, back) { return [side, side, top || side, bottom || side, back || side, front || side]; }

const MOB_TYPES = {
  pig: {
    name: 'Pig', w: 0.9, h: 0.9, hp: 10, speed: 1.3, hostile: false, sound: 'pig', food: [I.CARROT, I.POTATO, I.BEETROOT],
    drops: () => [[I.PORKCHOP, 1 + Math.floor(Math.random() * 3)]],
    parts: () => {
      const s = tileIndex('pig_skin'), f = tileIndex('pig_face');
      return [
        part([0.625, 0.5, 1.0], [0, 0.375, 0], [-0.3125, 0, -0.5], tiles6(s)),
        part([0.5, 0.5, 0.5], [0, 0.55, -0.45], [-0.25, 0, -0.45], tiles6(s, s, s, f), 'head'),
        part([0.25, 0.375, 0.25], [-0.18, 0.375, -0.32], [-0.125, -0.375, -0.125], tiles6(s), 'legA'),
        part([0.25, 0.375, 0.25], [0.18, 0.375, -0.32], [-0.125, -0.375, -0.125], tiles6(s), 'legB'),
        part([0.25, 0.375, 0.25], [-0.18, 0.375, 0.32], [-0.125, -0.375, -0.125], tiles6(s), 'legB'),
        part([0.25, 0.375, 0.25], [0.18, 0.375, 0.32], [-0.125, -0.375, -0.125], tiles6(s), 'legA'),
      ];
    },
  },
  sheep: {
    name: 'Sheep', w: 0.9, h: 1.3, hp: 8, speed: 1.2, hostile: false, sound: 'sheep', food: [I.WHEAT],
    drops: () => [[B.WOOL_WHITE, 1], [I.MUTTON, 1 + Math.floor(Math.random() * 2)]],
    parts: () => {
      const w = tileIndex('sheep_wool'), f = tileIndex('sheep_face'), s = tileIndex('sheep_skin');
      return [
        part([0.75, 0.625, 1.1], [0, 0.5, 0], [-0.375, 0, -0.55], tiles6(w)),
        part([0.4, 0.45, 0.5], [0, 0.85, -0.5], [-0.2, 0, -0.4], tiles6(w, w, s, f), 'head'),
        part([0.22, 0.5, 0.22], [-0.2, 0.5, -0.35], [-0.11, -0.5, -0.11], tiles6(s), 'legA'),
        part([0.22, 0.5, 0.22], [0.2, 0.5, -0.35], [-0.11, -0.5, -0.11], tiles6(s), 'legB'),
        part([0.22, 0.5, 0.22], [-0.2, 0.5, 0.35], [-0.11, -0.5, -0.11], tiles6(s), 'legB'),
        part([0.22, 0.5, 0.22], [0.2, 0.5, 0.35], [-0.11, -0.5, -0.11], tiles6(s), 'legA'),
      ];
    },
  },
  cow: {
    name: 'Cow', w: 0.9, h: 1.4, hp: 10, speed: 1.1, hostile: false, sound: 'cow', food: [I.WHEAT],
    drops: () => [[I.LEATHER, Math.floor(Math.random() * 3)], [I.BEEF, 1 + Math.floor(Math.random() * 3)]],
    parts: () => {
      const s = tileIndex('cow_skin'), f = tileIndex('cow_face'), h = tileIndex('horn');
      return [
        part([0.75, 0.625, 1.125], [0, 0.75, 0], [-0.375, 0, -0.5625], tiles6(s)),
        part([0.5, 0.5, 0.375], [0, 1.05, -0.55], [-0.25, 0, -0.375], tiles6(s, s, s, f), 'head'),
        part([0.0625, 0.1875, 0.0625], [0, 1.05, -0.55], [-0.3125, 0.45, -0.25], tiles6(h), 'head'),
        part([0.0625, 0.1875, 0.0625], [0, 1.05, -0.55], [0.25, 0.45, -0.25], tiles6(h), 'head'),
        part([0.25, 0.75, 0.25], [-0.19, 0.75, -0.38], [-0.125, -0.75, -0.125], tiles6(s), 'legA'),
        part([0.25, 0.75, 0.25], [0.19, 0.75, -0.38], [-0.125, -0.75, -0.125], tiles6(s), 'legB'),
        part([0.25, 0.75, 0.25], [-0.19, 0.75, 0.38], [-0.125, -0.75, -0.125], tiles6(s), 'legB'),
        part([0.25, 0.75, 0.25], [0.19, 0.75, 0.38], [-0.125, -0.75, -0.125], tiles6(s), 'legA'),
      ];
    },
  },
  chicken: {
    name: 'Chicken', w: 0.45, h: 0.75, hp: 4, speed: 1.1, hostile: false, sound: 'chicken', food: [I.WHEAT_SEEDS, I.BEETROOT_SEEDS, I.PUMPKIN_SEEDS, I.MELON_SEEDS],
    drops: () => [[I.FEATHER, Math.floor(Math.random() * 3)], [I.CHICKEN, 1]],
    parts: () => {
      const s = tileIndex('chicken_skin'), f = tileIndex('chicken_face'), b = tileIndex('beak'), w = tileIndex('wattle'), l = tileIndex('chicken_leg');
      return [
        part([0.375, 0.375, 0.5], [0, 0.3125, 0], [-0.1875, 0, -0.25], tiles6(s)),
        part([0.25, 0.375, 0.1875], [0, 0.56, -0.22], [-0.125, 0, -0.1875], tiles6(s, s, s, f), 'head'),
        part([0.25, 0.125, 0.125], [0, 0.56, -0.22], [-0.125, 0.1875, -0.3125], tiles6(b), 'head'),
        part([0.125, 0.125, 0.0625], [0, 0.56, -0.22], [-0.0625, 0.0625, -0.25], tiles6(w), 'head'),
        part([0.0625, 0.25, 0.375], [-0.21, 0.6, 0], [-0.03, -0.25, -0.1875], tiles6(s), 'wingA'),
        part([0.0625, 0.25, 0.375], [0.21, 0.6, 0], [-0.03, -0.25, -0.1875], tiles6(s), 'wingB'),
        part([0.0625, 0.3125, 0.0625], [-0.08, 0.3125, 0.02], [-0.03, -0.3125, -0.03], tiles6(l), 'legA'),
        part([0.0625, 0.3125, 0.0625], [0.08, 0.3125, 0.02], [-0.03, -0.3125, -0.03], tiles6(l), 'legB'),
      ];
    },
  },
  zombie: {
    name: 'Zombie', w: 0.6, h: 1.95, hp: 20, speed: 2.4, hostile: true, sound: 'zombie', damage: 3,
    drops: () => {
      const d = [];
      if (Math.random() < 0.7) d.push([I.ROTTEN_FLESH, 1 + Math.floor(Math.random() * 2)]);
      if (Math.random() < 0.3) d.push([I.BONE, 1]);
      const r = Math.random();
      if (r < 0.03) d.push([I.CARROT, 1]); else if (r < 0.06) d.push([I.POTATO, 1]);
      return d;
    },
    parts: () => humanoidParts('zombie_skin', 'zombie_face', 'zombie_skin', 'zombie_shirt', 'zombie_pants', true),
  },
  creeper: {
    name: 'Creeper', w: 0.6, h: 1.7, hp: 20, speed: 2.1, hostile: true, sound: 'creeper',
    drops: () => [[I.GUNPOWDER, Math.floor(Math.random() * 3)]],
    parts: () => {
      const s = tileIndex('creeper_skin'), f = tileIndex('creeper_face');
      return [
        part([0.5, 0.75, 0.25], [0, 0.375, 0], [-0.25, 0, -0.125], tiles6(s)),
        part([0.5, 0.5, 0.5], [0, 1.125, 0], [-0.25, 0, -0.25], tiles6(s, s, s, f), 'head'),
        part([0.25, 0.375, 0.25], [-0.125, 0.375, -0.25], [-0.125, -0.375, -0.125], tiles6(s), 'legA'),
        part([0.25, 0.375, 0.25], [0.125, 0.375, -0.25], [-0.125, -0.375, -0.125], tiles6(s), 'legB'),
        part([0.25, 0.375, 0.25], [-0.125, 0.375, 0.25], [-0.125, -0.375, -0.125], tiles6(s), 'legB'),
        part([0.25, 0.375, 0.25], [0.125, 0.375, 0.25], [-0.125, -0.375, -0.125], tiles6(s), 'legA'),
      ];
    },
  },
};

function humanoidParts(skin, face, headSide, shirt, pants, zombieArms) {
  const sk = tileIndex(skin), fc = tileIndex(face), hs = tileIndex(headSide), sh = tileIndex(shirt), pa = tileIndex(pants);
  const top = skin === 'player_skin' ? tileIndex('player_hair') : sk;
  return [
    part([0.25, 0.75, 0.25], [-0.125, 0.75, 0], [-0.125, -0.75, -0.125], tiles6(pa), 'legA'),
    part([0.25, 0.75, 0.25], [0.125, 0.75, 0], [-0.125, -0.75, -0.125], tiles6(pa), 'legB'),
    part([0.5, 0.75, 0.25], [0, 0.75, 0], [-0.25, 0, -0.125], tiles6(sh)),
    part([0.25, 0.75, 0.25], [-0.375, 1.375, 0], [-0.125, -0.625, -0.125], [sk, sk, sh, sk, sk, sk], zombieArms ? 'zarmA' : 'armA'),
    part([0.25, 0.75, 0.25], [0.375, 1.375, 0], [-0.125, -0.625, -0.125], [sk, sk, sh, sk, sk, sk], zombieArms ? 'zarmB' : 'armB'),
    part([0.5, 0.5, 0.5], [0, 1.5, 0], [-0.25, 0, -0.25], tiles6(hs, top, sk, fc), 'head'),
  ];
}

MOB_TYPES.sheep.shornParts = () => {
  const f = tileIndex('sheep_face'), s = tileIndex('sheep_skin');
  return [
    part([0.6, 0.5, 1.0], [0, 0.5, 0], [-0.3, 0.05, -0.5], tiles6(s)),
    part([0.4, 0.45, 0.5], [0, 0.85, -0.5], [-0.2, 0, -0.4], tiles6(s, s, s, f), 'head'),
    part([0.22, 0.5, 0.22], [-0.2, 0.5, -0.35], [-0.11, -0.5, -0.11], tiles6(s), 'legA'),
    part([0.22, 0.5, 0.22], [0.2, 0.5, -0.35], [-0.11, -0.5, -0.11], tiles6(s), 'legB'),
    part([0.22, 0.5, 0.22], [-0.2, 0.5, 0.35], [-0.11, -0.5, -0.11], tiles6(s), 'legB'),
    part([0.22, 0.5, 0.22], [0.2, 0.5, 0.35], [-0.11, -0.5, -0.11], tiles6(s), 'legA'),
  ];
};
const MODEL_CACHE = {};
function getModel(type) { return MODEL_CACHE[type] || (MODEL_CACHE[type] = type === 'sheep_shorn' ? MOB_TYPES.sheep.shornParts() : MOB_TYPES[type] ? MOB_TYPES[type].parts() : humanoidParts('player_skin', 'player_face', 'player_head_side', 'player_shirt', 'player_pants', false)); }

const _m = Mat4.create(), _m2 = Mat4.create();
function drawModel(mesh, type, x, y, z, yaw, walk, walkAmt, headPitch, sky, blk, flag, extra = {}) {
  const parts = getModel(type);
  for (const p of parts) {
    Mat4.identity(_m);
    Mat4.translate(_m, _m, x, y, z);
    Mat4.rotateY(_m, _m, yaw);
    if (extra.deathRoll) Mat4.rotateZ(_m, _m, extra.deathRoll);
    Mat4.translate(_m, _m, p.pivot[0], p.pivot[1], p.pivot[2]);
    let ang = 0;
    const sw = Math.sin(walk) * 0.8 * walkAmt;
    switch (p.anim) {
      case 'legA': ang = sw; break;
      case 'legB': ang = -sw; break;
      case 'armA': ang = -sw + (extra.swing ? -extra.swing * 1.6 : 0); break;
      case 'armB': ang = sw; break;
      case 'zarmA': case 'zarmB': ang = Math.PI / 2 * -1 + Math.sin(walk * 0.5) * 0.05; break;
      case 'head': ang = -(headPitch || 0); break;
      case 'wingA': case 'wingB': ang = extra.flap ? Math.sin(extra.flap) * 0.5 - 0.4 : 0; break;
    }
    if (ang) Mat4.rotateX(_m, _m, ang);
    Mat4.translate(_m, _m, p.off[0], p.off[1], p.off[2]);
    Mat4.scale(_m, _m, p.size[0], p.size[1], p.size[2]);
    mesh.box(_m, p.tiles, sky, blk, flag);
  }
}

class Mob extends Entity {
  constructor(type, x, y, z) {
    const T = MOB_TYPES[type];
    super(x, y, z, T.w, T.h);
    this.type = type; this.T = T;
    this.hp = T.hp; this.invuln = 0; this.hurtTime = 0;
    this.walk = 0; this.walkAmt = 0;
    this.wanderTimer = 0; this.moveDir = null; this.attackCd = 0;
    this.fuse = 0; this.deathTime = 0; this.burnTimer = 0;
    this.soundTimer = 3 + Math.random() * 8;
    this.yaw = Math.random() * Math.PI * 2;
    this.isMob = true;
    this.baby = false; this.growTimer = 0; this.love = 0; this.breedCd = 0; this.sheared = false; this.persistent = false;
    this.eggTimer = 300 + Math.random() * 300; this.flap = 0; this.interactCd = 0;
  }

  setBaby(on) {
    this.baby = on;
    this.w = this.T.w * (on ? 0.5 : 1); this.h = this.T.h * (on ? 0.5 : 1);
    if (on) this.growTimer = 300;
  }

  // Right-click with an item. Returns true if something happened.
  interact(game, held) {
    if (this.T.hostile || this.deathTime > 0 || this.interactCd > 0) return false;
    const p = game.player, inv = p.inventory, id = held ? held.id : 0;
    const creative = p.mode === 'creative';
    this.interactCd = 0.25;
    if (this.type === 'sheep' && id === I.SHEARS && !this.sheared && !this.baby) {
      this.sheared = true; this.persistent = true;
      game.spawnDrop(B.WOOL_WHITE, 1 + Math.floor(Math.random() * 3), this.x, this.y + 1, this.z);
      game.audio.play('dig_wool', this.x, this.y, this.z);
      if (!creative) inv.damageHeld(1);
      return true;
    }
    if (this.type === 'cow' && id === I.BUCKET && !this.baby) {
      if (!creative) { inv.consumeHeld(1); const left = inv.add(I.MILK_BUCKET, 1); if (left) game.dropFromPlayer(I.MILK_BUCKET, 1); }
      game.audio.play('bucket', this.x, this.y, this.z);
      return true;
    }
    if (this.T.food && this.T.food.includes(id)) {
      if (this.baby) { this.growTimer -= 60; }
      else if (this.love <= 0 && this.breedCd <= 0) { this.love = 30; }
      else return false;
      this.persistent = true;
      if (!creative) inv.consumeHeld(1);
      game.audio.play('eat', this.x, this.y, this.z, 0.7);
      game.particles.hearts(this.x, this.y + this.h, this.z, 3);
      return true;
    }
    return false;
  }

  serialize() {
    return { type: this.type, x: this.x, y: this.y, z: this.z, yaw: this.yaw, hp: this.hp, baby: this.baby, growTimer: this.growTimer, sheared: this.sheared, breedCd: this.breedCd, persistent: this.persistent };
  }
  static load(d) {
    const m = new Mob(d.type, d.x, d.y, d.z);
    m.yaw = d.yaw || 0; m.hp = d.hp || m.T.hp; m.sheared = !!d.sheared; m.breedCd = d.breedCd || 0; m.persistent = !!d.persistent;
    if (d.baby) { m.setBaby(true); m.growTimer = d.growTimer || 300; }
    return m;
  }

  damage(amount, game, srcX, srcZ, kb = 1) {
    if (this.invuln > 0 || this.deathTime > 0) return false;
    this.hp -= amount; this.invuln = 0.5; this.hurtTime = 0.35;
    if (srcX !== undefined) {
      const dx = this.x - srcX, dz = this.z - srcZ, d = Math.hypot(dx, dz) || 1;
      this.vx = dx / d * 7 * kb; this.vz = dz / d * 7 * kb; this.vy = 5.5 * kb;
    }
    game.audio.play(this.T.sound + '_hurt', this.x, this.y, this.z);
    if (this.hp <= 0) { this.deathTime = 0.001; }
    if (!this.T.hostile) { this.panic = 4; }
    return true;
  }

  update(dt, game) {
    const world = game.world, player = game.player;
    this.age += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtTime > 0) this.hurtTime -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.deathTime > 0) {
      this.deathTime += dt;
      this.physics(dt, world);
      if (this.deathTime > 0.8) {
        this.dead = true;
        if (!this.baby) for (const [id, n] of this.T.drops()) if (n > 0) game.spawnDrop(id, n, this.x, this.y + 0.5, this.z);
        game.particles.smoke(this.x, this.y + this.h / 2, this.z, 10);
      }
      return;
    }
    const dx = player.x - this.x, dz = player.z - this.z, dy = player.y - this.y;
    const dist = Math.hypot(dx, dz);
    let moveX = 0, moveZ = 0, speed = this.T.speed;
    const chase = this.T.hostile && !player.dead && player.mode === 'survival' && dist < 18 && Math.abs(dy) < 8;
    if (chase) {
      this.yaw = Math.atan2(-dx, -dz);
      const stopDist = this.type === 'creeper' ? 1.6 : 0.6;
      if (dist > stopDist) { moveX = -Math.sin(this.yaw); moveZ = -Math.cos(this.yaw); }
      if (this.type === 'zombie' && dist < 1.3 && Math.abs(dy) < 1.8 && this.attackCd <= 0) {
        this.attackCd = 1.0;
        player.damage(this.T.damage, game, 'zombie', this.x, this.z);
      }
      if (this.type === 'creeper') {
        if (dist < 3.2 && Math.abs(dy) < 3) {
          if (this.fuse === 0) game.audio.play('fuse', this.x, this.y, this.z);
          this.fuse += dt;
          moveX = moveZ = 0;
          if (this.fuse > 1.5) { this.dead = true; game.explode(this.x, this.y + 0.8, this.z, 3, this); return; }
        } else this.fuse = Math.max(0, this.fuse - dt);
      }
    } else if (this.farmAnimal(dt, game, dist, dx, dz)) {
      moveX = -Math.sin(this.yaw); moveZ = -Math.cos(this.yaw);
      if (this.stopNear) moveX = moveZ = 0;
    } else {
      if (this.panic > 0) { this.panic -= dt; speed *= 1.8; if (this.wanderTimer > 0.6) this.wanderTimer = 0.6; }
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 2 + Math.random() * 5;
        this.moveDir = Math.random() < (this.panic > 0 ? 1 : 0.55) ? Math.random() * Math.PI * 2 : null;
      }
      if (this.moveDir !== null) {
        this.yaw += clamp(((this.moveDir - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -dt * 4, dt * 4);
        moveX = -Math.sin(this.yaw); moveZ = -Math.cos(this.yaw);
        // avoid walking off cliffs
        const ax = Math.floor(this.x + moveX * 0.8), az = Math.floor(this.z + moveZ * 0.8), fy = Math.floor(this.y);
        if (!isSolidAt(world, ax, fy - 1, az) && !isSolidAt(world, ax, fy - 2, az) && !isSolidAt(world, ax, fy, az)) { this.moveDir = null; moveX = moveZ = 0; }
      }
    }
    // accelerate toward desired velocity
    const accel = this.onGround ? 12 : (this.inWater ? 4 : 2);
    const tvx = moveX * speed, tvz = moveZ * speed;
    this.vx += (tvx - this.vx) * Math.min(1, accel * dt);
    this.vz += (tvz - this.vz) * Math.min(1, accel * dt);
    if ((this.collidedH && this.onGround && (moveX || moveZ))) this.vy = 8.4;
    if (this.inWater) { this.vy += 30 * dt; if (this.vy > 2.5) this.vy = 2.5; }
    this.physics(dt, world);
    const sp = Math.hypot(this.vx, this.vz);
    this.walk += sp * dt * 3.2;
    this.walkAmt += ((sp > 0.3 ? 1 : 0) - this.walkAmt) * Math.min(1, dt * 8);

    // environment damage
    if (this.inLava) this.damage(4, game);
    if (this.type === 'zombie' && game.isDay() && !this.inWater) {
      const sky = world.getSky(Math.floor(this.x), Math.floor(this.y + 1.6), Math.floor(this.z));
      if (sky >= 15) {
        this.burnTimer += dt;
        if (Math.random() < dt * 8) game.particles.flame(this.x, this.y + Math.random() * this.h, this.z);
        if (this.burnTimer > 1) { this.burnTimer = 0; this.invuln = 0; this.damage(1, game); }
      }
    }
    this.soundTimer -= dt;
    if (this.soundTimer <= 0) { this.soundTimer = 6 + Math.random() * 10; if (this.type !== 'creeper') game.audio.play(this.T.sound, this.x, this.y, this.z); }
  }

  // Breeding, following food, growing up, laying eggs, regrowing wool.
  // Returns true when the animal wants to walk toward a target (yaw already set).
  farmAnimal(dt, game, dist, dx, dz) {
    if (this.T.hostile) return false;
    if (this.interactCd > 0) this.interactCd -= dt;
    if (this.breedCd > 0) this.breedCd -= dt;
    if (this.baby) { this.growTimer -= dt; if (this.growTimer <= 0) this.setBaby(false); }
    if (this.type === 'chicken') {
      this.flap += dt * (this.onGround ? 4 : 30);
      if (!this.onGround && this.vy < -2.2) this.vy = -2.2;
      if (!this.baby) { this.eggTimer -= dt; if (this.eggTimer <= 0) { this.eggTimer = 300 + Math.random() * 300; game.spawnDrop(I.EGG, 1, this.x, this.y + 0.3, this.z); game.audio.play('pop', this.x, this.y, this.z, 0.6); } }
    }
    if (this.type === 'sheep' && this.sheared && this.onGround && Math.random() < dt / 40) {
      const bx = Math.floor(this.x), by = Math.floor(this.y - 0.1), bz = Math.floor(this.z);
      if (game.world.getBlock(bx, by, bz) === B.GRASS) { game.world.setBlock(bx, by, bz, B.DIRT); this.sheared = false; }
    }
    if (this.panic > 0) return false;
    this.stopNear = false;
    // looking for a partner
    if (this.love > 0) {
      this.love -= dt;
      if (Math.random() < dt * 3) game.particles.hearts(this.x, this.y + this.h, this.z, 1);
      let mate = null, md = 8;
      for (const e of game.entities) {
        if (e === this || !e.isMob || e.type !== this.type || e.love <= 0 || e.baby || e.dead) continue;
        const d = Math.hypot(e.x - this.x, e.z - this.z);
        if (d < md) { md = d; mate = e; }
      }
      if (mate) {
        if (md < 1.3) {
          this.love = mate.love = 0; this.breedCd = mate.breedCd = 300;
          const baby = new Mob(this.type, (this.x + mate.x) / 2, this.y, (this.z + mate.z) / 2);
          baby.setBaby(true); baby.persistent = true;
          game.entities.push(baby);
          game.particles.hearts(baby.x, baby.y + 0.5, baby.z, 6);
          game.audio.play(this.T.sound, this.x, this.y, this.z);
          return false;
        }
        this.yaw = Math.atan2(-(mate.x - this.x), -(mate.z - this.z));
        return true;
      }
    }
    // follow a player holding our food
    const held = game.player.inventory.heldId();
    if (this.T.food && this.T.food.includes(held) && dist < 9 && !game.player.dead) {
      this.yaw = Math.atan2(-dx, -dz);
      this.stopNear = dist < 2;
      return true;
    }
    return false;
  }

  render(mesh, world) {
    const sky = world.getSky(Math.floor(this.x), Math.floor(this.y + 0.5), Math.floor(this.z));
    const blk = world.getBlockLight(Math.floor(this.x), Math.floor(this.y + 0.5), Math.floor(this.z));
    let flag = this.hurtTime > 0 || this.deathTime > 0 ? 3 : 0;
    if (this.type === 'creeper' && this.fuse > 0 && Math.floor(this.fuse * 8) % 2 === 0) flag = 4;
    const swell = this.type === 'creeper' ? 1 + this.fuse * 0.08 : 1;
    const roll = this.deathTime > 0 ? Math.min(1, this.deathTime * 2.5) * Math.PI / 2 : 0;
    const model = this.type === 'sheep' && this.sheared ? 'sheep_shorn' : this.type;
    const scale = swell * (this.baby ? 0.55 : 1);
    if (scale !== 1) {
      // swelling creepers and baby animals: draw a scaled model around the feet
      drawModelScaled(mesh, model, this.x, this.y, this.z, this.yaw, this.walk, this.walkAmt, sky, blk, flag, scale, { deathRoll: roll, flap: this.flap });
    } else drawModel(mesh, model, this.x, this.y, this.z, this.yaw, this.walk, this.walkAmt, 0, sky, blk, flag, { deathRoll: roll, flap: this.flap });
  }
}

function drawModelScaled(mesh, type, x, y, z, yaw, walk, walkAmt, sky, blk, flag, s, extra) {
  const start = mesh.n;
  drawModel(mesh, type, x, y, z, yaw, walk, walkAmt, 0, sky, blk, flag, extra || {});
  const f = mesh.f;
  for (let i = start; i < mesh.n; i++) {
    const o = i * 6;
    f[o] = x + (f[o] - x) * s; f[o + 1] = y + (f[o + 1] - y) * s; f[o + 2] = z + (f[o + 2] - z) * s;
  }
}

// ---- Dropped item --------------------------------------------------------------
class ItemDrop extends Entity {
  constructor(id, count, x, y, z, extra) {
    super(x, y, z, 0.25, 0.25);
    this.id = id; this.count = count; this.extra = extra || null;
    this.vx = (Math.random() - 0.5) * 3; this.vz = (Math.random() - 0.5) * 3; this.vy = 4;
    this.pickupDelay = 0.6; this.spin = Math.random() * 6;
  }
  update(dt, game) {
    this.age += dt;
    if (this.pickupDelay > 0) this.pickupDelay -= dt;
    this.physics(dt, game.world);
    if (this.inWater) this.vy += 22 * dt;
    if (this.age > 300) this.dead = true;
    const p = game.player;
    if (!p.dead && this.pickupDelay <= 0) {
      const dx = p.x - this.x, dy = (p.y + 0.8) - this.y, dz = p.z - this.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 1.6) {
        const left = p.inventory.add(this.id, this.count, this.extra);
        if (left < this.count) { game.audio.play('pop'); }
        if (left <= 0) { this.dead = true; } else this.count = left;
      } else if (d < 2.8) {
        // magnet
        this.vx += dx / d * 18 * dt; this.vz += dz / d * 18 * dt; this.vy += dy / d * 18 * dt;
      }
    }
    // merge with nearby same-item drops
  }
  render(mesh, world, cam) {
    const sky = world.getSky(Math.floor(this.x), Math.floor(this.y + 0.2), Math.floor(this.z));
    const blk = world.getBlockLight(Math.floor(this.x), Math.floor(this.y + 0.2), Math.floor(this.z));
    const bob = Math.sin(this.age * 2.5) * 0.06 + 0.12;
    const rot = this.spin + this.age * 1.6;
    const copies = this.count > 16 ? 3 : this.count > 1 ? 2 : 1;
    for (let c = 0; c < copies; c++) {
      const ox = c * 0.07, oy = c * 0.06, oz = c * 0.05;
      drawItemModel(mesh, this.id, this.x + ox, this.y + bob + oy, this.z + oz, rot, 0.25, sky, blk);
    }
  }
}

// Draws an item in the world: blocks as mini cubes, items as thin sprites
function drawItemModel(mesh, id, x, y, z, rot, size, sky, blk, flag = 0) {
  Mat4.identity(_m);
  Mat4.translate(_m, _m, x, y, z);
  Mat4.rotateY(_m, _m, rot);
  if (id < 256 && (RENDER[id] === RT_CUBE || RENDER[id] === RT_CACTUS || RENDER[id] === RT_LIQUID)) {
    Mat4.translate(_m, _m, -size / 2, 0, -size / 2);
    Mat4.scale(_m, _m, size, size, size);
    const t = [];
    for (let f = 0; f < 6; f++) t.push(FACE_TEX[id * 6 + f]);
    if (BLOCKS[id].facing) t[4] = FRONT_TEX[id];
    mesh.box(_m, t, sky, blk, flag);
  } else {
    const tile = itemTile(id);
    const s = size * 1.6;
    Mat4.translate(_m, _m, -s / 2, 0, 0);
    Mat4.scale(_m, _m, s, s, s);
    const p = (a, b) => { const o = [0, 0, 0]; Mat4.transformPoint(_m, a, b, 0, o); return o; };
    mesh.quad(p(0, 0), p(1, 0), p(1, 1), p(0, 1), tile, null, sky, blk, 1, flag);
  }
}

// ---- Primed TNT ---------------------------------------------------------------
class PrimedTNT extends Entity {
  constructor(x, y, z, fuse = 4) {
    super(x, y, z, 0.98, 0.98);
    this.fuse = fuse; this.vy = 3; this.vx = (Math.random() - 0.5); this.vz = (Math.random() - 0.5);
  }
  update(dt, game) {
    this.fuse -= dt;
    this.physics(dt, game.world);
    if (Math.random() < dt * 20) game.particles.smoke(this.x, this.y + 1.1, this.z, 1, 0.3);
    if (this.fuse <= 0) { this.dead = true; game.explode(this.x, this.y + 0.5, this.z, 4, this); }
  }
  render(mesh, world) {
    const sky = world.getSky(Math.floor(this.x), Math.floor(this.y + 0.5), Math.floor(this.z));
    const blk = world.getBlockLight(Math.floor(this.x), Math.floor(this.y + 0.5), Math.floor(this.z));
    const flash = Math.floor(this.fuse * 5) % 2 === 0 ? 4 : 0;
    const s = 1 + (this.fuse < 0.6 ? (0.6 - this.fuse) * 0.3 : 0);
    Mat4.identity(_m);
    Mat4.translate(_m, _m, this.x - 0.5 * s, this.y, this.z - 0.5 * s);
    Mat4.scale(_m, _m, s, s, s);
    const t = []; for (let f = 0; f < 6; f++) t.push(FACE_TEX[B.TNT * 6 + f]);
    mesh.box(_m, t, sky, blk, flash);
  }
}

// ---- Particles -----------------------------------------------------------------
class ParticleSystem {
  constructor() { this.list = []; }
  blockBreak(x, y, z, id) {
    if (!BLOCKS[id] || id === B.AIR) return;
    const tile = FACE_TEX[id * 6 + 4];
    for (let i = 0; i < 24; i++) {
      const u = Math.floor(Math.random() * 12), v = Math.floor(Math.random() * 12);
      this.list.push({ x: x + Math.random(), y: y + Math.random(), z: z + Math.random(), vx: (Math.random() - 0.5) * 4, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 4, life: 0.6 + Math.random() * 0.6, tile, rect: [u, v, u + 4, v + 4], size: 0.12, grav: 1 });
    }
  }
  blockHit(x, y, z, nx, ny, nz, id) {
    if (!BLOCKS[id]) return;
    const tile = FACE_TEX[id * 6 + 4];
    const u = Math.floor(Math.random() * 12), v = Math.floor(Math.random() * 12);
    this.list.push({ x: x + 0.5 + nx * 0.55 + (Math.random() - 0.5) * 0.8 * (1 - Math.abs(nx)), y: y + 0.5 + ny * 0.55 + (Math.random() - 0.5) * 0.8 * (1 - Math.abs(ny)), z: z + 0.5 + nz * 0.55 + (Math.random() - 0.5) * 0.8 * (1 - Math.abs(nz)), vx: nx * 1.5, vy: 1.5, vz: nz * 1.5, life: 0.4, tile, rect: [u, v, u + 4, v + 4], size: 0.1, grav: 1 });
  }
  smoke(x, y, z, n, spread = 0.6) {
    const tile = tileIndex('smoke');
    for (let i = 0; i < n; i++) this.list.push({ x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread, z: z + (Math.random() - 0.5) * spread, vx: (Math.random() - 0.5), vy: 0.8 + Math.random(), vz: (Math.random() - 0.5), life: 0.8 + Math.random() * 0.8, tile, rect: null, size: 0.35 + Math.random() * 0.3, grav: -0.05, bright: true });
  }
  explosion(x, y, z, r) {
    const tile = tileIndex('smoke');
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, s = Math.random() * 8;
      this.list.push({ x, y, z, vx: Math.cos(a) * Math.cos(b) * s, vy: Math.sin(b) * s + 2, vz: Math.sin(a) * Math.cos(b) * s, life: 0.6 + Math.random() * 1.0, tile, rect: null, size: 0.6 + Math.random() * 0.8, grav: -0.1, drag: 3, bright: true });
    }
  }
  flame(x, y, z) {
    const tile = tileIndex('torch');
    this.list.push({ x: x + (Math.random() - 0.5) * 0.5, y, z: z + (Math.random() - 0.5) * 0.5, vx: 0, vy: 1, vz: 0, life: 0.4, tile, rect: [7, 5, 9, 8], size: 0.15, grav: -0.2, bright: true });
  }
  hearts(x, y, z, n) {
    const tile = tileIndex('heart');
    for (let i = 0; i < n; i++) this.list.push({ x: x + (Math.random() - 0.5) * 0.8, y: y + Math.random() * 0.3, z: z + (Math.random() - 0.5) * 0.8, vx: 0, vy: 0.8, vz: 0, life: 1, tile, rect: [2, 5, 9, 11], size: 0.16, grav: -0.02, bright: true });
  }
  sparkle(x, y, z, n) {
    const tile = tileIndex('sparkle');
    for (let i = 0; i < n; i++) this.list.push({ x: x + Math.random(), y: y + Math.random() * 0.8, z: z + Math.random(), vx: 0, vy: 0.4, vz: 0, life: 0.8 + Math.random() * 0.6, tile, rect: null, size: 0.1, grav: -0.02, bright: true });
  }
  bubble(x, y, z) {
    const tile = tileIndex('white');
    this.list.push({ x, y, z, vx: (Math.random() - 0.5) * 0.3, vy: 1.5, vz: (Math.random() - 0.5) * 0.3, life: 0.6, tile, rect: [0, 0, 4, 4], size: 0.06, grav: -0.5 });
  }
  update(dt, world) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.vy -= GRAVITY * 0.6 * p.grav * dt;
      if (p.drag) { const f = Math.pow(1 / (1 + p.drag), dt * 3); p.vx *= f; p.vy *= f; p.vz *= f; }
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (p.grav > 0 && isSolidAt(world, Math.floor(nx), Math.floor(ny), Math.floor(nz))) { p.vx *= 0.3; p.vz *= 0.3; p.vy = 0; }
      else { p.x = nx; p.y = ny; p.z = nz; }
    }
    if (L.length > 2000) L.splice(0, L.length - 2000);
  }
  render(mesh, world, cam) {
    // billboard axes
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const rx = cy, rz = -sy;               // right vector
    const ux = -sy * -sp, uy = cp, uz = -cy * -sp; // up vector
    for (const p of this.list) {
      const s = p.size;
      const sky = p.bright ? 15 : world.getSky(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
      const blk = p.bright ? 15 : world.getBlockLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
      const ax = rx * s, az = rz * s, bx = ux * s, by = uy * s, bz = uz * s;
      mesh.quad([p.x - ax - bx, p.y - by, p.z - az - bz], [p.x + ax - bx, p.y - by, p.z + az - bz], [p.x + ax + bx, p.y + by, p.z + az + bz], [p.x - ax + bx, p.y + by, p.z - az + bz], p.tile, p.rect, sky, blk, 1, 0);
    }
  }
}
