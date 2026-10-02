'use strict';
// ---------------------------------------------------------------------------
// DOM based user interface: HUD, inventories, crafting, menus
// ---------------------------------------------------------------------------

const SPLASHES = [
  'Now with 100% more blocks!', 'Procedurally painted!', 'No image files!', 'Punch a tree!', 'Watch out for creepers!',
  'Made with WebGL2!', 'Infinite-ish worlds!', 'Mine. Build. Repeat.', 'Also try the moon!', 'Synthesised sounds!',
  'Cubic and proud!', 'Creeper? Aww man.', 'Smooth lighting!', 'Now with TNT!', 'Bring a torch!',
];

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

function pixelIcon(rows, pal, scale = 2) {
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) { const ch = rows[y][i]; if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, y, 1, 1); } }
  return c.toDataURL();
}

// 9x9 pixel art, drawn 2x in the HUD
const HEART_ROWS = [
  '.KKK.KKK.',
  'KHHLKLRRK',
  'KHLRRRRDK',
  'KLRRRRRDK',
  'KRRRRRDDK',
  '.KRRRDDK.',
  '..KRDDK..',
  '...KDK...',
  '....K....',
];
const FOOD_ROWS = [
  '......KK.',
  '.....KWWK',
  '.....KWGK',
  '..KKKKGK.',
  '.KLLLMGK.',
  'KLHLMMMK.',
  'KLLMMMDK.',
  'KMMMMDDK.',
  '.KKKKKK..',
];
const HEART_PAL = { K: '#120000', H: '#ffe0e0', L: '#ff5050', R: '#dc1414', D: '#8c0808' };
const FOOD_PAL = { K: '#1c0f04', W: '#fbf7ee', G: '#c9bfa9', H: '#f2b07a', L: '#d9864a', M: '#b05a24', D: '#743410' };
const EMPTY_HEART = { K: '#120000', E: '#2e0808', F: '#4a1212' };
const EMPTY_FOOD = { K: '#1c0f04', E: '#2a1a0c', F: '#3e2814' };
// Replace interior colours with "empty" shades (lighter rim at top-left)
function emptied(rows, keep) {
  return rows.map((r, y) => r.split('').map((c, x) => (c === '.' || c === 'K' || (keep && keep(x, y))) ? c : (x + y < 6 ? 'F' : 'E')).join(''));
}
const BUBBLE_ROWS = ['..XXXXX..', '.XLLLLLX.', 'XLWWLLLLX', 'XLWLLLLLX', 'XLLLLLLLX', 'XLLLLLLLX', 'XLLLLLLLX', '.XLLLLLX.', '..XXXXX..'];

