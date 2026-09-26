const QA = process.env.QA_DIR || '/tmp/qa';
// Layout sweep: every public page and every back-office screen on phones, tablet and desktop.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright-core');
const fs = require('fs');
const B = 'http://127.0.0.1:4199';
const OUT = process.env.OUT || QA+'/shots';
const ADMIN_PW = process.env.ADMIN_PW || 'Admin2025-qa!';
const DEVICES = [
  { name: 'iphone-se', w: 375, h: 667, dpr: 2, mobile: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  { name: 'iphone-15', w: 393, h: 852, dpr: 3, mobile: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  { name: 'galaxy-a', w: 360, h: 800, dpr: 3, mobile: true, ua: 'Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36' },
  { name: 'pixel-7', w: 412, h: 915, dpr: 2.625, mobile: true, ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36' },
  { name: 'ipad', w: 820, h: 1180, dpr: 2, mobile: true, ua: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  { name: 'desktop', w: 1440, h: 900, dpr: 1, mobile: false },
];
const only = process.env.DEV ? process.env.DEV.split(',') : null;
const PAGES = ['/', '/register', '/register?e=F1', '/family', '/teaser', '/privacy', '/terms'];
const TABS = ['dash', 'regs', 'events', 'subs', 'door', 'mail', 'out', 'spon', 'qr', 'links', 'data', 'settings'];

const CHECK = (mobile) => {
  const W = document.documentElement.clientWidth, issues = [];
  const vis = el => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (el.textContent ? ' "' + el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30) + '"' : '');
  if (document.documentElement.scrollWidth > W + 1) issues.push(['H-SCROLL', 'page scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + W]);
  const clippedByScroller = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; } return false; };
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if ((r.right > W + 1 || r.left < -1) && cs.position !== 'fixed' && !clippedByScroller(el)) {
      let par = el.parentElement, parOut = false; while (par) { if (seen.has(par)) { parOut = true; break; } par = par.parentElement; }
      seen.add(el); if (!parOut) issues.push(['OVERFLOW', desc(el) + ' spans ' + Math.round(r.left) + '..' + Math.round(r.right)]);
    }
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (hasText && parseFloat(cs.fontSize) < 12 && r.width > 0) issues.push(['TINY-TEXT', desc(el) + ' ' + cs.fontSize]);
    if (mobile && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !['checkbox', 'radio', 'hidden', 'file'].includes(el.type) && parseFloat(cs.fontSize) < 16) issues.push(['IOS-ZOOM', desc(el) + ' font ' + cs.fontSize + ' (iPhone zooms in on focus below 16px)']);
    if (mobile && (el.matches('a[href],button,select,input:not([type=hidden]),[role=button],summary') ) && !el.closest('p,li,td,.note,small,footer p') ) {
      if ((r.height < 24 || r.width < 24) && !(el.matches('input[type=checkbox],input[type=radio]') && el.closest('label'))) issues.push(['TAP', desc(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)]);
    }
    if (el.tagName === 'IMG' && el.complete && el.naturalWidth === 0) issues.push(['BROKEN-IMG', el.src]);
  }
  // overlap of fixed elements over content at the bottom (cookie bars, WhatsApp bubbles)
  return issues;
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] });
  const report = {};
  for (const d of DEVICES) {
    if (only && !only.includes(d.name)) continue;
    fs.mkdirSync(`${OUT}/${d.name}`, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dpr > 2 ? 2 : d.dpr, isMobile: d.mobile, hasTouch: d.mobile, userAgent: d.ua, reducedMotion: 'reduce', extraHTTPHeaders: { 'x-real-ip': '10.77.' + Math.floor(Math.random() * 200) + '.' + Math.floor(Math.random() * 200) } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text()) && !/fonts\.g|ERR_NAME|net::ERR_(INTERNET|PROXY|TUNNEL|CONNECTION)/.test(m.text())) errs.push(m.text()); });
    page.on('pageerror', e => errs.push('JS: ' + e.message));
    page.on('response', r => { if (r.status() >= 400 && !/fonts\.g/.test(r.url()) && !(r.url().endsWith('/api/me') && r.status()===401)) errs.push(r.status() + ' ' + r.url()); });
    const snap = async (key) => {
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += innerHeight * .8) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } scrollTo(0, 0); });
      await page.waitForTimeout(400);
      const issues = await page.evaluate(CHECK, d.mobile);
      report[d.name + ' ' + key] = { issues, errs: errs.splice(0) };
      await page.screenshot({ path: `${OUT}/${d.name}/${key.replace(/[^a-z0-9]+/gi, '_')}.png`, fullPage: true });
    };
    for (const pth of PAGES) {
      await page.goto(B + pth, { waitUntil: 'networkidle' }).catch(e => errs.push('NAV ' + e.message));
      await snap(pth === '/' ? 'home' : pth);
    }
    // back office
    await page.goto(B + '/admin', { waitUntil: 'networkidle' });
    await snap('admin-login');
    await page.fill('#e', 'admin'); await page.fill('#pw', ADMIN_PW); await page.click('#lform button');
    await page.waitForTimeout(1200);
    for (const t of TABS) {
      const ok = await page.evaluate(v => { const a = document.querySelector(`aside a[data-v="${v}"]`); if (!a) return false; if (typeof go === 'function') { go(v); return true; } a.click(); return true; }, t);
      if (!ok) { report[d.name + ' admin-' + t] = { issues: [['MISSING', 'no tab ' + t]], errs: [] }; continue; }
      await page.waitForTimeout(900);
      await snap('admin-' + t);
    }
    // drawers
    await page.evaluate(() => go('regs')); await page.waitForTimeout(700);
    const row = await page.$('tr.r'); if (row) { await row.click(); await page.waitForTimeout(600); await snap('admin-reg-drawer'); await page.evaluate(() => document.querySelector('#dr').classList.remove('on')); }
    await page.evaluate(() => go('out')); await page.waitForTimeout(900);
    const addBtn = await page.$('text=Add a company'); if (addBtn) { await addBtn.click(); await page.waitForTimeout(600); await snap('admin-contact-drawer'); await page.evaluate(() => document.querySelector('#dr').classList.remove('on')); }
    await page.evaluate(() => go('events')); await page.waitForTimeout(900);
    const evc = await page.$('.evc'); if (evc) { await evc.click(); await page.waitForTimeout(900); await snap('admin-event-editor'); }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(OUT + '/report.json', JSON.stringify(report, null, 1));
  // summary
  const agg = {};
  for (const [k, v] of Object.entries(report)) {
    for (const [type, msg] of v.issues) { const key = type + ' | ' + k.split(' ').slice(1).join(' ') + ' | ' + msg.replace(/\d+x\d+|\d+\.\.\d+|\d+ > \d+/g, '#'); (agg[key] = agg[key] || new Set()).add(k.split(' ')[0]); }
    for (const e of v.errs) { const key = 'CONSOLE | ' + k.split(' ').slice(1).join(' ') + ' | ' + e.slice(0, 160); (agg[key] = agg[key] || new Set()).add(k.split(' ')[0]); }
  }
  const lines = Object.entries(agg).map(([k, s]) => k + '  [' + [...s].join(',') + ']').sort();
  fs.writeFileSync(OUT + '/summary.txt', lines.join('\n'));
  console.log(lines.length + ' distinct findings');
})();
