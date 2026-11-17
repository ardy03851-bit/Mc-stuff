/* ============================================================
   build.js — form, content cards, sheets, live gallery
   ============================================================ */
(function (MF) {
  'use strict';
  const { qs, qsa, el, escapeHtml, toast, clamp, snake } = MF.util;

  let state = null;
  let hooks = {};
  let galleryRaf = 0;
  let galleryStart = 0;
  let selectedKey = null;
  let editing = null;

  /* ---------------- init ---------------- */
  function init(appState, callbacks) {
    state = appState;
    hooks = callbacks || {};
    bindFields();
    bindButtons();
    if (state.ui && state.ui.selectedContent) selectedKey = state.ui.selectedContent;
    refresh();
    galleryStart = performance.now();
    startGallery();
  }

  function project() { return state.project; }

  function onShow() { refresh(); startGallery(); }
  function onHide() { stopGallery(); }

  function startGallery() {
    if (galleryRaf) return;
    galleryStart = galleryStart || performance.now();
    const loop = (now) => {
      galleryRaf = requestAnimationFrame(loop);
      const canvas = qs('#gallery-canvas');
      if (!canvas || !canvas.clientWidth) return;
      const view = qs('#view-build');
      if (!view || !view.classList.contains('is-on')) return;
      const content = currentSelection();
      MF.icons.paintShowcase(canvas, content, now - galleryStart);
    };
    galleryRaf = requestAnimationFrame(loop);
  }
  function stopGallery() {
    if (galleryRaf) cancelAnimationFrame(galleryRaf);
    galleryRaf = 0;
  }

  /* ---------------- fields ---------------- */
  function bindFields() {
    const p = project();
    const bind = (id, key, opts) => {
      const input = qs(id);
      if (!input) return;
      input.value = p[key] || '';
      input.addEventListener('input', () => {
        let value = input.value;
        if (opts && opts.transform) value = opts.transform(value);
        p[key] = value;
        if (key === 'name') {
          if (!p.modidTouched) {
            const next = MF.project.normalize({ modid: snake(value) || 'my_mod' });
            p.modid = next.modid;
            const mid = qs('#f-modid');
            if (mid && document.activeElement !== mid) mid.value = p.modid;
          }
          if (!p.pkgTouched) {
            p.pkg = 'com.example.' + (snake(value) || 'my_mod');
            const pf = qs('#f-package');
            if (pf && document.activeElement !== pf) pf.value = p.pkg;
          }
        }
        if (key === 'pkg') p.pkgTouched = true;
        changed();
      });
      if (opts && opts.onBlur) input.addEventListener('blur', opts.onBlur);
    };

    bind('#f-name', 'name');
    bind('#f-version', 'version');
    bind('#f-author', 'author');
    bind('#f-desc', 'description');

    const modid = qs('#f-modid');
    modid.value = p.modid;
    modid.addEventListener('input', () => {
      p.modid = snake(modid.value) || 'my_mod';
      if (modid.value !== p.modid) modid.value = p.modid;
      p.modidTouched = true;
      changed();
    });

    const pkg = qs('#f-package');
    pkg.value = p.pkg;
    pkg.addEventListener('input', () => {
      p.pkg = pkg.value.replace(/[^a-zA-Z0-9_.]/g, '');
      p.pkgTouched = true;
      changed();
    });

    bindSeg('#seg-mc', (val) => { p.mcVersion = val; changed(); }, () => p.mcVersion);
    bindSeg('#seg-loader', (val) => { p.loader = val; changed(); }, () => p.loader);
  }

  function bindSeg(sel, onPick, getVal) {
    const seg = qs(sel);
    if (!seg) return;
    const set = () => {
      const val = getVal();
      qsa('.seg-btn', seg).forEach((b) => b.classList.toggle('is-on', b.getAttribute('data-val') === val));
    };
    qsa('.seg-btn', seg).forEach((b) => {
      b.addEventListener('click', () => {
        onPick(b.getAttribute('data-val'));
        set();
        MF.util.haptic(6);
      });
    });
    set();
  }

  function syncFields() {
    const p = project();
    const setVal = (id, value) => {
      const input = qs(id);
      if (input && document.activeElement !== input) input.value = value;
    };
    setVal('#f-name', p.name);
    setVal('#f-modid', p.modid);
    setVal('#f-version', p.version);
    setVal('#f-author', p.author);
    setVal('#f-desc', p.description);
    setVal('#f-package', p.pkg);
    qsa('#seg-mc .seg-btn').forEach((b) => b.classList.toggle('is-on', b.getAttribute('data-val') === p.mcVersion));
    qsa('#seg-loader .seg-btn').forEach((b) => b.classList.toggle('is-on', b.getAttribute('data-val') === p.loader));
  }

  function changed() {
    MF.project.normalize(project());
    if (hooks.onChange) hooks.onChange();
  }

  /* ---------------- buttons ---------------- */
  function bindButtons() {
    qsa('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => openContentSheet(btn.getAttribute('data-add'), null));
    });
    const gen = qs('#btn-generate');
    if (gen) gen.addEventListener('click', () => {
      if (hooks.onGenerate) hooks.onGenerate();
      refresh();
    });
    const jump = qs('#btn-jump-code');
    if (jump) jump.addEventListener('click', () => hooks.onNavigate && hooks.onNavigate('code'));
    const exp = qs('#btn-open-export');
    if (exp) exp.addEventListener('click', () => hooks.onNavigate && hooks.onNavigate('export'));
    const world = qs('#btn-open-world');
    if (world) world.addEventListener('click', () => hooks.onOpenWorld && hooks.onOpenWorld());
  }

  /* ---------------- content list ---------------- */
  function allContent() { return [].concat(project().blocks || [], project().items || []); }

  function currentSelection() {
    const all = allContent();
    if (!all.length) return null;
    let found = all.find((c) => c.key === selectedKey);
    if (!found) { found = all[0]; selectedKey = found.key; }
    return found;
  }

  function select(key) {
    selectedKey = key;
    if (state.ui) state.ui.selectedContent = key;
    refreshList();
    refreshStrip();
    paintCaption();
    if (hooks.onSelectContent) hooks.onSelectContent(key);
  }

  function refresh() {
    syncFields();
    refreshList();
    refreshStrip();
    paintCaption();
    refreshOutput();
    if (!selectedKey && allContent().length) selectedKey = allContent()[0].key;
  }

  function refreshList() {
    const host = qs('#content-list');
    if (!host) return;
    host.innerHTML = '';
    const all = allContent();
    const count = qs('#content-count');
    if (count) count.textContent = all.length + (all.length === 1 ? ' registered' : ' registered');

    if (!all.length) {
      host.appendChild(el('div', { class: 'empty-state', html: '<strong>Nothing registered yet</strong>Add a block or an item to start your mod.' }));
      return;
    }
    const sel = currentSelection();
    all.forEach((content) => {
      const row = el('button', {
        class: 'content-row' + (sel && content.key === sel.key ? ' is-selected' : ''),
        type: 'button'
      });
      const thumb = el('span', { class: 'thumb' });
      thumb.appendChild(MF.icons.contentCanvas(content, 46));
      const info = el('span', { class: 'content-info' }, [
        el('strong', { text: content.name }),
        el('em', { text: project().modid + ':' + content.slug })
      ]);
      const tags = el('span', { class: 'content-tags' }, [
        el('span', { class: 'tag' + (content.kind === 'item' ? ' tag--item' : ''), text: content.kind }),
        content.glow ? el('span', { class: 'tag tag--glow', text: 'glow' }) : null
      ]);
      row.appendChild(thumb);
      row.appendChild(info);
      row.appendChild(tags);
      row.appendChild(el('span', { class: 'chev' }, MF.util.svgIcon('i-chevron')));
      row.addEventListener('click', () => {
        select(content.key);
        openContentSheet(content.kind, content);
      });
      host.appendChild(row);
    });
  }

  function refreshStrip() {
    const strip = qs('#gallery-strip');
    if (!strip) return;
    strip.innerHTML = '';
    const all = allContent();
    const sel = currentSelection();
    all.forEach((content) => {
      const b = el('button', {
        class: 'strip-item' + (sel && sel.key === content.key ? ' is-on' : ''),
        type: 'button',
        title: content.name,
        'aria-label': content.name
      });
      b.appendChild(MF.icons.contentCanvas(content, 40));
      b.addEventListener('click', () => select(content.key));
      strip.appendChild(b);
    });
  }

  function paintCaption() {
    const content = currentSelection();
    const name = qs('#gallery-name');
    const id = qs('#gallery-id');
    if (!name || !id) return;
    if (!content) {
      name.textContent = 'No content yet';
      id.textContent = 'Add a block to preview it';
      return;
    }
    name.textContent = content.name;
    id.textContent = project().modid + ':' + content.slug;
  }

  function refreshOutput() {
    const host = qs('#output-list');
    const countEl = qs('#output-count');
    if (!host) return;
    const files = state.files || [];
    if (countEl) countEl.textContent = files.length + ' files';
    const preview = files.filter((f) => f.lang === 'java' || f.lang === 'png').slice(0, 6);
    const rest = files.filter((f) => preview.indexOf(f) < 0).slice(0, 6);
    host.innerHTML = '';
    preview.concat(rest).forEach((f) => {
      const name = f.path.split('/').pop();
      const dir = f.path.slice(0, f.path.length - name.length - 1);
      host.appendChild(el('li', { class: 'output-item', title: f.path }, [
        MF.util.svgIcon(f.lang === 'png' ? 'i-image' : 'i-file'),
        el('span', { text: name }),
        el('em', { text: f.lang })
      ]));
      host.lastChild.setAttribute('aria-label', dir);
    });
  }

  /* ---------------- content editor sheet ---------------- */
  function openContentSheet(kind, existing) {
    const isNew = !existing;
    const draft = isNew ? MF.project.contentDefaults(kind) : JSON.parse(JSON.stringify(existing));
    if (isNew) {
      draft.name = kind === 'item' ? 'New Item' : 'New Block';
      draft.key = MF.util.uid(kind === 'item' ? 'itm' : 'blk');
      draft.slug = MF.project.uniqueSlug(project(), draft.name);
      draft.seed = draft.slug;
    }
    editing = { draft, isNew };
    selectedKey = draft.key;

    const body = el('div');
    const preview = el('div', { class: 'preview-inline' });
    const pcanvas = el('canvas', { width: 192, height: 192 });
    preview.appendChild(pcanvas);

    const nameField = el('label', { class: 'field' }, [
      el('span', { class: 'field-label', text: 'Display name' }),
      el('input', { class: 'input', type: 'text', value: draft.name, autocapitalize: 'words', spellcheck: 'false', maxlength: '40' })
    ]);
    const nameInput = nameField.querySelector('input');
    const slugCode = el('code', { id: 'slug-preview', style: { color: 'var(--green)', fontSize: '11.5px' } });
    const idLine = el('div', { class: 'field-label', style: { marginTop: '-2px' } }, [
      el('span', { class: 'opt', text: 'in-game id' }),
      slugCode
    ]);
    const heroRow = el('div', { class: 'sheet-hero' }, [
      el('div', { class: 'sheet-hero-fields' }, [nameField, idLine]),
      preview
    ]);

    body.appendChild(heroRow);

    if (kind === 'block') {
      const hardRow = el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'Hardness' }),
        el('div', { class: 'range-row' }, [
          el('input', { type: 'range', min: '0.1', max: '20', step: '0.1', value: String(draft.hardness || 2) }),
          el('span', { class: 'range-val', text: Number(draft.hardness || 2).toFixed(1) })
        ])
      ]);
      const range = hardRow.querySelector('input');
      const rangeVal = hardRow.querySelector('.range-val');
      range.addEventListener('input', () => {
        draft.hardness = parseFloat(range.value);
        rangeVal.textContent = draft.hardness.toFixed(1);
        paintPreview();
      });
      body.appendChild(hardRow);

      const toolField = el('label', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'Required tool' }),
        el('select', { class: 'input' }, MF.project.TOOLS.map((t) =>
          el('option', { value: t.id, text: t.label, selected: draft.tool === t.id })
        ))
      ]);
      toolField.querySelector('select').addEventListener('change', (e) => { draft.tool = e.target.value; });
      body.appendChild(toolField);
    } else {
      const shapeField = el('label', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'Sprite shape' }),
        el('select', { class: 'input' }, MF.pixels.ITEM_SHAPES.map((s) =>
          el('option', { value: s.id, text: s.label, selected: draft.shape === s.id })
        ))
      ]);
      shapeField.querySelector('select').addEventListener('change', (e) => { draft.shape = e.target.value; paintPreview(); });
      body.appendChild(shapeField);

      const stackField = el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'Stack size' }),
        el('div', { class: 'range-row' }, [
          el('input', { type: 'range', min: '1', max: '64', step: '1', value: String(draft.stackSize || 64) }),
          el('span', { class: 'range-val', text: String(draft.stackSize || 64) })
        ])
      ]);
      const srange = stackField.querySelector('input');
      const sval = stackField.querySelector('.range-val');
      srange.addEventListener('input', () => { draft.stackSize = parseInt(srange.value, 10); sval.textContent = srange.value; });
      body.appendChild(stackField);
    }

    // materials
    body.appendChild(el('div', { class: 'picker-label' }, ['Texture', el('span', { text: 'procedural 16×16' })]));
    const matGrid = el('div', { class: 'material-grid' });
    MF.pixels.MATERIALS.forEach((mat) => {
      const btn = el('button', {
        class: 'mat-btn' + (draft.material === mat.id ? ' is-on' : ''),
        type: 'button',
        'data-mat': mat.id,
        title: mat.label
      });
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 40; thumbCanvas.height = 40;
      const tctx = thumbCanvas.getContext('2d');
      tctx.imageSmoothingEnabled = false;
      const tex = MF.pixels.texture(mat, draft.tint, draft.slug || 'preview', mat.pattern === 'grass' || mat.pattern === 'log' ? 'side' : 'top');
      tctx.drawImage(tex, 0, 0, 16, 16, 0, 0, 40, 40);
      btn.appendChild(thumbCanvas);
      btn.appendChild(el('span', { text: mat.label }));
      btn.addEventListener('click', () => {
        draft.material = mat.id;
        qsa('.mat-btn', matGrid).forEach((n) => n.classList.toggle('is-on', n === btn));
        paintPreview();
      });
      matGrid.appendChild(btn);
    });
    body.appendChild(matGrid);

    // tints
    body.appendChild(el('div', { class: 'picker-label' }, ['Tint', el('span', { text: 'recolours the palette' })]));
    const tintGrid = el('div', { class: 'tint-grid' });
    MF.pixels.TINTS.forEach((tint) => {
      const b = el('button', {
        class: 'tint-btn' + (draft.tint === tint.id ? ' is-on' : '') + (tint.hex ? '' : ' is-none'),
        type: 'button',
        title: tint.label,
        'aria-label': tint.label
      });
      if (tint.hex) b.style.background = tint.hex;
      b.addEventListener('click', () => {
        draft.tint = tint.id;
        qsa('.tint-btn', tintGrid).forEach((n) => n.classList.toggle('is-on', n === b));
        paintPreview();
        refreshMaterialThumbs(matGrid);
      });
      tintGrid.appendChild(b);
    });
    body.appendChild(tintGrid);

    // toggles
    const toggles = el('div', { class: 'toggle-list' });
    const glowRow = el('div', { class: 'toggle-row' }, [
      el('span', { class: 'tr-text' }, [el('strong', { text: 'Emits light' }), el('em', { text: 'adds luminance in game + a glow in preview' })]),
      el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!draft.glow) })
    ]);
    const glowSwitch = glowRow.querySelector('.switch');
    glowSwitch.addEventListener('click', () => {
      draft.glow = !draft.glow;
      glowSwitch.setAttribute('aria-checked', String(draft.glow));
      paintPreview();
    });
    toggles.appendChild(glowRow);

    if (kind === 'block') {
      const tRow = el('div', { class: 'toggle-row' }, [
        el('span', { class: 'tr-text' }, [el('strong', { text: 'Transparent' }), el('em', { text: 'non-opaque, like glass' })]),
        el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!draft.transparent) })
      ]);
      const sw = tRow.querySelector('.switch');
      sw.addEventListener('click', () => {
        draft.transparent = !draft.transparent;
        sw.setAttribute('aria-checked', String(draft.transparent));
      });
      toggles.appendChild(tRow);
    }
    body.appendChild(toggles);

    const tipField = el('label', { class: 'field' }, [
      el('span', { class: 'field-label', text: 'Tooltip', html: '<span class="opt">shown on hover in game</span>' }),
      el('input', { class: 'input', type: 'text', value: draft.tooltip || '', maxlength: '120', placeholder: 'A shard of pure green light.' })
    ]);
    tipField.querySelector('input').addEventListener('input', (e) => { draft.tooltip = e.target.value; });
    body.appendChild(tipField);

    function refreshSlug() {
      draft.slug = MF.project.uniqueSlug(project(), snake(draft.name) || 'entry', draft.key);
      draft.seed = draft.slug;
      slugCode.textContent = project().modid + ':' + draft.slug;
    }

    function refreshMaterialThumbs(grid) {
      qsa('.mat-btn', grid).forEach((b) => {
        const mat = MF.pixels.materialById(b.getAttribute('data-mat'));
        const c = b.querySelector('canvas');
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        const tex = MF.pixels.texture(mat, draft.tint, draft.slug || 'preview', (mat.pattern === 'grass' || mat.pattern === 'log') ? 'side' : 'top');
        ctx.clearRect(0, 0, 40, 40);
        ctx.drawImage(tex, 0, 0, 16, 16, 0, 0, 40, 40);
      });
    }

    function paintPreview() {
      const ctx = pcanvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, 192, 192);
      ctx.imageSmoothingEnabled = false;
      const icon = MF.icons.contentCanvas(draft, 96);
      ctx.drawImage(icon, 48, 48, 96, 96);
      if (draft.glow) {
        const g = ctx.createRadialGradient(96, 96, 10, 96, 96, 70);
        g.addColorStop(0, 'rgba(242,196,92,0.22)');
        g.addColorStop(1, 'rgba(242,196,92,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 192, 192);
      }
    }

    nameInput.addEventListener('input', () => {
      draft.name = nameInput.value;
      refreshSlug();
      paintPreview();
    });

    refreshSlug();
    paintPreview();

    const foot = [];
    if (!isNew) {
      foot.push(el('button', {
        class: 'btn btn-danger', type: 'button', text: 'Delete', onclick: () => {
          MF.sheet.close();
          MF.project.removeContent(project(), draft.key);
          selectedKey = null;
          if (hooks.onChange) hooks.onChange();
          refresh();
          toast('Removed ' + draft.name, 'warn');
        }
      }));
    }
    foot.push(el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => MF.sheet.close() }));
    foot.push(el('button', {
      class: 'btn btn-primary', type: 'button', text: isNew ? 'Add to mod' : 'Save changes', onclick: () => {
        const name = nameInput.value.trim();
        if (!name) { toast('Give it a name first', 'warn'); return; }
        draft.name = name.slice(0, 40);
        draft.slug = MF.project.uniqueSlug(project(), snake(draft.name), draft.key);
        draft.seed = draft.slug;
        draft.tooltip = (draft.tooltip || '').slice(0, 120);
        if (isNew) {
          if (kind === 'block') project().blocks.push(draft);
          else project().items.push(draft);
        } else {
          const target = MF.project.byKey(project(), draft.key);
          if (target) Object.assign(target, draft);
        }
        MF.project.normalize(project());
        selectedKey = draft.key;
        if (state.ui) state.ui.selectedContent = draft.key;
        MF.sheet.close();
        toast((isNew ? 'Added ' : 'Saved ') + draft.name, 'ok');
        MF.util.haptic(10);
        if (hooks.onChange) hooks.onChange();
        refresh();
      }
    }));

    MF.sheet.open({ title: isNew ? 'New ' + kind : 'Edit ' + kind, body, footer: foot });
  }

  MF.build = { init, refresh, onShow, onHide, select };
})(window.MF);
