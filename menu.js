/**
 * menu.js — DOOM Browser Edition
 * Issue #11: HUD, Menus & Game States
 *
 * Canvas-rendered menu system with game state machine.
 * States: MENU, PLAYING, PAUSED, DEAD, VICTORY
 *
 * Vanilla JS (ES6+), no build step, no frameworks.
 */
(() => {
  'use strict';

  const STATE = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    DEAD: 'dead',
    VICTORY: 'victory',
  };

  const Menu = {
    STATE,
    state: STATE.MENU,
    _ctx: null,
    _canvas: null,
    _callbacks: {},
    _mouseX: 0,
    _mouseY: 0,
    _mouseDown: false,
    _hoverIdx: -1,
    _titlePulse: 0,
    _settingsOpen: false,
    _deathStats: { enemiesKilled: 0, timeSurvived: 0, level: 1 },
    _victoryStats: { enemiesKilled: 0, totalTime: 0 },
  };

  // ── Settings ──────────────────────────────────────────────
  const settings = {
    mouseSens: 1.0,    // multiplier (1.0 = default 0.0025)
    fov: 66,           // degrees
  };

  try {
    const savedSens = parseFloat(localStorage.getItem('doom_sens'));
    if (!isNaN(savedSens) && savedSens > 0) settings.mouseSens = savedSens;
    const savedFov = parseInt(localStorage.getItem('doom_fov'), 10);
    if (!isNaN(savedFov) && savedFov >= 45 && savedFov <= 100) settings.fov = savedFov;
  } catch (e) {}

  function saveSettings() {
    try {
      localStorage.setItem('doom_sens', String(settings.mouseSens));
      localStorage.setItem('doom_fov', String(settings.fov));
    } catch (e) {}
  }

  // ── Button definitions ────────────────────────────────────
  const startButtons = [
    { label: 'NEW GAME', action: 'newgame' },
    { label: 'SETTINGS', action: 'settings' },
  ];
  const pauseButtons = [
    { label: 'RESUME', action: 'resume' },
    { label: 'SETTINGS', action: 'settings' },
    { label: 'QUIT TO MENU', action: 'quit', danger: true },
  ];
  const deathButtons = [
    { label: 'RESTART', action: 'restart' },
    { label: 'QUIT TO MENU', action: 'quit', danger: true },
  ];
  const victoryButtons = [
    { label: 'PLAY AGAIN', action: 'restart' },
    { label: 'QUIT TO MENU', action: 'quit' },
  ];
  const settingsButtons = [
    { label: 'BACK', action: 'back' },
  ];

  // ── API ───────────────────────────────────────────────────
  Menu.init = function(ctx, canvas) {
    Menu._ctx = ctx;
    Menu._canvas = canvas;
  };

  Menu.setCallbacks = function(cbs) { Menu._callbacks = cbs || {}; };
  Menu.getState = function() { return Menu.state; };
  Menu.setState = function(s) { Menu.state = s; };
  Menu.getSettings = function() { return settings; };
  Menu.setDeathStats = function(stats) { Menu._deathStats = stats || {}; };
  Menu.setVictoryStats = function(stats) { Menu._victoryStats = stats || {}; };
  Menu.trackMouse = function(x, y) { Menu._mouseX = x; Menu._mouseY = y; };
  Menu.setMouseDown = function(down) { Menu._mouseDown = down; };

  Menu.getMenuClickHint = function() {
    switch (Menu.state) {
      case STATE.MENU: return 'Click a button to begin';
      case STATE.PAUSED: return 'ESC to resume';
      case STATE.DEAD: return 'Click RESTART to try again';
      case STATE.VICTORY: return 'Click PLAY AGAIN or quit to menu';
      default: return '';
    }
  };

  // ── Key handling ──────────────────────────────────────────
  Menu.handleKey = function(code) {
    if (code === 'Escape') {
      if (Menu.state === STATE.PAUSED) Menu._resume();
      else if (Menu.state === STATE.DEAD) Menu._quit();
      else if (Menu.state === STATE.VICTORY) Menu._quit();
      return;
    }
    if (code === 'Space' || code === 'Enter') {
      if (Menu.state === STATE.DEAD) Menu._restart();
      else if (Menu.state === STATE.VICTORY) Menu._restart();
      else if (Menu.state === STATE.MENU) Menu._newGame();
      else if (Menu.state === STATE.PAUSED) Menu._resume();
    }
  };

  // ── Click handling ───────────────────────────────────────
  Menu.handleClick = function(x, y) {
    // Settings slider clicks
    if (Menu._settingsOpen) {
      Menu._handleSettingsClick(x, y);
    }
    const buttons = Menu._getCurrentButtons();
    for (let i = 0; i < buttons.length; i++) {
      const rect = Menu._getButtonRect(i, buttons.length);
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        Menu._executeAction(buttons[i].action);
        return;
      }
    }
  };

  Menu._getCurrentButtons = function() {
    if (Menu._settingsOpen) return settingsButtons;
    switch (Menu.state) {
      case STATE.MENU: return startButtons;
      case STATE.PAUSED: return pauseButtons;
      case STATE.DEAD: return deathButtons;
      case STATE.VICTORY: return victoryButtons;
      default: return [];
    }
  };

  Menu._getButtonRect = function(index, total) {
    const cw = Menu._canvas.width;
    const ch = Menu._canvas.height;
    const btnW = 300, btnH = 52, gap = 14;
    const startY = ch / 2 - (total * (btnH + gap)) / 2 + 60;
    return { x: cw / 2 - btnW / 2, y: startY + index * (btnH + gap), w: btnW, h: btnH };
  };

  Menu._executeAction = function(action) {
    switch (action) {
      case 'newgame': Menu._newGame(); break;
      case 'resume': Menu._resume(); break;
      case 'restart': Menu._restart(); break;
      case 'quit': Menu._quit(); break;
      case 'settings': Menu._settingsOpen = true; break;
      case 'back': Menu._settingsOpen = false; break;
    }
  };

  Menu._newGame = function() {
    Menu._settingsOpen = false;
    Menu.state = STATE.PLAYING;
    if (Menu._callbacks.onNewGame) Menu._callbacks.onNewGame();
  };
  Menu._resume = function() {
    Menu._settingsOpen = false;
    Menu.state = STATE.PLAYING;
    if (Menu._callbacks.onResume) Menu._callbacks.onResume();
  };
  Menu._restart = function() {
    Menu._settingsOpen = false;
    Menu.state = STATE.PLAYING;
    if (Menu._callbacks.onRestart) Menu._callbacks.onRestart();
  };
  Menu._quit = function() {
    Menu._settingsOpen = false;
    Menu.state = STATE.MENU;
    if (Menu._callbacks.onQuitToMenu) Menu._callbacks.onQuitToMenu();
  };

  // ── Settings click ────────────────────────────────────────
  Menu._handleSettingsClick = function(x, y) {
    const cw = Menu._canvas.width;
    const ch = Menu._canvas.height;
    const panelW = 420;
    const panelX = cw / 2 - panelW / 2;
    const panelY = ch / 2 - 120;
    const sliderX = panelX + 30;
    const sliderW = panelW - 60;

    // Mouse sensitivity slider
    const sensY = panelY + 75;
    if (y >= sensY - 10 && y <= sensY + 10 && x >= sliderX && x <= sliderX + sliderW) {
      const t = Math.max(0, Math.min(1, (x - sliderX) / sliderW));
      settings.mouseSens = Math.round((0.2 + t * 3.8) * 10) / 10;
      saveSettings();
    }

    // FOV slider
    const fovY = panelY + 145;
    if (y >= fovY - 10 && y <= fovY + 10 && x >= sliderX && x <= sliderX + sliderW) {
      const t = Math.max(0, Math.min(1, (x - sliderX) / sliderW));
      settings.fov = Math.round(45 + t * 55);
      saveSettings();
    }
  };

  // ── Update ────────────────────────────────────────────────
  Menu.update = function(delta) {
    Menu._titlePulse += delta * 2;
    const buttons = Menu._getCurrentButtons();
    let hover = -1;
    for (let i = 0; i < buttons.length; i++) {
      const rect = Menu._getButtonRect(i, buttons.length);
      if (Menu._mouseX >= rect.x && Menu._mouseX <= rect.x + rect.w &&
          Menu._mouseY >= rect.y && Menu._mouseY <= rect.y + rect.h) {
        hover = i;
        break;
      }
    }
    Menu._hoverIdx = hover;
  };

  // ── Render helpers ────────────────────────────────────────
  function drawButton(ctx, x, y, w, h, label, hovered, danger) {
    if (hovered) {
      ctx.fillStyle = danger ? 'rgba(80,10,10,0.9)' : 'rgba(10,40,10,0.9)';
      ctx.strokeStyle = danger ? '#FF4444' : '#00FF00';
      ctx.lineWidth = 2;
      ctx.shadowColor = danger ? 'rgba(255,68,68,0.4)' : 'rgba(0,255,0,0.3)';
      ctx.shadowBlur = 12;
    } else {
      ctx.fillStyle = 'rgba(15,15,20,0.85)';
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
    }
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.shadowBlur = 0;

    ctx.fillStyle = danger ? '#FF4444' : '#00FF00';
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (hovered) {
      ctx.shadowColor = danger ? 'rgba(255,68,68,0.5)' : 'rgba(0,255,0,0.4)';
      ctx.shadowBlur = 8;
    }
    ctx.fillText(label, x + w / 2, y + h / 2);
    ctx.shadowBlur = 0;
  }

  // ── Render ────────────────────────────────────────────────
  Menu.render = function() {
    const ctx = Menu._ctx;
    if (!ctx) return;
    const cw = Menu._canvas.width;
    const ch = Menu._canvas.height;

    switch (Menu.state) {
      case STATE.MENU: renderStartMenu(ctx, cw, ch); break;
      case STATE.PAUSED: renderPauseMenu(ctx, cw, ch); break;
      case STATE.DEAD: renderDeathScreen(ctx, cw, ch); break;
      case STATE.VICTORY: renderVictoryScreen(ctx, cw, ch); break;
    }
  };

  function renderStartMenu(ctx, cw, ch) {
    if (Menu._settingsOpen) { renderSettings(ctx, cw, ch); return; }

    // Dark gradient background
    const grad = ctx.createRadialGradient(cw / 2, ch / 2, 50, cw / 2, ch / 2, Math.max(cw, ch) / 1.2);
    grad.addColorStop(0, '#1a0505');
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);

    // Title
    const pulse = 0.8 + Math.sin(Menu._titlePulse) * 0.2;
    ctx.save();
    ctx.font = 'bold 72px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(100,0,0,0.6)';
    ctx.fillText('DOOM', cw / 2 + 4, ch / 2 - 100 + 4);
    ctx.shadowColor = 'rgba(255,0,0,' + (0.3 * pulse) + ')';
    ctx.shadowBlur = 30;
    ctx.fillStyle = 'rgba(220,20,20,' + pulse + ')';
    ctx.fillText('DOOM', cw / 2, ch / 2 - 100);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.font = '20px "Courier New", monospace';
    ctx.fillStyle = '#FF6600';
    ctx.shadowColor = 'rgba(255,102,0,0.3)';
    ctx.shadowBlur = 10;
    ctx.fillText('B R O W S E R   E D I T I O N', cw / 2, ch / 2 - 50);
    ctx.shadowBlur = 0;
    ctx.restore();

    // Buttons
    const buttons = startButtons;
    for (let i = 0; i < buttons.length; i++) {
      const rect = Menu._getButtonRect(i, buttons.length);
      drawButton(ctx, rect.x, rect.y, rect.w, rect.h, buttons[i].label, i === Menu._hoverIdx, buttons[i].danger);
    }

    // Controls hint
    ctx.save();
    ctx.font = '13px "Courier New", monospace';
    ctx.fillStyle = '#444';
    ctx.textAlign = 'center';
    ctx.fillText('WASD move · Mouse look · Click fire · 1/2 weapons · ESC pause', cw / 2, ch - 40);
    ctx.restore();
  }

  function renderPauseMenu(ctx, cw, ch) {
    if (Menu._settingsOpen) { renderSettings(ctx, cw, ch); return; }

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    ctx.font = 'bold 56px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00FF00';
    ctx.shadowColor = 'rgba(0,255,0,0.3)';
    ctx.shadowBlur = 20;
    ctx.fillText('PAUSED', cw / 2, ch / 2 - 100);
    ctx.shadowBlur = 0;
    ctx.restore();

    const buttons = pauseButtons;
    for (let i = 0; i < buttons.length; i++) {
      const rect = Menu._getButtonRect(i, buttons.length);
      drawButton(ctx, rect.x, rect.y, rect.w, rect.h, buttons[i].label, i === Menu._hoverIdx, buttons[i].danger);
    }

    ctx.save();
    ctx.font = '13px "Courier New", monospace';
    ctx.fillStyle = '#555';
    ctx.textAlign = 'center';
    ctx.fillText('ESC to resume', cw / 2, ch - 40);
    ctx.restore();
  }

  function renderDeathScreen(ctx, cw, ch) {
    ctx.fillStyle = 'rgba(40,0,0,0.82)';
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    ctx.font = 'bold 72px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(80,0,0,0.6)';
    ctx.fillText('YOU DIED', cw / 2 + 3, ch / 2 - 120 + 3);
    ctx.shadowColor = 'rgba(255,0,0,0.4)';
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#FF2222';
    ctx.fillText('YOU DIED', cw / 2, ch / 2 - 120);
    ctx.shadowBlur = 0;

    ctx.font = '18px "Courier New", monospace';
    ctx.fillStyle = '#AA6666';
    ctx.fillText('The demons of Deimos claim another soul...', cw / 2, ch / 2 - 60);

    // Stats
    ctx.font = '15px "Courier New", monospace';
    ctx.fillStyle = '#888';
    const stats = Menu._deathStats || {};
    ctx.fillText('Level reached: ' + (stats.level || 1) + '/3', cw / 2, ch / 2 - 25);
    ctx.fillText('Demons slain: ' + (stats.enemiesKilled || 0), cw / 2, ch / 2 - 5);
    if (stats.timeSurvived) {
      const mins = Math.floor(stats.timeSurvived / 60);
      const secs = Math.floor(stats.timeSurvived % 60);
      ctx.fillText('Time survived: ' + mins + ':' + (secs < 10 ? '0' : '') + secs, cw / 2, ch / 2 + 15);
    }
    ctx.restore();

    const buttons = deathButtons;
    for (let i = 0; i < buttons.length; i++) {
      const rect = Menu._getButtonRect(i, buttons.length);
      drawButton(ctx, rect.x, rect.y, rect.w, rect.h, buttons[i].label, i === Menu._hoverIdx, buttons[i].danger);
    }
  }

  function renderVictoryScreen(ctx, cw, ch) {
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, cw, ch);

    const pulse = 0.85 + Math.sin(Menu._titlePulse) * 0.15;
    ctx.save();
    ctx.font = 'bold 80px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(60,50,0,0.5)';
    ctx.fillText('VICTORY!', cw / 2 + 4, ch / 2 - 120 + 4);
    ctx.shadowColor = 'rgba(255,215,0,0.4)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = 'rgba(255,215,0,' + pulse + ')';
    ctx.fillText('VICTORY!', cw / 2, ch / 2 - 120);
    ctx.shadowBlur = 0;

    ctx.font = '24px "Courier New", monospace';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('You have cleared all 3 levels', cw / 2, ch / 2 - 50);

    ctx.font = '16px "Courier New", monospace';
    ctx.fillStyle = '#AAAAAA';
    ctx.fillText('The demonic invasion has been stopped.', cw / 2, ch / 2 - 20);

    // Stats
    const stats = Menu._victoryStats || {};
    ctx.font = '15px "Courier New", monospace';
    ctx.fillStyle = '#888';
    ctx.fillText('Demons slain: ' + (stats.enemiesKilled || 0), cw / 2, ch / 2 + 15);
    if (stats.totalTime) {
      const mins = Math.floor(stats.totalTime / 60);
      const secs = Math.floor(stats.totalTime % 60);
      ctx.fillText('Total time: ' + mins + ':' + (secs < 10 ? '0' : '') + secs, cw / 2, ch / 2 + 35);
    }
    ctx.restore();

    const buttons = victoryButtons;
    for (let i = 0; i < buttons.length; i++) {
      const rect = Menu._getButtonRect(i, buttons.length);
      drawButton(ctx, rect.x, rect.y, rect.w, rect.h, buttons[i].label, i === Menu._hoverIdx, buttons[i].danger);
    }
  }

  function renderSettings(ctx, cw, ch) {
    const panelW = 420;
    const panelH = 280;
    const panelX = cw / 2 - panelW / 2;
    const panelY = ch / 2 - panelH / 2;

    ctx.fillStyle = 'rgba(10,10,15,0.95)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    ctx.save();
    ctx.font = 'bold 26px "Courier New", monospace';
    ctx.fillStyle = '#00FF00';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SETTINGS', cw / 2, panelY + 30);

    const sliderX = panelX + 30;
    const sliderW = panelW - 60;

    // Mouse sensitivity
    ctx.font = '14px "Courier New", monospace';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'left';
    ctx.fillText('Mouse Sensitivity', sliderX, panelY + 60);
    ctx.fillStyle = '#00FF00';
    ctx.textAlign = 'right';
    ctx.fillText('x' + settings.mouseSens.toFixed(1), panelX + panelW - 30, panelY + 60);

    ctx.fillStyle = '#333';
    ctx.fillRect(sliderX, panelY + 75, sliderW, 6);
    const sensT = (settings.mouseSens - 0.2) / 3.8;
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(sliderX, panelY + 75, sliderW * sensT, 6);
    ctx.shadowColor = 'rgba(0,255,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(sliderX + sliderW * sensT, panelY + 78, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // FOV
    ctx.fillStyle = '#888';
    ctx.textAlign = 'left';
    ctx.fillText('Field of View', sliderX, panelY + 130);
    ctx.fillStyle = '#00FF00';
    ctx.textAlign = 'right';
    ctx.fillText(settings.fov + '\u00B0', panelX + panelW - 30, panelY + 130);

    ctx.fillStyle = '#333';
    ctx.fillRect(sliderX, panelY + 145, sliderW, 6);
    const fovT = (settings.fov - 45) / 55;
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(sliderX, panelY + 145, sliderW * fovT, 6);
    ctx.shadowColor = 'rgba(0,255,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(sliderX + sliderW * fovT, panelY + 148, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Back button
    const buttons = settingsButtons;
    for (let i = 0; i < buttons.length; i++) {
      const rect = Menu._getButtonRect(i, buttons.length);
      drawButton(ctx, rect.x, rect.y, rect.w, rect.h, buttons[i].label, i === Menu._hoverIdx, buttons[i].danger);
    }
  }

  // ── Export ────────────────────────────────────────────────
  if (typeof window !== 'undefined') {
    window.Menu = Menu;
  }
})();