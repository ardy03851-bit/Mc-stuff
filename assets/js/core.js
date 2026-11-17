/* ============================================================
   core.js — tiny DOM / storage / UI helpers
   ============================================================ */
window.MF = window.MF || {};
(function (MF) {
  'use strict';

  const qs = (sel, root) => (root || document).querySelector(sel);
  const qsa = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    if (children) {
      [].concat(children).forEach((c) => {
        if (c === null || c === undefined || c === false) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function debounce(fn, ms) {
    let t = 0;
    const wrapped = function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(self, args), ms);
    };
    wrapped.cancel = () => clearTimeout(t);
    wrapped.flush = function () { clearTimeout(t); return fn.apply(this, arguments); };
    return wrapped;
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function snake(s) {
    return String(s || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_{2,}/g, '_')
      .slice(0, 48);
  }

  function pascal(s) {
    const parts = snake(s).split('_').filter(Boolean);
    return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('') || 'MyMod';
  }

  function titleCase(s) {
    return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9);
  }

  function copy(text) {
    const done = () => MF.toast('Copied to clipboard', 'ok');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(done).catch(() => legacyCopy(text) && done());
    }
    if (legacyCopy(text)) done();
    return Promise.resolve();
  }

  function legacyCopy(text) {
    try {
      const ta = el('textarea', { style: { position: 'fixed', opacity: '0', top: '0' } });
      ta.value = text;
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch (e) { return false; }
  }

  function haptic(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms || 8); } catch (e) {} }
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /* ---------------- toasts ---------------- */
  const toastIcons = { ok: 'i-check', warn: 'i-info', err: 'i-info', info: 'i-spark' };
  function toast(message, kind) {
    const host = qs('#toasts');
    if (!host) return;
    const node = el('div', { class: 'toast toast--' + (kind || 'info'), role: 'status' }, [
      svgIcon(toastIcons[kind || 'info'] || 'i-spark'),
      el('span', { text: message })
    ]);
    host.appendChild(node);
    setTimeout(() => {
      node.classList.add('is-out');
      setTimeout(() => node.remove(), 220);
    }, kind === 'err' ? 4200 : 2600);
  }

  function svgIcon(id, cls) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'ic ' + (cls || ''));
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(ns, 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  /* ---------------- sheet ---------------- */
  let sheetCloseHandler = null;
  const sheetApi = {
    open(opts) {
      const sheet = qs('#sheet');
      const scrim = qs('#scrim');
      const body = qs('#sheet-body');
      const foot = qs('#sheet-foot');
      qs('#sheet-title').textContent = opts.title || '';
      body.innerHTML = '';
      foot.innerHTML = '';
      if (typeof opts.body === 'string') body.innerHTML = opts.body;
      else if (opts.body) body.appendChild(opts.body);
      if (opts.footer) [].concat(opts.footer).forEach((f) => foot.appendChild(f));
      else foot.hidden = true;
      foot.hidden = !opts.footer;
      sheet.hidden = false;
      scrim.hidden = false;
      sheetCloseHandler = opts.onClose || null;
      body.scrollTop = 0;
    },
    close() {
      const sheet = qs('#sheet');
      const scrim = qs('#scrim');
      if (sheet.hidden) return;
      sheet.hidden = true;
      scrim.hidden = true;
      const cb = sheetCloseHandler;
      sheetCloseHandler = null;
      if (cb) cb();
    },
    isOpen() { return !qs('#sheet').hidden; }
  };

  document.addEventListener('click', (e) => {
    if (e.target.closest('#sheet-close') || e.target.id === 'scrim') sheetApi.close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheetApi.isOpen()) sheetApi.close();
  });

  /* ---------------- storage ---------------- */
  const STORE_KEY = 'modforge.project.v1';
  const store = {
    load() {
      try {
        const raw = localStorage.getItem(STORE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
      } catch (e) { return null; }
    },
    save(data) {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(data));
        return true;
      } catch (e) {
        console.warn('ModForge: could not persist project', e);
        return false;
      }
    },
    clear() {
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    }
  };

  /* ---------------- misc ---------------- */
  function hexToRgb(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(r, g, b) {
    const f = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    return '#' + f(r) + f(g) + f(b);
  }
  function shade(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    if (amount >= 0) {
      return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
    }
    return rgbToHex(r * (1 + amount), g * (1 + amount), b * (1 + amount));
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename, style: { display: 'none' } });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }

  MF.util = { qs, qsa, el, escapeHtml, debounce, clamp, snake, pascal, titleCase, uid, copy, haptic, formatBytes, formatTime, svgIcon, hexToRgb, rgbToHex, shade, downloadBlob, toast };
  MF.toast = toast;
  MF.sheet = sheetApi;
  MF.store = store;
})(window.MF);