class UI {
  constructor(game) {
    this.game = game;
    this.screen = null;
    this.cursor = null;          // stack held by the mouse
    this.craftGrid = [];
    this.slotEls = [];
    this.mouse = { x: 0, y: 0 };
    this.root = document.getElementById('overlay');
    this.hud = document.getElementById('hud');
    this.cursorEl = document.getElementById('cursor-stack');
    this.tooltip = document.getElementById('tooltip');
    this.icons = {
      heart: pixelIcon(HEART_ROWS, HEART_PAL),
      heartHalf: pixelIcon(emptied(HEART_ROWS, (x) => x <= 4), Object.assign({}, HEART_PAL, EMPTY_HEART)),
      heartEmpty: pixelIcon(emptied(HEART_ROWS), EMPTY_HEART),
      heartFlash: pixelIcon(HEART_ROWS.map((r) => r.replace(/K/g, 'W')), Object.assign({}, HEART_PAL, { W: '#ffffff' })),
      food: pixelIcon(FOOD_ROWS, FOOD_PAL),
      foodHalf: pixelIcon(emptied(FOOD_ROWS, (x) => x >= 4), Object.assign({}, FOOD_PAL, EMPTY_FOOD)),
      foodEmpty: pixelIcon(emptied(FOOD_ROWS), EMPTY_FOOD),
      bubble: pixelIcon(BUBBLE_ROWS, { X: '#1a3a8a', L: '#5aa0ff', W: '#ffffff' }),
    };
    this.buildHUD();
    document.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.cursorEl.style.left = e.clientX + 'px'; this.cursorEl.style.top = e.clientY + 'px';
      this.tooltip.style.left = (e.clientX + 14) + 'px'; this.tooltip.style.top = (e.clientY - 26) + 'px';
    });
  }

  // ---- HUD -----------------------------------------------------------------------
  buildHUD() {
    const hb = document.getElementById('hotbar');
    hb.innerHTML = '';
    this.hotbarEls = [];
    for (let i = 0; i < 9; i++) {
      const s = el('div', 'hslot', hb);
      const img = el('img', 'icon', s); img.draggable = false;
      const cnt = el('span', 'count', s);
      const dur = el('div', 'dur', s); el('div', 'durfill', dur);
      this.hotbarEls.push({ s, img, cnt, dur });
    }
    this.heartEls = []; this.foodEls = []; this.bubbleEls = [];
    const hearts = document.getElementById('hearts'), food = document.getElementById('hunger'), bub = document.getElementById('bubbles');
    hearts.innerHTML = food.innerHTML = bub.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const h = el('img', '', hearts); h.draggable = false; this.heartEls.push(h);
      const f = el('img', '', food); f.draggable = false; this.foodEls.push(f);
      const b = el('img', '', bub); b.draggable = false; b.src = this.icons.bubble; this.bubbleEls.push(b);
    }
    this.lastHud = '';
  }

  fillSlotEl(o, stack) {
    if (stack) {
      const src = getIcon(stack.id);
      if (o.img.getAttribute('src') !== src) o.img.src = src;
      o.img.style.visibility = 'visible';
      o.cnt.textContent = stack.count > 1 ? stack.count : '';
      const def = itemDef(stack.id);
      if (def && def.durability && stack.dmg) {
        const f = 1 - stack.dmg / def.durability;
        o.dur.style.display = 'block';
        o.dur.firstChild.style.width = (f * 100) + '%';
        o.dur.firstChild.style.background = `hsl(${f * 120}, 90%, 45%)`;
      } else o.dur.style.display = 'none';
    } else {
      o.img.style.visibility = 'hidden'; o.img.removeAttribute('src'); o.cnt.textContent = ''; o.dur.style.display = 'none';
    }
  }

  updateHUD() {
    const p = this.game.player;
    const inv = p.inventory;
    for (let i = 0; i < 9; i++) {
      const o = this.hotbarEls[i];
      this.fillSlotEl(o, inv.slots[i]);
      o.s.classList.toggle('sel', i === inv.selected);
    }
    const survival = p.mode === 'survival';
    document.getElementById('bars').style.display = survival ? 'flex' : 'none';
    if (survival) {
      const flash = p.hurtTime > 0 && Math.floor(p.hurtTime * 10) % 2 === 0;
      const key = Math.ceil(p.health) + ',' + p.food + ',' + Math.ceil(p.air) + ',' + (p.headInWater || p.air < p.maxAir) + ',' + flash;
      if (key !== this.lastHud) {
        this.lastHud = key;
        const hp = Math.ceil(p.health);
        for (let i = 0; i < 10; i++) {
          this.heartEls[i].src = hp >= (i + 1) * 2 ? (flash ? this.icons.heartFlash : this.icons.heart) : hp === i * 2 + 1 ? this.icons.heartHalf : this.icons.heartEmpty;
          const f = p.food;
          this.foodEls[9 - i].src = f >= (i + 1) * 2 ? this.icons.food : f === i * 2 + 1 ? this.icons.foodHalf : this.icons.foodEmpty;
        }
        const showAir = p.air < p.maxAir - 0.01;
        const bubbles = Math.ceil(p.air / p.maxAir * 10);
        for (let i = 0; i < 10; i++) this.bubbleEls[9 - i].style.visibility = showAir && i < bubbles ? 'visible' : 'hidden';
      }
      // low-health shake
      document.getElementById('hearts').classList.toggle('low', p.health <= 4);
      document.getElementById('hunger').classList.toggle('low', p.food <= 6);
    }
  }

  showItemName(text) {
    const e = document.getElementById('item-name');
    e.textContent = text;
    e.style.transition = 'none'; e.style.opacity = 1;
    clearTimeout(this._nameT);
    this._nameT = setTimeout(() => { e.style.transition = 'opacity 0.6s'; e.style.opacity = 0; }, 1500);
  }

  toast(text) {
    const box = document.getElementById('messages');
    const m = el('div', 'msg', box, text);
    setTimeout(() => { m.style.opacity = 0; }, 3500);
    setTimeout(() => m.remove(), 4200);
  }

  flashDamage() {
    const f = document.getElementById('damage-flash');
    f.style.transition = 'none'; f.style.opacity = 0.45;
    requestAnimationFrame(() => { f.style.transition = 'opacity 0.5s'; f.style.opacity = 0; });
  }

  // ---- Screens -----------------------------------------------------------------------
  isOpen() { return !!this.screen; }
  isGuiScreen() { return ['inventory', 'crafting', 'furnace', 'chest', 'creative'].includes(this.screen); }

  close() {
    const g = this.game;
    if (this.isGuiScreen()) {
      // return crafting items & cursor stack
      for (let i = 0; i < this.craftGrid.length; i++) if (this.craftGrid[i]) this.giveBack(this.craftGrid[i]);
      this.craftGrid = [];
      if (this.cursor) { this.giveBack(this.cursor); this.cursor = null; }
      this.renderCursor();
    }
    this.screen = null;
    this.root.innerHTML = '';
    this.root.className = '';
    this.tooltip.style.display = 'none';
    this.slotEls = [];
    if (g.state === 'playing') g.lockPointer();
  }

  giveBack(stack) {
    const g = this.game;
    const left = g.player.inventory.add(stack.id, stack.count, stack.dmg ? { dmg: stack.dmg } : null);
    if (left > 0) g.dropFromPlayer(stack.id, left, stack.dmg);
  }

  openPanel(name, cls) {
    this.root.innerHTML = '';
    this.root.className = 'open ' + (cls || '');
    this.bookPanel = null;
    this.screen = name;
    this.slotEls = [];
    this.game.unlockPointer();
    return el('div', 'panel', this.root);
  }

  // Containers ------------------------------------------------------------------------
  invContainer() {
    const inv = this.game.player.inventory;
    return { kind: 'inv', get: (i) => inv.slots[i], set: (i, s) => { inv.slots[i] = s; } };
  }
  arrContainer(arr, kind = 'arr', filter) { return { kind, get: (i) => arr[i], set: (i, s) => { arr[i] = s; }, filter }; }

  makeSlot(parent, container, index, extraCls) {
    const s = el('div', 'slot' + (extraCls ? ' ' + extraCls : ''), parent);
    const img = el('img', 'icon', s); img.draggable = false;
    const cnt = el('span', 'count', s);
    const dur = el('div', 'dur', s); el('div', 'durfill', dur);
    const o = { s, img, cnt, dur, container, index };
    s.addEventListener('mousedown', (e) => { e.preventDefault(); this.clickSlot(o, e.button, e.shiftKey); });
    s.addEventListener('contextmenu', (e) => e.preventDefault());
    s.addEventListener('mouseenter', () => { this.hover = o; this.showTooltip(o); });
    s.addEventListener('mouseleave', () => { if (this.hover === o) this.hover = null; this.tooltip.style.display = 'none'; });
    this.slotEls.push(o);
    return o;
  }

  showTooltip(o) {
    const st = o.container.get(o.index);
    if (!st || this.cursor) { this.tooltip.style.display = 'none'; return; }
    let t = itemName(st.id);
    const def = itemDef(st.id);
    if (def && def.durability) t += `  (${def.durability - (st.dmg || 0)}/${def.durability})`;
    if (def && def.food) t += '  +' + def.food + ' food';
    this.tooltip.textContent = t;
    this.tooltip.style.display = 'block';
  }

  refresh() {
    for (const o of this.slotEls) this.fillSlotEl(o, o.container.get(o.index));
    this.renderCursor();
    if (this.screen === 'furnace') this.updateFurnaceUI();
  }

  renderCursor() {
    const c = this.cursor;
    if (!c) { this.cursorEl.style.display = 'none'; return; }
    this.cursorEl.style.display = 'block';
    this.cursorEl.querySelector('img').src = getIcon(c.id);
    this.cursorEl.querySelector('span').textContent = c.count > 1 ? c.count : '';
  }

  clickSlot(o, button, shift) {
    const g = this.game;
    const C = o.container, i = o.index;
    g.audio.play('click', undefined, undefined, undefined, 0.5);
    if (C.kind === 'palette') {
      const id = C.get(i).id;
      if (this.cursor) { this.cursor = null; }
      else if (shift) g.player.inventory.add(id, maxStack(id));
      else this.cursor = makeStack(id, button === 2 ? 1 : maxStack(id));
      this.afterChange(); return;
    }
    if (C.kind === 'output') { this.takeOutput(o, shift); this.afterChange(); return; }
    if (C.kind === 'trash') { this.cursor = null; this.afterChange(); return; }
    const cur = C.get(i);
    if (shift && cur) { this.quickMove(o); this.afterChange(); return; }
    if (C.filter && this.cursor && !C.filter(this.cursor.id)) { return; }
    if (button === 0) {
      if (!this.cursor) { if (cur) { this.cursor = cur; C.set(i, null); } }
      else if (!cur) { C.set(i, this.cursor); this.cursor = null; }
      else if (stackable(cur, this.cursor)) {
        const n = Math.min(this.cursor.count, maxStack(cur.id) - cur.count);
        cur.count += n; this.cursor.count -= n; if (this.cursor.count <= 0) this.cursor = null;
      } else { C.set(i, this.cursor); this.cursor = cur; }
    } else if (button === 2) {
      if (!this.cursor) { if (cur) { const h = Math.ceil(cur.count / 2); this.cursor = makeStack(cur.id, h, cur.dmg); cur.count -= h; if (cur.count <= 0) C.set(i, null); } }
      else if (!cur) { C.set(i, makeStack(this.cursor.id, 1, this.cursor.dmg)); this.cursor.count--; if (this.cursor.count <= 0) this.cursor = null; }
      else if (stackable(cur, this.cursor) && cur.count < maxStack(cur.id)) { cur.count++; this.cursor.count--; if (this.cursor.count <= 0) this.cursor = null; }
      else { C.set(i, this.cursor); this.cursor = cur; }
    }
    this.afterChange();
  }

  afterChange() {
    if (this.craftOut) this.craftOut.result = matchRecipe(this.craftGrid, this.craftSize);
    if (this.bookOpen && this.bookPanel && this.bookPanel.isConnected && !this._bookPending) {
      this._bookPending = true;
      setTimeout(() => { this._bookPending = false; this.renderRecipeBook(); }, 50);
    }
    this.game.player.inventory.changed();
    this.refresh();
    if (this.hover) this.showTooltip(this.hover);
  }

  takeOutput(o, shift) {
    const C = o.container;
    if (C.furnace) {
      const st = C.get(0);
      if (!st) return;
      if (shift) { const left = this.game.player.inventory.add(st.id, st.count); C.set(0, left > 0 ? makeStack(st.id, left) : null); return; }
      if (!this.cursor) { this.cursor = st; C.set(0, null); }
      else if (stackable(this.cursor, st) && this.cursor.count + st.count <= maxStack(st.id)) { this.cursor.count += st.count; C.set(0, null); }
      return;
    }
    // crafting output
    let crafted = 0;
    do {
      const r = matchRecipe(this.craftGrid, this.craftSize);
      if (!r) break;
      if (shift) {
        if (!this.game.player.inventory.slots.some((x) => !x || (x.id === r.id && x.count + r.count <= maxStack(r.id) && maxStack(r.id) > 1))) break;
        const left = this.game.player.inventory.add(r.id, r.count);
        if (left > 0) this.game.dropFromPlayer(r.id, left);
      } else {
        if (this.cursor && !(this.cursor.id === r.id && this.cursor.count + r.count <= maxStack(r.id) && maxStack(r.id) > 1)) break;
        if (this.cursor) this.cursor.count += r.count; else this.cursor = makeStack(r.id, r.count);
      }
      for (let k = 0; k < this.craftGrid.length; k++) {
        const s = this.craftGrid[k];
        if (s) { s.count--; if (s.count <= 0) this.craftGrid[k] = null; }
      }
      crafted++;
    } while (shift && crafted < 64);
  }

  quickMove(o) {
    const g = this.game, inv = g.player.inventory;
    const C = o.container, i = o.index, st = C.get(i);
    if (C.kind === 'inv') {
      // into open container if any
      if (this.screen === 'chest' && this.chestItems) {
        const left = addToArray(this.chestItems, st);
        C.set(i, left);
        return;
      }
      if (this.screen === 'furnace' && this.furnace) {
        const items = this.furnace.items;
        const target = SMELTING[st.id] !== undefined ? 0 : FUEL[st.id] ? 1 : -1;
        if (target >= 0) {
          const cur = items[target];
          if (!cur) { items[target] = st; C.set(i, null); return; }
          if (stackable(cur, st)) { const n = Math.min(st.count, maxStack(st.id) - cur.count); cur.count += n; st.count -= n; if (st.count <= 0) C.set(i, null); return; }
        }
      }
      // hotbar <-> main
      const range = i < 9 ? [9, 36] : [0, 9];
      const arr = inv.slots;
      let left = st;
      for (let pass = 0; pass < 2 && left; pass++) for (let k = range[0]; k < range[1] && left; k++) {
        const t = arr[k];
        if (pass === 0 && stackable(t, left)) { const n = Math.min(left.count, maxStack(t.id) - t.count); t.count += n; left.count -= n; if (left.count <= 0) left = null; }
        else if (pass === 1 && !t) { arr[k] = left; left = null; }
      }
      C.set(i, left);
    } else {
      const left = inv.add(st.id, st.count, st.dmg ? { dmg: st.dmg } : null);
      C.set(i, left > 0 ? makeStack(st.id, left, st.dmg) : null);
    }
  }

  inventorySection(panel) {
    const inv = this.invContainer();
    const main = el('div', 'grid g9', panel);
    for (let i = 9; i < 36; i++) this.makeSlot(main, inv, i);
    el('div', 'gap', panel);
    const hot = el('div', 'grid g9', panel);
    for (let i = 0; i < 9; i++) this.makeSlot(hot, inv, i);
  }

  craftingSection(parent, size) {
    this.craftSize = size;
    this.craftGrid = new Array(size * size).fill(null);
    const wrap = el('div', 'craft', parent);
    const grid = el('div', 'grid g' + size, wrap);
    const cont = this.arrContainer(this.craftGrid, 'craft');
    for (let i = 0; i < size * size; i++) this.makeSlot(grid, cont, i);
    el('div', 'arrow', wrap, '➜');
    this.craftOut = { result: null };
    const out = { kind: 'output', get: () => this.craftOut.result, set: () => {} };
    this.makeSlot(wrap, out, 0, 'big');
  }

  // ---- Recipe book ---------------------------------------------------------------------
  recipeIngredients(r) {
    const list = [];
    if (r.type === 'shapeless') r.ingredients.forEach((ing) => list.push(ing));
    else for (const row of r.pattern) for (const ch of row) if (ch !== ' ') list.push(r.key[ch]);
    return list;
  }
  ingredientIcon(ing) { return typeof ing === 'string' ? GROUPS[ing][Math.floor(this.game.realTime) % GROUPS[ing].length] : ing; }

  canCraft(r) {
    const inv = this.game.player.inventory;
    const need = new Map();
    for (const ing of this.recipeIngredients(r)) need.set(ing, (need.get(ing) || 0) + 1);
    for (const [ing, n] of need) {
      const have = typeof ing === 'string' ? GROUPS[ing].reduce((a, id) => a + inv.count(id) + this.gridCount(id), 0) : inv.count(ing) + this.gridCount(ing);
      if (have < n) return false;
    }
    return true;
  }
  gridCount(id) { let n = 0; for (const s of this.craftGrid) if (s && s.id === id) n += s.count; return n; }

  fillRecipe(r) {
    const size = this.craftSize;
    if (r.type === 'shaped' && (r.w > size || r.h > size)) return;
    if (r.type === 'shapeless' && r.ingredients.length > size * size) return;
    if (!this.canCraft(r)) return;
    for (let i = 0; i < this.craftGrid.length; i++) if (this.craftGrid[i]) { this.giveBack(this.craftGrid[i]); this.craftGrid[i] = null; }
    const inv = this.game.player.inventory;
    const take = (ing) => {
      for (let i = 0; i < 36; i++) {
        const s = inv.slots[i];
        if (s && ingredientMatches(ing, s.id)) { s.count--; if (s.count <= 0) inv.slots[i] = null; return s.id; }
      }
      return 0;
    };
    if (r.type === 'shapeless') r.ingredients.forEach((ing, k) => { const id = take(ing); if (id) this.craftGrid[k] = makeStack(id, 1); });
    else for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const ch = r.pattern[y][x] || ' ';
      if (ch === ' ') continue;
      const id = take(r.key[ch]);
      if (id) this.craftGrid[y * size + x] = makeStack(id, 1);
    }
    this.afterChange();
    this.renderRecipeBook();
  }

  addRecipeBook(panel) {
    const head = panel.querySelector('.title');
    const btn = el('button', 'bookbtn', head, '📖 Recipes');
    btn.title = 'Recipe book';
    btn.onclick = () => { this.bookOpen = !this.bookOpen; this.renderRecipeBook(); };
    this.bookPanel = el('div', 'panel recipes', this.root);
    this.root.classList.add('withbook');
    this.renderRecipeBook();
  }

  renderRecipeBook() {
    const bp = this.bookPanel;
    if (!bp || !bp.isConnected) return;
    bp.style.display = this.bookOpen ? 'flex' : 'none';
    if (!this.bookOpen) return;
    bp.innerHTML = '';
    el('div', 'title', bp, 'Recipe Book');
    el('div', 'small', bp, 'Click a recipe to fill the grid');
    const list = el('div', 'reclist', bp);
    const seen = new Set();
    const size = this.craftSize;
    const recs = RECIPES.filter((r) => {
      const k = r.result + ':' + JSON.stringify(r.pattern || r.ingredients);
      if (seen.has(k)) return false; seen.add(k);
      return true;
    }).map((r) => ({ r, ok: this.canCraft(r), fits: r.type === 'shapeless' ? r.ingredients.length <= size * size : (r.w <= size && r.h <= size) }));
    recs.sort((a, b) => (b.ok && b.fits) - (a.ok && a.fits) || b.fits - a.fits);
    for (const { r, ok, fits } of recs) {
      const card = el('div', 'rcard' + (ok && fits ? ' ok' : ''), list);
      const g = el('div', 'rgrid', card);
      const w = r.type === 'shapeless' ? Math.min(3, r.ingredients.length) : r.w;
      g.style.gridTemplateColumns = `repeat(${w}, 22px)`;
      const cells = [];
      if (r.type === 'shapeless') r.ingredients.forEach((ing) => cells.push(ing));
      else for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const ch = r.pattern[y][x] || ' '; cells.push(ch === ' ' ? null : r.key[ch]); }
      for (const ing of cells) {
        const c = el('div', 'rcell', g);
        if (ing !== null) { const im = el('img', '', c); im.src = getIcon(this.ingredientIcon(ing)); }
      }
      el('div', 'rarrow', card, '→');
      const res = el('div', 'rres', card);
      const im = el('img', '', res); im.src = getIcon(r.result);
      if (r.count > 1) el('span', 'count', res, r.count);
      card.title = itemName(r.result) + (fits ? '' : ' (needs a Crafting Table)');
      card.onclick = () => { this.game.audio.play('click'); this.fillRecipe(r); };
    }
  }

  openInventory() {
    const g = this.game;
    if (g.player.mode === 'creative') return this.openCreative();
    const p = this.openPanel('inventory');
    el('div', 'title', p, 'Crafting');
    const top = el('div', 'row', p);
    const preview = el('div', 'player-preview', top);
    preview.innerHTML = '<div class="pp-head"></div><div class="pp-body"></div><div class="pp-legs"></div>';
    this.craftingSection(top, 2);
    el('div', 'title', p, 'Inventory');
    this.inventorySection(p);
    this.addRecipeBook(p);
    this.refresh();
  }

  openCrafting() {
    const p = this.openPanel('crafting');
    el('div', 'title', p, 'Crafting Table');
    const top = el('div', 'row center', p);
    this.craftingSection(top, 3);
    el('div', 'title', p, 'Inventory');
    this.inventorySection(p);
    this.addRecipeBook(p);
    this.refresh();
  }

  openChest(tile) {
    this.craftOut = null;
    const p = this.openPanel('chest');
    el('div', 'title', p, 'Chest');
    this.chestItems = tile.items;
    const grid = el('div', 'grid g9', p);
    const cont = this.arrContainer(tile.items, 'chest');
    for (let i = 0; i < 27; i++) this.makeSlot(grid, cont, i);
    el('div', 'title', p, 'Inventory');
    this.inventorySection(p);
    this.refresh();
  }

  openFurnace(tile) {
    this.craftOut = null;
    this.furnace = tile;
    const p = this.openPanel('furnace');
    el('div', 'title', p, 'Furnace');
    const row = el('div', 'furnace', p);
    const left = el('div', 'fcol', row);
    const items = tile.items;
    this.makeSlot(left, this.arrContainer(items, 'furnace'), 0);
    this.flameEl = el('div', 'flame', left); el('div', 'flamefill', this.flameEl);
    this.makeSlot(left, this.arrContainer(items, 'furnace', (id) => !!FUEL[id]), 1);
    this.progEl = el('div', 'progress', row); el('div', 'progfill', this.progEl);
    const out = { kind: 'output', furnace: true, get: () => items[2], set: (i, s) => { items[2] = s; } };
    this.makeSlot(row, out, 0, 'big');
    el('div', 'title', p, 'Inventory');
    this.inventorySection(p);
    this.refresh();
  }

  updateFurnaceUI() {
    const t = this.furnace;
    if (!t || !this.flameEl) return;
    this.flameEl.firstChild.style.height = (t.burnMax ? t.burn / t.burnMax * 100 : 0) + '%';
    this.progEl.firstChild.style.width = (t.cook / 10 * 100) + '%';
  }

  openCreative() {
    this.craftOut = null;
    const p = this.openPanel('creative', 'wide');
    const head = el('div', 'row between', p);
    el('div', 'title', head, 'Creative Inventory');
    const search = el('input', 'search', head);
    search.placeholder = 'Search items...';
    const tabs = el('div', 'tabs', p);
    const grid = el('div', 'grid g9 palette', p);
    const all = [];
    for (let id = 1; id < 256; id++) if (BLOCKS[id] && !BLOCKS[id].hidden && id !== B.WATER && id !== B.LAVA && id !== B.FURNACE_LIT) all.push(id);
    for (let id = 256; id < ITEMS.length; id++) if (ITEMS[id]) all.push(id);
    const cats = {
      All: () => true,
      Building: (id) => id < 256 && RENDER[id] === RT_CUBE,
      Nature: (id) => id < 256 && (RENDER[id] !== RT_CUBE || [B.GRASS, B.DIRT, B.SAND, B.GRAVEL, B.SNOW, B.ICE, B.CLAY, B.OAK_LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.CACTUS, B.PUMPKIN].includes(id)),
      Tools: (id) => id >= 256 && !!ITEMS[id].tool || id === I.FLINT_AND_STEEL || id === I.BUCKET || id === I.WATER_BUCKET,
      Items: (id) => id >= 256,
    };
    let cat = 'All';
    const render = () => {
      grid.innerHTML = '';
      this.slotEls = this.slotEls.filter((o) => o.container.kind !== 'palette');
      const q = search.value.trim().toLowerCase();
      const list = all.filter((id) => cats[cat](id) && (!q || itemName(id).toLowerCase().includes(q)));
      const pal = { kind: 'palette', get: (i) => ({ id: list[i], count: 1 }), set: () => {} };
      list.forEach((id, i) => this.makeSlot(grid, pal, i));
      this.refresh();
    };
    for (const k in cats) {
      const b = el('button', 'tab' + (k === cat ? ' active' : ''), tabs, k);
      b.onclick = () => { cat = k; tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.textContent === k)); render(); };
    }
    search.addEventListener('input', render);
    search.addEventListener('keydown', (e) => e.stopPropagation());
    el('div', 'title', p, 'Inventory');
    const invRow = el('div', 'row', p);
    const invWrap = el('div', '', invRow);
    this.inventorySection(invWrap);
    const trash = el('div', 'trashwrap', invRow);
    el('div', 'small', trash, 'Delete');
    this.makeSlot(trash, { kind: 'trash', get: () => null, set: () => {} }, 0, 'trash');
    render();
  }

  // ---- Menu screens ------------------------------------------------------------------------
  button(parent, text, fn, cls) { const b = el('button', 'btn ' + (cls || ''), parent, text); b.onclick = () => { this.game.audio.init(); this.game.audio.play('click'); fn(); }; return b; }

  showMainMenu() {
    this.root.innerHTML = ''; this.root.className = 'open menu-bg';
    this.screen = 'main';
    const m = el('div', 'menu', this.root);
    const logo = el('div', 'logo', m);
    if (!this.logoUrl) this.logoUrl = renderLogo().toDataURL();
    const img = el('img', 'logo-img', logo); img.src = this.logoUrl; img.alt = 'Blockhaven'; img.draggable = false;
    el('div', 'splash', logo, SPLASHES[Math.floor(Math.random() * SPLASHES.length)]);
    this.button(m, 'Singleplayer', () => this.showWorlds());
    this.button(m, 'Options...', () => this.showOptions(() => this.showMainMenu()));
    this.button(m, 'Controls', () => this.showControls(() => this.showMainMenu()));
    el('div', 'footer', this.root, 'Blockhaven v1.0 — a voxel sandbox. Not affiliated with Mojang or Microsoft.');
  }

  showWorlds() {
    const g = this.game;
    this.root.innerHTML = ''; this.root.className = 'open menu-bg dim';
    this.screen = 'worlds';
    const m = el('div', 'menu wide', this.root);
    el('div', 'heading', m, 'Select World');
    const list = el('div', 'worldlist', m);
    const worlds = SaveManager.listWorlds();
    let selected = worlds.length ? worlds[0].id : null;
    const renderList = () => {
      list.innerHTML = '';
      if (!worlds.length) el('div', 'empty', list, 'No worlds yet. Create one!');
      for (const w of worlds) {
        const it = el('div', 'world' + (w.id === selected ? ' sel' : ''), list);
        el('div', 'wname', it, w.name);
        el('div', 'wmeta', it, `${w.mode === 'creative' ? 'Creative' : 'Survival'} · Seed ${w.seed} · ${new Date(w.lastPlayed).toLocaleString()}`);
        it.onclick = () => { selected = w.id; renderList(); };
        it.ondblclick = () => g.startWorld(w.id);
      }
    };
    renderList();
    const row1 = el('div', 'row center', m);
    this.button(row1, 'Play Selected World', () => { if (selected) g.startWorld(selected); });
    this.button(row1, 'Create New World', () => this.showCreate());
    const row2 = el('div', 'row center', m);
    this.button(row2, 'Delete', () => {
      if (!selected) return;
      const w = worlds.find((x) => x.id === selected);
      if (confirm(`Delete world "${w.name}"? This cannot be undone.`)) { SaveManager.deleteWorld(selected); this.showWorlds(); }
    }, 'half');
    this.button(row2, 'Cancel', () => this.showMainMenu(), 'half');
  }

  showCreate() {
    const g = this.game;
    this.root.innerHTML = ''; this.root.className = 'open menu-bg dim';
    this.screen = 'create';
    const m = el('div', 'menu', this.root);
    el('div', 'heading', m, 'Create New World');
    el('label', 'lbl', m, 'World Name');
    const name = el('input', 'textin', m); name.value = 'New World';
    el('label', 'lbl', m, 'Seed (leave blank for random)');
    const seed = el('input', 'textin', m);
    let mode = 'survival';
    const mb = this.button(m, 'Game Mode: Survival', () => { mode = mode === 'survival' ? 'creative' : 'survival'; mb.textContent = 'Game Mode: ' + (mode === 'survival' ? 'Survival' : 'Creative'); });
    el('div', 'hint', m, 'Survival: gather resources, craft, fight mobs. Creative: unlimited blocks and flight.');
    const row = el('div', 'row center', m);
    this.button(row, 'Create World', () => {
      let s = seed.value.trim();
      let sv;
      if (!s) sv = Math.floor(Math.random() * 2147483647);
      else if (/^-?\d+$/.test(s)) sv = parseInt(s, 10) | 0;
      else sv = strHash(s);
      const id = SaveManager.createWorld(name.value.trim() || 'New World', sv, mode);
      g.startWorld(id);
    }, 'half');
    this.button(row, 'Cancel', () => this.showWorlds(), 'half');
    name.focus(); name.select();
  }

  showPause() {
    const g = this.game;
    this.root.innerHTML = ''; this.root.className = 'open dim';
    this.screen = 'pause';
    g.unlockPointer();
    const m = el('div', 'menu', this.root);
    el('div', 'heading', m, 'Game Menu');
    this.button(m, 'Back to Game', () => this.close());
    const mb = this.button(m, 'Game Mode: ' + (g.player.mode === 'creative' ? 'Creative' : 'Survival'), () => {
      g.setMode(g.player.mode === 'creative' ? 'survival' : 'creative');
      mb.textContent = 'Game Mode: ' + (g.player.mode === 'creative' ? 'Creative' : 'Survival');
    });
    const row = el('div', 'row center', m);
    this.button(row, 'Options...', () => this.showOptions(() => this.showPause()), 'half');
    this.button(row, 'Controls', () => this.showControls(() => this.showPause()), 'half');
    this.button(m, 'Save and Quit to Title', () => g.quitToTitle());
  }

  showOptions(back) {
    const g = this.game, s = g.settings;
    this.root.innerHTML = ''; this.root.className = 'open dim' + (g.state === 'menu' ? ' menu-bg' : '');
    this.screen = 'options';
    const m = el('div', 'menu wide', this.root);
    el('div', 'heading', m, 'Options');
    const grid = el('div', 'optgrid', m);
    const slider = (label, key, min, max, step, fmt) => {
      const w = el('div', 'slider', grid);
      const lab = el('div', 'slabel', w);
      const inp = el('input', '', w); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = s[key];
      const upd = () => { lab.textContent = label + ': ' + fmt(+inp.value); };
      inp.oninput = () => { s[key] = +inp.value; upd(); g.applySettings(); };
      upd();
    };
    const toggle = (label, key) => {
      const b = this.button(grid, '', () => { s[key] = !s[key]; upd(); g.applySettings(); });
      const upd = () => { b.textContent = label + ': ' + (s[key] ? 'ON' : 'OFF'); };
      upd();
    };
    slider('Render Distance', 'renderDist', 3, 16, 1, (v) => v + ' chunks');
    slider('FOV', 'fov', 50, 110, 1, (v) => v === 70 ? 'Normal' : v);
    slider('Sensitivity', 'sensitivity', 20, 200, 1, (v) => v + '%');
    slider('Brightness', 'brightness', 0, 100, 1, (v) => v === 0 ? 'Moody' : v === 100 ? 'Bright' : v + '%');
    slider('Music', 'music', 0, 100, 1, (v) => v ? v + '%' : 'OFF');
    slider('Sound', 'sound', 0, 100, 1, (v) => v ? v + '%' : 'OFF');
    toggle('View Bobbing', 'bobbing');
    toggle('Clouds', 'clouds');
    toggle('Invert Mouse', 'invertY');
    toggle('Show FPS', 'showFps');
    this.button(m, 'Done', () => { g.saveSettings(); back(); });
  }

  showControls(back) {
    this.root.innerHTML = ''; this.root.className = 'open dim' + (this.game.state === 'menu' ? ' menu-bg' : '');
    this.screen = 'controls';
    const m = el('div', 'menu wide', this.root);
    el('div', 'heading', m, 'Controls');
    const t = el('div', 'controls', m);
    const rows = [
      ['W A S D', 'Move'], ['Space', 'Jump / swim up / fly up'], ['Shift', 'Sneak / fly down'], ['Ctrl or double-tap W', 'Sprint'],
      ['Left Click', 'Break block / attack'], ['Right Click', 'Place block / use / eat'], ['Middle Click', 'Pick block'],
      ['1-9 / Mouse Wheel', 'Select hotbar slot'], ['E', 'Inventory'], ['Q', 'Drop item (Ctrl+Q: whole stack)'],
      ['Double-tap Space', 'Toggle flying (Creative)'], ['F3', 'Debug info'], ['F5', 'Toggle camera perspective'], ['F1', 'Hide HUD'],
      ['Esc', 'Pause menu'], ['Shift + Click', 'Quick-move items'], ['Right Click (in GUI)', 'Split stack / place one'],
    ];
    for (const [k, v] of rows) { const r = el('div', 'crow', t); el('span', 'key', r, k); el('span', '', r, v); }
    this.button(m, 'Done', back);
  }

  showDeath(msg) {
    const g = this.game;
    this.root.innerHTML = ''; this.root.className = 'open death';
    this.screen = 'death';
    g.unlockPointer();
    const m = el('div', 'menu', this.root);
    el('div', 'heading big', m, 'You Died!');
    el('div', 'deathmsg', m, msg);
    this.button(m, 'Respawn', () => { this.screen = null; this.root.innerHTML = ''; this.root.className = ''; g.player.respawn(g); g.lockPointer(); });
    this.button(m, 'Title Screen', () => { g.player.respawn(g); g.quitToTitle(); });
  }

  showLoading(text, pct) {
    const l = document.getElementById('loading');
    l.style.display = 'flex';
    l.querySelector('.ltext').textContent = text;
    l.querySelector('.lfill').style.width = Math.round(pct * 100) + '%';
  }
  hideLoading() { document.getElementById('loading').style.display = 'none'; }
}

function addToArray(arr, st) {
  let left = st;
  for (let pass = 0; pass < 2 && left; pass++) for (let k = 0; k < arr.length && left; k++) {
    const t = arr[k];
    if (pass === 0 && stackable(t, left)) { const n = Math.min(left.count, maxStack(t.id) - t.count); t.count += n; left.count -= n; if (left.count <= 0) left = null; }
    else if (pass === 1 && !t) { arr[k] = left; left = null; }
  }
  return left;
}
