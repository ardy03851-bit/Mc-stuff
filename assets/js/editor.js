/* ============================================================
   editor.js — file tree + syntax-highlighted code editor
   ============================================================ */
(function (MF) {
  'use strict';
  const { qs, escapeHtml, toast, el } = MF.util;

  /* ------------------------------------------------------------
     syntax highlighting
     ------------------------------------------------------------ */
  const JAVA_KW = new Set(('abstract assert boolean break byte case catch char class const continue default do double else enum ' +
    'extends final finally float for goto if implements import instanceof int interface long native new package private ' +
    'protected public return short static strictfp super switch synchronized this throw throws transient try void volatile ' +
    'while var record sealed yield true false null').split(' '));
  const JAVA_TYPE = new Set(('String Integer Boolean Double Float Long Object List Map Set ArrayList HashMap Registry ' +
    'Identifier ItemStack Block Item Text Component RegistryKey Registries AbstractBlock World ServerPlayerEntity').split(' '));
  const GRADLE_KW = new Set(('plugins dependencies repositories tasks java project base id version group apply from ' +
    'implementation modImplementation minecraft mappings include build task').split(' '));

  function scan(code, rules) {
    let out = '';
    let i = 0;
    let guard = 0;
    while (i < code.length && guard++ < 400000) {
      let matched = false;
      for (let r = 0; r < rules.length; r++) {
        const rule = rules[r];
        rule.re.lastIndex = i;
        const m = rule.re.exec(code);
        if (!m || m.index !== i || !m[0]) continue;
        let cls = rule.cls;
        if (rule.test) cls = rule.test(m[0], code, i) || cls;
        if (cls === 'plain') out += escapeHtml(m[0]);
        else out += '<span class="tok-' + cls + '">' + escapeHtml(m[0]) + '</span>';
        i += m[0].length;
        matched = true;
        break;
      }
      if (!matched) { out += escapeHtml(code[i]); i++; }
    }
    return out;
  }

  const javaRules = [
    { cls: 'com', re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y },
    { cls: 'str', re: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/y },
    { cls: 'ann', re: /@[A-Za-z_][A-Za-z0-9_.]*/y },
    { cls: 'num', re: /0[xX][0-9a-fA-F_]+[lLfFdD]?|\b\d[\d_]*(?:\.[\d_]+)?[lLfFdD]?\b/y },
    {
      cls: 'plain', re: /[A-Za-z_$][A-Za-z0-9_$]*/y,
      test: (w) => {
        if (JAVA_KW.has(w)) return 'kw';
        if (w === 'true' || w === 'false' || w === 'null') return 'num';
        if (JAVA_TYPE.has(w)) return 'type';
        return 'plain';
      }
    },
    { cls: 'punc', re: /[{}()\[\];,.<>=+\-*/%!&|^~?:]/y },
    { cls: 'plain', re: /\s+/y }
  ];

  const jsonRules = [
    { cls: 'key', re: /"(?:\\.|[^"\\])*"(?=\s*:)/y },
    { cls: 'str', re: /"(?:\\.|[^"\\])*"/y },
    { cls: 'num', re: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y },
    { cls: 'bool', re: /\b(?:true|false|null)\b/y },
    { cls: 'punc', re: /[{}[\],:]/y },
    { cls: 'plain', re: /\s+/y }
  ];

  const gradleRules = [
    { cls: 'com', re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y },
    { cls: 'str', re: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/y },
    {
      cls: 'plain', re: /[A-Za-z_$][A-Za-z0-9_$-]*/y,
      test: (w, code, i) => {
        if (GRADLE_KW.has(w)) return 'kw';
        let j = i + w.length;
        while (j < code.length && (code[j] === ' ' || code[j] === '\t')) j++;
        if (code[j] === '(') return 'fn';
        return 'plain';
      }
    },
    { cls: 'num', re: /\b\d[\w.]*\b/y },
    { cls: 'punc', re: /[{}()[\]:,.=+\-*/]/y },
    { cls: 'plain', re: /\s+/y }
  ];

  const tomlRules = [
    { cls: 'com', re: /#[^\n]*/y },
    { cls: 'head', re: /^\s*\[\[?[A-Za-z0-9_.]+\]\]?/my },
    { cls: 'key', re: /[A-Za-z0-9_.-]+(?=\s*=)/y },
    { cls: 'str', re: /"(?:\\.|[^"\\\n])*"|'[^'\n]*'/y },
    { cls: 'num', re: /\b\d[\d_.-]*\b/y },
    { cls: 'bool', re: /\b(?:true|false)\b/y },
    { cls: 'punc', re: /[=[\],.]/y },
    { cls: 'plain', re: /\s+/y }
  ];

  const propRules = [
    { cls: 'com', re: /^[#!][^\n]*/my },
    { cls: 'key', re: /^[A-Za-z0-9_.-]+(?==)/my },
    { cls: 'punc', re: /=/y },
    { cls: 'str', re: /[^\n=]+/y }
  ];

  const mdRules = [
    { cls: 'com', re: /^\s*>[^\n]*/my },
    { cls: 'head', re: /^#{1,6}[^\n]*/my },
    { cls: 'str', re: /`[^`\n]*`/y },
    { cls: 'kw', re: /\*\*[^*\n]+\*\*/y },
    { cls: 'fn', re: /^\s*[-*+]\s/my },
    { cls: 'num', re: /^\s*\d+\.\s/my },
    { cls: 'plain', re: /[\s\S]/y }
  ];

  function highlight(code, lang) {
    try {
      switch (lang) {
        case 'java': return scan(code, javaRules);
        case 'json': return scan(code, jsonRules);
        case 'gradle': return scan(code, gradleRules);
        case 'toml': return scan(code, tomlRules);
        case 'properties': return scan(code, propRules);
        case 'md': return scan(code, mdRules);
        default: return escapeHtml(code);
      }
    } catch (err) {
      return escapeHtml(code);
    }
  }

  /* ------------------------------------------------------------
     editor
     ------------------------------------------------------------ */
  let state = null;
  let opts = {};
  let activeEntry = null;
  let collapsed = new Set();
  let dom = {};
  let keybarVisible = false;
  let cleanSnapshot = '';

  function init(appState, options) {
    state = appState;
    opts = options || {};
    dom = {
      tree: qs('#file-tree'),
      pane: qs('#file-pane'),
      scrim: qs('#file-scrim'),
      path: qs('#editor-path'),
      badge: qs('#editor-badge'),
      ta: qs('#code-input'),
      pre: qs('#hl'),
      code: qs('#hl-code'),
      gutter: qs('#gutter'),
      gutterInner: qs('#gutter-inner'),
      cursor: qs('#cursor-pos'),
      lint: qs('#editor-lint'),
      lines: qs('#editor-lines'),
      dirty: qs('#dirty-dot'),
      binary: qs('#binary-pane'),
      binCanvas: qs('#binary-canvas'),
      binMeta: qs('#binary-meta'),
      keybar: qs('#keybar')
    };
    bind();
    renderTree();
    const initial = state.ui && state.ui.activeFile;
    const fallback = (state.files.find((f) => /\.java$/.test(f.path)) || state.files[0] || {}).path;
    if (initial && state.files.some((f) => f.path === initial)) open(initial);
    else if (fallback) open(fallback);
    updateKeybarVisibility();
  }

  function files() { return state.files || []; }

  function bind() {
    const ta = dom.ta;
    ta.addEventListener('input', onInput);
    ta.addEventListener('scroll', syncScroll, { passive: true });
    ta.addEventListener('keydown', onKeyDown);
    ta.addEventListener('click', updateCursor);
    ta.addEventListener('keyup', updateCursor);
    ta.addEventListener('select', updateCursor);
    ta.addEventListener('focus', () => { updateKeybarVisibility(); });
    ta.addEventListener('blur', () => { setTimeout(updateKeybarVisibility, 120); });

    qs('#btn-save-file').addEventListener('click', saveActive);
    qs('#btn-files-toggle').addEventListener('click', () => toggleDrawer(true));
    qs('#file-scrim').addEventListener('click', () => toggleDrawer(false));
    qs('#btn-regen-files').addEventListener('click', () => opts.onRegenerate && opts.onRegenerate());
    qs('#btn-add-file').addEventListener('click', newFileSheet);
    qs('#btn-editor-menu').addEventListener('click', fileMenu);

    dom.keybar.addEventListener('pointerdown', (e) => {
      // keep the textarea focused while tapping keys
      if (e.target.closest('button')) e.preventDefault();
    });
    dom.keybar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-key]');
      if (!btn) return;
      const key = btn.getAttribute('data-key');
      if (key === 'tab') insertText('    ');
      else if (key === '→') {
        const pos = dom.ta.selectionStart;
        dom.ta.selectionStart = dom.ta.selectionEnd = Math.min(dom.ta.value.length, pos + 1);
        updateCursor();
      } else insertText(key);
    });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', positionKeybar);
      window.visualViewport.addEventListener('scroll', positionKeybar);
    }
    window.addEventListener('resize', positionKeybar);
  }

  function toggleDrawer(open) {
    if (!dom.pane) return;
    dom.pane.classList.toggle('is-open', open);
    dom.scrim.classList.toggle('is-on', open);
  }

  /* ---------------- tree ---------------- */
  function buildTree(list) {
    const root = { type: 'dir', name: '', path: '', children: new Map() };
    list.forEach((f) => {
      const parts = f.path.split('/');
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const name = parts[i];
        if (!node.children.has(name)) {
          const p = node.path ? node.path + '/' + name : name;
          node.children.set(name, { type: 'dir', name, path: p, children: new Map() });
        }
        node = node.children.get(name);
      }
      node.children.set(parts[parts.length - 1], { type: 'file', name: parts[parts.length - 1], file: f });
    });
    return root;
  }

  function renderTree() {
    if (!dom.tree) return;
    const root = buildTree(files().slice().sort((a, b) => a.path.localeCompare(b.path)));
    dom.tree.innerHTML = '';
    const frag = document.createDocumentFragment();
    renderChildren(root, frag, 0);
    dom.tree.appendChild(frag);
    // restore selection highlight
    if (activeEntry) {
      const row = dom.tree.querySelector('[data-path="' + cssEscape(activeEntry.path) + '"]');
      if (row) row.classList.add('is-on');
    }
  }

  function cssEscape(s) {
    return String(s).replace(/["\\]/g, '\\$&');
  }

  function renderChildren(dir, host, depth) {
    const nodes = Array.from(dir.children.values()).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => {
      if (node.type === 'dir') {
        const group = el('div', { class: 'tree-group' + (collapsed.has(node.path) ? ' is-closed' : '') });
        const head = el('button', { class: 'tree-group-h', type: 'button', style: { paddingLeft: (8 + depth * 12) + 'px' } }, [
          MF.util.svgIcon('i-folder'), el('span', { text: node.name })
        ]);
        head.addEventListener('click', () => {
          if (collapsed.has(node.path)) collapsed.delete(node.path); else collapsed.add(node.path);
          group.classList.toggle('is-closed');
        });
        const body = el('div', { class: 'tree-group-body' });
        group.appendChild(head);
        group.appendChild(body);
        renderChildren(node, body, depth + 1);
        host.appendChild(group);
      } else {
        const f = node.file;
        const isImg = f.binary && f.lang === 'png';
        const row = el('button', {
          class: 'tree-file' + (isImg ? ' tree-file--png' : '') + (activeEntry && activeEntry.path === f.path ? ' is-on' : ''),
          type: 'button',
          'data-path': f.path,
          style: { paddingLeft: (10 + depth * 12) + 'px' }
        }, [
          MF.util.svgIcon(isImg ? 'i-image' : 'i-file'),
          el('span', { class: 'nm', text: node.name }),
          f.modified ? el('span', { class: 'mod', title: 'Edited' }) : null
        ]);
        row.addEventListener('click', () => { open(f.path); toggleDrawer(false); });
        host.appendChild(row);
      }
    });
  }

  /* ---------------- open / render ---------------- */
  function open(path) {
    const entry = files().find((f) => f.path === path);
    if (!entry) return;
    activeEntry = entry;
    if (state.ui) state.ui.activeFile = path;

    dom.path.textContent = path;
    dom.path.title = path;
    dom.badge.textContent = badgeLabel(entry);
    dom.badge.className = 'badge ' + badgeClass(entry.lang);

    const binary = !!entry.binary;
    dom.binary.hidden = !binary;
    dom.ta.hidden = binary;
    dom.gutter.hidden = binary;
    dom.pre.hidden = binary;
    qs('#btn-save-file').disabled = binary;
    qs('#btn-save-file').style.opacity = binary ? '.4' : '1';

    if (binary) {
      renderBinary(entry);
      dom.code.innerHTML = '';
      dom.gutterInner.innerHTML = '';
      dom.lines.textContent = 'PNG';
      setLint('img', 'binary texture');
    } else {
      dom.ta.value = entry.content || '';
      cleanSnapshot = entry.content || '';
      dom.ta.scrollTop = 0;
      dom.ta.scrollLeft = 0;
      highlightNow();
      updateGutter();
      updateCursor();
      lint();
    }
    updateDirty();
    renderTree();
    const row = dom.tree.querySelector('[data-path="' + cssEscape(path) + '"]');
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }

  function badgeLabel(entry) {
    if (!entry) return 'Text';
    if (entry.binary) return 'PNG';
    const map = { java: 'Java', json: 'JSON', gradle: 'Gradle', properties: 'Props', toml: 'TOML', md: 'Markdown', text: 'Text' };
    return map[entry.lang] || 'Text';
  }
  function badgeClass(lang) {
    if (lang === 'json') return 'badge--json';
    if (lang === 'png') return 'badge--png';
    if (lang === 'gradle' || lang === 'toml' || lang === 'properties') return 'badge--gradle';
    return '';
  }

  function renderBinary(entry) {
    const img = new Image();
    img.onload = () => {
      const c = dom.binCanvas;
      c.width = 256; c.height = 256;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 256, 256);
      ctx.drawImage(img, 0, 0, 256, 256);
    };
    img.src = entry.dataUrl;
    const approx = entry.dataUrl ? Math.round(entry.dataUrl.length * 0.75) : 0;
    dom.binMeta.innerHTML = escapeHtml(entry.path.split('/').pop()) +
      '<br>' + 16 + '×' + 16 + ' px · ' + MF.util.formatBytes(approx) +
      '<br><span style="color:#71889f">Generated texture — edit the palette in Build</span>';
  }

  function highlightNow() {
    if (!activeEntry || activeEntry.binary) return;
    dom.code.innerHTML = highlight(dom.ta.value, activeEntry.lang) + '\n';
    syncScroll();
  }

  function updateGutter() {
    const count = dom.ta.value.split('\n').length;
    if (dom.gutterInner.childElementCount !== count) {
      let html = '';
      for (let i = 1; i <= count; i++) html += '<div>' + i + '</div>';
      dom.gutterInner.innerHTML = html;
      dom.gutter.style.width = Math.max(44, 22 + String(count).length * 8) + 'px';
    }
    dom.lines.textContent = count + (count === 1 ? ' line' : ' lines');
  }

  function updateCursor() {
    if (!activeEntry || activeEntry.binary) return;
    const pos = dom.ta.selectionStart || 0;
    const before = dom.ta.value.slice(0, pos);
    const line = before.split('\n').length;
    const col = pos - before.lastIndexOf('\n');
    dom.cursor.textContent = 'Ln ' + line + ', Col ' + col;
    Array.prototype.forEach.call(dom.gutterInner.children, (n, i) => {
      n.classList.toggle('cur', i === line - 1);
    });
  }

  function syncScroll() {
    const top = dom.ta.scrollTop;
    const left = dom.ta.scrollLeft;
    dom.code.style.transform = 'translate(' + (-left) + 'px,' + (-top) + 'px)';
    dom.gutterInner.style.transform = 'translateY(' + (-top) + 'px)';
  }

  function updateDirty() {
    if (!activeEntry) return;
    dom.dirty.hidden = !activeEntry.modified;
    const row = dom.tree.querySelector('[data-path="' + cssEscape(activeEntry.path) + '"]');
    if (row && !row.querySelector('.mod') && activeEntry.modified) {
      row.appendChild(el('span', { class: 'mod', title: 'Edited' }));
    }
  }

  /* ---------------- editing ---------------- */
  function onInput() {
    if (!activeEntry) return;
    activeEntry.content = dom.ta.value;
    if (activeEntry.content !== cleanSnapshot) activeEntry.modified = true;
    highlightNow();
    updateGutter();
    updateCursor();
    lint();
    updateDirty();
    if (opts.onChange) opts.onChange(activeEntry);
  }

  function setLint(kind, text) {
    dom.lint.className = 'lint ' + kind;
    dom.lint.textContent = text;
  }

  function lint() {
    const lang = activeEntry.lang;
    const src = dom.ta.value;
    if (lang === 'json') {
      try {
        JSON.parse(src);
        setLint('ok', 'Valid JSON');
      } catch (err) {
        const m = /position (\d+)/.exec(err.message || '');
        let where = '';
        if (m) {
          const pos = parseInt(m[1], 10);
          const line = src.slice(0, pos).split('\n').length;
          where = ' · line ' + line;
        }
        setLint('err', 'JSON error' + where);
      }
      return;
    }
    if (lang === 'java') {
      const open = (src.match(/{/g) || []).length;
      const close = (src.match(/}/g) || []).length;
      if (open !== close) setLint('warn', 'Braces ' + open + '/' + close);
      else setLint('ok', 'Braces balanced');
      return;
    }
    if (lang === 'toml') {
      const bad = src.split('\n').some((l) => /^\s*\[[^\]]*$/.test(l));
      setLint(bad ? 'warn' : 'ok', bad ? 'Unclosed table header' : 'Valid TOML shape');
      return;
    }
    setLint('ok', 'Ready');
  }

  function onKeyDown(e) {
    const ta = dom.ta;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveActive();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = ta.selectionStart, end = ta.selectionEnd;
      if (start === end) insertText('    ');
      else {
        const value = ta.value;
        const firstLine = value.lastIndexOf('\n', start - 1) + 1;
        const block = value.slice(firstLine, end);
        const changed = block.split('\n').map((l) => e.shiftKey ? l.replace(/^ {4}/, '') : '    ' + l).join('\n');
        ta.setSelectionRange(firstLine, end);
        insertText(changed, firstLine, end);
      }
      return;
    }
    if (e.key === 'Enter') {
      const value = ta.value;
      const pos = ta.selectionStart;
      const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
      const line = value.slice(lineStart, pos);
      const indent = (line.match(/^[ \t]*/) || [''])[0];
      let extra = '';
      if (/[{(]\s*$/.test(line)) extra = '    ';
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      const needsClose = /[{([]\s*$/.test(line) && !/^\s*$/.test(value.slice(pos).split('\n')[0] || '');
      const closeChar = /[{([]\s*$/.test(line) ? (/{\s*$/.test(line) ? '}' : /\(\s*$/.test(line) ? ')' : ']') : '';
      if (needsClose) {
        insertText('\n' + indent + extra + '\n' + indent + closeChar);
        const p = ta.selectionStart - (indent.length + closeChar.length + 1);
        ta.setSelectionRange(p, p);
        onInput();
      } else {
        insertText('\n' + indent + extra);
      }
      return;
    }
    const pairs = { '{': '}', '(': ')', '[': ']', '"': '"', "'": "'" };
    if (pairs[e.key] && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const start = ta.selectionStart, end = ta.selectionEnd;
      if (start !== end) {
        e.preventDefault();
        insertText(e.key + ta.value.slice(start, end) + pairs[e.key]);
        ta.setSelectionRange(start + 1, end + 1);
        return;
      }
      const next = ta.value[start] || '';
      if (e.key === '"' || e.key === "'") {
        if (next === e.key) { e.preventDefault(); ta.setSelectionRange(start + 1, start + 1); updateCursor(); return; }
      }
      e.preventDefault();
      insertText(e.key + pairs[e.key]);
      ta.setSelectionRange(start + 1, start + 1);
      updateCursor();
      return;
    }
    if (e.key === '}' || e.key === ')' || e.key === ']') {
      const pos = ta.selectionStart;
      if (ta.value[pos] === e.key) { e.preventDefault(); ta.setSelectionRange(pos + 1, pos + 1); updateCursor(); }
    }
  }

  function insertText(text) {
    const ta = dom.ta;
    const start = ta.selectionStart;
    ta.setRangeText(text, start, ta.selectionEnd, 'end');
    onInput();
    ta.focus({ preventScroll: true });
    syncScroll();
  }

  /* ---------------- save / menu ---------------- */
  function saveActive() {
    if (!activeEntry || activeEntry.binary) return;
    activeEntry.content = dom.ta.value;
    if (activeEntry.content !== cleanSnapshot) activeEntry.modified = true;
    if (opts.onSave) opts.onSave(activeEntry);
    updateDirty();
    toast('Saved ' + activeEntry.path.split('/').pop(), 'ok');
  }

  function fileMenu() {
    if (!activeEntry) return;
    const body = el('div');
    const list = el('div', { class: 'toggle-list' });
    const actions = [
      { title: 'Copy file contents', desc: activeEntry.path, fn: () => { MF.util.copy(activeEntry.content || ''); MF.sheet.close(); } },
      { title: 'Revert to generated', desc: 'Discard edits and rebuild this file from the builder.', fn: () => { MF.sheet.close(); if (opts.onRevert) opts.onRevert(activeEntry.path); } },
      { title: 'Text size', desc: 'Cycle editor font size', fn: () => { cycleFont(); } },
      { title: 'Delete file', desc: 'Remove it from the project', danger: true, fn: () => { MF.sheet.close(); confirmDelete(); } }
    ];
    actions.forEach((a) => {
      const row = el('button', { class: 'toggle-row', type: 'button', style: { width: '100%', textAlign: 'left' } }, [
        el('span', { class: 'tr-text' }, [el('strong', { text: a.title }), el('em', { text: a.desc })]),
        MF.util.svgIcon('i-chevron')
      ]);
      if (a.danger) row.style.color = 'var(--red)';
      row.addEventListener('click', a.fn);
      list.appendChild(row);
    });
    body.appendChild(list);
    MF.sheet.open({
      title: 'File actions',
      body,
      footer: el('button', { class: 'btn', type: 'button', text: 'Close', onclick: () => MF.sheet.close() })
    });
  }

  function cycleFont() {
    const root = qs('#view-code');
    const sizes = [['13.5px', '21px'], ['15px', '23px'], ['17px', '26px']];
    const current = root.style.getPropertyValue('--code-fs') || '13.5px';
    const idx = sizes.findIndex((s) => s[0] === current);
    const next = sizes[(idx + 1) % sizes.length];
    root.style.setProperty('--code-fs', next[0]);
    root.style.setProperty('--code-lh', next[1]);
    toast('Editor text size ' + next[0], 'info');
    MF.sheet.close();
    highlightNow();
    updateGutter();
  }

  function confirmDelete() {
    const entry = activeEntry;
    if (!entry) return;
    const body = el('p', { class: 'card-p', text: 'Delete ' + entry.path + '? This only affects this project in your browser. You can regenerate it afterwards if it is a generated file.' });
    const foot = [
      el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => MF.sheet.close() }),
      el('button', { class: 'btn btn-danger', type: 'button', text: 'Delete file', onclick: () => {
        state.files = state.files.filter((f) => f.path !== entry.path);
        activeEntry = null;
        MF.sheet.close();
        renderTree();
        if (state.files.length) open(state.files[0].path);
        if (opts.onSave) opts.onSave(null);
        toast('File deleted', 'warn');
      } })
    ];
    MF.sheet.open({ title: 'Delete file', body, footer: foot });
  }

  /* ---------------- new file ---------------- */
  function newFileSheet() {
    const wrap = el('div');
    const p = state.project;
    const base = 'src/main/java/' + p.pkg.replace(/\./g, '/') + '/';
    const nameField = el('label', { class: 'field' }, [
      el('span', { class: 'field-label', text: 'File path' }),
      el('input', { class: 'input input--mono', id: 'newfile-path', type: 'text', spellcheck: 'false', autocapitalize: 'off', value: base + 'Custom' + MF.project.classOf(p) + 'Feature.java' })
    ]);
    const typeField = el('label', { class: 'field' }, [
      el('span', { class: 'field-label', text: 'Starter content' }),
      el('select', { class: 'input', id: 'newfile-type' }, [
        el('option', { value: 'java', text: 'Java class' }),
        el('option', { value: 'json', text: 'Empty JSON' }),
        el('option', { value: 'md', text: 'Markdown note' }),
        el('option', { value: 'text', text: 'Empty file' })
      ])
    ]);
    wrap.appendChild(nameField);
    wrap.appendChild(typeField);
    const foot = [
      el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => MF.sheet.close() }),
      el('button', { class: 'btn btn-primary', type: 'button', text: 'Create file', onclick: () => {
        const path = qs('#newfile-path').value.trim().replace(/^\/+/, '');
        const type = qs('#newfile-type').value;
        if (!path) { toast('Give the file a path', 'warn'); return; }
        if (state.files.some((f) => f.path === path)) { toast('That file already exists', 'warn'); return; }
        const cls = path.split('/').pop().replace(/\.java$/, '');
        let content = '';
        if (type === 'java') {
          content = 'package ' + p.pkg + (path.indexOf('/client/') >= 0 ? '.client' : '') + ';\n\npublic class ' + cls.replace(/[^A-Za-z0-9_]/g, '') + ' {\n    // TODO: write me\n}\n';
        } else if (type === 'json') content = '{\n  \n}\n';
        else if (type === 'md') content = '# ' + (cls || 'Notes') + '\n\n';
        const entry = { path, content, lang: MF.generator.langFor(path), binary: false, generated: false, modified: true };
        state.files.push(entry);
        state.files.sort((a, b) => a.path.localeCompare(b.path));
        MF.sheet.close();
        renderTree();
        open(path);
        if (opts.onSave) opts.onSave(entry);
        toast('Created ' + path.split('/').pop(), 'ok');
      } })
    ];
    MF.sheet.open({ title: 'New file', body: wrap, footer: foot });
  }

  /* ---------------- keyboard bar ---------------- */
  function isCoarse() {
    return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  }

  function updateKeybarVisibility() {
    const show = isCoarse() && document.activeElement === dom.ta && !dom.ta.hidden;
    dom.keybar.hidden = !show;
    document.body.classList.toggle('keybar-on', show);
    keybarVisible = show;
    positionKeybar();
  }

  function positionKeybar() {
    if (!keybarVisible || !window.visualViewport) return;
    const vv = window.visualViewport;
    const hidden = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    dom.keybar.style.bottom = Math.min(hidden, 420) + 'px';
  }

  /* ---------------- public ---------------- */
  function refresh(opts2) {
    const keep = activeEntry ? activeEntry.path : null;
    renderTree();
    if (keep) {
      const entry = files().find((f) => f.path === keep);
      if (!entry) {
        activeEntry = null;
        if (files().length) open(files()[0].path);
      } else {
        activeEntry = entry;
        if (!entry.binary && dom.ta.value !== (entry.content || '')) open(entry.path);
        else { updateDirty(); lint(); renderTree(); }
      }
    }
  }

  function active() { return activeEntry; }

  MF.editor = { init, refresh, open, files, active, highlight, saveActive };
})(window.MF);
