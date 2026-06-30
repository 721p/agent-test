/**
 * pickups.js — Health, Damage & Pickups System Module
 * Issue #9: Health, Damage & Pickups
 *
 * Features:
 *   - Player health system (0-100) with damage and heal
 *   - Damage screen flash (red) and heal flash (green)
 *   - Death screen with restart prompt
 *   - Health pack pickups (+25 HP, green cross sprite)
 *   - Ammo pickups (pistol +12, shotgun +4, orange box sprite)
 *   - Pickups defined in level JSON, spawned at level positions
 *   - Procedural pickup sprites with 3D rendering (distance-scaled, bobbing)
 *   - Pickup collision detection (walk-over collection)
 *   - DOOM-style bottom HUD: health bar, ammo count, weapon name
 *
 * Public API (exposed as window.Health):
 *   Health.createPlayer(weapons)                          -> player health state
 *   Health.reset(playerHealth, weapons)                   -> reset to full
 *   Health.takeDamage(playerHealth, amount)               -> apply damage
 *   Health.heal(playerHealth, amount)                     -> heal (cap 100)
 *   Health.updateFlash(playerHealth, dt)                  -> tick flash timers
 *   Health.loadPickups(levelData)                         -> pickup entity array
 *   Health.updatePickups(pickups, player, weapons, ph, dt) -> tick pickups, collect
 *   Health.drawPickups(ctx, pickups, player, w, h)        -> render in 3D view
 *   Health.drawHealthHud(ctx, playerHealth, w, h)          -> DOOM-style bottom HUD
 *   Health.drawScreenFlash(ctx, playerHealth, w, h)        -> screen flash overlay
 *   Health.drawDeathScreen(ctx, w, h)                     -> death screen
 *
 * Vanilla JS (ES6+), no build step, no frameworks.
 */

