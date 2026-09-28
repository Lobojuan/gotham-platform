// Every page (new design and older pages with the shared chrome) on iPhone SE/15, Galaxy A, Pixel 7, iPad and desktop.
// Needs a local server on :4199 with the BRIEF item. PLAYWRIGHT=... CHROMIUM=... node tests/ui/v2_pages_sweep.js
const { chromium, devices } = require(process.env.PLAYWRIGHT);
const B = 'http://127.0.0.1:4199';
const PAGES = ['/', '/services', '/invest', '/mining', '/forums', '/about', '/register', '/family', '/classic', '/teaser', '/privacy', '/terms'];
const sizes = [['iphone-se', { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPhone SE'].userAgent }],
  ['iphone-15', devices['iPhone 14']], ['galaxy-a', { viewport: { width: 360, height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: devices['Galaxy S9+'].userAgent }],
  ['pixel-7', devices['Pixel 7']], ['ipad', devices['iPad (gen 7)']], ['desktop', { viewport: { width: 1440, height: 900 } }]];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
  const res = {};
  for (const [dev, opt] of sizes) {
    const ctx = await b.newContext(opt);
    for (const path of PAGES) {
      const p = await ctx.newPage(); const errs = [], bad = [];
      p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|fonts/.test(m.text())) errs.push(m.text()); });
      p.on('response', r => { if (r.status() >= 400 && !r.url().includes('fonts.g')) bad.push(r.status() + ' ' + r.url()); });
      await p.goto(B + path, { waitUntil: 'networkidle' });
      const r = await p.evaluate(async () => {
        const vw = innerWidth, over = [], small = [], taps = [], inputs = [];
        for (const el of document.querySelectorAll('body *')) {
          if (el.closest('dialog:not([open]), [hidden], .ticker, .sr-only, svg, .car-stage')) continue;
          const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const rc = el.getBoundingClientRect(); if (!rc.width || !rc.height) continue;
          if (rc.right > vw + 1 && !el.closest('.jump,.tabs,.chat-chips')) over.push(el.tagName + '.' + String(el.className).split(' ')[0] + ' ' + Math.round(rc.right));
          const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
          if (own && parseFloat(cs.fontSize) < 12) small.push(el.tagName + ' ' + cs.fontSize + ' ' + el.textContent.trim().slice(0, 30));
          if ((el.tagName === 'BUTTON' || (el.tagName === 'A' && !el.closest('p,li,.crumb,.gf'))) && (rc.height < 40 || rc.width < 40) && !el.closest('dialog'))
            taps.push(el.tagName + ' ' + (el.textContent.trim() || el.getAttribute('aria-label') || '').slice(0, 24) + ' ' + Math.round(rc.width) + 'x' + Math.round(rc.height));
          if (el.matches('input,select,textarea') && parseFloat(cs.fontSize) < 16) inputs.push(el.id || el.name);
        }
        const hid = []; for (const el of document.querySelectorAll('.rv')) { el.scrollIntoView({ block: 'center', behavior: 'instant' }); await new Promise(r => setTimeout(r, 60)); if (+getComputedStyle(el).opacity < .95) hid.push(String(el.className).slice(0, 30)); }
        scrollTo(0, 0);
        const imgs = [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute('loading') !== 'lazy').map(i => i.src);
        return { docW: document.documentElement.scrollWidth, vw, over: over.slice(0, 4), small: small.slice(0, 3), taps: taps.slice(0, 4), inputs, hid: hid.slice(0, 3), imgs, h: document.documentElement.scrollHeight };
      });
      r.errs = errs.slice(0, 3); r.bad = bad.slice(0, 3);
      if (dev === 'iphone-15' || dev === 'desktop') {
        await p.emulateMedia({ reducedMotion: 'reduce' });
        await p.screenshot({ path: `/tmp/qa/pg-${dev}-${path.split('/').pop() || 'home'}.png`, fullPage: true });
        await p.emulateMedia({ reducedMotion: 'no-preference' });
      }
      if (path === '/services' && dev === 'iphone-15') {
        await p.click('#t-inv'); r.tab = await p.evaluate(() => !document.getElementById('p-inv').hidden && document.getElementById('p-biz').hidden);
      }
      if (path === '/forums' && dev === 'desktop') {
        r.events = await p.evaluate(() => document.querySelectorAll('#events .event').length);
        await p.fill('#b-name', 'QA Test'); await p.fill('#b-co', 'QA Co'); await p.fill('#b-em', 'qa@example.com'); await p.fill('#b-ph', '0241234567');
        await p.click('#briefF button'); await p.waitForTimeout(1500); r.brief = await p.evaluate(() => (document.querySelector('#briefF .ok') || document.getElementById('b-note') || {}).textContent);
        await p.fill('#sponF [name=company]', 'QA Sponsor'); await p.fill('#sponF [name=email]', 'sp@example.com'); await p.click('#sponF button'); await p.waitForTimeout(1500);
        r.spon = await p.evaluate(() => document.getElementById('sponMsg').textContent);
      }
      // the shared chrome works on every page: menu on phones, services panel on desktop, chat everywhere
      r.chrome = await p.evaluate(async () => {
        const phone = innerWidth < 900, out = {};
        if (phone) { document.querySelector('.dock [data-open-pane="root"]').click(); await new Promise(r => setTimeout(r, 350)); out.menu = document.getElementById('sheet').open; document.querySelector('#sheet [data-close]').click(); await new Promise(r => setTimeout(r, 150)); out.closed = !document.getElementById('sheet').open; }
        else if (innerWidth >= 1080) { document.querySelector('.nav button.nb').click(); await new Promise(r => setTimeout(r, 200)); out.mega = !document.getElementById('mega-services').hidden; document.body.click(); }
        const hdr = document.querySelector('header.gh').getBoundingClientRect(); out.hdrTop = Math.round(hdr.top); out.hdrH = Math.round(hdr.height);
        out.headers = document.querySelectorAll('header.gh').length; out.footers = document.querySelectorAll('footer.gf').length; out.dup = ['chatO','chat','msgs','sheet'].filter(id => document.querySelectorAll('#' + id).length > 1);
        return out; });
      res[dev + ' ' + path] = r; await p.close();
    }
    await ctx.close();
  }
  console.log(JSON.stringify(res)); await b.close();
})();
