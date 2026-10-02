'use strict';
// ---------------------------------------------------------------------------
// Chunk mesher: face culling, smooth lighting, ambient occlusion,
// cross-shaped plants, torches, cactus and liquids.
//
// Vertex layout (8 x uint16 = 16 bytes):
//   [0..2] position * POS_SCALE (chunk local)
//   [3..4] atlas uv in pixels
//   [5]    sky*17 | (block*17 << 8)
//   [6]    shade | (flags << 8)
//   [7]    padding
// ---------------------------------------------------------------------------

const POS_SCALE = 64;
const PW = 18, PAREA = PW * PW;
const PH = WORLD_H + 2;
const PB = new Uint8Array(PAREA * PH);
const PL = new Uint8Array(PAREA * PH);
const PM = new Uint8Array(PAREA * PH);
const pidx = (x, y, z) => ((y + 1) * PW + (z + 1)) * PW + (x + 1);

const FACE_SHADE = [0.62, 0.62, 1.0, 0.5, 0.8, 0.8];
const AO_CURVE = [0.42, 0.62, 0.8, 1.0];
const FACE_NORMAL = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// Corner order per face: BL, BR, TR, TL as seen from outside
const FACE_CORNERS = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];
const CORNER_UV = [[0, 16], [16, 16], [16, 0], [0, 0]];
const NOFF = FACE_NORMAL.map(([x, y, z]) => y * PAREA + z * PW + x);
// Precompute AO neighbour offsets: [face][corner] -> [side1, side2, corner]
const AO_OFF = FACE_NORMAL.map((n, f) => FACE_CORNERS[f].map((c) => {
  const axes = [0, 1, 2].filter((a) => n[a] === 0);
  const s1 = n.slice(), s2 = n.slice(), cc = n.slice();
  s1[axes[0]] += c[axes[0]] * 2 - 1;
  s2[axes[1]] += c[axes[1]] * 2 - 1;
  cc[axes[0]] += c[axes[0]] * 2 - 1; cc[axes[1]] += c[axes[1]] * 2 - 1;
  const o = (v) => v[1] * PAREA + v[2] * PW + v[0];
  return [o(s1), o(s2), o(cc)];
}));

const FACING_TABLE = new Uint8Array(256);

class MeshBuffer {
  constructor(cap) { this.data = new Uint16Array(cap * 8); this.n = 0; }
  reset() { this.n = 0; }
  ensure(extra) {
    if ((this.n + extra) * 8 > this.data.length) {
      const nd = new Uint16Array(this.data.length * 2);
      nd.set(this.data); this.data = nd;
    }
  }
  vert(x, y, z, u, v, sky, blk, shade, flags) {
    const d = this.data, o = this.n * 8;
    d[o] = x * POS_SCALE + 0.5; d[o + 1] = y * POS_SCALE + 0.5; d[o + 2] = z * POS_SCALE + 0.5;
    d[o + 3] = u; d[o + 4] = v;
    d[o + 5] = (sky * 17) | ((blk * 17) << 8);
    d[o + 6] = (shade * 255) | (flags << 8);
    this.n++;
  }
  slice() { return this.data.slice(0, this.n * 8); }
}

const MESH_OPAQUE = new MeshBuffer(65536);
const MESH_TRANS = new MeshBuffer(16384);

function fillPadded(world, chunk) {
  const cx = chunk.cx, cz = chunk.cz;
  PB.fill(0); PL.fill(0); PM.fill(0);
  // bottom layer = bedrock; top layer = air w/ full sky
  for (let i = 0; i < PAREA; i++) { PB[i] = B.BEDROCK; PL[(PH - 1) * PAREA + i] = 0xF0; }
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const ch = world.getChunk(cx + dx, cz + dz);
    if (!ch) continue;
    const lx0 = dx === -1 ? 15 : 0, lx1 = dx === 1 ? 0 : 15;
    const lz0 = dz === -1 ? 15 : 0, lz1 = dz === 1 ? 0 : 15;
    const bl = ch.blocks, li = ch.light, me = ch.meta;
    for (let y = 0; y < WORLD_H; y++) for (let lz = lz0; lz <= lz1; lz++) {
      const src = (y * 16 + lz) * 16;
      const pz = lz + dz * 16, px0 = dx * 16;
      const dst = ((y + 1) * PW + (pz + 1)) * PW + 1 + px0;
      for (let lx = lx0; lx <= lx1; lx++) { PB[dst + lx] = bl[src + lx]; PL[dst + lx] = li[src + lx]; PM[dst + lx] = me[src + lx]; }
    }
  }
}

