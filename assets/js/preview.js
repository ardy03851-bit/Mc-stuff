/* ============================================================
   preview.js — the in-browser Minecraft preview
   Generates a small island, registers your blocks into it and
   lets you build on it with touch.
   ============================================================ */
(function (MF) {
  'use strict';
  const { clamp, el, toast, escapeHtml, hexToRgb } = MF.util;

  const N = 16;
  const SKIES = {
    day: { top: '#4b8ede', mid: '#8fc2f2', horizon: '#d8ecff', cloud: 'rgba(255,255,255,0.92)', sun: '#fff8cf', stars: 0, haze: 'rgba(255,255,255,0.35)' },
    dusk: { top: '#2f3f7d', mid: '#b06a8c', horizon: '#f0b174', cloud: 'rgba(255,214,196,0.6)', sun: '#ffd79a', stars: 0.22, haze: 'rgba(255,190,150,0.25)' },
    night: { top: '#04081a', mid: '#0b1533', horizon: '#1b2a4e', cloud: 'rgba(140,160,210,0.24)', sun: '#e9efff', stars: 1, haze: 'rgba(120,150,220,0.14)' }
  };
  const SPLASHES = [
    'Now with your blocks!', 'Touch to place!', 'Also try real Minecraft!',
    'Zero dependencies!', 'Made on iPad!', 'Sneak peek!', 'Pocket sized!',
    'Blocks included!'
  ];

  let appState = null;
  let scene = null;
  let world = null;
  let terrain = null;
  let hotbar = [];
  let selected = 0;
  let tool = 'place';
  let seed = '1337';
  let showcase = true;
  let timeOfDay = 'day';
  let phase = 'title';       // title | loading | world | gallery
  let launched = false;
  let logEntries = [];
  let skyRaf = 0;
  let lastSky = 0;
  let fpsAvg = 0;
  let placedCount = 0;
  let dom = {};
  let resizeObserver = null;
  let worldBuilt = false;
  let gallerySelection = null;
  let gesture = null;
  let pointers = new Map();

  /* ---------------- helpers ---------------- */
  function h2(s) { return MF.pixels.hashString(String(s)); }
  function rngFor(s) { return mulberry32(h2(s) ^ 0x9e3779b9); }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const key = (x, y, z) => x + ',' + y + ',' + z;

  function tintHex(content) {
    const tint = MF.pixels.tintById(content.tint);
    return tint.hex || MF.pixels.materialById(content.material).base;
  }
  function glowStr(content) {
    const c = hexToRgb(tintHex(content));
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',';
  }

  function log(tag, message, kind) {
    logEntries.push({ t: new Date(), tag, message, kind: kind || '' });
    if (logEntries.length > 140) logEntries.shift();
    renderLog();
  }

  function renderLog() {
    if (!dom.log) return;
    const nearBottom = dom.log.scrollHeight - dom.log.scrollTop - dom.log.clientHeight < 40;
    dom.log.innerHTML = logEntries.map((l) => {
      const time = l.t.toLocaleTimeString([], { hour12: false });
      return '<div class="mc-log-line ' + l.kind + '"><span class="t">' + escapeHtml(time) + '</span>' +
        '<span class="tag">' + escapeHtml(l.tag) + '</span><span class="m">' + escapeHtml(l.message) + '</span></div>';
    }).join('');
    if (nearBottom) dom.log.scrollTop = dom.log.scrollHeight;
  }

  function clearLog() {
    logEntries = [];
    renderLog();
  }

  /* ---------------- world ---------------- */
  function makeCell(content, x, y, z, flags) {
    const tex = MF.pixels.blockTextures(content);
    return {
      x, y, z, content,
      tex,
      opaque: !content.transparent,
      alpha: content.transparent ? 0.8 : 1,
      glow: !!content.glow,
      glowColor: glowStr(content),
      placed: !!(flags && flags.placed),
      showcase: !!(flags && flags.showcase)
    };
  }

  function waterCell(x, y, z) {
    const raw = MF.pixels.texture({ id: 'water', base: '#3d8fd8', pattern: 'water' }, 'none', 'pond', 'top');
    const top = MF.pixels.shaded(raw, 0.95);
    return { x, y, z, tex: { top, left: top, right: top }, water: true, opaque: false, alpha: 0.82, glow: false, placed: false };
  }

  function terrainTextures() {
    return {
      grass: MF.pixels.blockTextures({ material: 'grass', tint: 'none', seed: 'terrain_grass' }),
      dirt: MF.pixels.blockTextures({ material: 'dirt', tint: 'none', seed: 'terrain_dirt' }),
      stone: MF.pixels.blockTextures({ material: 'stone', tint: 'none', seed: 'terrain_stone' }),
      sand: MF.pixels.blockTextures({ material: 'sand', tint: 'none', seed: 'terrain_sand' }),
      log: MF.pixels.blockTextures({ material: 'log', tint: 'none', seed: 'terrain_log' }),
      leaves: MF.pixels.blockTextures({ material: 'leaves', tint: 'none', seed: 'terrain_leaves' })
    };
  }

  function makeTerrainCell(name, x, y, z) {
    const t = terrain[name];
    if (!t) return null;
    return {
      x, y, z, tex: t,
      opaque: name !== 'leaves',
      alpha: name === 'leaves' ? 0.94 : 1,
      glow: false, placed: false,
      terrainName: name
    };
  }

  function buildWorld() {
    const cells = new Map();
    const rng = rngFor('world:' + seed);
    terrain = terrainTextures();
    const heights = new Int8Array(N * N);
    const waterMask = new Uint8Array(N * N);
    const used = new Uint8Array(N * N);

    const pond = { x: 10, z: 5, r: 3.0 };

    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const wave = Math.sin((x + 1) * 0.52 + 0.7) * 0.62 +
                     Math.cos((z + 1) * 0.41 + 2.2) * 0.55 +
                     Math.sin((x + z) * 0.27) * 0.36;
        let h = 1 + Math.round(wave + 1.15);
        h = clamp(h, 0, 3);
        const d = Math.hypot(x - pond.x, z - pond.z);
        if (d < pond.r) { h = 0; waterMask[z * N + x] = 1; }
        else if (d < pond.r + 1.7) h = Math.max(h, 2);
        heights[z * N + x] = h;
      }
    }

    function put(cell) {
      if (!cell) return;
      cells.set(key(cell.x, cell.y, cell.z), cell);
    }

    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const h = heights[z * N + x];
        if (waterMask[z * N + x]) {
          put(waterCell(x, 1, z));
          put(makeTerrainCell('sand', x, -1, z));
          put(makeTerrainCell('stone', x, -2, z));
          put(makeTerrainCell('stone', x, -3, z));
        } else {
          put(makeTerrainCell('grass', x, h, z));
          put(makeTerrainCell('dirt', x, h - 1, z));
          if (h - 2 >= -1) put(makeTerrainCell('dirt', x, h - 2, z));
          for (let y = h - 3; y >= -3; y--) put(makeTerrainCell('stone', x, y, z));
        }
      }
    }

    // trees
    const treeSpots = [[3, 3], [12, 12], [4, 11]];
    treeSpots.forEach(([tx, tz], i) => {
      const h = heights[tz * N + tx];
      if (waterMask[tz * N + tx] || h < 1) return;
      if (Math.hypot(tx - pond.x, tz - pond.z) < 5.5) return;
      const trunk = 3 + (i % 2);
      for (let y = 1; y <= trunk; y++) put(makeTerrainCell('log', tx, h + y, tz));
      for (let dy = trunk - 1; dy <= trunk + 1; dy++) {
        const rad = dy === trunk + 1 ? 1 : 2;
        for (let dx = -rad; dx <= rad; dx++) {
          for (let dz = -rad; dz <= rad; dz++) {
            if (dx === 0 && dz === 0 && dy <= trunk) continue;
            if (Math.abs(dx) === rad && Math.abs(dz) === rad) continue;
            const px = tx + dx, pz = tz + dz, py = h + dy;
            if (px < 0 || pz < 0 || px >= N || pz >= N) continue;
            if (cells.has(key(px, py, pz))) continue;
            put(makeTerrainCell('leaves', px, py, pz));
          }
        }
      }
    });

    // showcase your blocks around the pond
    const p = appState.project;
    if (showcase && p.blocks.length) {
      const count = Math.min(p.blocks.length, 8);
      for (let i = 0; i < count; i++) {
        const block = p.blocks[i];
        const a = (i / count) * Math.PI * 2 + 0.4;
        const px = clamp(Math.round(pond.x + Math.cos(a) * 4.6), 1, N - 2);
        const pz = clamp(Math.round(pond.z + Math.sin(a) * 4.4), 1, N - 2);
        const idx = pz * N + px;
        if (waterMask[idx]) continue;
        let h = heights[idx];
        if (h < 2) h = 2;
        const tryY = h + 1;
        if (cells.has(key(px, tryY, pz))) continue;
        put(makeCell(block, px, tryY, pz, { showcase: true }));
        used[idx] = 1;
      }
    }

    const obj = {
      size: N,
      maxY: 8,
      cells,
      get(x, y, z) {
        if (x < 0 || z < 0 || x >= N || z >= N || y < -4 || y > 24) return null;
        return cells.get(key(x, y, z)) || null;
      },
      set(cell) { cells.set(key(cell.x, cell.y, cell.z), cell); },
      remove(x, y, z) { cells.delete(key(x, y, z)); },
      forEachCell(cb) {
        cells.forEach((c) => cb(c.x, c.y, c.z, c));
      },
      heightAt(x, z) { return heights[z * N + x]; },
      count() { return cells.size; }
    };
    return obj;
  }

  /* ---------------- scene ---------------- */
  function ensureScene() {
    if (scene) return;
    scene = new MF.IsoScene(dom.canvas);
    scene.resize(dom.canvas.clientWidth || 640, dom.canvas.clientHeight || 400);
    scene.setWorld(world);
  }

  function resizeAll() {
    if (!scene) return;
    const w = dom.canvas.clientWidth;
    const h = dom.canvas.clientHeight;
    if (!w || !h) return;
    scene.resize(w, h);
    scene.render();
    resizeSky(w, h);
  }

  function renderWorld() {
    if (!scene) return;
    scene.setWorld(world);
    scene.render();
    if (dom.hudCount) dom.hudCount.textContent = placedCount + ' placed';
    if (dom.hudFps) dom.hudFps.textContent = Math.max(1, Math.round(scene.lastRenderMs || 0)) + ' ms';
  }

  /* ---------------- sky ---------------- */
  let skyCanvas = null;
  function resizeSky(w, h) {
    if (!skyCanvas) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    skyCanvas.width = Math.round(w * dpr);
    skyCanvas.height = Math.round(h * dpr);
  }

  function cloudShapes() {
    const rng = rngFor('clouds');
    const list = [];
    for (let i = 0; i < 10; i++) {
      const parts = [];
      const n = 3 + Math.round(rng() * 3);
      for (let j = 0; j < n; j++) {
        parts.push({
          dx: j * 14 - n * 6,
          dy: (rng() - 0.5) * 6,
          w: 12 + rng() * 14,
          h: 6 + rng() * 6
        });
      }
      list.push({ x: rng() * 1000, y: 0.08 + rng() * 0.32, speed: 3 + rng() * 6, parts, scale: 0.6 + rng() * 0.5 });
    }
    return list;
  }
  let CLOUDS = null;
  let STARS = null;

  function drawSky(now) {
    if (!skyCanvas) return;
    const w = skyCanvas.width, h = skyCanvas.height;
    if (!w || !h) return;
    const ctx = skyCanvas.getContext('2d');
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = w / dpr, H = h / dpr;
    const t = now / 1000;
    const pal = SKIES[timeOfDay] || SKIES.day;

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, pal.top);
    g.addColorStop(0.55, pal.mid);
    g.addColorStop(1, pal.horizon);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // stars
    if (pal.stars > 0) {
      if (!STARS) {
        const rng = rngFor('stars');
        STARS = [];
        for (let i = 0; i < 70; i++) STARS.push({ x: rng(), y: rng() * 0.62, s: 1 + Math.round(rng() * 1.4), p: rng() * 6.28 });
      }
      STARS.forEach((s) => {
        const a = (0.35 + 0.65 * Math.abs(Math.sin(t * 0.9 + s.p))) * pal.stars;
        ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
        ctx.fillRect(Math.round(s.x * W), Math.round(s.y * H), s.s, s.s);
      });
    }

    // sun / moon
    const sunX = timeOfDay === 'dusk' ? W * 0.24 : timeOfDay === 'night' ? W * 0.78 : W * 0.76;
    const sunY = timeOfDay === 'dusk' ? H * 0.55 : timeOfDay === 'night' ? H * 0.16 : H * 0.16;
    const sunR = Math.min(W, H) * (timeOfDay === 'night' ? 0.035 : 0.045);
    const halo = ctx.createRadialGradient(sunX, sunY, sunR * 0.4, sunX, sunY, sunR * 4.2);
    halo.addColorStop(0, pal.sun + '66');
    halo.addColorStop(1, pal.sun + '00');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 4.2, 0, Math.PI * 2);
    ctx.fill();
    // blocky sun, exactly like the game
    const sunSize = Math.max(8, Math.round(sunR * 2.1));
    const sx0 = Math.round(sunX - sunSize / 2);
    const sy0 = Math.round(sunY - sunSize / 2);
    ctx.fillStyle = pal.sun;
    ctx.fillRect(sx0, sy0, sunSize, sunSize);
    if (timeOfDay === 'night') {
      ctx.fillStyle = pal.mid;
      ctx.fillRect(sx0 + sunSize * 0.34, sy0, sunSize * 0.66, sunSize);
      ctx.fillRect(sx0, sy0 + sunSize * 0.34, sunSize * 0.34, sunSize * 0.66);
    }

    // soft horizon haze so the floating island sits in atmosphere
    const haze = ctx.createLinearGradient(0, H * 0.58, 0, H);
    haze.addColorStop(0, pal.haze.replace(/[\d.]+\)$/, '0)'));
    haze.addColorStop(0.72, pal.haze);
    haze.addColorStop(1, pal.haze.replace(/[\d.]+\)$/, '0.6)'));
    ctx.fillStyle = haze;
    ctx.fillRect(0, H * 0.58, W, H * 0.42);

    // clouds
    if (!CLOUDS) CLOUDS = cloudShapes();
    CLOUDS.forEach((c) => {
      const scale = Math.min(W, H) / 420 * c.scale;
      const span = W + 340 * scale;
      const cx = ((c.x + t * c.speed) % span) - 170 * scale;
      const cy = c.y * H + Math.sin(t * 0.35 + c.x) * 3;
      c.parts.forEach((p) => {
        ctx.fillStyle = pal.cloud;
        ctx.fillRect(
          Math.round(cx + p.dx * scale),
          Math.round(cy + p.dy * scale),
          Math.round(p.w * scale),
          Math.round(p.h * scale)
        );
      });
      // soft underside
      ctx.fillStyle = timeOfDay === 'night' ? 'rgba(120,150,210,0.10)' : 'rgba(186,208,232,0.55)';
      c.parts.forEach((p) => {
        ctx.fillRect(
          Math.round(cx + p.dx * scale),
          Math.round(cy + p.dy * scale + p.h * scale) - 2,
          Math.round(p.w * scale),
          2
        );
      });
    });
  }

  function skyLoop(now) {
    skyRaf = requestAnimationFrame(skyLoop);
    if (now - lastSky < 42) return;
    const dt = now - lastSky;
    lastSky = now;
    if (dt > 0) fpsAvg = fpsAvg * 0.9 + (1000 / dt) * 0.1;
    // only animate when visible
    if (phase === 'loading' || phase === 'gallery' || phase === 'title' || phase === 'world') {
      if (!dom.screen || dom.screen.offsetParent === null) return;
      drawSky(now);
    }
  }

  /* ---------------- hotbar ---------------- */
  function buildHotbar() {
    const p = appState.project;
    const all = [].concat(p.blocks || [], p.items || []).slice(0, 9);
    hotbar = all;
    if (selected >= hotbar.length) selected = 0;
    if (!dom.hotbar) return;
    dom.hotbar.innerHTML = '';
    hotbar.forEach((content, i) => {
      const slot = el('button', {
        class: 'mc-slot' + (i === selected ? ' is-on' : ''),
        type: 'button',
        role: 'option',
        'aria-label': content.name + ' — ' + (content.kind === 'block' ? 'block' : 'item')
      }, [
        el('span', { class: 'slot-num', text: String(i + 1) })
      ]);
      const icon = MF.icons.contentCanvas(content, 48);
      slot.appendChild(icon);
      slot.addEventListener('click', () => selectSlot(i));
      dom.hotbar.appendChild(slot);
    });
    if (!hotbar.length) {
      dom.hotbar.innerHTML = '<div class="mc-slot mc-slot--empty"></div>';
    }
    updateHudLabel();
    updateGalleryButton();
  }

  function selectSlot(i) {
    selected = i;
    Array.prototype.forEach.call(dom.hotbar.children, (n, idx) => n.classList.toggle('is-on', idx === i));
    updateHudLabel(true);
    MF.util.haptic(6);
  }

  function currentBlock() {
    const c = hotbar[selected];
    if (!c || c.kind !== 'block') return null;
    return c;
  }

  let labelTimer = 0;
  function updateHudLabel(flash) {
    const c = hotbar[selected];
    if (!dom.hudLabel) return;
    dom.hudLabel.textContent = c ? c.name : 'No blocks yet';
    if (flash) {
      dom.hudLabel.classList.add('is-on');
      clearTimeout(labelTimer);
      labelTimer = setTimeout(() => dom.hudLabel.classList.remove('is-on'), 1600);
    } else {
      dom.hudLabel.classList.remove('is-on');
    }
  }

  /* ---------------- layers ---------------- */
  function setPhase(next) {
    phase = next;
    dom.screen.className = 'mc-screen mode-' + next;
    dom.titleLayer.hidden = next !== 'title';
    dom.loadingLayer.hidden = next !== 'loading';
    dom.hud.hidden = next !== 'world';
    dom.galleryLayer.hidden = next !== 'gallery';
    dom.screen.classList.toggle('mode-title', next === 'title');
    if (next !== 'world') {
      if (scene) { scene.highlight = null; scene.render(); }
    }
  }

  function showTitle() {
    setPhase('title');
    if (!worldBuilt) build();
  }

  function launch() {
    if (!worldBuilt) build();
    setPhase('loading');
    dom.progress.style.width = '0%';
    clearLog();
    const p = appState.project;
    const blockCount = (p.blocks || []).length;
    const itemCount = (p.items || []).length;
    const steps = [
      ['Fabric', 'Loading mod ' + p.modid + ' v' + p.version, 10],
      ['Registry', 'Registered ' + blockCount + ' blocks and ' + itemCount + ' items', 26],
      ['Atlas', 'Stitched ' + (blockCount * 2 + itemCount) + ' textures at 16×16', 46],
      ['World', 'Generating island (seed ' + seed + ')', 68],
      ['Render', 'Baking isometric geometry', 86],
      ['Client', 'Ready. Tap a face to build.', 100]
    ];
    let i = 0;
    const tick = () => {
      if (i >= steps.length) {
        delayed(() => {
          launched = true;
          setPhase('world');
          renderWorld();
          dom.hint.classList.remove('is-hidden');
          setTimeout(() => dom.hint.classList.add('is-hidden'), 6500);
          MF.util.haptic(12);
        }, 220);
        return;
      }
      const [tag, msg, pct] = steps[i++];
      log(tag, msg, i === steps.length ? 'ok' : '');
      dom.status.textContent = msg;
      dom.progress.style.width = pct + '%';
      setTimeout(tick, i < 3 ? 230 : 320);
    };
    tick();
  }

  function delayed(fn, ms) { setTimeout(fn, ms); }

  function rebuild(silent) {
    worldBuilt = false;
    build();
    if (!silent) {
      if (phase === 'world') {
        renderWorld();
        log('Reload', 'Preview rebuilt from project', 'ok');
      }
    }
    updateDirtyNote();
  }

  function build() {
    if (!appState) return;
    const t0 = performance.now();
    world = buildWorld();
    terrain = terrain || terrainTextures();
    worldBuilt = true;
    placedCount = 0;
    if (scene) {
      scene.setWorld(world);
      scene.setOrientation(scene.orientation);
    }
    buildHotbar();
    updateTitle();
    if (scene) scene.render();
    const ms = Math.max(1, Math.round(performance.now() - t0));
    if (!logEntries.length) {
      log('ModForge', 'Preview runtime ready in ' + ms + ' ms', 'ok');
    }
  }

  function updateTitle() {
    const p = appState.project;
    dom.chromeMod.textContent = p.name;
    dom.footLeft.textContent = 'Minecraft ' + p.mcVersion;
    dom.footRight.textContent = (p.loader === 'fabric' ? 'Fabric' : 'NeoForge') + ' · ' + p.version;
    dom.splash.textContent = SPLASHES[h2(p.name) % SPLASHES.length];
    dom.winTitle = p.name;
  }

  function updateDirtyNote() {
    const p = appState.project;
    dom.dirtyNote.textContent = 'Preview built from ' + p.name + ' · ' + (p.blocks.length + p.items.length) + ' entries';
  }

  /* ---------------- HUD actions ---------------- */
  function setTool(next) {
    tool = next;
    MF.util.qsa('[data-tool]').forEach((b) => b.classList.toggle('is-on', b.getAttribute('data-tool') === tool));
    dom.inspector.hidden = tool !== 'inspect';
    MF.util.haptic(6);
  }

  function tap(clientX, clientY) {
    if (!scene) return;
    const face = scene.pick(clientX, clientY);
    if (!face) { scene.highlight = null; scene.render(); return; }
    if (tool === 'inspect') {
      const cell = world.get(face.x, face.y, face.z);
      showInspector(face, cell);
      scene.highlight = { x: face.x, y: face.y, z: face.z };
      scene.render();
      return;
    }
    if (tool === 'break') {
      const cell = world.get(face.x, face.y, face.z);
      if (!cell) return;
      if (!cell.placed && !cell.showcase && !cell.water) {
        toast('That part of the island is protected', 'warn');
        return;
      }
      world.remove(face.x, face.y, face.z);
      if (cell.placed) placedCount = Math.max(0, placedCount - 1);
      scene.highlight = null;
      renderWorld();
      log('Player', 'Broke block at ' + face.x + ', ' + face.y + ', ' + face.z);
      MF.util.haptic(10);
      return;
    }

    // place
    const block = currentBlock();
    if (!block) {
      const c = hotbar[selected];
      toast(c ? c.name + ' is an item — items can\'t be placed' : 'Add a block in the builder first', 'warn');
      return;
    }
    let tx = face.x, ty = face.y, tz = face.z;
    if (face.type === 'top') ty += 1;
    else { tx += face.normal[0]; tz += face.normal[2]; }
    if (tx < 0 || tz < 0 || tx >= N || tz >= N || ty > 20) {
      toast('That is as far as this island goes', 'warn');
      return;
    }
    if (world.get(tx, ty, tz)) return;
    const cell = makeCell(block, tx, ty, tz, { placed: true });
    world.set(cell);
    placedCount++;
    scene.highlight = { x: tx, y: ty, z: tz };
    renderWorld();
    log('Player', 'Placed ' + block.slug + ' at ' + tx + ', ' + ty + ', ' + tz);
    MF.util.haptic(8);
  }

  function showInspector(face, cell) {
    const content = cell && cell.content;
    dom.inspectName.textContent = content ? content.name : (cell && cell.terrainName ? MF.util.titleCase(cell.terrainName) : 'Water');
    dom.inspectId.textContent = content
      ? appState.project.modid + ':' + content.slug
      : 'minecraft:' + ((cell && cell.terrainName) || 'water');
    dom.inspectPos.textContent = 'x ' + face.x + '  y ' + face.y + '  z ' + face.z;
    dom.inspector.hidden = false;
  }

  /* ---------------- gallery ---------------- */
  function updateGalleryButton() {
    if (!dom.gallerySub) return;
    const p = appState.project;
    dom.gallerySub.textContent = p.blocks.length + ' blocks · ' + p.items.length + ' items · everything registers on launch.';
  }

  function showGallery() {
    if (!worldBuilt) build();
    setPhase('gallery');
    renderGallery();
    log('Client', 'Opened mod gallery', '');
  }

  function renderGallery() {
    const p = appState.project;
    const all = [].concat(p.blocks || [], p.items || []);
    dom.galleryGrid.innerHTML = '';
    if (!all.length) {
      dom.galleryGrid.innerHTML = '<p class="card-p" style="grid-column:1/-1">No blocks or items yet. Add some in the Build tab.</p>';
      return;
    }
    all.forEach((content) => {
      const item = el('button', { class: 'mc-gallery-item' + (gallerySelection === content.key ? ' is-on' : ''), type: 'button' }, [
        MF.icons.contentCanvas(content, 64),
        el('span', { text: content.name })
      ]);
      item.addEventListener('click', () => {
        gallerySelection = content.key;
        MF.util.qsa('.mc-gallery-item').forEach((n) => n.classList.remove('is-on'));
        item.classList.add('is-on');
        paintGalleryDetail(content);
        MF.util.haptic(6);
      });
      dom.galleryGrid.appendChild(item);
    });
    const first = (gallerySelection && all.find((c) => c.key === gallerySelection)) || all[0];
    paintGalleryDetail(first);
  }

  function paintGalleryDetail(content) {
    if (!content) return;
    const c = dom.galleryCanvas;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    const icon = MF.icons.contentCanvas(content, 160);
    ctx.drawImage(icon, 20, 20, 160, 160);
    dom.galleryName.textContent = content.name;
    dom.galleryId.textContent = appState.project.modid + ':' + content.slug;
    const bits = [];
    bits.push(content.kind === 'block' ? 'Placeable block' : 'Item');
    bits.push(MF.pixels.materialById(content.material).label + ' texture');
    if (content.glow) bits.push('emits light');
    if (content.kind === 'block' && content.tool !== 'none') bits.push(content.tool + ' required');
    if (content.kind === 'item') bits.push('stack of ' + content.stackSize);
    dom.galleryDesc.textContent = (content.tooltip ? content.tooltip + ' — ' : '') + bits.join(' · ');
  }

  /* ---------------- events ---------------- */
  function bindCanvas() {
    const c = dom.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (phase !== 'world') return;
      c.setPointerCapture && c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        gesture = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, pinch: 0 };
      } else if (pointers.size === 2) {
        const p = Array.from(pointers.values());
        gesture = { pinch: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), baseZoom: scene.zoom, moved: 999 };
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (phase !== 'world' || !pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && gesture && gesture.pinch) {
        const p = Array.from(pointers.values());
        const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        scene.setZoom(gesture.baseZoom * (d / gesture.pinch));
        return;
      }
      if (gesture && pointers.size === 1) {
        gesture.moved = Math.max(gesture.moved, Math.abs(e.clientX - gesture.x) + Math.abs(e.clientY - gesture.y));
      }
    });
    const end = (e) => {
      if (!pointers.has(e.pointerId)) return;
      const wasSingle = pointers.size === 1;
      pointers.delete(e.pointerId);
      if (phase !== 'world' || !gesture) return;
      const dx = e.clientX - gesture.x;
      if (wasSingle && gesture.moved < 12 && performance.now() - gesture.t < 420) {
        tap(e.clientX, e.clientY);
      } else if (wasSingle && gesture.moved >= 30) {
        scene.rotate(dx > 0 ? 1 : -1);
        MF.util.haptic(6);
      }
      if (pointers.size === 0) gesture = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => {
      if (phase !== 'world') return;
      e.preventDefault();
      scene.setZoom(scene.zoom * (e.deltaY > 0 ? 0.92 : 1.08));
    }, { passive: false });
  }

  function setTime(next) {
    timeOfDay = next;
    MF.util.qsa('#seg-time .seg-btn').forEach((b) => b.classList.toggle('is-on', b.getAttribute('data-val') === next));
    drawSky(performance.now());
  }

  function regenerateWorld(newSeed) {
    seed = String(newSeed || seed).slice(0, 12) || '1337';
    if (dom.seedInput) dom.seedInput.value = seed;
    log('World', 'Regenerating with seed ' + seed, '');
    rebuild(false);
    toast('New world · seed ' + seed, 'ok');
  }

  function previewOptionsSheet() {
    const body = el('div');
    const seedRow = el('label', { class: 'field' }, [
      el('span', { class: 'field-label', text: 'World seed' }),
      el('input', { class: 'input input--mono', type: 'text', value: seed, inputmode: 'numeric', id: 'sheet-seed' })
    ]);
    const timeRow = el('div', { class: 'field' }, [
      el('span', { class: 'field-label', text: 'Time of day' }),
      el('div', { class: 'seg seg--sm' }, ['day', 'dusk', 'night'].map((v) =>
        el('button', {
          class: 'seg-btn' + (timeOfDay === v ? ' is-on' : ''), type: 'button', text: v,
          onclick: (ev) => {
            setTime(v);
            MF.util.qsa('.seg-btn', ev.target.parentNode).forEach((b) => b.classList.remove('is-on'));
            ev.target.classList.add('is-on');
          }
        })
      ))
    ]);
    const showcaseRow = el('div', { class: 'toggle-row' }, [
      el('span', { class: 'tr-text' }, [el('strong', { text: 'Showcase your blocks' }), el('em', { text: 'Ring the pond with your blocks on launch' })]),
      el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(showcase), onclick: (ev) => {
        showcase = !showcase;
        ev.currentTarget.setAttribute('aria-checked', String(showcase));
        if (dom.showcaseToggle) dom.showcaseToggle.setAttribute('aria-checked', String(showcase));
        rebuild(false);
      } }, el('span'))
    ]);
    body.appendChild(seedRow);
    body.appendChild(timeRow);
    body.appendChild(el('div', { class: 'toggle-list', style: { marginTop: '14px' } }, showcaseRow));
    const foot = [
      el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => MF.sheet.close() }),
      el('button', { class: 'btn btn-primary', type: 'button', text: 'Apply & relaunch', onclick: () => {
        const s = MF.util.qs('#sheet-seed').value.trim() || '1337';
        MF.sheet.close();
        regenerateWorld(s);
        if (phase === 'world') launch(); else showTitle();
      } })
    ];
    MF.sheet.open({ title: 'Preview options', body, footer: foot });
  }

  /* ---------------- init ---------------- */
  function init(state) {
    appState = state;
    dom = {
      screen: MF.util.qs('#mc-screen'),
      canvas: MF.util.qs('#mc-canvas'),
      sky: MF.util.qs('#mc-sky'),
      titleLayer: MF.util.qs('#mc-title-layer'),
      loadingLayer: MF.util.qs('#mc-loading-layer'),
      hud: MF.util.qs('#mc-hud'),
      galleryLayer: MF.util.qs('#mc-gallery-layer'),
      progress: MF.util.qs('#mc-progress'),
      status: MF.util.qs('#mc-load-status'),
      log: MF.util.qs('#mc-log'),
      console: MF.util.qs('#mc-console'),
      hint: MF.util.qs('#mc-hint'),
      hudCount: MF.util.qs('#mc-hud-count'),
      hudFps: MF.util.qs('#mc-hud-fps'),
      hudLabel: MF.util.qs('#mc-item-label'),
      hotbar: MF.util.qs('#mc-hotbar'),
      inspector: MF.util.qs('#mc-inspector'),
      inspectName: MF.util.qs('#mc-inspect-name'),
      inspectId: MF.util.qs('#mc-inspect-id'),
      inspectPos: MF.util.qs('#mc-inspect-pos'),
      chromeMod: MF.util.qs('#mc-chrome-mod'),
      footLeft: MF.util.qs('#mc-foot-left'),
      footRight: MF.util.qs('#mc-foot-right'),
      splash: MF.util.qs('#mc-splash'),
      galleryGrid: MF.util.qs('#mc-gallery-grid'),
      galleryCanvas: MF.util.qs('#mc-gallery-canvas'),
      galleryName: MF.util.qs('#mc-gallery-name'),
      galleryId: MF.util.qs('#mc-gallery-id'),
      galleryDesc: MF.util.qs('#mc-gallery-desc'),
      gallerySub: MF.util.qs('#mc-gallery-sub'),
      seedInput: MF.util.qs('#opt-seed'),
      showcaseToggle: MF.util.qs('#opt-showcase'),
      dirtyNote: MF.util.qs('#preview-dirty-note'),
      screen: MF.util.qs('#mc-screen')
    };
    skyCanvas = dom.sky;

    ensureScene();
    bindCanvas();
    drawLogo(MF.util.qs('#mc-logo'));
    drawLogo(MF.util.qs('#mc-loading-logo'));

    // buttons
    dom.playBtn = MF.util.qs('#mc-play');
    dom.playBtn.addEventListener('click', launch);
    MF.util.qs('#mc-gallery').addEventListener('click', showGallery);
    MF.util.qs('#mc-options').addEventListener('click', previewOptionsSheet);
    MF.util.qs('#mc-gallery-close').addEventListener('click', showTitle);
    MF.util.qs('#mc-pause').addEventListener('click', () => {
      setPhase('title');
      log('Client', 'Paused preview', '');
    });
    MF.util.qs('#mc-rot-l').addEventListener('click', () => scene.rotate(-1));
    MF.util.qs('#mc-rot-r').addEventListener('click', () => scene.rotate(1));
    MF.util.qs('#mc-zoom-in').addEventListener('click', () => scene.setZoom(scene.zoom * 1.12));
    MF.util.qs('#mc-zoom-out').addEventListener('click', () => scene.setZoom(scene.zoom * 0.89));
    MF.util.qsa('[data-tool]').forEach((b) => b.addEventListener('click', () => {
      setTool(b.getAttribute('data-tool'));
      if (b.getAttribute('data-tool') === 'inspect') {
        dom.inspector.hidden = true;
      }
    }));

    const consoleToggle = MF.util.qs('#btn-console-toggle');
    const setConsole = (on) => {
      dom.console.hidden = !on;
      consoleToggle.setAttribute('aria-pressed', String(on));
      setTimeout(resizeAll, 30);
    };
    consoleToggle.addEventListener('click', () => setConsole(dom.console.hidden));
    MF.util.qs('#btn-hide-log').addEventListener('click', () => setConsole(false));
    MF.util.qs('#btn-clear-log').addEventListener('click', clearLog);

    MF.util.qs('#btn-preview-full').addEventListener('click', () => {
      const win = MF.util.qs('#mc-window');
      const on = !win.classList.contains('is-fullscreen');
      win.classList.toggle('is-fullscreen', on);
      setTimeout(resizeAll, 40);
    });
    MF.util.qs('#btn-reload-preview').addEventListener('click', () => {
      rebuild(false);
      launch();
    });
    MF.util.qs('#btn-reseed').addEventListener('click', () => {
      regenerateWorld(dom.seedInput.value.trim() || '1337');
    });
    dom.showcaseToggle.addEventListener('click', () => {
      showcase = !showcase;
      dom.showcaseToggle.setAttribute('aria-checked', String(showcase));
      rebuild(false);
    });
    MF.util.qsa('#seg-time .seg-btn').forEach((b) => b.addEventListener('click', () => {
      MF.util.qsa('#seg-time .seg-btn').forEach((n) => n.classList.remove('is-on'));
      b.classList.add('is-on');
      setTime(b.getAttribute('data-val'));
    }));

    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => resizeAll());
      resizeObserver.observe(dom.screen);
    }
    build();
    showTitle();
    drawSky(performance.now());
    skyRaf = requestAnimationFrame(skyLoop);
    setTimeout(resizeAll, 60);
    log('ModForge', 'Preview runtime booted', 'ok');
  }

  function drawLogo(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    const FONT = {
      M: ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
      I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
      N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
      E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
      C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
      R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
      A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
      F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
      T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100']
    };
    const word = 'MINECRAFT';
    const glyphW = 5, glyphH = 7, gap = 1;
    const cols = word.length * (glyphW + gap) - gap;
    const px = Math.floor(Math.min((W - 24) / cols, (H - 60) / glyphH));
    const totalW = cols * px;
    const startX = Math.round((W - totalW) / 2);
    const startY = Math.round((H - glyphH * px) / 2 - 6);

    function drawWord(dx, dy, fill, offset) {
      for (let li = 0; li < word.length; li++) {
        const g = FONT[word[li]];
        const gx = startX + li * (glyphW + gap) * px + dx;
        for (let row = 0; row < glyphH; row++) {
          for (let col = 0; col < glyphW; col++) {
            if (g[row][col] !== '1') continue;
            const x = gx + col * px;
            const y = startY + row * px + dy;
            ctx.fillStyle = fill;
            ctx.fillRect(x + offset, y + offset, px, px);
            // bevel
            if (row === 0) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + offset, y + offset, px, Math.max(2, px * 0.18)); }
            if (row === glyphH - 1) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x + offset, y + offset + px - Math.max(2, px * 0.2), px, Math.max(2, px * 0.2)); }
          }
        }
      }
    }
    // shadow + body
    drawWord(0, 0, 'rgba(6,26,12,0.85)', px * 0.22);
    drawWord(0, 0, 'rgba(28,84,46,0.95)', 0);
    drawWord(0, 0, '#5ec97a', 0);
    // subtle top highlight pass
    ctx.globalCompositeOperation = 'source-atop';
    const grad = ctx.createLinearGradient(0, startY, 0, startY + glyphH * px);
    grad.addColorStop(0, 'rgba(200,255,210,0.45)');
    grad.addColorStop(0.5, 'rgba(120,230,150,0.05)');
    grad.addColorStop(1, 'rgba(10,60,30,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------- public ---------------- */
  function onShow() {
    setTimeout(resizeAll, 30);
    if (!worldBuilt) build();
    if (scene && phase === 'world') scene.render();
  }

  MF.preview = {
    init,
    onShow,
    launch,
    showTitle,
    showGallery,
    rebuild,
    markStale() { updateDirtyNote(); },
    stats() {
      if (!scene) return null;
      return { w: scene.cssW, h: scene.cssH, hw: scene.hw, ox: scene.origin.x, oy: scene.origin.y, faces: scene.faces.length, phase };
    },
    getPhase() { return phase; }
  };
})(window.MF);
