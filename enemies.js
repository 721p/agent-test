/**
 * enemies.js — Enemy AI System Module
 * Issue #8: Enemy AI (Imp enemies with pathfinding and attacks)
 *
 * Features:
 *   - Enemy entity system with state machine: IDLE → WANDER → CHASE → ATTACK → DEAD
 *   - Imp enemy type with procedural sprite (canvas-drawn, no external images)
 *   - Line-of-sight detection using DDA raycasting
 *   - Pathfinding: chase player when visible, random walk when not
 *   - Contact damage and ranged fireball attack
 *   - Death animation with fade and collapse
 *   - Multiple enemies per level
 *   - Level JSON enemy spawn point support
 *
 * Public API:
 *   Enemies.create()                      -> enemy system state
 *   Enemies.spawn(state, type, x, y)       -> spawn an enemy at grid position
 *   Enemies.loadFromLevel(state, levelJson) -> bulk spawn from JSON
 *   Enemies.update(state, dt, player, levelMap) -> tick all enemies
 *   Enemies.render(state, ctx, player, levelMap, screenW, screenH) -> render in 3D view
 *   Enemies.tryHit(state, hitX, hitY, damage) -> apply damage at world coords (for weapons)
 *   Enemies.getAliveCount(state)           -> number of living enemies
 *
 * Vanilla JS (ES6+), no build step, no frameworks.
 */

