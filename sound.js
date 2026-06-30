/**
 * sound.js — Procedural Sound Effects System
 * Issue #12: Sound Effects, Performance & Polish
 *
 * Features:
 *   - Web Audio API procedural sound generation (no external files)
 *   - Gunfire: pistol (sharp crack) + shotgun (deep boom)
 *   - Enemy growls and alert sounds
 *   - Footsteps (subtle, periodic)
 *   - Pickup collection chime
 *   - Damage taken grunt
 *   - Death sound (descending tone)
 *   - Level transition whoosh
 *   - Victory fanfare
 *   - Master volume control + mute toggle
 *   - Audio context lazy-init on first user gesture (browser autoplay policy)
 *
 * Public API (exposed as window.Sound):
 *   Sound.init()              -> init/resume AudioContext (call on user gesture)
 *   Sound.playPistol()        -> pistol fire sound
 *   Sound.playShotgun()       -> shotgun fire sound
 *   Sound.playGrowl()         -> enemy growl
 *   Sound.playAlert()         -> enemy alert sound
 *   Sound.playFootstep()      -> footstep sound
 *   Sound.playPickup()         -> pickup collection chime
 *   Sound.playDamage()        -> damage taken grunt
 *   Sound.playDeath()         -> player death sound
 *   Sound.playLevelTransition()-> level transition whoosh
 *   Sound.playVictory()       -> victory fanfare
 *   Sound.playNoAmmo()        -> dry fire click (no ammo)
 *   Sound.playEnemyHit()      -> enemy hit sound
 *   Sound.playEnemyDeath()   -> enemy death sound
 *   Sound.playFireball()      -> enemy fireball launch
 *   Sound.setMuted(bool)      -> mute/unmute
 *   Sound.isMuted()           -> check mute state
 *   Sound.setEnabled(bool)    -> enable/disable sound system
 *   Sound.isEnabled()         -> check if sound system enabled
 *
 * Vanilla JS (ES6+), no build step, no frameworks.
 */

