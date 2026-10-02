'use strict';
// localStorage based world persistence

const SaveManager = {
  INDEX: 'blockhaven_worlds',
  listWorlds() {
    try { return (JSON.parse(localStorage.getItem(this.INDEX)) || []).sort((a, b) => b.lastPlayed - a.lastPlayed); } catch (e) { return []; }
  },
  writeIndex(list) { try { localStorage.setItem(this.INDEX, JSON.stringify(list)); } catch (e) { /* ignore */ } },
  createWorld(name, seed, mode) {
    const list = this.listWorlds();
    const id = 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
    list.push({ id, name, seed, mode, created: Date.now(), lastPlayed: Date.now() });
    this.writeIndex(list);
    return id;
  },
  getMeta(id) { return this.listWorlds().find((w) => w.id === id); },
  loadWorld(id) {
    try { return JSON.parse(localStorage.getItem('blockhaven_world_' + id)); } catch (e) { return null; }
  },
  saveWorld(id, data) {
    const list = this.listWorlds();
    const w = list.find((x) => x.id === id);
    if (w) { w.lastPlayed = Date.now(); w.mode = data.player.mode; this.writeIndex(list); }
    try { localStorage.setItem('blockhaven_world_' + id, JSON.stringify(data)); return true; } catch (e) { return false; }
  },
  deleteWorld(id) {
    this.writeIndex(this.listWorlds().filter((w) => w.id !== id));
    try { localStorage.removeItem('blockhaven_world_' + id); } catch (e) { /* ignore */ }
  },
};