function buildChunkMesh(world, chunk) {
  if (!FACING_TABLE[B.FURNACE]) for (let i = 0; i < 256; i++) FACING_TABLE[i] = BLOCKS[i] && BLOCKS[i].facing ? 1 : 0;
  ChunkMeshCtx.cx = chunk.cx; ChunkMeshCtx.cz = chunk.cz;
  fillPadded(world, chunk);
  const op = MESH_OPAQUE, tr = MESH_TRANS;
  op.reset(); tr.reset();
  const bl = chunk.blocks;
  let maxY = WORLD_H - 1;
  outer: for (; maxY >= 0; maxY--) { const o = maxY * 256; for (let i = 0; i < 256; i++) if (bl[o + i]) break outer; }
  chunk.maxY = maxY;

  for (let y = 0; y <= maxY; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const i = pidx(x, y, z);
    const b = PB[i];
    if (b === 0) continue;
    const rt = RENDER[b];
    if (rt === RT_CUBE) cubeBlock(op, tr, b, i, x, y, z);
    else if (rt === RT_CROSS) crossBlock(op, b, i, x, y, z);
    else if (rt === RT_LIQUID) liquidBlock(b === B.WATER ? tr : op, b, i, x, y, z);
    else if (rt === RT_TORCH) torchBlock(op, b, i, x, y, z);
    else if (rt === RT_CACTUS) cactusBlock(op, b, i, x, y, z);
    else if (rt === RT_BED) bedBlock(op, b, i, x, y, z);
  }
  return { opaque: op.slice(), trans: tr.slice(), nOpaque: op.n, nTrans: tr.n };
}

function cubeBlock(op, tr, b, i, x, y, z) {
  const out = TRANS[b] ? tr : op;
  const cullSame = CULLSAME[b];
  const facing = FACING_TABLE[b] ? FACING_FACE[PM[i] & 3] : -1;
  const ao = [0, 0, 0, 0], sk = [0, 0, 0, 0], bk = [0, 0, 0, 0];
  for (let f = 0; f < 6; f++) {
    const ni = i + NOFF[f];
    const nb = PB[ni];
    if (OPAQUE[nb]) continue;
    if (cullSame && nb === b) continue;
    if (TRANS[b] && TRANS[nb] && nb !== B.AIR) continue;
    out.ensure(4);
    const tile = f === facing ? FRONT_TEX[b] : FACE_TEX[b * 6 + f];
    const tu = (tile % ATLAS_COLS) * 16, tv = Math.floor(tile / ATLAS_COLS) * 16;
    const offs = AO_OFF[f];
    const nl = PL[ni];
    for (let c = 0; c < 4; c++) {
      const o = offs[c];
      // offsets in AO_OFF are relative to the block itself (normal already included)
      const i1 = i + o[0], i2 = i + o[1], i3 = i + o[2];
      const s1 = OPAQUE[PB[i1]], s2 = OPAQUE[PB[i2]], s3 = OPAQUE[PB[i3]];
      ao[c] = (s1 && s2) ? 0 : 3 - (s1 + s2 + s3);
      let ss = nl >> 4, sb = nl & 15, cnt = 1;
      if (!s1) { ss += PL[i1] >> 4; sb += PL[i1] & 15; cnt++; }
      if (!s2) { ss += PL[i2] >> 4; sb += PL[i2] & 15; cnt++; }
      if (!s3 && !(s1 && s2)) { ss += PL[i3] >> 4; sb += PL[i3] & 15; cnt++; }
      sk[c] = ss / cnt; bk[c] = sb / cnt;
    }
    const corners = FACE_CORNERS[f];
    const shade = FACE_SHADE[f];
    const flip = ao[0] + ao[2] + (sk[0] + sk[2]) * 0.1 < ao[1] + ao[3] + (sk[1] + sk[3]) * 0.1;
    for (let k = 0; k < 4; k++) {
      const c = flip ? (k + 1) & 3 : k;
      const cc = corners[c];
      out.vert(x + cc[0], y + cc[1], z + cc[2], tu + CORNER_UV[c][0], tv + CORNER_UV[c][1], sk[c], bk[c], shade * AO_CURVE[ao[c]], 0);
    }
  }
}

