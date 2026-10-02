'use strict';
// ---------------------------------------------------------------------------
// Chat and commands
// ---------------------------------------------------------------------------

const DEFAULT_RULES = { doDaylightCycle: true, doMobSpawning: true, keepInventory: false };

// Lookup of item/block names typed in commands ("oak_planks", "diamond_pickaxe", "56")
const ItemNames = {
  map: null,
  build() {
    const m = new Map();
    const key = (n) => n.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    for (let id = 1; id < 256; id++) { const b = BLOCKS[id]; if (b && id !== B.AIR) m.set(key(b.name), m.get(key(b.name)) || id); }
    for (let id = 256; id < ITEMS.length; id++) if (ITEMS[id]) m.set(key(ITEMS[id].name), id);
    for (const k in B) if (!m.has(k.toLowerCase())) m.set(k.toLowerCase(), B[k]);
    for (const k in I) if (!m.has(k.toLowerCase())) m.set(k.toLowerCase(), I[k]);
    for (const k in TOOLS) m.set(k, TOOLS[k]);
    m.delete('air');
    this.map = m;
  },
  find(name) {
    if (!this.map) this.build();
    name = String(name || '').toLowerCase().replace(/^minecraft:/, '');
    if (/^\d+$/.test(name)) { const id = +name; return (id < 256 ? BLOCKS[id] : ITEMS[id]) ? id : null; }
    return this.map.has(name) ? this.map.get(name) : null;
  },
  names() { if (!this.map) this.build(); return [...this.map.keys()]; },
};

class Chat {
  constructor(game) {
    this.game = game;
    this.log = document.getElementById('chat-log');
    this.bar = document.getElementById('chat-bar');
    this.input = document.getElementById('chat-input');
    this.hint = document.getElementById('chat-hint');
    this.history = []; this.histPos = 0;
    this.isOpen = false;
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.input.addEventListener('input', () => this.updateHint());
    this.commands = this.buildCommands();
  }

  // ---- UI --------------------------------------------------------------------
  open(prefix = '') {
    const g = this.game;
    if (g.state !== 'playing' || g.ui.isOpen()) return;
    this.isOpen = true;
    g.ui.screen = 'chat';
    g.keys = {};
    g.mouse = [false, false, false];
    document.body.classList.add('chat-open');
    this.bar.style.display = 'flex';
    this.input.value = prefix;
    this.histPos = this.history.length;
    g.unlockPointer();
    this.input.focus(); this.input.setSelectionRange(prefix.length, prefix.length);
    setTimeout(() => { if (this.isOpen && document.activeElement !== this.input) this.input.focus(); }, 0);
    this.log.scrollTop = this.log.scrollHeight;
    this.updateHint();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    document.body.classList.remove('chat-open');
    this.bar.style.display = 'none';
    this.hint.style.display = 'none';
    this.input.blur();
    this.log.scrollTop = this.log.scrollHeight;
    const g = this.game;
    if (g.ui.screen === 'chat') { g.ui.screen = null; if (g.state === 'playing') g.lockPointer(); }
  }