var Health = (function () {
  'use strict';

  var MAX_HEALTH = 100;
  var HEALTH_PACK_AMOUNT = 25;
  var PISTOL_AMMO_AMOUNT = 12;
  var SHOTGUN_AMMO_AMOUNT = 4;
  var PICKUP_RADIUS = 0.45;
  var PICKUP_BOB_SPEED = 3.0;
  var PICKUP_SCALE = 0.35;
  var FOG_MAX_DIST = 16;

  var PICKUP_DEFS = {
    health: { name: 'Health Pack', color: [60, 220, 60], hudColor: '#44FF44' },
    pistol_ammo: { name: 'Pistol Ammo', color: [255, 170, 40], hudColor: '#FFAA28' },
    shotgun_ammo: { name: 'Shotgun Ammo', color: [255, 120, 20], hudColor: '#FF7814' },
  };

  function createPlayer(weapons) {
    return {
      health: MAX_HEALTH,
      maxHealth: MAX_HEALTH,
      dead: false,
      damageFlash: 0,
      healFlash: 0,
      damageFlashDur: 0.5,
      healFlashDur: 0.4,
    };
  }

  function reset(playerHealth, weapons) {
    playerHealth.health = MAX_HEALTH;
    playerHealth.maxHealth = MAX_HEALTH;
    playerHealth.dead = false;
    playerHealth.damageFlash = 0;
    playerHealth.healFlash = 0;
  }

  function takeDamage(playerHealth, amount) {
    if (playerHealth.dead) return;
    playerHealth.health -= amount;
    playerHealth.damageFlash = playerHealth.damageFlashDur;
    if (playerHealth.health <= 0) {
      playerHealth.health = 0;
      playerHealth.dead = true;
    }
  }

  function heal(playerHealth, amount) {
    if (playerHealth.dead) return;
    playerHealth.health = Math.min(playerHealth.health + amount, playerHealth.maxHealth);
    playerHealth.healFlash = playerHealth.healFlashDur;
  }

  function updateFlash(playerHealth, dt) {
    if (playerHealth.damageFlash > 0) {
      playerHealth.damageFlash -= dt;
      if (playerHealth.damageFlash < 0) playerHealth.damageFlash = 0;
    }
    if (playerHealth.healFlash > 0) {
      playerHealth.healFlash -= dt;
      if (playerHealth.healFlash < 0) playerHealth.healFlash = 0;
    }
  }

  function loadPickups(levelData) {
    if (!levelData || !Array.isArray(levelData.pickups)) return [];
    var result = [];
    for (var i = 0; i < levelData.pickups.length; i++) {
      var p = levelData.pickups[i];
      var def = PICKUP_DEFS[p.type];
      if (!def) { console.warn('Health.loadPickups: unknown pickup type "' + p.type + '"'); continue; }
      result.push({
        type: p.type, x: p.x, y: p.y,
        amount: p.amount || getDefaultAmount(p.type),
        collected: false,
        bobPhase: Math.random() * Math.PI * 2,
        spawnTime: (typeof performance !== 'undefined') ? performance.now() / 1000 : 0,
      });
    }
    return result;
  }

  function getDefaultAmount(type) {
    if (type === 'health') return HEALTH_PACK_AMOUNT;
    if (type === 'pistol_ammo') return PISTOL_AMMO_AMOUNT;
    if (type === 'shotgun_ammo') return SHOTGUN_AMMO_AMOUNT;
    return 0;
  }

  function updatePickups(pickups, player, weapons, playerHealth, dt) {
    for (var i = 0; i < pickups.length; i++) {
      var p = pickups[i];
      if (p.collected) continue;
      p.bobPhase += dt * PICKUP_BOB_SPEED;
      var dx = player.x - p.x, dy = player.y - p.y;
      if (Math.hypot(dx, dy) < PICKUP_RADIUS) collectPickup(p, weapons, playerHealth);
    }
  }

  function collectPickup(pickup, weapons, playerHealth) {
    if (pickup.type === 'health') {
      if (playerHealth.health >= playerHealth.maxHealth) return;
      heal(playerHealth, pickup.amount);
      pickup.collected = true;
    } else if (pickup.type === 'pistol_ammo') {
      if (!weapons) return;
      var pMax = weapons.ammoMax['pistol'] || 200;
      if (weapons.ammo['pistol'] >= pMax) return;
      weapons.ammo['pistol'] = Math.min(weapons.ammo['pistol'] + pickup.amount, pMax);
      pickup.collected = true;
    } else if (pickup.type === 'shotgun_ammo') {
      if (!weapons) return;
      var sMax = weapons.ammoMax['shotgun'] || 50;
      if (weapons.ammo['shotgun'] >= sMax) return;
      weapons.ammo['shotgun'] = Math.min(weapons.ammo['shotgun'] + pickup.amount, sMax);
      pickup.collected = true;
    }
  }

  var spriteCache = {};

  function getSprite(type) {
    if (spriteCache[type]) return spriteCache[type];
    var c;
    if (type === 'health') {
      c = document.createElement('canvas'); c.width = 48; c.height = 48;
      drawHealthSprite(c.getContext('2d'), 48);
    } else if (type === 'pistol_ammo') {
      c = document.createElement('canvas'); c.width = 40; c.height = 40;
      drawAmmoSprite(c.getContext('2d'), 40, '#FFAA28', 'P');
    } else if (type === 'shotgun_ammo') {
      c = document.createElement('canvas'); c.width = 40; c.height = 40;
      drawAmmoSprite(c.getContext('2d'), 40, '#FF7814', 'S');
    }
    spriteCache[type] = c;
    return c;
  }

  function drawHealthSprite(ctx, size) {
    var cx = size / 2, cy = size / 2;
    ctx.fillStyle = '#EEEEEE'; ctx.fillRect(4, 4, size - 8, size - 8);
    ctx.strokeStyle = '#882222'; ctx.lineWidth = 2; ctx.strokeRect(4, 4, size - 8, size - 8);
    ctx.fillStyle = '#DD2222';
    var cw = size * 0.12, cl = size * 0.55;
    ctx.fillRect(cx - cw / 2, cy - cl / 2, cw, cl);
    ctx.fillRect(cx - cl / 2, cy - cw / 2, cl, cw);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(6, 6, size - 12, 4);
  }

  function drawAmmoSprite(ctx, size, accentColor, label) {
    ctx.fillStyle = '#333311'; ctx.fillRect(4, 6, size - 8, size - 12);
    ctx.strokeStyle = accentColor; ctx.lineWidth = 2; ctx.strokeRect(4, 6, size - 8, size - 12);
    ctx.strokeStyle = '#555522'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(4, size / 2); ctx.lineTo(size - 4, size / 2); ctx.stroke();
    ctx.fillStyle = accentColor;
    for (var i = 0; i < 3; i++) { var bx = 8 + i * (size - 16) / 2; ctx.fillRect(bx, 8, 3, size / 2 - 10); }
    ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, size / 2, size * 0.72);
  }

  function drawPickups(ctx, pickups, player, screenW, screenH) {
    var horizon = (screenH / 2) | 0;
    var FOV = Math.PI / 3, HALF_FOV = FOV / 2;
    var visible = [];
    for (var i = 0; i < pickups.length; i++) {
      var p = pickups[i];
      if (p.collected) continue;
      var dx = p.x - player.x, dy = p.y - player.y;
      var dist = Math.hypot(dx, dy); if (dist < 0.1) dist = 0.1;
      var angle = Math.atan2(dy, dx) - player.angle;
      while (angle < -Math.PI) angle += Math.PI * 2;
      while (angle > Math.PI) angle -= Math.PI * 2;
      if (Math.abs(angle) > HALF_FOV + 0.3) continue;
      visible.push({ pickup: p, dist: dist, angle: angle });
    }
    visible.sort(function (a, b) { return b.dist - a.dist; });
    function fogFactor(d) { return Math.max(0, 1.0 - d / FOG_MAX_DIST); }

    for (var v = 0; v < visible.length; v++) {
      var entry = visible[v], pk = entry.pickup, d = entry.dist, ang = entry.angle;
      var correctedDist = d * Math.cos(ang); if (correctedDist < 0.1) correctedDist = 0.1;
      var screenX = (0.5 + ang / FOV) * screenW;
      var wallH = screenH / correctedDist;
      var spriteH = wallH * PICKUP_SCALE, spriteW = spriteH;
      if (spriteH < 2) continue;
      var bobOffset = Math.sin(pk.bobPhase) * spriteH * 0.1;
      var drawX = screenX - spriteW / 2;
      var drawY = horizon - spriteH / 2 + bobOffset + spriteH * 0.15;
      var fog = fogFactor(d);
      var def = PICKUP_DEFS[pk.type];

      ctx.save();
      ctx.globalAlpha = fog * 0.3; ctx.globalCompositeOperation = 'lighter';
      var glowR = spriteW * 0.6;
      var glowGrad = ctx.createRadialGradient(screenX, drawY + spriteH / 2, 0, screenX, drawY + spriteH / 2, glowR);
      glowGrad.addColorStop(0, 'rgba(' + def.color[0] + ',' + def.color[1] + ',' + def.color[2] + ',0.5)');
      glowGrad.addColorStop(1, 'rgba(' + def.color[0] + ',' + def.color[1] + ',' + def.color[2] + ',0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(screenX - glowR, drawY + spriteH / 2 - glowR, glowR * 2, glowR * 2);
      ctx.restore();

      var img = getSprite(pk.type);
      ctx.save();
      ctx.globalAlpha = fog;
      ctx.drawImage(img, drawX, drawY, spriteW, spriteH);
      if (d < 2.0) {
        var pulse = 0.5 + 0.5 * Math.sin(pk.bobPhase * 2);
        ctx.globalAlpha = fog * pulse * 0.5;
        ctx.strokeStyle = def.hudColor; ctx.lineWidth = 2;
        ctx.strokeRect(drawX - 2, drawY - 2, spriteW + 4, spriteH + 4);
      }
      ctx.restore();
    }
  }

  function drawHealthHud(ctx, playerHealth, w, h) {
    var barH = 56, barY = h - barH, barW = w;
    ctx.save();
    ctx.fillStyle = 'rgba(20, 20, 28, 0.92)'; ctx.fillRect(0, barY, barW, barH);
    ctx.fillStyle = '#444'; ctx.fillRect(0, barY, barW, 2);
    ctx.fillStyle = '#222'; ctx.fillRect(0, barY + 2, barW, 1);
    var hudPad = 16;

    // Health icon
    var hIconX = hudPad, hIconY = barY + 10, hIconS = 36;
    ctx.fillStyle = '#DD2222';
    var cw = hIconS * 0.18, cl = hIconS * 0.55;
    ctx.fillRect(hIconX + hIconS / 2 - cw / 2, hIconY + hIconS / 2 - cl / 2, cw, cl);
    ctx.fillRect(hIconX + hIconS / 2 - cl / 2, hIconY + hIconS / 2 - cw / 2, cl, cw);

    var hpVal = Math.max(0, Math.round(playerHealth.health));
    var hpColor = hpVal > 50 ? '#44FF44' : hpVal > 25 ? '#FFAA00' : '#FF2222';
    ctx.font = 'bold 28px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = hpColor;
    ctx.fillText(hpVal + '%', hIconX + hIconS + 10, barY + barH / 2);

    // Health bar
    var hbX = hIconX + hIconS + 70, hbY = barY + 18, hbW = 120, hbH = 20;
    ctx.fillStyle = '#333'; ctx.fillRect(hbX, hbY, hbW, hbH);
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.strokeRect(hbX, hbY, hbW, hbH);
    var hpFillW = (hpVal / playerHealth.maxHealth) * hbW;
    ctx.fillStyle = hpColor; ctx.fillRect(hbX + 1, hbY + 1, hpFillW - 2, hbH - 2);
    ctx.font = '10px monospace'; ctx.fillStyle = '#888'; ctx.fillText('HEALTH', hbX, hbY - 12);

    // Face
    var faceX = w / 2 - 20, faceY = barY + 8, faceS = 40;
    ctx.fillStyle = '#332211'; ctx.fillRect(faceX, faceY, faceS, faceS);
    ctx.strokeStyle = '#553311'; ctx.lineWidth = 1; ctx.strokeRect(faceX, faceY, faceS, faceS);
    var faceColor = hpVal > 50 ? '#DDAA44' : hpVal > 25 ? '#CC8822' : '#AA4422';
    ctx.fillStyle = faceColor;
    ctx.beginPath(); ctx.arc(faceX + faceS / 2, faceY + faceS / 2, faceS / 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    if (playerHealth.dead) {
      ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(faceX + faceS * 0.3, faceY + faceS * 0.35); ctx.lineTo(faceX + faceS * 0.4, faceY + faceS * 0.45);
      ctx.moveTo(faceX + faceS * 0.4, faceY + faceS * 0.35); ctx.lineTo(faceX + faceS * 0.3, faceY + faceS * 0.45);
      ctx.moveTo(faceX + faceS * 0.6, faceY + faceS * 0.35); ctx.lineTo(faceX + faceS * 0.7, faceY + faceS * 0.45);
      ctx.moveTo(faceX + faceS * 0.7, faceY + faceS * 0.35); ctx.lineTo(faceX + faceS * 0.6, faceY + faceS * 0.45);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(faceX + faceS * 0.35, faceY + faceS * 0.4, 2, 0, Math.PI * 2);
      ctx.arc(faceX + faceS * 0.65, faceY + faceS * 0.4, 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5; ctx.beginPath();
      if (hpVal > 50) { ctx.arc(faceX + faceS / 2, faceY + faceS * 0.55, 4, 0, Math.PI); }
      else { ctx.moveTo(faceX + faceS * 0.38, faceY + faceS * 0.6); ctx.lineTo(faceX + faceS * 0.62, faceY + faceS * 0.6); }
      ctx.stroke();
    }

    // Ammo
    if (typeof window !== 'undefined' && window.gameWeaponsInfo) {
      var info = window.gameWeaponsInfo;
      ctx.font = '10px monospace'; ctx.fillStyle = '#888'; ctx.fillText('AMMO', w - 200, barY + 8);
      ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#FFD700'; ctx.textAlign = 'right';
      ctx.fillText(info.name, w - hudPad, barY + 22);
      ctx.font = 'bold 24px monospace'; ctx.fillStyle = info.ammo === 0 ? '#FF0000' : '#FFFFFF';
      ctx.fillText(info.ammo + '/' + info.max, w - hudPad, barY + 45);
    }
    ctx.textAlign = 'left'; ctx.restore();
  }

  function drawScreenFlash(ctx, playerHealth, w, h) {
    if (playerHealth.damageFlash > 0) {
      var dAlpha = (playerHealth.damageFlash / playerHealth.damageFlashDur) * 0.45;
      ctx.save(); ctx.fillStyle = 'rgba(180, 0, 0, ' + dAlpha + ')'; ctx.fillRect(0, 0, w, h); ctx.restore();
    }
    if (playerHealth.healFlash > 0) {
      var hAlpha = (playerHealth.healFlash / playerHealth.healFlashDur) * 0.25;
      ctx.save(); ctx.fillStyle = 'rgba(0, 180, 0, ' + hAlpha + ')'; ctx.fillRect(0, 0, w, h); ctx.restore();
    }
  }

  function drawDeathScreen(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(40, 0, 0, 0.75)'; ctx.fillRect(0, 0, w, h);
    ctx.font = 'bold 56px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#880000'; ctx.fillText('YOU DIED', w / 2 + 3, h / 2 - 30 + 3);
    ctx.fillStyle = '#FF2222'; ctx.fillText('YOU DIED', w / 2, h / 2 - 30);
    ctx.font = '16px monospace'; ctx.fillStyle = '#AA6666';
    ctx.fillText('The demons of Deimos claim another soul...', w / 2, h / 2 + 20);
    var pulse = 0.5 + 0.5 * Math.sin((typeof performance !== 'undefined' ? performance.now() : Date.now()) / 400);
    ctx.font = 'bold 20px monospace'; ctx.fillStyle = 'rgba(255, 200, 0, ' + (0.4 + pulse * 0.6) + ')';
    ctx.fillText('Press SPACE or Click to Restart', w / 2, h / 2 + 60);
    ctx.restore();
  }

  return {
    createPlayer: createPlayer, reset: reset, takeDamage: takeDamage, heal: heal,
    updateFlash: updateFlash, loadPickups: loadPickups, updatePickups: updatePickups,
    drawPickups: drawPickups, drawHealthHud: drawHealthHud,
    drawScreenFlash: drawScreenFlash, drawDeathScreen: drawDeathScreen,
    MAX_HEALTH: MAX_HEALTH, PICKUP_DEFS: PICKUP_DEFS,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Health;
if (typeof window !== 'undefined') window.Health = Health;
