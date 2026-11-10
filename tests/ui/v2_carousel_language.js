const { chromium, devices } = require(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || 'http://127.0.0.1:4199';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
  for (const [n, o] of [['iphone', devices['iPhone 14']], ['desktop', { viewport: { width: 1440, height: 900 } }]]) {
    const c = await b.newContext(o), p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto(BASE + '/v2', { waitUntil: 'networkidle' });
    // (the home carousel was replaced by the challenges checklist in November 2026; the file keeps its name for the release gate)
    await p.locator('#challenges').scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
    await p.locator('#ch-form input').nth(0).check(); await p.locator('#ch-form input').nth(12).check();
    const t0 = await p.locator('#mt-list li').count();
    if (t0 !== 2) throw Error(`${n}: two ticked challenges should show two matches, got ${t0}`);
    if (!/GHS 6,000/.test(await p.textContent('#mt-list'))) throw Error(`${n}: the match should carry the published price`);
    await p.locator('#challenges').screenshot({ path: `/tmp/qa/ch-${n}.png` }).catch(() => {});
    const ovf = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    // language
    await p.evaluate(() => scrollTo(0, 0));
    if (n === 'iphone') { await p.click('.dock [data-open-pane="root"]'); await p.waitForTimeout(300); await p.click('#sheet [data-lang="fr"]'); if (!p.url().includes('/fr')) throw Error('iphone: French language link did not navigate'); }
    else { await p.click('.langb'); await p.click('#langp [data-lang="fr"]'); }
    await p.waitForTimeout(1200);
    const fr = await p.evaluate(() => ({ h1: document.querySelector('h1').textContent.replace(/\s+/g, ' ').trim(), lang: document.documentElement.lang, dock: document.querySelector('.dock span')?.textContent, match: document.querySelector('#mt-h').textContent, ph: document.getElementById('chatI').placeholder }));
    if (!fr.match.includes('Ce qu’il vous faut')) throw Error(`${n}: challenges match title not localized in French`);
    await p.locator('#ch-form input').nth(12).check(); await p.waitForTimeout(150);
    if (!/par mois/.test(await p.textContent('#mt-list'))) throw Error(`${n}: challenge price not localized in French`);
    await p.goto(BASE + '/v2/invest', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
    const fr2 = await p.evaluate(() => document.querySelector('h1').textContent.replace(/\s+/g, ' ').trim());
    await p.screenshot({ path: `/tmp/qa/fr-${n}.png` });
    if (n === 'desktop') { await p.click('.langb'); await p.click('#langp [data-lang="en"]'); await p.waitForTimeout(400); }
    await p.goto(BASE + '/zh/', { waitUntil: 'networkidle' }); await p.waitForTimeout(300);
    const zhDay = await p.locator('#b-day option').first().textContent();
    if (!/年.*月.*日/.test(zhDay)) throw Error(`${n}: booking dates should use Chinese date order and labels`);
    const back = await p.evaluate(() => document.querySelector('h1').textContent.replace(/\s+/g, ' ').trim());
    console.log(n, JSON.stringify({ t0, ovf, fr, fr2, back, errs }));
    await c.close();
  }
  await b.close();
})();
