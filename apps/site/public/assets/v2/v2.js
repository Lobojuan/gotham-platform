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

  /* ---- language: English, France French, Spain Spanish, German, Arabic, Mandarin ---- */
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
  let dict = {}; const dictReady = {}; const dictionaries = {};
  const loadDict = l => dictReady[l] ||= new Promise(res => {
    const sc = document.createElement('script'); sc.src = ASSET + '/assets/v2/i18n-' + l + '.js?v=26';
    sc.onload = () => {
      const extra = document.createElement('script'); extra.src = ASSET + '/assets/v2/gipa-i18n.js?v=1';
      extra.onload = () => {
        const services = document.createElement('script'); services.src = ASSET + '/assets/v2/credit-services-i18n.js?v=1';
        const finish = () => {
          const base = window.GC_I18N || {};
          dictionaries[l] = { ...base, [l]: { ...(base[l] || {}), ...(window.GC_GIPA_I18N?.[l] || {}), ...(window.GC_CREDIT_I18N?.[l] || {}) } };
          dict = dictionaries[l]; res();
        };
        services.onload = finish; services.onerror = finish; document.head.append(services);
      };
      extra.onerror = () => { dictionaries[l] = window.GC_I18N || {}; dict = dictionaries[l]; res(); };
      document.head.append(extra);
    };
    sc.onerror = () => res(); document.head.append(sc);
  });
  const ORIG = new WeakMap(), ATTR = ['placeholder', 'aria-label', 'alt', 'title'];
  /* text the back office fills in (dates, seats left, "a · b · c" lines) is translated by pattern or piece by piece */
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const pat = (k, lang) => {
    let m;
    if ((m = k.match(/^(\d+) of (\d+) seats (left|still open)$/)) && ['de','ar','zh'].includes(lang)) return ({de:`${m[1]} von ${m[2]} Plätzen verfügbar`,ar:`${m[1]} مقاعد متاحة من أصل ${m[2]}`,zh:`共 ${m[2]} 个名额，剩余 ${m[1]} 个`})[lang];
    if ((m = k.match(/^(\d+) of (\d+) seats (left|still open)$/))) return lang === 'fr' ? `${m[1]} places ${m[3] === 'left' ? 'restantes' : 'encore disponibles'} sur ${m[2]}` : `${m[1]} de ${m[2]} plazas ${m[3] === 'left' ? 'disponibles' : 'aún disponibles'}`;
    if ((m = k.match(/^(\d+) seats left(\.?)$/)) && ['de','ar','zh'].includes(lang)) return ({de:`${m[1]} Plätze verfügbar`,ar:`${m[1]} مقاعد متاحة`,zh:`剩余 ${m[1]} 个名额`})[lang]+m[2];
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
      if (p.tagName === 'OPTION' && !p.hasAttribute('value')) p.setAttribute('value', ORIG.get(node).trim());   // the form still sends the English value
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
  let languageEpoch = 0;
  const setLang = async l => {
    const epoch = ++languageEpoch;
    markLang(l); try { localStorage.setItem('gc-language', l); } catch {}
    document.documentElement.lang = l; document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    if (l !== 'en') { await loadDict(l); if (epoch !== languageEpoch) return; dict = dictionaries[l] || {}; }
    if (l === 'en' && !Object.keys(dict).length) { const old = $('#gc-language-switch select'); if (old && old.value !== 'en') { old.value = 'en'; old.dispatchEvent(new Event('change')); } return; }
    roots().forEach(r => applyNode(r, l));
    if (!observing) { mo.observe(document.body, { childList: true, subtree: true, characterData: true }); observing = true; }
    const old = $('#gc-language-switch select');   // older pages: switch their own translation too
    if (old && old.value !== l) { old.value = l; old.dispatchEvent(new Event('change')); }
  };
  /* Explicit locale URLs win; language links preserve the current query and section. */
  const pageLang = document.documentElement.dataset.pageLang || 'en';
  const twin = l => { const t = $(`link[rel="alternate"][hreflang="${l}"]`); return t && new URL(t.href).pathname + location.search + location.hash; };   // same address the visitor is on
  const choose = l => {
    try { localStorage.setItem('gc-language', l); } catch {}
    if (l !== pageLang && twin(l)) return location.assign(twin(l));
    setLang(l);
  };
  $$('[data-lang]').forEach(b => b.addEventListener('click', e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); choose(b.dataset.lang); closeLang(); }));
  if (!['en','fr','es','de','ar','zh'].includes(current)) current='en';
  if (pageLang !== 'en') current = pageLang;
  else if (current !== 'en' && twin(current)) { location.replace(twin(current)); return; }   // carry a saved preference to the corresponding crawlable twin
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
    let idx = 0, rot = 0, timer = null, drag = null, moved = false, userPaused = false;
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
    const auto = on => { clearInterval(timer); if (on && !reduce && !userPaused) timer = setInterval(() => go(idx + 1), 5000); };
    const autoToggle = $('[data-car-toggle]', car);
    if (autoToggle) autoToggle.addEventListener('click', () => {
      userPaused = !userPaused;
      autoToggle.textContent = userPaused ? 'Resume auto-rotation' : 'Pause auto-rotation';
      autoToggle.setAttribute('aria-pressed', String(userPaused));
      auto(!userPaused);
    });
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
  const here = location.pathname.replace(/^\/(fr|es|de|ar|zh)(?=\/|$)/, '').replace(/\/$/, '');
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
  const LOC = () => ({ fr: 'fr-FR', es: 'es-ES', de:'de-DE', ar:'ar-u-nu-latn', zh:'zh-CN' })[current] || 'en-GB';
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

  /* ---- website enquiries are recorded in the CRM and acknowledged by email ---- */
  const cf = LEG ? null : $('#contactF');
  if (cf) {
    cf.addEventListener('submit', async e => {
      e.preventDefault(); if (!cf.reportValidity()) return;
      const button = cf.querySelector('button[type="submit"]'), status = $('#c-status');
      const topic = $('#c-topic').selectedOptions[0]?.textContent || $('#c-topic').value;
      button.disabled = true; status.textContent = 'Sending your enquiry…';
      try {
        const r = await fetch('/api/site-enquiry', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'contact', name: $('#c-name').value.trim(), email: $('#c-email').value.trim(),
            company: $('#c-co').value.trim(), topic, message: $('#c-msg').value.trim(), consent: $('#c-consent').checked,
            language: current }) });
        const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'failed');
        status.textContent = "We've recorded your enquiry and sent a confirmation to your email. Joy and Uffe have been notified.";
        cf.reset();
      } catch (err) {
        status.textContent = err.message === 'consent_required' ? 'Please agree to the privacy notice before sending.'
          : 'We could not send your enquiry. Please try again or contact us by phone or WhatsApp.';
      } finally { button.disabled = false; }
    });
  }

  /* ---- request a call: save the lead and preferred time in CRM, then email both sides ---- */
  const bkf = LEG ? null : $('#bookF');
  if (bkf) {
    const dsel = $('#b-day'); const d = new Date(); let n = 0;
    /* Accra is GMT all year, so UTC dates are Accra dates; start tomorrow, skip weekends */
    for (d.setUTCDate(d.getUTCDate() + 1); n < 7; d.setUTCDate(d.getUTCDate() + 1)) {
      if ([0, 6].includes(d.getUTCDay())) continue; n++;
      const o = document.createElement('option'); o.value = d.toISOString().slice(0, 10);
      const dateLocale = ({ fr: 'fr-FR', es: 'es-ES', de: 'de-DE', ar: 'ar-u-nu-latn', zh: 'zh-CN' })[current] || 'en-GB';
      o.textContent = d.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
      dsel.append(o);
    }
    const label = () => `${dsel.selectedOptions[0].dataset.enText || dsel.selectedOptions[0].value} at ${$('#b-time').value} (Accra time, GMT)`;
    $$('#b-day option').forEach(o => { o.dataset.enText = o.textContent; });
    bkf.addEventListener('submit', async e => {
      e.preventDefault(); if (!bkf.reportValidity()) return;
      const button = bkf.querySelector('button[type="submit"]'), status = $('#b-status');
      button.disabled = true; status.textContent = 'Sending your request…';
      try {
        const r = await fetch('/api/site-enquiry', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'call', name: $('#b-name').value.trim(), email: $('#b-email').value.trim(),
            topic: $('#b-topic').value, preferred_day: dsel.value, preferred_time: $('#b-time').value,
            consent: $('#b-consent').checked, language: current }) });
        const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || 'failed');
        status.textContent = "Your request is saved. We emailed a confirmation; Joy or Uffe will reply to confirm availability.";
        bkf.reset(); dsel.value = dsel.options[0]?.value || '';
      } catch (err) {
        status.textContent = err.message === 'consent_required' ? 'Please agree to the privacy notice before sending.'
          : 'We could not send your request. Please try again or contact us by phone or WhatsApp.';
      } finally { button.disabled = false; }
    });
  }

  /* ---- next forum, live from the back office ---- */
  const upcomingForum = $('[data-upcoming-forum]');
  items().then(d => {
    const ev = (d.items || []).filter(i => i.kind === 'event' && i.phase !== 'past' && i.starts_at && new Date(i.starts_at) > Date.now())
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const nx = ev[0]; if (!nx) return;
    if (upcomingForum) upcomingForum.hidden = false;
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
  const voiceButton = $('#chatVoice'), playButton = $('#chatPlay'), voiceStatus = $('#chatVoiceStatus');
  const VOICE_TEXT = {
    en: { on: 'Voice on', off: 'Voice off', play: 'Play answer', stop: 'Stop speaking', ready: 'Fable · AI-generated voice', loading: 'Preparing Fable voice…', speaking: 'Fable is speaking…', blocked: 'Tap Play answer to hear Fable.', unavailable: 'Voice unavailable. You can still read the answer.', disclosure: 'Fable is an AI-generated voice made on our own server.' },
    fr: { on: 'Voix activée', off: 'Voix désactivée', play: 'Écouter la réponse', stop: 'Arrêter la voix', ready: 'Pierre · français de France · voix IA', loading: 'Préparation de la voix française…', speaking: 'Pierre parle…', blocked: 'Appuyez sur Écouter la réponse.', unavailable: 'Voix indisponible. La réponse reste lisible.', disclosure: 'Pierre est une voix française de France générée par IA sur notre serveur. Crédits : /downloads/voice-credits.txt' },
    es: { on: 'Voz activada', off: 'Voz desactivada', play: 'Escuchar respuesta', stop: 'Detener voz', ready: 'Castellano de España · voz IA', loading: 'Preparando la voz en castellano…', speaking: 'Respuesta en castellano…', blocked: 'Pulsa Escuchar respuesta para oírla.', unavailable: 'Voz no disponible. Puedes leer la respuesta.', disclosure: 'La voz de Sharvard es una voz de España generada por IA en nuestro servidor. Créditos: /downloads/voice-credits.txt' }
  };
  Object.assign(VOICE_TEXT, {
    de:{on:'Stimme an',off:'Stimme aus',play:'Antwort anhören',stop:'Sprachausgabe stoppen',ready:'Thorsten · Deutsch · KI-Stimme',loading:'Deutsche Sprachausgabe wird vorbereitet…',speaking:'Thorsten spricht…',blocked:'Tippen Sie auf Antwort anhören.',unavailable:'Stimme nicht verfügbar. Sie können die Antwort lesen.',disclosure:'Thorsten ist eine lokal erzeugte deutsche KI-Stimme. Credits: /downloads/voice-credits.txt'},
    zh:{on:'语音已开启',off:'语音已关闭',play:'播放回答',stop:'停止播放',ready:'普通话 · 人工智能语音',loading:'正在准备普通话语音…',speaking:'正在用普通话朗读回答…',blocked:'请点击播放回答。',unavailable:'语音暂不可用，您仍可阅读回答。',disclosure:'这是在我们的服务器上生成的普通话人工智能语音。来源：/downloads/voice-credits.txt'},
    ar:{on:'الصوت مفعّل',off:'الصوت متوقف',play:'استمع إلى الإجابة',stop:'أوقف الصوت',ready:'العربية الفصحى · صوت بالذكاء الاصطناعي',loading:'جارٍ إعداد الصوت العربي…',speaking:'جارٍ قراءة الإجابة بالعربية الفصحى…',blocked:'اضغطوا على استمع إلى الإجابة.',unavailable:'الصوت غير متاح. يمكنكم قراءة الإجابة.',disclosure:'صوت عربي مولّد بالذكاء الاصطناعي على خادمنا. المصدر: /downloads/voice-credits.txt'}
  });
  let voiceOn = true, voiceState = 'ready', audioContext, audioSource, audioBuffer, voiceRequest, voiceEpoch = 0, voiceJob=null, nextAudioAt=0;
  const playingSources=new Set();
  try { voiceOn = localStorage.getItem('gc-chat-voice') !== 'off'; } catch {}
  const voiceWords = () => VOICE_TEXT[current] || VOICE_TEXT.en;
  function updateVoiceUI() {
    if (!voiceButton) return; const w = voiceWords();
    voiceButton.textContent = voiceOn ? w.on : w.off; voiceButton.setAttribute('aria-pressed', String(voiceOn));
    playButton.textContent = voiceState === 'speaking' ? w.stop : w.play;
    playButton.hidden = (!audioBuffer && !playingSources.size) || !voiceOn;
    voiceStatus.textContent = w[voiceState] || w.ready; voiceButton.title = w.disclosure;
  }
  function stopVoice(clear = false) {
    voiceEpoch++; voiceRequest?.abort(); voiceRequest = null;
    if(voiceJob){fetch('/api/ask/voice/cancel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({job:voiceJob}),keepalive:true}).catch(()=>{});voiceJob=null;}
    for(const source of playingSources){source.onended=null;try{source.stop();}catch{}}playingSources.clear();nextAudioAt=0;
    audioSource=null;
    if (clear) audioBuffer = null; voiceState = 'ready'; updateVoiceUI();
  }
  // Unlock audio during the visitor's submit/tap, before waiting for the AI/network.
  function unlockVoice() {
    if (!voiceOn) return;
    try { const AC = window.AudioContext || window.webkitAudioContext; audioContext ||= new AC(); audioContext.resume().catch(() => {}); } catch {}
  }
  function queueAudio(buffer) {
    if(!voiceOn || chat.hidden)return;
    if(!audioContext || audioContext.state!=='running'){voiceState='blocked';updateVoiceUI();return;}
    const source=audioContext.createBufferSource();source.buffer=buffer;source.connect(audioContext.destination);
    playingSources.add(source);audioSource=source;
    source.onended=()=>{playingSources.delete(source);if(!playingSources.size){audioSource=null;voiceState=voiceJob?'loading':'ready';updateVoiceUI();}};
    const at=Math.max(Number(audioContext.currentTime)||0,nextAudioAt);nextAudioAt=at+(Number(buffer.duration)||0);
    voiceState='speaking';updateVoiceUI();source.start(at);
  }
  function playVoice(){if(audioBuffer && voiceOn && !chat.hidden){nextAudioAt=0;queueAudio(audioBuffer);}}
  function joinAudio(buffers){
    if(buffers.length===1)return buffers[0];
    const joined=audioContext.createBuffer(buffers[0].numberOfChannels,buffers.reduce((n,b)=>n+b.length,0),buffers[0].sampleRate);
    for(let channel=0;channel<joined.numberOfChannels;channel++){let at=0;for(const b of buffers){joined.getChannelData(channel).set(b.getChannelData(channel),at);at+=b.length;}}
    return joined;
  }
  async function speakAnswer(speech, epoch) {
    if (!voiceOn || chat.hidden || epoch !== voiceEpoch) return;
    if (!speech?.token) { voiceState = 'unavailable'; updateVoiceUI(); return; }
    voiceRequest = new AbortController(); const request = voiceRequest;
    const timeout = setTimeout(() => request.abort(), 10 * 60e3);
    voiceState = 'loading'; updateVoiceUI();
    try {
      let r = await fetch('/api/ask/voice', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: speech.token, stream: true }), signal: request.signal });
      let job;const buffers=[];
      while(true){
        if(r.status===202){
          const j=await r.json();job=j.job || job;if(!/^[a-zA-Z0-9_-]{10,128}$/.test(job || ''))throw new Error('voice_unavailable');voiceJob=job;
          await new Promise(resolve=>setTimeout(resolve,Math.min(5000,Math.max(500,Number(j.retry_after)*1000 || 1000))));
        }else{
          if(!r.ok)throw new Error('voice_unavailable');
          let bytes,more;
          if(r.headers.get('content-type')?.includes('application/json')){
            const packet=await r.json();if(typeof packet.audio!=='string' || typeof packet.more!=='boolean')throw new Error('voice_unavailable');
            bytes=Uint8Array.from(atob(packet.audio),c=>c.charCodeAt(0)).buffer;more=packet.more;
          }else{if(!r.headers.get('content-type')?.includes('audio/'))throw new Error('voice_unavailable');bytes=await r.arrayBuffer();more=r.headers.get('x-voice-more')==='1';}
          if(epoch!==voiceEpoch || !voiceOn || chat.hidden)return;
          if(!audioContext)throw new Error('voice_unavailable');const decoded=await audioContext.decodeAudioData(bytes);
          if(epoch!==voiceEpoch || !voiceOn || chat.hidden)return;
          buffers.push(decoded);
          if(!more){voiceJob=null;audioBuffer=joinAudio(buffers);}queueAudio(decoded);
          if(!more)break;
        }
        if(request.signal.aborted || epoch!==voiceEpoch || !voiceOn || chat.hidden)return;
        r=await fetch('/api/ask/voice/result',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({job,packets:true}),signal:request.signal});
      }
    } catch { if (epoch === voiceEpoch) { voiceState = 'unavailable'; updateVoiceUI(); } }
    finally { clearTimeout(timeout); if (voiceRequest === request) voiceRequest = null; }
  }
  voiceButton?.addEventListener('click', () => {
    voiceOn = !voiceOn; stopVoice(); try { localStorage.setItem('gc-chat-voice', voiceOn ? 'on' : 'off'); } catch {}
    if (voiceOn) { unlockVoice(); playVoice(); } updateVoiceUI();
  });
  playButton?.addEventListener('click', async () => {
    if (voiceState === 'speaking') { stopVoice(); return; }
    unlockVoice(); try { await audioContext?.resume(); } catch {} playVoice();
  });
  new MutationObserver(() => { stopVoice(true); updateVoiceUI(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopVoice(); });
  window.addEventListener('pagehide', () => stopVoice(true)); updateVoiceUI();
  const say = (t, who) => { const m = document.createElement('div'); m.className = 'm ' + who; m.dir='auto';
    String(t).split(/(\+233[\d ]{8,16})/g).forEach(part=>{if(/^\+233/.test(part)){const bdi=document.createElement('bdi');bdi.dir='ltr';bdi.textContent=part;m.append(bdi);}else m.append(document.createTextNode(part));}); msgs.append(m); msgs.scrollTop = msgs.scrollHeight; return m; };
  const WELCOME = (()=>{try{return JSON.parse($('#ask-welcome')?.textContent || '{}');}catch{return {};}})();
  function speakIntro() {
    if (!voiceOn) return;
    unlockVoice();const epoch=voiceEpoch;
    fetch('/api/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({intro:true,language:current,speech:true}),signal:AbortSignal.timeout(30000)})
      .then(r=>r.ok?r.json():null).then(j=>{if(epoch===voiceEpoch && !chat.hidden)speakAnswer(j?.speech,epoch);}).catch(()=>{if(epoch===voiceEpoch){voiceState='unavailable';updateVoiceUI();}});
  }
  function openChat() {
    chat.hidden = false; chatO.hidden = true; chatO.setAttribute('aria-expanded', 'true');
    if (!msgs.children.length) { say(WELCOME[current] || WELCOME.en || 'Welcome to Gotham Consult. Ask me about services, business, investing in Ghana, forums, registration and payments.', 'bot'); speakIntro(); }
    if (innerWidth > 520) $('#chatI').focus();
  }
  const closeChat = () => { stopVoice(true); chat.hidden = true; chatO.hidden = false; chatO.setAttribute('aria-expanded', 'false'); if (getComputedStyle(chatO).display !== 'none') chatO.focus(); };
  chatO?.addEventListener('click', openChat);
  $('#chatX')?.addEventListener('click', closeChat);
  const FALLBACK = 'The AI is temporarily unavailable. Please try again, or browse our services at /services and forums at /forums.';
  // Known public facts remain useful when the AI provider is temporarily unavailable.
  function offlineAnswer(q) {
    const pay = /\b(pay|payment|momo|money|payer|paiement|pagar|pago|bezahl|zahlung)\b|付款|支付|الدفع|ادفع|أدفع/i.test(q);
    if (['de','ar','zh'].includes(current)) {
      if (pay) return ({de:'Zahlen Sie den auf der Anmeldeseite angegebenen Betrag an die MoMo-Nummer +233 55 041 6627. Prüfen Sie den Empfängernamen und geben Sie Ihre Anmeldereferenz an. Melden Sie anschließend die Transaktions-ID auf der Bestätigungsseite. Unser Team prüft den Zahlungseingang. Geben Sie niemals Ihre MoMo-PIN weiter.',zh:'请将报名页面显示的金额支付至 MoMo 号码 +233 55 041 6627。转账前请核对收款人姓名，使用报名参考编号，并在报名确认页面提交交易编号。工作人员会核实收款。切勿透露您的 MoMo PIN 码。',ar:'ادفعوا المبلغ الظاهر في صفحة التسجيل إلى رقم MoMo: +233 55 041 6627. تحققوا من اسم المستفيد واستخدموا الرقم المرجعي للتسجيل، ثم أبلغوا عن معرّف المعاملة على صفحة التأكيد. سيتحقق فريقنا من استلام المبلغ. لا تشاركوا الرقم السري لخدمة MoMo.'})[current];
      return ({de:'Die KI ist vorübergehend nicht verfügbar. Bitte versuchen Sie Ihre Frage hier erneut.',zh:'人工智能助手暂时无法使用，请在这里重试您的问题。',ar:'الذكاء الاصطناعي غير متاح مؤقتاً. يرجى إعادة طرح سؤالكم هنا.'})[current];
    }
    if (pay) return ({
      en: 'Pay by Mobile Money to +233 55 041 6627, Joy’s payment number. Use the amount and registration reference shown in your account, then submit the transaction ID so the team can verify it. Bank transfer details are on your invoice. Never share your MoMo PIN here.',
      fr: 'Payez par Mobile Money au +233 55 041 6627, le numéro de paiement de Joy. Utilisez le montant et la référence affichés dans votre compte, puis transmettez l’identifiant de transaction pour vérification. Les coordonnées bancaires figurent sur votre facture. Ne partagez jamais votre code PIN MoMo ici.',
      es: 'Paga por Mobile Money al +233 55 041 6627, el número de pago de Joy. Usa el importe y la referencia que aparecen en tu cuenta y envía el identificador de la transacción para su verificación. Los datos bancarios figuran en tu factura. Nunca compartas aquí tu PIN de MoMo.'
    })[current] || FALLBACK;
    return ({
      en: 'The AI is temporarily unavailable. You can find our services and published prices at /services, and upcoming forums at /forums. Please try your question again here.',
      fr: 'L’IA est temporairement indisponible. Nos services et tarifs sont sur /fr/services, et les forums sur /fr/forums. Réessayez votre question ici.',
      es: 'La IA no está disponible temporalmente. Puedes consultar servicios y precios en /services y próximos foros en /forums. Vuelve a hacer tu pregunta aquí.'
    })[current] || FALLBACK;
  }
  async function ask(q) {
    stopVoice(true); unlockVoice(); const epoch = voiceEpoch;
    say(q, 'me'); const t = say('•••', 'bot typing'); let a = '', acts = [], speech = null;
    try {
      const r = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q, history: HIST.slice(-6), language: current, speech: voiceOn }), signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined });
      const j = await r.json().catch(() => ({}));
      a = j.answer || (r.status === 429 ? 'You have asked a lot in a short time. Please wait and try again here.' : '');
      acts = Array.isArray(j.actions) ? j.actions : [];
      speech = j.speech;
    } catch {}
    t.remove(); if (!a) { a = offlineAnswer(q); acts = [{ type: 'person' }]; } say(a, 'bot');
    HIST.push({ role: 'user', content: q }, { role: 'assistant', content: a });
    if (acts.length) actions(acts, q);
    speakAnswer(speech, epoch);
  }
  /* buttons the AI can offer under its answer: register for a forum, leave your details, talk to a person */
  function actions(list, q) {
    const box = document.createElement('div'); box.className = 'chat-acts';
    for (const x of list) {
      if (x.type === 'register') box.insertAdjacentHTML('beforeend', `<a class="chat-act gold" href="/register?e=${encodeURIComponent(x.code)}"><span>${x.approval ? 'Request your invitation' : 'Reserve your seat'}</span><small>${esc(x.title)}</small></a>`);
      if (x.type === 'lead') { const b = document.createElement('button'); b.type = 'button'; b.className = 'chat-act'; b.innerHTML = '<span>Leave your details</span>'; b.addEventListener('click', () => { b.disabled = true; leadForm(q); }); box.append(b); }
      if (x.type === 'person') { const b=document.createElement('button');b.type='button';b.className='chat-act';b.textContent=({en:'Ask our team here',fr:'Demander à notre équipe ici',es:'Pregunta a nuestro equipo aquí',de:'Unser Team hier fragen',ar:'اسألوا فريقنا هنا',zh:'在这里咨询我们的团队'})[current] || 'Ask our team here';b.addEventListener('click',()=>{b.disabled=true;leadForm(q);});box.append(b); }
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
      } catch { msg.textContent = 'That did not go through. Please try again here.'; btn.disabled = false; }
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
