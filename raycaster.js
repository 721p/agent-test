/**
 * raycaster.js — DDA Raycasting Engine with Textures
 * Issue #5: Textured Walls, Floor/Ceiling, Fog
 *
 * Self-contained module that exports:
 *   castRays(player, levelMap, screenWidth, screenHeight)  → wall strip data
 *   renderWalls(ctx, wallStrips, screenWidth, screenHeight) → draws textured walls + floor + ceiling
 *
 * Vanilla JS (ES6+), no build step, no frameworks.
 */

const raycaster = (() => {
  'use strict';

  // ── Constants ───────────────────────────────────────────
  let FOV = Math.PI / 3;          // 60° field of view (mutable via setFov)
  const MAX_DEPTH = 20;             // maximum ray distance (grid units)
  let HALF_FOV = FOV / 2;

  function setFov(radians) {
    FOV = radians;
    HALF_FOV = FOV / 2;
  }
  const FOG_MAX_DIST = 16;          // Distance at which fog is fully opaque (black)

  let WALL_COLORS = {
    1: { base: [180,  60,  60] },
    2: { base: [ 60, 180,  60] },
    3: { base: [ 60,  60, 180] },
    4: { base: [180, 180,  60] },
  };

  function setWallColors(types) {
    if (!types) return;
    const newColors = {};
    for (const key of Object.keys(types)) {
      const id = parseInt(key, 10);
      const def = types[key];
      if (def && def.color) {
        newColors[id] = { base: def.color };
      }
    }
    WALL_COLORS = Object.assign({}, WALL_COLORS, newColors);
  }

  const SIDE_SHADE = { 'NS': 1.0, 'EW': 0.65 };

  // Texture system: check lazily so script load order doesn't matter
  function hasTextures() { return typeof textures !== 'undefined'; }
  function getTexSize() { return hasTextures() ? textures.TEX_SIZE : 64; }

  // ── castRays ───────────────────────────────────────
  function castRays(player, levelMap, screenWidth, screenHeight) {
    if (!screenHeight && typeof window !== 'undefined' && window.innerHeight) {
      screenHeight = window.innerHeight;
    } else {
      screenHeight = screenHeight || 480;
    }
    const mapHeight = levelMap.length;
    const mapWidth = mapHeight > 0 ? levelMap[0].length : 0;

    const strips = new Array(screenWidth);
    const startAngle = player.angle - HALF_FOV;
    const angleStep = FOV / screenWidth;

    for (let col = 0; col < screenWidth; col++) {
      const rayAngle = startAngle + col * angleStep;
      const rayDirX = Math.cos(rayAngle);
      const rayDirY = Math.sin(rayAngle);

      let mapX = Math.floor(player.x);
      let mapY = Math.floor(player.y);

      const deltaDistX = Math.abs(1 / (rayDirX || 1e-30));
      const deltaDistY = Math.abs(1 / (rayDirY || 1e-30));

      let stepX, stepY, sideDistX, sideDistY;

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

      let hit = false;
      let wallType = 0;
      let side = 'NS';
      let depth = MAX_DEPTH;
      let wallX = 0;

      for (let i = 0; i < MAX_DEPTH * 2; i++) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 'EW';
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 'NS';
        }

        if (mapX < 0 || mapX >= mapWidth || mapY < 0 || mapY >= mapHeight) {
          break;
        }

        const cell = levelMap[mapY][mapX];
        if (cell > 0) {
          hit = true;
          wallType = cell;
          if (side === 'EW') {
            depth = (sideDistX - deltaDistX);
            wallX = player.y + depth * rayDirY;
          } else {
            depth = (sideDistY - deltaDistY);
            wallX = player.x + depth * rayDirX;
          }
          break;
        }
      }

      if (!hit) {
        strips[col] = { distance: MAX_DEPTH, wallType: 0, side: 'NS', wallHeight: 0, stripX: col, texX: 0, rayAngle };
        continue;
      }

      const correctedDist = depth * Math.cos(rayAngle - player.angle);
      const wallHeight = Math.min(
        Math.floor(screenHeight / correctedDist),
        screenHeight * 2
      ) || 0;

      let texX = 0;
      if (hasTextures()) {
        wallX -= Math.floor(wallX);
        texX = Math.floor(wallX * getTexSize());
        if (side === 'EW' && rayDirX > 0) texX = getTexSize() - texX - 1;
        if (side === 'NS' && rayDirY < 0) texX = getTexSize() - texX - 1;
        if (texX < 0) texX = 0;
        if (texX >= getTexSize()) texX = getTexSize() - 1;
      }

      strips[col] = {
        distance: correctedDist,
        rawDistance: depth,
        wallType,
        side,
        wallHeight,
        stripX: col,
        texX,
        rayAngle,
      };
    }

    return strips;
  }

  // ── Fog/Shading Helper ────────────────────────────────
  function fogFactor(dist) {
    return Math.max(0, 1.0 - dist / FOG_MAX_DIST);
  }

  // ── renderWalls ─────────────────────────────────────
  function renderWalls(ctx, wallStrips, screenWidth, screenHeight) {
    const horizon = (screenHeight / 2) | 0;
    const imgData = ctx.createImageData(screenWidth, screenHeight);
    const buf = imgData.data;

    const floorTex = hasTextures() ? textures.getFloor() : null;
    const ceilTex = hasTextures() ? textures.getCeiling() : null;

    // ── Render floor and ceiling via floor casting ─────────────
    if (wallStrips.length > 0) {
      const leftAngle = wallStrips[0].rayAngle;
      const rightAngle = wallStrips[wallStrips.length - 1].rayAngle;
      const leftDirX = Math.cos(leftAngle);
      const leftDirY = Math.sin(leftAngle);
      const rightDirX = Math.cos(rightAngle);
      const rightDirY = Math.sin(rightAngle);

      for (let y = horizon + 1; y < screenHeight; y++) {
        const p = y - horizon;
        const rowDist = (0.5 * screenHeight) / p;
        const f = fogFactor(rowDist);

        for (let x = 0; x < screenWidth; x++) {
          const t = x / screenWidth;
          const floorX = 0.5 + rowDist * (leftDirX + t * (rightDirX - leftDirX));
          const floorY = 0.5 + rowDist * (leftDirY + t * (rightDirY - leftDirY));

          if (floorTex) {
            const tx = (Math.floor(floorX * getTexSize()) % getTexSize() + getTexSize()) % getTexSize();
            const ty = (Math.floor(floorY * getTexSize()) % getTexSize() + getTexSize()) % getTexSize();
            const ti = (ty * getTexSize() + tx) * 4;
            const fi = (y * screenWidth + x) * 4;
            buf[fi]     = floorTex[ti] * f;
            buf[fi + 1] = floorTex[ti + 1] * f;
            buf[fi + 2] = floorTex[ti + 2] * f;
            buf[fi + 3] = 255;
          } else {
            const fi = (y * screenWidth + x) * 4;
            const base = 55 * f;
            buf[fi] = base + 15; buf[fi + 1] = base + 5; buf[fi + 2] = base - 5; buf[fi + 3] = 255;
          }

          const cy = horizon - (y - horizon);
          if (cy >= 0) {
            if (ceilTex) {
              const tx = (Math.floor(floorX * getTexSize()) % getTexSize() + getTexSize()) % getTexSize();
              const ty = (Math.floor(floorY * getTexSize()) % getTexSize() + getTexSize()) % getTexSize();
              const ti = (ty * getTexSize() + tx) * 4;
              const ci = (cy * screenWidth + x) * 4;
              buf[ci]     = ceilTex[ti] * f;
              buf[ci + 1] = ceilTex[ti + 1] * f;
              buf[ci + 2] = ceilTex[ti + 2] * f;
              buf[ci + 3] = 255;
            } else {
              const ci = (cy * screenWidth + x) * 4;
              const base = 28 * f;
              buf[ci] = base + 5; buf[ci + 1] = base + 3; buf[ci + 2] = base + 8; buf[ci + 3] = 255;
            }
          }
        }
      }
    }

    // ── Render textured wall strips ────────────────────────────
    for (let i = 0; i < wallStrips.length; i++) {
      const strip = wallStrips[i];
      if (strip.wallType === 0 || strip.wallHeight <= 0) continue;

      const stripX = strip.stripX;
      const wallTop = Math.max(0, horizon - (strip.wallHeight / 2 | 0));
      const wallBot = Math.min(screenHeight, horizon + (strip.wallHeight / 2 | 0));
      const wallH = wallBot - wallTop;

      const shade = SIDE_SHADE[strip.side] || 1.0;
      const f = fogFactor(strip.distance);

      if (hasTextures()) {
        const tex = textures.get(strip.wallType);
        const texX = strip.texX;
        for (let py = 0; py < wallH; py++) {
          let texY = Math.floor((py / strip.wallHeight) * getTexSize());
          if (texY < 0) texY = 0;
          if (texY >= getTexSize()) texY = getTexSize() - 1;

          const ti = (texY * getTexSize() + texX) * 4;
          const fi = ((wallTop + py) * screenWidth + stripX) * 4;
          buf[fi]     = tex[ti] * shade * f;
          buf[fi + 1] = tex[ti + 1] * shade * f;
          buf[fi + 2] = tex[ti + 2] * shade * f;
          buf[fi + 3] = 255;
        }
      } else {
        const colorDef = WALL_COLORS[strip.wallType] || WALL_COLORS[1];
        const s = shade * f;
        const r = Math.round(colorDef.base[0] * s);
        const g = Math.round(colorDef.base[1] * s);
        const b = Math.round(colorDef.base[2] * s);
        for (let py = 0; py < wallH; py++) {
          const fi = ((wallTop + py) * screenWidth + stripX) * 4;
          buf[fi] = r; buf[fi + 1] = g; buf[fi + 2] = b; buf[fi + 3] = 255;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  // ── Default level (16x16) ─────────────────────────────────
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

  return {
    get FOV() { return FOV; },
    MAX_DEPTH,
    TEST_LEVEL,
    castRays,
    renderWalls,
    setWallColors,
    setFov,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = raycaster;
}
if (typeof window !== 'undefined') {
  window.raycaster = raycaster;
}
