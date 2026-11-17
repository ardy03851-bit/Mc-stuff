/* ============================================================
   app.js — boot, navigation, autosave, export
   ============================================================ */
(function (MF) {
  'use strict';
  const { qs, qsa, el, escapeHtml, toast } = MF.util;

  let state = null;
  let saveTimer = 0;
  let regenTimer = 0;
  let currentView = 'build';
  let lastReport = null;

  /* ---------------- boot ---------------- */
  function boot() {
    const saved = MF.store.load();
    if (saved && saved.project) {
      state = {
        project: MF.project.normalize(saved.project),
        files: Array.isArray(saved.files) ? saved.files : [],
        ui: Object.assign({ view: 'build', selectedContent: null, activeFile: null }, saved.ui || {}),
        updatedAt: saved.updatedAt || Date.now()
      };
    } else {
      state = {
        project: MF.project.defaultProject(),
        files: [],
        ui: { view: 'build', selectedContent: null, activeFile: null },
        updatedAt: Date.now()
      };
    }

    const report = regenerate({ force: false });
    if (state.ui.activeFile && !state.files.some((f) => f.path === state.ui.activeFile)) state.ui.activeFile = null;

    MF.icons.paintBrand(qs('#brand-cube'));
    MF.build.init(state, {
      onChange: onProjectChange,
      onGenerate: manualGenerate,
      onNavigate: setView,
      onOpenWorld: openWorld,
      onSelectContent: () => persist()
    });
    MF.editor.init(state, {
      onChange: onFileChange,
      onSave: onFileSave,
      onRegenerate: regenFromEditor,
      onRevert: revertFile
    });
    MF.preview.init(state);
    MF.play.bind();
    MF.play.render(qs('#play-routes-preview'), { compact: true });
    MF.play.render(qs('#play-routes-export'), {});

    bindChrome();
    bindGlobal();
    updatePill();
    updateSaveState('saved');
    initTheme();
    setView(state.ui.view || 'build', true);

    if (!saved) {
      setTimeout(() => toast('Welcome! Build a block, then install it in the real game.', 'info'), 700);
    }
    console.log('[ModForge] ready —', report.added, 'files generated');
  }

  function initTheme() {
    const meta = qs('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#0b0f14');
  }

  /* ---------------- generation ---------------- */
  function regenerate(opts) {
    opts = opts || {};
    const previous = new Map((state.files || []).map((f) => [f.path, f]));
    const result = MF.generator.build(state.project);
    const next = [];
    let kept = 0, updated = 0, added = 0;

    result.files.forEach((f) => {
      const old = previous.get(f.path);
      if (old) {
        if (old.modified && !opts.force) {
          next.push(Object.assign({}, old, { generated: true }));
          kept++;
        } else {
          next.push(Object.assign({}, f, { modified: false, generated: true }));
          updated++;
        }
        previous.delete(f.path);
      } else {
        next.push(Object.assign({}, f, { modified: false, generated: true }));
        added++;
      }
    });

    previous.forEach((f) => {
      if (f.modified || f.generated === false) { next.push(f); kept++; }
    });

    next.sort((a, b) => a.path.localeCompare(b.path));
    state.files = next;
    state.stats = result.stats;
    state.updatedAt = Date.now();
    lastReport = { added, updated, kept, stats: result.stats };
    return lastReport;
  }

  function scheduleRegenerate(delay) {
    clearTimeout(regenTimer);
    regenTimer = setTimeout(() => {
      const report = regenerate();
      if (MF.build) MF.build.refresh();
      if (MF.editor) MF.editor.refresh();
      if (currentView === 'export') renderExport();
      persist();
      console.log('[ModForge] regenerated', report);
    }, delay === undefined ? 550 : delay);
  }

  function manualGenerate() {
    const report = regenerate();
    if (MF.editor) MF.editor.refresh();
    renderExport();
    persist(true);
    toast('Generated ' + report.stats.total + ' files' + (report.kept ? ' · kept ' + report.kept + ' edits' : ''), 'ok');
    MF.util.haptic(10);
  }

  function regenFromEditor() {
    const report = regenerate();
    MF.editor.refresh();
    if (MF.build) MF.build.refresh();
    persist(true);
    toast('Project regenerated · ' + report.stats.total + ' files', 'ok');
  }

  function revertFile(path) {
    regenerate({ force: true });
    MF.editor.refresh();
    if (state.files.some((f) => f.path === path)) MF.editor.open(path);
    else if (state.files.length) MF.editor.open(state.files[0].path);
    if (MF.build) MF.build.refresh();
    persist(true);
    toast('Rebuilt from the builder', 'ok');
  }

  /* ---------------- change handlers ---------------- */
  function onProjectChange() {
    updatePill();
    MF.preview.markStale();
    scheduleRegenerate();
    persist();
    if (currentView === 'export') renderExport();
  }

  function onFileChange(entry) {
    persist();
    MF.preview.markStale();
  }

  function onFileSave(entry) {
    persist(true);
  }

  /* ---------------- persistence ---------------- */
  function persist(immediate) {
    updateSaveState('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      state.updatedAt = Date.now();
      const ok = MF.store.save(state);
      updateSaveState(ok ? 'saved' : 'error');
    }, immediate ? 0 : 420);
  }

  function updateSaveState(kind) {
    const node = qs('#save-state');
    if (!node) return;
    const label = node.querySelector('span');
    node.classList.toggle('is-dirty', kind === 'saving');
    node.classList.toggle('is-saving', kind === 'saving');
    if (label) label.textContent = kind === 'saving' ? 'Saving…' : kind === 'error' ? 'Not saved' : 'Saved';
  }

  /* ---------------- chrome ---------------- */
  function bindChrome() {
    qsa('.rail-btn[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => setView(btn.getAttribute('data-view')));
    });
    qs('#project-pill').addEventListener('click', () => setView('build'));
    qs('#btn-top-preview').addEventListener('click', () => setView('preview'));
    qs('#btn-top-export').addEventListener('click', () => setView('export'));
    qs('#btn-about').addEventListener('click', showGuide);
    qs('#btn-help').addEventListener('click', showGuide);
    qs('#btn-download').addEventListener('click', downloadProject);
    qs('#btn-export-again').addEventListener('click', downloadProject);
    qs('#btn-copy-tree').addEventListener('click', () => {
      MF.util.copy((state.files || []).map((f) => f.path).join('\n'));
    });

    document.addEventListener('click', (e) => {
      const copyBtn = e.target.closest('[data-copy]');
      if (copyBtn) {
        MF.util.copy(copyBtn.getAttribute('data-copy'));
        return;
      }
      const nav = e.target.closest('[data-nav]');
      if (nav) setView(nav.getAttribute('data-nav'));
    });
  }

  function bindGlobal() {
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          MF.editor.saveActive();
          persist(true);
        }
        return;
      }
      if (e.target.matches('input, textarea, select')) return;
      const map = { '1': 'build', '2': 'code', '3': 'preview', '4': 'export' };
      if (map[e.key]) setView(map[e.key]);
    });
    window.addEventListener('beforeunload', () => {
      MF.store.save(state);
    });
  }

  function setView(name, initial) {
    if (!name) return;
    if (currentView === 'build' && name !== 'build' && MF.build) MF.build.onHide();
    currentView = name;
    qsa('.view').forEach((v) => v.classList.toggle('is-on', v.id === 'view-' + name));
    qsa('.rail-btn[data-view]').forEach((b) => b.classList.toggle('is-on', b.getAttribute('data-view') === name));
    if (state.ui) state.ui.view = name;

    if (name === 'build') { MF.build.onShow(); }
    if (name === 'code') { MF.editor.refresh(); }
    if (name === 'preview') { MF.preview.onShow(); }
    if (name === 'export') { renderExport(); }
    if (!initial) {
      const stage = qs('#stage');
      if (stage) stage.scrollTop = 0;
      persist();
    }
  }

  function openWorld() {
    setView('preview');
    setTimeout(() => MF.preview.launch(), 120);
  }

  function updatePill() {
    const p = state.project;
    qs('#pill-name').textContent = p.name;
    qs('#pill-version').textContent = 'v' + p.version;
    qs('#pill-target').textContent = (p.loader === 'fabric' ? 'Fabric' : 'NeoForge') + ' · ' + p.mcVersion;
    document.title = p.name + ' — ModForge';
    const chrome = qs('#mc-chrome-mod');
    if (chrome) chrome.textContent = p.name;
  }

  /* ---------------- export ---------------- */
  function zipEntries() {
    return (state.files || []).map((f) => ({
      path: f.path,
      content: f.content,
      dataUrl: f.dataUrl,
      bytes: f.bytes,
      mode: f.mode
    }));
  }

  function downloadProject() {
    const p = state.project;
    const name = p.modid + '-' + p.version + '.zip';
    try {
      MF.zip.download(zipEntries(), name);
      toast('Building ' + name, 'ok');
      MF.util.haptic(12);
    } catch (err) {
      console.error(err);
      toast('Could not build the zip', 'err');
    }
  }

  function fileBytes() {
    return (state.files || []).reduce((n, f) => {
      if (f.dataUrl) return n + Math.round(f.dataUrl.length * 0.75);
      return n + new Blob([f.content || '']).size;
    }, 0);
  }

  function renderExport() {
    if (!state) return;
    const p = state.project;
    const files = state.files || [];
    qs('#export-title').textContent = p.modid + '-' + p.version + '.zip';
    qs('#export-sub').textContent = (p.loader === 'fabric' ? 'Fabric' : 'NeoForge') + ' · Minecraft ' + p.mcVersion + ' · Java 21';

    const stats = [
      { n: String(files.length), l: 'files' },
      { n: String(files.filter((f) => f.lang === 'java').length), l: 'Java' },
      { n: String(files.filter((f) => f.lang === 'json').length), l: 'JSON' },
      { n: MF.util.formatBytes(fileBytes()), l: 'size' }
    ];
    qs('#export-stats').innerHTML = stats.map((s) =>
      '<div class="stat"><strong>' + escapeHtml(s.n) + '</strong><span>' + s.l + '</span></div>'
    ).join('');

    const note = qs('#export-note');
    const kept = files.filter((f) => f.modified).length;
    note.textContent = kept
      ? kept + ' file' + (kept === 1 ? '' : 's') + ' edited by hand will be included exactly as you saved them.'
      : 'Everything runs locally in this browser. Nothing is uploaded.';
    qs('#export-filecount').textContent = files.length + ' files';

    const commands = [
      { label: 'One-time setup (if you have no wrapper)', cmd: 'gradle wrapper --gradle-version 8.10' },
      { label: 'Launch Minecraft with your mod', cmd: './gradlew runClient' },
      { label: 'Build a jar', cmd: './gradlew build' },
      { label: 'Drop it into the mods folder', cmd: 'cp build/libs/*.jar ~/.minecraft/mods/' }
    ];
    qs('#cmd-list').innerHTML = commands.map((c) =>
      '<div class="cmd-block"><header><strong>' + escapeHtml(c.label) + '</strong>' +
      '<button class="cmd-copy" data-copy="' + escapeHtml(c.cmd) + '" type="button" aria-label="Copy command">' +
      '<svg class="ic"><use href="#i-copy"/></svg></button></header>' +
      '<code>' + escapeHtml(c.cmd) + '</code></div>'
    ).join('');

    const checks = [
      ['Mod entry point', 'Loads on startup and registers everything.'],
      ['Block + item registries', (p.blocks.length + p.items.length) + ' entries with namespaced ids.'],
      ['Creative tab', 'All content in one tab: ' + p.name + '.'],
      ['Blockstates + models', p.blocks.length + ' block models, item models included.'],
      ['16×16 textures', 'Generated to match your palettes.'],
      ['Lang file', 'Names and tooltips in en_us.'],
      ['Gradle project', (p.loader === 'fabric' ? 'Fabric Loom' : 'NeoForge ModDev') + ' for Minecraft ' + p.mcVersion + '.']
    ];
    qs('#export-check').innerHTML = checks.map((c) =>
      '<li><svg class="ic"><use href="#i-check"/></svg><span><strong>' + escapeHtml(c[0]) + '</strong><em>' + escapeHtml(c[1]) + '</em></span></li>'
    ).join('');

    qs('#export-tree').innerHTML = treeHtml(files);
  }

  function treeHtml(files) {
    const dirs = new Set();
    files.forEach((f) => {
      const parts = f.path.split('/');
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    });
    const all = Array.from(new Set(Array.from(dirs).concat(files.map((f) => f.path)))).sort();
    return all.map((p) => {
      const depth = p.split('/').length - 1;
      const name = p.split('/').pop();
      const isDir = dirs.has(p);
      const cls = isDir ? 'd' : /\.png$/.test(p) ? 'b' : 'f';
      return '<div style="padding-left:' + (depth * 12) + 'px"><span class="' + cls + '">' +
        escapeHtml(name) + (isDir ? '/' : '') + '</span></div>';
    }).join('');
  }

  /* ---------------- guide ---------------- */
  function showGuide() {
    const p = state.project;
    const body = el('div');
    body.innerHTML =
      '<p class="card-p">ModForge is a self-contained Minecraft Java mod studio made for iPad. Build the mod, read the generated code, preview it in a 3D scene, then export a project you can open on a computer.</p>' +
      '<div class="picker-label">How it works</div>' +
      '<ol class="steps">' +
      '<li><div class="step-text"><strong>Build</strong><span>Name your mod, pick a loader and version, add blocks and items with their own textures.</span></div></li>' +
      '<li><div class="step-text"><strong>Code</strong><span>Every file is generated live: Java, JSON models, lang and textures. Edit anything — your changes are kept when you regenerate.</span></div></li>' +
      '<li><div class="step-text"><strong>Preview</strong><span>A small island is rendered with your blocks in it. Tap faces to place blocks, swipe to rotate, pinch to zoom.</span></div></li>' +
      '<li><div class="step-text"><strong>Export</strong><span>Download the Gradle project for the Java client, or the .mcaddon for the Minecraft app.</span></div></li>' +
      '</ol>' +
      '<div class="picker-label">The preview is not the game</div>' +
      '<p class="card-p">The Minecraft window is a renderer that runs in Safari. It uses your real textures, ids and block properties, but it is not Minecraft. Three ways to reach the actual game:</p>' +
      '<ol class="steps">' +
      '<li><div class="step-text"><strong>Minecraft app (iPad, iPhone, console)</strong><span>Download the <code>.mcaddon</code>, tap it in Files, then activate the packs on a world. Your blocks appear in the creative inventory.</span></div></li>' +
      '<li><div class="step-text"><strong>Java Edition (computer)</strong><span>Unzip the project on a Mac or PC with JDK 21 and run <code>./gradlew runClient</code> — or double-click <code>run-client.command</code>.</span></div></li>' +
      '<li><div class="step-text"><strong>Browser</strong><span>A third-party Java-Edition client runs in a tab. Real Minecraft, but not your mod.</span></div></li>' +
      '</ol>' +
      '<div class="picker-label">Current project</div>' +
      '<p class="card-p"><code>' + escapeHtml(p.modid) + '</code> · ' + escapeHtml(String(p.blocks.length)) + ' blocks · ' + escapeHtml(String(p.items.length)) + ' items · ' + escapeHtml(p.loader) + ' ' + escapeHtml(p.mcVersion) + '<br>Saved automatically on this iPad.</p>';
    const foot = [
      el('button', { class: 'btn btn-danger', type: 'button', text: 'Reset project', onclick: () => {
        if (!confirm('Reset the project back to the demo mod? This clears your saved project in this browser.')) return;
        MF.store.clear();
        location.reload();
      } }),
      el('button', { class: 'btn btn-primary', type: 'button', text: 'Got it', onclick: () => MF.sheet.close() })
    ];
    MF.sheet.open({ title: 'ModForge guide', body, footer: foot });
  }

  /* public surface used by play.js / console debugging */
  MF.app = {
    project: () => state.project,
    files: () => state.files,
    downloadProject,
    setView,
    regenerate,
    toast: (m, t) => toast(m, t)
  };

  document.addEventListener('DOMContentLoaded', boot);
})(window.MF);
