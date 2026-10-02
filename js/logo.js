'use strict';
// ---------------------------------------------------------------------------
// Title logo: chunky stone block letters, extruded in 3D, with grass growing
// along their tops. Painted on a canvas from the texture atlas.
// ---------------------------------------------------------------------------

const LOGO_FONT = {
  B: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X...X', 'X...X', 'XXXX.'],
  L: ['X....', 'X....', 'X....', 'X....', 'X....', 'X....', 'XXXXX'],
  O: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  C: ['.XXXX', 'X....', 'X....', 'X....', 'X....', 'X....', '.XXXX'],
  K: ['X...X', 'X..X.', 'X.X..', 'XX...', 'X.X..', 'X..X.', 'X...X'],
  H: ['X...X', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  A: ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  V: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.X.X.', '..X..'],
  E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
  N: ['X...X', 'XX..X', 'XX..X', 'X.X.X', 'X..XX', 'X..XX', 'X...X'],
};

function renderLogo(text = 'BLOCKHAVEN') {
  const CELL = 5;          // texels per letter cell
  const TX = 3;            // screen pixels per texel
  const DEPTH = 4;         // extrusion depth in texels
  const PAD = 2;
  const rowsN = 7;
  // build the front-face mask in texels
  const letters = text.split('').map((ch) => LOGO_FONT[ch]);
  const cellsW = letters.reduce((a, l) => a + l[0].length + 1, -1);
  const W = cellsW * CELL + DEPTH + PAD * 2 + 2, H = rowsN * CELL + DEPTH + PAD * 2 + 2;
  const front = new Uint8Array(W * H);
  const cellAt = new Int16Array(W * H).fill(-1); // letter row index for shading
  let cx = 0;
  for (const l of letters) {
    for (let r = 0; r < rowsN; r++) for (let c = 0; c < l[r].length; c++) {
      if (l[r][c] !== 'X') continue;
      for (let ty = 0; ty < CELL; ty++) for (let tx = 0; tx < CELL; tx++) {
        const x = PAD + 1 + (cx + c) * CELL + tx, y = PAD + 1 + r * CELL + ty;
        front[y * W + x] = 1; cellAt[y * W + x] = r;
      }
    }
    cx += l[0].length + 1;
  }
  const isF = (x, y) => x >= 0 && y >= 0 && x < W && y < H && front[y * W + x] === 1;
  // extrusion: front shifted down (and slightly right) for each depth step
  const ext = new Float32Array(W * H).fill(-1);
  for (let k = DEPTH; k >= 1; k--) {
    const ox = Math.round(k * 0.25), oy = k;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isF(x - ox, y - oy) && !isF(x, y)) ext[y * W + x] = k;
  }
  const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (front[y * W + x] || ext[y * W + x] > 0);

  const cv = document.createElement('canvas');
  cv.width = W * TX; cv.height = H * TX;
  const g = cv.getContext('2d');
  const stone = Atlas.pixels.stone, cobble = Atlas.pixels.cobblestone;
  const tex = (src, x, y) => { const i = ((y & 15) * 16 + (x & 15)) * 4; return [src[i], src[i + 1], src[i + 2]]; };
  // pull texture towards its average so letters read cleanly
  const smooth = (c, amt) => { const m = (c[0] + c[1] + c[2]) / 3; return [m + (c[0] - m) * amt + (128 - m) * (1 - amt), m + (c[1] - m) * amt + (128 - m) * (1 - amt), m + (c[2] - m) * amt + (128 - m) * (1 - amt)]; };
  const put = (x, y, c, a = 1) => { g.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; g.fillRect(x * TX, y * TX, TX, TX); };

  // 1) black outline around the whole silhouette
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (solid(x, y)) continue;
    let n = false;
    for (let dy = -1; dy <= 1 && !n; dy++) for (let dx = -1; dx <= 1; dx++) if (solid(x + dx, y + dy)) { n = true; break; }
    if (n) put(x, y, [8, 8, 10], 0.9);
  }
  // 2) extruded sides: darker cobblestone fading with depth
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = ext[y * W + x];
    if (k <= 0) continue;
    const c = smooth(tex(cobble, x, y), 0.5), f = 0.4 - (k / DEPTH) * 0.16;
    put(x, y, [c[0] * f, c[1] * f, c[2] * f * 1.05]);
  }
  // 3) front faces: stone texture, lit from the top, bevelled edges, grass on top
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isF(x, y)) continue;
    const row = cellAt[y * W + x];
    const c = smooth(tex(stone, x, y), 0.55);
    let f = 1.38 - row / rowsN * 0.45;
    if (!isF(x, y - 1) || !isF(x - 1, y)) f *= 1.25;        // highlight top/left edges
    else if (!isF(x + 1, y) || !isF(x, y + 1)) f *= 0.68;   // shade bottom/right edges
    put(x, y, [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f * 1.03)]);
  }
  // 4) grass growing on every exposed top edge, with little drips
  for (let x = 0; x < W; x++) for (let y = 1; y < H; y++) {
    if (!isF(x, y) || isF(x, y - 1)) continue;
    const h = 1 + (hash2(x, y, 7) < 0.35 ? 1 : 0) + (hash2(x, y, 8) < 0.12 ? 1 : 0);
    for (let k = 0; k < h && isF(x, y + k); k++) {
      const v = k === 0 ? 0.85 : 0.45 - k * 0.15;
      const col = pickPal(GRASS_PAL, clamp(v + (hash2(x, y + k, 9) - 0.5) * 0.25, 0, 0.99));
      put(x, y + k, col);
    }
    // blades poking above the letter
    if (hash2(x, y, 10) < 0.3 && !solid(x, y - 1)) put(x, y - 1, GRASS_PAL[3]);
  }
  return cv;
}

// Grass block favicon
function setFavicon() {
  try {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = getIcon(B.GRASS);
  } catch (e) { /* ignore */ }
}
