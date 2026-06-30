/**
 * textures.js — Procedural Texture Generation
 * Issue #5: Textured Walls
 *
 * Generates 64x64 pixel textures procedurally (no external assets):
 *   - Stone: gray noisy stone with cracks
 *   - Brick: classic red-brick pattern with mortar
 *   - Metal: dark metal panels with rivets
 *   - Energy: glowing plasma field
 *   - Floor: dark concrete/dirt
 *   - Ceiling: dark concrete
 *
 * Each texture is stored as a Uint8ClampedArray (RGBA, 64*64*4 bytes).
 *
 * Public API:
 *   textures.TEX_SIZE        -> 64
 *   textures.get(wallType)   -> Uint8ClampedArray for that wall type
 *   textures.getFloor()      -> Uint8ClampedArray floor texture
 *   textures.getCeiling()    -> Uint8ClampedArray ceiling texture
 */

const textures = (() => {
  'use strict';

  const TEX_SIZE = 64;
  const TEX_BYTES = TEX_SIZE * TEX_SIZE * 4;

  // ── Seeded PRNG (Mulberry32) ────────────────────────
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function setPx(data, x, y, r, g, b) {
    const i = (y * TEX_SIZE + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }

  // ── Stone Texture ───────────────────────────────
  function genStone(data) {
    const rng = mulberry32(78901);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        let n = 0;
        n += Math.sin(x * 0.12) * Math.cos(y * 0.10) * 12;
        n += Math.sin(x * 0.25 + 1.3) * Math.cos(y * 0.22 + 0.7) * 8;
        n += (rng() - 0.5) * 18;
        const base = 100 + n;
        setPx(data, x, y,
          Math.max(40, Math.min(200, base + 30)),
          Math.max(35, Math.min(190, base + 15)),
          Math.max(30, Math.min(180, base))
        );
      }
    }
    for (let c = 0; c < 6; c++) {
      let cx = rng() * TEX_SIZE;
      let cy = rng() * TEX_SIZE;
      const len = 8 + rng() * 18;
      const ang = rng() * Math.PI * 2;
      for (let s = 0; s < len; s++) {
        const px = Math.floor(cx + Math.cos(ang) * s);
        const py = Math.floor(cy + Math.sin(ang) * s);
        if (px >= 0 && px < TEX_SIZE && py >= 0 && py < TEX_SIZE) {
          setPx(data, px, py, 35, 30, 25);
          if (px + 1 < TEX_SIZE) setPx(data, px + 1, py, 40, 35, 30);
        }
      }
    }
  }

  // ── Brick Texture ─────────────────────────────
  function genBrick(data) {
    const rng = mulberry32(42);
    const brickW = 32, brickH = 16;
    const mortar = [55, 45, 40];
    for (let y = 0; y < TEX_SIZE; y++) {
      const row = Math.floor(y / brickH);
      const xOff = (row & 1) * (brickW >> 1);
      for (let x = 0; x < TEX_SIZE; x++) {
        const ax = x + xOff;
        const inMortarY = (y % brickH === 0);
        const inMortarX = (ax % brickW === 0);
        if (inMortarY || inMortarX) {
          setPx(data, x, y, mortar[0], mortar[1], mortar[2]);
        } else {
          const v = (rng() - 0.5) * 30;
          setPx(data, x, y,
            Math.max(80, Math.min(180, 130 + v)),
            Math.max(40, Math.min(100, 65 + v * 0.5)),
            Math.max(30, Math.min(80, 45 + v * 0.3))
          );
        }
      }
    }
  }

  // ── Metal Texture ─────────────────────────────
  function genMetal(data) {
    const rng = mulberry32(123);
    const panel = 16;
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const lx = x % panel, ly = y % panel;
        let r, g, b;
        if (lx === 0 || lx === panel - 1 || ly === 0 || ly === panel - 1) {
          r = 30; g = 30; b = 38;
        } else {
          const noise = (rng() - 0.5) * 15;
          const base = 78 + noise;
          r = base; g = base; b = base + 8;
          const dx = Math.min(lx - 2, (panel - 3) - lx);
          const dy = Math.min(ly - 2, (panel - 3) - ly);
          const rd = Math.sqrt(dx * dx + dy * dy);
          if (rd < 1.5) {
            r = 150; g = 150; b = 165;
          } else if (rd < 2.5) {
            r = 50; g = 50; b = 60;
          }
        }
        setPx(data, x, y, r, g, b);
      }
    }
  }

  // ── Energy Field Texture ────────────────────────
  function genEnergy(data) {
    const rng = mulberry32(666);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const w1 = Math.sin(x * 0.15) * Math.cos(y * 0.18);
        const w2 = Math.sin((x + y) * 0.12 + 1.5);
        const w3 = Math.sin(Math.sqrt((x - 32) * (x - 32) + (y - 32) * (y - 32)) * 0.2);
        const intensity = (w1 + w2 + w3 + 3) / 6;
        const noise = (rng() - 0.5) * 15;
        setPx(data, x, y,
          Math.max(0, Math.min(255, 120 + intensity * 100 + noise)),
          Math.max(0, Math.min(255, 160 + intensity * 80 + noise)),
          Math.max(0, Math.min(255, 40 + intensity * 60 + noise))
        );
      }
    }
  }

  // ── Floor Texture (dark concrete/dirt) ────────────────────
  function genFloor(data) {
    const rng = mulberry32(2024);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const n = (rng() - 0.5) * 20;
        const v = Math.sin(x * 0.08) * Math.cos(y * 0.08) * 10;
        const base = 55 + n + v;
        setPx(data, x, y,
          Math.max(20, Math.min(90, base + 15)),
          Math.max(15, Math.min(75, base + 5)),
          Math.max(10, Math.min(60, base - 5))
        );
      }
    }
  }

  // ── Ceiling Texture (dark concrete) ──────────────────────
  function genCeiling(data) {
    const rng = mulberry32(99);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const n = (rng() - 0.5) * 15;
        const base = 28 + n;
        setPx(data, x, y,
          Math.max(10, Math.min(50, base + 5)),
          Math.max(10, Math.min(50, base + 3)),
          Math.max(15, Math.min(55, base + 8))
        );
      }
    }
  }

  function create(gen) {
    const d = new Uint8ClampedArray(TEX_BYTES);
    gen(d);
    return d;
  }

  const map = {
    1: create(genStone),
    2: create(genBrick),
    3: create(genMetal),
    4: create(genEnergy),
  };

  const floorTex = create(genFloor);
  const ceilTex = create(genCeiling);

  return {
    TEX_SIZE,
    get(type) { return map[type] || map[1]; },
    getFloor() { return floorTex; },
    getCeiling() { return ceilTex; },
  };
})();

if (typeof window !== 'undefined') window.textures = textures;
