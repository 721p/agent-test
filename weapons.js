/**
 * weapons.js — Weapon System Module
 * Issue #7: Weapons & Shooting
 *
 * Features:
 *   - Pistol and shotgun weapons with distinct stats
 *   - Click to fire with rate-of-fire cooldown
 *   - Procedural weapon sprites (DOOM-style, drawn on canvas)
 *   - Muzzle flash effect overlay
 *   - Ammo system with per-weapon ammo pools
 *   - Weapon switching (1=pistol, 2=shotgun)
 *   - Bullet raycast hit detection using DDA
 *
 * Public API:
 *   Weapons.create()           -> weapon system state object
 *   Weapons.update(state, dt)  -> tick cooldowns, muzzle flash decay
 *   Weapons.tryFire(state)     -> attempt to fire current weapon
 *   Weapons.switchTo(state, n) -> switch to weapon slot n (1=pistol, 2=shotgun)
 *   Weapons.drawSprite(ctx, state, w, h)  -> render weapon sprite at bottom
 *   Weapons.drawMuzzleFlash(ctx, state, w, h) -> render muzzle flash overlay
 *   Weapons.raycastHit(player, angle, levelMap) -> { x, y, dist, wallType } | null
 *   Weapons.getAmmoInfo(state) -> { name, ammo, max, slot }
 *
 * Vanilla JS (ES6+), no build step, no frameworks.
 */

