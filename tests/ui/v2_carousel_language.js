const { chromium, devices } = require(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || 'http://127.0.0.1:4199';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
  for (const [n, o] of [['iphone', devices['iPhone 14']], ['desktop', { viewport: { width: 1440, height: 900 } }]]) {
    const c = await b.newContext(o), p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto(BASE + '/v2', { waitUntil: 'networkidle' });
    await p.locator('#services').scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
    const t0 = await p.textContent('[data-car-title]');
    await p.click('[data-car-toggle]');
    if (await p.locator('[data-car-toggle]').getAttribute('aria-pressed') !== 'true') throw Error(`${n}: carousel pause state not announced`);
    const pausedTitle = await p.textContent('[data-car-title]');
    await p.waitForTimeout(5200);
    if (await p.textContent('[data-car-title]') !== pausedTitle) throw Error(`${n}: carousel kept rotating after pause`);
    await p.click('[data-car-toggle]');
    if (await p.locator('[data-car-toggle]').getAttribute('aria-pressed') !== 'false') throw Error(`${n}: carousel resume state not announced`);
    await p.click('[data-car-next]'); await p.waitForTimeout(800); const t1 = await p.textContent('[data-car-title]');
    // swipe left on the stage (touch-like drag)
    const box = await p.locator('.car-stage').boundingBox();
    await p.mouse.move(box.x + box.width * .7, box.y + box.height / 2); await p.mouse.down(); await p.mouse.move(box.x + box.width * .3, box.y + box.height / 2 + 5, { steps: 8 }); await p.mouse.up();
    await p.waitForTimeout(900); const t2 = await p.textContent('[data-car-title]');
    const vis = await p.evaluate(() => [...document.querySelectorAll('.car-card')].filter(c => !c.classList.contains('far')).length);
    await p.locator('#services').screenshot({ path: `/tmp/qa/car-${n}.png` });
    const ovf = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    // language
    await p.evaluate(() => scrollTo(0, 0));
    if (n === 'iphone') { await p.click('.dock [data-open-pane="root"]'); await p.waitForTimeout(300); await p.click('#sheet [data-lang="fr"]'); if (!p.url().includes('/fr')) throw Error('iphone: French language link did not navigate'); }
    else { await p.click('.langb'); await p.click('#langp [data-lang="fr"]'); }
    await p.waitForTimeout(1200);
    const fr = await p.evaluate(() => ({ h1: document.querySelector('h1').textContent.replace(/\s+/g, ' ').trim(), lang: document.documentElement.lang, dock: document.querySelector('.dock span')?.textContent, car: document.querySelector('[data-car-title]').textContent, carPause: document.querySelector('[data-car-toggle]').textContent, ph: document.getElementById('chatI').placeholder }));
    if (!fr.carPause.includes('rotation automatique')) throw Error(`${n}: carousel pause label not localized in French`);
    await p.click('[data-car-toggle]'); await p.waitForTimeout(150);
    if (!(await p.textContent('[data-car-toggle]')).includes('Reprendre')) throw Error(`${n}: carousel resume label not localized in French`);
    await p.click('[data-car-toggle]');
    await p.goto(BASE + '/v2/invest', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
    const fr2 = await p.evaluate(() => document.querySelector('h1').textContent.replace(/\s+/g, ' ').trim());
    await p.screenshot({ path: `/tmp/qa/fr-${n}.png` });
    if (n === 'desktop') { await p.click('.langb'); await p.click('#langp [data-lang="en"]'); await p.waitForTimeout(400); }
    await p.goto(BASE + '/zh/', { waitUntil: 'networkidle' }); await p.waitForTimeout(300);
    const zhDay = await p.locator('#b-day option').first().textContent();
    if (!/年.*月.*日/.test(zhDay)) throw Error(`${n}: booking dates should use Chinese date order and labels`);
    const back = await p.evaluate(() => document.querySelector('h1').textContent.replace(/\s+/g, ' ').trim());
    console.log(n, JSON.stringify({ t0, t1, t2, vis, ovf, fr, fr2, back, errs }));
    await c.close();
  }
  await b.close();
})();
