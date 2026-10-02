'use strict';
// ---------------------------------------------------------------------------
// Procedural pixel-art texture atlas. Every texture in the game is painted
// here at startup - no image files are needed.
// ---------------------------------------------------------------------------

const ATLAS_PX = 512;
const TILE_PX = 16;
const ATLAS_COLS = ATLAS_PX / TILE_PX;

const Atlas = {
  canvas: null,
  ctx: null,
  tiles: {},       // name -> index
  pixels: {},      // name -> Uint8ClampedArray (16*16*4)
  count: 0,
  animated: [],    // {name, fn(time) -> pixels}
};

class Painter {
  constructor(data, rng) { this.d = data; this.rng = rng; }
  set(x, y, c, a = 255) {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    const i = (y * 16 + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a;
  }
  get(x, y) { const i = (y * 16 + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  alpha(x, y) { return this.d[(y * 16 + x) * 4 + 3]; }
  clear() { this.d.fill(0); }
  vary(c, amt) { const f = 1 + (this.rng() - 0.5) * amt; return [c[0] * f, c[1] * f, c[2] * f]; }
  fillNoise(c, amt) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) this.set(x, y, this.vary(c, amt)); }
  rect(x0, y0, w, h, c, amt = 0) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, amt ? this.vary(c, amt) : c);
  }
  darken(x, y, f) {
    const i = (y * 16 + x) * 4;
    this.d[i] *= f; this.d[i + 1] *= f; this.d[i + 2] *= f;
  }
  border(c, amt = 0.1) {
    for (let i = 0; i < 16; i++) { this.set(i, 0, this.vary(c, amt)); this.set(i, 15, this.vary(c, amt)); this.set(0, i, this.vary(c, amt)); this.set(15, i, this.vary(c, amt)); }
  }
  // draw a pattern of strings with a palette map
  pattern(rows, pal) {
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (pal[ch]) this.set(x, y, pal[ch].length > 3 ? pal[ch] : this.vary(pal[ch], 0.08), pal[ch][3] !== undefined ? pal[ch][3] : 255);
    }
  }
}

function defTile(name, fn) {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  const p = new Painter(data, mulberry32(strHash(name)));
  fn(p, p.rng);
  const idx = Atlas.count++;
  Atlas.tiles[name] = idx;
  Atlas.pixels[name] = data;
  const img = new ImageData(data, 16, 16);
  Atlas.ctx.putImageData(img, (idx % ATLAS_COLS) * 16, Math.floor(idx / ATLAS_COLS) * 16);
  return idx;
}

function tileIndex(name) {
  const t = Atlas.tiles[name];
  if (t === undefined) throw new Error('Missing tile ' + name);
  return t;
}

// ---- Palette ---------------------------------------------------------------
const C = {
  stone: [125, 125, 125], dirt: [134, 96, 67], grass: [104, 168, 58], sand: [219, 207, 163],
  oakBark: [104, 82, 50], oakWood: [176, 143, 88], plank: [162, 130, 78], leaf: [58, 132, 34],
  water: [50, 98, 220], lava: [220, 90, 16], snow: [242, 248, 252], birchBark: [216, 214, 205],
  birchLeaf: [104, 152, 70], spruceBark: [62, 44, 24], spruceLeaf: [44, 88, 52], cactus: [72, 132, 40],
  brick: [150, 70, 54], mortar: [178, 170, 160], clay: [160, 166, 180], obsidian: [24, 16, 36],
  glow: [250, 200, 100], gravel: [130, 124, 120], handle: [118, 86, 44], handleDark: [76, 54, 26],
  wood: [162, 130, 78], stoneTool: [128, 128, 128], iron: [220, 220, 220], gold: [250, 225, 70], diamond: [80, 232, 220],
};

function oreTile(p, color, density = 1) {
  paintStone(p);
  const r = p.rng;
  const clusters = 4 + Math.floor(r() * 2);
  for (let c = 0; c < clusters * density; c++) {
    const cx = 2 + Math.floor(r() * 12), cy = 2 + Math.floor(r() * 12);
    for (let k = 0; k < 4; k++) {
      const x = cx + Math.floor(r() * 3) - 1, y = cy + Math.floor(r() * 3) - 1;
      p.set(x, y, p.vary(color, 0.25));
      if (r() < 0.4) p.set(x + 1, y, p.vary([color[0] * 0.7, color[1] * 0.7, color[2] * 0.7], 0.1));
    }
  }
}

function paintStone(p) {
  const r = p.rng;
  p.fillNoise(C.stone, 0.12);
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(r() * 16), y = Math.floor(r() * 16), len = 1 + Math.floor(r() * 3);
    for (let k = 0; k < len; k++) p.set(x + k, y, p.vary([104, 104, 104], 0.08));
  }
  for (let i = 0; i < 10; i++) p.set(Math.floor(r() * 16), Math.floor(r() * 16), p.vary([150, 150, 150], 0.05));
}

function paintDirt(p) {
  p.fillNoise(C.dirt, 0.18);
  const r = p.rng;
  for (let i = 0; i < 22; i++) p.set(Math.floor(r() * 16), Math.floor(r() * 16), p.vary(r() < 0.5 ? [100, 70, 48] : [160, 118, 84], 0.1));
}

