// /invest/join: the form checks itself, sends, thanks the investor; works on a phone. Needs a server on :4199. Screenshots in /tmp/qa/ij-*.png
const { chromium, devices } = require(process.env.PLAYWRIGHT);
const B = 'http://127.0.0.1:4199';
const assert = (c, m) => { if (!c) throw new Error('FAIL ' + m); console.log('  ok', m); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
  const errs = [];
  const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });   // outside fonts are blocked in the test sandbox
  await p.goto(B + '/invest'); await p.click('.phero a[href="/invest/join"]');
  await p.waitForURL('**/invest/join'); assert((await p.textContent('h1')).includes('with people on the ground'), 'Invest hero button opens the investor page');
  assert(await p.locator('#ij-country option').count() > 30, 'country list filled');
  await p.screenshot({ path: '/tmp/qa/ij-desk.png', fullPage: true });
  await p.click('#ij-go');
  assert(await p.locator('.ij-f[data-bad]').count() === 7, 'empty form: the 7 required fields are highlighted, nothing sent');
  assert(await p.evaluate(() => document.activeElement.id) === 'ij-name', 'focus moves to the first problem');
  await p.fill('#ij-name', 'Ingrid Berg'); await p.fill('#ij-email', 'ingrid@example.no'); await p.fill('#ij-phone', '+47 912 34 567');
  await p.fill('#ij-co', 'Fjord Capital'); await p.selectOption('#ij-country', 'Norway'); await p.selectOption('#ij-type', 'Family office');
  await p.selectOption('#ij-ticket', 'USD 1 – 10 million'); await p.selectOption('#ij-when', 'Within 12 months');
  await p.check('input[value="Real estate"]'); await p.check('input[value="Agriculture and agro-processing"]');
  await p.fill('#ij-msg', 'Agro-processing with export potential.'); await p.check('#ij-cons');
  await p.click('#ij-go');
  await p.waitForSelector('.ij-ok', { timeout: 10000 });
  assert((await p.textContent('.ij-ok')).includes('Thank you, Ingrid.'), 'sent: thank-you shown by first name');
  await p.screenshot({ path: '/tmp/qa/ij-thanks.png' });
  const ph = await (await b.newContext(devices['iPhone 14'])).newPage(); ph.on('pageerror', e => errs.push(e.message));
  await ph.goto(B + '/invest/join');
  assert(await ph.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, 'phone: no sideways scroll');
  const small = await ph.evaluate(() => [...document.querySelectorAll('#ij input:not([type=checkbox]):not(#ij-web), #ij select, #ij button, .ij-chips label')]
    .filter(e => e.offsetParent && e.getBoundingClientRect().height < 44).length);
  assert(small === 0, 'phone: every field and chip is at least 44px tall');
  await ph.screenshot({ path: '/tmp/qa/ij-phone.png', fullPage: true });
  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log('PASSED');
})().catch(e => { console.error(e); process.exit(1); });
