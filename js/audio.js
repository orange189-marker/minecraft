'use strict';
// ---------------------------------------------------------------------------
// Synthesised sound effects and generative ambient music (Web Audio API).
// ---------------------------------------------------------------------------

class AudioEngine {
  constructor() {
    this.ctx = null; this.sfxVol = 0.7; this.musicVol = 0.4;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.musicTimer = 20; this.musicPlaying = false; this.phraseLeft = 0;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    const ctx = this.ctx;
    this.master = ctx.createGain(); this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = this.musicVol; this.music.connect(this.master);
    // noise buffer
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // reverb impulse for music
    const ir = ctx.createBuffer(2, ctx.sampleRate * 3, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3); }
    this.reverb = ctx.createConvolver(); this.reverb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    this.reverb.connect(wet); wet.connect(this.music);
    this.musicDry = ctx.createGain(); this.musicDry.gain.value = 0.5; this.musicDry.connect(this.music);
  }
  setVolumes(sfx, music) {
    this.sfxVol = sfx; this.musicVol = music;
    if (this.ctx) { this.sfx.gain.value = sfx; this.music.gain.value = music; }
  }

  // positional helper: returns [gain, pan]
  spatial(x, y, z) {
    if (x === undefined) return [1, 0];
    const L = this.listener;
    const dx = x - L.x, dy = y - L.y, dz = z - L.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const g = clamp(1 - d / 24, 0, 1);
    const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
    const pan = d > 0.5 ? clamp((dx * rx + dz * rz) / d, -1, 1) * 0.7 : 0;
    return [g * g, pan];
  }

  out(gain, pan) {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = gain;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.sfx); }
    else g.connect(this.sfx);
    return g;
  }

  noiseBurst(dest, t, dur, type, freq, q, vol, attack = 0.005) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }
  tone(dest, t, dur, type, f0, f1, vol, attack = 0.01) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  material(id) { const b = BLOCKS[id]; return b ? b.sound : 'stone'; }

  play(name, x, y, z, vol = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const [g, pan] = this.spatial(x, y, z);
    if (g * vol < 0.01) return;
    const t = this.ctx.currentTime;
    const o = this.out(g * vol, pan);
    const r = Math.random();
    switch (name) {
      case 'dig_stone': this.noiseBurst(o, t, 0.16, 'bandpass', 1500 + r * 400, 1.2, 0.9); this.noiseBurst(o, t, 0.08, 'highpass', 3000, 0.5, 0.3); break;
      case 'dig_wood': this.noiseBurst(o, t, 0.15, 'bandpass', 500 + r * 150, 2, 1); this.tone(o, t, 0.08, 'triangle', 220 + r * 40, 140, 0.25); break;
      case 'dig_grass': this.noiseBurst(o, t, 0.18, 'highpass', 2200 + r * 800, 0.7, 0.55); break;
      case 'dig_gravel': this.noiseBurst(o, t, 0.2, 'lowpass', 1300 + r * 300, 1, 0.9); this.noiseBurst(o, t + 0.04, 0.12, 'bandpass', 800, 1, 0.5); break;
      case 'dig_sand': this.noiseBurst(o, t, 0.2, 'bandpass', 2600 + r * 500, 0.6, 0.6); break;
      case 'dig_snow': this.noiseBurst(o, t, 0.2, 'lowpass', 1500, 0.8, 0.6); break;
      case 'dig_wool': this.noiseBurst(o, t, 0.18, 'lowpass', 700, 0.8, 0.7); break;
      case 'dig_glass':
        this.noiseBurst(o, t, 0.3, 'highpass', 4000, 1, 0.5);
        for (let i = 0; i < 4; i++) this.tone(o, t + i * 0.03, 0.25, 'sine', 2000 + Math.random() * 3000, 1500, 0.12);
        break;
      case 'step_stone': this.noiseBurst(o, t, 0.08, 'bandpass', 1300 + r * 300, 1.2, 0.35); break;
      case 'step_wood': this.noiseBurst(o, t, 0.08, 'bandpass', 450 + r * 100, 2, 0.4); break;
      case 'step_grass': this.noiseBurst(o, t, 0.1, 'highpass', 1800 + r * 600, 0.7, 0.25); break;
      case 'step_gravel': this.noiseBurst(o, t, 0.12, 'lowpass', 1100 + r * 300, 1, 0.4); break;
      case 'step_sand': this.noiseBurst(o, t, 0.12, 'bandpass', 2400, 0.6, 0.25); break;
      case 'step_snow': this.noiseBurst(o, t, 0.12, 'lowpass', 1300, 0.8, 0.3); break;
      case 'step_wool': case 'step_glass': this.noiseBurst(o, t, 0.08, 'lowpass', 900, 0.8, 0.3); break;
      case 'pop': this.tone(o, t, 0.08, 'sine', 500 + r * 300, 1400, 0.25); break;
      case 'click': this.tone(o, t, 0.04, 'square', 900, 700, 0.08); break;
      case 'hurt': this.tone(o, t, 0.22, 'square', 220, 110, 0.18); this.noiseBurst(o, t, 0.12, 'lowpass', 600, 1, 0.4); break;
      case 'pig': case 'pig_hurt': {
        const base = name === 'pig' ? 380 : 520;
        const osc = this.tone(o, t, 0.3, 'sawtooth', base, base * 0.7, 0.12);
        osc.frequency.setValueAtTime(base, t); osc.frequency.linearRampToValueAtTime(base * 1.3, t + 0.08); osc.frequency.linearRampToValueAtTime(base * 0.8, t + 0.3);
        break;
      }
      case 'sheep': case 'sheep_hurt': {
        const base = name === 'sheep' ? 300 : 380;
        const osc = this.tone(o, t, 0.6, 'sawtooth', base, base * 0.9, 0.1, 0.05);
        const lfo = this.ctx.createOscillator(); lfo.frequency.value = 24; const lg = this.ctx.createGain(); lg.gain.value = 18; lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + 0.65);
        break;
      }
      case 'zombie': case 'zombie_hurt': {
        const base = name === 'zombie' ? 95 : 130;
        const osc = this.tone(o, t, name === 'zombie' ? 0.9 : 0.3, 'sawtooth', base, base * 0.8, 0.14, 0.1);
        const lfo = this.ctx.createOscillator(); lfo.frequency.value = 7; const lg = this.ctx.createGain(); lg.gain.value = 12; lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + 1);
        this.noiseBurst(o, t, 0.6, 'lowpass', 400, 1, 0.15, 0.1);
        break;
      }
      case 'creeper_hurt': this.noiseBurst(o, t, 0.25, 'bandpass', 900, 1, 0.5); break;
      case 'fuse': this.noiseBurst(o, t, 1.5, 'highpass', 3500, 0.5, 0.45, 0.05); break;
      case 'explode':
        this.noiseBurst(o, t, 1.8, 'lowpass', 500, 0.7, 1.4, 0.01);
        this.noiseBurst(o, t, 0.5, 'lowpass', 2000, 0.5, 0.6, 0.005);
        this.tone(o, t, 1.2, 'sine', 70, 28, 1.0, 0.005);
        break;
      case 'eat': for (let i = 0; i < 3; i++) this.noiseBurst(o, t + i * 0.09, 0.07, 'bandpass', 1200 + Math.random() * 800, 1.5, 0.4); break;
      case 'burp': this.tone(o, t, 0.35, 'sawtooth', 110, 80, 0.15, 0.05); break;
      case 'splash': this.noiseBurst(o, t, 0.6, 'bandpass', 900, 0.6, 0.6, 0.01); break;
      case 'bucket': this.noiseBurst(o, t, 0.4, 'bandpass', 700, 1, 0.5); break;
      case 'ignite': this.noiseBurst(o, t, 0.25, 'highpass', 3000, 1, 0.5); this.tone(o, t, 0.06, 'square', 1800, 1200, 0.1); break;
      case 'door': this.tone(o, t, 0.2, 'triangle', 160, 120, 0.3); this.noiseBurst(o, t, 0.15, 'bandpass', 400, 2, 0.4); break;
      case 'splashSmall': this.noiseBurst(o, t, 0.2, 'bandpass', 1400, 0.8, 0.25); break;
    }
  }

  playDig(id, x, y, z, vol = 1) { this.play('dig_' + this.material(id), x + 0.5, y + 0.5, z + 0.5, vol); }
  playStep(id, x, y, z) { this.play('step_' + this.material(id), x, y, z, 0.6); }

  // --- Ambient generative music -------------------------------------------------
  updateMusic(dt, enabled) {
    if (!this.ctx || this.ctx.state !== 'running' || !enabled || this.musicVol <= 0) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    if (!this.musicPlaying) {
      this.musicPlaying = true; this.phraseLeft = 24 + Math.floor(Math.random() * 30);
      const scales = [[0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 2, 4, 5, 7, 9, 11]];
      this.scale = scales[Math.floor(Math.random() * scales.length)];
      this.root = [48, 50, 53, 55, 45][Math.floor(Math.random() * 5)];
      this.chordStep = 0;
    }
    const t = this.ctx.currentTime + 0.05;
    const sc = this.scale;
    const deg = () => sc[Math.floor(Math.random() * sc.length)];
    if (this.chordStep % 4 === 0) {
      const prog = [0, 3, 4, 2, 5];
      const r = this.root + sc[prog[Math.floor(Math.random() * prog.length)] % sc.length] - 12;
      this.pianoNote(r, t, 4, 0.13); this.pianoNote(r + 7, t + 0.02, 4, 0.08);
    }
    const n = this.root + 12 + deg() + (Math.random() < 0.3 ? 12 : 0);
    this.pianoNote(n, t, 3, 0.12);
    if (Math.random() < 0.35) this.pianoNote(n + (Math.random() < 0.5 ? 3 : 4), t + 0.25, 2.5, 0.07);
    this.chordStep++;
    this.phraseLeft--;
    this.musicTimer = [0.55, 0.8, 1.1, 1.6][Math.floor(Math.random() * 4)];
    if (this.phraseLeft <= 0) { this.musicPlaying = false; this.musicTimer = 60 + Math.random() * 120; }
  }

  pianoNote(midi, t, dur, vol) {
    const ctx = this.ctx;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(vol * 0.4, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    g.connect(lp); lp.connect(this.reverb); lp.connect(this.musicDry);
    [[1, 1], [2, 0.35], [3, 0.12], [4, 0.06]].forEach(([h, a]) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * h * (1 + (Math.random() - 0.5) * 0.002);
      const og = ctx.createGain(); og.gain.value = a;
      o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.1);
    });
  }
}