function paintPlanks(p, c) {
  const r = p.rng;
  for (let y = 0; y < 16; y++) {
    const row = Math.floor(y / 4);
    const seam = (row % 2 === 0) ? 4 : 11;
    for (let x = 0; x < 16; x++) {
      let col = p.vary(c, 0.07);
      if (y % 4 === 3) col = [c[0] * 0.62, c[1] * 0.62, c[2] * 0.62];
      else if (x === seam) col = [c[0] * 0.72, c[1] * 0.72, c[2] * 0.72];
      else if (r() < 0.12) col = [c[0] * 0.88, c[1] * 0.88, c[2] * 0.88];
      p.set(x, y, col);
    }
  }
}

function paintBark(p, c, stripes = true) {
  const r = p.rng;
  for (let x = 0; x < 16; x++) {
    const colF = 0.85 + r() * 0.3;
    for (let y = 0; y < 16; y++) {
      let f = colF * (0.92 + r() * 0.16);
      if (stripes && (x % 4 === 1) && r() < 0.8) f *= 0.72;
      p.set(x, y, [c[0] * f, c[1] * f, c[2] * f]);
    }
  }
}

function paintLogTop(p, bark, wood) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    let c;
    if (d > 6.5) c = p.vary(bark, 0.1);
    else { const ring = Math.floor(d) % 2 === 0; c = p.vary(ring ? wood : [wood[0] * 0.82, wood[1] * 0.82, wood[2] * 0.82], 0.05); }
    p.set(x, y, c);
  }
}

function paintLeaves(p, c, holes = 0.22) {
  const r = p.rng;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (r() < holes) { p.set(x, y, [0, 0, 0], 0); continue; }
    const f = 0.7 + r() * 0.5;
    p.set(x, y, [c[0] * f, c[1] * f, c[2] * f]);
  }
}

function paintWool(p, c) {
  const r = p.rng;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const f = 0.9 + r() * 0.12 - (((x + y * 3) % 5 === 0) ? 0.06 : 0);
    p.set(x, y, [c[0] * f, c[1] * f, c[2] * f]);
  }
}

function paintBricks(p, brick, mortar, bh = 4, bw = 8) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const row = Math.floor(y / bh);
    const off = row % 2 ? bw / 2 : 0;
    const isM = (y % bh === bh - 1) || ((x + off) % bw === bw - 1);
    p.set(x, y, p.vary(isM ? mortar : brick, isM ? 0.05 : 0.14));
  }
}

function waterFrame(p, t) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const w = Math.sin((x + t * 2) * 0.8 + Math.sin(y * 0.6 + t) * 1.5) * 0.5 + Math.sin((y - t * 1.3) * 0.9 + x * 0.3) * 0.5;
    const f = 0.85 + w * 0.12;
    p.set(x, y, [C.water[0] * f, C.water[1] * f + 6, C.water[2] * f], 175);
  }
}
function lavaFrame(p, t) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const w = Math.sin(x * 0.7 + t * 0.8 + Math.sin(y * 0.5 - t * 0.6) * 2) + Math.sin(y * 0.8 - t * 0.5 + Math.cos(x * 0.4) * 2);
    const f = 0.5 + w * 0.25;
    p.set(x, y, [clamp(210 + 45 * f, 0, 255), clamp(70 + 110 * f, 0, 255), clamp(10 + 40 * f * f, 0, 255)]);
  }
}

// Handheld item helper: diagonal stick from bottom-left
function paintHandle(p, len) {
  for (let i = 0; i < len; i++) {
    p.set(2 + i, 13 - i, C.handle);
    p.set(3 + i, 13 - i, C.handleDark);
  }
}

function toolTile(type, mat) {
  return (p) => {
    const m = mat, d = [m[0] * 0.65, m[1] * 0.65, m[2] * 0.65], l = [Math.min(255, m[0] * 1.15 + 20), Math.min(255, m[1] * 1.15 + 20), Math.min(255, m[2] * 1.15 + 20)];
    const out = [30, 30, 30];
    if (type === 'pickaxe') {
      paintHandle(p, 9);
      const head = [[4, 2], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 2], [11, 3], [12, 4], [13, 5], [14, 6], [14, 7], [14, 8], [3, 2], [3, 3], [14, 9]];
      const inner = [[5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 3], [11, 4], [12, 5], [13, 6], [13, 7], [13, 8], [4, 3]];
      head.forEach(([x, y]) => p.set(x, y, out));
      inner.forEach(([x, y], i) => p.set(x, y, i % 3 === 0 ? l : m));
      [[10, 4], [9, 3], [12, 6]].forEach(([x, y]) => p.set(x, y, d));
    } else if (type === 'axe') {
      paintHandle(p, 10);
      for (let y = 1; y < 8; y++) for (let x = 7; x < 14; x++) {
        const inside = (x - 7) + (7 - y) < 9 && x + y > 9 && y + (13 - x) > 2;
        if (inside && !(x >= 10 && y >= 5 && x - y >= 5)) p.set(x, y, (x + y) % 4 === 0 ? l : (y > 5 ? d : m));
      }
      p.set(10, 3, C.handle); p.set(11, 2, C.handle);
    } else if (type === 'shovel') {
      paintHandle(p, 9);
      const blade = [[10, 3], [11, 2], [12, 2], [13, 3], [13, 4], [12, 5], [11, 5], [10, 4], [11, 3], [12, 3], [12, 4], [11, 4], [14, 3], [12, 1], [14, 2], [13, 1]];
      blade.forEach(([x, y], i) => p.set(x, y, i < 8 ? (i % 2 ? d : m) : l));
    } else if (type === 'sword') {
      for (let i = 0; i < 9; i++) {
        p.set(5 + i, 10 - i, i % 3 === 0 ? l : m);
        p.set(6 + i, 10 - i, d);
        p.set(5 + i, 9 - i, l);
      }
      p.set(14, 1, l); p.set(15, 0, m);
      // crossguard
      [[2, 8], [3, 9], [4, 10], [5, 11], [6, 12]].forEach(([x, y]) => p.set(x, y, C.handleDark));
      [[3, 12], [2, 13], [1, 14]].forEach(([x, y]) => p.set(x, y, C.handle));
      p.set(0, 15, C.handleDark);
    }
  };
}