function crossBlock(op, b, i, x, y, z) {
  const tile = FACE_TEX[b * 6];
  const tu = (tile % ATLAS_COLS) * 16, tv = Math.floor(tile / ATLAS_COLS) * 16;
  const l = PL[i], s = l >> 4, bl = l & 15;
  const wx = x + (ChunkMeshCtx.cx << 4), wz = z + (ChunkMeshCtx.cz << 4);
  const ox = (hash2(wx, wz, 11) - 0.5) * 0.3, oz = (hash2(wx, wz, 12) - 0.5) * 0.3;
  const a = 0.15 + 0.0, bb = 0.85;
  const quads = [
    [[a, 0, a], [bb, 0, bb], [bb, 1, bb], [a, 1, a]],
    [[bb, 0, bb], [a, 0, a], [a, 1, a], [bb, 1, bb]],
    [[a, 0, bb], [bb, 0, a], [bb, 1, a], [a, 1, bb]],
    [[bb, 0, a], [a, 0, bb], [a, 1, bb], [bb, 1, a]],
  ];
  op.ensure(16);
  for (const q of quads) for (let c = 0; c < 4; c++) {
    const p = q[c];
    op.vert(x + p[0] + ox, y + p[1], z + p[2] + oz, tu + CORNER_UV[c][0], tv + CORNER_UV[c][1], s, bl, 0.9, p[1] === 1 ? 1 : 0);
  }
}

const ChunkMeshCtx = { cx: 0, cz: 0 };

function torchBlock(op, b, i, x, y, z) {
  const tile = FACE_TEX[b * 6];
  const tu = (tile % ATLAS_COLS) * 16, tv = Math.floor(tile / ATLAS_COLS) * 16;
  const l = PL[i], s = l >> 4, bl = l & 15;
  const m = PM[i];
  const x0 = 7 / 16, x1 = 9 / 16, h = 10 / 16;
  const tf = (px, py, pz) => {
    let X = px, Y = py, Z = pz;
    if (m === 1) { X = px - 5 / 16 + py * 0.4; Y = py + 3 / 16; }
    else if (m === 2) { X = px + 5 / 16 - py * 0.4; Y = py + 3 / 16; }
    else if (m === 3) { Z = pz - 5 / 16 + py * 0.4; Y = py + 3 / 16; }
    else if (m === 4) { Z = pz + 5 / 16 - py * 0.4; Y = py + 3 / 16; }
    return [x + X, y + Y, z + Z];
  };
  // side faces show full 2px torch column (u 7..9, v 6..16)
  const sides = [
    [[x1, 0, x1], [x1, 0, x0], [x1, h, x0], [x1, h, x1]],
    [[x0, 0, x0], [x0, 0, x1], [x0, h, x1], [x0, h, x0]],
    [[x0, 0, x1], [x1, 0, x1], [x1, h, x1], [x0, h, x1]],
    [[x1, 0, x0], [x0, 0, x0], [x0, h, x0], [x1, h, x0]],
  ];
  const uvs = [[7, 16], [9, 16], [9, 6], [7, 6]];
  op.ensure(20);
  const shades = [0.75, 0.75, 0.9, 0.9];
  sides.forEach((q, si) => {
    for (let c = 0; c < 4; c++) { const p = tf(q[c][0], q[c][1], q[c][2]); op.vert(p[0], p[1], p[2], tu + uvs[c][0], tv + uvs[c][1], s, Math.max(bl, 14), shades[si], 0); }
  });
  const top = [[x0, h, x1], [x1, h, x1], [x1, h, x0], [x0, h, x0]];
  const tuv = [[7, 8], [9, 8], [9, 6], [7, 6]];
  for (let c = 0; c < 4; c++) { const p = tf(top[c][0], top[c][1], top[c][2]); op.vert(p[0], p[1], p[2], tu + tuv[c][0], tv + tuv[c][1], s, 15, 1, 0); }
}

