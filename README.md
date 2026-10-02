# Blockhaven

A Minecraft-style voxel sandbox game that runs entirely in the browser. It's written from scratch in plain JavaScript and WebGL2, with no libraries, no build step and no image or sound files. Every texture is painted procedurally at startup and every sound is synthesised with the Web Audio API.

## Play

Open `index.html` in a modern desktop browser (Chrome, Edge or Firefox). It works straight from the file system.

You can also serve the folder:

```bash
npm start   # serves on http://localhost:5088
```

Click **Singleplayer → Create New World**, pick a name, an optional seed and a game mode, then click into the game to capture the mouse.

## Features

- **Infinite procedural worlds** from a seed: continents and oceans, beaches, plains, forests, birch forests, taiga, snowy tundra, deserts and snow-capped mountains.
- **Caves and ores**: spaghetti caves, large caverns, lava lakes deep down, plus coal, iron, gold and diamond ores.
- **Trees and plants**: oak, birch, spruce and big oak trees. Saplings drop from leaves and grow into trees.
- **Flowers and foliage**: 13 flowers (tulips, orchids, alliums, daisies, cornflowers, lilies of the valley and more) that grow in clustered **flower meadows**, plus 2-block sunflowers, lilacs, rose bushes, peonies, tall grass and large ferns. There are also bushes, sweet berry bushes you can harvest, mushrooms (on the surface and in caves), sugar cane by the water, lily pads, pumpkins and jack o'lanterns.
- **Biome colours**: grass, leaves and foliage are tinted by temperature and humidity: lush in wet forests, yellow-green in hot dry areas, cooler in the cold.
- **Lighting**: smooth lighting with ambient occlusion, sky light and coloured block light (torches, glowstone, lava, lit furnaces), and a full day/night cycle with a sun, moon, stars, sunsets and drifting 3D clouds.
- **Survival mode**: health, hunger, air, fall damage, drowning, lava, cactus, respawning and a bed that skips the night and sets your spawn.
- **Creative mode**: flying (double-tap Space), instant breaking and a searchable creative inventory.
- **Mining and tools**: breaking takes time, scaled by block hardness and tool. Wood, stone, iron, gold and diamond pickaxes, axes, shovels and swords all have durability.
- **Crafting**: 2×2 crafting in the inventory, a 3×3 crafting table and a **recipe book** that fills the grid for you.
- **Smelting**: a working furnace with fuel and progress. Furnaces and chests keep their contents.
- **Farming**: till grass and dirt with a hoe (5 materials). Farmland gets wet near water. Grow wheat, carrots, potatoes and beetroot through their growth stages, plus pumpkin and melon stems that grow fruit beside them. Wild crops appear in the world, jumping on farmland tramples it, bone meal speeds up growth (and sprouts grass and flowers), and the composter turns spare plants into bone meal.
- **Farm animals**: pigs, sheep, cows and chickens follow you when you hold their food. Feed two of them to breed a baby that grows up. Shear sheep (the wool regrows when they eat grass), milk cows with a bucket and collect eggs. Animals you feed or breed are saved with your world.
- **Farm food and blocks**: bread, baked potato, beetroot soup, steak, cooked chicken, pumpkin pie, cookies, melon slices and a placeable cake you eat slice by slice. Also hay bales, sugar, books, melons and the composter.
- **Mobs**: pigs and sheep, plus zombies (they burn in daylight) and creepers (they explode). Each has AI, animation, knockback and drops.
- **TNT and explosions**: craters, chain reactions, block drops and damage.
- **Liquids**: flowing water with levels, water buckets, and water and lava that make obsidian.
- **Falling sand and gravel**, and grass that spreads onto dirt.
- **Sound and music**: synthesised digging, step, mob and explosion sounds, plus generative ambient piano music.
- **Saving**: worlds autosave to browser `localStorage`, and you can keep several worlds.
- **Settings**: render distance, FOV, sensitivity, brightness, volume, view bobbing, clouds and more.
- **Extras**: F3 debug screen, F5 third-person view and F1 to hide the HUD.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Space | Jump / swim / fly up |
| Shift | Sneak (won't fall off edges) / fly down |
| Ctrl or double-tap W | Sprint |
| Left click | Break block / attack |
| Right click | Place block, use item, open chests/furnaces/crafting tables, eat (hold), sleep |
| Middle click | Pick block |
| 1–9 / mouse wheel | Select hotbar slot |
| E | Inventory |
| Q / Ctrl+Q | Drop one item / drop whole stack |
| Double-tap Space | Toggle flying (Creative) |
| F1 / F3 / F5 | Hide HUD / debug info / camera perspective |
| Esc | Pause menu |

In inventories: left click picks up or places a stack, right click splits a stack or places one item, and Shift + click quick-moves.

## Getting started in Survival

1. Punch a tree to get logs, then turn them into planks and sticks (the 📖 Recipes button helps).
2. Craft a crafting table, then a wooden pickaxe, and mine stone for stone tools.
3. Build a furnace from 8 cobblestone and smelt iron ore into ingots.
4. Make torches from coal and sticks before night falls. Zombies and creepers spawn in the dark.
5. Start a farm: craft a hoe, till grass next to water and plant the seeds you get from breaking grass. Find wild carrots and potatoes in plains, and lure animals home with wheat or carrots.
6. Craft a bed from 3 wool and 3 planks (sheep drop wool) to sleep through the night.

## Code layout

| File | Purpose |
| --- | --- |
| `js/util.js` | Constants, matrix maths, RNG, frustum and save encoding helpers |
| `js/noise.js` | Seeded simplex noise |
| `js/textures.js` | Procedural pixel-art texture atlas |
| `js/blocks.js` | Block and item registry, tools, break times |
| `js/worldgen.js` | Terrain, biomes, caves, ores and trees |
| `js/world.js` | Chunks, lighting, block updates, liquids, tile entities |
| `js/mesher.js` | Chunk meshing with face culling, AO and smooth lighting |
| `js/renderer.js` | WebGL2 renderer: sky, clouds, chunks, entities, water |
| `js/physics.js` | AABB collision and voxel ray casting |
| `js/entities.js` | Mobs, dropped items, TNT and particles |
| `js/player.js` | Player movement and survival stats |
| `js/crafting.js` | Recipes, smelting, fuel and the inventory model |
| `js/audio.js` | Synthesised sound effects and music |
| `js/ui.js`, `js/icons.js` | HUD, menus, inventories and the recipe book |
| `js/game.js` | Main loop, chunk streaming, interaction and spawning |

Blockhaven is a fan-made homage and is not affiliated with Mojang or Microsoft.
