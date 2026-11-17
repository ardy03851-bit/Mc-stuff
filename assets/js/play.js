/* ============================================================
   play.js — the "get the real game" surface.
   Three honest routes into actual Minecraft:
     1. Bedrock add-on  (iPad / iPhone / console / Windows)
     2. Java Edition    (computer, one command)
     3. Browser         (third-party Java client, no install)
   ============================================================ */
(function (MF) {
  'use strict';
  const { el, qs } = MF.util;

  const BROWSER_URL = 'https://eaglercraft.com/play';

  function svg(id) {
    const wrap = document.createElement('span');
    wrap.innerHTML = '<svg class="ic"><use href="#' + id + '"/></svg>';
    return wrap.firstChild;
  }

  function isApple() {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  }

  function route(i) {
    return (
      el('div', { class: 'play-route' + (i.primary ? ' play-route--primary' : '') }, [
        el('div', { class: 'play-route-head' }, [
          el('span', { class: 'play-route-ico' }, [svg(i.icon)]),
          el('div', { class: 'play-route-title' }, [
            el('strong', { text: i.title }),
            el('span', { class: 'play-route-tag' + (i.tagTone ? ' is-' + i.tagTone : ''), text: i.tag })
          ])
        ]),
        el('p', { class: 'play-route-p', text: i.body }),
        i.actions,
        i.foot ? el('p', { class: 'mini-note play-route-foot', text: i.foot }) : null
      ])
    );
  }

  function render(host, opts) {
    if (!host) return;
    opts = opts || {};
    const p = (MF.app && MF.app.project && MF.app.project()) || { name: 'your mod' };
    const apple = isApple();
    host.textContent = '';
    host.classList.add('play-routes');
    host.classList.toggle('is-compact', !!opts.compact);

    /* 1 — Bedrock */
    host.appendChild(route({
      primary: true,
      icon: 'i-cube',
      title: 'Minecraft app',
      tag: 'iPad · iPhone · console',
      body: 'Your blocks and items as a real Bedrock add-on — no simulation.',
      actions: el('div', { class: 'play-actions' }, [
        el('button', {
          class: 'btn btn-primary btn-block', type: 'button',
          'data-play': 'bedrock',
          html: '<svg class="ic"><use href="#i-download"/></svg><span>Download .mcaddon</span>'
        })
      ]),
      foot: apple ? 'Tap the file in Files → it opens in Minecraft.' : 'Requires Minecraft (Bedrock) 1.21.80 or newer.'
    }));

    /* 2 — Java */
    const zipBtn = el('button', {
      class: 'btn btn-sm' + (apple ? ' btn-primary' : ''), type: 'button',
      'data-play': 'java',
      html: '<svg class="ic"><use href="#i-download"/></svg><span>Project .zip</span>'
    });
    host.appendChild(route({
      icon: 'i-terminal',
      title: 'Java Edition',
      tag: apple ? 'Computer only' : 'Computer',
      body: 'The exported Gradle project boots the real client with your mod.',
      actions: apple
        ? el('div', { class: 'play-actions' }, [zipBtn])
        : el('div', { class: 'play-actions play-actions--split' }, [
          el('button', {
            class: 'btn btn-sm btn-primary', type: 'button',
            'data-play': 'launcher',
            html: '<svg class="ic"><use href="#i-play"/></svg><span>Open launcher</span>'
          }),
          zipBtn
        ]),
      foot: apple
        ? 'Java cannot run on iPad. Send the zip to a Mac or PC, then ./gradlew runClient.'
        : './gradlew runClient — needs JDK 21 on a Mac or PC.'
    }));

    /* 3 — Browser */
    host.appendChild(route({
      icon: 'i-expand',
      title: 'In your browser',
      tag: 'Any device',
      body: 'A real Java-Edition client running in a tab. Not your mod, but real Minecraft.',
      actions: el('div', { class: 'play-actions' }, [
        el('a', {
          class: 'btn btn-sm btn-block', href: BROWSER_URL, target: '_blank', rel: 'noopener noreferrer',
          html: '<svg class="ic"><use href="#i-expand"/></svg><span>Play in a new tab</span>'
        })
      ]),
      foot: 'Third-party Java 1.8.8 build, opens in a new tab.'
    }));
  }

  /* ---------------- install guide ---------------- */
  function guide(p) {
    const name = p.name || 'your mod';
    const body = el('div', { class: 'guide' });

    body.appendChild(el('p', { class: 'guide-lead', text:
      'A Bedrock add-on is the only way to run your blocks inside the real Minecraft app on iPad, iPhone and consoles. It takes about a minute.' }));

    const steps = [
      ['Download the add-on', 'Tap “Download .mcaddon”. Safari saves it to Files → Downloads.'],
      ['Open it in Minecraft', 'In Files, tap the .mcaddon file → Share → Minecraft (or just tap it and choose Minecraft). The game imports two packs: behaviour + resources.'],
      ['Turn the packs on', 'Create a world (or edit an existing one) → Add-ons → Behaviour packs → My packs → activate “' + name + ' (Behavior)”. The resource pack comes with it.'],
      ['Find your blocks', 'Creative inventory → Construction (blocks) and Items (items). Type your block name in the search box.'],
      ['Nothing showed up?', 'Minecraft must be 1.21.80 or newer (the App Store updates it automatically). Re-open the world after activating the packs.']
    ];
    steps.forEach(([title, text], i) => {
      body.appendChild(el('div', { class: 'guide-step' }, [
        el('span', { class: 'guide-num', text: String(i + 1) }),
        el('div', {}, [
          el('strong', { text: title }),
          el('p', { text })
        ])
      ]));
    });

    body.appendChild(el('div', { class: 'guide-callout' }, [
      el('strong', { text: 'Why not Java?' }),
      el('p', { text: 'Minecraft Java Edition needs a JVM and a desktop OpenGL window. iPadOS has neither, and no website can start one — so the Java export runs on a Mac or PC, and the Bedrock add-on is the real-game route on iPad.' })
    ]));

    MF.sheet.open({
      title: 'Install in Minecraft',
      body,
      footer: [
        el('button', { class: 'btn btn-ghost btn-lg', type: 'button', 'data-sheet-close': '1', text: 'Close' }),
        el('button', {
          class: 'btn btn-primary btn-lg', type: 'button',
          'data-play': 'bedrock',
          html: '<svg class="ic"><use href="#i-download"/></svg><span>Download .mcaddon</span>'
        })
      ]
    });
  }

  /* ---------------- actions ---------------- */
  function downloadBedrock() {
    const p = MF.app.project();
    try {
      const built = MF.bedrock.download(p);
      MF.toast('Add-on ready — ' + built.stats.blocks + ' blocks, ' + built.stats.items + ' items', 'ok');
      MF.util.haptic(12);
      setTimeout(() => guide(p), 420);
    } catch (err) {
      console.error(err);
      MF.toast('Could not build the add-on', 'err');
    }
  }

  function openLauncher() {
    const p = MF.app.project();
    try {
      location.href = 'minecraft://';
    } catch (err) { /* ignored */ }
    MF.toast('Opening the Minecraft launcher…', 'ok');
    setTimeout(() => {
      if (isApple()) {
        MF.toast('No Java client on iPad — the launcher only exists on a computer', 'err');
      } else {
        MF.toast('If nothing opened, install the Minecraft Launcher, then run the exported project', 'info');
      }
    }, 1400);
    return p;
  }

  function bind() {
    document.addEventListener('click', (e) => {
      const act = e.target.closest('[data-play]');
      if (act) {
        const kind = act.getAttribute('data-play');
        if (kind === 'bedrock') downloadBedrock();
        else if (kind === 'launcher') openLauncher();
        else if (kind === 'java') MF.app.downloadProject();
        return;
      }
      const help = e.target.closest('[data-play-help]');
      if (help) guide(MF.app.project());
      if (e.target.closest('#mc-real')) guide(MF.app.project());
    });
  }

  MF.play = { render, guide, bind, BROWSER_URL };
})(window.MF);