function buildAtlas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = ATLAS_PX;
  Atlas.canvas = cv;
  Atlas.ctx = cv.getContext('2d', { willReadFrequently: true });

  // --- Terrain ---
  defTile('stone', paintStone);
  defTile('dirt', paintDirt);
  defTile('grass_top', (p, r) => {
    p.fillNoise(C.grass, 0.2);
    for (let i = 0; i < 30; i++) p.set(Math.floor(r() * 16), Math.floor(r() * 16), p.vary([80, 140, 44], 0.1));
  });
  defTile('grass_side', (p, r) => {
    paintDirt(p);
    for (let x = 0; x < 16; x++) {
      const h = 3 + Math.floor(r() * 2) + (r() < 0.25 ? 1 : 0);
      for (let y = 0; y < h; y++) p.set(x, y, p.vary(C.grass, 0.18));
    }
  });
  defTile('snow', (p) => p.fillNoise(C.snow, 0.05));
  defTile('grass_snow_side', (p, r) => {
    paintDirt(p);
    for (let x = 0; x < 16; x++) {
      const h = 3 + Math.floor(r() * 3);
      for (let y = 0; y < h; y++) p.set(x, y, p.vary(C.snow, 0.05));
    }
  });
  defTile('sand', (p, r) => {
    p.fillNoise(C.sand, 0.08);
    for (let i = 0; i < 25; i++) p.set(Math.floor(r() * 16), Math.floor(r() * 16), p.vary([200, 186, 140], 0.06));
  });
  defTile('sandstone_side', (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c = C.sand;
      if (y < 3) c = [226, 214, 170]; else if (y === 3 || y === 11) c = [196, 182, 136]; else if (y > 12) c = [206, 192, 146];
      p.set(x, y, p.vary(c, 0.06));
    }
  });
  defTile('sandstone_top', (p) => p.fillNoise([222, 212, 168], 0.06));
  defTile('gravel', (p, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = r();
      const c = v < 0.3 ? [100, 94, 92] : v < 0.6 ? [140, 132, 128] : v < 0.85 ? [160, 150, 146] : [110, 100, 90];
      p.set(x, y, p.vary(c, 0.1));
    }
  });
  defTile('cobblestone', (p, r) => {
    const pts = [];
    for (let i = 0; i < 9; i++) pts.push([r() * 16, r() * 16, 0.8 + r() * 0.35]);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let d1 = 99, d2 = 99, idx = 0;
      for (let i = 0; i < pts.length; i++) {
        for (let ox = -16; ox <= 16; ox += 16) for (let oy = -16; oy <= 16; oy += 16) {
          const dx = x - pts[i][0] + ox, dy = y - pts[i][1] + oy, d = Math.sqrt(dx * dx + dy * dy);
          if (d < d1) { d2 = d1; d1 = d; idx = i; } else if (d < d2) d2 = d;
        }
      }
      const edge = d2 - d1 < 1.1;
      const f = edge ? 0.55 : pts[idx][2] * (0.92 + r() * 0.12);
      p.set(x, y, [122 * f, 122 * f, 122 * f]);
    }
  });
  defTile('mossy_cobblestone', (p, r) => {
    const src = Atlas.pixels.cobblestone;
    for (let i = 0; i < src.length; i++) p.d[i] = src[i];
    for (let i = 0; i < 70; i++) { const x = Math.floor(r() * 16), y = Math.floor(r() * 16); p.set(x, y, p.vary([80, 120, 50], 0.2)); }
  });
  defTile('bedrock', (p, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const v = r(); const g = v < 0.4 ? 40 : v < 0.75 ? 85 : 130; p.set(x, y, p.vary([g, g, g], 0.15)); }
  });
  defTile('clay', (p) => p.fillNoise(C.clay, 0.06));
  defTile('obsidian', (p, r) => {
    p.fillNoise(C.obsidian, 0.3);
    for (let i = 0; i < 16; i++) p.set(Math.floor(r() * 16), Math.floor(r() * 16), p.vary([70, 40, 110], 0.2));
  });
  defTile('ice', (p, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, p.vary([150, 190, 250], 0.06), 190);
    for (let i = 0; i < 5; i++) { const x = Math.floor(r() * 12), y = Math.floor(r() * 12); for (let k = 0; k < 4; k++) p.set(x + k, y + k, [220, 235, 255], 200); }
  });
  defTile('water', (p) => waterFrame(p, 0));
  defTile('lava', (p) => lavaFrame(p, 0));
  Atlas.animated.push({ name: 'water', fn: waterFrame, speed: 2.5 });
  Atlas.animated.push({ name: 'lava', fn: lavaFrame, speed: 1.2 });

  // --- Ores ---
  defTile('coal_ore', (p) => oreTile(p, [40, 40, 40]));
  defTile('iron_ore', (p) => oreTile(p, [216, 175, 147]));
  defTile('gold_ore', (p) => oreTile(p, [252, 238, 75]));
  defTile('diamond_ore', (p) => oreTile(p, [93, 236, 245], 0.8));
  defTile('redstone_ore', (p) => oreTile(p, [220, 20, 20]));

  // --- Wood ---
  defTile('oak_log', (p) => paintBark(p, C.oakBark));
  defTile('oak_log_top', (p) => paintLogTop(p, C.oakBark, C.oakWood));
  defTile('oak_leaves', (p) => paintLeaves(p, C.leaf));
  defTile('oak_planks', (p) => paintPlanks(p, C.plank));
  defTile('birch_log', (p, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, p.vary(C.birchBark, 0.06));
    for (let i = 0; i < 7; i++) { const y = Math.floor(r() * 16), x = Math.floor(r() * 12), w = 2 + Math.floor(r() * 4); for (let k = 0; k < w; k++) p.set(x + k, y, p.vary([40, 40, 36], 0.2)); }
  });
  defTile('birch_log_top', (p) => paintLogTop(p, C.birchBark, [206, 186, 130]));
  defTile('birch_leaves', (p) => paintLeaves(p, C.birchLeaf));
  defTile('birch_planks', (p) => paintPlanks(p, [196, 178, 122]));
  defTile('spruce_log', (p) => paintBark(p, C.spruceBark));
  defTile('spruce_log_top', (p) => paintLogTop(p, C.spruceBark, [120, 88, 52]));
  defTile('spruce_leaves', (p) => paintLeaves(p, C.spruceLeaf, 0.15));
  defTile('spruce_planks', (p) => paintPlanks(p, [112, 82, 48]));

  // --- Building blocks ---
  defTile('glass', (p, r) => {
    p.clear();
    for (let i = 0; i < 16; i++) { p.set(i, 0, [220, 240, 250], 230); p.set(i, 15, [190, 215, 230], 230); p.set(0, i, [220, 240, 250], 230); p.set(15, i, [190, 215, 230], 230); }
    for (let k = 0; k < 3; k++) { p.set(3 + k, 5 - k, [255, 255, 255], 200); p.set(10 + k, 12 - k, [255, 255, 255], 170); }
    p.set(4, 5, [255, 255, 255], 160);
  });
  defTile('bricks', (p) => paintBricks(p, C.brick, C.mortar));
  defTile('stone_bricks', (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = Math.floor(y / 8), off = row % 2 ? 8 : 0;
      const m = y % 8 === 7 || (x + off) % 16 === 15;
      const hi = y % 8 === 0 || (x + off) % 16 === 0;
      p.set(x, y, p.vary(m ? [80, 80, 80] : hi ? [140, 140, 140] : [118, 118, 118], 0.06));
    }
  });
  defTile('bookshelf', (p, r) => {
    paintPlanks(p, C.plank);
    const colors = [[150, 30, 30], [40, 60, 140], [40, 110, 50], [140, 110, 40], [100, 50, 110], [60, 60, 60]];
    for (const yb of [1, 9]) {
      let x = 1;
      while (x < 15) {
        const w = 1 + Math.floor(r() * 2), c = colors[Math.floor(r() * colors.length)], h = 5 + Math.floor(r() * 2);
        for (let k = 0; k < w && x < 15; k++, x++) for (let y = yb + (6 - h); y < yb + 6; y++) p.set(x, y, p.vary(c, 0.1));
      }
      for (let xx = 0; xx < 16; xx++) p.set(xx, yb + 6, [90, 66, 36]);
    }
  });
  defTile('glowstone', (p, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = r(); p.set(x, y, v < 0.2 ? [150, 100, 50] : v < 0.6 ? p.vary([230, 180, 90], 0.1) : p.vary([255, 230, 150], 0.06));
    }
  });
  const woolColors = { white: [234, 236, 236], red: [176, 46, 38], orange: [240, 118, 20], yellow: [248, 198, 40], lime: [112, 185, 26], blue: [53, 57, 157], cyan: [21, 137, 145], purple: [122, 42, 173], black: [22, 22, 26], gray: [62, 68, 72], pink: [237, 141, 172], brown: [114, 72, 40] };
  for (const k in woolColors) defTile('wool_' + k, (p) => paintWool(p, woolColors[k]));
  defTile('tnt_side', (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c = (x % 4 === 0) ? [160, 40, 30] : [210, 60, 40];
      if (y >= 5 && y <= 10) c = [230, 230, 220];
      p.set(x, y, p.vary(c, 0.06));
    }
    p.pattern(['', '', '', '', '', '', '.TTT.T..T.TTT..', '..T..TT.T..T...', '..T..T.TT..T...', '..T..T..T..T...'], { T: [30, 30, 30, 255] });
  });
  defTile('tnt_top', (p) => {
    p.fillNoise([200, 56, 40], 0.08);
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) p.set(x, y, [60, 60, 60]);
    p.set(7, 7, [200, 200, 200]);
  });
  defTile('tnt_bottom', (p) => p.fillNoise([180, 50, 36], 0.08));

  // --- Utility blocks ---
  defTile('crafting_table_top', (p) => {
    paintPlanks(p, [150, 112, 66]);
    p.border([96, 66, 32]);
    for (let i = 1; i < 15; i++) { p.set(i, 5, [96, 66, 32]); p.set(i, 10, [96, 66, 32]); p.set(5, i, [96, 66, 32]); p.set(10, i, [96, 66, 32]); }
  });
  defTile('crafting_table_side', (p) => {
    paintPlanks(p, C.plank);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 3; y++) p.set(x, y, p.vary([120, 86, 46], 0.08));
    // saw
    for (let x = 3; x < 10; x++) p.set(x, 7, [180, 180, 180]);
    for (let x = 3; x < 10; x += 2) p.set(x, 8, [150, 150, 150]);
    p.set(10, 7, C.handle); p.set(11, 7, C.handle);
    // hammer
    p.set(12, 5, [90, 90, 90]); p.set(13, 5, [90, 90, 90]); p.set(14, 5, [90, 90, 90]);
    for (let y = 6; y < 12; y++) p.set(13, y, C.handle);
  });
  defTile('furnace_front', (p) => {
    p.fillNoise([110, 110, 110], 0.12);
    p.border([80, 80, 80]);
    for (let y = 8; y < 14; y++) for (let x = 4; x < 12; x++) p.set(x, y, [24, 24, 24]);
    for (let x = 4; x < 12; x++) p.set(x, 7, [70, 70, 70]);
    for (let x = 3; x < 13; x++) p.set(x, 3, [70, 70, 70]);
  });
  defTile('furnace_front_lit', (p, r) => {
    p.fillNoise([110, 110, 110], 0.12);
    p.border([80, 80, 80]);
    for (let y = 8; y < 14; y++) for (let x = 4; x < 12; x++) p.set(x, y, y > 10 ? p.vary([255, 160, 40], 0.2) : p.vary([200, 80, 20], 0.3));
    for (let x = 4; x < 12; x++) p.set(x, 7, [70, 70, 70]);
    for (let x = 3; x < 13; x++) p.set(x, 3, [70, 70, 70]);
  });
  defTile('furnace_side', (p) => { p.fillNoise([112, 112, 112], 0.1); p.border([84, 84, 84]); });
  defTile('furnace_top', (p) => { p.fillNoise([126, 126, 126], 0.08); p.border([96, 96, 96]); });
  defTile('chest_front', (p) => {
    paintPlanks(p, [156, 108, 48]);
    p.border([70, 46, 20]);
    for (let x = 1; x < 15; x++) p.set(x, 5, [70, 46, 20]);
    p.rect(7, 4, 2, 4, [200, 200, 200]);
    p.set(7, 7, [60, 60, 60]); p.set(8, 7, [60, 60, 60]);
  });
  defTile('chest_side', (p) => { paintPlanks(p, [156, 108, 48]); p.border([70, 46, 20]); for (let x = 1; x < 15; x++) p.set(x, 5, [70, 46, 20]); });
  defTile('chest_top', (p) => { paintPlanks(p, [156, 108, 48]); p.border([70, 46, 20]); });

  // --- Plants ---
  defTile('torch', (p) => {
    p.clear();
    for (let y = 8; y < 16; y++) { p.set(7, y, [120, 90, 50]); p.set(8, y, [90, 66, 34]); }
    p.set(7, 6, [255, 230, 120]); p.set(8, 6, [255, 200, 60]); p.set(7, 7, [255, 160, 30]); p.set(8, 7, [240, 120, 20]);
    p.set(7, 5, [255, 250, 200], 200); p.set(8, 5, [255, 240, 160], 140);
  });
  defTile('tallgrass', (p, r) => {
    p.clear();
    for (let b = 0; b < 9; b++) {
      let x = 1 + Math.floor(r() * 14); const h = 5 + Math.floor(r() * 9);
      for (let k = 0; k < h; k++) { p.set(x, 15 - k, p.vary([90, 160, 52], 0.25)); if (r() < 0.2) x += r() < 0.5 ? -1 : 1; }
    }
  });
  defTile('fern', (p, r) => {
    p.clear();
    for (let y = 2; y < 16; y++) { p.set(7, y, [60, 120, 40]); const w = Math.floor((16 - y) / 3) + 1; if (y % 2 === 0) for (let k = 1; k <= w; k++) { p.set(7 - k, y - (k >> 1), p.vary([70, 140, 50], 0.2)); p.set(7 + k, y - (k >> 1), p.vary([70, 140, 50], 0.2)); } }
  });
  defTile('dandelion', (p) => {
    p.clear();
    for (let y = 9; y < 16; y++) p.set(7, y, [60, 130, 30]);
    p.set(6, 12, [60, 130, 30]); p.set(5, 11, [60, 130, 30]);
    p.rect(6, 5, 3, 3, [250, 230, 40]); p.set(7, 4, [250, 230, 40]); p.set(5, 6, [240, 210, 30]); p.set(9, 6, [240, 210, 30]); p.set(7, 8, [240, 200, 30]);
    p.set(7, 6, [255, 160, 20]);
  });
  defTile('rose', (p) => {
    p.clear();
    for (let y = 9; y < 16; y++) p.set(7, y, [50, 120, 30]);
    p.set(8, 12, [50, 120, 30]); p.set(9, 11, [60, 140, 40]); p.set(6, 13, [60, 140, 40]);
    p.rect(6, 4, 3, 4, [210, 20, 20]); p.set(5, 5, [180, 10, 10]); p.set(9, 5, [180, 10, 10]); p.set(7, 3, [230, 40, 40]); p.set(7, 5, [120, 0, 0]);
  });
  defTile('dead_bush', (p, r) => {
    p.clear();
    const br = (x, y, dx, n) => { for (let k = 0; k < n; k++) { p.set(x, y, [130, 90, 40]); y--; if (k % 2) x += dx; } };
    br(7, 15, 0, 5); br(7, 11, -1, 6); br(8, 11, 1, 6); br(7, 9, 1, 5); br(6, 13, -1, 4);
  });
  defTile('cactus_side', (p, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (x === 0 || x === 15) { p.set(x, y, [0, 0, 0], 0); continue; }
      let c = (x % 4 === 2) ? [50, 100, 26] : C.cactus;
      p.set(x, y, p.vary(c, 0.1));
    }
    for (let i = 0; i < 8; i++) p.set(1 + Math.floor(r() * 14), Math.floor(r() * 16), [20, 20, 10]);
  });
  defTile('cactus_top', (p) => {
    p.fillNoise([90, 150, 50], 0.08);
    for (let i = 0; i < 16; i++) { p.set(i, 0, [0, 0, 0], 0); p.set(i, 15, [0, 0, 0], 0); p.set(0, i, [0, 0, 0], 0); p.set(15, i, [0, 0, 0], 0); }
    for (let i = 2; i < 14; i++) { p.set(i, 2, [60, 110, 30]); p.set(i, 13, [60, 110, 30]); p.set(2, i, [60, 110, 30]); p.set(13, i, [60, 110, 30]); }
  });
  defTile('cactus_bottom', (p) => p.fillNoise([200, 180, 120], 0.08));

  // --- Break progress overlays ---
  {
    const rng = mulberry32(1234);
    const segs = [];
    for (let s = 0; s < 14; s++) {
      let x = 7 + Math.floor(rng() * 3) - 1, y = 7 + Math.floor(rng() * 3) - 1;
      const dir = rng() * Math.PI * 2;
      for (let k = 0; k < 7; k++) {
        segs.push([x, y]);
        x += Math.round(Math.cos(dir + (rng() - 0.5)));
        y += Math.round(Math.sin(dir + (rng() - 0.5)));
      }
    }
    for (let st = 0; st < 10; st++) {
      defTile('destroy_' + st, (p) => {
        p.clear();
        const n = Math.floor(segs.length * (st + 1) / 10);
        for (let i = 0; i < n; i++) p.set(segs[i][0], segs[i][1], [20, 20, 20], 200);
      });
    }
  }

  // --- Items ---
  defTile('stick', (p) => { p.clear(); for (let i = 0; i < 11; i++) { p.set(3 + i, 13 - i, C.handle); p.set(4 + i, 13 - i, C.handleDark); } });
  defTile('coal', (p) => {
    p.clear();
    p.pattern(['', '', '', '.....XXXX', '....XAAAAX', '...XAABAAAX', '...XABAAAAX', '..XAAAAABAX', '..XAAAAAAAX', '..XABAAAAX', '...XAAAAX', '....XXXX'], { X: [20, 20, 20, 255], A: [46, 46, 46, 255], B: [90, 90, 90, 255] });
  });
  const ingot = (c) => (p) => {
    p.clear();
    const d = [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 255], l = [Math.min(255, c[0] + 30), Math.min(255, c[1] + 30), Math.min(255, c[2] + 30), 255];
    p.pattern(['', '', '', '', '', '......LLLLLL', '....LLAAAAAAD', '..LLAAAAAAADD', '.DAAAAAAAADD', '.DDAAAAAADD', '..DDDAAADD', '....DDDD'], { L: l, A: [c[0], c[1], c[2], 255], D: d });
  };
  defTile('iron_ingot', ingot([216, 216, 216]));
  defTile('gold_ingot', ingot([250, 220, 60]));
  defTile('diamond', (p) => {
    p.clear();
    p.pattern(['', '', '....DDDDDDD', '...DLLAAALAD', '..DLLAAAAALAD', '.DLAAAAAAAAAD', '..DAAAAAAAAD', '...DAAAAAAD', '....DAAAAD', '.....DAAD', '......DD'], { D: [20, 90, 90, 255], L: [210, 255, 255, 255], A: [80, 232, 220, 255] });
  });
  defTile('apple', (p) => {
    p.clear();
    p.pattern(['', '.......B', '.......BGG', '.......BG', '...RRR.B.RRR', '..RRWRRRRRRRR', '.RRWRRRRRRRRRR', '.RRRRRRRRRRRRR', '.RRRRRRRRRRRRR', '.RRRRRRRRRRRRD', '..RRRRRRRRRRD', '..RRRRRRRRRDD', '...RRRRRRRDD', '....RRDDDDD'], { B: [80, 50, 20, 255], G: [60, 150, 40, 255], R: [210, 30, 30, 255], W: [255, 200, 200, 255], D: [140, 10, 10, 255] });
  });
  const meat = (a, b, fat) => (p) => {
    p.clear();
    p.pattern(['', '', '', '....AAAAAA', '...AABBBBAA', '..AABBBBBBAA', '..ABBBBBBBBAF', '.AABBBBBBBBAF', '.ABBBBBBBBAAF', '.AABBBBBBAAF', '..AAAABBAAF', '....FFAAFF', '......FFF'], { A: a, B: b, F: fat });
  };
  defTile('porkchop', meat([230, 120, 120, 255], [240, 150, 150, 255], [250, 230, 220, 255]));
  defTile('cooked_porkchop', meat([150, 90, 50, 255], [190, 130, 80, 255], [230, 200, 150, 255]));
  defTile('mutton', meat([200, 50, 50, 255], [220, 80, 70, 255], [240, 220, 210, 255]));
  defTile('cooked_mutton', meat([130, 70, 40, 255], [160, 100, 60, 255], [210, 180, 140, 255]));
  defTile('rotten_flesh', meat([110, 120, 60, 255], [150, 100, 70, 255], [90, 70, 50, 255]));
  defTile('bread', (p) => {
    p.clear();
    p.pattern(['', '', '', '', '', '....AAAAAA', '..AABABABAAA', '.ABBABABABABA', '.ABBBBBBBBBBAD', '.DABBBBBBBBADD', '..DDAAAAAAADD', '....DDDDDDD'], { A: [200, 140, 60, 255], B: [220, 170, 90, 255], D: [140, 90, 40, 255] });
  });
  defTile('gunpowder', (p, r) => { p.clear(); for (let i = 0; i < 60; i++) { const a = r() * 6.28, d = r() * 6; p.set(Math.round(8 + Math.cos(a) * d), Math.round(9 + Math.sin(a) * d * 0.7), p.vary([90, 90, 90], 0.4)); } });
  defTile('flint', (p) => { p.clear(); p.pattern(['', '', '......AA', '.....ABBA', '....ABBBBA', '...ABBCBBBA', '...ABCBBBBA', '..ABBBBBBBA', '..ABBBBBBA', '...ABBBBA', '....AAAA'], { A: [30, 30, 30, 255], B: [70, 70, 74, 255], C: [130, 130, 130, 255] }); });
  defTile('flint_and_steel', (p) => {
    p.clear();
    p.pattern(['', '', '...SSSS', '..S....S', '..S.....S', '...S....S', '.........S', '........SAA', '.......ABBA', '......ABBBA', '......ABBA', '.......AA'], { S: [180, 180, 180, 255], A: [30, 30, 30, 255], B: [80, 80, 80, 255] });
  });
  defTile('bucket', (p) => {
    p.clear();
    p.pattern(['', '', '', '...SSSSSSSSSS', '..SDDDDDDDDDDS', '..SLLLLLLLLLLS', '...SLLLLLLLLS', '...SLLLLLLLLS', '....SLLLLLLS', '....SLLLLLLS', '.....SSSSSS'], { S: [100, 100, 100, 255], D: [40, 40, 40, 255], L: [200, 200, 200, 255] });
  });
  defTile('water_bucket', (p) => {
    p.clear();
    p.pattern(['', '', '', '...SSSSSSSSSS', '..SWWWWWWWWWWS', '..SLLLLLLLLLLS', '...SLLLLLLLLS', '...SLLLLLLLLS', '....SLLLLLLS', '....SLLLLLLS', '.....SSSSSS'], { S: [100, 100, 100, 255], W: [50, 90, 230, 255], L: [200, 200, 200, 255] });
  });
  defTile('wheat_seeds', (p, r) => { p.clear(); for (let i = 0; i < 8; i++) { const x = 3 + Math.floor(r() * 10), y = 4 + Math.floor(r() * 9); p.set(x, y, [60, 160, 50]); p.set(x, y + 1, [40, 110, 30]); } });

  const mats = { wooden: C.wood, stone: C.stoneTool, iron: C.iron, golden: C.gold, diamond: C.diamond };
  for (const m in mats) for (const t of ['pickaxe', 'axe', 'shovel', 'sword']) defTile(m + '_' + t, toolTile(t, mats[m]));

  // --- Mob skins ---
  defTile('pig_skin', (p) => p.fillNoise([240, 160, 160], 0.08));
  defTile('pig_face', (p) => {
    p.fillNoise([240, 160, 160], 0.08);
    p.rect(2, 5, 2, 2, [255, 255, 255]); p.set(3, 5, [20, 20, 20]); p.set(3, 6, [20, 20, 20]);
    p.rect(12, 5, 2, 2, [255, 255, 255]); p.set(12, 5, [20, 20, 20]); p.set(12, 6, [20, 20, 20]);
    p.rect(5, 9, 6, 4, [230, 130, 140]); p.set(6, 10, [120, 50, 60]); p.set(9, 10, [120, 50, 60]);
  });
  defTile('zombie_skin', (p) => p.fillNoise([90, 140, 80], 0.12));
  defTile('zombie_face', (p) => {
    p.fillNoise([90, 140, 80], 0.12);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) p.set(x, y, p.vary([70, 110, 60], 0.1));
    p.rect(3, 7, 3, 2, [20, 30, 20]); p.rect(10, 7, 3, 2, [20, 30, 20]);
    p.rect(6, 11, 4, 1, [50, 80, 45]); p.set(7, 10, [60, 90, 50]); p.set(8, 10, [60, 90, 50]);
  });
  defTile('zombie_shirt', (p) => p.fillNoise([40, 160, 170], 0.12));
  defTile('zombie_pants', (p) => p.fillNoise([60, 60, 150], 0.1));
  defTile('creeper_skin', (p, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const v = r(); p.set(x, y, v < 0.15 ? [200, 230, 190] : v < 0.6 ? p.vary([90, 180, 80], 0.15) : p.vary([60, 140, 50], 0.15)); }
  });
  defTile('creeper_face', (p, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const v = r(); p.set(x, y, v < 0.15 ? [200, 230, 190] : v < 0.6 ? p.vary([90, 180, 80], 0.15) : p.vary([60, 140, 50], 0.15)); }
    p.rect(2, 4, 4, 4, [10, 10, 10]); p.rect(10, 4, 4, 4, [10, 10, 10]);
    p.rect(6, 8, 4, 3, [10, 10, 10]); p.rect(4, 10, 2, 5, [10, 10, 10]); p.rect(10, 10, 2, 5, [10, 10, 10]); p.rect(6, 11, 4, 2, [10, 10, 10]);
  });
  defTile('sheep_wool', (p) => paintWool(p, [236, 236, 230]));
  defTile('sheep_face', (p) => {
    p.fillNoise([220, 190, 170], 0.06);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 3; y++) p.set(x, y, p.vary([236, 236, 230], 0.05));
    p.rect(2, 6, 3, 2, [255, 255, 255]); p.set(2, 6, [20, 20, 20]); p.set(2, 7, [20, 20, 20]);
    p.rect(11, 6, 3, 2, [255, 255, 255]); p.set(13, 6, [20, 20, 20]); p.set(13, 7, [20, 20, 20]);
    p.rect(6, 11, 4, 2, [240, 160, 170]);
  });
  defTile('sheep_skin', (p) => p.fillNoise([220, 190, 170], 0.06));
  defTile('player_skin', (p) => p.fillNoise([196, 140, 106], 0.05));
  defTile('player_face', (p) => {
    p.fillNoise([196, 140, 106], 0.05);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) p.set(x, y, p.vary([60, 40, 24], 0.1));
    p.set(0, 4, [60, 40, 24]); p.set(15, 4, [60, 40, 24]);
    p.rect(2, 8, 2, 2, [255, 255, 255]); p.rect(4, 8, 2, 2, [60, 70, 160]);
    p.rect(10, 8, 2, 2, [60, 70, 160]); p.rect(12, 8, 2, 2, [255, 255, 255]);
    p.rect(6, 11, 4, 1, [150, 90, 70]); p.rect(5, 13, 6, 1, [110, 60, 50]);
  });
  defTile('player_hair', (p) => p.fillNoise([60, 40, 24], 0.1));
  defTile('player_head_side', (p) => {
    p.fillNoise([196, 140, 106], 0.05);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 5; y++) p.set(x, y, p.vary([60, 40, 24], 0.1));
    for (let y = 5; y < 9; y++) for (let x = 8; x < 16; x++) p.set(x, y, p.vary([60, 40, 24], 0.1));
  });
  defTile('player_shirt', (p) => p.fillNoise([40, 170, 180], 0.08));
  defTile('player_pants', (p) => p.fillNoise([60, 60, 160], 0.08));
  defTile('smoke', (p) => {
    p.clear();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 7) p.set(x, y, [200, 200, 200], Math.floor(clamp(1 - d / 7, 0, 1) * 220)); }
  });
  const sapling = (leaf, stem) => (p, r) => {
    p.clear();
    for (let y = 8; y < 16; y++) p.set(7, y, stem);
    p.set(8, 12, stem); p.set(6, 10, stem);
    for (let i = 0; i < 46; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 5; const x = Math.round(7.5 + Math.cos(a) * d), y = Math.round(6 + Math.sin(a) * d * 0.9); if (y < 12) p.set(x, y, p.vary(leaf, 0.3)); }
  };
  defTile('sapling_oak', sapling(C.leaf, [100, 70, 40]));
  defTile('sapling_birch', sapling(C.birchLeaf, [210, 210, 200]));
  defTile('sapling_spruce', sapling(C.spruceLeaf, [70, 50, 30]));
  defTile('bed_top', (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c = y < 5 ? [236, 236, 236] : [178, 34, 34];
      if (y >= 5 && (x === 0 || x === 15)) c = [140, 24, 24];
      if (y === 5) c = [150, 26, 26];
      p.set(x, y, p.vary(c, 0.06));
    }
  });
  defTile('bed_side', (p) => {
    p.clear();
    for (let y = 7; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c;
      if (y < 10) c = [178, 34, 34]; else if (y < 13) c = [230, 230, 230]; else c = (x < 3 || x > 12 || y === 13) ? [150, 116, 70] : null;
      if (c) p.set(x, y, p.vary(c, 0.06));
    }
  });
  defTile('white', (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, [255, 255, 255]); });
}

// Repaint animated tiles (called from renderer which uploads them)
function animateTile(anim, time) {
  const data = Atlas.pixels[anim.name];
  const p = new Painter(data, mulberry32(1));
  anim.fn(p, time * anim.speed);
  return data;
}
