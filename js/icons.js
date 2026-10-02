'use strict';
// Generates inventory icons (isometric blocks, flat items) as data URLs.

const IconCache = {};

function tileCanvas(tile) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const x = c.getContext('2d');
  x.drawImage(Atlas.canvas, (tile % ATLAS_COLS) * 16, Math.floor(tile / ATLAS_COLS) * 16, 16, 16, 0, 0, 16, 16);
  return c;
}

function getIcon(id) {
  if (IconCache[id]) return IconCache[id];
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const isBlock = id < 256;
  const rt = isBlock ? RENDER[id] : 0;
  if (isBlock && (rt === RT_CUBE || rt === RT_LIQUID || rt === RT_CACTUS)) {
    const top = tileCanvas(FACE_TEX[id * 6 + 2]);
    const left = tileCanvas(BLOCKS[id].facing ? FRONT_TEX[id] : FACE_TEX[id * 6 + 4]);
    const right = tileCanvas(FACE_TEX[id * 6 + 0]);
    const k = 26 / 16, h = 13 / 16;
    // draw onto separate layers so darkening only affects that face
    const layer = (img, tf, dark) => {
      const lc = document.createElement('canvas'); lc.width = lc.height = S;
      const lx = lc.getContext('2d'); lx.imageSmoothingEnabled = false;
      lx.setTransform(...tf); lx.drawImage(img, 0, 0);
      if (dark) { lx.globalCompositeOperation = 'source-atop'; lx.fillStyle = 'rgba(0,0,0,' + dark + ')'; lx.fillRect(0, 0, 16, 16); }
      ctx.drawImage(lc, 0, 0);
    };
    layer(left, [k, h, 0, k, 6, 19], 0.22);
    layer(right, [k, -h, 0, k, 32, 32], 0.42);
    layer(top, [k, -h, k, h, 6, 19], 0);
  } else {
    const tile = isBlock ? FACE_TEX[id * 6] : tileIndex(ITEMS[id].tile);
    ctx.drawImage(tileCanvas(tile), 0, 0, 16, 16, 4, 4, 56, 56);
  }
  IconCache[id] = cv.toDataURL();
  return IconCache[id];
}
