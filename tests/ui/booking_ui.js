// Homepage: on a phone the headline and the first button are on the first screen (above the bottom dock), and the
// "Book a free call" form offers the next working days, builds a WhatsApp / email request with the chosen day and time,
// and speaks French. Serves apps/site/dist itself (build first: python3 apps/site/build.py). Screenshots in /tmp/qa/bk-*.png
const { chromium, devices } = require(process.env.PLAYWRIGHT);
const http = require('http'), fs = require('fs'), path = require('path');
const DIST = path.join(__dirname, '../../apps/site/dist');
const assert = (c, m) => { if (!c) throw new Error('FAIL ' + m); console.log('  ok', m); };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; if (!path.extname(p)) p += fs.existsSync(path.join(DIST, p, 'index.html')) ? '/index.html' : '.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { r.statusCode = r.url === '/api/items' ? 200 : 404; return r.end(q.url.startsWith('/api/') ? '{"items":[]}' : 'no'); }
  r.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f));
}).listen(0);
(async () => {
  const B = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
  const errs = [];
  const ctx = await b.newContext({ ...devices['iPhone 14'] }), m = await ctx.newPage();
  m.on('pageerror', e => errs.push(e.message));
  await m.goto(B + '/index.html'); await m.waitForTimeout(1500);
  const pos = await m.evaluate(() => { const h = document.querySelector('h1').getBoundingClientRect(), c = document.querySelector('.hero-cta .btn').getBoundingClientRect(), d = document.querySelector('.dock').getBoundingClientRect(), g = document.querySelector('.globe-wrap').getBoundingClientRect();
    return { h1: h.top, cta: c.bottom, dock: d.top, vh: innerHeight, globe: g.top, h1b: h.bottom }; });
  assert(pos.h1 < 260 && pos.h1b < pos.dock, 'phone: the headline is on the first screen, above the dock');
  assert(pos.cta < pos.dock, 'phone: the first button ends above the bottom dock, not under it');
  assert(pos.globe > pos.h1b, 'phone: the globe comes after the headline');
  await m.screenshot({ path: '/tmp/qa/bk-phone-top.png' });

  const days = await m.$$eval('#b-day option', o => o.map(x => x.value));
  assert(days.length === 7 && days.every(v => ![0, 6].includes(new Date(v + 'T12:00:00Z').getUTCDay())), 'booking: seven working days offered, no weekends');
  assert(days[0] > new Date().toISOString().slice(0, 10), 'booking: the first day is after today');
  await m.evaluate(() => document.querySelector('#book').scrollIntoView()); await m.waitForTimeout(600);
  await m.screenshot({ path: '/tmp/qa/bk-phone-form.png' });
  await m.click('#bookF button[type=submit]');   // name empty: nothing opens
  await m.fill('#b-name', 'Ama Mensah'); await m.selectOption('#b-time', '14:00'); await m.selectOption('#b-topic', 'AI in your business');
  await ctx.route('**/wa.me/**', r => r.fulfill({ status: 200, body: 'wa' }));
  const [pop] = await Promise.all([ctx.waitForEvent('page'), m.click('#bookF button[type=submit]')]);
  const u = decodeURIComponent(pop.url());
  assert(u.includes('wa.me/233550416627'), 'WhatsApp request goes to the Gotham number');
  assert(u.includes('Ama Mensah') && u.includes('14:00') && u.includes('AI in your business') && /Preferred time: \w+day, \d+ \w+ 2026 at 14:00 \(Accra time, GMT\)/.test(u), 'the request carries name, topic, day and time in English');

  await Promise.all([m.waitForNavigation().catch(() => {}), m.evaluate(() => document.querySelector('[data-lang="fr"]').click())]); await m.waitForSelector('#book'); await m.waitForTimeout(1200);
  const fr = await m.$eval('#book', e => e.innerText);
  assert(/Réserver un appel/i.test(fr) && /Un appel gratuit de 20 minutes/.test(fr) && /Heure \(Accra, GMT\)/.test(fr) && /(lundi|mardi|mercredi|jeudi|vendredi) \d/.test(fr), 'booking section is in French, with French dates');
  await m.fill('#b-name', 'Ama Mensah'); await m.selectOption('#b-time', '14:00');
  const [pop2] = await Promise.all([ctx.waitForEvent('page'), m.click('#bookF button[type=submit]')]);
  assert(/Preferred time: \w+day, \d+ \w+ 2026 at 14:00/.test(decodeURIComponent(pop2.url())), 'the request to the team stays in English even when the page is French');
  await Promise.all([m.waitForNavigation().catch(() => {}), m.evaluate(() => document.querySelector('[data-lang="es"]').click())]); await m.waitForSelector('#book'); await m.waitForTimeout(1800);
  assert(/Reservar una llamada/i.test(await m.$eval('#book', e => e.innerText)), 'booking section is in Spanish');

  const d = await b.newPage({ viewport: { width: 1440, height: 900 } }); d.on('pageerror', e => errs.push(e.message));
  await d.goto(B + '/index.html'); await d.waitForTimeout(1200);
  assert((await d.$eval('.hero-cta .btn-gold', e => e.getAttribute('href'))) === '#book', 'desktop: the hero button goes to the booking form');
  assert(await d.evaluate(() => { const g = document.querySelector('.globe-wrap').getBoundingClientRect(), h = document.querySelector('h1').getBoundingClientRect(); return g.left > h.left + 200; }), 'desktop: the globe stays on the right');
  assert(errs.length === 0, 'no script errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); srv.close();
})().catch(e => { console.error(e.message); process.exit(1); });
