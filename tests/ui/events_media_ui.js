// Back office: the logo instead of the G, the event gallery with photos and a video (dates read from the files,
// date typed where there is none), the recap, the "Logo on pictures" card; then the public event page.
// Needs a server on :4199 with the built site (seed_demo.py for the admin login) and ffmpeg. Screenshots in /tmp/qa/em-*.png
const { chromium, devices } = require(process.env.PLAYWRIGHT);
const { execFileSync } = require('child_process');
const fs = require('fs');
const B = 'http://127.0.0.1:4199';
const assert = (c, m) => { if (!c) throw new Error('FAIL ' + m); console.log('  ok', m); };
(async () => {
  fs.mkdirSync('/tmp/qa/em', { recursive: true });
  // a photo with a camera date, one "from WhatsApp", one with nothing, and a short video with a recording date
  execFileSync('python3', ['-c', `
from PIL import Image
im=Image.new('RGB',(1400,900),(200,170,120)); ex=Image.Exif(); ex.get_ifd(0x8769)[0x9003]='2026:05:23 14:42:07'; im.save('/tmp/qa/em/IMG_2001.jpg',exif=ex)
Image.new('RGB',(1200,800),(60,90,140)).save('/tmp/qa/em/WhatsApp Image 2026-05-24 at 09.15.02.jpeg')
Image.new('RGB',(1200,800),(90,140,60)).save('/tmp/qa/em/room.jpg')`]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-metadata', 'creation_time=2026-05-23T15:01:00Z', '/tmp/qa/em/clip.mp4']);

  const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/admin');
  assert(await p.locator('#login .mark img[src="/admin/brand/mark-white-256.png"]').count() === 1, 'sign-in card shows the logo, not a G');
  assert((await p.getAttribute('link[rel="icon"]', 'href')) === '/admin/brand/icon-64.png', 'back office tab icon is the logo');
  const ic = await p.request.get(B + '/admin/brand/icon-64.png'); assert(ic.status() === 200 && ic.headers()['content-type'] === 'image/png', 'logo files are served');
  await p.fill('#e', 'admin'); await p.fill('#pw', 'Admin2025-qa!'); await p.click('#lbtn'); await p.waitForSelector('#app', { state: 'visible' });
  assert(await p.locator('.side .brand .mark img').isVisible(), 'sidebar shows the logo');
  assert(!(await p.locator('.mark').allInnerTexts()).some(t => t.trim() === 'G'), 'no G left anywhere');
  await p.locator('.side .brand').screenshot({ path: '/tmp/qa/em-sidebar.png' });

  // new event with gallery
  await p.goto(B + '/admin#events'); await p.waitForSelector('#ev-new'); await p.click('#ev-new');
  await p.fill('#i-code', 'UI9'); await p.fill('#i-title', 'Founders Evening'); await p.fill('#i-start', '2026-05-23T14:30');
  await p.selectOption('#i-phase', 'past'); await p.fill('#i-desc', 'An evening for founders.');
  await p.fill('#i-recap', 'Thirty founders came.\n\nWe meet again in June.');
  assert(await p.locator('.ep-task').count() >= 8, 'event planner starts with a practical readiness checklist');
  await p.fill('#ep-purpose', 'Bring local founders together'); await p.fill('#ep-client', 'Ama Mensah');
  await p.fill('#ep-company', 'Accra Makers'); await p.fill('#ep-email', 'ama@example.test');
  await p.fill('#ep-guests', '80'); await p.fill('#ep-budget', '20000');
  await p.click('#ep-cost-add');
  let costs = p.locator('.ep-cost');
  await costs.nth(0).locator('[data-ep-cat]').selectOption('catering');
  await costs.nth(0).locator('[data-ep-desc]').fill('Catering for guests');
  await costs.nth(0).locator('[data-ep-est]').fill('8000');
  await costs.nth(0).locator('[data-ep-payer]').selectOption('client_direct');
  await costs.nth(0).locator('[data-ep-quote]').check();
  await p.click('#ep-cost-add'); costs=p.locator('.ep-cost');
  await costs.nth(1).locator('[data-ep-cat]').selectOption('staffing');
  await costs.nth(1).locator('[data-ep-desc]').fill('Gotham event coordination');
  await costs.nth(1).locator('[data-ep-est]').fill('2500');
  await costs.nth(1).locator('[data-ep-payer]').selectOption('gotham');
  await costs.nth(1).locator('[data-ep-quote]').check();
  assert((await p.textContent('#ep-total')).includes('10,500') && (await p.textContent('#ep-quote-total')).includes('2,500'), 'budget totals separate supplier-direct costs from quoted Gotham fees');
  await p.click('#ev-save'); await p.waitForTimeout(800);
  await p.click('#ep-make-quote'); await p.waitForSelector('#iv-ls');
  assert(await p.locator('#iv-ls textarea').count()===1 && (await p.inputValue('#iv-ls [data-f="description"]')).includes('Gotham event coordination'), 'quote contains the selected Gotham service only');
  assert((await p.inputValue('#iv-ls [data-f="unit"]'))==='2500', 'draft quote keeps the chosen GHS amount for Joy to review');
  await p.goto(B + '/admin#events'); await p.waitForSelector('[data-open="UI9"]'); await p.click('[data-open="UI9"]');
  await p.setInputFiles('#i-gal-f', ['/tmp/qa/em/IMG_2001.jpg', '/tmp/qa/em/WhatsApp Image 2026-05-24 at 09.15.02.jpeg', '/tmp/qa/em/room.jpg', '/tmp/qa/em/clip.mp4']);
  await p.waitForFunction(() => document.querySelectorAll('#i-gal .gi').length === 4, null, { timeout: 60000 });
  const dates = await p.locator('#i-gal .gi-date:not([hidden])').allInnerTexts();
  assert(dates.some(t => /23 May 2026 · from the camera/.test(t)), 'photo date read from the camera');
  assert(dates.some(t => /24 May 2026 · sent on WhatsApp, taken earlier/.test(t)), 'WhatsApp date labelled as the day it was sent');
  assert(dates.some(t => /No date in the file/.test(t)), 'a photo without a date asks for one');
  assert(dates.some(t => /23 May 2026 · from the video file/.test(t)), 'video recording date read');
  await p.screenshot({ path: '/tmp/qa/em-gallery-uploading.png', fullPage: false });
  // type the missing date and a caption
  await p.fill('#i-gal input[type=date][data-galdate]:visible', '2026-05-23'); await p.locator('#i-gal input[type=date][data-galdate]:visible').dispatchEvent('change');
  await p.waitForFunction(() => ![...document.querySelectorAll('#i-gal .gi-date:not([hidden])')].some(d => /No date/.test(d.textContent)), null, { timeout: 10000 });
  assert(true, 'missing date typed in and saved');
  const cap = p.locator('#i-gal [data-galcap]').first(); await cap.fill('Opening of the evening'); await cap.dispatchEvent('change'); await p.waitForTimeout(500);
  // video converts, then the thumbnail appears
  await p.waitForFunction(() => { const v = document.querySelector('#i-gal .gi.vid'); return v && v.querySelector('img'); }, null, { timeout: 90000 });
  assert(await p.locator('#i-gal .gi.vid .gi-d').innerText() === '▶ 0:03', 'video converted: thumbnail and length shown');
  await p.click('#ev-save'); await p.waitForTimeout(800);
  await p.locator('#i-gal').screenshot({ path: '/tmp/qa/em-gallery.png' });

  // settings: logo card
  await p.goto(B + '/admin#settings'); await p.waitForSelector('#logo-card h3');
  assert((await p.textContent('#logo-card')).includes('Logo on pictures'), 'settings shows the logo card');
  await p.locator('#logo-card').screenshot({ path: '/tmp/qa/em-logo-card.png' });

  const joyPhone = await b.newContext(devices['iPhone 14']), jp = await joyPhone.newPage();
  await jp.goto(B + '/admin'); await jp.fill('#e','admin'); await jp.fill('#pw','Admin2025-qa!'); await jp.click('#lbtn');
  await jp.waitForSelector('#app', {state:'visible'}); await jp.goto(B + '/admin#events');
  await jp.waitForSelector('[data-open="UI9"]'); await jp.click('[data-open="UI9"]'); await jp.waitForSelector('#ep-make-quote');
  assert(await jp.locator('#ep-client').isVisible() && await jp.locator('#ep-cost-add').isVisible(), 'Joy can access client and budget controls on a phone');
  assert(await jp.evaluate(() => document.documentElement.scrollWidth-innerWidth)<=1, 'phone event planner has no sideways scrolling');
  await joyPhone.close();

  // the public page
  const pub = await b.newContext(devices['iPhone 14']), q = await pub.newPage(); q.on('pageerror', e => errs.push(e.message));
  await q.goto(B + '/events/founders-evening');
  assert((await q.textContent('h1')) === 'Founders Evening', 'public event page');
  assert((await q.textContent('.evp-main')).includes('We meet again in June.'), 'recap shown');
  assert(await q.locator('.evp-gal figure').count() === 3 && await q.locator('.evp-vid video').count() === 1, 'three photos and the video');
  const caps = (await q.locator('.evp-gal figcaption').allInnerTexts()).join(' | ');
  assert(caps.includes('Opening of the evening · 23 May 2026') && !caps.includes('24 May'), 'captions with real dates only (not the WhatsApp send date)');
  const over = await q.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert(over <= 1, 'phone: no sideways scroll');
  await q.screenshot({ path: '/tmp/qa/em-public-phone.png', fullPage: true });
  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log('PASSED');
})().catch(e => { console.error(e); process.exit(1); });