  onKey(e) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = this.input.value.trim();
      this.close();
      if (text) { this.history.push(text); if (this.history.length > 50) this.history.shift(); this.submit(text); }
    } else if (e.key === 'Escape') {
      e.preventDefault(); this.close();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!this.history.length) return;
      this.histPos = clamp(this.histPos + (e.key === 'ArrowUp' ? -1 : 1), 0, this.history.length);
      this.input.value = this.history[this.histPos] || '';
      this.updateHint();
    } else if (e.key === 'Tab') {
      e.preventDefault(); this.complete();
    }
  }

  // Add a line to the chat log. Text may contain §-free plain text; cls picks a colour.
  add(text, cls = '') {
    const line = document.createElement('div');
    line.className = 'chat-line ' + cls;
    line.textContent = text;
    this.log.appendChild(line);
    while (this.log.children.length > 100) this.log.firstChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
    setTimeout(() => line.classList.add('old'), 10000);
  }
  info(t) { this.add(t, 'info'); }
  error(t) { this.add(t, 'error'); }
  success(t) { this.add(t, 'success'); }

  playerName() { return this.game.settings.playerName || 'Player'; }

  submit(text) {
    if (text.startsWith('/')) {
      this.add(text, 'echo');
      this.run(text.slice(1));
    } else {
      this.add(`<${this.playerName()}> ${text}`);
    }
  }

  // ---- Autocomplete ----------------------------------------------------------
  suggestions() {
    const v = this.input.value;
    if (!v.startsWith('/')) return { list: [], word: '' };
    const parts = v.slice(1).split(' ');
    const word = parts[parts.length - 1].toLowerCase();
    let list = [];
    if (parts.length === 1) list = Object.keys(this.commands).map((c) => c);
    else {
      const cmd = this.commands[parts[0].toLowerCase()];
      const opts = cmd && cmd.complete ? cmd.complete(parts.length - 2, parts) : [];
      list = opts;
    }
    return { list: list.filter((x) => x.startsWith(word)).sort().slice(0, 40), word };
  }

  updateHint() {
    const { list } = this.suggestions();
    const v = this.input.value;
    if (!v.startsWith('/') || !list.length) {
      const cmd = v.startsWith('/') ? this.commands[v.slice(1).split(' ')[0].toLowerCase()] : null;
      if (cmd) { this.hint.textContent = '/' + v.slice(1).split(' ')[0].toLowerCase() + ' ' + cmd.usage; this.hint.style.display = 'block'; }
      else this.hint.style.display = 'none';
      return;
    }
    this.hint.textContent = list.slice(0, 12).join('   ') + (list.length > 12 ? '   …' : '');
    this.hint.style.display = 'block';
  }

  complete() {
    const { list, word } = this.suggestions();
    if (!list.length) return;
    let common = list[0];
    for (const s of list) while (!s.startsWith(common)) common = common.slice(0, -1);
    const pick = list.length === 1 ? list[0] + ' ' : (common.length > word.length ? common : list[0]);
    const v = this.input.value;
    this.input.value = v.slice(0, v.length - word.length) + pick;
    this.updateHint();
  }

  // ---- Commands ----------------------------------------------------------------
  run(line) {
    const parts = line.trim().split(/\s+/);
    const name = (parts.shift() || '').toLowerCase();
    const cmd = this.commands[this.aliases[name] || name];
    if (!cmd) { this.error(`Unknown command "/${name}". Type /help for a list of commands.`); return; }
    try {
      cmd.run(parts);
    } catch (err) {
      this.error(err.message || String(err));
      if (cmd.usage) this.error('Usage: /' + (this.aliases[name] || name) + ' ' + cmd.usage);
    }
  }

  coord(s, base) {
    if (s === undefined) throw new Error('Missing coordinate');
    if (s.startsWith('~')) return base + (s.length > 1 ? parseFloat(s.slice(1)) : 0);
    const v = parseFloat(s);
    if (!isFinite(v)) throw new Error(`"${s}" is not a valid coordinate`);
    return v;
  }
  pos(args, i, center = false) {
    const p = this.game.player;
    const x = this.coord(args[i], p.x), y = this.coord(args[i + 1], p.y), z = this.coord(args[i + 2], p.z);
    return center ? [x, y, z] : [Math.floor(x), Math.floor(y), Math.floor(z)];
  }
  item(name) {
    const id = ItemNames.find(name);
    if (id === null) throw new Error(`Unknown item "${name}"`);
    return id;
  }

  buildCommands() {
    const g = this.game;
    const P = () => g.player, W = () => g.world;
    const mobNames = () => Object.keys(MOB_TYPES).concat(['tnt']);
    const blockNames = () => ItemNames.names().filter((n) => { const id = ItemNames.find(n); return id < 256; });
    this.aliases = { gm: 'gamemode', teleport: 'tp', heal: 'heal', h: 'help', '?': 'help', msg: 'say', killall: 'kill' };
    const C = {
      help: {
        usage: '[command]', desc: 'Show available commands',
        complete: (i) => i === 0 ? Object.keys(this.commands) : [],
        run: (a) => {
          if (a[0]) {
            const c = this.commands[a[0].replace('/', '')];
            if (!c) throw new Error('No such command: ' + a[0]);
            this.info(`/${a[0].replace('/', '')} ${c.usage} — ${c.desc}`);
            return;
          }
          this.info('--- Commands (Tab completes, ↑↓ history) ---');
          for (const k of Object.keys(this.commands).sort()) this.info(`/${k} ${this.commands[k].usage}`);
        },
      },
      gamemode: {
        usage: '<survival|creative>', desc: 'Change your game mode',
        complete: (i) => i === 0 ? ['survival', 'creative'] : [],
        run: (a) => {
          const m = { survival: 'survival', s: 'survival', 0: 'survival', creative: 'creative', c: 'creative', 1: 'creative' }[(a[0] || '').toLowerCase()];
          if (!m) throw new Error('Choose survival or creative');
          g.setMode(m);
        },
      },
      time: {
        usage: '<set|add|query> [value]', desc: 'Change or show the time of day',
        complete: (i, p) => i === 0 ? ['set', 'add', 'query'] : (i === 1 && p[1] === 'set' ? ['day', 'noon', 'sunset', 'night', 'midnight', 'sunrise'] : []),
        run: (a) => {
          const named = { day: 1000, noon: 6000, sunset: 12000, night: 13000, midnight: 18000, sunrise: 23000 };
          const day = Math.floor(g.time / DAY_TICKS) * DAY_TICKS;
          if (a[0] === 'query') { this.info(`Time is ${Math.floor(g.time % DAY_TICKS)} (day ${Math.floor(g.time / DAY_TICKS)})`); return; }
          const v = named[(a[1] || '').toLowerCase()] !== undefined ? named[a[1].toLowerCase()] : parseInt(a[1], 10);
          if (!isFinite(v)) throw new Error('Expected a number or day/noon/night/midnight');
          if (a[0] === 'set') { g.time = day + (((v % DAY_TICKS) + DAY_TICKS) % DAY_TICKS); this.success('Set the time to ' + v); }
          else if (a[0] === 'add') { g.time += v; this.success('Added ' + v + ' to the time'); }
          else throw new Error('Use set, add or query');
        },
      },
      day: { usage: '', desc: 'Shortcut for /time set day', run: () => this.run('time set day') },
      night: { usage: '', desc: 'Shortcut for /time set night', run: () => this.run('time set night') },
      tp: {
        usage: '<x> <y> <z>  (use ~ for relative)', desc: 'Teleport',
        complete: (i) => i < 3 ? ['~'] : [],
        run: (a) => {
          if (a[0] === 'spawn') { const s = P().spawn; P().x = s.x; P().y = s.y; P().z = s.z; P().vy = 0; this.success('Teleported to spawn'); return; }
          const [x, y, z] = this.pos(a, 0, true);
          const p = P(); p.x = x; p.y = clamp(y, 0, WORLD_H + 50); p.z = z; p.vx = p.vy = p.vz = 0; p.fallDist = 0;
          this.success(`Teleported to ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`);
        },
      },
      give: {
        usage: '<item> [count]', desc: 'Give yourself items',
        complete: (i) => i === 0 ? ItemNames.names() : ['1', '16', '64'],
        run: (a) => {
          if (!a[0]) throw new Error('Which item?');
          const id = this.item(a[0]);
          const n = clamp(parseInt(a[1] || '1', 10) || 1, 1, 64 * 36);
          const left = P().inventory.add(id, n);
          if (left > 0) g.spawnDrop(id, left, P().x, P().y + 1, P().z);
          this.success(`Gave ${n} [${itemName(id)}] to ${this.playerName()}`);
        },
      },
      clear: {
        usage: '[item]', desc: 'Clear your inventory (or one item type)',
        complete: (i) => i === 0 ? ItemNames.names() : [],
        run: (a) => {
          const inv = P().inventory;
          const id = a[0] ? this.item(a[0]) : null;
          let n = 0;
          for (let i = 0; i < 36; i++) { const s = inv.slots[i]; if (s && (id === null || s.id === id)) { n += s.count; inv.slots[i] = null; } }
          inv.changed();
          this.success(`Removed ${n} items from your inventory`);
        },
      },
      kill: {
        usage: '[me|mobs|hostile|items|<mob>]', desc: 'Kill yourself, mobs or dropped items',
        complete: (i) => i === 0 ? ['me', 'mobs', 'hostile', 'items'].concat(Object.keys(MOB_TYPES)) : [],
        run: (a) => {
          const what = (a[0] || 'me').toLowerCase();
          if (what === 'me' || what === '@s') {
            if (P().mode === 'creative') { P().mode = 'survival'; P().damage(1000, g, 'void'); P().mode = 'creative'; }
            else { P().invuln = 0; P().damage(1000, g, 'void'); }
            return;
          }
          let n = 0;
          for (const e of g.entities) {
            const hit = what === 'items' ? e instanceof ItemDrop : what === 'mobs' ? e.isMob : what === 'hostile' ? (e.isMob && e.T.hostile) : (e.isMob && e.type === what);
            if (hit) { e.dead = true; n++; }
          }
          this.success(`Killed ${n} ${what === 'items' ? 'items' : 'entities'}`);
        },
      },
      heal: { usage: '', desc: 'Restore health', run: () => { P().health = 20; P().air = P().maxAir; P().burn = 0; this.success('Healed'); } },
      feed: { usage: '', desc: 'Restore hunger', run: () => { P().food = 20; P().saturation = 10; this.success('Fed'); } },
      summon: {
        usage: '<mob> [x y z]', desc: 'Spawn a mob (pig, sheep, cow, chicken, zombie, creeper, tnt)',
        complete: (i) => i === 0 ? mobNames() : ['~'],
        run: (a) => {
          const t = (a[0] || '').toLowerCase();
          const p = P();
          const [dx, dy, dz] = p.lookDir();
          const pos = a.length >= 4 ? this.pos(a, 1, true) : [p.x + dx * 2, p.y + 0.1, p.z + dz * 2];
          if (t === 'tnt') { g.entities.push(new PrimedTNT(pos[0], pos[1], pos[2])); this.success('Summoned primed TNT'); return; }
          const baby = t.startsWith('baby_') || t.startsWith('baby');
          const type = t.replace(/^baby_?/, '');
          if (!MOB_TYPES[type]) throw new Error(`Unknown mob "${t}". Try: ${mobNames().join(', ')}`);
          const m = new Mob(type, pos[0], pos[1], pos[2]);
          if (baby && !MOB_TYPES[type].hostile) m.setBaby(true);
          if (!MOB_TYPES[type].hostile) m.persistent = true;
          g.entities.push(m);
          this.success(`Summoned ${baby ? 'baby ' : ''}${MOB_TYPES[type].name}`);
        },
      },
      setblock: {
        usage: '<x> <y> <z> <block>', desc: 'Place a block',
        complete: (i) => i < 3 ? ['~'] : i === 3 ? blockNames() : [],
        run: (a) => {
          const [x, y, z] = this.pos(a, 0);
          const id = a[3] === 'air' ? 0 : this.item(a[3]);
          if (id >= 256) throw new Error(`${itemName(id)} is not a block`);
          if (!W().isLoaded(x, z)) throw new Error('That position is not loaded');
          W().setBlock(x, y, z, id, 0); W().processLightQueue(true);
          this.success(`Changed the block at ${x}, ${y}, ${z}`);
        },
      },
      fill: {
        usage: '<x1> <y1> <z1> <x2> <y2> <z2> <block>', desc: 'Fill a box with blocks (max 32768)',
        complete: (i) => i < 6 ? ['~'] : i === 6 ? blockNames() : [],
        run: (a) => {
          const [x1, y1, z1] = this.pos(a, 0), [x2, y2, z2] = this.pos(a, 3);
          const id = a[6] === 'air' ? 0 : this.item(a[6]);
          if (id >= 256) throw new Error(`${itemName(id)} is not a block`);
          const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)], [ay, by] = [clamp(Math.min(y1, y2), 0, WORLD_H - 1), clamp(Math.max(y1, y2), 0, WORLD_H - 1)], [az, bz] = [Math.min(z1, z2), Math.max(z1, z2)];
          const vol = (bx - ax + 1) * (by - ay + 1) * (bz - az + 1);
          if (vol > 32768) throw new Error(`Too many blocks (${vol} > 32768)`);
          let n = 0;
          for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) if (W().setBlock(x, y, z, id, 0, { noUpdate: true })) n++;
          W().processLightQueue(true);
          this.success(`${n} blocks filled`);
        },
      },
      spawnpoint: { usage: '', desc: 'Set your respawn point here', run: () => { const p = P(); p.spawn = { x: p.x, y: p.y, z: p.z }; this.success(`Spawn point set to ${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}`); } },
      seed: { usage: '', desc: 'Show the world seed', run: () => this.info('Seed: ' + W().seed) },
      pos: { usage: '', desc: 'Show your position and biome', run: () => { const p = P(); this.info(`Position: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} — ${BIOME_NAMES[W().gen.column(Math.floor(p.x), Math.floor(p.z)).biome]}`); } },
      difficulty: {
        usage: '<peaceful|normal>', desc: 'Peaceful removes hostile mobs',
        complete: (i) => i === 0 ? ['peaceful', 'normal'] : [],
        run: (a) => {
          const d = (a[0] || '').toLowerCase();
          if (d !== 'peaceful' && d !== 'normal') throw new Error('Choose peaceful or normal');
          g.rules.peaceful = d === 'peaceful';
          if (g.rules.peaceful) for (const e of g.entities) if (e.isMob && e.T.hostile) e.dead = true;
          this.success('Difficulty set to ' + d);
        },
      },
      gamerule: {
        usage: '<rule> [true|false]', desc: 'doDaylightCycle, doMobSpawning, keepInventory',
        complete: (i) => i === 0 ? Object.keys(DEFAULT_RULES) : ['true', 'false'],
        run: (a) => {
          const rule = Object.keys(DEFAULT_RULES).find((r) => r.toLowerCase() === (a[0] || '').toLowerCase());
          if (!rule) throw new Error('Rules: ' + Object.keys(DEFAULT_RULES).join(', '));
          if (a[1] === undefined) { this.info(`${rule} = ${g.rules[rule]}`); return; }
          if (a[1] !== 'true' && a[1] !== 'false') throw new Error('Value must be true or false');
          g.rules[rule] = a[1] === 'true';
          this.success(`Game rule ${rule} is now ${g.rules[rule]}`);
        },
      },
      say: { usage: '<message>', desc: 'Broadcast a message', run: (a) => { if (!a.length) throw new Error('Say what?'); this.add(`[${this.playerName()}] ${a.join(' ')}`, 'say'); } },
      me: { usage: '<action>', desc: 'Describe an action', run: (a) => this.add(`* ${this.playerName()} ${a.join(' ')}`, 'me') },
      name: {
        usage: '<name>', desc: 'Change your chat name',
        run: (a) => {
          const n = a.join(' ').trim().slice(0, 16);
          if (!n) throw new Error('Name cannot be empty');
          g.settings.playerName = n; g.saveSettings();
          this.success('Your name is now ' + n);
        },
      },
      save: { usage: '', desc: 'Save the world now', run: () => g.saveGame(false) },
      clearchat: { usage: '', desc: 'Clear the chat window', run: () => { this.log.innerHTML = ''; } },
    };
    return C;
  }
}
