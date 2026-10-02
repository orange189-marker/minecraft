'use strict';
// ---------------------------------------------------------------------------
// Player: movement, flying, swimming, survival stats
// ---------------------------------------------------------------------------

class Player extends Entity {
  constructor() {
    super(0, 80, 0, 0.6, 1.8);
    this.pitch = 0;
    this.mode = 'survival';
    this.flying = false;
    this.health = 20; this.food = 20; this.saturation = 5; this.exhaustion = 0;
    this.air = 15; this.maxAir = 15;
    this.fallDist = 0; this.invuln = 0; this.hurtTime = 0; this.burn = 0;
    this.regenTimer = 0; this.starveTimer = 0; this.drownTimer = 0; this.lavaTimer = 0;
    this.inventory = new Inventory();
    this.sneaking = false; this.sprinting = false;
    this.bob = 0; this.bobAmt = 0; this.stepDist = 0;
    this.eyeOffset = 1.62;
    this.swing = 0; this.lastJumpPress = 0;
    this.spawn = { x: 0, y: 80, z: 0 };
    this.headInWater = false;
  }

  get eyeY() { return this.y + this.eyeOffset; }

  lookDir() {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  update(dt, input, game) {
    const world = game.world;
    if (this.dead) return;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtTime > 0) this.hurtTime -= dt;
    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt * 3.5);
    const creative = this.mode === 'creative';
    if (!creative) this.flying = false;

    this.sneaking = input.sneak && !this.flying;
    // sprint
    if (input.sprint && input.forward && !this.sneaking && (this.food > 6 || creative)) this.sprinting = true;
    if (!input.forward || this.collidedH || this.sneaking || (this.food <= 6 && !creative)) this.sprinting = false;

    const targetEye = this.sneaking ? 1.32 : 1.62;
    this.eyeOffset += (targetEye - this.eyeOffset) * Math.min(1, dt * 14);

    // wish direction
    let fx = 0, fz = 0;
    if (input.forward) fz -= 1; if (input.back) fz += 1;
    if (input.left) fx -= 1; if (input.right) fx += 1;
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    let wx = fx * cy + fz * sy, wz = -fx * sy + fz * cy;

    this.inWater = aabbTouches(world, this, B.WATER, 0, 0.5);
    this.inLava = aabbTouches(world, this, B.LAVA, 0, 0.5);
    const eyeBlock = world.getBlock(Math.floor(this.x), Math.floor(this.eyeY), Math.floor(this.z));
    this.headInWater = eyeBlock === B.WATER;

    let speed;
    if (this.flying) speed = this.sprinting ? 21 : 10.9;
    else if (this.inWater || this.inLava) speed = this.inLava ? 1.2 : 2.6;
    else if (this.sneaking) speed = 1.31;
    else if (this.sprinting) speed = 5.6;
    else speed = 4.317;

