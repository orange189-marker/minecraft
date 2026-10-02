'use strict';
// Bootstrap
window.addEventListener('load', () => {
  const canvas = document.getElementById('game');
  try {
    window.game = new Game(canvas);
    document.getElementById('loading').style.display = 'none';
  } catch (e) {
    console.error(e);
    const d = document.createElement('div');
    d.className = 'fatal';
    d.textContent = 'Blockhaven failed to start: ' + e.message;
    document.body.appendChild(d);
  }
});
