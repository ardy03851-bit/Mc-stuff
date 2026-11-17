/* ============================================================
   project.js — mod project model, defaults & content helpers
   ============================================================ */
(function (MF) {
  'use strict';
  const { snake, pascal, uid, clamp } = MF.util;

  const TOOLS = [
    { id: 'pickaxe', label: 'Pickaxe' },
    { id: 'axe', label: 'Axe' },
    { id: 'shovel', label: 'Shovel' },
    { id: 'hoe', label: 'Hoe' },
    { id: 'none', label: 'No tool' }
  ];

  function contentDefaults(kind) {
    return kind === 'item'
      ? { kind: 'item', name: '', slug: '', material: 'crystal', tint: 'emerald', shape: 'gem', stackSize: 64, glow: false, tooltip: '' }
      : { kind: 'block', name: '', slug: '', material: 'stone', tint: 'none', hardness: 2, tool: 'pickaxe', glow: false, transparent: false, stackSize: 64, tooltip: '' };
  }

  function defaultProject() {
    const blocks = [
      {
        key: 'blk_emerald', kind: 'block', name: 'Emerald Block', slug: 'emerald_block',
        material: 'metal', tint: 'emerald', hardness: 4, tool: 'pickaxe',
        glow: false, transparent: false, stackSize: 64, tooltip: 'A solid block of emerald.'
      },
      {
        key: 'blk_lamp', kind: 'block', name: 'Emerald Lamp', slug: 'emerald_lamp',
        material: 'neon', tint: 'emerald', hardness: 0.6, tool: 'pickaxe',
        glow: true, transparent: false, stackSize: 64, tooltip: 'Lights up the deep.'
      },
      {
        key: 'blk_bricks', kind: 'block', name: 'Deepstone Bricks', slug: 'deepstone_bricks',
        material: 'brick', tint: 'gray', hardness: 3.5, tool: 'pickaxe',
        glow: false, transparent: false, stackSize: 64, tooltip: 'Cold bricks from below.'
      }
    ];
    const items = [
      {
        key: 'itm_shard', kind: 'item', name: 'Emerald Shard', slug: 'emerald_shard',
        material: 'crystal', tint: 'emerald', shape: 'gem', stackSize: 64,
        glow: false, tooltip: 'A shard of pure green light.'
      },
      {
        key: 'itm_dust', kind: 'item', name: 'Glow Dust', slug: 'glow_dust',
        material: 'glowstone', tint: 'yellow', shape: 'dust', stackSize: 16,
        glow: true, tooltip: 'Warm to the touch.'
      }
    ];
    const p = {
      name: 'Emerald Depths',
      modid: 'emerald_depths',
      version: '1.0.0',
      author: 'You',
      description: 'Deep green blocks, lamps and shards for your world.',
      loader: 'fabric',
      mcVersion: '1.21.1',
      pkg: 'com.example.emerald_depths',
      blocks,
      items
    };
    return normalize(p);
  }

  function normalize(p) {
    const out = Object.assign({}, p);
    out.name = String(out.name || 'My Mod').slice(0, 48);
    out.modid = snake(out.modid || out.name) || 'my_mod';
    out.version = String(out.version || '1.0.0').slice(0, 24);
    out.author = String(out.author || 'You').slice(0, 48);
    out.description = String(out.description || 'A Minecraft Java mod made with ModForge.').slice(0, 220);
    out.loader = out.loader === 'neoforge' ? 'neoforge' : 'fabric';
    out.mcVersion = ['1.21.1', '1.21.4'].indexOf(out.mcVersion) >= 0 ? out.mcVersion : '1.21.1';
    out.pkg = String(out.pkg || 'com.example.' + out.modid).replace(/[^a-zA-Z0-9_.]/g, '').replace(/^\.+|\.+$/g, '') || 'com.example.' + out.modid;
    out.blocks = Array.isArray(out.blocks) ? out.blocks : [];
    out.items = Array.isArray(out.items) ? out.items : [];
    [out.blocks, out.items].forEach((list) => list.forEach((c) => {
      c.key = c.key || uid('c');
      c.kind = c.kind === 'item' ? 'item' : 'block';
      c.name = String(c.name || 'Unnamed').slice(0, 40);
      c.slug = snake(c.slug || c.name) || 'unnamed';
      c.material = c.material || (c.kind === 'item' ? 'crystal' : 'stone');
      c.tint = c.tint || 'none';
      c.seed = c.seed || c.slug;
      c.stackSize = clamp(parseInt(c.stackSize, 10) || 64, 1, 64);
      c.glow = !!c.glow;
      c.tooltip = String(c.tooltip || '').slice(0, 120);
      if (c.kind === 'block') {
        c.hardness = clamp(parseFloat(c.hardness) || 2, 0.1, 30);
        c.tool = c.tool || 'pickaxe';
        c.transparent = !!c.transparent;
      } else {
        c.shape = c.shape || 'gem';
      }
    }));
    return out;
  }

  function classOf(p) { return pascal(p.name || p.modid); }

  function allContent(p) { return [].concat(p.blocks || [], p.items || []); }

  function byKey(p, key) {
    return allContent(p).find((c) => c.key === key) || null;
  }

  function uniqueSlug(p, slug, ignoreKey) {
    let base = snake(slug) || 'entry';
    const taken = new Set(allContent(p).filter((c) => c.key !== ignoreKey).map((c) => c.slug));
    if (!taken.has(base)) return base;
    for (let i = 2; i < 200; i++) {
      const candidate = base + '_' + i;
      if (!taken.has(candidate)) return candidate;
    }
    return base + '_' + uid('x').slice(-4);
  }

  function addContent(p, kind) {
    const c = contentDefaults(kind);
    c.key = uid(kind === 'item' ? 'itm' : 'blk');
    c.name = kind === 'item' ? 'New Item' : 'New Block';
    c.slug = uniqueSlug(p, c.name);
    c.seed = c.slug;
    if (kind === 'item') p.items.push(c); else p.blocks.push(c);
    return c;
  }

  function removeContent(p, key) {
    p.blocks = p.blocks.filter((c) => c.key !== key);
    p.items = p.items.filter((c) => c.key !== key);
  }

  function renameContent(p, content, newName) {
    const wasAuto = !content.slug || content.slug === snake(content.name);
    content.name = String(newName || '').slice(0, 40) || 'Unnamed';
    const next = uniqueSlug(p, content.name, content.key);
    if (wasAuto) {
      content.slug = next;
      content.seed = next;
    }
  }

  function classSlug(p) { return p.modid; }

  function summary(p) {
    const blocks = p.blocks.length;
    const items = p.items.length;
    return {
      blocks,
      items,
      textures: blocks * 2 + items * 2,
      glows: allContent(p).filter((c) => c.glow).length
    };
  }

  MF.project = {
    TOOLS,
    defaultProject,
    normalize,
    classOf,
    allContent,
    byKey,
    uniqueSlug,
    addContent,
    removeContent,
    renameContent,
    classSlug,
    summary,
    contentDefaults
  };
})(window.MF);
