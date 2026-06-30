/**
 * game.js — DOOM Browser Edition
 * Issue #3: Player Movement & Controls (WASD + Mouse Look)
 *
 * Features:
 *   - WASD movement (forward/backward + strafe)
 *   - Arrow keys or mouse for rotation
 *   - Pointer lock for mouse look (click canvas to capture, ESC to release)
 *   - Collision detection prevents walking through walls
 *   - Smooth movement with delta-time
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

  // ── Level Map ─────────────────────────────────────────────────
  const levelMap = (typeof raycaster !== 'undefined' && raycaster.TEST_LEVEL)
    ? raycaster.TEST_LEVEL
    : [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,2,2,2,0,0,0,0,0,0,3,3,3,0,1],
        [1,0,2,0,0,0,0,0,0,0,0,3,0,0,0,1],
        [1,0,2,0,0,0,0,4,4,0,0,3,0,0,0,1],
        [1,0,0,0,0,0,0,4,4,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,4,4,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,4,4,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      ];

  const mapHeight = levelMap.length;
  const mapWidth = levelMap[0].length;

  // ── Player State ──────────────────────────────────────────────
  const player = {
    x: 8.0,           // grid position (center of map)
    y: 8.0,
    angle: 0,         // facing east (radians)
  };

  // ── Movement Constants ───────────────────────────────────────
  const MOVE_SPEED   = 3.5;  // grid units per second
  const STRAFE_SPEED = 3.0;  // grid units per second
  const TURN_SPEED   = 2.5;  // radians per second (keyboard)
  const MOUSE_SENS   = 0.0025; // radians per pixel of mouse movement
  const COLLISION_MARGIN = 0.25; // wall buffer for collision

  // ── Input State ───────────────────────────────────────────────
  const keys = {};
  let pointerLocked = false;
  let mouseAccumX = 0; // accumulated mouse movement since last frame

  // Keyboard listeners
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    // Prevent page scroll on arrow keys / space
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  // Pointer lock setup
  canvas.addEventListener('click', () => {
    canvas.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    pointerLocked = (document.pointerLockElement === canvas);
    if (pointerLocked) {
      hintEl.style.display = 'none';
    } else {
      hintEl.style.display = 'block';
    }
  });

  // Mouse look — accumulate movement, apply in update
  document.addEventListener('mousemove', (e) => {
    if (pointerLocked) {
      mouseAccumX += e.movementX;
    }
  });

  // ── Collision Detection ───────────────────────────────────────
  /**
   * Check if a given (x, y) position is valid (not inside a wall).
   * Uses a margin buffer so the player can't clip into walls.
   *
   * @param {number} x - proposed x position
   * @param {number} y - proposed y position
   * @returns {boolean} true if the position is walkable
   */
  function isWalkable(x, y) {
    // Check the four corners around the player position with margin
    const minX = Math.floor(x - COLLISION_MARGIN);
    const maxX = Math.floor(x + COLLISION_MARGIN);
    const minY = Math.floor(y - COLLISION_MARGIN);
    const maxY = Math.floor(y + COLLISION_MARGIN);

    // Out of bounds
    if (minX < 0 || maxX >= mapWidth || minY < 0 || maxY >= mapHeight) {
      return false;
    }

    // Check all cells the player's bounding box overlaps
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        if (levelMap[cy][cx] > 0) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Attempt to move the player to (newX, newY) with per-axis collision.
   * Allows sliding along walls by checking each axis independently.
   *
   * @param {number} newX - proposed x
   * @param {number} newY - proposed y
   */
  function tryMove(newX, newY) {
    // Try X axis first (slide along walls)
    if (isWalkable(newX, player.y)) {
      player.x = newX;
    }
    // Then try Y axis
    if (isWalkable(player.x, newY)) {
      player.y = newY;
    }
  }

  // ── Update Player ─────────────────────────────────────────────
  /**
   * Update player position and rotation based on input.
   * @param {number} delta — seconds since last frame
   */
  function updatePlayer(delta) {
    const cos = Math.cos(player.angle);
    const sin = Math.sin(player.angle);

    // Movement vector
    let dx = 0, dy = 0;

    // W / ArrowUp — move forward
    if (keys['KeyW'] || keys['ArrowUp']) {
      dx += cos;
      dy += sin;
    }
    // S / ArrowDown — move backward
    if (keys['KeyS'] || keys['ArrowDown']) {
      dx -= cos;
      dy -= sin;
    }
    // A — strafe left
    if (keys['KeyA']) {
      dx += sin;
      dy -= cos;
    }
    // D — strafe right
    if (keys['KeyD']) {
      dx -= sin;
      dy += cos;
    }

    // Normalize diagonal movement so it's not faster
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;

      // Determine speed (forward/backward use MOVE_SPEED, strafe uses STRAFE_SPEED)
      // For simplicity, blend: if pure strafe, use strafe speed
      let speed = MOVE_SPEED;
      const forwardComponent = Math.abs(dx * cos + dy * sin);
      const strafeComponent = Math.abs(dx * -sin + dy * cos);

      if (strafeComponent > forwardComponent) {
        speed = STRAFE_SPEED;
      }

      const newX = player.x + dx * speed * delta;
      const newY = player.y + dy * speed * delta;
      tryMove(newX, newY);
    }

    // Rotation — keyboard (arrow keys / Q / E)
    if (keys['ArrowLeft'] || keys['KeyQ']) {
      player.angle -= TURN_SPEED * delta;
    }
    if (keys['ArrowRight'] || keys['KeyE']) {
      player.angle += TURN_SPEED * delta;
    }

    // Rotation — mouse (pointer lock)
    if (pointerLocked && mouseAccumX !== 0) {
      player.angle += mouseAccumX * MOUSE_SENS;
      mouseAccumX = 0;
    }

    // Normalize angle to [0, 2π)
    if (player.angle < 0) player.angle += Math.PI * 2;
    if (player.angle >= Math.PI * 2) player.angle -= Math.PI * 2;
  }

  // ── FPS Counter ───────────────────────────────────────────────
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
    ctx.save();
    ctx.font = '14px monospace';
    ctx.fillStyle = '#00FF00';
    ctx.textBaseline = 'top';
    ctx.fillText(`FPS: ${displayFps}`, 10, 10);
    ctx.fillText(`Pos: (${player.x.toFixed(2)}, ${player.y.toFixed(2)})  Angle: ${(player.angle * 180 / Math.PI).toFixed(0)}°`, 10, 28);

    if (!pointerLocked) {
      ctx.fillStyle = '#FFAA00';
      ctx.fillText('Click canvas to capture mouse', 10, 46);
    } else {
      ctx.fillStyle = '#888';
      ctx.fillText('Mouse captured (ESC to release)', 10, 46);
    }
    ctx.restore();
  }

  // ── Game Loop ─────────────────────────────────────────────────
  let lastTime = performance.now();

  function gameLoop(now) {
    const delta = Math.min((now - lastTime) / 1000, 0.1); // cap delta to avoid jumps
    lastTime = now;

    // Update player
    updatePlayer(delta);

    // Clear the screen
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Cast rays and render the 3D world
    if (typeof raycaster !== 'undefined') {
      const strips = raycaster.castRays(player, levelMap, canvas.width, canvas.height);
      raycaster.renderWalls(ctx, strips, canvas.width, canvas.height);
    }

    // Update + draw FPS and HUD
    updateFps(delta);
    drawHud();

    requestAnimationFrame(gameLoop);
  }

  // Show hint on start
  hintEl.style.display = 'block';

  requestAnimationFrame(gameLoop);
})();
