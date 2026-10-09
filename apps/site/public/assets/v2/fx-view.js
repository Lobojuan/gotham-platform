/* Approximate value in the visitor's currency, on request only. Prices and invoices stay in Ghana cedis: Bank of Ghana
   does not allow pricing or advertising in foreign currency (Foreign Exchange Act, 2006, Act 723), so the cedi price is
   the only price and this is a labelled, opt-in conversion at the market mid-rate from /api/rates (the same rates as the
   globe). A small switch sits above each group of prices; the choice is remembered on this device. No prices, no switch. */
(function () {
  'use strict';
  var SEL = '.amt, label.opt .pr', CUR = ['USD', 'EUR', 'GBP', 'CNY', 'AED', 'CHF', 'DKK', 'SEK', 'NOK', 'CAD', 'ZAR', 'NGN', 'INR', 'JPY'];
  var T = {
    en: { show: 'Approximate value in', hide: 'Hide', note: 'Approximate, for information only, at the market mid-rate of {d}. All prices and invoices are in Ghana cedis.' },
    fr: { show: 'Valeur approximative en', hide: 'Masquer', note: 'Valeur approximative, à titre indicatif, au taux moyen du marché du {d}. Tous les prix et toutes les factures sont en cedis ghanéens.' },
    es: { show: 'Valor aproximado en', hide: 'Ocultar', note: 'Valor aproximado, solo a título informativo, al tipo medio de mercado del {d}. Todos los precios y facturas son en cedis de Ghana.' },
    de: { show: 'Ungefährer Wert in', hide: 'Ausblenden', note: 'Ungefährer Wert, nur zur Information, zum Marktmittelkurs vom {d}. Alle Preise und Rechnungen lauten auf ghanaische Cedi.' },
    ar: { show: 'القيمة التقريبية بعملة', hide: 'إخفاء', note: 'قيمة تقريبية للعلم فقط، بسعر السوق المتوسط بتاريخ {d}. جميع الأسعار والفواتير بالسيدي الغاني.' },
    zh: { show: '约合', hide: '隐藏', note: '约数，仅供参考，按 {d} 的市场中间价计算。所有价格和发票均以加纳塞地计价。' }
  };
  var DEF = { en: 'USD', fr: 'EUR', es: 'EUR', de: 'EUR', ar: 'USD', zh: 'CNY' };
  var rates = null, updated = '', on = false, cur = null, seen = new WeakMap();
  var loc = function () { var l = document.documentElement.lang || 'en'; return l === 'en' ? 'en-GB' : l; };
  var lang = function () { var l = (document.documentElement.lang || 'en').slice(0, 2); return T[l] ? l : 'en'; };
  var store = function (k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  /* the cedi amount written in a price, in any of the site's formats: GHS 30,000 · 30 000 GHS · 3.500GHS · 30,000 سيدي · 30,000塞地 */
  var GHS = /(?:GHS|GH¢|جنيه غاني)\s*(\d[\d.,   ]*\d|\d)|(\d[\d.,   ]*\d|\d)\s*(?:GHS|سيدي|加纳塞地|塞地)/;
  var amount = function (el) {
    var c = el.cloneNode(true); Array.prototype.forEach.call(c.querySelectorAll('.fx'), function (x) { x.remove(); });
    var m = GHS.exec(c.textContent || ''); if (!m) return 0;
    return +String(m[1] || m[2]).replace(/\D/g, '') || 0;
  };
  var per = function (c) { return rates ? (c === 'USD' || c === 'EUR' || c === 'GBP' ? rates.rates[c] : (rates.more || {})[c]) : 0; };   // cedis per unit
  var fmt = function (n, c) {
    var v = n / per(c), r = v >= 1000 ? Math.round(v / 10) * 10 : Math.round(v);
    try { return new Intl.NumberFormat(loc(), { style: 'currency', currency: c, currencyDisplay: 'code', maximumFractionDigits: 0 }).format(r); }
    catch (e) { return c + ' ' + r; }
  };
  var paint = function () {
    Array.prototype.forEach.call(document.querySelectorAll(SEL), function (el) {
      var x = el.querySelector(':scope > .fx'), n = on && cur && per(cur) ? amount(el) : 0;
      if (!n) { if (x) x.remove(); return; }
      if (!x) { x = document.createElement('span'); x.className = 'fx'; x.setAttribute('data-no-tr', ''); el.appendChild(x); }
      var t = '≈ ' + fmt(n, cur); if (x.textContent !== t) x.textContent = t;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.fxbar'), bar);
  };
  var bar = function (b) {
    var t = T[lang()], btn = b.querySelector('button'), sel = b.querySelector('select'), note = b.querySelector('.fxnote');
    btn.textContent = on ? t.hide : t.show; btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (sel.value !== cur) sel.value = cur;
    note.hidden = !on; note.textContent = t.note.replace('{d}', updated ? new Date(updated).toLocaleDateString(loc(), { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  };
  var make = function () {
    var b = document.createElement('div'); b.className = 'fxbar'; b.setAttribute('data-no-tr', '');
    var btn = document.createElement('button'); btn.type = 'button';
    var sel = document.createElement('select'); sel.setAttribute('aria-label', 'Currency');
    CUR.forEach(function (c) { if (per(c)) { var o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); } });
    var note = document.createElement('p'); note.className = 'fxnote'; note.hidden = true;
    btn.onclick = function () { on = !on; store('gc-fx-on', on ? '1' : '0'); paint(); };
    sel.onchange = function () { cur = sel.value; on = true; store('gc-fx', cur); store('gc-fx-on', '1'); paint(); };
    b.appendChild(btn); b.appendChild(sel); b.appendChild(note); return b;
  };
  /* one switch above each group of prices (each tab of the services page, the plans, the one-off services, the register list) */
  var place = function () {
    var groups = [];
    Array.prototype.forEach.call(document.querySelectorAll(SEL), function (el) {
      if (!amount(el)) return;
      var g = el.closest('.prices, .mb-plans, .mb-svcs, #items, .grid3, .grid2, .grid4') || (el.closest('.box') || el).parentElement;
      if (g && groups.indexOf(g) < 0) groups.push(g);
    });
    groups.forEach(function (g) {
      if (seen.get(g)) return; var prev = g.previousElementSibling;
      if (prev && prev.classList.contains('fxbar')) { seen.set(g, 1); return; }
      g.parentNode.insertBefore(make(), g); seen.set(g, 1);
    });
  };
  var start = function () {
    if (!document.querySelector(SEL)) return;
    fetch('/api/rates', { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.rates || !(j.rates.USD > 0)) return;    // no rates: no switch, the cedi prices stand alone
      rates = j; updated = j.updated || '';
      var saved = store('gc-fx'); cur = saved && per(saved) ? saved : DEF[lang()]; on = store('gc-fx-on') === '1';
      place(); paint();
      /* prices that arrive or change later (live prices, the register list, a language switch) */
      var last = '', tick = function () {
        var s = document.documentElement.lang + '|' + Array.prototype.map.call(document.querySelectorAll(SEL), function (e) { return amount(e); }).join(',');
        if (s !== last) { last = s; if (!saved && !store('gc-fx')) cur = DEF[lang()]; place(); paint(); }
      };
      setInterval(tick, 1200);
    }).catch(function () {});
  };
  var css = document.createElement('style');
  css.textContent = '.fxbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 14px}' +
    '.fxbar button{font-family:inherit;font-size:13.5px;font-weight:600;line-height:1.2;padding:8px 14px;border:1px solid var(--line,#d5d8dc);border-radius:999px;background:transparent;color:var(--ink,#0b1422);cursor:pointer}' +
    '.fxbar button[aria-pressed=true]{background:var(--ink,#0b1422);color:#fff}' +
    '.fxbar select{font-family:inherit;font-size:13.5px;font-weight:600;line-height:1.2;padding:7px 10px;border:1px solid var(--line,#d5d8dc);border-radius:999px;background:#fff;color:var(--ink,#0b1422)}' +
    '.fxnote{flex-basis:100%;margin:2px 0 0;font-size:12.5px;line-height:1.45;color:var(--mute,#5b6472)}' +
    '.fx{display:block;margin-top:3px;font-size:13px;font-weight:500;letter-spacing:0;color:var(--mute,#5b6472)}' +
    '@media (max-width:760px),(pointer:coarse){.fxbar button,.fxbar select{min-height:44px}}';
  document.head.appendChild(css);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
