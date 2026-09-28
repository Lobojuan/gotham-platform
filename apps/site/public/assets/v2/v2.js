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
    const sc = document.createElement('script'); sc.src = ASSET + '/assets/v2/i18n-' + l + '.js?v=2';
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
  $$('[data-lang]').forEach(b => b.addEventListener('click', () => { setLang(b.dataset.lang); closeLang(); }));
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
    let idx = 0, rot = 0, timer = null, drag = null, moved = false;
    // Safari does not start lazy images inside a 3D ring: load them once the carousel comes near the screen
    const wake = () => cards.forEach(c => { const im = $('img', c); if (im && im.loading === 'lazy') im.loading = 'eager'; });
    if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { wake(); io.disconnect(); } }, { rootMargin: '600px 0px' }); io.observe(stage); } else wake();
    const render = () => {
      ring.style.setProperty('--rot', rot + 'deg');
      cards.forEach((c, i) => { const d = Math.min((i - idx + N) % N, (idx - i + N) % N); c.classList.toggle('far', d === 2); c.classList.toggle('side', d === 1); c.classList.toggle('back', d > 2); c.tabIndex = d === 0 ? 0 : -1; c.setAttribute('aria-hidden', d > 1); });
      $('[data-car-num]', car).textContent = String(idx + 1).padStart(2, '0');
      $('[data-car-title]', car).textContent = $('b', cards[idx]).textContent;
    };
    const go = n => { const diff = ((n - idx) % N + N + N / 2) % N - N / 2; idx = (idx + diff + N) % N; rot -= diff * step; render(); };
    const auto = on => { clearInterval(timer); if (on && !reduce) timer = setInterval(() => go(idx + 1), 3800); };
    $('[data-car-prev]', car).addEventListener('click', () => { go(idx - 1); auto(false); });
    $('[data-car-next]', car).addEventListener('click', () => { go(idx + 1); auto(false); });
    car.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { go(idx + 1); auto(false); } if (e.key === 'ArrowLeft') { go(idx - 1); auto(false); } });
    ['mouseenter', 'focusin'].forEach(ev => car.addEventListener(ev, () => auto(false)));
    car.addEventListener('mouseleave', () => auto(true));
    // drag / swipe: horizontal moves turn the ring, vertical swipes still scroll the page
    stage.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, rot, idx, active: false }; moved = false; auto(false); });
    stage.addEventListener('pointermove', e => {
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.active) { if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return; drag.active = true; stage.classList.add('drag'); stage.setPointerCapture(e.pointerId); }
      moved = true; rot = drag.rot + dx / (stage.clientWidth / 1.4) * step * 2; ring.style.setProperty('--rot', rot + 'deg');
      const near = ((Math.round(-rot / step) % N) + N) % N; cards.forEach((c, i) => c.classList.toggle('back', Math.min((i - near + N) % N, (near - i + N) % N) > 2));
    });
    const end = () => { if (!drag) return; const was = drag; drag = null; stage.classList.remove('drag'); if (!was.active) return;
      const turned = Math.round((rot - was.rot) / step); idx = was.idx; rot = was.rot; go(idx - turned); };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    cards.forEach((c, i) => c.addEventListener('click', e => { if (moved) { e.preventDefault(); moved = false; return; } if (i !== idx) { e.preventDefault(); go(i); } }));
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
  const evWrap = LEG ? null : $('div.events#events');
  if (evWrap) items().then(d => {
    const ev = (d.items || []).filter(i => i.kind === 'event' && i.phase !== 'past' && i.starts_at && new Date(i.starts_at) > Date.now() - 864e5)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    if (!ev.length) return;
    const tz = { timeZone: 'Africa/Accra' };
    evWrap.innerHTML = ev.map(i => {
      const t = new Date(i.starts_at), img = i.cover_image?.sizes?.md?.webp || i.cover_image?.sizes?.lg?.webp || ASSET + '/img/forum.webp';
      const price = Number(i.price) ? 'GHS ' + Number(i.price).toLocaleString('en-GH') : 'Free';
      const time = t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...tz });
      const day = t.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', ...tz });
      return `<article class="event"><div class="cov" style="background-image:url('${esc(img)}')"><div class="date"><b>${t.toLocaleDateString('en-GB', { day: 'numeric', ...tz })}</b><span>${t.toLocaleDateString('en-GB', { month: 'short', ...tz })}</span></div></div>
        <div class="body"><h3>${esc(i.title)}</h3><div class="meta">${i.approval ? '<span class="pill">By invitation</span>' : ''}<span class="pill teal">${esc(price)}</span><span class="pill gray">${esc(day)} · ${esc(time)}</span>${i.venue ? `<span class="pill gray">${esc(i.venue)}</span>` : ''}${i.seats_left != null ? `<span class="pill gray">${esc(i.seats_left)} seats left</span>` : ''}</div>
        ${(i.summary || i.subtitle) ? `<p>${esc(i.summary || i.subtitle)}</p>` : ''}
        <a class="btn btn-gold" href="/register?e=${encodeURIComponent(i.code)}">${i.approval ? 'Request your invitation' : 'Reserve your seat'} <span class="arrow">→</span></a></div></article>`;
    }).join('');
  }).catch(() => {});

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
    } catch { msg.innerHTML = 'That did not go through. WhatsApp us on <a href="https://wa.me/233552395548" target="_blank" rel="noopener">+233 55 239 5548</a>.'; }
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
    say(q, 'me'); const t = say('•••', 'bot typing'); let a = '';
    try {
      const r = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q, history: HIST.slice(-6), language: current }), signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined });
      const j = await r.json().catch(() => ({}));
      a = j.answer || (r.status === 429 ? 'You have asked a lot in a short time. Please WhatsApp us on +233 55 041 6627.' : '');
    } catch {}
    t.remove(); a = a || FALLBACK; say(a, 'bot');
    HIST.push({ role: 'user', content: q }, { role: 'assistant', content: a });
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
})();