var Sound = (function () {
  'use strict';

  var ctx = null;
  var masterGain = null;
  var muted = false;
  var enabled = true;
  var initialized = false;

  // Noise buffer cache for re-use
  var noiseBufferCache = null;
  var noiseBufferLen = 44100; // 1 second at 44.1kHz

  // ── Init ───────────────────────────────────────────────
  function init() {
    if (initialized && ctx) {
      // Resume if suspended (autoplay policy)
      if (ctx.state === 'suspended') {
        try { ctx.resume(); } catch (e) {}
      }
      return;
    }

    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        console.warn('Sound.init: Web Audio API not supported');
        enabled = false;
        return;
      }
      ctx = new AudioCtx();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 0.5;
      masterGain.connect(ctx.destination);
      initialized = true;

      // Pre-generate noise buffer
      noiseBufferCache = ctx.createBuffer(1, noiseBufferLen, ctx.sampleRate);
      var data = noiseBufferCache.getChannelData(0);
      for (var i = 0; i < noiseBufferLen; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    } catch (e) {
      console.warn('Sound.init: failed to create AudioContext:', e);
      enabled = false;
    }
  }

  // ── Helper: create noise source ─────────────────────────
  function getNoiseSource() {
    if (!ctx || !noiseBufferCache) return null;
    var src = ctx.createBufferSource();
    src.buffer = noiseBufferCache;
    src.loop = true;
    return src;
  }

  // ── Helper: create oscillator with envelope ────────────
  function playOsc(freq, duration, type, gainPeak, freqEnd) {
    if (!ctx || !enabled || muted) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(0.01, freqEnd),
        ctx.currentTime + duration
      );
    }
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(gainPeak, ctx.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration + 0.05);
  }

  // ── Helper: play noise burst with envelope ─────────────
  function playNoiseBurst(duration, gainPeak, filterFreq, filterQ) {
    if (!ctx || !enabled || muted) return;
    var src = getNoiseSource();
    if (!src) return;
    var gain = ctx.createGain();
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 4000;
    filter.Q.value = filterQ || 1;
    gain.gain.setValueAtTime(gainPeak, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    src.start(ctx.currentTime);
    src.stop(ctx.currentTime + duration + 0.05);
  }

  // ── Helper: play layered osc+noise ──────────────────────
  function playLayered(oscParams, noiseParams) {
    if (!ctx || !enabled || muted) return;
    if (oscParams) {
      playOsc(oscParams.freq, oscParams.duration, oscParams.type, oscParams.gain, oscParams.freqEnd);
    }
    if (noiseParams) {
      playNoiseBurst(noiseParams.duration, noiseParams.gain, noiseParams.filterFreq, noiseParams.filterQ);
    }
  }

  // ── Sound: Pistol Fire ──────────────────────────────────
  // Sharp crack: high-freq noise burst + quick osc ping
  function playPistol() {
    if (!ctx || !enabled || muted) return;
    // Sharp noise crack
    playNoiseBurst(0.08, 0.4, 6000, 1);
    // Oscillator pop
    playOsc(800, 0.06, 'square', 0.2, 200);
    // Low thump
    playOsc(120, 0.05, 'sine', 0.15, 60);
  }

  // ── Sound: Shotgun Fire ─────────────────────────────────
  // Deep boom: low-freq noise + low osc
  function playShotgun() {
    if (!ctx || !enabled || muted) return;
    // Deep noise boom
    playNoiseBurst(0.18, 0.5, 2500, 0.5);
    // Low osc boom
    playOsc(100, 0.15, 'sine', 0.3, 40);
    // Higher crack layer
    playNoiseBurst(0.05, 0.2, 8000, 1);
  }

  // ── Sound: No Ammo (dry fire click) ──────────────────────
  function playNoAmmo() {
    if (!ctx || !enabled || muted) return;
    playOsc(2000, 0.02, 'square', 0.08);
    playOsc(1500, 0.02, 'square', 0.05);
  }

  // ── Sound: Enemy Growl ──────────────────────────────────
  // Low rumble with vibrato
  function playGrowl() {
    if (!ctx || !enabled || muted) return;
    var baseFreq = 80 + Math.random() * 40;
    var duration = 0.4 + Math.random() * 0.3;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    var lfo = ctx.createOscillator();
    var lfoGain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);

    // Vibrato
    lfo.type = 'sine';
    lfo.frequency.value = 8 + Math.random() * 6;
    lfoGain.gain.value = 10;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.2, ctx.currentTime + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(ctx.currentTime);
    lfo.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration + 0.05);
    lfo.stop(ctx.currentTime + duration + 0.05);
  }

  // ── Sound: Enemy Alert ──────────────────────────────────
  // Rising tone to signal detection
  function playAlert() {
    if (!ctx || !enabled || muted) return;
    playOsc(200, 0.15, 'sawtooth', 0.15, 500);
    playNoiseBurst(0.1, 0.05, 3000, 1);
  }

  // ── Sound: Footstep ─────────────────────────────────────
  // Very subtle low noise click
  function playFootstep() {
    if (!ctx || !enabled || muted) return;
    playNoiseBurst(0.04, 0.06, 500, 1);
    playOsc(60, 0.03, 'sine', 0.03, 40);
  }

  // ── Sound: Pickup Collection ────────────────────────────
  // Pleasant chime: two ascending notes
  function playPickup() {
    if (!ctx || !enabled || muted) return;
    playOsc(523, 0.1, 'sine', 0.15); // C5
    setTimeout(function () {
      if (ctx && enabled && !muted) playOsc(784, 0.12, 'sine', 0.15); // G5
    }, 60);
  }

  // ── Sound: Damage Taken ─────────────────────────────────
  // Painful grunt: low descending tone + noise
  function playDamage() {
    if (!ctx || !enabled || muted) return;
    playOsc(300, 0.2, 'sawtooth', 0.2, 100);
    playNoiseBurst(0.1, 0.08, 2000, 0.5);
  }

  // ── Sound: Death ────────────────────────────────────────
  // Descending mournful tone
  function playDeath() {
    if (!ctx || !enabled || muted) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 1.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.55);

    // Low rumble
    playNoiseBurst(0.8, 0.1, 200, 0.5);
  }

  // ── Sound: Level Transition ────────────────────────────
  // Whoosh: noise sweep
  function playLevelTransition() {
    if (!ctx || !enabled || muted) return;
    var src = getNoiseSource();
    if (!src) return;
    var gain = ctx.createGain();
    var filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(200, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(3000, ctx.currentTime + 0.4);
    filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.8);
    filter.Q.value = 2;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    src.start(ctx.currentTime);
    src.stop(ctx.currentTime + 0.85);
  }

  // ── Sound: Victory Fanfare ─────────────────────────────
  // Ascending triad + sustained chord
  function playVictory() {
    if (!ctx || !enabled || muted) return;
    // Ascending notes: C, E, G, C(octave up)
    var notes = [523, 659, 784, 1047];
    for (var i = 0; i < notes.length; i++) {
      (function (freq, delay) {
        setTimeout(function () {
          if (ctx && enabled && !muted) {
            playOsc(freq, 0.3, 'triangle', 0.2);
            playOsc(freq * 2, 0.3, 'sine', 0.1);
          }
        }, delay);
      })(notes[i], i * 120);
    }
    // Final sustained chord
    setTimeout(function () {
      if (ctx && enabled && !muted) {
        playOsc(523, 0.8, 'triangle', 0.15);
        playOsc(659, 0.8, 'triangle', 0.15);
        playOsc(784, 0.8, 'triangle', 0.15);
      }
    }, 500);
  }

  // ── Sound: Enemy Hit ────────────────────────────────────
  // Squish/hit sound
  function playEnemyHit() {
    if (!ctx || !enabled || muted) return;
    playNoiseBurst(0.06, 0.12, 1500, 1);
    playOsc(150, 0.05, 'square', 0.08, 80);
  }

  // ── Sound: Enemy Death ─────────────────────────────────
  // Descending growl + thud
  function playEnemyDeath() {
    if (!ctx || !enabled || muted) return;
    playOsc(250, 0.3, 'sawtooth', 0.15, 60);
    playNoiseBurst(0.2, 0.1, 800, 0.5);
  }

  // ── Sound: Fireball Launch ──────────────────────────────
  function playFireball() {
    if (!ctx || !enabled || muted) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
    playNoiseBurst(0.15, 0.05, 3000, 1);
  }

  // ── Mute / Enable Controls ──────────────────────────────
  function setMuted(val) {
    muted = !!val;
    if (masterGain) {
      masterGain.gain.value = muted ? 0 : 0.5;
    }
  }

  function isMuted() { return muted; }

  function setEnabled(val) {
    enabled = !!val;
  }

  function isEnabled() { return enabled; }

  return {
    init: init,
    playPistol: playPistol,
    playShotgun: playShotgun,
    playGrowl: playGrowl,
    playAlert: playAlert,
    playFootstep: playFootstep,
    playPickup: playPickup,
    playDamage: playDamage,
    playDeath: playDeath,
    playLevelTransition: playLevelTransition,
    playVictory: playVictory,
    playNoAmmo: playNoAmmo,
    playEnemyHit: playEnemyHit,
    playEnemyDeath: playEnemyDeath,
    playFireball: playFireball,
    setMuted: setMuted,
    isMuted: isMuted,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Sound;
if (typeof window !== 'undefined') window.Sound = Sound;