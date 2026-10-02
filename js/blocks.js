'use strict';
// ---------------------------------------------------------------------------
// Block & item registry
// ---------------------------------------------------------------------------

const B = {
  AIR: 0, STONE: 1, GRASS: 2, DIRT: 3, COBBLE: 4, OAK_PLANKS: 5, BEDROCK: 6, WATER: 7, LAVA: 8, SAND: 9,
  GRAVEL: 10, GOLD_ORE: 11, IRON_ORE: 12, COAL_ORE: 13, OAK_LOG: 14, OAK_LEAVES: 15, GLASS: 16, SANDSTONE: 17,
  BIRCH_LOG: 18, BIRCH_LEAVES: 19, SPRUCE_LOG: 20, SPRUCE_LEAVES: 21, BIRCH_PLANKS: 22, SPRUCE_PLANKS: 23,
  TALLGRASS: 24, DANDELION: 25, ROSE: 26, DEAD_BUSH: 27, CACTUS: 28, SNOW: 29, SNOW_GRASS: 30, ICE: 31,
  CLAY: 32, BRICKS: 33, STONE_BRICKS: 34, MOSSY_COBBLE: 35, BOOKSHELF: 36, OBSIDIAN: 37, GLOWSTONE: 38,
  CRAFTING_TABLE: 39, FURNACE: 40, FURNACE_LIT: 41, CHEST: 42, TORCH: 43, DIAMOND_ORE: 44, TNT: 45, FERN: 46,
  WOOL_WHITE: 47, WOOL_RED: 48, WOOL_ORANGE: 49, WOOL_YELLOW: 50, WOOL_LIME: 51, WOOL_BLUE: 52, WOOL_CYAN: 53,
  WOOL_PURPLE: 54, WOOL_BLACK: 55, WOOL_GRAY: 56, WOOL_PINK: 57, WOOL_BROWN: 58,
  SAPLING_OAK: 59, SAPLING_BIRCH: 60, SAPLING_SPRUCE: 61, BED: 62,
  BLUE_ORCHID: 63, ALLIUM: 64, AZURE_BLUET: 65, TULIP_RED: 66, TULIP_ORANGE: 67, TULIP_WHITE: 68, TULIP_PINK: 69,
  OXEYE_DAISY: 70, CORNFLOWER: 71, LILY_OF_THE_VALLEY: 72,
  TALL_GRASS: 73, TALL_GRASS_TOP: 74, LARGE_FERN: 75, LARGE_FERN_TOP: 76, SUNFLOWER: 77, SUNFLOWER_TOP: 78,
  LILAC: 79, LILAC_TOP: 80, ROSE_BUSH: 81, ROSE_BUSH_TOP: 82, PEONY: 83, PEONY_TOP: 84,
  BROWN_MUSHROOM: 85, RED_MUSHROOM: 86, SUGAR_CANE: 87, LILY_PAD: 88, PUMPKIN: 89, BERRY_BUSH: 90, BUSH: 91,
  JACK_O_LANTERN: 92, BERRY_BUSH_EMPTY: 93,
  FARMLAND: 94, WHEAT: 95, CARROTS: 96, POTATOES: 97, BEETROOTS: 98, PUMPKIN_STEM: 99, MELON_STEM: 100,
  MELON: 101, HAY_BALE: 102, COMPOSTER: 103, CAKE: 104,
};

const I = {
  STICK: 256, COAL: 257, IRON_INGOT: 258, GOLD_INGOT: 259, DIAMOND: 260, APPLE: 261, PORKCHOP: 262,
  COOKED_PORKCHOP: 263, MUTTON: 264, COOKED_MUTTON: 265, ROTTEN_FLESH: 266, GUNPOWDER: 267, FLINT: 268,
  FLINT_AND_STEEL: 269, BUCKET: 270, WATER_BUCKET: 271, BREAD: 272,
  // tools assigned below starting at 300
};

// Render types
const RT_NONE = 0, RT_CUBE = 1, RT_CROSS = 2, RT_TORCH = 3, RT_LIQUID = 4, RT_CACTUS = 5, RT_BED = 6, RT_FLAT = 7, RT_CROP = 8, RT_FARMLAND = 9, RT_CAKE = 10;

const BLOCKS = [];
function defBlock(id, d) {
  const def = Object.assign({
    id, name: 'Block', tex: 'stone', solid: true, opaque: true, render: RT_CUBE, trans: false, cutout: false,
    light: 0, filter: 15, hardness: 1, tool: null, tier: -1, drop: id, sound: 'stone', cullSame: false,
    replaceable: false, gravity: false, flammable: false, facing: false,
  }, d);
  if (!def.opaque && d.filter === undefined) def.filter = 0;
  BLOCKS[id] = def;
  return def;
}

