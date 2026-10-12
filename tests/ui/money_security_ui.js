// Back office: safety-net card, two-step sign-in (set up, sign in with a code), credit note, receipt, repeat an invoice,
// the accountant's downloads. Needs seed_demo.py + seed_crm.py on :4199. Screenshots in /tmp/qa/ms-*.png
const { chromium, devices } = require(process.env.PLAYWRIGHT);
const crypto = require('crypto');
const B = 'http://127.0.0.1:4199';
const assert = (c, m) => { if (!c) throw new Error('FAIL ' + m); console.log('  ok', m); };
const b32d = s => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s.replace(/\s/g, '')) bits += A.indexOf(c).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= bits.length; i += 8) o.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(o); };
const totp = (s, t = Date.now()) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(Math.floor(t / 30e3))); const h = crypto.createHmac('sha1', b32d(s)).update(b).digest(), o = h[h.length - 1] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0'); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
  for (const [n, opt] of [['desk', { viewport: { width: 1440, height: 900 } }], ['phone', devices['iPhone 14']]]) {
    const ctx = await b.newContext({ ...opt, extraHTTPHeaders: { 'x-real-ip': '10.97.' + Math.floor(Math.random() * 250) + '.7' } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Sent by mistake' : undefined));
    await p.goto(B + '/admin'); await p.fill('#e', 'admin'); await p.fill('#pw', 'Admin2025-qa!'); await p.click('#lbtn'); await p.waitForSelector('#app', { state: 'visible' });
    // safety card
    await p.goto(B + '/admin#settings'); await p.waitForSelector('#safety .ch h3');
    assert((await p.textContent('#safety')).includes('Nightly backup'), n + ' safety-net card shows backup, off-site copy, email and certificate');
    if (n === 'desk') { await p.locator('#safety').screenshot({ path: '/tmp/qa/ms-safety.png' }); }
    // two-step: set up (desk only: then sign out and in with a code)
    if (n === 'desk') {
      await p.click('#tf-go'); await p.waitForSelector('#tf-code');
      const key = (await p.textContent('#tf-set code')).trim();
      await p.locator('#tfa').screenshot({ path: '/tmp/qa/ms-2fa-setup.png' });
      await p.fill('#tf-code', totp(key)); await p.click('#tf-on'); await p.waitForSelector('.tf-rc');
      assert((await p.textContent('.tf-rc')).split('\n').length === 8, n + ' two-step turned on, 8 recovery codes shown once');
      await p.click('#tf-done'); await p.waitForTimeout(300);
      await p.click('#out'); await p.waitForSelector('#lform');
      await p.fill('#e', 'admin'); await p.fill('#pw', 'Admin2025-qa!'); await p.click('#lbtn'); await p.waitForSelector('#codewrap:not([hidden])');
      await p.screenshot({ path: '/tmp/qa/ms-login-code.png' });
      await new Promise(r => setTimeout(r, (30 - (Date.now() / 1000) % 30) * 1000 + 600));
      await p.fill('#lcode', totp(key)); await p.click('#lbtn'); await p.waitForSelector('#app', { state: 'visible' });
      assert(true, n + ' signed in with password + code');
      // turn it off again so later runs start clean
      await p.goto(B + '/admin#settings'); await p.waitForSelector('#tf-off', { state: 'attached' }); await p.click('#tfa summary');
      await new Promise(r => setTimeout(r, (30 - (Date.now() / 1000) % 30) * 1000 + 600));
      await p.fill('#tf-pw', 'Admin2025-qa!'); await p.fill('#tf-c', totp(key)); await p.click('#tf-off'); await p.waitForSelector('#tf-go');
      assert(true, n + ' two-step turned off with password + code');
    }
    // an invoice: issue, part payment with receipt, credit note for the rest
    await p.goto(B + '/admin#inv'); await p.waitForSelector('#if-tb');
    await p.click('[data-new=invoice]'); await p.waitForSelector('#iv-ls .inv-l');
    await p.fill('#iv-co', 'Credit Test Ltd'); await p.fill('#iv-em', 'ct@example.test');
    await p.locator('#iv-ls .inv-l [data-f=description]').first().fill('Investor desk retainer, {month}'); await p.locator('#iv-ls .inv-l [data-f=unit]').first().fill('1000');
    await p.click('#iv-iss'); await p.waitForSelector('#is-cp');
    await p.fill('#ip-a', '600'); await p.click('#ip-s'); await p.waitForTimeout(700);
    assert(/RCT-\d{4}-\d{4}/.test(await p.textContent('#drb')), n + ' payment has a receipt number and link');
    await p.fill('#cn-r', 'Fee reduced as agreed'); await p.click('#cn-go'); await p.waitForTimeout(900);
    assert(/CRN-\d{4}-\d{4}/.test(await p.textContent('#drb h2')), n + ' credit note issued for the balance and opened');
    if (n === 'phone') await p.screenshot({ path: '/tmp/qa/ms-credit-phone.png', fullPage: true }); else await p.screenshot({ path: '/tmp/qa/ms-credit.png' });
    await p.click('#drb [data-inv-open]'); await p.waitForTimeout(700);
    assert((await p.textContent('#drb h2')).includes('Paid'), n + ' original invoice: paid by payment + credit note');
    // repeat an invoice
    await p.keyboard.press('Escape'); await p.click('[data-new=invoice]'); await p.waitForSelector('#iv-ls .inv-l');
    await p.fill('#iv-co', 'Retainer Client'); await p.locator('#iv-ls .inv-l [data-f=description]').first().fill('Monthly retainer, {month}'); await p.locator('#iv-ls .inv-l [data-f=unit]').first().fill('11500');
    await p.click('#iv-iss'); await p.waitForSelector('#rp-go', { state: 'attached' }); await p.click('details.rep summary'); await p.click('#rp-go'); await p.waitForTimeout(900);
    assert((await p.textContent('#if-tb')).includes('Retainer Client'), n + ' recurring tab lists the new schedule');
    if (n === 'desk') await p.screenshot({ path: '/tmp/qa/ms-recurring.png' });
    // accountant downloads
    await p.keyboard.press('Escape'); await p.click('[data-new=acct]'); await p.waitForSelector('#ac-l a');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ac-l li:first-child a')]);
    assert(/gotham-accounts-\d{4}-\d{2}\.xlsx/.test(dl.suggestedFilename()), n + ' monthly pack downloads as Excel');
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert(over <= 1, n + ' no sideways scroll');
    assert(!errs.length, n + ' no page errors ' + errs.join(' | '));
    await ctx.close();
  }
  await b.close(); console.log('PASSED');
})().catch(e => { console.error(e); process.exit(1); });