var Enemies = (function () {
  'use strict';

  // ── Enemy Type Definitions ──────────────────────────────
  var ENEMY_TYPES = {
    imp: {
      name: 'Imp',
      health: 50,
      speed: 1.8,
      contactDamage: 8,
      contactRate: 0.8,
      rangedDamage: 12,
      rangedRange: 8.0,
      rangedCooldown: 2.5,
      rangedChance: 0.4,
      sightRange: 12.0,
      radius: 0.35,
      spriteScale: 0.5,
    },
  };

  // ── States ───────────────────────────────────────────────
  var STATE = { IDLE: 0, WANDER: 1, CHASE: 2, ATTACK: 3, DEAD: 4 };

  // ── Procedural Imp Sprite ─────────────────────────────────
  var impSpriteCache = null;

  function getImpSprite() {
    if (impSpriteCache) return impSpriteCache;
    var w = 64, h = 96;
    var alive = document.createElement('canvas');
    alive.width = w; alive.height = h;
    drawImpAlive(alive.getContext('2d'), w, h);

    var dead = document.createElement('canvas');
    dead.width = w; dead.height = h;
    drawImpDead(dead.getContext('2d'), w, h);

    var fireball = document.createElement('canvas');
    fireball.width = 32; fireball.height = 32;
    drawFireball(fireball.getContext('2d'), 32, 32);

    impSpriteCache = { alive: alive, dead: dead, fireball: fireball, w: w, h: h, fw: 32, fh: 32 };
    return impSpriteCache;
  }

  function drawImpAlive(ctx, w, h) {
    ctx.save();
    // Torso
    ctx.fillStyle = '#5a2a0a';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.52, w * 0.28, h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    // Shoulders
    ctx.fillStyle = '#6a3a0a';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.42, w * 0.22, h * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head
    ctx.fillStyle = '#7a4a1a';
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.28, w * 0.16, 0, Math.PI * 2);
    ctx.fill();
    // Horns
    ctx.fillStyle = '#3a1a0a';
    ctx.beginPath();
    ctx.moveTo(w * 0.38, h * 0.22); ctx.lineTo(w * 0.30, h * 0.10); ctx.lineTo(w * 0.40, h * 0.20);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.62, h * 0.22); ctx.lineTo(w * 0.70, h * 0.10); ctx.lineTo(w * 0.60, h * 0.20);
    ctx.closePath(); ctx.fill();
    // Eyes — glowing yellow
    ctx.fillStyle = '#FFDD00';
    ctx.shadowColor = '#FFAA00';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(w * 0.43, h * 0.27, 3, 0, Math.PI * 2);
    ctx.arc(w * 0.57, h * 0.27, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Mouth
    ctx.fillStyle = '#1a0a0a';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.34, w * 0.08, h * 0.04, 0, 0, Math.PI);
    ctx.fill();
    // Fangs
    ctx.fillStyle = '#DDDDCC';
    ctx.beginPath();
    ctx.moveTo(w * 0.46, h * 0.34); ctx.lineTo(w * 0.44, h * 0.38); ctx.lineTo(w * 0.48, h * 0.34);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.54, h * 0.34); ctx.lineTo(w * 0.56, h * 0.38); ctx.lineTo(w * 0.52, h * 0.34);
    ctx.closePath(); ctx.fill();
    // Arms with claws
    ctx.strokeStyle = '#5a2a0a';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w * 0.28, h * 0.45); ctx.lineTo(w * 0.10, h * 0.55); ctx.lineTo(w * 0.06, h * 0.68);
    ctx.moveTo(w * 0.72, h * 0.45); ctx.lineTo(w * 0.90, h * 0.55); ctx.lineTo(w * 0.94, h * 0.68);
    ctx.stroke();
    // Claws
    ctx.strokeStyle = '#DDDDCC';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.04, h * 0.68); ctx.lineTo(w * 0.02, h * 0.74);
    ctx.moveTo(w * 0.07, h * 0.69); ctx.lineTo(w * 0.06, h * 0.76);
    ctx.moveTo(w * 0.10, h * 0.68); ctx.lineTo(w * 0.10, h * 0.75);
    ctx.moveTo(w * 0.93, h * 0.68); ctx.lineTo(w * 0.95, h * 0.74);
    ctx.moveTo(w * 0.90, h * 0.69); ctx.lineTo(w * 0.89, h * 0.76);
    ctx.moveTo(w * 0.87, h * 0.68); ctx.lineTo(w * 0.87, h * 0.75);
    ctx.stroke();
    // Legs
    ctx.strokeStyle = '#4a2a0a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(w * 0.42, h * 0.72); ctx.lineTo(w * 0.38, h * 0.92);
    ctx.moveTo(w * 0.58, h * 0.72); ctx.lineTo(w * 0.62, h * 0.92);
    ctx.stroke();
    // Feet
    ctx.fillStyle = '#3a1a0a';
    ctx.beginPath();
    ctx.ellipse(w * 0.36, h * 0.93, w * 0.06, h * 0.03, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.64, h * 0.93, w * 0.06, h * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawImpDead(ctx, w, h) {
    ctx.save();
    // Blood pool
    ctx.fillStyle = 'rgba(120,20,10,0.6)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.85, w * 0.35, h * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Collapsed body
    ctx.fillStyle = '#4a2a0a';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.78, w * 0.30, h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Slumped head
    ctx.fillStyle = '#5a3a0a';
    ctx.beginPath();
    ctx.arc(w * 0.65, h * 0.72, w * 0.10, 0, Math.PI * 2);
    ctx.fill();
    // Dim eyes
    ctx.fillStyle = 'rgba(150,120,0,0.5)';
    ctx.beginPath();
    ctx.arc(w * 0.63, h * 0.71, 2, 0, Math.PI * 2);
    ctx.fill();
    // Splayed limbs
    ctx.strokeStyle = '#3a1a0a';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w * 0.30, h * 0.75); ctx.lineTo(w * 0.10, h * 0.88);
    ctx.moveTo(w * 0.40, h * 0.80); ctx.lineTo(w * 0.20, h * 0.92);
    ctx.moveTo(w * 0.55, h * 0.82); ctx.lineTo(w * 0.50, h * 0.95);
    ctx.stroke();
    // Blood splatter
    ctx.fillStyle = 'rgba(140,20,10,0.7)';
    for (var i = 0; i < 8; i++) {
      var bx = w * (0.2 + Math.random() * 0.6);
      var by = h * (0.7 + Math.random() * 0.25);
      var br = 2 + Math.random() * 4;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFireball(ctx, w, h) {
    ctx.save();
    var cx = w / 2, cy = h / 2;
    var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
    grad.addColorStop(0, 'rgba(255,255,200,1)');
    grad.addColorStop(0.3, 'rgba(255,180,40,0.9)');
    grad.addColorStop(0.6, 'rgba(255,80,20,0.5)');
    grad.addColorStop(1, 'rgba(200,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFCC';
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── DDA Line-of-Sight Check ───────────────────────────────
  function hasLineOfSight(fromX, fromY, toX, toY, levelMap, maxDist) {
    maxDist = maxDist || 20;
    var dx = toX - fromX, dy = toY - fromY;
    var dist = Math.hypot(dx, dy);
    if (dist > maxDist) return false;
    if (dist < 0.01) return true;
    var rayDirX = dx / dist, rayDirY = dy / dist;
    var mapH = levelMap.length, mapW = mapH > 0 ? levelMap[0].length : 0;
    var mapX = Math.floor(fromX), mapY = Math.floor(fromY);
    var deltaDistX = Math.abs(1 / (rayDirX || 1e-30));
    var deltaDistY = Math.abs(1 / (rayDirY || 1e-30));
    var stepX, stepY, sideDistX, sideDistY;
    if (rayDirX < 0) { stepX = -1; sideDistX = (fromX - mapX) * deltaDistX; }
    else { stepX = 1; sideDistX = (mapX + 1.0 - fromX) * deltaDistX; }
    if (rayDirY < 0) { stepY = -1; sideDistY = (fromY - mapY) * deltaDistY; }
    else { stepY = 1; sideDistY = (mapY + 1.0 - fromY) * deltaDistY; }
    var traveled = 0;
    while (traveled < dist) {
      if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; traveled = (sideDistX - deltaDistX); }
      else { sideDistY += deltaDistY; mapY += stepY; traveled = (sideDistY - deltaDistY); }
      if (mapX < 0 || mapX >= mapW || mapY < 0 || mapY >= mapH) return false;
      if (levelMap[mapY][mapX] > 0) return false;
    }
    return true;
  }

  // ── Enemy Factory ─────────────────────────────────────────
  function createEnemy(type, x, y) {
    var def = ENEMY_TYPES[type];
    if (!def) { console.warn('Enemies.spawn: unknown type "' + type + '"'); return null; }
    return {
      id: Math.random().toString(36).slice(2, 9),
      type: type,
      def: def,
      x: x,
      y: y,
      health: def.health,
      maxHealth: def.health,
      state: STATE.IDLE,
      wanderDir: Math.random() * Math.PI * 2,
      wanderTimer: 1 + Math.random() * 2,
      attackCooldown: 0,
      rangedCooldown: 0,
      deathTimer: 0,
      deathDuration: 1.5,
      hitFlash: 0,
      animPhase: Math.random() * Math.PI * 2,
    };
  }

  // ── System Create ─────────────────────────────────────────
  function create() {
    return {
      enemies: [],
      projectiles: [],
      playerDamage: 0,
    };
  }

  // ── Spawn ──────────────────────────────────────────────────
  function spawn(state, type, x, y) {
    var enemy = createEnemy(type, x, y);
    if (enemy) state.enemies.push(enemy);
    return enemy;
  }

  function loadFromLevel(state, levelJson) {
    if (!levelJson || !levelJson.enemies) return;
    for (var i = 0; i < levelJson.enemies.length; i++) {
      var e = levelJson.enemies[i];
      spawn(state, e.type || 'imp', e.x, e.y);
    }
  }

  // ── Check if position is walkable for enemy ─────────────────
  function isWalkable(x, y, levelMap) {
    var mapH = levelMap.length, mapW = mapH > 0 ? levelMap[0].length : 0;
    var mx = Math.floor(x), my = Math.floor(y);
    if (mx < 0 || mx >= mapW || my < 0 || my >= mapH) return false;
    return levelMap[my][mx] === 0;
  }

  // ── Try to move enemy with collision ────────────────────────
  function tryMoveEnemy(enemy, newX, newY, levelMap) {
    var r = enemy.def.radius;
    if (isWalkable(newX - r, enemy.y, levelMap) && isWalkable(newX + r, enemy.y, levelMap)) {
      enemy.x = newX;
    }
    if (isWalkable(enemy.x, newY - r, levelMap) && isWalkable(enemy.x, newY + r, levelMap)) {
      enemy.y = newY;
    }
  }

  function distToPlayer(enemy, player) {
    return Math.hypot(player.x - enemy.x, player.y - enemy.y);
  }

  // ── Update All Enemies ─────────────────────────────────────
  function update(state, dt, player, levelMap) {
    state.playerDamage = 0;

    for (var i = 0; i < state.enemies.length; i++) {
      var e = state.enemies[i];
      if (e.state === STATE.DEAD) {
        e.deathTimer += dt;
        continue;
      }

      if (e.hitFlash > 0) { e.hitFlash -= dt; if (e.hitFlash < 0) e.hitFlash = 0; }
      if (e.attackCooldown > 0) e.attackCooldown -= dt;
      if (e.rangedCooldown > 0) e.rangedCooldown -= dt;
      e.animPhase += dt * 6;

      var d = distToPlayer(e, player);
      var canSee = hasLineOfSight(e.x, e.y, player.x, player.y, levelMap, e.def.sightRange);

      if (e.state === STATE.IDLE) {
        e.wanderTimer -= dt;
        if (e.wanderTimer <= 0) {
          e.state = STATE.WANDER;
          e.wanderDir = Math.random() * Math.PI * 2;
          e.wanderTimer = 1 + Math.random() * 3;
        }
        if (canSee && d < e.def.sightRange) e.state = STATE.CHASE;
      }

      if (e.state === STATE.WANDER) {
        e.wanderTimer -= dt;
        var ws = e.def.speed * 0.4;
        var nx = e.x + Math.cos(e.wanderDir) * ws * dt;
        var ny = e.y + Math.sin(e.wanderDir) * ws * dt;
        tryMoveEnemy(e, nx, ny, levelMap);
        if (e.wanderTimer <= 0) {
          e.wanderDir = Math.random() * Math.PI * 2;
          e.wanderTimer = 1.5 + Math.random() * 3;
          if (Math.random() < 0.3) e.state = STATE.IDLE;
        }
        if (!isWalkable(e.x + Math.cos(e.wanderDir) * 0.3, e.y + Math.sin(e.wanderDir) * 0.3, levelMap)) {
          e.wanderDir = Math.random() * Math.PI * 2;
        }
        if (canSee && d < e.def.sightRange) e.state = STATE.CHASE;
      }

      if (e.state === STATE.CHASE) {
        if (!canSee || d > e.def.sightRange) {
          e.state = STATE.WANDER;
          e.wanderDir = Math.random() * Math.PI * 2;
          e.wanderTimer = 2 + Math.random() * 2;
        } else {
          var angle = Math.atan2(player.y - e.y, player.x - e.x);
          var cs = e.def.speed;
          var cx = e.x + Math.cos(angle) * cs * dt;
          var cy = e.y + Math.sin(angle) * cs * dt;
          tryMoveEnemy(e, cx, cy, levelMap);

          if (d < e.def.radius + 0.5 && e.attackCooldown <= 0) {
            state.playerDamage += e.def.contactDamage;
            e.attackCooldown = e.def.contactRate;
          }

          if (d < e.def.rangedRange && d > 1.5 && e.rangedCooldown <= 0) {
            if (Math.random() < e.def.rangedChance) {
              var fbAngle = Math.atan2(player.y - e.y, player.x - e.x);
              state.projectiles.push({
                x: e.x + Math.cos(fbAngle) * 0.3,
                y: e.y + Math.sin(fbAngle) * 0.3,
                vx: Math.cos(fbAngle) * 4.0,
                vy: Math.sin(fbAngle) * 4.0,
                damage: e.def.rangedDamage,
                life: 3.0,
              });
              e.rangedCooldown = e.def.rangedCooldown;
            }
          }
        }
      }
    }

    // Update projectiles
    for (var p = state.projectiles.length - 1; p >= 0; p--) {
      var proj = state.projectiles[p];
      proj.life -= dt;
      if (proj.life <= 0) { state.projectiles.splice(p, 1); continue; }
      var pnx = proj.x + proj.vx * dt;
      var pny = proj.y + proj.vy * dt;
      if (!isWalkable(pnx, pny, levelMap)) {
        state.projectiles.splice(p, 1);
        continue;
      }
      var pd = Math.hypot(player.x - pnx, player.y - pny);
      if (pd < 0.4) {
        state.playerDamage += proj.damage;
        state.projectiles.splice(p, 1);
        continue;
      }
      proj.x = pnx;
      proj.y = pny;
    }

    // Remove dead enemies after death animation
    for (var r = state.enemies.length - 1; r >= 0; r--) {
      if (state.enemies[r].state === STATE.DEAD && state.enemies[r].deathTimer > state.enemies[r].deathDuration) {
        state.enemies.splice(r, 1);
      }
    }
  }

  // ── Apply Damage to Enemy at World Position ────────────────
  function tryHit(state, hitX, hitY, damage) {
    var hitSomething = false;
    for (var i = 0; i < state.enemies.length; i++) {
      var e = state.enemies[i];
      if (e.state === STATE.DEAD) continue;
      var d = Math.hypot(e.x - hitX, e.y - hitY);
      if (d < e.def.radius + 0.2) {
        e.health -= damage;
        e.hitFlash = 0.15;
        hitSomething = true;
        if (e.health <= 0) {
          e.health = 0;
          e.state = STATE.DEAD;
          e.deathTimer = 0;
        }
        break;
      }
    }
    return hitSomething;
  }

  // ── Render Enemies in 3D View ───────────────────────────────
  function render(state, ctx, player, levelMap, screenW, screenH) {
    var sprites = getImpSprite();
    var horizon = (screenH / 2) | 0;
    var FOV = Math.PI / 3;
    var HALF_FOV = FOV / 2;

    var visible = [];
    for (var i = 0; i < state.enemies.length; i++) {
      var e = state.enemies[i];
      var dx = e.x - player.x, dy = e.y - player.y;
      var dist = Math.hypot(dx, dy);
      if (dist < 0.1) dist = 0.1;

      var angle = Math.atan2(dy, dx) - player.angle;
      while (angle < -Math.PI) angle += Math.PI * 2;
      while (angle > Math.PI) angle -= Math.PI * 2;

      if (Math.abs(angle) > HALF_FOV + 0.3) continue;

      if (!hasLineOfSight(player.x, player.y, e.x, e.y, levelMap, dist + 1)) continue;

      visible.push({ enemy: e, dist: dist, angle: angle });
    }

    visible.sort(function (a, b) { return b.dist - a.dist; });

    var FOG_MAX_DIST = 16;
    function fogFactor(d) { return Math.max(0, 1.0 - d / FOG_MAX_DIST); }

    for (var v = 0; v < visible.length; v++) {
      var entry = visible[v];
      var en = entry.enemy;
      var d = entry.dist;
      var ang = entry.angle;

      var correctedDist = d * Math.cos(ang);
      if (correctedDist < 0.1) correctedDist = 0.1;

      var screenX = (0.5 + ang / FOV) * screenW;
      var wallH = screenH / correctedDist;
      var spriteH = wallH * en.def.spriteScale * 1.5;
      var spriteW = spriteH * (sprites.w / sprites.h);

      if (spriteH < 2) continue;

      var drawX = screenX - spriteW / 2;
      var drawY = horizon - spriteH / 2;

      var fog = fogFactor(d);

      ctx.save();
      ctx.globalAlpha = fog;

      var img = en.state === STATE.DEAD ? sprites.dead : sprites.alive;

      if (en.state === STATE.DEAD) {
        var deathProgress = en.deathTimer / en.deathDuration;
        ctx.globalAlpha = fog * (1 - deathProgress * 0.7);
        drawY += deathProgress * spriteH * 0.2;
      }

      if (en.state !== STATE.DEAD) {
        var bob = Math.sin(en.animPhase) * spriteH * 0.03;
        drawY += bob;
      }

      ctx.drawImage(img, drawX, drawY, spriteW, spriteH);

      if (en.hitFlash > 0 && en.state !== STATE.DEAD) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (en.hitFlash / 0.15) * 0.6 * fog;
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(drawX, drawY, spriteW, spriteH);
      }

      ctx.restore();
    }

    // Render fireball projectiles
    for (var f = 0; f < state.projectiles.length; f++) {
      var proj = state.projectiles[f];
      var fdx = proj.x - player.x, fdy = proj.y - player.y;
      var fd = Math.hypot(fdx, fdy);
      if (fd < 0.1) continue;
      var fang = Math.atan2(fdy, fdx) - player.angle;
      while (fang < -Math.PI) fang += Math.PI * 2;
      while (fang > Math.PI) fang -= Math.PI * 2;
      if (Math.abs(fang) > HALF_FOV + 0.2) continue;
      if (!hasLineOfSight(player.x, player.y, proj.x, proj.y, levelMap, fd + 1)) continue;

      var fCorrected = fd * Math.cos(fang);
      if (fCorrected < 0.1) continue;
      var fScreenX = (0.5 + fang / FOV) * screenW;
      var fWallH = screenH / fCorrected;
      var fSize = fWallH * 0.15;
      if (fSize < 2) continue;

      var fog2 = fogFactor(fd);
      ctx.save();
      ctx.globalAlpha = fog2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(sprites.fireball, fScreenX - fSize / 2, horizon - fSize / 2, fSize, fSize);
      ctx.restore();
    }
  }

  // ── Get Alive Count ────────────────────────────────────────
  function getAliveCount(state) {
    var count = 0;
    for (var i = 0; i < state.enemies.length; i++) {
      if (state.enemies[i].state !== STATE.DEAD) count++;
    }
    return count;
  }

  return {
    STATE: STATE,
    ENEMY_TYPES: ENEMY_TYPES,
    create: create,
    spawn: spawn,
    loadFromLevel: loadFromLevel,
    update: update,
    render: render,
    tryHit: tryHit,
    getAliveCount: getAliveCount,
    hasLineOfSight: hasLineOfSight,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Enemies;
if (typeof window !== 'undefined') window.Enemies = Enemies;
