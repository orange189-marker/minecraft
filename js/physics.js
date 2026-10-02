'use strict';
// ---------------------------------------------------------------------------
// AABB vs voxel collision shared by the player and all entities
// ---------------------------------------------------------------------------

const EPS = 1e-4;

function isSolidAt(world, x, y, z) { return SOLID[world.getBlock(x, y, z)] === 1; }

// Moves the entity (x,y,z = feet centre, w = width, h = height) by d, resolving
// collisions axis by axis. Returns flags for axes that were blocked.
function moveWithCollision(world, e, dx, dy, dz) {
  const hw = e.w / 2;
  let minX = e.x - hw, maxX = e.x + hw, minY = e.y, maxY = e.y + e.h, minZ = e.z - hw, maxZ = e.z + hw;
  const res = { x: false, y: false, z: false };

  // Y axis
  if (dy !== 0) {
    const y0 = Math.floor(Math.min(minY, minY + dy)), y1 = Math.floor(Math.max(maxY, maxY + dy) - EPS);
    const x0 = Math.floor(minX + EPS), x1 = Math.floor(maxX - EPS), z0 = Math.floor(minZ + EPS), z1 = Math.floor(maxZ - EPS);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const id = world.getBlock(x, y, z);
      if (!SOLID[id]) continue;
      const top = y + BLOCK_TOP[id];
      if (dy > 0 && y >= maxY - EPS) { const lim = y - maxY; if (lim < dy) { dy = lim; res.y = true; } }
      else if (dy < 0 && top <= minY + EPS) { const lim = top - minY; if (lim > dy) { dy = lim; res.y = true; } }
    }
    minY += dy; maxY += dy;
  }
  // X axis
  if (dx !== 0) {
    const x0 = Math.floor(Math.min(minX, minX + dx)), x1 = Math.floor(Math.max(maxX, maxX + dx) - EPS);
    const y0 = Math.floor(minY + EPS), y1 = Math.floor(maxY - EPS), z0 = Math.floor(minZ + EPS), z1 = Math.floor(maxZ - EPS);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const id = world.getBlock(x, y, z);
      if (!SOLID[id] || minY >= y + BLOCK_TOP[id] - EPS) continue;
      if (dx > 0 && x >= maxX - EPS) { const lim = x - maxX; if (lim < dx) { dx = lim; res.x = true; } }
      else if (dx < 0 && x + 1 <= minX + EPS) { const lim = x + 1 - minX; if (lim > dx) { dx = lim; res.x = true; } }
    }
    minX += dx; maxX += dx;
  }
  // Z axis
  if (dz !== 0) {
    const z0 = Math.floor(Math.min(minZ, minZ + dz)), z1 = Math.floor(Math.max(maxZ, maxZ + dz) - EPS);
    const y0 = Math.floor(minY + EPS), y1 = Math.floor(maxY - EPS), x0 = Math.floor(minX + EPS), x1 = Math.floor(maxX - EPS);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const id = world.getBlock(x, y, z);
      if (!SOLID[id] || minY >= y + BLOCK_TOP[id] - EPS) continue;
      if (dz > 0 && z >= maxZ - EPS) { const lim = z - maxZ; if (lim < dz) { dz = lim; res.z = true; } }
      else if (dz < 0 && z + 1 <= minZ + EPS) { const lim = z + 1 - minZ; if (lim > dz) { dz = lim; res.z = true; } }
    }
    minZ += dz; maxZ += dz;
  }
  e.x = (minX + maxX) / 2; e.y = minY; e.z = (minZ + maxZ) / 2;
  res.dx = dx; res.dy = dy; res.dz = dz;
  return res;
}

function aabbIntersectsSolid(world, x0, y0, z0, x1, y1, z1) {
  for (let y = Math.floor(y0); y <= Math.floor(y1 - EPS); y++)
    for (let z = Math.floor(z0); z <= Math.floor(z1 - EPS); z++)
      for (let x = Math.floor(x0); x <= Math.floor(x1 - EPS); x++)
        if (isSolidAt(world, x, y, z)) return true;
  return false;
}

// Is any part of the box inside the given block type?
function aabbTouches(world, e, id, yFrom = 0, yTo = 1) {
  const hw = e.w / 2;
  for (let y = Math.floor(e.y + e.h * yFrom); y <= Math.floor(e.y + e.h * yTo - EPS); y++)
    for (let z = Math.floor(e.z - hw); z <= Math.floor(e.z + hw - EPS); z++)
      for (let x = Math.floor(e.x - hw); x <= Math.floor(e.x + hw - EPS); x++)
        if (world.getBlock(x, y, z) === id) return true;
  return false;
}

// DDA voxel ray cast. Returns {x,y,z, face, nx,ny,nz, dist} or null
function raycastBlocks(world, ox, oy, oz, dx, dy, dz, maxDist, pickLiquid = false) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
  let tmx = dx === 0 ? Infinity : (dx > 0 ? (x + 1 - ox) : (ox - x)) * tdx;
  let tmy = dy === 0 ? Infinity : (dy > 0 ? (y + 1 - oy) : (oy - y)) * tdy;
  let tmz = dz === 0 ? Infinity : (dz > 0 ? (z + 1 - oz) : (oz - z)) * tdz;
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let i = 0; i < 256 && t <= maxDist; i++) {
    const id = world.getBlock(x, y, z);
    if (id !== B.AIR && (pickLiquid ? true : RENDER[id] !== RT_LIQUID)) {
      if (RENDER[id] === RT_CROSS || RENDER[id] === RT_TORCH) {
        // small hitbox for plants/torches
        const hb = id === B.TORCH ? [0.35, 0, 0.35, 0.65, 0.65, 0.65] : [0.15, 0, 0.15, 0.85, 0.8, 0.85];
        if (rayBox(ox, oy, oz, dx, dy, dz, x + hb[0], y + hb[1], z + hb[2], x + hb[3], y + hb[4], z + hb[5]) !== null || id === B.TORCH)
          return { x, y, z, nx, ny, nz, dist: t, id };
      } else return { x, y, z, nx, ny, nz, dist: t, id };
    }
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
  return null;
}

// Ray vs AABB slab test, returns distance or null
function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) return null; continue; }
    let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return Math.max(0, tmin);
}
