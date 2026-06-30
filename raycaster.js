/**
 * raycaster.js — DDA Raycasting Engine
 * Issue #2: Render 3D walls from a 2D map
 *
 * Self-contained module that exports:
 *   castRays(player, levelMap, screenWidth, [screenHeight])  → wall strip data
 *   renderWalls(ctx, wallStrips, screenWidth, screenHeight) → draws to canvas
 *
 * Vanilla JS (ES6+), no build step, no frameworks.
 */

const raycaster = (() => {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────
  const FOV = Math.PI / 3;          // 60° field of view
  const MAX_DEPTH = 20;             // maximum ray distance (grid units)
  const HALF_FOV = FOV / 2;

  // Wall colors by type (r,g,b base + side shading multiplier)
  const WALL_COLORS = {
    1: { base: [180,  60,  60] }, // red brick
    2: { base: [ 60, 180,  60] }, // green slime
    3: { base: [ 60,  60, 180] }, // blue stone
    4: { base: [180, 180,  60] }, // yellow tech
  };

  // Side shading multipliers for depth perception
  // N/S walls get full brightness, E/W walls are darker
  const SIDE_SHADE = {
    'NS': 1.0,
    'EW': 0.65,
  };

  // ── castRays ──────────────────────────────────────────────────
  /**
   * Cast rays from the player's POV across the screen width using DDA.
   *
   * @param {Object} player - { x, y, angle } position & rotation in grid units
   * @param {number[][]} levelMap - 2D grid (0 = empty, 1+ = wall type)
   * @param {number} screenWidth - number of vertical strips (canvas width in px)
   * @param {number} [screenHeight] - optional canvas height for wall height calc
   * @returns {Object[]} wallStrips - array of strip data per column
   *   { distance, wallType, side ('NS'|'EW'), wallHeight, stripX }
   */
  function castRays(player, levelMap, screenWidth, screenHeight) {
    // Fallback: if no screenHeight passed, derive from canvas global if available
    if (!screenHeight && typeof window !== 'undefined' && window.innerHeight) {
      screenHeight = window.innerHeight;
    } else {
      screenHeight = screenHeight || 480;
    }
    const mapHeight = levelMap.length;
    const mapWidth = mapHeight > 0 ? levelMap[0].length : 0;

    const strips = new Array(screenWidth);

    // Starting angle is the leftmost ray (player angle - half FOV)
    const startAngle = player.angle - HALF_FOV;
    // Angle increment per screen column
    const angleStep = FOV / screenWidth;

    for (let col = 0; col < screenWidth; col++) {
      const rayAngle = startAngle + col * angleStep;

      // Direction vector for this ray
      const rayDirX = Math.cos(rayAngle);
      const rayDirY = Math.sin(rayAngle);

      // Player's grid cell
      let mapX = Math.floor(player.x);
      let mapY = Math.floor(player.y);

      // Length of ray from one x/y side to the next
      const deltaDistX = Math.abs(1 / (rayDirX || 1e-30));
      const deltaDistY = Math.abs(1 / (rayDirY || 1e-30));

      // Step direction and initial side distance
      let stepX, stepY;
      let sideDistX, sideDistY;

      if (rayDirX < 0) {
        stepX = -1;
        sideDistX = (player.x - mapX) * deltaDistX;
      } else {
        stepX = 1;
        sideDistX = (mapX + 1.0 - player.x) * deltaDistX;
      }

      if (rayDirY < 0) {
        stepY = -1;
        sideDistY = (player.y - mapY) * deltaDistY;
      } else {
        stepY = 1;
        sideDistY = (mapY + 1.0 - player.y) * deltaDistY;
      }

      // DDA loop — march the ray through the grid
      let hit = false;
      let wallType = 0;
      let side = 'NS'; // which side of the wall we hit
      let depth = MAX_DEPTH;

      for (let i = 0; i < MAX_DEPTH * 2; i++) {
        // Jump to next map cell
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 'EW';
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 'NS';
        }

        // Out of bounds → no hit
        if (mapX < 0 || mapX >= mapWidth || mapY < 0 || mapY >= mapHeight) {
          break;
        }

        const cell = levelMap[mapY][mapX];
        if (cell > 0) {
          hit = true;
          wallType = cell;
          // Calculate perpendicular wall distance (avoids fisheye)
          if (side === 'EW') {
            depth = (sideDistX - deltaDistX);
          } else {
            depth = (sideDistY - deltaDistY);
          }
          break;
        }
      }

      if (!hit) {
        strips[col] = { distance: MAX_DEPTH, wallType: 0, side: 'NS', wallHeight: 0, stripX: col };
        continue;
      }

      // Correct fisheye: project distance onto camera plane
      const correctedDist = depth * Math.cos(rayAngle - player.angle);

      // Wall height relative to screen (higher = closer)
      const wallHeight = Math.min(
        Math.floor(screenHeight / correctedDist),
        screenHeight
      ) || 0;

      strips[col] = {
        distance: correctedDist,
        wallType,
        side,
        wallHeight,
        stripX: col,
      };
    }

    return strips;
  }

  // ── renderWalls ───────────────────────────────────────────────
  /**
   * Draw wall strips to the canvas as vertical columns.
   *
   * @param {CanvasRenderingContext2D} ctx - 2D canvas context
   * @param {Object[]} wallStrips - output from castRays()
   * @param {number} screenWidth - canvas width
   * @param {number} screenHeight - canvas height
   */
  function renderWalls(ctx, wallStrips, screenWidth, screenHeight) {
    const horizon = screenHeight / 2;

    for (let i = 0; i < wallStrips.length; i++) {
      const strip = wallStrips[i];
      if (strip.wallType === 0 || strip.wallHeight <= 0) continue;

      // Get base color for this wall type
      const colorDef = WALL_COLORS[strip.wallType] || WALL_COLORS[1];
      const shade = SIDE_SHADE[strip.side] || 1.0;

      // Apply distance darkening (farther = darker)
      const darkness = Math.max(0.25, 1.0 - strip.distance / MAX_DEPTH);
      const r = Math.round(colorDef.base[0] * shade * darkness);
      const g = Math.round(colorDef.base[1] * shade * darkness);
      const b = Math.round(colorDef.base[2] * shade * darkness);

      // Draw ceiling (top half above wall)
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(strip.stripX, 0, 1, horizon - strip.wallHeight / 2);

      // Draw wall strip
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(strip.stripX, horizon - strip.wallHeight / 2, 1, strip.wallHeight);

      // Draw floor (bottom half below wall)
      ctx.fillStyle = '#2d2d1e';
      ctx.fillRect(strip.stripX, horizon + strip.wallHeight / 2, 1, horizon - strip.wallHeight / 2);
    }
  }

  // ── Default level (16×16) ─────────────────────────────────────
  /**
   * A simple 16×16 test level.
   * 0 = empty, 1 = red, 2 = green, 3 = blue, 4 = yellow
   */
  const TEST_LEVEL = [
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

  // ── Public API ────────────────────────────────────────────────
  return {
    FOV,
    MAX_DEPTH,
    TEST_LEVEL,
    castRays,
    renderWalls,
  };
})();

// Export for both module systems and global scope
if (typeof module !== 'undefined' && module.exports) {
  module.exports = raycaster;
}
if (typeof window !== 'undefined') {
  window.raycaster = raycaster;
}