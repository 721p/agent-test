/**
 * game.js — DOOM Browser Edition
 * Issue #4: Level System & Map Design
 *
 * Features:
 *   - Loads levels from JSON via level.js module
 *   - WASD movement + mouse look (pointer lock)
 *   - Collision detection against loaded level grid
 *   - Mini-map overlay (top-down view) in screen corner
 *   - Integrates raycaster.js DDA engine for 3D rendering
 *
 * Vanilla JS (ES6+), no build step, no frameworks.
 */

(() => {
  'use strict';

  // ── Canvas Setup ──────────────────────────────────────────────
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const hintEl = document.getElementById('pointerLockHint');

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // ── Level & Player State ──────────────────────────────────────
  let level = null;        // Level instance (from level.js)
  let levelMap = null;     // shortcut to level.grid
  let mapWidth = 0;
  let mapHeight = 0;

  const player = {
    x: 0,
    y: 0,
    angle: 0,
  };

  // ── Movement Constants ───────────────────────────────────────
  const MOVE_SPEED       = 3.5;  // grid units per second
  const STRAFE_SPEED     = 3.0;  // grid units per second
  const TURN_SPEED       = 2.5;  // radians per second (keyboard)
  const MOUSE_SENS       = 0.0025; // radians per pixel
  const COLLISION_MARGIN = 0.25;

  // ── Mini-map Constants ───────────────────────────────────────
  const MINIMAP_SCALE = 4;     // pixels per grid cell
  const MINIMAP_PAD   = 10;    // padding from screen edge
  const MINIMAP_ALPHA = 0.75;  // overlay transparency

  // ── Input State ───────────────────────────────────────────────
  const keys = {};
  let pointerLocked = false;
  let mouseAccumX = 0;

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  canvas.addEventListener('click', () => {
    canvas.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    pointerLocked = (document.pointerLockElement === canvas);
    hintEl.style.display = pointerLocked ? 'none' : 'block';
  });

  document.addEventListener('mousemove', (e) => {
    if (pointerLocked) {
      mouseAccumX += e.movementX;
    }
  });

  // ── Collision Detection ───────────────────────────────────────
  function isWalkable(x, y) {
    const minX = Math.floor(x - COLLISION_MARGIN);
    const maxX = Math.floor(x + COLLISION_MARGIN);
    const minY = Math.floor(y - COLLISION_MARGIN);
    const maxY = Math.floor(y + COLLISION_MARGIN);

    if (minX < 0 || maxX >= mapWidth || minY < 0 || maxY >= mapHeight) {
      return false;
    }

    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        if (levelMap[cy][cx] > 0) {
          return false;
        }
      }
    }
    return true;
  }

  function tryMove(newX, newY) {
    if (isWalkable(newX, player.y)) {
      player.x = newX;
    }
    if (isWalkable(player.x, newY)) {
      player.y = newY;
    }
  }

  // ── Update Player ─────────────────────────────────────────────
  function updatePlayer(delta) {
    const cos = Math.cos(player.angle);
    const sin = Math.sin(player.angle);

    let dx = 0, dy = 0;

    if (keys['KeyW'] || keys['ArrowUp'])    { dx += cos; dy += sin; }
    if (keys['KeyS'] || keys['ArrowDown'])   { dx -= cos; dy -= sin; }
    if (keys['KeyA'])                         { dx += sin; dy -= cos; }
    if (keys['KeyD'])                         { dx -= sin; dy += cos; }

    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;

      let speed = MOVE_SPEED;
      const forwardComponent = Math.abs(dx * cos + dy * sin);
      const strafeComponent   = Math.abs(dx * -sin + dy * cos);
      if (strafeComponent > forwardComponent) {
        speed = STRAFE_SPEED;
      }

      tryMove(player.x + dx * speed * delta, player.y + dy * speed * delta);
    }

    if (keys['ArrowLeft']  || keys['KeyQ']) { player.angle -= TURN_SPEED * delta; }
    if (keys['ArrowRight'] || keys['KeyE']) { player.angle += TURN_SPEED * delta; }

    if (pointerLocked && mouseAccumX !== 0) {
      player.angle += mouseAccumX * MOUSE_SENS;
      mouseAccumX = 0;
    }

    if (player.angle < 0)        player.angle += Math.PI * 2;
    if (player.angle >= Math.PI * 2) player.angle -= Math.PI * 2;
  }

  // ── Mini-map Rendering ────────────────────────────────────────
  /**
   * Draw a top-down mini-map in the top-left corner of the screen.
   * Shows walls color-coded by type, the player as a dot, and a
   * short FOV direction indicator.
   */
  function drawMiniMap() {
    const mmW = mapWidth  * MINIMAP_SCALE;
    const mmH = mapHeight * MINIMAP_SCALE;
    const ox  = MINIMAP_PAD;  // origin x (top-left)
    const oy  = MINIMAP_PAD;  // origin y

    ctx.save();
    ctx.globalAlpha = MINIMAP_ALPHA;

    // Background panel
    ctx.fillStyle = '#000';
    ctx.fillRect(ox - 2, oy - 2, mmW + 4, mmH + 4);

    // Draw cells
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const cell = levelMap[y][x];
        if (cell > 0) {
          const color = level.getWallColor(cell);
          ctx.fillStyle = 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
        } else {
          ctx.fillStyle = '#222';
        }
        ctx.fillRect(
          ox + x * MINIMAP_SCALE,
          oy + y * MINIMAP_SCALE,
          MINIMAP_SCALE,
          MINIMAP_SCALE
        );
      }
    }

    // Player position dot
    const px = ox + player.x * MINIMAP_SCALE;
    const py = oy + player.y * MINIMAP_SCALE;
    ctx.fillStyle = '#0F0';
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();

    // FOV direction line
    const fovLen = 12;
    ctx.strokeStyle = '#0F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(
      px + Math.cos(player.angle) * fovLen,
      py + Math.sin(player.angle) * fovLen
    );
    ctx.stroke();

    // Left FOV boundary
    const halfFov = (typeof raycaster !== 'undefined' ? raycaster.FOV : Math.PI / 3) / 2;
    ctx.strokeStyle = 'rgba(0,255,0,0.4)';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(
      px + Math.cos(player.angle - halfFov) * fovLen,
      py + Math.sin(player.angle - halfFov) * fovLen
    );
    ctx.stroke();

    // Right FOV boundary
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(
      px + Math.cos(player.angle + halfFov) * fovLen,
      py + Math.sin(player.angle + halfFov) * fovLen
    );
    ctx.stroke();

    ctx.restore();
  }

  // ── FPS Counter & HUD ─────────────────────────────────────────
  let frameCount = 0;
  let fpsAccumulator = 0;
  let displayFps = 0;

  function updateFps(delta) {
    frameCount++;
    fpsAccumulator += delta;
    if (fpsAccumulator >= 1.0) {
      displayFps = Math.round(frameCount / fpsAccumulator);
      frameCount = 0;
      fpsAccumulator = 0;
    }
  }

  function drawHud() {
    const hudY = MINIMAP_PAD + mapHeight * MINIMAP_SCALE + 6;
    ctx.save();
    ctx.font = '14px monospace';
    ctx.fillStyle = '#00FF00';
    ctx.textBaseline = 'top';
    ctx.fillText('FPS: ' + displayFps, 10, hudY);
    ctx.fillText(
      'Pos: (' + player.x.toFixed(2) + ', ' + player.y.toFixed(2) + ')  Angle: ' + (player.angle * 180 / Math.PI).toFixed(0) + '\u00b0',
      10, hudY + 18
    );
    if (level) {
      ctx.fillStyle = '#88CCFF';
      ctx.fillText('Level: ' + level.name, 10, hudY + 36);
    }
    if (!pointerLocked) {
      ctx.fillStyle = '#FFAA00';
      ctx.fillText('Click canvas to capture mouse', 10, hudY + 54);
    } else {
      ctx.fillStyle = '#888';
      ctx.fillText('Mouse captured (ESC to release)', 10, hudY + 54);
    }
    ctx.restore();
  }

  // ── Game Loop ─────────────────────────────────────────────────
  let lastTime = performance.now();

  function gameLoop(now) {
    const delta = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    updatePlayer(delta);

    // Clear screen
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render 3D world
    if (levelMap && typeof raycaster !== 'undefined') {
      const strips = raycaster.castRays(player, levelMap, canvas.width, canvas.height);
      raycaster.renderWalls(ctx, strips, canvas.width, canvas.height);
    }

    // Mini-map overlay
    if (levelMap) {
      drawMiniMap();
    }

    // HUD
    updateFps(delta);
    drawHud();

    requestAnimationFrame(gameLoop);
  }

  // ── Boot: Load Level ─────────────────────────────────────────
  /**
   * Initialize the game by loading the first level.
   * Tries to fetch the JSON file; falls back to embedded default
   * if the fetch fails (e.g. when opening index.html directly
   * without a web server).
   */
  async function boot() {
    if (typeof Level === 'undefined') {
      console.error('Level module not loaded — using raycaster TEST_LEVEL fallback');
      levelMap = (typeof raycaster !== 'undefined') ? raycaster.TEST_LEVEL : null;
      mapHeight = levelMap ? levelMap.length : 0;
      mapWidth  = levelMap && levelMap[0] ? levelMap[0].length : 0;
      player.x = mapWidth / 2;
      player.y = mapHeight / 2;
      player.angle = 0;
      hintEl.style.display = 'block';
      requestAnimationFrame(gameLoop);
      return;
    }

    try {
      level = await Level.loadFromUrl('levels/e1m1.json');
    } catch (err) {
      console.warn('Failed to load levels/e1m1.json, using fallback:', err.message);
      level = Level.loadDefault();
    }

    levelMap = level.grid;
    mapWidth = level.width;
    mapHeight = level.height;
    player.x = level.spawn.x;
    player.y = level.spawn.y;
    player.angle = level.spawn.angle || 0;

    // Sync raycaster wall colors with the level's wall types
    if (typeof raycaster !== 'undefined' && raycaster.setWallColors) {
      raycaster.setWallColors(level.wallTypes);
    }

    console.log('Level loaded: ' + level.name + ' (' + mapWidth + 'x' + mapHeight + ')');
    hintEl.style.display = 'block';
    requestAnimationFrame(gameLoop);
  }

  boot();
})();
