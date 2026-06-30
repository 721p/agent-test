/**
 * game.js — DOOM Browser Edition
 * Issue #1: Project scaffolding — HTML5 Canvas + game loop
 *
 * Vanilla JS (ES6+), no build step, no frameworks.
 * Works in Chrome and Firefox.
 */

(() => {
  'use strict';

  // ── Canvas Setup ──────────────────────────────────────────────
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  /**
   * Resize the canvas to fill the browser window.
   * Called on load and whenever the window is resized.
   */
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas(); // initial sizing

  // ── FPS Counter ───────────────────────────────────────────────
  let fps = 0;
  let frameCount = 0;
  let fpsAccumulator = 0; // accumulates delta time within the current second
  let displayFps = 0;     // the FPS value we actually render (updates once per second)

  /**
   * Update the FPS counter.
   * @param {number} delta — seconds since last frame
   */
  function updateFps(delta) {
    frameCount++;
    fpsAccumulator += delta;

    if (fpsAccumulator >= 1.0) {
      displayFps = Math.round(frameCount / fpsAccumulator);
      frameCount = 0;
      fpsAccumulator = 0;
    }
  }

  /**
   * Draw the FPS counter in the top-left corner.
   */
  function drawFps() {
    ctx.save();
    ctx.font = '16px monospace';
    ctx.fillStyle = '#00FF00';
    ctx.textBaseline = 'top';
    ctx.fillText(`FPS: ${displayFps}`, 10, 10);
    ctx.restore();
  }

  // ── Game Loop ─────────────────────────────────────────────────
  let lastTime = performance.now();

  /**
   * Main game loop using requestAnimationFrame with delta-time.
   * @param {number} now — high-resolution timestamp from rAF (ms)
   */
  function gameLoop(now) {
    const delta = (now - lastTime) / 1000; // convert ms → seconds
    lastTime = now;

    // Clear the screen (black background)
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Update + draw FPS
    updateFps(delta);
    drawFps();

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
})();