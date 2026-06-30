/**
 * game.js — DOOM Browser Edition
 * Issue #3: Player Movement & Controls (WASD + Mouse Look)
 * Issue #7: Weapons & Shooting (pistol, shotgun, fire mechanics)
 * Issue #9: Health, Damage & Pickups (guarded — works with or without Health module)
 * Issue #10: Multiple Levels & Progression
 *
 * Vanilla JS (ES6+), no build step, no frameworks.
 */

(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const hintEl = document.getElementById('pointerLockHint');

  function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // ── Level Progression Constants ─────────────────────────
  const LEVELS = [
    { file: 'levels/e1m1.json', name: 'E1M1 — Deimos Anomaly' },
    { file: 'levels/e1m2.json', name: 'E1M2 — Containment Breach' },
    { file: 'levels/e1m3.json', name: 'E1M3 — Hellgate Arena' },
  ];
  const EXIT_TILE = 5; // Wall type 5 = exit door
  const MAX_LEVEL = LEVELS.length;

  // ── Game State ───────────────────────────────────────────
  let currentLevelIndex = 0;
  let levelData = null;
  let levelMap = null;
  let mapWidth = 0, mapHeight = 0;

  // Progression states: 'playing', 'transitioning', 'victory'
  let gameState = 'playing';
  let transitionTimer = 0;
  const TRANSITION_DURATION = 2.5; // seconds: fade out + show text + fade in
  let pendingLevelIndex = 0;

  // Persisted progress
  let maxUnlockedLevel = 0;
  try {
    const saved = parseInt(localStorage.getItem('doom_max_level') || '0', 10);
    if (saved >= 0 && saved < MAX_LEVEL) maxUnlockedLevel = saved;
  } catch (e) { /* localStorage may be blocked */ }

  // Fallback inline level (16x16)
  const FALLBACK_LEVEL = [
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

  const player = { x: 8.0, y: 8.0, angle: 0 };
  const MOVE_SPEED = 3.5, STRAFE_SPEED = 3.0, TURN_SPEED = 2.5, MOUSE_SENS = 0.0025, COLLISION_MARGIN = 0.25;
  const weapons = (typeof Weapons !== 'undefined') ? Weapons.create() : null;
  const playerHealth = (typeof Health !== 'undefined') ? Health.createPlayer(weapons) : null;
  const enemySystem = (typeof Enemies !== 'undefined') ? Enemies.create() : null;
  let pickups = [];
  const keys = {};
  let pointerLocked = false, mouseAccumX = 0;

  // ── Level Loading ──────────────────────────────────────
  async function loadLevel(levelIndex) {
    const levelInfo = LEVELS[levelIndex];
    const url = levelInfo ? levelInfo.file : 'levels/e1m1.json';

    try {
      if (typeof Level !== 'undefined') {
        levelData = await Level.loadFromUrl(url);
        levelMap = levelData.grid;
        mapHeight = levelData.height;
        mapWidth = levelData.width;
        if (levelData.spawn) {
          player.x = levelData.spawn.x;
          player.y = levelData.spawn.y;
          player.angle = levelData.spawn.angle || 0;
        }
      } else {
        levelMap = FALLBACK_LEVEL;
        mapHeight = levelMap.length;
        mapWidth = levelMap[0].length;
      }
    } catch (e) {
      console.warn('Failed to load level ' + url + ', using fallback:', e);
      levelMap = FALLBACK_LEVEL;
      mapHeight = levelMap.length;
      mapWidth = levelMap[0].length;
    }

    // Load pickups
    if (levelData && levelData.pickups && typeof Health !== 'undefined') {
      pickups = Health.loadPickups(levelData);
    } else if (typeof Health !== 'undefined') {
      pickups = Health.loadPickups({
        pickups: [
          { x: 5.5, y: 5.5, type: 'health' },
          { x: 10.5, y: 10.5, type: 'health' },
          { x: 7.5, y: 12.5, type: 'pistol_ammo' },
          { x: 12.5, y: 6.5, type: 'shotgun_ammo' },
        ]
      });
    } else {
      pickups = [];
    }

    // Spawn enemies from level JSON
    if (enemySystem && typeof Enemies !== 'undefined') {
      enemySystem.enemies = [];
      enemySystem.projectiles = [];
      if (levelData && levelData.enemies) {
        Enemies.loadFromLevel(enemySystem, levelData);
      }
    }

    // Update wall colors in raycaster
    if (typeof raycaster !== 'undefined' && levelData && levelData.wallTypes) {
      if (typeof raycaster.setWallColors === 'function') {
        raycaster.setWallColors(levelData.wallTypes);
      }
    }
  }

  function resetGame() {
    if (playerHealth && typeof Health !== 'undefined') {
      Health.reset(playerHealth, weapons);
    }
    if (weapons && typeof Weapons !== 'undefined') {
      weapons.ammo['pistol'] = Weapons.WEAPON_DEFS.pistol.ammoStart;
      weapons.ammo['shotgun'] = Weapons.WEAPON_DEFS.shotgun.ammoStart;
      weapons.current = 'pistol';
      weapons.cooldown = 0;
      weapons.muzzleFlash = 0;
      weapons.recoilOffset = 0;
    }
    if (levelData && levelData.spawn) {
      player.x = levelData.spawn.x;
      player.y = levelData.spawn.y;
      player.angle = levelData.spawn.angle || 0;
    } else {
      player.x = 8.0;
      player.y = 8.0;
      player.angle = 0;
    }
    // Reload pickups
    if (levelData && typeof Health !== 'undefined') {
      pickups = Health.loadPickups(levelData);
    }
    // Respawn enemies
    if (enemySystem && typeof Enemies !== 'undefined') {
      enemySystem.enemies = [];
      enemySystem.projectiles = [];
      if (levelData && levelData.enemies) {
        Enemies.loadFromLevel(enemySystem, levelData);
      }
    }
  }

  // ── Level Progression ───────────────────────────────────
  function startLevelTransition(nextIndex) {
    gameState = 'transitioning';
    transitionTimer = 0;
    pendingLevelIndex = nextIndex;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }

  function showVictoryScreen() {
    gameState = 'victory';
    transitionTimer = 0;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }

  async function performLevelSwitch(index) {
    currentLevelIndex = index;
    await loadLevel(index);
    // Reset player health and weapons for new level
    if (playerHealth && typeof Health !== 'undefined') {
      Health.reset(playerHealth, weapons);
    }
    if (weapons && typeof Weapons !== 'undefined') {
      weapons.ammo['pistol'] = Weapons.WEAPON_DEFS.pistol.ammoStart;
      weapons.ammo['shotgun'] = Weapons.WEAPON_DEFS.shotgun.ammoStart;
      weapons.current = 'pistol';
      weapons.cooldown = 0;
      weapons.muzzleFlash = 0;
      weapons.recoilOffset = 0;
    }
    gameState = 'playing';
    transitionTimer = 0;
    hintEl.style.display = 'block';
  }

  // ── Exit Tile Detection ─────────────────────────────────
  function checkExitTile() {
    const mx = Math.floor(player.x);
    const my = Math.floor(player.y);
    if (mx < 0 || mx >= mapWidth || my < 0 || my >= mapHeight) return false;

    // Check adjacent cells for exit tile (type 5)
    const checks = [
      [mx + 1, my],
      [mx - 1, my],
      [mx, my + 1],
      [mx, my - 1],
    ];
    for (const [cx, cy] of checks) {
      if (cx < 0 || cx >= mapWidth || cy < 0 || cy >= mapHeight) continue;
      if (levelMap[cy][cx] === EXIT_TILE) {
        const tileCenterX = cx + 0.5;
        const tileCenterY = cy + 0.5;
        const dist = Math.hypot(player.x - tileCenterX, player.y - tileCenterY);
        if (dist < 1.0) return true;
      }
    }
    return false;
  }

  // ── Input ──────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (weapons && e.code === 'Digit1') Weapons.switchTo(weapons, 1);
    if (weapons && e.code === 'Digit2') Weapons.switchTo(weapons, 2);
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();

    // Restart on death
    if (playerHealth && playerHealth.dead && (e.code === 'Space' || e.code === 'Enter')) {
      resetGame();
    }

    // Victory screen: press space/enter to restart from level 1
    if (gameState === 'victory' && (e.code === 'Space' || e.code === 'Enter')) {
      currentLevelIndex = 0;
      performLevelSwitch(0);
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  canvas.addEventListener('click', () => {
    if (gameState === 'victory') {
      currentLevelIndex = 0;
      performLevelSwitch(0);
      return;
    }
    if (gameState === 'transitioning') return;
    if (playerHealth && playerHealth.dead) {
      resetGame();
      return;
    }
    if (!pointerLocked) canvas.requestPointerLock();
    else if (weapons) handleFire();
  });
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = (document.pointerLockElement === canvas);
    hintEl.style.display = (pointerLocked || gameState !== 'playing') ? 'none' : 'block';
  });
  document.addEventListener('mousemove', (e) => { if (pointerLocked) mouseAccumX += e.movementX; });
  canvas.addEventListener('mousedown', (e) => {
    if (gameState !== 'playing') return;
    if (playerHealth && playerHealth.dead) { resetGame(); return; }
    if (pointerLocked && e.button === 0 && weapons) handleFire();
  });

  function handleFire() {
    if (playerHealth && playerHealth.dead) return;
    if (gameState !== 'playing') return;
    const result = Weapons.tryFire(weapons);
    if (!result) return;
    for (let p = 0; p < result.pellets; p++) {
      const offset = result.spread > 0 ? (Math.random()-0.5)*2*result.spread : 0;
      const hit = Weapons.raycastHit(player, player.angle + offset, levelMap);
      if (hit && enemySystem) {
        Enemies.tryHit(enemySystem, hit.x, hit.y, result.damage);
      }
    }
  }

  // ── Movement & Collision ──────────────────────────────
  function isWalkable(x, y) {
    const mX = Math.floor(x-COLLISION_MARGIN), mY = Math.floor(y-COLLISION_MARGIN);
    const xY = Math.floor(x+COLLISION_MARGIN), yY = Math.floor(y+COLLISION_MARGIN);
    if (mX<0||xY>=mapWidth||mY<0||yY>=mapHeight) return false;
    for (let cy=mY;cy<=yY;cy++) for (let cx=mX;cx<=xY;cx++) {
      const cell = levelMap[cy][cx];
      // All walls (including exit tiles) are solid — exit triggers by proximity
      if (cell > 0) return false;
    }
    return true;
  }
  function tryMove(newX, newY) {
    if (isWalkable(newX, player.y)) player.x = newX;
    if (isWalkable(player.x, newY)) player.y = newY;
  }

  function updatePlayer(delta) {
    if (playerHealth && playerHealth.dead) return;
    if (gameState !== 'playing') return;

    const cos = Math.cos(player.angle), sin = Math.sin(player.angle);
    let dx = 0, dy = 0;
    if (keys['KeyW']||keys['ArrowUp']) { dx+=cos; dy+=sin; }
    if (keys['KeyS']||keys['ArrowDown']) { dx-=cos; dy-=sin; }
    if (keys['KeyA']) { dx+=sin; dy-=cos; }
    if (keys['KeyD']) { dx-=sin; dy+=cos; }
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx/=len; dy/=len;
      let speed = Math.abs(dx*-sin+dy*cos) > Math.abs(dx*cos+dy*sin) ? STRAFE_SPEED : MOVE_SPEED;
      tryMove(player.x+dx*speed*delta, player.y+dy*speed*delta);
    }
    if (keys['ArrowLeft']||keys['KeyQ']) player.angle -= TURN_SPEED*delta;
    if (keys['ArrowRight']||keys['KeyE']) player.angle += TURN_SPEED*delta;
    if (pointerLocked && mouseAccumX !== 0) { player.angle += mouseAccumX*MOUSE_SENS; mouseAccumX = 0; }
    if (player.angle < 0) player.angle += Math.PI*2;
    if (player.angle >= Math.PI*2) player.angle -= Math.PI*2;

    // Check for exit tile proximity
    if (checkExitTile()) {
      if (currentLevelIndex + 1 < MAX_LEVEL) {
        const nextLvl = currentLevelIndex + 1;
        if (nextLvl > maxUnlockedLevel) {
          maxUnlockedLevel = nextLvl;
          try { localStorage.setItem('doom_max_level', String(maxUnlockedLevel)); } catch (e) {}
        }
        startLevelTransition(nextLvl);
      } else {
        showVictoryScreen();
      }
    }
  }

  // ── FPS Counter ────────────────────────────────────────
  let frameCount = 0, fpsAccumulator = 0, displayFps = 0;
  function updateFps(delta) {
    frameCount++; fpsAccumulator += delta;
    if (fpsAccumulator >= 1.0) { displayFps = Math.round(frameCount/fpsAccumulator); frameCount = 0; fpsAccumulator = 0; }
  }

  // ── Mini-Map ───────────────────────────────────────────
  function drawMiniMap() {
    const tile = 4, mw = mapWidth*tile, mh = mapHeight*tile;
    const ox = canvas.width-mw-10, oy = 10;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(ox-2, oy-2, mw+4, mh+4);
    for (let y=0;y<mapHeight;y++) for (let x=0;x<mapWidth;x++) {
      const cell = levelMap[y][x];
      if (cell > 0) {
        if (cell === EXIT_TILE) ctx.fillStyle = '#00FF00';
        else ctx.fillStyle = '#444';
        ctx.fillRect(ox+x*tile, oy+y*tile, tile, tile);
      }
    }
    // Draw pickups on minimap
    for (let i = 0; i < pickups.length; i++) {
      const p = pickups[i];
      if (p.collected) continue;
      const px = ox + p.x * tile, py = oy + p.y * tile;
      if (p.type === 'health') ctx.fillStyle = '#FF4444';
      else if (p.type === 'pistol_ammo') ctx.fillStyle = '#FFFF44';
      else ctx.fillStyle = '#FF8844';
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }
    // Draw enemies on minimap
    if (enemySystem) {
      for (let i = 0; i < enemySystem.enemies.length; i++) {
        const e = enemySystem.enemies[i];
        if (e.state === 4) continue; // DEAD state
        const ex = ox + e.x * tile, ey = oy + e.y * tile;
        ctx.fillStyle = '#FF0066';
        ctx.fillRect(ex - 2, ey - 2, 4, 4);
      }
    }
    const px = ox+player.x*tile, py = oy+player.y*tile;
    ctx.fillStyle = '#00FF00'; ctx.beginPath(); ctx.arc(px,py,3,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#00FF00'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(px,py);
    ctx.lineTo(px+Math.cos(player.angle)*12, py+Math.sin(player.angle)*12); ctx.stroke();
    ctx.restore();
  }

  // ── HUD ────────────────────────────────────────────────
  function drawHud() {
    ctx.save();
    ctx.font = '14px monospace'; ctx.fillStyle = '#00FF00'; ctx.textBaseline = 'top';
    ctx.fillText('FPS: '+displayFps, 10, 10);
    ctx.fillText('Pos: ('+player.x.toFixed(2)+', '+player.y.toFixed(2)+')  Angle: '+(player.angle*180/Math.PI).toFixed(0)+'\u00B0', 10, 28);

    // Level indicator
    ctx.font = '16px monospace'; ctx.fillStyle = '#00CCFF'; ctx.textAlign = 'center';
    const levelName = LEVELS[currentLevelIndex] ? LEVELS[currentLevelIndex].name : 'Unknown';
    ctx.fillText('Level ' + (currentLevelIndex + 1) + '/' + MAX_LEVEL + ' — ' + levelName, canvas.width / 2, 10);
    ctx.textAlign = 'left';

    if (!pointerLocked && !(playerHealth && playerHealth.dead) && gameState === 'playing') {
      ctx.fillStyle='#FFAA00'; ctx.fillText('Click canvas to capture mouse', 10, 46);
    }
    else if (!(playerHealth && playerHealth.dead) && gameState === 'playing') {
      ctx.fillStyle='#888'; ctx.fillText('Mouse captured (ESC) \u00B7 Click to fire \u00B7 1/2 switch weapons', 10, 46);
    }
    if (weapons) {
      const info = Weapons.getAmmoInfo(weapons);
      ctx.font='16px monospace'; ctx.fillStyle='#FFD700'; ctx.textAlign='right';
      ctx.fillText(info.name+' | Ammo: '+info.ammo+'/'+info.max, canvas.width-10, 10);
      ctx.font='12px monospace'; ctx.fillStyle='#888';
      ctx.fillText('[1] Pistol  [2] Shotgun', canvas.width-10, 30);
      ctx.fillStyle='#FFD700';
      ctx.fillText(info.slot===1?'[1] Pistol':'[2] Shotgun', canvas.width-10, 30);
      if (info.ammo===0) { ctx.font='18px monospace'; ctx.fillStyle='#FF0000'; ctx.textAlign='center'; ctx.fillText('NO AMMO \u2014 SWITCH WEAPON', canvas.width/2, 80); }
      else if (info.ammo<=3) { ctx.font='14px monospace'; ctx.fillStyle='#FF6600'; ctx.textAlign='center'; ctx.fillText('Low ammo!', canvas.width/2, 80); }
    }
    ctx.restore();

    // Health HUD
    if (playerHealth && typeof Health !== 'undefined') {
      Health.drawHealthHud(ctx, playerHealth, canvas.width, canvas.height);
    }

    // Enemy count indicator
    if (enemySystem && typeof Enemies !== 'undefined' && gameState === 'playing') {
      const alive = Enemies.getAliveCount(enemySystem);
      ctx.save();
      ctx.font = '14px monospace'; ctx.fillStyle = '#FF6644'; ctx.textAlign = 'center';
      ctx.fillText('Enemies: ' + alive, canvas.width / 2, 32);
      ctx.restore();
    }
  }

  // ── Transition Screen ──────────────────────────────────
  function drawTransitionScreen() {
    const t = transitionTimer;
    const half = TRANSITION_DURATION / 2;

    let alpha;
    if (t < half) {
      alpha = t / half;
    } else {
      alpha = 1.0 - (t - half) / half;
    }

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, ' + alpha + ')';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Show level name when fully black (middle of transition)
    if (t >= half * 0.7 && t <= half * 1.3) {
      const nextLevel = LEVELS[pendingLevelIndex];
      const levelName = nextLevel ? nextLevel.name : 'Unknown Level';
      const levelNum = pendingLevelIndex + 1;

      const textAlpha = 1.0 - Math.abs(t - half) / (half * 0.3);
      ctx.fillStyle = 'rgba(0, 255, 0, ' + textAlpha + ')';
      ctx.font = 'bold 48px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LEVEL ' + levelNum, canvas.width / 2, canvas.height / 2 - 30);
      ctx.font = '24px monospace';
      ctx.fillText(levelName, canvas.width / 2, canvas.height / 2 + 20);
      ctx.font = '14px monospace';
      ctx.fillStyle = 'rgba(200, 200, 200, ' + textAlpha + ')';
      ctx.fillText('Get ready...', canvas.width / 2, canvas.height / 2 + 60);
    }
    ctx.restore();
  }

  // ── Victory Screen ─────────────────────────────────────
  function drawVictoryScreen() {
    const t = transitionTimer;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const pulse = 0.7 + Math.sin(t * 3) * 0.3;
    ctx.fillStyle = 'rgba(255, 215, 0, ' + pulse + ')';
    ctx.font = 'bold 64px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VICTORY!', canvas.width / 2, canvas.height / 2 - 80);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '24px monospace';
    ctx.fillText('You have cleared all ' + MAX_LEVEL + ' levels', canvas.width / 2, canvas.height / 2 - 20);
    ctx.fillText('The demonic invasion has been stopped.', canvas.width / 2, canvas.height / 2 + 15);

    ctx.fillStyle = '#00FF00';
    ctx.font = '18px monospace';
    ctx.fillText('Press SPACE or ENTER to play again', canvas.width / 2, canvas.height / 2 + 70);
    ctx.fillText('or click anywhere on the screen', canvas.width / 2, canvas.height / 2 + 100);

    ctx.restore();
  }

  // ── Game Loop ──────────────────────────────────────────
  let lastTime = performance.now();
  function gameLoop(now) {
    const delta = Math.min((now-lastTime)/1000, 0.1);
    lastTime = now;

    if (gameState === 'playing') {
      updatePlayer(delta);
      if (weapons) Weapons.update(weapons, delta);
      if (playerHealth && typeof Health !== 'undefined') {
        Health.updateFlash(playerHealth, delta);
        Health.updatePickups(pickups, player, weapons, playerHealth, delta);
      }

      // Update enemies
      if (enemySystem && typeof Enemies !== 'undefined') {
        Enemies.update(enemySystem, delta, player, levelMap);
        // Apply enemy damage to player
        if (enemySystem.playerDamage > 0 && playerHealth && typeof Health !== 'undefined') {
          Health.takeDamage(playerHealth, enemySystem.playerDamage);
          enemySystem.playerDamage = 0;
        }
      }
    } else if (gameState === 'transitioning') {
      transitionTimer += delta;
      if (transitionTimer >= TRANSITION_DURATION) {
        performLevelSwitch(pendingLevelIndex);
      }
    } else if (gameState === 'victory') {
      transitionTimer += delta;
    }

    // ── Render ─────────────────────────────────────
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (gameState === 'playing' || gameState === 'transitioning') {
      if (typeof raycaster !== 'undefined') {
        const strips = raycaster.castRays(player, levelMap, canvas.width, canvas.height);
        raycaster.renderWalls(ctx, strips, canvas.width, canvas.height);
      }

      // Draw pickups in 3D view
      if (typeof Health !== 'undefined' && pickups.length > 0) {
        Health.drawPickups(ctx, pickups, player, canvas.width, canvas.height);
      }

      // Draw enemies in 3D view
      if (enemySystem && typeof Enemies !== 'undefined') {
        Enemies.render(enemySystem, ctx, player, levelMap, canvas.width, canvas.height);
      }

      if (weapons && !(playerHealth && playerHealth.dead) && gameState === 'playing') {
        Weapons.drawSprite(ctx, weapons, canvas.width, canvas.height);
        Weapons.drawMuzzleFlash(ctx, weapons, canvas.width, canvas.height);
      }

      drawMiniMap();
      updateFps(delta);
      drawHud();

      // Screen flash effects
      if (playerHealth && typeof Health !== 'undefined') {
        Health.drawScreenFlash(ctx, playerHealth, canvas.width, canvas.height);
      }

      // Death screen
      if (playerHealth && playerHealth.dead && typeof Health !== 'undefined') {
        Health.drawDeathScreen(ctx, canvas.width, canvas.height);
      }

      // Transition overlay
      if (gameState === 'transitioning') {
        drawTransitionScreen();
      }
    } else if (gameState === 'victory') {
      // Render the 3D view faintly behind victory screen
      if (typeof raycaster !== 'undefined') {
        const strips = raycaster.castRays(player, levelMap, canvas.width, canvas.height);
        raycaster.renderWalls(ctx, strips, canvas.width, canvas.height);
      }
      drawVictoryScreen();
    }

    requestAnimationFrame(gameLoop);
  }

  // ── Init ───────────────────────────────────────────────
  // Expose player interface for enemy AI coordination
  if (typeof window !== 'undefined') {
    window.gamePlayer = player;
    window.gamePlayerHealth = playerHealth;
    window.gameTakeDamage = function(amount) {
      if (playerHealth && typeof Health !== 'undefined') {
        Health.takeDamage(playerHealth, amount);
      }
    };
    window.gameGetLevel = function() { return currentLevelIndex; };
    window.gameGetGameState = function() { return gameState; };
    window.gameSelectLevel = function(index) {
      if (index >= 0 && index <= maxUnlockedLevel && gameState === 'playing') {
        currentLevelIndex = index;
        performLevelSwitch(index);
      }
    };
    window.gameGetMaxUnlocked = function() { return maxUnlockedLevel; };
  }

  async function init() {
    await loadLevel(currentLevelIndex);
    hintEl.style.display = 'block';
    requestAnimationFrame(gameLoop);
  }

  init();
})();