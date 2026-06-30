/**
 * game.js — DOOM Browser Edition
 * Issue #3: Player Movement & Controls (WASD + Mouse Look)
 * Issue #7: Weapons & Shooting (pistol, shotgun, fire mechanics)
 * Issue #9: Health, Damage & Pickups
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

  // ── Level loading ─────────────────────────────────────
  let levelData = null;
  let levelMap = null;
  let mapWidth = 0, mapHeight = 0;

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

  // ── Game State ────────────────────────────────────────
  const player = { x: 8.0, y: 8.0, angle: 0 };
  const MOVE_SPEED = 3.5, STRAFE_SPEED = 3.0, TURN_SPEED = 2.5, MOUSE_SENS = 0.0025, COLLISION_MARGIN = 0.25;
  const weapons = (typeof Weapons !== 'undefined') ? Weapons.create() : null;
  const playerHealth = (typeof Health !== 'undefined') ? Health.createPlayer(weapons) : null;
  let pickups = [];
  const keys = {};
  let pointerLocked = false, mouseAccumX = 0;
  let gameStarted = false;

  // ── Level Loading ──────────────────────────────────────
  async function loadLevel() {
    try {
      if (typeof Level !== 'undefined') {
        levelData = await Level.loadFromUrl('levels/e1m1.json');
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
      console.warn('Failed to load level, using fallback:', e);
      levelMap = FALLBACK_LEVEL;
      mapHeight = levelMap.length;
      mapWidth = levelMap[0].length;
    }

    // Load pickups from level JSON or use defaults
    if (levelData && levelData.pickups && typeof Health !== 'undefined') {
      pickups = Health.loadPickups(levelData);
    } else if (typeof Health !== 'undefined') {
      // Default pickups for fallback level
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
  }

  function resetGame() {
    if (playerHealth && typeof Health !== 'undefined') {
      Health.reset(playerHealth, weapons);
    }
    if (weapons && typeof Weapons !== 'undefined') {
      // Reset weapons
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
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  canvas.addEventListener('click', () => {
    if (playerHealth && playerHealth.dead) {
      resetGame();
      return;
    }
    if (!pointerLocked) canvas.requestPointerLock();
    else if (weapons) handleFire();
  });
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = (document.pointerLockElement === canvas);
    hintEl.style.display = pointerLocked ? 'none' : 'block';
  });
  document.addEventListener('mousemove', (e) => { if (pointerLocked) mouseAccumX += e.movementX; });
  canvas.addEventListener('mousedown', (e) => {
    if (playerHealth && playerHealth.dead) { resetGame(); return; }
    if (pointerLocked && e.button === 0 && weapons) handleFire();
  });

  function handleFire() {
    if (playerHealth && playerHealth.dead) return;
    const result = Weapons.tryFire(weapons);
    if (!result) return;
    for (let p = 0; p < result.pellets; p++) {
      const offset = result.spread > 0 ? (Math.random()-0.5)*2*result.spread : 0;
      const hit = Weapons.raycastHit(player, player.angle + offset, levelMap);
      if (hit) weapons.lastHit = hit;
    }
  }

  // ── Movement & Collision ──────────────────────────────
  function isWalkable(x, y) {
    const mX = Math.floor(x-COLLISION_MARGIN), mY = Math.floor(y-COLLISION_MARGIN);
    const xY = Math.floor(x+COLLISION_MARGIN), yY = Math.floor(y+COLLISION_MARGIN);
    if (mX<0||xY>=mapWidth||mY<0||yY>=mapHeight) return false;
    for (let cy=mY;cy<=yY;cy++) for (let cx=mX;cx<=xY;cx++) if (levelMap[cy][cx]>0) return false;
    return true;
  }
  function tryMove(newX, newY) {
    if (isWalkable(newX, player.y)) player.x = newX;
    if (isWalkable(player.x, newY)) player.y = newY;
  }

  function updatePlayer(delta) {
    if (playerHealth && playerHealth.dead) return;

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
    for (let y=0;y<mapHeight;y++) for (let x=0;x<mapWidth;x++)
      if (levelMap[y][x]>0) { ctx.fillStyle='#444'; ctx.fillRect(ox+x*tile, oy+y*tile, tile, tile); }
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
    if (!pointerLocked && !(playerHealth && playerHealth.dead)) { ctx.fillStyle='#FFAA00'; ctx.fillText('Click canvas to capture mouse', 10, 46); }
    else if (!(playerHealth && playerHealth.dead)) { ctx.fillStyle='#888'; ctx.fillText('Mouse captured (ESC) \u00B7 Click to fire \u00B7 1/2 switch weapons', 10, 46); }
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
  }

  // ── Game Loop ──────────────────────────────────────────
  let lastTime = performance.now();
  function gameLoop(now) {
    const delta = Math.min((now-lastTime)/1000, 0.1);
    lastTime = now;

    updatePlayer(delta);
    if (weapons) Weapons.update(weapons, delta);
    if (playerHealth && typeof Health !== 'undefined') {
      Health.updateFlash(playerHealth, delta);
      Health.updatePickups(pickups, player, weapons, playerHealth, delta);
    }

    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (typeof raycaster !== 'undefined') {
      const strips = raycaster.castRays(player, levelMap, canvas.width, canvas.height);
      raycaster.renderWalls(ctx, strips, canvas.width, canvas.height);
    }

    // Draw pickups in 3D view (after walls, before weapon sprite)
    if (typeof Health !== 'undefined' && pickups.length > 0) {
      Health.drawPickups(ctx, pickups, player, canvas.width, canvas.height);
    }

    if (weapons && !(playerHealth && playerHealth.dead)) {
      Weapons.drawSprite(ctx, weapons, canvas.width, canvas.height);
      Weapons.drawMuzzleFlash(ctx, weapons, canvas.width, canvas.height);
    }

    drawMiniMap();
    updateFps(delta);
    drawHud();

    // Screen flash effects (damage/heal)
    if (playerHealth && typeof Health !== 'undefined') {
      Health.drawScreenFlash(ctx, playerHealth, canvas.width, canvas.height);
    }

    // Death screen
    if (playerHealth && playerHealth.dead && typeof Health !== 'undefined') {
      Health.drawDeathScreen(ctx, canvas.width, canvas.height);
    }

    requestAnimationFrame(gameLoop);
  }

  // ── Init ───────────────────────────────────────────────
  // Expose player health interface for enemy AI (Issue #8 coordination)
  if (typeof window !== 'undefined') {
    window.gamePlayer = player;
    window.gamePlayerHealth = playerHealth;
    window.gameTakeDamage = function(amount) {
      if (playerHealth && typeof Health !== 'undefined') {
        Health.takeDamage(playerHealth, amount);
      }
    };
  }

  async function init() {
    await loadLevel();
    hintEl.style.display = 'block';
    requestAnimationFrame(gameLoop);
  }

  init();
})();