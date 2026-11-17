/* ============================================================
   pixels.js — procedural 16×16 Minecraft-style textures
   Every texture is generated locally with a seeded RNG so it is
   stable between reloads and identical inside the exported pack.
   ============================================================ */
(function (MF) {
  'use strict';
  const { clamp, hexToRgb, shade } = MF.util;

  const MATERIALS = [
    { id: 'stone', label: 'Stone', base: '#8d8d8d', pattern: 'speckle' },
    { id: 'cobble', label: 'Cobble', base: '#7f7f7f', pattern: 'cobble' },
    { id: 'dirt', label: 'Dirt', base: '#8a6240', pattern: 'speckle' },
    { id: 'grass', label: 'Grass', base: '#7cb64c', pattern: 'grass' },
    { id: 'sand', label: 'Sand', base: '#ded3a2', pattern: 'speckle' },
    { id: 'planks', label: 'Planks', base: '#bb8d55', pattern: 'planks' },
    { id: 'log', label: 'Log', base: '#6e5233', pattern: 'log' },
    { id: 'leaves', label: 'Leaves', base: '#50943a', pattern: 'leaves' },
    { id: 'brick', label: 'Brick', base: '#a4544b', pattern: 'brick' },
    { id: 'metal', label: 'Metal', base: '#c4ccd3', pattern: 'metal' },
    { id: 'glass', label: 'Glass', base: '#d3eef1', pattern: 'glass' },
    { id: 'crystal', label: 'Crystal', base: '#7ee6e0', pattern: 'crystal' },
    { id: 'neon', label: 'Neon', base: '#7cf6c8', pattern: 'neon' },
    { id: 'wool', label: 'Wool', base: '#e2e2e2', pattern: 'wool' },
    { id: 'obsidian', label: 'Obsidian', base: '#3d3454', pattern: 'speckle' },
    { id: 'glowstone', label: 'Glowstone', base: '#f0cf80', pattern: 'glow' },
    { id: 'slime', label: 'Slime', base: '#8bdc77', pattern: 'slime' }
  ];

  const TINTS = [
    { id: 'none', label: 'Original', hex: null },
    { id: 'white', label: 'White', hex: '#eef1f3' },
    { id: 'gray', label: 'Gray', hex: '#8e9aa4' },
    { id: 'black', label: 'Black', hex: '#2c3036' },
    { id: 'brown', label: 'Brown', hex: '#7d5432' },
    { id: 'red', label: 'Red', hex: '#c8402f' },
    { id: 'orange', label: 'Orange', hex: '#e07c2c' },
    { id: 'yellow', label: 'Yellow', hex: '#f2c94c' },
    { id: 'lime', label: 'Lime', hex: '#8fd043' },
    { id: 'green', label: 'Green', hex: '#3f9445' },
    { id: 'cyan', label: 'Cyan', hex: '#45c6c0' },
    { id: 'lightblue', label: 'Sky', hex: '#7fb9ea' },
    { id: 'blue', label: 'Blue', hex: '#3f62b5' },
    { id: 'purple', label: 'Purple', hex: '#8d5fd8' },
    { id: 'magenta', label: 'Magenta', hex: '#d168c2' },
    { id: 'pink', label: 'Pink', hex: '#f0a2c0' },
    { id: 'emerald', label: 'Emerald', hex: '#2fbf72' },
    { id: 'gold', label: 'Gold', hex: '#e9b83f' }
  ];

  const ITEM_SHAPES = [
    { id: 'gem', label: 'Gem' },
    { id: 'ingot', label: 'Ingot' },
    { id: 'shard', label: 'Shard' },
    { id: 'orb', label: 'Orb' },
    { id: 'dust', label: 'Dust' }
  ];

  const SIZE = 16;

  /* ---------------- helpers ---------------- */
  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mixHex(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return MF.util.rgbToHex(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
  }
  function ramp(hex) {
    return [
      shade(hex, -0.38),
      shade(hex, -0.2),
      hex,
      shade(hex, 0.13),
      shade(hex, 0.3)
    ].map((h) => {
      const c = hexToRgb(h);
      return [c.r, c.g, c.b];
    });
  }
  function canvas16() {
    const c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    return c;
  }
  const byId = (list, id) => list.find((m) => m.id === id) || list[0];
  function materialById(id) { return byId(MATERIALS, id); }
  function tintById(id) { return TINTS.find((t) => t.id === id) || TINTS[0]; }

  function baseColorFor(material, tintId) {
    const tint = tintById(tintId);
    if (!tint.hex) return material.base;
    return mixHex(material.base, tint.hex, 0.72);
  }

  /* ---------------- texture painter ---------------- */
  function paintPattern(material, tintId, seed, variant) {
    const rng = mulberry32(hashString(material.id + '|' + baseColorFor(material, tintId) + '|' + seed + '|' + variant));
    const cvs = canvas16();
    const ctx = cvs.getContext('2d');
    const img = ctx.createImageData(SIZE, SIZE);
    const d = img.data;

    function put(x, y, rgb, a) {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
      const i = (y * SIZE + x) * 4;
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
      d[i + 3] = a === undefined ? 255 : a;
    }
    function clear(x, y) { put(x, y, [0, 0, 0], 0); }
    function fillAll(R, idx, alpha) {
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) put(x, y, R[idx === undefined ? 2 : idx], alpha);
    }
    function noise(R, chance, idx, alpha) {
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        if (rng() < (chance === undefined ? 0.22 : chance)) put(x, y, R[idx], alpha);
      }
    }

    const base = baseColorFor(material, tintId);
    const R = ramp(base);
    const pattern = material.pattern;

    if (pattern === 'grass' && variant === 'side') {
      const dirt = ramp('#8a6240');
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          let idx = 2;
          const r = rng();
          if (r < 0.16) idx = 1; else if (r > 0.86) idx = 3;
          put(x, y, dirt[idx]);
        }
      }
      for (let x = 0; x < SIZE; x++) {
        const depth = 3 + (rng() < 0.45 ? 1 : 0) + (rng() < 0.2 ? 1 : 0);
        for (let y = 0; y < depth; y++) {
          const idx = y === 0 ? 4 : y === depth - 1 ? 1 : (rng() < 0.3 ? 3 : 2);
          put(x, y, R[idx]);
        }
        if (rng() < 0.25) put(x, depth, R[1]);
      }
      noise(dirt, 0.1, 1);
    } else if (pattern === 'grass') {
      fillAll(R, 2);
      noise(R, 0.3, 1); noise(R, 0.18, 3);
      for (let i = 0; i < 12; i++) put((rng() * SIZE) | 0, (rng() * SIZE) | 0, R[4]);
    } else if (pattern === 'speckle') {
      fillAll(R, 2);
      noise(R, 0.26, 1); noise(R, 0.2, 3);
      for (let i = 0; i < 5; i++) {
        const x = (rng() * SIZE) | 0, y = (rng() * SIZE) | 0;
        put(x, y, R[1]); put(x + 1, y, R[1]); put(x, y + 1, R[0]);
      }
    } else if (pattern === 'cobble') {
      fillAll(R, 0);
      for (let i = 0; i < 10; i++) {
        const w = 3 + ((rng() * 3) | 0), h = 2 + ((rng() * 3) | 0);
        const ox = (rng() * SIZE) | 0, oy = (rng() * SIZE) | 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (x === 0 && y === 0 && rng() < 0.4) continue;
            const idx = y === 0 ? 3 : y === h - 1 ? 1 : (rng() < 0.25 ? 3 : 2);
            put((ox + x) % SIZE, (oy + y) % SIZE, R[idx]);
          }
        }
      }
    } else if (pattern === 'planks') {
      fillAll(R, 2);
      for (let y = 0; y < SIZE; y++) {
        const row = (y / 4) | 0;
        for (let x = 0; x < SIZE; x++) {
          let idx = 2;
          const r = rng();
          if (r < 0.1) idx = 1; else if (r > 0.88) idx = 3;
          if (y % 4 === 3) idx = 0;
          const seam = (x + row * 5) % 16 === 0;
          if (seam) idx = 1;
          put(x, y, R[idx]);
        }
      }
      for (let row = 0; row < 4; row++) {
        const y = row * 4;
        for (let x = 0; x < SIZE; x++) if (rng() < 0.3) put(x, y, R[3]);
      }
    } else if (pattern === 'log' && variant === 'top') {
      fillAll(R, 2);
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const dx = Math.abs(x - 7.5), dy = Math.abs(y - 7.5);
          const ring = Math.round(Math.max(dx, dy));
          const idx = ring < 2 ? 4 : ring < 4 ? 2 : ring < 6 ? 1 : 2;
          put(x, y, R[idx]);
        }
      }
      for (let i = 0; i < 4; i++) put(7 + (i % 2), 7 + (i >> 1), R[3]);
    } else if (pattern === 'log') {
      fillAll(R, 2);
      for (let x = 0; x < SIZE; x++) {
        const groove = rng();
        for (let y = 0; y < SIZE; y++) {
          let idx = 2;
          const r = rng();
          if (r < 0.16) idx = 1; else if (r > 0.88) idx = 3;
          if (groove < 0.3 && (x === 0 || x === 8)) idx = 0;
          if (groove > 0.8 && (x === 4 || x === 12)) idx = 3;
          put(x, y, R[idx]);
        }
      }
    } else if (pattern === 'leaves') {
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const r = rng();
          if (r < 0.11) { clear(x, y); continue; }
          const idx = r < 0.32 ? 1 : r < 0.55 ? 0 : r < 0.85 ? 2 : 3;
          put(x, y, R[idx]);
        }
      }
      for (let i = 0; i < 5; i++) {
        const x = (rng() * SIZE) | 0, y = (rng() * SIZE) | 0;
        clear(x, y);
        if (rng() < 0.6) clear(x + 1, y);
      }
    } else if (pattern === 'brick') {
      fillAll(R, 0);
      for (let y = 0; y < SIZE; y++) {
        const row = (y / 4) | 0;
        const offset = row % 2 ? 4 : 0;
        for (let x = 0; x < SIZE; x++) {
          if (y % 4 === 3) { put(x, y, R[0]); continue; }
          const local = (x + offset) % 8;
          if (local === 7) { put(x, y, R[0]); continue; }
          const idx = y % 4 === 0 ? 3 : rng() < 0.18 ? 1 : 2;
          put(x, y, R[idx]);
        }
      }
    } else if (pattern === 'metal') {
      for (let y = 0; y < SIZE; y++) {
        const idx = y < 2 ? 4 : y < 5 ? 3 : y < 12 ? 2 : 1;
        for (let x = 0; x < SIZE; x++) put(x, y, R[rng() < 0.12 ? Math.min(4, idx + 1) : idx]);
      }
      [[2, 2], [13, 2], [2, 13], [13, 13]].forEach(([x, y]) => {
        put(x, y, R[0]); put(x, y - 1, R[4]); put(x - 1, y, R[1]);
      });
      for (let x = 0; x < SIZE; x++) put(x, 0, R[4]);
    } else if (pattern === 'glass') {
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const edge = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1;
        if (edge) put(x, y, R[3], 220);
        else put(x, y, R[2], 26);
      }
      for (let i = 0; i < 7; i++) put(3 + i, 4 + i, R[4], 120);
      for (let i = 0; i < 4; i++) put(4 + i, 5 + i, R[4], 80);
      put(11, 3, R[4], 150); put(12, 4, R[4], 110);
    } else if (pattern === 'crystal') {
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const band = (x + y) % 8;
          let idx = band < 2 ? 4 : band < 4 ? 3 : band < 6 ? 2 : 1;
          if (rng() < 0.07) idx = 4;
          put(x, y, R[idx]);
        }
      }
      for (let i = 0; i < 3; i++) {
        const x = 2 + ((rng() * 11) | 0), y = 2 + ((rng() * 11) | 0);
        put(x, y, [255, 255, 255]); put(x + 1, y, R[4]);
      }
    } else if (pattern === 'neon') {
      fillAll(R, 0);
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          if (x % 5 === 2 || y % 5 === 2) put(x, y, R[4]);
          else if (rng() < 0.12) put(x, y, R[2]);
          else if (x % 5 === 1 || y % 5 === 1) put(x, y, R[1]);
        }
      }
    } else if (pattern === 'wool') {
      fillAll(R, 2);
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const r = rng();
        if (r < 0.28) put(x, y, R[1]);
        else if (r > 0.78) put(x, y, R[3]);
      }
      for (let i = 0; i < 4; i++) {
        const y = (rng() * SIZE) | 0;
        for (let x = 0; x < SIZE; x++) if ((x + i) % 4 === 0) put(x, y, R[1]);
      }
    } else if (pattern === 'glow') {
      fillAll(R, 2);
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const r = rng();
        if (r < 0.2) put(x, y, R[1]);
        else if (r > 0.72) put(x, y, R[4]);
      }
      for (let i = 0; i < 6; i++) {
        const x = (rng() * SIZE) | 0, y = (rng() * SIZE) | 0;
        put(x, y, [255, 250, 220]);
      }
    } else if (pattern === 'water') {
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const wave = Math.round(Math.sin(x * 0.9 + y * 0.4) * 1.2);
          let idx = 2;
          if ((y + wave) % 5 === 0) idx = 3;
          else if (rng() < 0.14) idx = 1;
          put(x, y, R[idx], 218);
        }
      }
      for (let i = 0; i < 5; i++) put((rng() * SIZE) | 0, (rng() * SIZE) | 0, R[4], 210);
    } else if (pattern === 'slime') {
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const edge = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1;
        put(x, y, edge ? R[1] : (rng() < 0.3 ? R[3] : R[2]), edge ? 235 : 196);
      }
      for (let i = 0; i < 4; i++) {
        const x = 2 + ((rng() * 12) | 0), y = 2 + ((rng() * 12) | 0);
        put(x, y, R[4], 190); put(x + 1, y, R[4], 190); put(x, y + 1, R[3], 180);
      }
    } else {
      fillAll(R, 2); noise(R, 0.25, 1);
    }

    ctx.putImageData(img, 0, 0);
    return cvs;
  }

  /* ---------------- shading ---------------- */
  const shadeCache = new WeakMap();
  function shaded(src, factor) {
    if (factor === 1) return src;
    let map = shadeCache.get(src);
    if (!map) { map = new Map(); shadeCache.set(src, map); }
    const key = factor.toFixed(2);
    if (map.has(key)) return map.get(key);
    const c = canvas16();
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0);
    if (factor < 1) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(0,0,0,' + (1 - factor).toFixed(3) + ')';
      ctx.fillRect(0, 0, SIZE, SIZE);
    } else {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(255,255,255,' + ((factor - 1) * 0.9).toFixed(3) + ')';
      ctx.fillRect(0, 0, SIZE, SIZE);
    }
    map.set(key, c);
    return c;
  }

  /* ---------------- block texture sets ---------------- */
  const blockCache = new Map();
  function blockTextures(content) {
    const material = materialById(content.material);
    const seed = content.seed || content.id || material.id;
    const key = material.id + '|' + (content.tint || 'none') + '|' + seed;
    if (blockCache.has(key)) return blockCache.get(key);
    const sideRaw = paintPattern(material, content.tint, seed, 'side');
    const topRaw = paintPattern(material, content.tint, seed, 'top');
    const set = {
      rawTop: topRaw,
      rawSide: sideRaw,
      top: shaded(topRaw, 1.0),
      left: shaded(sideRaw, 0.82),
      right: shaded(sideRaw, 0.62),
      material: material.id
    };
    blockCache.set(key, set);
    return set;
  }

  /* ---------------- item sprites ---------------- */
  function itemMask(shape, x, y) {
    const cx = 7.5, cy = 7.5;
    switch (shape) {
      case 'gem': return Math.abs(x - cx) + Math.abs(y - cy) <= 7.2;
      case 'ingot': {
        if (y < 5 || y > 10) return false;
        const half = y === 5 || y === 10 ? 4 : 6;
        return Math.abs(x - cx) <= half;
      }
      case 'shard': {
        if (y < 2 || y > 13) return false;
        const prog = (y - 2) / 11;
        return Math.abs(x - cx) <= 1 + prog * 4.2;
      }
      case 'orb': return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= 31;
      case 'dust': {
        const nx = (x - cx) / 6.6, ny = (y - 12) / 4.6;
        return y >= 8 && nx * nx + ny * ny <= 1;
      }
      default: return Math.abs(x - cx) + Math.abs(y - cy) <= 7;
    }
  }

  const itemCache = new Map();
  function itemTexture(content) {
    const material = materialById(content.material);
    const shape = content.shape || 'gem';
    const seed = content.seed || content.id || material.id;
    const key = material.id + '|' + (content.tint || 'none') + '|' + seed + '|' + shape;
    if (itemCache.has(key)) return itemCache.get(key);
    const rng = mulberry32(hashString(key));
    const cvs = canvas16();
    const ctx = cvs.getContext('2d');
    const img = ctx.createImageData(SIZE, SIZE);
    const d = img.data;
    const base = baseColorFor(material, content.tint);
    const R = ramp(base);
    const special = ['glass', 'glowstone', 'neon', 'crystal', 'slime'].indexOf(material.id) >= 0;

    function put(x, y, rgb, a) {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
      const i = (y * SIZE + x) * 4;
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = a === undefined ? 255 : a;
    }
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (!itemMask(shape, x, y)) continue;
        const edge = !itemMask(shape, x - 1, y) || !itemMask(shape, x + 1, y) || !itemMask(shape, x, y - 1) || !itemMask(shape, x, y + 1);
        if (edge) { put(x, y, R[0]); continue; }
        let idx = 2;
        if (shape === 'gem' || shape === 'crystal') {
          if (y < 7 && x < 8) idx = 4; else if (y > 8 && x > 8) idx = 1; else idx = 3;
        } else if (shape === 'ingot' || shape === 'shard') {
          if (x < 6 && y < 8) idx = 4; else if (x > 9 || y > 10) idx = 1; else idx = 2;
        } else if (shape === 'orb') {
          const dx = x - 5.5, dy = y - 5.5;
          idx = dx * dx + dy * dy < 6 ? 4 : (dx * dx + dy * dy < 14 ? 3 : (y > 9 ? 1 : 2));
        } else {
          idx = rng() < 0.4 ? 3 : rng() < 0.5 ? 1 : 2;
        }
        if (rng() < 0.08 && !special) idx = 1;
        put(x, y, R[idx]);
      }
    }
    // specular sparkle
    if (special || rng() < 0.5) {
      const sx = 5, sy = 4;
      if (itemMask(shape, sx, sy)) put(sx, sy, [255, 255, 255]);
    }
    ctx.putImageData(img, 0, 0);
    itemCache.set(key, cvs);
    return cvs;
  }

  /* ---------------- png helpers ---------------- */
  function dataUrl(canvas) {
    return canvas.toDataURL('image/png');
  }
  function pngBytes(canvas) {
    const url = canvas.toDataURL('image/png');
    return base64ToBytes(url.split(',')[1]);
  }
  function base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function scaledTexture(src, size) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, size, size);
    return c;
  }

  MF.pixels = {
    SIZE,
    MATERIALS,
    TINTS,
    ITEM_SHAPES,
    materialById,
    tintById,
    baseColorFor,
    texture: paintPattern,
    blockTextures,
    itemTexture,
    shaded,
    dataUrl,
    pngBytes,
    scaledTexture,
    hashString
  };
})(window.MF);
