/* ============================================================
   bedrock.js — exports the project as a Bedrock add-on (.mcaddon)
   so it installs into the real Minecraft app on iPad, iPhone,
   Android, Windows, Xbox and PlayStation.
   ============================================================ */
(function (MF) {
  'use strict';

  const ENGINE = [1, 21, 80];      // custom block/item JSON era
  const BLOCK_FORMAT = '1.21.80';
  const ITEM_FORMAT = '1.21.80';

  /* ---- deterministic UUIDs so re-exporting does not duplicate packs ---- */
  function hash128(str) {
    let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0x9e3779b9, h4 = 0x85ebca6b;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
      h3 = Math.imul(h3 ^ (c + i), 0xc2b2ae35) >>> 0;
      h4 = Math.imul(h4 + (c << 3), 0x27d4eb2f) >>> 0;
    }
    const out = [];
    [h1, h2, h3, h4].forEach((h) => {
      out.push((h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255);
    });
    out[6] = (out[6] & 0x0f) | 0x40;  // version 4
    out[8] = (out[8] & 0x3f) | 0x80;  // variant
    return out;
  }

  function uuid(seed) {
    const b = hash128(seed);
    const hex = b.map((n) => n.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' +
      hex.slice(16, 20) + '-' + hex.slice(20, 32);
  }

  function semver(v, fallback) {
    const m = String(v || '').match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!m) return fallback || [1, 0, 0];
    return [Number(m[1]) || 0, Number(m[2]) || 0, Number(m[3]) || 0];
  }

  function json(obj) { return JSON.stringify(obj, null, 2) + '\n'; }
  function safeId(s) { return String(s || 'pack').replace(/[^a-z0-9_]/gi, '_').toLowerCase(); }

  function mapColor(content) {
    const base = MF.pixels.baseColorFor(
      MF.pixels.materialById(content.material || 'stone'),
      content.tint || 'none'
    );
    // baseColorFor returns either #rrggbb or rgb(); normalise to #rrggbb
    const hex = String(base).trim();
    if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toUpperCase();
    const m = hex.match(/(\d+)\D+(\d+)\D+(\d+)/);
    if (!m) return '#7D7D7D';
    return '#' + [m[1], m[2], m[3]]
      .map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }

  function renderMethod(content) {
    const mat = (content.material || '').toLowerCase();
    if (content.transparent || ['glass', 'crystal', 'neon', 'slime'].indexOf(mat) >= 0) return 'blend';
    if (mat === 'leaves') return 'alpha_test';
    return 'opaque';
  }

  function blockFile(p, b, texKey) {
    const components = {
      'minecraft:geometry': 'minecraft:geometry.full_block',
      'minecraft:material_instances': {
        up: { texture: texKey.top, render_method: renderMethod(b) },
        down: { texture: texKey.top, render_method: renderMethod(b) },
        north: { texture: texKey.side, render_method: renderMethod(b) },
        south: { texture: texKey.side, render_method: renderMethod(b) },
        east: { texture: texKey.side, render_method: renderMethod(b) },
        west: { texture: texKey.side, render_method: renderMethod(b) }
      },
      'minecraft:destructible_by_mining': {
        seconds_to_destroy: Math.max(0.2, Number(b.hardness) || 1)
      },
      'minecraft:destructible_by_explosion': {
        explosion_resistance: Math.max(1, Math.round((Number(b.hardness) || 1) * 1.6))
      },
      'minecraft:map_color': mapColor(b),
      'minecraft:friction': 0.6,
      'minecraft:light_dampening': b.transparent ? 0 : 15
    };
    if (b.glow) components['minecraft:light_emission'] = 12;
    return {
      format_version: BLOCK_FORMAT,
      'minecraft:block': {
        description: {
          identifier: p.modid + ':' + b.slug,
          menu_category: { category: 'construction' }
        },
        components
      }
    };
  }

  function itemFile(p, it, texKey) {
    const components = {
      'minecraft:icon': { textures: { default: texKey } },
      'minecraft:max_stack_size': Math.max(1, Math.min(64, Number(it.stackSize) || 64))
    };
    if (it.glow) {
      components['minecraft:glint'] = true;
    }
    return {
      format_version: ITEM_FORMAT,
      'minecraft:item': {
        description: {
          identifier: p.modid + ':' + it.slug,
          menu_category: { category: 'items' }
        },
        components
      }
    };
  }

  function manifest(kind, p, uuidMain, deps) {
    const version = semver(p.version);
    const isBp = kind === 'bp';
    const m = {
      format_version: 2,
      header: {
        name: p.name + (isBp ? ' (Behavior)' : ' (Resources)'),
        description: (p.description || 'Generated with ModForge') +
          (isBp ? ' — blocks, items and behaviour.' : ' — textures, names and pack icon.'),
        uuid: uuidMain,
        version,
        min_engine_version: ENGINE
      },
      modules: [
        {
          type: isBp ? 'data' : 'resources',
          description: p.name + (isBp ? ' behaviour' : ' resources'),
          uuid: uuid(p.modid + ':' + kind + ':module'),
          version
        }
      ],
      metadata: {
        authors: [p.author || 'ModForge'],
        generated_with: { modforge: ['1.0.0'] }
      }
    };
    if (deps && deps.length) m.dependencies = deps;
    return json(m);
  }

  /* ---------------- build ---------------- */
  function build(p) {
    const blocks = (p.blocks || []).filter((b) => b && b.slug);
    const items = (p.items || []).filter((i) => i && i.slug);
    const folder = ((MF.util.pascal(p.name) || 'Mod').replace(/[^A-Za-z0-9]/g, '') || 'Mod');
    const BP = folder + '_BP';
    const RP = folder + '_RP';
    const files = [];

    const rpUuid = uuid(p.modid + ':rp:header');
    const bpUuid = uuid(p.modid + ':bp:header');

    /* behavior pack */
    files.push({ path: BP + '/manifest.json', content: manifest('bp', p, bpUuid, [{ uuid: rpUuid, version: semver(p.version) }]) });

    const terrainData = {};
    const itemData = {};

    blocks.forEach((b) => {
      const side = safeId(b.slug);
      const top = side + '_top';
      files.push({ path: BP + '/blocks/' + side + '.json', content: json(blockFile(p, b, { top, side })) });

      const tex = MF.pixels.blockTextures(b);
      const sidePng = MF.pixels.dataUrl(tex.rawSide);
      const topPng = MF.pixels.dataUrl(tex.rawTop);
      files.push({ path: RP + '/textures/blocks/' + side + '.png', dataUrl: sidePng, binary: true });
      terrainData[side] = { textures: 'textures/blocks/' + side };
      if (topPng !== sidePng) {
        files.push({ path: RP + '/textures/blocks/' + top + '.png', dataUrl: topPng, binary: true });
        terrainData[top] = { textures: 'textures/blocks/' + top };
      } else {
        terrainData[top] = { textures: 'textures/blocks/' + side };
      }
    });

    items.forEach((it) => {
      const id = safeId(it.slug);
      files.push({ path: BP + '/items/' + id + '.json', content: json(itemFile(p, it, id)) });
      files.push({
        path: RP + '/textures/items/' + id + '.png',
        dataUrl: MF.pixels.dataUrl(MF.pixels.itemTexture(it)),
        binary: true
      });
      itemData[id] = { textures: 'textures/items/' + id };
    });

    /* resource pack */
    files.push({ path: RP + '/manifest.json', content: manifest('rp', p, rpUuid, null) });
    files.push({
      path: RP + '/textures/terrain_texture.json',
      content: json({
        resource_pack_name: p.modid,
        texture_name: 'atlas.terrain',
        padding: 8,
        num_mip_levels: 4,
        texture_data: terrainData
      })
    });
    if (items.length) {
      files.push({
        path: RP + '/textures/item_texture.json',
        content: json({
          resource_pack_name: p.modid,
          texture_name: 'atlas.items',
          texture_data: itemData
        })
      });
    }

    const lang = ['pack.name=' + p.name, 'pack.description=' + (p.description || 'Made with ModForge')];
    blocks.forEach((b) => {
      lang.push('tile.' + p.modid + ':' + b.slug + '.name=' + b.name);
    });
    items.forEach((it) => {
      lang.push('item.' + p.modid + ':' + it.slug + '=' + it.name);
      lang.push('item.' + p.modid + ':' + it.slug + '.name=' + it.name);
    });
    files.push({ path: RP + '/texts/en_US.lang', content: lang.join('\n') + '\n' });
    files.push({ path: RP + '/texts/languages.json', content: json(['en_US']) });

    /* pack icons */
    const iconSrc = blocks.length
      ? MF.icons.blockCanvas(blocks[0], 128)
      : (items.length ? MF.icons.itemCanvas(items[0], 128) : makeFallbackIcon(p));
    const iconUrl = iconSrc.toDataURL('image/png');
    files.push({ path: BP + '/pack_icon.png', dataUrl: iconUrl, binary: true });
    files.push({ path: RP + '/pack_icon.png', dataUrl: iconUrl, binary: true });

    files.forEach((f) => {
      f.lang = /\.json$/.test(f.path) ? 'json' : (/\.png$/.test(f.path) ? 'png' : 'text');
      f.generated = true;
      f.bedrock = true;
    });
    files.sort((a, b) => a.path.localeCompare(b.path));

    const stats = {
      total: files.length,
      json: files.filter((f) => /\.json$/.test(f.path)).length,
      png: files.filter((f) => /\.png$/.test(f.path)).length,
      blocks: blocks.length,
      items: items.length,
      bytes: files.reduce((n, f) => n + (f.dataUrl ? Math.round(f.dataUrl.length * 0.75) : f.content.length), 0)
    };

    return { files, stats, name: p.modid + '-' + p.version + '.mcaddon', folders: { bp: BP, rp: RP } };
  }

  function makeFallbackIcon(p) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0d1319';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#5ee08a';
    ctx.fillRect(24, 24, 80, 80);
    ctx.fillStyle = '#0d1319';
    ctx.fillRect(38, 38, 52, 52);
    ctx.fillStyle = '#5ee08a';
    ctx.fillRect(46, 46, 36, 36);
    return c;
  }

  function download(p, opts) {
    const built = build(p);
    const entries = built.files.map((f) => ({
      path: f.path,
      content: f.content,
      dataUrl: f.dataUrl
    }));
    MF.zip.download(entries, built.name);
    return built;
  }

  MF.bedrock = { build, download, uuid, ENGINE };
})(window.MF);
