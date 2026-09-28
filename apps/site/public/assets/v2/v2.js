/* Gotham Consult · v2 page behaviour: menu, mega panel, language, next forum, counters, Ask Gotham.
   Everything degrades: without JavaScript the links still go where they say. */
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  let i18nReady = null;
  const loadI18n = () => i18nReady ||= new Promise(res => {
    // the translation script attaches its switch to nav.main; give it a hidden one and drive it from our buttons
    const host = document.createElement('nav'); host.className = 'main'; host.hidden = true;
    host.innerHTML = '<span class="navlog"></span>'; document.body.append(host);
    const s = document.createElement('script'); s.src = '/js/landing-i18n.js?v=20260928'; s.onload = res; s.onerror = res; document.body.append(s);
  });
  const setLang = async l => {
    markLang(l); try { localStorage.setItem('gc-language', l); } catch {}
    if (l === 'en' && !i18nReady) return;
    await loadI18n();
    const sel = $('#gc-language-switch select');
    if (sel && sel.value !== l) { sel.value = l; sel.dispatchEvent(new Event('change')); }
    document.title = 'Gotham Consult';
  };
  $$('[data-lang]').forEach(b => b.addEventListener('click', () => { setLang(b.dataset.lang); closeLang(); }));
  markLang(current); if (current !== 'en') setLang(current);

  document.addEventListener('click', () => { setMega(false); closeLang(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!mega?.hidden) { setMega(false); nb.focus(); } closeLang(); } });

  /* ---- mobile menu sheet ---- */
  const sheet = $('#sheet'), menub = $('.gh-act .menub');
  menub?.addEventListener('click', () => { sheet.showModal ? sheet.showModal() : sheet.setAttribute('open', ''); document.documentElement.style.overflow = 'hidden'; });
  const closeSheet = () => { sheet.close ? sheet.close() : sheet.removeAttribute('open'); };
  sheet?.addEventListener('close', () => { document.documentElement.style.overflow = ''; });
  $$('[data-close]', sheet).forEach(b => b.addEventListener('click', closeSheet));
  $$('a', sheet).forEach(a => a.addEventListener('click', closeSheet));
  addEventListener('resize', () => { if (innerWidth >= 1080 && sheet?.open) closeSheet(); });

  /* ---- next forum, live from the back office ---- */
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  fetch('/api/items').then(r => r.json()).then(d => {
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
  if (!reduce && 'IntersectionObserver' in window) {
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
  const openChat = () => {
    chat.hidden = false; chatO.hidden = true; chatO.setAttribute('aria-expanded', 'true');
    if (!msgs.children.length) say('Hi, welcome to Gotham Consult. Ask me about our services, forums, prices or investing in Ghana.', 'bot');
    if (innerWidth > 520) $('#chatI').focus();
  };
  const closeChat = () => { chat.hidden = true; chatO.hidden = false; chatO.setAttribute('aria-expanded', 'false'); chatO.focus(); };
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
  $('#chatF')?.addEventListener('submit', e => { e.preventDefault(); const i = $('#chatI'), v = i.value.trim(); if (v) { i.value = ''; ask(v); } });
})();
