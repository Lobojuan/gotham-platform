// Insights pages, the French site and its language switch, the header with the new link, and the visitors view.
// Needs a server on :4199 with the built site (seed_demo.py for the admin login). Screenshots in /tmp/qa/if-*.png
const { chromium, devices } = require(process.env.PLAYWRIGHT);
const B = 'http://127.0.0.1:4199';
const assert = (c, m) => { if (!c) throw new Error('FAIL ' + m); console.log('  ok', m); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
  for (const [n, opt] of [['desk', { viewport: { width: 1280, height: 860 } }], ['phone', devices['iPhone 14']]]) {
    const ctx = await b.newContext(opt), p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(B + '/insights'); assert(await p.locator('.ins-card').count() === 4, n + ' Insights index lists 4 guides');
    await p.screenshot({ path: `/tmp/qa/if-index-${n}.png`, fullPage: n === 'desk' });
    await p.click('.ins-card >> nth=0'); await p.waitForSelector('.prose');
    assert(await p.locator('.prose h2').count() >= 4 && await p.locator('.ins-src li').count() >= 3, n + ' guide has sections and sources');
    await p.screenshot({ path: `/tmp/qa/if-article-${n}.png`, fullPage: false });
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert(over <= 1, n + ' article: no sideways scroll');
    // language switch: English → the real French page
    if (n === 'desk') { await p.click('.langb'); await p.click('#langp [data-lang="fr"]'); }
    else { await p.click('.dock [data-open-pane="root"]'); await p.click('.sheet-langs [data-lang="fr"]'); }
    await p.waitForURL(/\/fr\/insights\//); assert((await p.getAttribute('html', 'lang')) === 'fr' && (await p.textContent('.ins-sum b')) === 'En bref', n + ' language switch opens the French twin');
    await p.goto(B + '/fr'); await p.waitForTimeout(600);
    assert((await p.textContent('h1')).includes('Nouez des partenariats'), n + ' French home page');
    await p.screenshot({ path: `/tmp/qa/if-fr-home-${n}.png` });
    // back to English
    if (n === 'desk') { await p.click('.langb'); await p.click('#langp [data-lang="en"]'); }
    else { await p.click('.dock [data-open-pane="root"]'); await p.click('.sheet-langs [data-lang="en"]'); }
    await p.waitForURL(u => !/\/fr/.test(u.pathname)); assert((await p.getAttribute('html', 'lang')) === 'en', n + ' back to English');
    if (n === 'desk') {
      for (const w of [1024, 1280, 1440]) { await p.setViewportSize({ width: w, height: 800 }); await p.goto(B + '/'); await p.waitForTimeout(300);
        const fits = await p.evaluate(() => { const nav = document.querySelector('.nav'); const r = nav.getBoundingClientRect(); return nav.scrollWidth <= nav.clientWidth + 1 && r.right <= innerWidth; });
        assert(fits, `header nav fits at ${w}px`); await p.locator('header').first().screenshot({ path: `/tmp/qa/if-header-${w}.png` }); }
    }
    assert(!errs.length, n + ' no page errors ' + errs.join(' | '));
    await ctx.close();
  }
  // visitors view in the back office
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { 'x-real-ip': '10.98.1.7' } }), p = await ctx.newPage();
  await p.goto(B + '/admin'); await p.fill('#e', 'admin'); await p.fill('#pw', 'Admin2025-qa!'); await p.click('#lbtn'); await p.waitForSelector('#app', { state: 'visible' });
  await p.goto(B + '/admin#web'); await p.waitForSelector('.wv-chart');
  assert((await p.textContent('#view')).includes('Visitors per day'), 'visitors view shows the day chart, pages, sources');
  await p.screenshot({ path: '/tmp/qa/if-visitors.png', fullPage: true });
  await ctx.close(); await b.close(); console.log('PASSED');
})().catch(e => { console.error(e); process.exit(1); });
