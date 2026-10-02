'use strict';
// ---------------------------------------------------------------------------
// Crafting recipes, smelting and fuel
// ---------------------------------------------------------------------------

const GROUPS = {
  planks: [B.OAK_PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS],
  logs: [B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG],
  wool: [B.WOOL_WHITE, B.WOOL_RED, B.WOOL_ORANGE, B.WOOL_YELLOW, B.WOOL_LIME, B.WOOL_BLUE, B.WOOL_CYAN, B.WOOL_PURPLE, B.WOOL_BLACK, B.WOOL_GRAY, B.WOOL_PINK, B.WOOL_BROWN],
  stone: [B.COBBLE],
};

const RECIPES = [];
function shaped(pattern, key, result, count = 1) {
  RECIPES.push({ type: 'shaped', pattern, key, result, count, w: Math.max(...pattern.map((r) => r.length)), h: pattern.length });
}
function shapeless(ingredients, result, count = 1) { RECIPES.push({ type: 'shapeless', ingredients, result, count }); }

function ingredientMatches(ing, id) {
  if (ing === undefined || ing === null) return id === 0;
  if (typeof ing === 'string') return GROUPS[ing].includes(id);
  return ing === id;
}

// Basic materials
shapeless([B.OAK_LOG], B.OAK_PLANKS, 4);
shapeless([B.BIRCH_LOG], B.BIRCH_PLANKS, 4);
shapeless([B.SPRUCE_LOG], B.SPRUCE_PLANKS, 4);
shaped(['P', 'P'], { P: 'planks' }, I.STICK, 4);
shaped(['PP', 'PP'], { P: 'planks' }, B.CRAFTING_TABLE);
shaped(['CCC', 'C C', 'CCC'], { C: B.COBBLE }, B.FURNACE);
shaped(['PPP', 'P P', 'PPP'], { P: 'planks' }, B.CHEST);
shaped(['C', 'S'], { C: I.COAL, S: I.STICK }, B.TORCH, 4);
shaped(['SS', 'SS'], { S: B.SAND }, B.SANDSTONE);
shaped(['SS', 'SS'], { S: B.STONE }, B.STONE_BRICKS, 4);
shaped(['PPP', 'BBB', 'PPP'], { P: 'planks', B: I.STICK }, B.BOOKSHELF);
shaped(['GSG', 'SGS', 'GSG'], { G: I.GUNPOWDER, S: B.SAND }, B.TNT);
shaped(['I I', ' I '], { I: I.IRON_INGOT }, I.BUCKET);
shapeless([I.IRON_INGOT, I.FLINT], I.FLINT_AND_STEEL);
shapeless([B.COBBLE, B.OAK_LEAVES], B.MOSSY_COBBLE);
shapeless([I.GOLD_INGOT, I.COAL], B.GLOWSTONE);
shaped(['SS', 'SS'], { S: B.SNOW }, B.SNOW);
shaped(['W', 'W', 'W'], { W: I.WHEAT_SEEDS }, I.BREAD);
shaped(['WWW', 'PPP'], { W: 'wool', P: 'planks' }, B.BED);
// dyes via flowers
shapeless([B.WOOL_WHITE, B.DANDELION], B.WOOL_YELLOW);
shapeless([B.WOOL_WHITE, B.ROSE], B.WOOL_RED);
shapeless([B.WOOL_WHITE, I.COAL], B.WOOL_BLACK);
shapeless([B.WOOL_WHITE, B.OAK_LEAVES], B.WOOL_LIME);
shapeless([B.WOOL_RED, B.DANDELION], B.WOOL_ORANGE);
shapeless([B.WOOL_WHITE, B.ROSE, B.WOOL_WHITE], B.WOOL_PINK, 2);
shapeless([B.WOOL_WHITE, B.GRAVEL], B.WOOL_GRAY);
shapeless([B.WOOL_WHITE, B.DIRT], B.WOOL_BROWN);
shapeless([B.WOOL_WHITE, I.DIAMOND], B.WOOL_CYAN);
shapeless([B.WOOL_WHITE, B.ICE], B.WOOL_BLUE);
shapeless([B.WOOL_BLUE, B.ROSE], B.WOOL_PURPLE);
// tools
{
  const mats = { wooden: 'planks', stone: 'stone', iron: I.IRON_INGOT, golden: I.GOLD_INGOT, diamond: I.DIAMOND };
  for (const m in mats) {
    const M = mats[m];
    shaped(['MMM', ' S ', ' S '], { M, S: I.STICK }, TOOLS[m + '_pickaxe']);
    shaped(['MM', 'MS', ' S'], { M, S: I.STICK }, TOOLS[m + '_axe']);
    shaped(['M', 'S', 'S'], { M, S: I.STICK }, TOOLS[m + '_shovel']);
    shaped(['M', 'M', 'S'], { M, S: I.STICK }, TOOLS[m + '_sword']);
  }
}

