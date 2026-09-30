/* Gotham Consult · v2 page behaviour: menu, mega panel, language, next forum, counters, Ask Gotham.
   Everything degrades: without JavaScript the links still go where they say. */
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* static files may come from a faster host than the page (see build.py ASSET_URL); API calls stay on the page's own address */
  const ASSET = (() => { try { return new URL(document.currentScript.src).origin; } catch { return ''; } })();
  let itemsP = null; const items = () => itemsP ||= fetch('/api/items').then(r => r.json());
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---- desktop mega panel ---- */
  const nb = $('.nav button.nb'), mega = $('#mega-services');
  const setMega = open => { if (!nb) return; nb.setAttribute('aria-expanded', open); mega.hidden = !open; };
  nb?.addEventListener('click', e => { e.stopPropagation(); setMega(mega.hidden); closeLang(); });
  mega?.addEventListener('click', e => e.stopPropagation());

  /* ---- language (EN / FR / ES) ---- */
  const langb = $('.langb'), langp = $('#langp');
  const closeLang = () => { if (langp) { langp.hidden = true; langb?.setAttribute('aria-expanded', 'false'); } };
  langb?.addEventListener('click', e => { e.stopPropagation(); const open = langp.hidden; setMega(false); langp.hidden = !open; langb.setAttribute('aria-expanded', open); });
  langp?.addEventListener('click', e => e.stopPropagation());
  let current = 'en'; try { current = localStorage.getItem('gc-language') || 'en'; } catch {}
  const markLang = l => {
    current = l; $$('[data-lang-code]').forEach(e => e.textContent = l.toUpperCase());
    $$('[data-lang]').forEach(b => b.setAttribute('aria-current', b.dataset.lang === l));
  };
  /* translations: English is in the HTML; French/Spanish come from i18n.js, loaded only when chosen.
     Text nodes and a few attributes are swapped in place; the English original is kept so switching back is exact. */
  let dict = {}; const dictReady = {};
  const loadDict = l => dictReady[l] ||= new Promise(res => {
    const sc = document.createElement('script'); sc.src = ASSET + '/assets/v2/i18n-' + l + '.js?v=15';
    sc.onload = () => { dict = window.GC_I18N || {}; res(); }; sc.onerror = () => res(); document.head.append(sc);
  });
  const ORIG = new WeakMap(), ATTR = ['placeholder', 'aria-label', 'alt', 'title'];
  /* text the back office fills in (dates, seats left, "a · b · c" lines) is translated by pattern or piece by piece */
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const pat = (k, lang) => {
    let m;
    if ((m = k.match(/^(\d+) of (\d+) seats (left|still open)$/))) return lang === 'fr' ? `${m[1]} places ${m[3] === 'left' ? 'restantes' : 'encore disponibles'} sur ${m[2]}` : `${m[1]} de ${m[2]} plazas ${m[3] === 'left' ? 'disponibles' : 'aún disponibles'}`;
    if ((m = k.match(/^(\d+) seats left(\.?)$/))) return (lang === 'fr' ? `${m[1]} places restantes` : `Quedan ${m[1]} plazas`) + m[2];
    if ((m = k.match(/^(?:(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),? )?(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/))) {
      const d = new Date(Date.UTC(+m[4], MONTHS.indexOf(m[3]), +m[2], 12));
      return d.toLocaleDateString(lang, { ...(m[1] ? { weekday: 'long' } : {}), day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    }
    return null;
  };
  const tr = (txt, lang) => {
    if (lang === 'en' || !dict?.[lang]) return null; const k = txt.replace(/\s+/g, ' ').trim(); if (!k) return null;
    const one = x => dict[lang][x] ?? pat(x, lang);
    const t = one(k); if (t != null) return t;
    if (k.includes(' · ')) { const parts = k.split(' · '), out = parts.map(x => one(x.trim()) ?? x); return out.some((x, i) => x !== parts[i]) ? out.join(' · ') : null; }
    return null;
  };
  function applyNode(node, lang) {
    if (node.nodeType === 3) {
      const p = node.parentElement; if (!p || p.closest('script,style,svg,noscript,[data-no-tr]')) return;
      if (!ORIG.has(node)) ORIG.set(node, node.nodeValue);
      const en = ORIG.get(node), t = tr(en, lang);
      const want = t == null ? en : en.match(/^\s*/)[0] + t + en.match(/\s*$/)[0];
      if (node.nodeValue !== want) node.nodeValue = want;
    } else if (node.nodeType === 1) {
      if (node.closest('script,style,svg,noscript,[data-no-tr]')) return;
      for (const at of ATTR) if (node.hasAttribute(at)) {
        const key = 'data-en-' + at; if (!node.hasAttribute(key)) node.setAttribute(key, node.getAttribute(at));
        const en = node.getAttribute(key), t = tr(en, lang); node.setAttribute(at, t ?? en);
      }
      const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (n.nodeType === 3) applyNode(n, lang);
        else for (const at of ATTR) if (n.hasAttribute(at)) { const key = 'data-en-' + at; if (!n.hasAttribute(key)) n.setAttribute(key, n.getAttribute(at)); const en = n.getAttribute(key), t = tr(en, lang); n.setAttribute(at, t ?? en); }
      }
    }
  }
  let observing = false;
  // one translator for every page (the older pages' own landing-i18n is no longer loaded; its phrases are in i18n.js)
  const legacy = false;
  const roots = () => legacy ? $$('.v2c') : [document.body];
  const mine = n => !legacy || (n.nodeType === 1 ? n : n.parentElement)?.closest?.('.v2c');
  const mo = new MutationObserver(rs => { if (current === 'en') return; for (const r of rs) {
    if (r.type === 'characterData') {   // a page script rewrote a text node: take its new English as the original, unless the change was ours
      const n = r.target, en = ORIG.get(n), t = en != null ? tr(en, current) : null;
      if (t != null && n.nodeValue.trim() === t.trim()) continue;
      ORIG.delete(n); if (mine(n)) applyNode(n, current); continue;
    }
    for (const n of r.addedNodes) if (mine(n)) applyNode(n, current); } });
  const setLang = async l => {
    markLang(l); try { localStorage.setItem('gc-language', l); } catch {}
    document.documentElement.lang = l;
    if (l !== 'en') await loadDict(l);
    if (l === 'en' && !Object.keys(dict).length) { const old = $('#gc-language-switch select'); if (old && old.value !== 'en') { old.value = 'en'; old.dispatchEvent(new Event('change')); } return; }
    roots().forEach(r => applyNode(r, l));
    if (!observing) { mo.observe(document.body, { childList: true, subtree: true, characterData: true }); observing = true; }
    const old = $('#gc-language-switch select');   // older pages: switch their own translation too
    if (old && old.value !== l) { old.value = l; old.dispatchEvent(new Event('change')); }
  };
  /* real French pages live at /fr/...: the switch moves between the twins; Spanish stays an in-page translation */
  const pageLang = document.documentElement.dataset.pageLang || 'en';
  const twin = l => { const t = $(`link[rel="alternate"][hreflang="${l}"]`); return t && new URL(t.href).pathname + location.search + location.hash; };   // same address the visitor is on
  const choose = l => {
    try { localStorage.setItem('gc-language', l); } catch {}
    if (l === 'fr' && pageLang !== 'fr' && twin('fr')) return location.assign(twin('fr'));
    if (pageLang === 'fr' && l !== 'fr' && twin('en')) return location.assign(twin('en'));
    setLang(l);
  };
  $$('[data-lang]').forEach(b => b.addEventListener('click', () => { choose(b.dataset.lang); closeLang(); }));
  if (pageLang === 'fr') current = 'fr';
  markLang(current); if (current !== 'en') setLang(current);

  document.addEventListener('click', () => { setMega(false); closeLang(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!mega?.hidden) { setMega(false); nb.focus(); } closeLang(); } });

  /* ---- phone menu: full-screen sheet with a sliding Services pane ---- */
  const sheet = $('#sheet'), panes = $('.panes', sheet), p0 = $('.p0', sheet), p1 = $('.p1', sheet);
  const setPane = (name, focus = true) => {
    const sub = name === 'services';
    panes.dataset.level = sub ? '1' : '0';
    p0.inert = sub; p1.inert = !sub;
    if (focus) setTimeout(() => (sub ? $('.back', p1) : $('[data-pane="services"]', p0))?.focus({ preventScroll: true }), 60);
  };
  const openSheet = (name = 'root') => {
    setPane(name, false);
    sheet.showModal ? sheet.showModal() : sheet.setAttribute('open', '');
    document.documentElement.style.overflow = 'hidden';
    if (name === 'services') setTimeout(() => $('.back', p1)?.focus({ preventScroll: true }), 60);
  };
  const closeSheet = () => { sheet.close ? sheet.close() : sheet.removeAttribute('open'); document.documentElement.style.overflow = ''; };
  $('.gh-act .menub')?.addEventListener('click', () => openSheet('root'));
  sheet?.addEventListener('close', () => { document.documentElement.style.overflow = ''; });
  $$('[data-close]', sheet).forEach(b => b.addEventListener('click', closeSheet));
  $$('[data-pane]', sheet).forEach(b => b.addEventListener('click', () => setPane(b.dataset.pane)));
  $$('a', sheet).forEach(a => a.addEventListener('click', closeSheet));
  addEventListener('resize', () => { if (innerWidth >= 1080 && sheet?.open) closeSheet(); });
  /* dock */
  $$('[data-open-pane]').forEach(b => b.addEventListener('click', () => openSheet(b.dataset.openPane)));
  $$('[data-open-chat]').forEach(b => b.addEventListener('click', () => openChat()));



  /* ---- 3D services carousel ---- */
  const car = $('[data-car]');
  if (car) {
    const stage = $('.car-stage', car), ring = $('.car-ring', car), cards = $$('.car-card', car), N = cards.length, step = 360 / N;
    const chips = $$('.car-rail [data-go]', car), rail = $('.car-rail', car), askBtn = $('[data-car-ask]', car);
    let idx = 0, rot = 0, timer = null, drag = null, moved = false;
    // Safari does not start lazy images inside a 3D ring: load them once the carousel comes near the screen
    const wake = () => cards.forEach(c => { const im = $('img', c); if (im && im.loading === 'lazy') im.loading = 'eager'; });
    if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { wake(); io.disconnect(); } }, { rootMargin: '600px 0px' }); io.observe(stage); } else wake();
    /* one animation loop drives the ring: buttons, auto-play, pointing, rail, drag and trackpad all just set a target angle */
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    let cur = 0, tilt = 0, tiltT = 0, raf = 0, shown = -1, idle = 0;
    const nearest = r => ((Math.round(-r / step) % N) + N) % N;
    const shortName = i => (chips[i] && $('span', chips[i]).textContent) || $('b', cards[i]).textContent;
    const faces = n => {
      cards.forEach((c, i) => { const d = Math.min((i - n + N) % N, (n - i + N) % N);
        c.classList.toggle('front', d === 0); c.classList.toggle('side', d === 1); c.classList.toggle('far', d === 2); c.classList.toggle('back', d > 2);
        c.tabIndex = d === 0 ? 0 : -1; c.setAttribute('aria-hidden', d > 1);
        if (d !== 0) { c.style.removeProperty('--tx'); c.style.removeProperty('--ty'); } });
      chips.forEach((b, i) => { b.setAttribute('aria-pressed', i === n); b.classList.toggle('on', i === n); });
      const on = chips[n];
      if (on && rail && rail.scrollWidth > rail.clientWidth) rail.scrollTo({ left: on.offsetLeft - rail.clientWidth / 2 + on.offsetWidth / 2, behavior: reduce ? 'auto' : 'smooth' });
      $('[data-car-num]', car).textContent = String(n + 1).padStart(2, '0');
      $('[data-car-title]', car).textContent = $('b', cards[n]).textContent;
      const an = $('[data-car-askname]', car); if (an) an.textContent = shortName(n);
    };
    const loop = () => {
      const k = reduce ? 1 : .12;
      cur += (rot - cur) * k; tilt += (tiltT - tilt) * (reduce ? 1 : .08);
      ring.style.setProperty('--rot', cur.toFixed(3) + 'deg'); ring.style.setProperty('--tilt', tilt.toFixed(3) + 'deg');
      const n = nearest(cur); if (n !== shown) { shown = n; faces(n); }
      raf = (Math.abs(rot - cur) > .02 || Math.abs(tiltT - tilt) > .02) ? requestAnimationFrame(loop) : 0;
      if (!raf) { cur = rot; tilt = tiltT; ring.style.setProperty('--rot', cur + 'deg'); }
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    const render = () => kick();
    const settle = (ms = 220) => { clearTimeout(idle); idle = setTimeout(() => { rot = Math.round(rot / step) * step; idx = nearest(rot); kick(); }, ms); };
    const go = n => { const base = Math.round(rot / step) * step, from = nearest(base); const diff = ((n - from) % N + N + N / 2) % N - N / 2; idx = ((n % N) + N) % N; rot = base - diff * step; render(); };
    const auto = on => { clearInterval(timer); if (on && !reduce) timer = setInterval(() => go(idx + 1), 5000); };
    $('[data-car-prev]', car).addEventListener('click', () => { go(idx - 1); auto(false); });
    $('[data-car-next]', car).addEventListener('click', () => { go(idx + 1); auto(false); });
    car.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { go(idx + 1); auto(false); } if (e.key === 'ArrowLeft') { go(idx - 1); auto(false); } });
    ['mouseenter', 'focusin', 'touchstart'].forEach(ev => car.addEventListener(ev, () => auto(false), { passive: true }));
    car.addEventListener('mouseleave', () => auto(true));
    // the rail: every practice by name; tap or point at one and the ring turns to it
    let chipT = 0;
    chips.forEach((b, i) => {
      b.addEventListener('click', () => { go(i); auto(false); });
      if (fine) { b.addEventListener('pointerenter', () => { clearTimeout(chipT); chipT = setTimeout(() => go(i), 140); }); b.addEventListener('pointerleave', () => clearTimeout(chipT)); }
    });
    // Ask AI about the practice in front: opens the chat with the question already asked
    askBtn?.addEventListener('click', () => { const t = $('b', cards[nearest(cur)]).textContent; openChat(); ask(`What can Gotham Consult do for me in ${t}?`); });
    // mouse: point at a card and it turns to you; the front card leans toward the cursor and catches the light
    if (fine && !reduce) {
      /* after a card turns to you, the next one only turns once the mouse has really moved (no runaway spinning) */
      let dwell = 0, anchor = null, mx = 0, my = 0;
      stage.addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });
      cards.forEach((c, i) => {
        c.addEventListener('pointerenter', e => { if (e.pointerType !== 'mouse' || drag?.active) return; clearTimeout(dwell);
          if (i === idx) return;
          dwell = setTimeout(() => {
            if (anchor && Math.hypot(mx - anchor.x, my - anchor.y) < 40) return;
            anchor = { x: mx, y: my }; go(i); auto(false);
          }, 260); });
        c.addEventListener('pointerleave', () => { clearTimeout(dwell); c.style.removeProperty('--tx'); c.style.removeProperty('--ty'); });
        c.addEventListener('pointermove', e => {
          if (e.pointerType !== 'mouse' || i !== nearest(cur)) return;
          const r = c.getBoundingClientRect(), x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
          c.style.setProperty('--tx', ((.5 - y) * 12).toFixed(2) + 'deg'); c.style.setProperty('--ty', ((x - .5) * 16).toFixed(2) + 'deg');
          c.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); c.style.setProperty('--my', (y * 100).toFixed(1) + '%');
        });
      });
      stage.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; const r = stage.getBoundingClientRect(); tiltT = ((e.clientY - r.top) / r.height - .5) * -5; kick(); });
      stage.addEventListener('pointerleave', () => { tiltT = 0; kick(); });
    }
    // trackpad: a sideways two-finger swipe turns the ring; up/down still scrolls the page
    stage.addEventListener('wheel', e => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.2) return;
      e.preventDefault(); auto(false); rot -= e.deltaX * .22; kick(); settle(180);
    }, { passive: false });
    // drag / swipe: horizontal moves turn the ring, vertical swipes still scroll the page
    stage.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, rot, idx, active: false }; moved = false; auto(false); clearTimeout(idle); });
    stage.addEventListener('pointermove', e => {
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.active) { if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return; drag.active = true; stage.classList.add('drag'); stage.setPointerCapture(e.pointerId); }
      moved = true; rot = drag.rot + dx / (stage.clientWidth / 1.4) * step * 2; kick();
    });
    const end = () => { if (!drag) return; const was = drag; drag = null; stage.classList.remove('drag'); if (!was.active) return;
      rot = Math.round(rot / step) * step; idx = nearest(rot); kick(); };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    cards.forEach((c, i) => c.addEventListener('click', e => { if (moved) { e.preventDefault(); moved = false; return; } if (i !== nearest(cur)) { e.preventDefault(); go(i); } }));
    if ('IntersectionObserver' in window) new IntersectionObserver(es => auto(es[0].isIntersecting)).observe(car); else auto(true);
    render();
  }

  /* ---- current page in the menu ---- */
  const here = location.pathname.replace(/\/$/, '');
  const navKey = /^\/(services|mining)/.test(here) ? 'services' : here.startsWith('/invest') ? 'invest'
    : here.startsWith('/forums') ? 'forums' : here.startsWith('/about') ? (location.hash === '#contact' ? 'contact' : 'about') : '';
  $$('[data-nav]').forEach(a => { if (a.dataset.nav === navKey) { a.tagName === 'A' ? a.setAttribute('aria-current', 'page') : a.classList.add('cur'); } });

  /* ---- tabs (packages, country lenses): arrow keys move between tabs ---- */
  /* pages that still run their own scripts (register, Family Desk, tools, legal) keep their own forms and tabs: only the shared chrome runs there */
  const LEG = document.body.classList.contains('v2-legacy');
  if (!LEG) $$('[role="tablist"]').forEach(list => {
    const tabs = $$('[role="tab"]', list);
    const pick = t => tabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; const pnl = document.getElementById(x.getAttribute('aria-controls')); if (pnl) pnl.hidden = !on; });
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => pick(t));
      t.addEventListener('keydown', e => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; e.preventDefault(); const n = tabs[(i + d + tabs.length) % tabs.length]; pick(n); n.focus(); });
    });
  });

  /* ---- forums page: every upcoming event, live from the back office ---- */
  const LOC = () => ({ fr: 'fr-FR', es: 'es-ES' })[current] || 'en-GB';
  const TZ = { timeZone: 'Africa/Accra' };
  const icsT = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const evEnd = i => i.ends_at && new Date(i.ends_at) > new Date(i.starts_at) ? i.ends_at : new Date(new Date(i.starts_at).getTime() + 3 * 36e5).toISOString();
  /* "Add to calendar": Google, the .ics file (iPhone, Mac, Outlook desktop), Outlook.com */
  const addCal = i => {
    const url = location.origin + '/register?e=' + encodeURIComponent(i.code), about = [i.summary || i.subtitle || '', 'Register: ' + url].filter(Boolean).join('\n\n');
    const g = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(i.title) + '&dates=' + icsT(i.starts_at) + '/' + icsT(evEnd(i))
      + '&details=' + encodeURIComponent(about) + '&location=' + encodeURIComponent(i.venue || '') + '&ctz=Africa/Accra';
    const o = 'https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=' + encodeURIComponent(i.title)
      + '&startdt=' + encodeURIComponent(new Date(i.starts_at).toISOString()) + '&enddt=' + encodeURIComponent(evEnd(i)) + '&location=' + encodeURIComponent(i.venue || '') + '&body=' + encodeURIComponent(about);
    return `<details class="addcal"><summary>Add to calendar</summary><div class="addcal-m">
      <a href="${esc(g)}" target="_blank" rel="noopener">Google Calendar</a>
      <a href="/cal/event/${encodeURIComponent(i.code)}.ics" download>Apple or Outlook (.ics)</a>
      <a href="${esc(o)}" target="_blank" rel="noopener">Outlook.com</a></div></details>`;
  };
  const evWrap = LEG ? null : $('div.events#events');
  if (evWrap) items().then(d => {
    const ev = (d.items || []).filter(i => i.kind === 'event' && i.phase !== 'past' && i.starts_at && new Date(i.starts_at) > Date.now() - 864e5)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    if (!ev.length) return;
    const tz = TZ;
    evWrap.innerHTML = ev.map(i => {
      const t = new Date(i.starts_at), img = i.cover_image?.sizes?.md?.webp || i.cover_image?.sizes?.lg?.webp || ASSET + '/img/forum.webp';
      const price = Number(i.price) ? 'GHS ' + Number(i.price).toLocaleString('en-GH') : 'Free';
      const time = t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...tz });
      const day = t.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', ...tz });
      return `<article class="event" id="ev-${esc(i.code)}"><div class="cov" style="background-image:url('${esc(img)}')"><div class="date"><b>${t.toLocaleDateString('en-GB', { day: 'numeric', ...tz })}</b><span>${t.toLocaleDateString('en-GB', { month: 'short', ...tz })}</span></div></div>
        <div class="body"><h3>${esc(i.title)}</h3><div class="meta">${i.approval ? '<span class="pill">By invitation</span>' : ''}<span class="pill teal">${esc(price)}</span><span class="pill gray">${esc(day)} · ${esc(time)}</span>${i.venue ? `<span class="pill gray">${esc(i.venue)}</span>` : ''}</div>
        ${(i.summary || i.subtitle) ? `<p>${esc(i.summary || i.subtitle)}</p>` : ''}
        <div class="ev-acts"><a class="btn btn-gold" href="/register?e=${encodeURIComponent(i.code)}">${i.approval ? 'Request your invitation' : 'Reserve your seat'} <span class="arrow">→</span></a><a class="btn btn-line" href="/events/${encodeURIComponent(i.slug || i.code)}">Details</a>${addCal(i)}</div></div></article>`;
    }).join('');
  }).catch(() => {});

  /* ---- past events: a strip of cards with their photos (home and forums) ---- */
  const peBoxes = LEG ? [] : $$('[data-past-events]');
  if (peBoxes.length) items().then(d => {
    const past = (d.items || []).filter(i => i.kind === 'event' && (i.phase === 'past' || (i.starts_at && new Date(i.ends_at || i.starts_at) < Date.now() - 3 * 36e5)))
      .sort((a, b) => (b.starts_at ? +new Date(b.starts_at) : 0) - (a.starts_at ? +new Date(a.starts_at) : 0)).slice(0, 4);
    if (!past.length) return;
    const html = past.map(i => {
      const im = i.cover_image?.sizes?.card || (i.images || []).find(m => m.sizes?.card)?.sizes?.card, n = (i.images || []).length, v = (i.images || []).filter(m => m.kind === 'video').length;
      const when = i.starts_at ? new Date(i.starts_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...TZ }) : 'Past event';
      return `<a class="pe" href="/events/${encodeURIComponent(i.slug || i.code)}">${im ? `<img src="${esc(im.webp)}" alt="" loading="lazy" decoding="async" width="${im.w}" height="${im.h}">` : '<span class="pe-ph"></span>'}
        <span class="pe-b"><small>${esc(when)}${n ? ' · ' + [[n - v, 'photo'], [v, 'video']].filter(x => x[0]).map(x => x[0] + ' ' + x[1] + (x[0] > 1 ? 's' : '')).join(', ') : ''}</small><b>${esc(i.title)}</b></span></a>`;
    }).join('');
    peBoxes.forEach(b => { $('[data-pe-row]', b).innerHTML = html; b.hidden = false; });
  }).catch(() => {});

  /* ---- forums page: the calendar ---- */
  const gcal = LEG ? null : $('#gcal');
  if (gcal) {
    const feed = location.host + '/cal/events.ics';
    $('[data-cal-sub]').href = 'webcal://' + feed;
    $('[data-cal-gsub]').href = 'https://calendar.google.com/calendar/render?cid=' + encodeURIComponent('webcal://' + feed);
    let all = [], month = null, picked = null;
    const ymd = d => new Date(d).toLocaleDateString('en-CA', TZ);           // YYYY-MM-DD in Accra
    const draw = () => {
      const [y, m] = month.split('-').map(Number), first = new Date(Date.UTC(y, m - 1, 1, 12));
      const lead = (first.getUTCDay() + 6) % 7, days = new Date(Date.UTC(y, m, 0)).getUTCDate(), today = ymd(Date.now());
      $('[data-cal-title]', gcal).textContent = first.toLocaleDateString(LOC(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
      $('[data-cal-wd]', gcal).innerHTML = Array.from({ length: 7 }, (_, k) => `<span>${new Date(Date.UTC(2026, 5, 1 + k, 12)).toLocaleDateString(LOC(), { weekday: 'short', timeZone: 'UTC' })}</span>`).join('');
      const by = {}; all.forEach(i => (by[ymd(i.starts_at)] ||= []).push(i));
      const narrow = matchMedia('(max-width: 420px)').matches;   // smallest phones: the grid is a picture, the list below is what you tap
      let html = '';
      for (let k = 0; k < lead; k++) html += '<span class="gcal-d blank"></span>';
      for (let n = 1; n <= days; n++) {
        const key = `${month}-${String(n).padStart(2, '0')}`, L = by[key] || [], past = key < today;
        html += L.length && narrow
          ? `<span class="gcal-d has${past ? ' past' : ''}${key === today ? ' today' : ''}${key === picked ? ' on' : ''}" aria-hidden="true"><b>${n}</b></span>`
          : L.length
          ? `<button type="button" class="gcal-d has${past ? ' past' : ''}${key === today ? ' today' : ''}${key === picked ? ' on' : ''}" data-day="${key}" aria-label="${esc(n + ' · ' + L.map(i => i.title).join(', '))}">
              <b>${n}</b><span class="gcal-t">${esc(L[0].title)}${L.length > 1 ? ' +' + (L.length - 1) : ''}</span></button>`
          : `<span class="gcal-d${key === today ? ' today' : ''}"><b>${n}</b></span>`;
      }
      const inMonth = all.filter(i => ymd(i.starts_at).startsWith(month));
      if (narrow && inMonth.length) html += `<div class="gcal-list">${inMonth.map(i => `<button type="button" class="gcal-li${ymd(i.starts_at) === picked ? ' on' : ''}" data-day="${ymd(i.starts_at)}">
          <b>${esc(new Date(i.starts_at).toLocaleDateString(LOC(), { day: 'numeric', month: 'short', ...TZ }))}</b><span>${esc(i.title)}</span></button>`).join('')}</div>`;
      $('[data-cal-grid]', gcal).innerHTML = html;
      $$('[data-day]', gcal).forEach(b => b.addEventListener('click', () => { picked = b.dataset.day; draw(); show(by[picked] || []); }));
      const firstM = all.length ? ymd(all[0].starts_at).slice(0, 7) : month, lastM = all.length ? ymd(all[all.length - 1].starts_at).slice(0, 7) : month;
      $('[data-cal-prev]', gcal).disabled = month <= firstM; $('[data-cal-next]', gcal).disabled = month >= lastM;
    };
    const show = L => {
      const pop = $('[data-cal-pop]', gcal);
      pop.hidden = !L.length;
      pop.innerHTML = L.map(i => {
        const t = new Date(i.starts_at), past = new Date(evEnd(i)) < Date.now();
        return `<article class="gcal-ev${past ? ' past' : ''}"><p class="gcal-when">${esc(t.toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'long', ...TZ }))} · ${esc(t.toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit', ...TZ }))}${i.venue ? ' · ' + esc(i.venue) : ''}</p>
          <h4>${esc(i.title)}</h4>${(i.summary || i.subtitle) ? `<p>${esc(i.summary || i.subtitle)}</p>` : ''}
          <div class="ev-acts">${past ? '<span class="pill gray">Past event</span>' : `<a class="btn btn-gold" href="/register?e=${encodeURIComponent(i.code)}">${i.approval ? 'Request your invitation' : 'Reserve your seat'} <span class="arrow">→</span></a>${addCal(i)}`}</div></article>`;
      }).join('');
    };
    const step = n => { const [y, m] = month.split('-').map(Number), d = new Date(Date.UTC(y, m - 1 + n, 1)); month = d.toISOString().slice(0, 7); picked = null; show([]); draw(); };
    matchMedia('(max-width: 420px)').addEventListener?.('change', () => { if (month) draw(); });
    $('[data-cal-prev]', gcal).addEventListener('click', () => step(-1));
    $('[data-cal-next]', gcal).addEventListener('click', () => step(1));
    $$('[data-lang]').forEach(b => b.addEventListener('click', () => setTimeout(() => { if (month) { draw(); if (picked) show(all.filter(i => ymd(i.starts_at) === picked)); } }, 60)));
    items().then(d => {
      all = (d.items || []).filter(i => ['event', 'briefing'].includes(i.kind) && i.starts_at).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
      const next = all.find(i => new Date(evEnd(i)) > Date.now()) || all[all.length - 1];
      month = next ? ymd(next.starts_at).slice(0, 7) : ymd(Date.now()).slice(0, 7);
      picked = next ? ymd(next.starts_at) : null;
      draw(); if (picked) show(all.filter(i => ymd(i.starts_at) === picked));
    }).catch(() => { month = ymd(Date.now()).slice(0, 7); draw(); });
  }

  /* ---- Ghana Business Brief ---- */
  const bf = LEG ? null : $('#briefF');
  bf?.addEventListener('submit', async e => {
    e.preventDefault();
    const v = id => $('#' + id).value.trim(), note = $('#b-note');
    if (!v('b-name') || !v('b-co') || !v('b-ph') || !/^\S+@\S+\.\S+$/.test(v('b-em'))) { note.textContent = 'Please fill in your name, company, a valid email and your WhatsApp number.'; return; }
    const btn = $('button', bf); btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const r = await fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ item_code: 'BRIEF', company: v('b-co'), full_name: v('b-name'), email: v('b-em'), phone: v('b-ph'), sector: v('b-sec'), consent: true, marketing_opt_in: true, utm_source: 'website', utm_campaign: 'brief' }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'failed');
      bf.innerHTML = `<div class="ok"><b>You are on the list.</b> The first brief reaches you on the next send. Reference ${esc(d.reference)}.</div>`;
    } catch {
      note.innerHTML = 'That did not go through. <a href="https://wa.me/233550416627?text=' + encodeURIComponent('Hello Gotham Consult, please add me to the Ghana Business Brief.') + '" target="_blank" rel="noopener" style="color:inherit">Send it on WhatsApp instead →</a>';
      btn.disabled = false; btn.textContent = 'Send me the brief';
    }
  });

  /* ---- sponsorship enquiry ---- */
  const sf = LEG ? null : $('#sponF');
  sf?.addEventListener('submit', async e => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(sf).entries()), msg = $('#sponMsg'), btn = $('button', sf);
    if (!b.company?.trim() || !/^\S+@\S+\.\S+$/.test(b.email || '')) { msg.textContent = 'Please give your company and a valid email.'; return; }
    b.utm_source = 'website'; b.utm_campaign = 'sponsorship'; btn.disabled = true; msg.textContent = 'Sending…';
    try {
      const r = await fetch('/api/sponsor-enquiry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
      if (!r.ok) throw new Error(); sf.reset(); msg.textContent = 'Thank you. We will come back to you within two working days.';
    } catch { msg.innerHTML = 'That did not go through. WhatsApp us on <a href="https://wa.me/233550416627" target="_blank" rel="noopener">+233 55 041 6627</a>.'; }
    btn.disabled = false;
  });

  /* ---- partner logos ---- */
  const wall = LEG ? null : $('#wall');
  if (wall) fetch('/api/sponsors').then(r => r.json()).then(d => {
    const list = d.sponsors || []; if (!list.length) return;
    const L = { headline: 'Headline sponsor', partner: 'Partners', supporting: 'Supporting partners', listing: 'In the directory' }, by = {};
    list.forEach(s => (by[s.tier] ||= []).push(s));
    wall.innerHTML = Object.keys(L).filter(t => by[t]).map(t => `<div><h4>${L[t]}</h4><div class="logos">${by[t].map(s => {
      const inner = (s.logo ? `<img src="${esc(s.logo.sizes?.lg?.webp || s.logo.url || '')}" alt="${esc(s.name)}" loading="lazy">` : `<b>${esc(s.name)}</b>`) + (s.blurb ? `<span>${esc(s.blurb)}</span>` : '');
      return s.url ? `<a class="logo" href="${esc(s.url)}" target="_blank" rel="noopener sponsored">${inner}</a>` : `<div class="logo">${inner}</div>`; }).join('')}</div></div>`).join('');
  }).catch(() => {});

  /* ---- contact form: WhatsApp or email, nothing stored ---- */
  const cf = LEG ? null : $('#contactF');
  if (cf) {
    const text = () => `Hello Gotham Consult,\nName: ${$('#c-name').value}${$('#c-co').value ? '\nCompany: ' + $('#c-co').value : ''}\nTopic: ${$('#c-topic').value}\n\n${$('#c-msg').value}`;
    cf.addEventListener('submit', e => { e.preventDefault(); if (!$('#c-name').reportValidity()) return; open('https://wa.me/233550416627?text=' + encodeURIComponent(text()), '_blank', 'noopener'); });
    $('#c-mail')?.addEventListener('click', () => { if (!$('#c-name').reportValidity()) return; location.href = `mailto:info@gothamconsult.com?subject=${encodeURIComponent('Enquiry: ' + $('#c-topic').value)}&body=${encodeURIComponent(text())}`; });
  }

  /* ---- next forum, live from the back office ---- */
  items().then(d => {
    const ev = (d.items || []).filter(i => i.kind === 'event' && i.phase !== 'past' && i.starts_at && new Date(i.starts_at) > Date.now())
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const nx = ev[0]; if (!nx) return;
    const when = new Date(nx.starts_at);
    const day = when.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Accra' });
    const time = when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' });
    $$('[data-forum-title]').forEach(e => e.textContent = nx.title);
    $$('[data-forum-when]').forEach(e => e.textContent = `${day} · ${time}`);
    $$('[data-forum-where]').forEach(e => e.textContent = nx.venue || 'Accra');
    const price = Number(nx.price) ? 'GHS ' + Number(nx.price).toLocaleString('en-GH') : 'Free';
    $$('[data-forum-price]').forEach(e => e.textContent = price + (nx.approval ? ' · by invitation' : '') + (nx.seats_left != null ? ` · ${nx.seats_left} seats left` : ''));
    const note = nx.summary || nx.subtitle; if (note) $$('[data-forum-note]').forEach(e => e.textContent = note);
    $$('[data-forum-link]').forEach(a => { a.href = '/register?e=' + encodeURIComponent(nx.code); a.firstChild.textContent = nx.approval ? 'Request your invitation ' : 'Reserve your seat '; });
  }).catch(() => {});

  /* ---- counters (decoration; the real number is already in the HTML) ---- */
  if (!LEG && !reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return; io.unobserve(e.target);
      const el = e.target, to = +el.dataset.count, pre = el.dataset.prefix || '', suf = el.dataset.suffix || '', t0 = performance.now();
      const step = now => { const k = Math.min(1, (now - t0) / 1100), v = to * (1 - Math.pow(1 - k, 3)); el.textContent = pre + v.toFixed(1) + suf; if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }), { threshold: .6 });
    $$('[data-count]').forEach(e => io.observe(e));
  }

  /* ---- Ask Gotham ---- */
  const chat = $('#chat'), chatO = $('#chatO'), msgs = $('#msgs'), HIST = [];
  const say = (t, who) => { const m = document.createElement('div'); m.className = 'm ' + who; m.textContent = t; msgs.append(m); msgs.scrollTop = msgs.scrollHeight; return m; };
  function openChat() {
    chat.hidden = false; chatO.hidden = true; chatO.setAttribute('aria-expanded', 'true');
    if (!msgs.children.length) say('Hi, welcome to Gotham Consult. Ask me about our services, forums, prices or investing in Ghana.', 'bot');
    if (innerWidth > 520) $('#chatI').focus();
  }
  const closeChat = () => { chat.hidden = true; chatO.hidden = false; chatO.setAttribute('aria-expanded', 'false'); if (getComputedStyle(chatO).display !== 'none') chatO.focus(); };
  chatO?.addEventListener('click', openChat);
  $('#chatX')?.addEventListener('click', closeChat);
  const FALLBACK = 'Good question. Our team will answer you personally on WhatsApp: +233 55 041 6627.';
  async function ask(q) {
    say(q, 'me'); const t = say('•••', 'bot typing'); let a = '', acts = [];
    try {
      const r = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q, history: HIST.slice(-6), language: current }), signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined });
      const j = await r.json().catch(() => ({}));
      a = j.answer || (r.status === 429 ? 'You have asked a lot in a short time. Please WhatsApp us on +233 55 041 6627.' : '');
      acts = Array.isArray(j.actions) ? j.actions : [];
    } catch {}
    t.remove(); if (!a) { a = FALLBACK; acts = [{ type: 'person' }]; } say(a, 'bot');
    HIST.push({ role: 'user', content: q }, { role: 'assistant', content: a });
    if (acts.length) actions(acts, q);
  }
  /* buttons the AI can offer under its answer: register for a forum, leave your details, talk to a person */
  const WA = 'https://wa.me/233550416627?text=';
  function actions(list, q) {
    const box = document.createElement('div'); box.className = 'chat-acts';
    for (const x of list) {
      if (x.type === 'register') box.insertAdjacentHTML('beforeend', `<a class="chat-act gold" href="/register?e=${encodeURIComponent(x.code)}"><span>${x.approval ? 'Request your invitation' : 'Reserve your seat'}</span><small>${esc(x.title)}</small></a>`);
      if (x.type === 'lead') { const b = document.createElement('button'); b.type = 'button'; b.className = 'chat-act'; b.innerHTML = '<span>Leave your details</span>'; b.addEventListener('click', () => { b.disabled = true; leadForm(q); }); box.append(b); }
      if (x.type === 'person') box.insertAdjacentHTML('beforeend', `<a class="chat-act wa" target="_blank" rel="noopener" href="${WA + encodeURIComponent('Hello Gotham Consult, I was asking on your website: ' + q)}"><span>Continue on WhatsApp</span></a>`);
    }
    msgs.append(box); msgs.scrollTop = msgs.scrollHeight;
  }
  function leadForm(q) {
    const f = document.createElement('form'); f.className = 'chat-lead'; f.noValidate = true;
    f.innerHTML = `<p class="cl-h">We will get back to you</p>
      <label>Your name<input name="name" autocomplete="name" required></label>
      <label>Company (optional)<input name="company" autocomplete="organization"></label>
      <label>WhatsApp number or email<input name="contact" autocomplete="tel" inputmode="email" required></label>
      <label>What do you need?<textarea name="need" rows="2" maxlength="600">${esc(q)}</textarea></label>
      <label class="cl-ok"><input type="checkbox" name="consent"> <span>Gotham Consult may contact me about this request.</span></label>
      <p class="cl-msg" role="status"></p><button class="btn btn-gold" type="submit">Send</button>`;
    msgs.append(f); msgs.scrollTop = msgs.scrollHeight; f.querySelector('input').focus({ preventScroll: true });
    f.addEventListener('submit', async e => {
      e.preventDefault(); const v = n => f.elements[n].value.trim(), msg = $('.cl-msg', f);
      if (!v('name') || !v('contact')) { msg.textContent = 'Please add your name and a WhatsApp number or email.'; return; }
      if (!f.elements.consent.checked) { msg.textContent = 'Please tick the box so we may contact you.'; return; }
      const btn = $('button', f); btn.disabled = true;
      try {
        const r = await fetch('/api/chat-lead', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: v('name'), company: v('company'), contact: v('contact'), need: v('need'), question: q, consent: true, language: current }) });
        if (!r.ok) throw new Error(String(r.status));
        f.remove(); say('Thank you. Our team will get back to you soon.', 'bot');
      } catch { msg.textContent = 'That did not go through. Please WhatsApp us on +233 55 041 6627.'; btn.disabled = false; }
    });
  }
  const chips = ['Next forum', 'How do I pay?', 'What is GIPA Act 1173?', 'Invest in Ghana'];
  if ($('#chatChips')) $('#chatChips').innerHTML = chips.map(c => `<button type="button">${esc(c)}</button>`).join('');
  $('#chatChips')?.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') ask(e.target.textContent); });
  /* inline AI panels (service pages): a question opens the chat and asks it there */
  const askHere = q => { openChat(); ask(q); };
  $$('[data-ask]').forEach(b => b.addEventListener('click', () => askHere(b.textContent.trim())));
  $$('[data-ask-form]').forEach(f => f.addEventListener('submit', e => { e.preventDefault(); const i = f.querySelector('input'), v = i.value.trim(); if (!v) return; i.value = '';
    const topic = f.closest('[data-topic]')?.getAttribute('data-topic'); askHere(topic && !v.toLowerCase().includes(topic.toLowerCase()) ? v + ' (about ' + topic + ')' : v); }));
  $('#chatF')?.addEventListener('submit', e => { e.preventDefault(); const i = $('#chatI'), v = i.value.trim(); if (v) { i.value = ''; ask(v); } });

  /* the next page opens faster: Chrome prepares a page as soon as you point at its link; other browsers fetch it ahead */
  if (HTMLScriptElement.supports?.('speculationrules')) {
    const sr = document.createElement('script'); sr.type = 'speculationrules';
    sr.textContent = JSON.stringify({ prerender: [{ where: { and: [{ href_matches: '/*' }, { not: { href_matches: '/admin*' } }, { not: { href_matches: '/api/*' } }, { not: { selector_matches: '[target=_blank], [download]' } }] }, eagerness: 'moderate' }] });
    document.head.append(sr);
  } else {
    const warmed = new Set();
    const warm = e => { const a = e.target.closest?.('a[href]'); if (!a || a.target === '_blank') return;
      const u = new URL(a.href, location.href); if (u.origin !== location.origin || /^\/(admin|api)\b/.test(u.pathname) || u.pathname === location.pathname || warmed.has(u.pathname)) return;
      warmed.add(u.pathname); fetch(u.pathname + u.search, { credentials: 'same-origin', priority: 'low' }).catch(() => {}); };
    document.addEventListener('pointerover', warm, { passive: true }); document.addEventListener('touchstart', warm, { passive: true });
  }
  /* ---- the cedi today: live exchange rates (server caches them hourly) in the home ticker and on /invest ---- */
  const tick = $('.ticker ul'), fxBox = $('#fx-live');
  if (tick || fxBox) fetch('/api/rates').then(r => r.ok ? r.json() : null).then(d => {
    if (!d || !d.rates) return;
    const f = n => Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pairs = ['USD', 'EUR', 'GBP'].filter(c => d.rates[c]);
    const day = new Date(d.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    if (tick) {
      const li = hid => pairs.map(c => `<li${hid ? ' aria-hidden="true"' : ''}>${c}/GHS <b>${f(d.rates[c])}</b></li>`).join('');
      const first = [...tick.children].findIndex(x => x.getAttribute('aria-hidden') === 'true');
      tick.insertAdjacentHTML('afterbegin', li(false));
      if (first > -1) tick.children[first + pairs.length].insertAdjacentHTML('beforebegin', li(true));
    }
    if (fxBox) {
      fxBox.innerHTML = `<span class="fx-l">The cedi today</span>${pairs.map(c => `<b>1 ${c} = GHS ${f(d.rates[c])}</b>`).join('')}<span class="fx-s"><span>Market mid-rate, updated</span> <time datetime="${esc(d.updated)}">${esc(day)}</time>. <a href="https://www.bog.gov.gh/" target="_blank" rel="noopener">Bank of Ghana reference rate</a></span>`;
      fxBox.hidden = false;
    }
  }).catch(() => {});
  /* ---- visitor count: one small request per page, no cookies, nothing stored in the browser ---- */
  try {
    if (!navigator.webdriver && !/^\/(admin|i)\b/.test(location.pathname) && window.top === window.self) {
      const u = new URLSearchParams(location.search), utm = [u.get('utm_source'), u.get('utm_campaign')].filter(Boolean).join('/');
      const hit = JSON.stringify({ p: location.pathname, r: document.referrer, u: utm, l: document.documentElement.lang || 'en', w: innerWidth });
      if (!(navigator.sendBeacon && navigator.sendBeacon('/api/hit', new Blob([hit], { type: 'application/json' }))))
        fetch('/api/hit', { method: 'POST', body: hit, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
    }
  } catch {}
})();
