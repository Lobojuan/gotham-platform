// v2 sweep: iPhone SE/15, Galaxy A, Pixel 7, iPad, desktop, against a local server on :4199 (screenshots in /tmp/qa):
//   PLAYWRIGHT=... CHROMIUM=... node tests/ui/v2_phone_sweep.js
const { chromium, devices } = require(process.env.PLAYWRIGHT);
const B = 'http://127.0.0.1:4199';
const sizes = [
  ['iphone-se', { ...devices['iPhone SE'] }], ['iphone-15', { ...devices['iPhone 15'] || devices['iPhone 14'] }],
  ['galaxy-a', { viewport: { width: 360, height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: devices['Galaxy S9+'].userAgent }],
  ['pixel-7', { ...devices['Pixel 7'] }], ['ipad', { ...devices['iPad (gen 7)'] }], ['desktop', { viewport: { width: 1440, height: 900 } }]];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
  const out = {};
  for (const [name, opt] of sizes) {
    const ctx = await b.newContext({ ...opt, defaultBrowserType: undefined });
    const p = await ctx.newPage(); const errs = [], failed = [];
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('requestfailed', r => failed.push(r.url()));
    await p.goto(B + '/v2', { waitUntil: 'networkidle' });
    await p.waitForTimeout(800);
    const r = await p.evaluate(() => {
      const vw = innerWidth, bad = [], small = [], taps = [], inputs = [];
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const rc = el.getBoundingClientRect(); if (!rc.width || !rc.height) continue;
        if (el.closest('dialog:not([open]), [hidden], .ticker, .sr-only, svg')) continue;
        if (rc.right > vw + 1 && !el.closest('.ticker')) bad.push(el.tagName + '.' + el.className + ' ' + Math.round(rc.right));
        const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (own && parseFloat(cs.fontSize) < 12) small.push(el.tagName + '.' + el.className + ' ' + cs.fontSize + ' ' + el.textContent.trim().slice(0, 30));
        if ((el.tagName === 'BUTTON' || (el.tagName === 'A' && !el.closest('p'))) && (rc.height < 40 || rc.width < 40) && !el.closest('.gf') && !el.closest('dialog'))
          taps.push(el.tagName + ' ' + (el.textContent.trim() || el.getAttribute('aria-label')).slice(0, 24) + ' ' + Math.round(rc.width) + 'x' + Math.round(rc.height));
        if (el.matches('input,select,textarea') && parseFloat(cs.fontSize) < 16) inputs.push(el.id + ' ' + cs.fontSize);
      }
      const c = document.getElementById('globe'), g = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let lit = 0; for (let i = 3; i < g.length; i += 40) if (g[i] > 0) lit++;
      return { vw, docW: document.documentElement.scrollWidth, overflow: bad.slice(0, 6), small: small.slice(0, 6), taps: taps.slice(0, 8), inputs,
        globeLit: lit, h: document.documentElement.scrollHeight, forum: document.querySelector('[data-forum-title]').textContent };
    });
    // interactions
    const phone = await p.evaluate(() => innerWidth < 900);
    if (phone) {
      await p.click('.dock [data-open-pane="root"]'); await p.waitForTimeout(400);
      r.sheetOpen = await p.evaluate(() => document.getElementById('sheet').open);
      await p.screenshot({ path: `/tmp/qa/v2-${name}-menu.png` });
      await p.click('#sheet [data-pane="services"]'); await p.waitForTimeout(450);
      r.servicesPane = await p.evaluate(() => { const r = document.querySelector('#pane-services').getBoundingClientRect(); return document.querySelector('.panes').dataset.level === '1' && Math.abs(r.left) < 2 && document.activeElement.classList.contains('back'); });
      await p.screenshot({ path: `/tmp/qa/v2-${name}-menu-services.png` });
      await p.click('#pane-services .back'); await p.waitForTimeout(450);
      r.backToRoot = await p.evaluate(() => document.querySelector('.panes').dataset.level === '0');
      await p.click('#sheet [data-close]'); await p.waitForTimeout(200);
      r.sheetClosed = await p.evaluate(() => !document.getElementById('sheet').open && document.documentElement.style.overflow === '');
      await p.click('.dock [data-open-pane="services"]'); await p.waitForTimeout(450);
      r.dockServices = await p.evaluate(() => document.getElementById('sheet').open && document.querySelector('.panes').dataset.level === '1');
      await p.click('#sheet [data-close]'); await p.waitForTimeout(200);
      r.dock = await p.evaluate(() => { const d = document.querySelector('.dock').getBoundingClientRect(); return [Math.round(d.left), Math.round(d.right), Math.round(innerHeight - d.bottom), [...document.querySelectorAll('.dock > *')].map(e => Math.round(e.getBoundingClientRect().height)).join(',')]; });
    } else {
      await p.click('.nav button.nb'); await p.waitForTimeout(250);
      r.megaOpen = await p.evaluate(() => !document.getElementById('mega-services').hidden);
      await p.screenshot({ path: `/tmp/qa/v2-${name}-mega.png` });
      await p.keyboard.press('Escape'); r.megaClosed = await p.evaluate(() => document.getElementById('mega-services').hidden);
    }
    await p.screenshot({ path: `/tmp/qa/v2-${name}-top.png` });
    // scroll through like a visitor: every .rv block must be fully visible once on screen
    r.hiddenAfterScroll = await p.evaluate(async () => { const bad = []; for (const el of document.querySelectorAll('.rv')) { el.scrollIntoView({ block: 'center', behavior: 'instant' }); await new Promise(r => setTimeout(r, 250)); const o = +getComputedStyle(el).opacity; if (o < .95) bad.push(el.className + ' ' + o); } scrollTo(0, 0); return bad; });
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.screenshot({ path: `/tmp/qa/v2-${name}-full.png`, fullPage: true });
    await p.emulateMedia({ reducedMotion: 'no-preference' });
    // chat
    await (phone ? p.click('.dock [data-open-chat]') : p.click('#chatO')); await p.fill('#chatI', 'hi'); await p.press('#chatI', 'Enter');
    await p.waitForFunction(() => document.querySelectorAll('#msgs .m.bot:not(.typing)').length >= 2, null, { timeout: 30000 }).catch(() => {});
    r.chat = await p.evaluate(() => { const c = document.getElementById('chat').getBoundingClientRect(); return [Math.round(c.left), Math.round(c.right), innerWidth, document.querySelectorAll('#msgs .m').length]; });
    await p.screenshot({ path: `/tmp/qa/v2-${name}-chat.png` });
    r.errs = errs.slice(0, 5); r.failed = failed.filter(u => !u.includes('fonts.g')).slice(0, 5);
    out[name] = r; await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1)); await b.close();
})();