defBlock(B.AIR, { name: 'Air', solid: false, opaque: false, render: RT_NONE, filter: 0, replaceable: true, hardness: 0 });
defBlock(B.STONE, { name: 'Stone', tex: 'stone', hardness: 1.5, tool: 'pickaxe', tier: 0, drop: B.COBBLE });
defBlock(B.GRASS, { name: 'Grass Block', tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, hardness: 0.6, tool: 'shovel', drop: B.DIRT, sound: 'grass' });
defBlock(B.DIRT, { name: 'Dirt', tex: 'dirt', hardness: 0.5, tool: 'shovel', sound: 'gravel' });
defBlock(B.COBBLE, { name: 'Cobblestone', tex: 'cobblestone', hardness: 2, tool: 'pickaxe', tier: 0 });
defBlock(B.OAK_PLANKS, { name: 'Oak Planks', tex: 'oak_planks', hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
defBlock(B.BEDROCK, { name: 'Bedrock', tex: 'bedrock', hardness: -1 });
defBlock(B.WATER, { name: 'Water', tex: 'water', solid: false, opaque: false, render: RT_LIQUID, trans: true, filter: 2, hardness: -1, replaceable: true, drop: 0, cullSame: true });
defBlock(B.LAVA, { name: 'Lava', tex: 'lava', solid: false, opaque: false, render: RT_LIQUID, light: 15, filter: 2, hardness: -1, replaceable: true, drop: 0, cullSame: true });
defBlock(B.SAND, { name: 'Sand', tex: 'sand', hardness: 0.5, tool: 'shovel', sound: 'sand', gravity: true });
defBlock(B.GRAVEL, { name: 'Gravel', tex: 'gravel', hardness: 0.6, tool: 'shovel', sound: 'gravel', gravity: true, drop: () => Math.random() < 0.1 ? I.FLINT : B.GRAVEL });
defBlock(B.GOLD_ORE, { name: 'Gold Ore', tex: 'gold_ore', hardness: 3, tool: 'pickaxe', tier: 2 });
defBlock(B.IRON_ORE, { name: 'Iron Ore', tex: 'iron_ore', hardness: 3, tool: 'pickaxe', tier: 1 });
defBlock(B.COAL_ORE, { name: 'Coal Ore', tex: 'coal_ore', hardness: 3, tool: 'pickaxe', tier: 0, drop: I.COAL });
defBlock(B.DIAMOND_ORE, { name: 'Diamond Ore', tex: 'diamond_ore', hardness: 3, tool: 'pickaxe', tier: 2, drop: I.DIAMOND });
defBlock(B.OAK_LOG, { name: 'Oak Log', tex: { top: 'oak_log_top', bottom: 'oak_log_top', side: 'oak_log' }, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
defBlock(B.OAK_LEAVES, { name: 'Oak Leaves', tex: 'oak_leaves', opaque: false, cutout: true, filter: 1, hardness: 0.2, sound: 'grass', drop: () => { const r = Math.random(); return r < 0.05 ? I.APPLE : r < 0.11 ? B.SAPLING_OAK : r < 0.14 ? I.STICK : 0; } });
defBlock(B.BIRCH_LOG, { name: 'Birch Log', tex: { top: 'birch_log_top', bottom: 'birch_log_top', side: 'birch_log' }, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
defBlock(B.BIRCH_LEAVES, { name: 'Birch Leaves', tex: 'birch_leaves', opaque: false, cutout: true, filter: 1, hardness: 0.2, sound: 'grass', drop: () => { const r = Math.random(); return r < 0.06 ? B.SAPLING_BIRCH : r < 0.09 ? I.STICK : 0; } });
defBlock(B.SPRUCE_LOG, { name: 'Spruce Log', tex: { top: 'spruce_log_top', bottom: 'spruce_log_top', side: 'spruce_log' }, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
defBlock(B.SPRUCE_LEAVES, { name: 'Spruce Leaves', tex: 'spruce_leaves', opaque: false, cutout: true, filter: 1, hardness: 0.2, sound: 'grass', drop: () => { const r = Math.random(); return r < 0.06 ? B.SAPLING_SPRUCE : r < 0.09 ? I.STICK : 0; } });
defBlock(B.BIRCH_PLANKS, { name: 'Birch Planks', tex: 'birch_planks', hardness: 2, tool: 'axe', sound: 'wood' });
defBlock(B.SPRUCE_PLANKS, { name: 'Spruce Planks', tex: 'spruce_planks', hardness: 2, tool: 'axe', sound: 'wood' });
defBlock(B.GLASS, { name: 'Glass', tex: 'glass', opaque: false, cutout: true, hardness: 0.3, sound: 'glass', drop: 0, cullSame: true });
defBlock(B.SANDSTONE, { name: 'Sandstone', tex: { top: 'sandstone_top', bottom: 'sandstone_top', side: 'sandstone_side' }, hardness: 0.8, tool: 'pickaxe', tier: 0 });
const plant = { solid: false, opaque: false, render: RT_CROSS, cutout: true, hardness: 0, sound: 'grass', replaceable: false };
defBlock(B.TALLGRASS, Object.assign({}, plant, { name: 'Grass', tex: 'tallgrass', replaceable: true, drop: () => Math.random() < 0.12 ? I.WHEAT_SEEDS : 0 }));
defBlock(B.FERN, Object.assign({}, plant, { name: 'Fern', tex: 'fern', replaceable: true, drop: 0 }));
defBlock(B.DANDELION, Object.assign({}, plant, { name: 'Dandelion', tex: 'dandelion' }));
defBlock(B.ROSE, Object.assign({}, plant, { name: 'Rose', tex: 'rose' }));
defBlock(B.DEAD_BUSH, Object.assign({}, plant, { name: 'Dead Bush', tex: 'dead_bush', replaceable: true, drop: () => Math.random() < 0.5 ? I.STICK : 0 }));
defBlock(B.CACTUS, { name: 'Cactus', tex: { top: 'cactus_top', bottom: 'cactus_bottom', side: 'cactus_side' }, opaque: false, render: RT_CACTUS, cutout: true, hardness: 0.4, sound: 'wool' });
defBlock(B.SNOW, { name: 'Snow Block', tex: 'snow', hardness: 0.2, tool: 'shovel', sound: 'snow' });
defBlock(B.SNOW_GRASS, { name: 'Snowy Grass', tex: { top: 'snow', bottom: 'dirt', side: 'grass_snow_side' }, hardness: 0.6, tool: 'shovel', drop: B.DIRT, sound: 'snow' });
defBlock(B.ICE, { name: 'Ice', tex: 'ice', opaque: false, trans: true, filter: 2, hardness: 0.5, tool: 'pickaxe', sound: 'glass', drop: 0, cullSame: true, slippery: true });
defBlock(B.CLAY, { name: 'Clay', tex: 'clay', hardness: 0.6, tool: 'shovel', sound: 'gravel' });
defBlock(B.BRICKS, { name: 'Bricks', tex: 'bricks', hardness: 2, tool: 'pickaxe', tier: 0 });
defBlock(B.STONE_BRICKS, { name: 'Stone Bricks', tex: 'stone_bricks', hardness: 1.5, tool: 'pickaxe', tier: 0 });
defBlock(B.MOSSY_COBBLE, { name: 'Mossy Cobblestone', tex: 'mossy_cobblestone', hardness: 2, tool: 'pickaxe', tier: 0 });
defBlock(B.BOOKSHELF, { name: 'Bookshelf', tex: { top: 'oak_planks', bottom: 'oak_planks', side: 'bookshelf' }, hardness: 1.5, tool: 'axe', sound: 'wood' });
defBlock(B.OBSIDIAN, { name: 'Obsidian', tex: 'obsidian', hardness: 50, tool: 'pickaxe', tier: 3 });
defBlock(B.GLOWSTONE, { name: 'Glowstone', tex: 'glowstone', light: 15, hardness: 0.3, sound: 'glass' });
defBlock(B.CRAFTING_TABLE, { name: 'Crafting Table', tex: { top: 'crafting_table_top', bottom: 'oak_planks', side: 'crafting_table_side' }, hardness: 2.5, tool: 'axe', sound: 'wood', interact: 'crafting' });
defBlock(B.FURNACE, { name: 'Furnace', tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front' }, hardness: 3.5, tool: 'pickaxe', tier: 0, interact: 'furnace', facing: true });
defBlock(B.FURNACE_LIT, { name: 'Furnace', tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front_lit' }, hardness: 3.5, tool: 'pickaxe', tier: 0, interact: 'furnace', facing: true, light: 13, drop: B.FURNACE });
defBlock(B.CHEST, { name: 'Chest', tex: { top: 'chest_top', bottom: 'chest_top', side: 'chest_side', front: 'chest_front' }, hardness: 2.5, tool: 'axe', sound: 'wood', interact: 'chest', facing: true });
defBlock(B.TORCH, { name: 'Torch', tex: 'torch', solid: false, opaque: false, render: RT_TORCH, cutout: true, light: 14, hardness: 0, sound: 'wood' });
defBlock(B.TNT, { name: 'TNT', tex: { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' }, hardness: 0, sound: 'grass' });
const WOOLS = ['white', 'red', 'orange', 'yellow', 'lime', 'blue', 'cyan', 'purple', 'black', 'gray', 'pink', 'brown'];
defBlock(B.SAPLING_OAK, Object.assign({}, plant, { name: 'Oak Sapling', tex: 'sapling_oak' }));
defBlock(B.SAPLING_BIRCH, Object.assign({}, plant, { name: 'Birch Sapling', tex: 'sapling_birch' }));
defBlock(B.SAPLING_SPRUCE, Object.assign({}, plant, { name: 'Spruce Sapling', tex: 'sapling_spruce' }));
defBlock(B.BED, { name: 'Bed', tex: { top: 'bed_top', bottom: 'oak_planks', side: 'bed_side' }, opaque: false, render: RT_BED, filter: 0, hardness: 0.2, sound: 'wool', interact: 'bed' });
// ---- Flowers & plants -------------------------------------------------------
const FLOWERS = [
  [B.BLUE_ORCHID, 'Blue Orchid', 'blue_orchid'], [B.ALLIUM, 'Allium', 'allium'], [B.AZURE_BLUET, 'Azure Bluet', 'azure_bluet'],
  [B.TULIP_RED, 'Red Tulip', 'tulip_red'], [B.TULIP_ORANGE, 'Orange Tulip', 'tulip_orange'], [B.TULIP_WHITE, 'White Tulip', 'tulip_white'],
  [B.TULIP_PINK, 'Pink Tulip', 'tulip_pink'], [B.OXEYE_DAISY, 'Oxeye Daisy', 'oxeye_daisy'], [B.CORNFLOWER, 'Cornflower', 'cornflower'],
  [B.LILY_OF_THE_VALLEY, 'Lily of the Valley', 'lily_of_the_valley'],
];
for (const [id, name, tex] of FLOWERS) defBlock(id, Object.assign({}, plant, { name, tex }));
// Two block tall plants: [lower, upper, name, texture base, drop of lower]
const DOUBLE_PLANTS = [
  [B.TALL_GRASS, B.TALL_GRASS_TOP, 'Tall Grass', 'tall_grass', () => Math.random() < 0.15 ? I.WHEAT_SEEDS : 0],
  [B.LARGE_FERN, B.LARGE_FERN_TOP, 'Large Fern', 'large_fern', 0],
  [B.SUNFLOWER, B.SUNFLOWER_TOP, 'Sunflower', 'sunflower', null],
  [B.LILAC, B.LILAC_TOP, 'Lilac', 'lilac', null],
  [B.ROSE_BUSH, B.ROSE_BUSH_TOP, 'Rose Bush', 'rose_bush', null],
  [B.PEONY, B.PEONY_TOP, 'Peony', 'peony', null],
];
const DOUBLE_LOWER = new Uint8Array(256), DOUBLE_UPPER = new Uint8Array(256);
for (const [lo, up, name, tex, drop] of DOUBLE_PLANTS) {
  defBlock(lo, Object.assign({}, plant, { name, tex: tex + '_bottom', icon: tex + '_top', replaceable: drop !== null, drop: drop === null ? lo : drop, upper: up }));
  defBlock(up, Object.assign({}, plant, { name, tex: tex + '_top', replaceable: drop !== null, drop: drop === null ? lo : drop, lower: lo, hidden: true }));
  DOUBLE_LOWER[lo] = up; DOUBLE_UPPER[up] = lo;
}
defBlock(B.BROWN_MUSHROOM, Object.assign({}, plant, { name: 'Brown Mushroom', tex: 'brown_mushroom', light: 1 }));
defBlock(B.RED_MUSHROOM, Object.assign({}, plant, { name: 'Red Mushroom', tex: 'red_mushroom' }));
defBlock(B.SUGAR_CANE, Object.assign({}, plant, { name: 'Sugar Cane', tex: 'sugar_cane' }));
defBlock(B.BUSH, Object.assign({}, plant, { name: 'Bush', tex: 'bush', replaceable: true, drop: () => Math.random() < 0.3 ? I.STICK : 0 }));
defBlock(B.BERRY_BUSH, Object.assign({}, plant, { name: 'Sweet Berry Bush', tex: 'berry_bush', interact: 'harvest', drop: () => I.SWEET_BERRIES }));
defBlock(B.BERRY_BUSH_EMPTY, Object.assign({}, plant, { name: 'Sweet Berry Bush', tex: 'berry_bush_empty', hidden: true, drop: () => I.SWEET_BERRIES }));
defBlock(B.LILY_PAD, { name: 'Lily Pad', tex: 'lily_pad', solid: false, opaque: false, render: RT_FLAT, cutout: true, hardness: 0, sound: 'grass' });
defBlock(B.PUMPKIN, { name: 'Pumpkin', tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side' }, hardness: 1, tool: 'axe', sound: 'wood' });
defBlock(B.JACK_O_LANTERN, { name: "Jack o'Lantern", tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side', front: 'jack_o_lantern' }, hardness: 1, tool: 'axe', sound: 'wood', light: 15, facing: true });

// ---- Farming ---------------------------------------------------------------
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
defBlock(B.FARMLAND, { name: 'Farmland', tex: { top: 'farmland_dry', bottom: 'dirt', side: 'dirt' }, metaTop: ['farmland_dry', 'farmland_wet', 'farmland_wet', 'farmland_wet', 'farmland_wet', 'farmland_wet', 'farmland_wet', 'farmland_wet'],
  opaque: false, filter: 15, render: RT_FARMLAND, hardness: 0.6, tool: 'shovel', sound: 'gravel', drop: B.DIRT });
const crop = (name, tex, stages, drops, extra) => Object.assign({ name, tex: tex + '_0', metaTex: Array.from({ length: 8 }, (_, m) => tex + '_' + Math.min(stages - 1, Math.floor(m * stages / 8))),
  solid: false, opaque: false, render: RT_CROP, cutout: true, hardness: 0, sound: 'grass', hidden: true, crop: true, drop: drops }, extra || {});
defBlock(B.WHEAT, crop('Wheat Crops', 'wheat_stage', 8, (m) => m >= 7 ? [[I.WHEAT, 1], [I.WHEAT_SEEDS, rnd(1, 3)]] : [[I.WHEAT_SEEDS, 1]]));
defBlock(B.CARROTS, crop('Carrots', 'carrots_stage', 4, (m) => [[I.CARROT, m >= 7 ? rnd(2, 4) : 1]]));
defBlock(B.POTATOES, crop('Potatoes', 'potatoes_stage', 4, (m) => [[I.POTATO, m >= 7 ? rnd(2, 4) : 1]]));
defBlock(B.BEETROOTS, crop('Beetroots', 'beetroots_stage', 4, (m) => m >= 7 ? [[I.BEETROOT, 1], [I.BEETROOT_SEEDS, rnd(1, 3)]] : [[I.BEETROOT_SEEDS, 1]]));
defBlock(B.PUMPKIN_STEM, crop('Pumpkin Stem', 'stem_stage', 8, () => [[I.PUMPKIN_SEEDS, 1]], { fruit: B.PUMPKIN }));
defBlock(B.MELON_STEM, crop('Melon Stem', 'stem_stage', 8, () => [[I.MELON_SEEDS, 1]], { fruit: B.MELON }));
defBlock(B.MELON, { name: 'Melon', tex: { top: 'melon_top', bottom: 'melon_top', side: 'melon_side' }, hardness: 1, tool: 'axe', sound: 'wood', drop: () => [[I.MELON_SLICE, rnd(3, 7)]] });
defBlock(B.HAY_BALE, { name: 'Hay Bale', tex: { top: 'hay_top', bottom: 'hay_top', side: 'hay_side' }, hardness: 0.5, sound: 'grass' });
defBlock(B.COMPOSTER, { name: 'Composter', tex: { top: 'composter_0', bottom: 'oak_planks', side: 'composter_side' }, hardness: 0.6, tool: 'axe', sound: 'wood', interact: 'composter',
  metaTop: ['composter_0', 'composter_1', 'composter_1', 'composter_2', 'composter_2', 'composter_3', 'composter_3', 'composter_4', 'composter_ready'] });
defBlock(B.CAKE, { name: 'Cake', tex: { top: 'cake_top', bottom: 'cake_bottom', side: 'cake_side' }, opaque: false, render: RT_CAKE, filter: 0, hardness: 0.5, sound: 'wool', interact: 'cake', drop: 0, hidden: true });

WOOLS.forEach((w, i) => defBlock(B.WOOL_WHITE + i, { name: w[0].toUpperCase() + w.slice(1) + ' Wool', tex: 'wool_' + w, hardness: 0.8, sound: 'wool' }));

// ---- Items -----------------------------------------------------------------
const ITEMS = [];
I.WHEAT_SEEDS = 273; I.PAPER = 274; I.BOWL = 275; I.MUSHROOM_STEW = 276; I.SWEET_BERRIES = 277; I.PUMPKIN_PIE = 278;
Object.assign(I, {
  WHEAT: 279, CARROT: 280, POTATO: 281, BAKED_POTATO: 282, BEETROOT: 283, BEETROOT_SEEDS: 284, BEETROOT_SOUP: 285,
  PUMPKIN_SEEDS: 286, MELON_SEEDS: 287, MELON_SLICE: 288, SUGAR: 289, EGG: 290, FEATHER: 291, LEATHER: 292,
  BEEF: 293, STEAK: 294, CHICKEN: 295, COOKED_CHICKEN: 296, MILK_BUCKET: 297, BONE: 298, BONE_MEAL: 299,
  CAKE: 320, SHEARS: 321, COOKIE: 322, BOOK: 323,
});
function defItem(id, d) {
  ITEMS[id] = Object.assign({ id, name: 'Item', tile: 'stick', stack: 64 }, d);
  return ITEMS[id];
}
defItem(I.STICK, { name: 'Stick', tile: 'stick' });
defItem(I.COAL, { name: 'Coal', tile: 'coal' });
defItem(I.IRON_INGOT, { name: 'Iron Ingot', tile: 'iron_ingot' });
defItem(I.GOLD_INGOT, { name: 'Gold Ingot', tile: 'gold_ingot' });
defItem(I.DIAMOND, { name: 'Diamond', tile: 'diamond' });
defItem(I.APPLE, { name: 'Apple', tile: 'apple', food: 4 });
defItem(I.PORKCHOP, { name: 'Raw Porkchop', tile: 'porkchop', food: 3 });
defItem(I.COOKED_PORKCHOP, { name: 'Cooked Porkchop', tile: 'cooked_porkchop', food: 8 });
defItem(I.MUTTON, { name: 'Raw Mutton', tile: 'mutton', food: 2 });
defItem(I.COOKED_MUTTON, { name: 'Cooked Mutton', tile: 'cooked_mutton', food: 6 });
defItem(I.ROTTEN_FLESH, { name: 'Rotten Flesh', tile: 'rotten_flesh', food: 2 });
defItem(I.BREAD, { name: 'Bread', tile: 'bread', food: 5 });
defItem(I.GUNPOWDER, { name: 'Gunpowder', tile: 'gunpowder' });
defItem(I.FLINT, { name: 'Flint', tile: 'flint' });
defItem(I.FLINT_AND_STEEL, { name: 'Flint and Steel', tile: 'flint_and_steel', stack: 1, durability: 64 });
defItem(I.BUCKET, { name: 'Bucket', tile: 'bucket', stack: 16 });
defItem(I.WATER_BUCKET, { name: 'Water Bucket', tile: 'water_bucket', stack: 1 });
defItem(I.WHEAT_SEEDS, { name: 'Wheat Seeds', tile: 'wheat_seeds', places: B.WHEAT });
defItem(I.PAPER, { name: 'Paper', tile: 'paper' });
defItem(I.BOWL, { name: 'Bowl', tile: 'bowl' });
defItem(I.MUSHROOM_STEW, { name: 'Mushroom Stew', tile: 'mushroom_stew', stack: 1, food: 6, returns: I.BOWL });
defItem(I.SWEET_BERRIES, { name: 'Sweet Berries', tile: 'sweet_berries', food: 2, places: B.BERRY_BUSH });
defItem(I.PUMPKIN_PIE, { name: 'Pumpkin Pie', tile: 'pumpkin_pie', food: 8 });
defItem(I.WHEAT, { name: 'Wheat', tile: 'wheat' });
defItem(I.CARROT, { name: 'Carrot', tile: 'carrot', food: 3, places: B.CARROTS });
defItem(I.POTATO, { name: 'Potato', tile: 'potato', food: 1, places: B.POTATOES });
defItem(I.BAKED_POTATO, { name: 'Baked Potato', tile: 'baked_potato', food: 5 });
defItem(I.BEETROOT, { name: 'Beetroot', tile: 'beetroot', food: 1 });
defItem(I.BEETROOT_SEEDS, { name: 'Beetroot Seeds', tile: 'beetroot_seeds', places: B.BEETROOTS });
defItem(I.BEETROOT_SOUP, { name: 'Beetroot Soup', tile: 'beetroot_soup', stack: 1, food: 6, returns: I.BOWL });
defItem(I.PUMPKIN_SEEDS, { name: 'Pumpkin Seeds', tile: 'pumpkin_seeds', places: B.PUMPKIN_STEM });
defItem(I.MELON_SEEDS, { name: 'Melon Seeds', tile: 'melon_seeds', places: B.MELON_STEM });
defItem(I.MELON_SLICE, { name: 'Melon Slice', tile: 'melon_slice', food: 2 });
defItem(I.SUGAR, { name: 'Sugar', tile: 'sugar' });
defItem(I.EGG, { name: 'Egg', tile: 'egg', stack: 16 });
defItem(I.FEATHER, { name: 'Feather', tile: 'feather' });
defItem(I.LEATHER, { name: 'Leather', tile: 'leather' });
defItem(I.BEEF, { name: 'Raw Beef', tile: 'beef', food: 3 });
defItem(I.STEAK, { name: 'Steak', tile: 'steak', food: 8 });
defItem(I.CHICKEN, { name: 'Raw Chicken', tile: 'chicken', food: 2 });
defItem(I.COOKED_CHICKEN, { name: 'Cooked Chicken', tile: 'cooked_chicken', food: 6 });
defItem(I.MILK_BUCKET, { name: 'Milk Bucket', tile: 'milk_bucket', stack: 1, food: 0, drink: true, returns: I.BUCKET });
defItem(I.BONE, { name: 'Bone', tile: 'bone' });
defItem(I.BONE_MEAL, { name: 'Bone Meal', tile: 'bone_meal', bonemeal: true });
defItem(I.CAKE, { name: 'Cake', tile: 'cake_item', stack: 1, places: B.CAKE });
defItem(I.SHEARS, { name: 'Shears', tile: 'shears', stack: 1, durability: 238, tool: 'shears', tier: 0, speed: 1.5, damage: 1 });
defItem(I.COOKIE, { name: 'Cookie', tile: 'cookie', food: 2 });
defItem(I.BOOK, { name: 'Book', tile: 'book' });

const TOOL_MATS = [
  { key: 'wooden', name: 'Wooden', tier: 0, speed: 2, dur: 59, dmg: 0 },
  { key: 'stone', name: 'Stone', tier: 1, speed: 4, dur: 131, dmg: 1 },
  { key: 'iron', name: 'Iron', tier: 2, speed: 6, dur: 250, dmg: 2 },
  { key: 'golden', name: 'Golden', tier: 0, speed: 12, dur: 32, dmg: 0 },
  { key: 'diamond', name: 'Diamond', tier: 3, speed: 8, dur: 1561, dmg: 3 },
];
const TOOL_TYPES = [
  { key: 'pickaxe', name: 'Pickaxe', dmg: 2 },
  { key: 'axe', name: 'Axe', dmg: 3 },
  { key: 'shovel', name: 'Shovel', dmg: 1.5 },
  { key: 'sword', name: 'Sword', dmg: 4 },
];
const TOOLS = {}; // 'iron_pickaxe' -> id
{
  let id = 300;
  for (const m of TOOL_MATS) for (const t of TOOL_TYPES) {
    defItem(id, {
      name: m.name + ' ' + t.name, tile: m.key + '_' + t.key, stack: 1, durability: m.dur,
      tool: t.key, tier: m.tier, speed: m.speed, damage: 1 + t.dmg + m.dmg,
    });
    TOOLS[m.key + '_' + t.key] = id++;
  }
  // hoes were added later; keep earlier ids stable for old saves
  let hid = 324;
  for (const m of TOOL_MATS) {
    defItem(hid, { name: m.name + ' Hoe', tile: m.key + '_hoe', stack: 1, durability: m.dur, tool: 'hoe', tier: m.tier, speed: m.speed, damage: 1 });
    TOOLS[m.key + '_hoe'] = hid++;
  }
}

// Items that the composter accepts and their chance to raise the level
const COMPOST = {};
for (const id of [I.WHEAT_SEEDS, I.BEETROOT_SEEDS, I.PUMPKIN_SEEDS, I.MELON_SEEDS, B.TALLGRASS, B.OAK_LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES,
  B.SAPLING_OAK, B.SAPLING_BIRCH, B.SAPLING_SPRUCE, I.SWEET_BERRIES, B.FERN, B.BUSH]) COMPOST[id] = 0.3;
for (const id of [B.CACTUS, B.SUGAR_CANE, I.MELON_SLICE, B.TALL_GRASS, B.LILY_PAD, B.DEAD_BUSH]) COMPOST[id] = 0.5;
for (const id of [I.WHEAT, I.CARROT, I.POTATO, I.BEETROOT, B.PUMPKIN, B.MELON, B.BROWN_MUSHROOM, B.RED_MUSHROOM, B.DANDELION, B.ROSE, B.LARGE_FERN]) COMPOST[id] = 0.65;
for (const id of [I.BREAD, I.BAKED_POTATO, I.COOKIE, B.HAY_BALE]) COMPOST[id] = 0.85;
for (const id of [I.PUMPKIN_PIE, I.CAKE]) COMPOST[id] = 1;

function isBlockId(id) { return id > 0 && id < 256; }
function itemName(id) { return id < 256 ? (BLOCKS[id] ? BLOCKS[id].name : '?') : (ITEMS[id] ? ITEMS[id].name : '?'); }
function maxStack(id) { return id < 256 ? 64 : (ITEMS[id] ? ITEMS[id].stack : 64); }
function itemDef(id) { return id < 256 ? null : ITEMS[id]; }

// ---- Fast lookup tables (filled after atlas exists) -----------------------
const OPAQUE = new Uint8Array(256);
const SOLID = new Uint8Array(256);
const RENDER = new Uint8Array(256);
const EMIT = new Uint8Array(256);
const FILTER = new Uint8Array(256);
const TRANS = new Uint8Array(256);
const TINT = new Uint8Array(256);  // biome-tinted greens
const CULLSAME = new Uint8Array(256);
const FACE_TEX = new Uint16Array(256 * 6);
const BLOCK_TOP = new Float32Array(256).fill(1);  // collision height
BLOCK_TOP[62] = 0.5625; BLOCK_TOP[94] = 0.9375; BLOCK_TOP[104] = 0.5;    // face order: +x,-x,+y,-y,+z,-z
const FRONT_TEX = new Uint16Array(256);
const META_TEX = new Uint16Array(256 * 9);   // per-meta texture (crop stages, farmland, composter level)
const HAS_META_TEX = new Uint8Array(256);
// facing meta (0..3) -> face index that shows the "front" texture
const FACING_FACE = [4, 1, 5, 0];

function initBlockTables() {
  for (let id = 0; id < 256; id++) {
    const b = BLOCKS[id];
    if (!b) { FILTER[id] = 15; continue; }
    OPAQUE[id] = b.opaque ? 1 : 0;
    SOLID[id] = b.solid ? 1 : 0;
    RENDER[id] = b.render;
    EMIT[id] = b.light;
    FILTER[id] = b.opaque ? 15 : b.filter;
    TRANS[id] = b.trans ? 1 : 0;
    CULLSAME[id] = b.cullSame ? 1 : 0;
    TINT[id] = [B.GRASS, B.TALLGRASS, B.FERN, B.OAK_LEAVES, B.TALL_GRASS, B.TALL_GRASS_TOP, B.LARGE_FERN, B.LARGE_FERN_TOP, B.BUSH, B.LILY_PAD].includes(id) ? 1 : 0;
    if (b.render === RT_NONE) continue;
    let top, bottom, side, front;
    if (typeof b.tex === 'string') top = bottom = side = front = b.tex;
    else { top = b.tex.top; bottom = b.tex.bottom; side = b.tex.side; front = b.tex.front || side; }
    const t = [tileIndex(side), tileIndex(side), tileIndex(top), tileIndex(bottom), tileIndex(side), tileIndex(side)];
    for (let f = 0; f < 6; f++) FACE_TEX[id * 6 + f] = t[f];
    FRONT_TEX[id] = tileIndex(front);
    const mt = b.metaTex || b.metaTop;
    if (mt) { HAS_META_TEX[id] = b.metaTex ? 1 : 2; for (let m = 0; m < 9; m++) META_TEX[id * 9 + m] = tileIndex(mt[Math.min(m, mt.length - 1)]); }
  }
}

function itemTile(id) {
  if (id < 256) {
    const b = BLOCKS[id];
    if (b.icon) return tileIndex(b.icon);
    return tileIndex(typeof b.tex === 'string' ? b.tex : (b.tex.front || b.tex.side));
  }
  return tileIndex(ITEMS[id].tile);
}

// Break time in seconds for given block with held item
function breakTime(blockId, heldId, creative) {
  const b = BLOCKS[blockId];
  if (!b || b.hardness < 0) return Infinity;
  if (creative) return 0;
  if (b.hardness === 0) return 0.05;
  const it = heldId >= 256 ? ITEMS[heldId] : null;
  let speed = 1;
  const correctTool = it && it.tool && it.tool === b.tool;
  if (correctTool) speed = it.speed;
  if (it && it.tool === 'shears' && (blockId === B.OAK_LEAVES || blockId === B.BIRCH_LEAVES || blockId === B.SPRUCE_LEAVES || BLOCKS[blockId].sound === 'wool')) speed = 6;
  if (it && it.tool === 'sword' && (blockId === B.OAK_LEAVES || blockId === B.BIRCH_LEAVES || blockId === B.SPRUCE_LEAVES)) speed = 1.5;
  const canHarvest = b.tier < 0 || (correctTool && it.tier >= b.tier);
  return b.hardness * (canHarvest ? 1.5 : 5) / speed;
}

function canHarvest(blockId, heldId) {
  const b = BLOCKS[blockId];
  if (b.tier < 0) return true;
  const it = heldId >= 256 ? ITEMS[heldId] : null;
  return !!(it && it.tool === b.tool && it.tier >= b.tier);
}

function blockDrop(blockId, heldId, meta = 0) {
  const d = blockDrops(blockId, heldId, meta);
  return d.length ? d[0][0] : 0;
}

// All drops of a block as [[id, count], ...]
function blockDrops(blockId, heldId, meta = 0) {
  const b = BLOCKS[blockId];
  if (!b || !canHarvest(blockId, heldId)) return [];
  // shears collect leaves, grass and ferns themselves
  if (heldId === I.SHEARS && (blockId === B.OAK_LEAVES || blockId === B.BIRCH_LEAVES || blockId === B.SPRUCE_LEAVES || blockId === B.TALLGRASS || blockId === B.FERN || blockId === B.BUSH)) return [[blockId, 1]];
  const d = typeof b.drop === 'function' ? b.drop(meta) : b.drop;
  if (!d) return [];
  return Array.isArray(d) ? d.filter((x) => x[1] > 0) : [[d, 1]];
}