// grid: array of stacks (or null), size w x w
function matchRecipe(grid, gw) {
  let minX = gw, minY = gw, maxX = -1, maxY = -1, count = 0;
  const ids = [];
  for (let y = 0; y < gw; y++) for (let x = 0; x < gw; x++) {
    const s = grid[y * gw + x];
    if (s) { count++; ids.push(s.id); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  if (!count) return null;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  for (const r of RECIPES) {
    if (r.type === 'shapeless') {
      if (r.ingredients.length !== count) continue;
      const left = ids.slice();
      let ok = true;
      for (const ing of r.ingredients) {
        const k = left.findIndex((id) => ingredientMatches(ing, id));
        if (k < 0) { ok = false; break; }
        left.splice(k, 1);
      }
      if (ok) return { id: r.result, count: r.count };
      continue;
    }
    if (r.w !== w || r.h !== h) continue;
    for (const mirror of [false, true]) {
      let ok = true;
      for (let y = 0; y < h && ok; y++) for (let x = 0; x < w && ok; x++) {
        const px = mirror ? w - 1 - x : x;
        const ch = (r.pattern[y][px] || ' ');
        const ing = ch === ' ' ? null : r.key[ch];
        const s = grid[(y + minY) * gw + (x + minX)];
        if (!ingredientMatches(ing, s ? s.id : 0)) ok = false;
      }
      if (ok) return { id: r.result, count: r.count };
    }
  }
  return null;
}

const SMELTING = {
  [B.COBBLE]: B.STONE, [B.SAND]: B.GLASS, [B.IRON_ORE]: I.IRON_INGOT, [B.GOLD_ORE]: I.GOLD_INGOT,
  [B.OAK_LOG]: I.COAL, [B.BIRCH_LOG]: I.COAL, [B.SPRUCE_LOG]: I.COAL, [B.CLAY]: B.BRICKS,
  [I.PORKCHOP]: I.COOKED_PORKCHOP, [I.MUTTON]: I.COOKED_MUTTON, [B.DIAMOND_ORE]: I.DIAMOND, [B.COAL_ORE]: I.COAL,
  [B.STONE_BRICKS]: B.STONE, [B.SANDSTONE]: B.SAND,
};
const FUEL = {
  [I.COAL]: 80, [B.OAK_PLANKS]: 15, [B.BIRCH_PLANKS]: 15, [B.SPRUCE_PLANKS]: 15, [B.OAK_LOG]: 15, [B.BIRCH_LOG]: 15,
  [B.SPRUCE_LOG]: 15, [I.STICK]: 5, [B.SAPLING_OAK]: 5, [B.SAPLING_BIRCH]: 5, [B.SAPLING_SPRUCE]: 5, [B.CRAFTING_TABLE]: 15, [B.CHEST]: 15, [B.BOOKSHELF]: 15,
};
for (const m of ['pickaxe', 'axe', 'shovel', 'sword']) FUEL[TOOLS['wooden_' + m]] = 10;

// ---------------------------------------------------------------------------
// Inventory model
// ---------------------------------------------------------------------------
function makeStack(id, count, dmg) { const s = { id, count }; if (dmg) s.dmg = dmg; return s; }
function cloneStack(s) { return s ? Object.assign({}, s) : null; }
function stackable(a, b) { return a && b && a.id === b.id && !a.dmg && !b.dmg && maxStack(a.id) > 1; }

class Inventory {
  constructor() { this.slots = new Array(36).fill(null); this.selected = 0; this.onChange = null; }
  held() { return this.slots[this.selected]; }
  heldId() { const h = this.held(); return h ? h.id : 0; }
  changed() { if (this.onChange) this.onChange(); }
  add(id, count, extra) {
    const max = maxStack(id);
    // merge first (hotbar then main)
    if (max > 1 && !(extra && extra.dmg)) {
      for (let i = 0; i < 36 && count > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && !s.dmg && s.count < max) { const n = Math.min(count, max - s.count); s.count += n; count -= n; }
      }
    }
    for (let i = 0; i < 36 && count > 0; i++) {
      if (!this.slots[i]) { const n = Math.min(count, max); this.slots[i] = makeStack(id, n, extra && extra.dmg); count -= n; }
    }
    this.changed();
    return count;
  }
  count(id) { let n = 0; for (const s of this.slots) if (s && s.id === id) n += s.count; return n; }
  consumeHeld(n = 1) {
    const s = this.held(); if (!s) return;
    s.count -= n; if (s.count <= 0) this.slots[this.selected] = null;
    this.changed();
  }
  damageHeld(amount = 1) {
    const s = this.held(); if (!s) return false;
    const def = itemDef(s.id);
    if (!def || !def.durability) return false;
    s.dmg = (s.dmg || 0) + amount;
    if (s.dmg >= def.durability) { this.slots[this.selected] = null; this.changed(); return true; }
    this.changed();
    return false;
  }
  serialize() { return { slots: this.slots.map(cloneStack), selected: this.selected }; }
  load(d) { if (!d) return; this.slots = d.slots.map(cloneStack); while (this.slots.length < 36) this.slots.push(null); this.selected = d.selected || 0; }
  clear() { this.slots.fill(null); this.changed(); }
}