function cactusBlock(op, b, i, x, y, z) {
  const l = PL[i], s = l >> 4, bl = l & 15;
  const e = 1 / 16;
  op.ensure(24);
  for (let f = 0; f < 6; f++) {
    const nb = PB[i + NOFF[f]];
    if ((f === 2 || f === 3) && (OPAQUE[nb] || nb === B.CACTUS)) continue;
    const tile = FACE_TEX[b * 6 + f];
    const tu = (tile % ATLAS_COLS) * 16, tv = Math.floor(tile / ATLAS_COLS) * 16;
    const n = FACE_NORMAL[f];
    for (let c = 0; c < 4; c++) {
      const cc = FACE_CORNERS[f][c];
      let px = cc[0], py = cc[1], pz = cc[2];
      if (n[0] === 1) px = 1 - e; else if (n[0] === -1) px = e;
      if (n[2] === 1) pz = 1 - e; else if (n[2] === -1) pz = e;
      if (f === 2 || f === 3) { px = px ? 1 - e : e; pz = pz ? 1 - e : e; }
      op.vert(x + px, y + py, z + pz, tu + CORNER_UV[c][0], tv + CORNER_UV[c][1], s, bl, FACE_SHADE[f], 0);
    }
  }
}

function bedBlock(op, b, i, x, y, z) {
  const l = PL[i], s = l >> 4, bl = l & 15;
  const h = 9 / 16;
  op.ensure(24);
  for (let f = 0; f < 6; f++) {
    if (f !== 2 && OPAQUE[PB[i + NOFF[f]]]) continue;
    const tile = FACE_TEX[b * 6 + f];
    const tu = (tile % ATLAS_COLS) * 16, tv = Math.floor(tile / ATLAS_COLS) * 16;
    for (let c = 0; c < 4; c++) {
      const cc = FACE_CORNERS[f][c];
      const py = cc[1] ? h : 0;
      let v = CORNER_UV[c][1];
      if (f !== 2 && f !== 3) v = cc[1] ? 7 : 16;
      op.vert(x + cc[0], y + py, z + cc[2], tu + CORNER_UV[c][0], tv + v, s, bl, FACE_SHADE[f], 0);
    }
  }
}

function liquidHeight(b, i) {
  if (PB[i + NOFF[2]] === b) return 1;
  const m = PM[i];
  if (m === 0 || m === 8) return 0.875;
  return Math.max(0.1, (8 - m) / 9);
}

function liquidBlock(out, b, i, x, y, z) {
  const h = liquidHeight(b, i);
  const tile = FACE_TEX[b * 6];
  const tu = (tile % ATLAS_COLS) * 16, tv = Math.floor(tile / ATLAS_COLS) * 16;
  const own = PL[i];
  for (let f = 0; f < 6; f++) {
    const ni = i + NOFF[f];
    const nb = PB[ni];
    if (nb === b) continue;
    if (f !== 2 && OPAQUE[nb]) continue;
    if (f === 2 && OPAQUE[nb] && h >= 1) continue;
    if (b === B.WATER && nb === B.ICE && f === 2) continue;
    out.ensure(4);
    const l = OPAQUE[nb] ? own : Math.max(PL[ni] >> 4, own >> 4) << 4 | Math.max(PL[ni] & 15, own & 15);
    const s = l >> 4, bl = l & 15;
    const corners = FACE_CORNERS[f];
    for (let c = 0; c < 4; c++) {
      const cc = corners[c];
      const py = cc[1] === 1 ? h : 0;
      out.vert(x + cc[0], y + py, z + cc[2], tu + CORNER_UV[c][0], tv + CORNER_UV[c][1], s, bl, FACE_SHADE[f], b === B.WATER ? 2 : 0);
    }
  }
}
