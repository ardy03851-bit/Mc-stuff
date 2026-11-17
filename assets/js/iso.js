/* ============================================================
   iso.js — isometric voxel renderer + pixel icons
   Pure canvas 2D: textured parallelograms, painter's algorithm.
   ============================================================ */
(function (MF) {
  'use strict';

  const VIEW_DIRS = [
    { a: [1, 0], b: [0, 1] },   // q0 → +x / +z
    { a: [0, 1], b: [-1, 0] },  // q1 → +z / -x
    { a: [-1, 0], b: [0, -1] }, // q2 → -x / -z
    { a: [0, -1], b: [1, 0] }   // q3 → -z / +x
  ];

  function viewCoords(x, z, q, N) {
    switch (q) {
      case 1: return [z, N - 1 - x];
      case 2: return [N - 1 - x, N - 1 - z];
      case 3: return [N - 1 - z, x];
      default: return [x, z];
    }
  }

  const BLEED = 0.75;
  function drawFace(ctx, tex, a, b, c, d, e, f) {
    ctx.save();
    ctx.transform(a, b, c, d, e, f);
    // slight overdraw hides anti-aliased seams between adjacent faces
    ctx.drawImage(tex, -BLEED, -BLEED, 16 + BLEED * 2, 16 + BLEED * 2);
    ctx.restore();
  }

  class IsoScene {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.world = null;
      this.orientation = 0;
      this.zoom = 1;
      this.highlight = null;
      this.faces = [];
      this.pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      this.hw = 10; this.hh = 5; this.ch = 10;
      this.origin = { x: 0, y: 0 };
    }

    resize(cssW, cssH) {
      const dpr = this.pixelRatio;
      const w = Math.max(1, Math.round(cssW * dpr));
      const h = Math.max(1, Math.round(cssH * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.cssW = cssW;
      this.cssH = cssH;
    }

    setWorld(world) {
      this.world = world;
      this.faces = [];
    }

    setOrientation(q) {
      this.orientation = ((q % 4) + 4) % 4;
      this.render();
    }

    rotate(dir) {
      this.setOrientation(this.orientation + (dir < 0 ? -1 : 1));
    }

    setZoom(z) {
      this.zoom = MF.util.clamp(z, 0.6, 2.2);
      this.render();
    }

    /* ---------- geometry ---------- */
    layout() {
      const world = this.world;
      const w = this.cssW, h = this.cssH;
      const N = world.size;
      const q = this.orientation;
      const list = [];

      // Pass 1: project into "tile units" (independent of scale) so the fit
      // can be computed exactly before choosing a tile size.
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      world.forEachCell((x, y, z, cell) => {
        if (!cell) return;
        const vc = viewCoords(x, z, q, N);
        const u = vc[0] - vc[1];
        const v = (vc[0] + vc[1]) * 0.5 - y;
        list.push({ x, y, z, cell, u, v, d: vc[0] + vc[1] });
        if (u - 1 < minX) minX = u - 1;
        if (u + 1 > maxX) maxX = u + 1;
        if (v - 0.5 < minY) minY = v - 0.5;
        if (v + 1.5 > maxY) maxY = v + 1.5;
      });

      if (!list.length) {
        this.hw = this.hh = this.ch = 12;
        this.origin = { x: w / 2, y: h / 2 };
        this.items = [];
        return;
      }

      const spanX = Math.max(1, maxX - minX);
      const spanY = Math.max(1, maxY - minY);
      let hw = Math.min((w * 0.9) / spanX, (h * 0.84) / spanY) * this.zoom;
      hw = Math.max(2, hw);

      this.hw = hw;
      this.hh = hw / 2;
      this.ch = hw;
      this.origin = {
        x: w / 2 - ((minX + maxX) / 2) * hw,
        y: h / 2 - ((minY + maxY) / 2) * hw
      };
      list.sort((p, r) => (p.d - r.d) || (p.y - r.y));
      this.items = list;
    }

    /* ---------- drawing ---------- */
    render() {
      const t0 = performance.now();
      const ctx = this.ctx;
      const world = this.world;
      const dpr = this.pixelRatio;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, this.cssW, this.cssH);
      this.faces = [];
      if (!world) return;

      this.layout();
      const q = this.orientation;
      const N = world.size;
      const hw = this.hw, hh = this.hh, ch = this.ch;
      const ox = this.origin.x, oy = this.origin.y;
      const dirs = VIEW_DIRS[q];

      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      for (const it of this.items) {
        const cell = it.cell;
        const sx = it.u * hw + ox;
        const sy = it.v * hw + oy;

        if (cell.glow) {
          const g = ctx.createRadialGradient(sx, sy, ch * 0.2, sx, sy, hw * 2.6);
          const col = cell.glowColor || 'rgba(120,255,200,';
          g.addColorStop(0, col + '0.3)');
          g.addColorStop(1, col + '0)');
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(sx, sy, hw * 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        const above = world.get(it.x, it.y + 1, it.z);
        const na = world.get(it.x + dirs.a[0], it.y, it.z + dirs.a[1]);
        const nb = world.get(it.x + dirs.b[0], it.y, it.z + dirs.b[1]);
        const opaqueAbove = above && above.opaque !== false;
        const opaqueA = na && na.opaque !== false;
        const opaqueB = nb && nb.opaque !== false;

        const alpha = cell.alpha === undefined ? 1 : cell.alpha;
        ctx.globalAlpha = alpha;

        if (cell.water) {
          // water only draws its surface
          if (!opaqueAbove) {
            this.fillTop(ctx, cell.tex.top, sx, sy, hw, hh);
            this.faces.push({
              poly: [[sx, sy - hh], [sx + hw, sy], [sx, sy + hh], [sx - hw, sy]],
              x: it.x, y: it.y, z: it.z, type: 'top', normal: [0, 1, 0]
            });
          }
          ctx.globalAlpha = 1;
          continue;
        }

        if (!opaqueB) {
          this.fillSide(ctx, cell.tex.left, sx - hw, sy, hw, hh, ch, 'left');
          this.faces.push({
            poly: [[sx - hw, sy], [sx, sy + hh], [sx, sy + hh + ch], [sx - hw, sy + ch]],
            x: it.x, y: it.y, z: it.z, type: 'side', normal: [dirs.b[0], 0, dirs.b[1]]
          });
        }
        if (!opaqueA) {
          this.fillSide(ctx, cell.tex.right, sx, sy + hh, hw, hh, ch, 'right');
          this.faces.push({
            poly: [[sx, sy + hh], [sx + hw, sy], [sx + hw, sy + ch], [sx, sy + hh + ch]],
            x: it.x, y: it.y, z: it.z, type: 'side', normal: [dirs.a[0], 0, dirs.a[1]]
          });
        }
        if (!opaqueAbove) {
          this.fillTop(ctx, cell.tex.top, sx, sy, hw, hh);
          this.faces.push({
            poly: [[sx, sy - hh], [sx + hw, sy], [sx, sy + hh], [sx - hw, sy]],
            x: it.x, y: it.y, z: it.z, type: 'top', normal: [0, 1, 0]
          });
        }
        ctx.globalAlpha = 1;
      }

      // highlight
      if (this.highlight) {
        const hl = this.highlight;
        const vc = viewCoords(hl.x, hl.z, q, N);
        const sx = (vc[0] - vc[1]) * hw + ox;
        const sy = (vc[0] + vc[1]) * hh - hl.y * ch + oy;
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(sx, sy - hh);
        ctx.lineTo(sx + hw, sy);
        ctx.lineTo(sx, sy + hh);
        ctx.lineTo(sx - hw, sy);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.lastRenderMs = performance.now() - t0;
    }

    fillTop(ctx, tex, sx, sy, hw, hh) {
      drawFace(ctx, tex, hw / 16, hh / 16, -hw / 16, hh / 16, sx, sy - hh);
    }

    fillSide(ctx, tex, bx, by, hw, hh, ch, side) {
      if (side === 'left') {
        drawFace(ctx, tex, hw / 16, hh / 16, 0, ch / 16, bx, by);
      } else {
        drawFace(ctx, tex, hw / 16, -hh / 16, 0, ch / 16, bx, by);
      }
    }

    /* ---------- interaction ---------- */
    pick(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      for (let i = this.faces.length - 1; i >= 0; i--) {
        if (pointInPoly(x, y, this.faces[i].poly)) return this.faces[i];
      }
      return null;
    }
  }

  function pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  /* ============================================================
     icons
     ============================================================ */
  const iconCache = new Map();

  function paintCube(ctx, tex, sx, sy, hw) {
    const hh = hw / 2;
    const ch = hw;
    drawFace(ctx, tex.left, hw / 16, hh / 16, 0, ch / 16, sx - hw, sy);
    drawFace(ctx, tex.right, hw / 16, -hh / 16, 0, ch / 16, sx, sy + hh);
    drawFace(ctx, tex.top, hw / 16, hh / 16, -hw / 16, hh / 16, sx, sy - hh);
  }

  function blockCanvas(content, size) {
    const key = 'b|' + (content.material || 'stone') + '|' + (content.tint || 'none') + '|' + (content.seed || content.id || '') + '|' + size;
    if (iconCache.has(key)) return iconCache.get(key);
    const tex = MF.pixels.blockTextures(content);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const hw = Math.min(size * 0.42, size / 2.2);
    const totalH = hw * 2; // diamond height + cube sides
    const sx = size / 2;
    const sy = (size - totalH) / 2 + hw / 2 + 1;
    paintCube(ctx, tex, sx, sy, hw);
    iconCache.set(key, c);
    return c;
  }

  function itemCanvas(content, size) {
    const key = 'i|' + (content.material || 'stone') + '|' + (content.tint || 'none') + '|' + (content.shape || 'gem') + '|' + (content.seed || content.id || '') + '|' + size;
    if (iconCache.has(key)) return iconCache.get(key);
    const src = MF.pixels.itemTexture(content);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const pad = Math.round(size * 0.1);
    const inner = size - pad * 2;
    ctx.drawImage(src, 0, 0, 16, 16, pad, pad - inner * 0.02, inner, inner);
    iconCache.set(key, c);
    return c;
  }

  function contentCanvas(content, size) {
    if (!content) return blockCanvas({ material: 'stone' }, size);
    return content.kind === 'item' ? itemCanvas(content, size) : blockCanvas(content, size);
  }

  /* showcase: floating block / item above a stone slab */
  function paintShowcase(canvas, content, time) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 360;
    const h = canvas.clientHeight || 232;
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    const t = time / 1000;
    const bob = Math.sin(t * 1.35) * 3;
    const cx = w / 2;
    const hw = Math.max(13, Math.min(w * 0.145, h * 0.19));
    const baseY = h * 0.66;

    // ambient backdrop glow
    const amb = ctx.createRadialGradient(cx, baseY - hw * 1.4, 4, cx, baseY - hw * 1.4, hw * 4.2);
    amb.addColorStop(0, 'rgba(94,224,138,0.16)');
    amb.addColorStop(1, 'rgba(94,224,138,0)');
    ctx.fillStyle = amb;
    ctx.fillRect(0, 0, w, h);

    // stone slab pedestal
    const stone = MF.pixels.blockTextures({ material: 'stone', tint: 'none', seed: 'pedestal' });
    const platHw = hw * 1.5;
    const platHh = platHw / 2;
    const thick = hw * 0.26;
    drawFace(ctx, stone.left, platHw / 16, platHh / 16, 0, thick / 16, cx - platHw, baseY);
    drawFace(ctx, stone.right, platHw / 16, -platHh / 16, 0, thick / 16, cx, baseY + platHh);
    drawFace(ctx, stone.top, platHw / 16, platHh / 16, -platHw / 16, platHh / 16, cx, baseY - platHh);

    // soft contact shadow on the slab
    const sh = ctx.createRadialGradient(cx, baseY, 0, cx, baseY, hw * 0.95);
    sh.addColorStop(0, 'rgba(0,0,0,0.4)');
    sh.addColorStop(0.6, 'rgba(0,0,0,0.18)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(cx, baseY);
    ctx.scale(1, 0.44);
    ctx.translate(-cx, -baseY);
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(cx, baseY, hw * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // floating pixels
    for (let i = 0; i < 6; i++) {
      const a = t * (0.45 + i * 0.11) + i * 1.7;
      const rx = hw * (1.5 + (i % 2) * 0.55);
      const px = cx + Math.cos(a) * rx;
      const py = baseY - hw * (1.2 + (i % 3) * 0.42) + Math.sin(a * 1.3) * hw * 0.5;
      const sz = 2 + (i % 2);
      ctx.fillStyle = i % 2 ? 'rgba(94,224,138,0.5)' : 'rgba(255,255,255,0.3)';
      ctx.fillRect(Math.round(px), Math.round(py), sz, sz);
    }

    if (content && content.kind === 'item') {
      const icon = MF.pixels.itemTexture(content);
      const size = hw * 2.2;
      const y = baseY - size - hw * 0.42 + bob;
      ctx.save();
      ctx.translate(cx - size / 2, y);
      ctx.rotate(Math.sin(t * 0.8) * 0.05);
      ctx.drawImage(icon, 0, 0, 16, 16, 0, 0, size, size);
      ctx.restore();
    } else {
      const tex = MF.pixels.blockTextures(content || { material: 'stone' });
      const cubeSy = baseY - 1.5 * hw + bob; // bottom vertex rests on the slab
      paintCube(ctx, tex, cx, cubeSy, hw);
    }
  }

  function paintBrand(canvas) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    const tex = MF.pixels.blockTextures({ material: 'grass', tint: 'none', seed: 'brand' });
    paintCube(ctx, tex, size / 2, size * 0.36, size * 0.3);
  }

  MF.IsoScene = IsoScene;
  MF.viewCoords = viewCoords;
  MF.icons = { blockCanvas, itemCanvas, contentCanvas, paintShowcase, paintBrand, paintCube };
})(window.MF);