var Weapons = (function () {
  'use strict';

  var WEAPON_DEFS = {
    pistol: {
      name: 'Pistol', slot: 1, fireRate: 0.35, damage: 25,
      ammoStart: 17, ammoMax: 200, spread: 0.0, pellets: 1,
      muzzleFlashDur: 0.08, recoil: 8,
    },
    shotgun: {
      name: 'Shotgun', slot: 2, fireRate: 0.85, damage: 15,
      ammoStart: 4, ammoMax: 50, spread: 0.12, pellets: 7,
      muzzleFlashDur: 0.12, recoil: 16,
    },
  };

  var WEAPON_ORDER = ['pistol', 'shotgun'];

  function create() {
    var ammo = {}, ammoMax = {};
    for (var i = 0; i < WEAPON_ORDER.length; i++) {
      var key = WEAPON_ORDER[i];
      ammo[key] = WEAPON_DEFS[key].ammoStart;
      ammoMax[key] = WEAPON_DEFS[key].ammoMax;
    }
    return { current: 'pistol', ammo: ammo, ammoMax: ammoMax, cooldown: 0, muzzleFlash: 0, recoilOffset: 0, firePulse: false, lastHit: null };
  }

  function update(state, dt) {
    if (state.cooldown > 0) state.cooldown -= dt;
    if (state.cooldown < 0) state.cooldown = 0;
    if (state.muzzleFlash > 0) { state.muzzleFlash -= dt; if (state.muzzleFlash < 0) state.muzzleFlash = 0; }
    if (state.recoilOffset > 0) { state.recoilOffset -= dt * 60; if (state.recoilOffset < 0) state.recoilOffset = 0; }
    state.firePulse = false;
  }

  function switchTo(state, slot) {
    for (var i = 0; i < WEAPON_ORDER.length; i++) {
      var key = WEAPON_ORDER[i];
      if (WEAPON_DEFS[key].slot === slot) {
        if (state.current === key) return false;
        state.current = key; state.cooldown = 0; state.muzzleFlash = 0; state.recoilOffset = 0;
        return true;
      }
    }
    return false;
  }

  function tryFire(state) {
    if (state.cooldown > 0) return null;
    var def = WEAPON_DEFS[state.current];
    if (state.ammo[state.current] <= 0) return null;
    state.ammo[state.current]--;
    state.cooldown = def.fireRate;
    state.muzzleFlash = def.muzzleFlashDur;
    state.recoilOffset = def.recoil;
    state.firePulse = true;
    return { weapon: state.current, pellets: def.pellets, spread: def.spread, damage: def.damage };
  }

  function raycastHit(player, angle, levelMap, maxDist) {
    maxDist = maxDist || 20;
    var mapH = levelMap.length, mapW = mapH > 0 ? levelMap[0].length : 0;
    var rayDirX = Math.cos(angle), rayDirY = Math.sin(angle);
    var mapX = Math.floor(player.x), mapY = Math.floor(player.y);
    var deltaDistX = Math.abs(1 / (rayDirX || 1e-30)), deltaDistY = Math.abs(1 / (rayDirY || 1e-30));
    var stepX, stepY, sideDistX, sideDistY;
    if (rayDirX < 0) { stepX = -1; sideDistX = (player.x - mapX) * deltaDistX; }
    else { stepX = 1; sideDistX = (mapX + 1.0 - player.x) * deltaDistX; }
    if (rayDirY < 0) { stepY = -1; sideDistY = (player.y - mapY) * deltaDistY; }
    else { stepY = 1; sideDistY = (mapY + 1.0 - player.y) * deltaDistY; }
    for (var i = 0; i < maxDist * 2; i++) {
      if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; }
      else { sideDistY += deltaDistY; mapY += stepY; }
      if (mapX < 0 || mapX >= mapW || mapY < 0 || mapY >= mapH) return null;
      var cell = levelMap[mapY][mapX];
      if (cell > 0) {
        var dist = sideDistX < sideDistY ? (sideDistX - deltaDistX) : (sideDistY - deltaDistY);
        return { x: player.x + rayDirX * dist, y: player.y + rayDirY * dist, dist: dist, wallType: cell };
      }
    }
    return null;
  }

  function drawSprite(ctx, state, w, h) {
    if (state.current === 'pistol') drawPistolSprite(ctx, w / 2, h - state.recoilOffset, w, h);
    else if (state.current === 'shotgun') drawShotgunSprite(ctx, w / 2, h - state.recoilOffset, w, h);
  }

  function drawPistolSprite(ctx, cx, baseY, w, h) {
    var s = Math.min(w, h) / 600;
    var gunW = 120 * s, gunH = 90 * s, gx = cx - gunW / 2, gy = baseY - gunH;
    ctx.save();
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath(); ctx.moveTo(gx+20*s,gy+30*s); ctx.lineTo(gx+55*s,gy+90*s); ctx.lineTo(gx+75*s,gy+85*s); ctx.lineTo(gx+50*s,gy+30*s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(gx+30*s, gy+10*s, gunW-40*s, 25*s);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(gx+gunW-15*s, gy+15*s, 12*s, 15*s);
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 4*s; ctx.beginPath(); ctx.arc(gx+40*s, gy+45*s, 12*s, 0, Math.PI, false); ctx.stroke();
    ctx.fillStyle = '#4a4a4a'; ctx.fillRect(gx+35*s, gy+12*s, gunW-50*s, 5*s);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(gx+gunW-20*s, gy+5*s, 6*s, 8*s);
    ctx.restore();
  }

  function drawShotgunSprite(ctx, cx, baseY, w, h) {
    var s = Math.min(w, h) / 600;
    var gunW = 180 * s, gunH = 100 * s, gx = cx - gunW / 2, gy = baseY - gunH;
    ctx.save();
    ctx.fillStyle = '#5a3a1a';
    ctx.beginPath(); ctx.moveTo(gx+5*s,gy+35*s); ctx.lineTo(gx+50*s,gy+100*s); ctx.lineTo(gx+80*s,gy+95*s); ctx.lineTo(gx+50*s,gy+35*s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(gx+45*s, gy+20*s, 70*s, 30*s);
    ctx.fillStyle = '#4a3520'; ctx.fillRect(gx+80*s, gy+35*s, 40*s, 20*s);
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(gx+100*s, gy+18*s, 80*s, 18*s);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(gx+gunW-12*s, gy+20*s, 10*s, 14*s);
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(gx+105*s, gy+20*s, 70*s, 4*s);
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 4*s; ctx.beginPath(); ctx.arc(gx+55*s, gy+50*s, 12*s, 0, Math.PI, false); ctx.stroke();
    ctx.restore();
  }

  function drawMuzzleFlash(ctx, state, w, h) {
    if (state.muzzleFlash <= 0) return;
    var def = WEAPON_DEFS[state.current];
    var intensity = state.muzzleFlash / def.muzzleFlashDur;
    if (intensity <= 0) return;
    var cx = w/2, baseY = h - state.recoilOffset, s = Math.min(w,h)/600;
    var flashX, flashY, flashR;
    if (state.current === 'pistol') { flashX = cx+60*s; flashY = baseY-90*s+22*s; flashR = 35*s*intensity; }
    else { flashX = cx+84*s; flashY = baseY-100*s+27*s; flashR = 50*s*intensity; }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var grad = ctx.createRadialGradient(flashX, flashY, 0, flashX, flashY, flashR);
    grad.addColorStop(0, 'rgba(255,240,180,'+(0.9*intensity)+')');
    grad.addColorStop(0.3, 'rgba(255,180,60,'+(0.6*intensity)+')');
    grad.addColorStop(0.7, 'rgba(255,100,20,'+(0.3*intensity)+')');
    grad.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(flashX-flashR*2, flashY-flashR*2, flashR*4, flashR*4);
    var starR = flashR*0.4;
    var starGrad = ctx.createRadialGradient(flashX, flashY, 0, flashX, flashY, starR);
    starGrad.addColorStop(0, 'rgba(255,255,255,'+intensity+')');
    starGrad.addColorStop(1, 'rgba(255,255,200,0)');
    ctx.fillStyle = starGrad;
    ctx.beginPath(); ctx.arc(flashX, flashY, starR, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function getAmmoInfo(state) {
    var def = WEAPON_DEFS[state.current];
    return { name: def.name, ammo: state.ammo[state.current], max: state.ammoMax[state.current], slot: def.slot };
  }

  return {
    WEAPON_DEFS: WEAPON_DEFS, WEAPON_ORDER: WEAPON_ORDER,
    create: create, update: update, switchTo: switchTo, tryFire: tryFire,
    raycastHit: raycastHit, drawSprite: drawSprite, drawMuzzleFlash: drawMuzzleFlash, getAmmoInfo: getAmmoInfo,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Weapons;
if (typeof window !== 'undefined') window.Weapons = Weapons;