    const groundBlock = world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.05), Math.floor(this.z));
    const slippery = groundBlock === B.ICE;

    if (this.flying) {
      const k = Math.min(1, dt * 8);
      this.vx += (wx * speed - this.vx) * k; this.vz += (wz * speed - this.vz) * k;
      const vyT = (input.jump ? 7.5 : 0) - (input.sneak ? 7.5 : 0);
      this.vy += (vyT - this.vy) * k;
    } else {
      let control = this.onGround ? (slippery ? 1.2 : 14) : 2.8;
      if (this.inWater || this.inLava) control = 6;
      this.vx += (wx * speed - this.vx) * Math.min(1, control * dt);
      this.vz += (wz * speed - this.vz) * Math.min(1, control * dt);
      if (this.inWater || this.inLava) {
        this.vy -= GRAVITY * 0.15 * dt;
        this.vy *= Math.pow(0.15, dt);
        if (input.jump) this.vy = Math.min(this.vy + 28 * dt, 3.2);
        if (input.jump && this.collidedH) this.vy = 4.5;
      } else {
        this.vy -= GRAVITY * dt;
        if (this.vy < -60) this.vy = -60;
        if (input.jump && this.onGround) {
          this.vy = 8.6;
          if (this.sprinting) { this.vx += -sy * 2.2; this.vz += -cy * 2.2; this.exhaustion += 0.2; } else this.exhaustion += 0.05;
        }
      }
    }

    let dx = this.vx * dt, dy = this.vy * dt, dz = this.vz * dt;
    // sneak edge protection
    if (this.sneaking && this.onGround) {
      const hw = this.w / 2;
      const supported = (px, pz) => aabbIntersectsSolid(world, px - hw, this.y - 0.6, pz - hw, px + hw, this.y - 0.01, pz + hw);
      if (dx !== 0 && !supported(this.x + dx, this.z)) { dx = 0; this.vx = 0; }
      if (dz !== 0 && !supported(this.x, this.z + dz)) { dz = 0; this.vz = 0; }
      if (dx !== 0 && dz !== 0 && !supported(this.x + dx, this.z + dz)) { dx = 0; dz = 0; }
    }
    const ox = this.x, oz = this.z, oy = this.y;
    const r = moveWithCollision(world, this, dx, dy, dz);
    this.onGround = r.y && this.vy < 0;
    if (r.y) { if (this.flying && this.vy < 0 && this.onGround) this.flying = false; this.vy = 0; }
    if (r.x) this.vx = 0;
    if (r.z) this.vz = 0;
    this.collidedH = r.x || r.z;

    // fall damage
    if (!this.onGround && this.vy < 0 && !this.inWater && !this.flying) this.fallDist += -(this.y - oy);
    if (this.inWater || this.flying) this.fallDist = 0;
    if (this.onGround) {
      if (this.fallDist > 3.4 && !creative) {
        const dmg = Math.floor(this.fallDist - 3);
        this.damage(dmg, game, 'fall');
        game.audio.playDig(groundBlock, Math.floor(this.x), Math.floor(this.y - 1), Math.floor(this.z), 1);
      }
      this.fallDist = 0;
    }

    // walking effects
    const moved = Math.hypot(this.x - ox, this.z - oz);
    if (this.onGround) {
      this.stepDist += moved;
      if (this.stepDist > 1.7) {
        this.stepDist = 0;
        const gb = world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z));
        if (gb !== B.AIR) game.audio.playStep(gb, this.x, this.y, this.z);
      }
    }
    if (this.inWater && moved > 0.01 && Math.random() < dt * 2) game.audio.play('splashSmall', this.x, this.y, this.z, 0.4);
    const bobTarget = this.onGround && moved > 0.001 ? Math.min(1, moved / dt / 4.3) : 0;
    this.bobAmt += (bobTarget - this.bobAmt) * Math.min(1, dt * 10);
    this.bob += moved * 2.2;
    if (this.sprinting) this.exhaustion += moved * 0.1;

    this.survivalTick(dt, game);
  }

  survivalTick(dt, game) {
    const world = game.world;
    if (this.mode === 'creative') { this.health = 20; this.food = 20; this.air = this.maxAir; this.burn = 0; return; }
    // hunger
    while (this.exhaustion >= 4) { this.exhaustion -= 4; if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1); else this.food = Math.max(0, this.food - 1); }
    this.exhaustion += dt * 0.012;
    if (this.food >= 18 && this.health < 20) {
      this.regenTimer += dt;
      if (this.regenTimer > 3.5) { this.regenTimer = 0; this.health = Math.min(20, this.health + 1); this.exhaustion += 3; }
    } else this.regenTimer = 0;
    if (this.food <= 0) { this.starveTimer += dt; if (this.starveTimer > 4) { this.starveTimer = 0; if (this.health > 1) this.damage(1, game, 'starve'); } }
    // drowning
    if (this.headInWater) {
      this.air -= dt;
      if (Math.random() < dt * 3) game.particles.bubble(this.x, this.eyeY, this.z);
      if (this.air <= 0) { this.drownTimer += dt; if (this.drownTimer > 1) { this.drownTimer = 0; this.damage(2, game, 'drown'); } }
    } else { this.air = Math.min(this.maxAir, this.air + dt * 5); this.drownTimer = 0; }
    // lava & fire
    if (this.inLava) { this.burn = 8; this.lavaTimer += dt; if (this.lavaTimer > 0.5) { this.lavaTimer = 0; this.damage(4, game, 'lava'); } }
    if (this.inWater) this.burn = 0;
    if (this.burn > 0 && !this.inLava) {
      this.burn -= dt;
      this.lavaTimer += dt;
      if (this.lavaTimer > 1) { this.lavaTimer = 0; this.damage(1, game, 'fire'); }
    }
    // cactus
    const hw = this.w / 2 + 0.05;
    const ys = [Math.floor(this.y + 0.1), Math.floor(this.y + 1)];
    let cactus = false;
    for (const y of ys) for (const [ax, az] of [[-hw, 0], [hw, 0], [0, -hw], [0, hw]]) if (world.getBlock(Math.floor(this.x + ax), y, Math.floor(this.z + az)) === B.CACTUS) cactus = true;
    if (cactus) this.damage(1, game, 'cactus');
    if (this.y < -20) this.damage(4, game, 'void');
  }

  damage(amount, game, cause, srcX, srcZ) {
    if (this.mode === 'creative' || this.dead) return false;
    if (this.invuln > 0) return false;
    this.health -= amount;
    this.invuln = 0.5; this.hurtTime = 0.4;
    this.exhaustion += 0.1;
    if (srcX !== undefined) {
      const dx = this.x - srcX, dz = this.z - srcZ, d = Math.hypot(dx, dz) || 1;
      this.vx += dx / d * 6; this.vz += dz / d * 6; this.vy = Math.max(this.vy, 5);
    }
    game.audio.play('hurt');
    game.ui.flashDamage();
    if (this.health <= 0) { this.health = 0; this.die(game, cause); }
    return true;
  }

  die(game, cause) {
    this.dead = true;
    // drop all items
    for (let i = 0; i < 36; i++) {
      const s = this.inventory.slots[i];
      if (s) { game.spawnDrop(s.id, s.count, this.x, this.y + 1, this.z, s.dmg ? { dmg: s.dmg } : null, true); this.inventory.slots[i] = null; }
    }
    this.inventory.changed();
    const msgs = { fall: 'You fell from a high place', zombie: 'You were slain by a Zombie', creeper: 'You were blown up by a Creeper', explosion: 'You blew up', lava: 'You tried to swim in lava', fire: 'You burned to death', drown: 'You drowned', starve: 'You starved to death', cactus: 'You were pricked to death', void: 'You fell out of the world' };
    game.ui.showDeath(msgs[cause] || 'You died');
  }

  respawn(game) {
    this.dead = false;
    this.health = 20; this.food = 20; this.saturation = 5; this.air = this.maxAir; this.burn = 0; this.fallDist = 0;
    this.vx = this.vy = this.vz = 0;
    this.x = this.spawn.x; this.y = this.spawn.y; this.z = this.spawn.z;
    this.hurtTime = 0; this.invuln = 1;
    game.state = 'loading';
    game.needsSafePlacement = true;
    game.loadStart = performance.now();
    game.ui.showLoading('Respawning...', 0);
  }

  eat(food) {
    this.food = Math.min(20, this.food + food);
    this.saturation = Math.min(this.food, this.saturation + food * 0.6);
  }

  serialize() {
    return { x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, health: this.health, food: this.food, saturation: this.saturation, mode: this.mode, flying: this.flying, inv: this.inventory.serialize(), spawn: this.spawn };
  }
  load(d) {
    Object.assign(this, { x: d.x, y: d.y, z: d.z, yaw: d.yaw, pitch: d.pitch, health: d.health, food: d.food, saturation: d.saturation || 5, mode: d.mode, flying: !!d.flying, spawn: d.spawn || this.spawn });
    this.inventory.load(d.inv);
  }
}
