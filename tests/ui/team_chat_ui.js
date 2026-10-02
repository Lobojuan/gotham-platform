// Team chat in the back office: two people chatting live, @mention badge, a photo, a thread from a company record,
// the AI's website proposal on an event thread published to the forum page, and the phone layout.
// Needs a server on :4199 with the stand-in model (tests/e2e/mock_ai.js) and a fresh database. Screenshots in /tmp/qa/tc-*.png
const { chromium, devices } = require(process.env.PLAYWRIGHT);
const { execSync } = require('child_process');
const B = 'http://127.0.0.1:4199', DB = process.env.TEST_DATABASE_URL || 'postgres://test@127.0.0.1:5439/gotham_test';
const assert = (c, m) => { if (!c) throw new Error('FAIL ' + m); console.log('  ok', m); };
const psql = sql => execSync(`psql ${DB} -qAtc "${sql}"`).toString().trim();
(async () => {
  psql("update users set must_change=false");
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
  const errs = [];
  const watch = p => { p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); }); p.on('dialog', d => d.accept()); };
  const own = await b.newContext({ viewport: { width: 1360, height: 900 } }), po = await own.newPage(); watch(po);
  const signIn = async (p, e, pw) => { await p.goto(B + '/admin'); await p.fill('#e', e); await p.fill('#pw', pw); await p.click('#lform button'); await p.waitForSelector('#app', { state: 'visible' }); };
  await signIn(po, 'admin', 'Admin2025'); assert(true, 'owner signs in');
  const joyPw = await po.evaluate(async () => (await (await fetch('/api/users', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'joy@gothamconsult.com', name: 'Joy Preston', role: 'admin' }) })).json()).password);
  psql("update users set must_change=false");
  const joyC = await b.newContext({ viewport: { width: 1280, height: 860 } }), pj = await joyC.newPage(); watch(pj);
  await signIn(pj, 'joy@gothamconsult.com', joyPw); assert(true, 'Joy signs in');

  await po.goto(B + '/admin#chat'); await po.waitForSelector('#cht');
  assert((await po.textContent('#chl')).includes('#general') && (await po.textContent('#chl')).includes('#forums'), 'Team chat in the menu opens #general; channels listed');
  await po.fill('#cht', 'Morning! @Jo'); await po.waitForSelector('#chmn button');
  assert((await po.textContent('#chmn')).includes('@Joy'), 'typing @Jo suggests @Joy');
  await po.click('#chmn button'); await po.type('#cht', 'can you check the venue list?'); await po.press('#cht', 'Enter');
  await po.waitForFunction(() => document.querySelectorAll('#chs .chmsg').length === 1);
  assert((await po.textContent('#chs')).includes('Morning! @Joy can you check the venue list?'), 'message sent with Enter');

  await pj.goto(B + '/admin#dash'); await pj.reload(); await pj.waitForFunction(() => document.querySelector('#chcnt') && document.querySelector('#chcnt').textContent === '1', null, { timeout: 10000 });
  assert(await pj.evaluate(() => document.querySelector('#chcnt').classList.contains('warn')), 'Joy sees an unread badge, marked as a mention');
  await pj.click('#nav a[data-v="chat"]'); await pj.waitForSelector('#chs .chmsg.at');
  assert(true, 'the mention is highlighted for Joy');
  await pj.fill('#cht', 'Yes, on it. Booked the hall.'); await pj.press('#cht', 'Enter');
  await po.waitForFunction(() => document.querySelector('#chs').textContent.includes('Booked the hall'), null, { timeout: 10000 });
  assert(true, 'the reply appears for the owner without reloading');
  await pj.waitForFunction(() => document.querySelector('#chcnt').textContent === '', null, { timeout: 25000 });
  assert(true, 'reading clears Joy\'s badge');

  // a photo
  const png = require('fs').readFileSync('/tmp/qa/rc-desk.png');
  await po.setInputFiles('#chfile', { name: 'venue.png', mimeType: 'image/png', buffer: png });
  await po.waitForSelector('#chfp:not([hidden]) #chfx'); await po.click('#chc button.btn-dark');
  await po.waitForSelector('#chs img.chimg');
  assert(await po.waitForFunction(() => { const i = document.querySelector('#chs img.chimg'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 10000 }).then(() => true, () => false), 'a photo uploads and shows as a preview');

  // a thread on a company record
  const cid = psql("insert into contacts(company, full_name, email) values ('Asante Gold Test','Kofi Asante','kofi@example.com') returning id");
  await po.goto(B + '/admin#rec/' + cid); await po.waitForSelector('#rc-chat'); await po.click('#rc-chat');
  await po.waitForFunction(() => location.hash.startsWith('#chat/') && document.querySelector('.chh') && document.querySelector('.chh').textContent.includes('Asante Gold Test'));
  await po.fill('#cht', 'Kofi wants the mining briefing next week'); await po.press('#cht', 'Enter');
  await po.waitForFunction(() => document.querySelector('#chl').textContent.includes('Asante Gold Test'));
  assert((await po.textContent('#chl')).includes('Company'), 'Team chat on a company opens its own thread, listed under clients, deals & events');

  // an event thread: the AI proposes, an admin publishes, the forum page shows it
  await po.goto(B + '/admin#events'); await po.waitForSelector('[data-open="F1"]'); await po.click('[data-open="F1"]');
  await po.waitForSelector('#ev-chat'); await po.click('#ev-chat');
  await po.waitForFunction(() => document.querySelector('.chh') && document.querySelector('.chh').textContent.includes('(F1)'));
  await po.fill('#cht', 'Kwame Test from Test Mining confirmed as speaker!'); await po.press('#cht', 'Enter');
  await po.waitForSelector('[data-pub]', { timeout: 15000 });
  assert((await po.textContent('.chp')).includes('Add speaker: Kwame Test (CEO, Test Mining)'), 'the AI proposes the website update as a card');
  await po.screenshot({ path: '/tmp/qa/tc-proposal.png' });
  await po.click('[data-pub]');
  await po.waitForFunction(() => document.querySelector('#chs').textContent.includes('Published to the website by'), null, { timeout: 10000 });
  assert(!(await po.$('[data-pub]')), 'published once: the buttons are gone');
  const slug = psql("select coalesce(slug, code) from items where code='F1'");
  const ev = await (await own.newPage()); await ev.goto(B + '/events/' + encodeURIComponent(slug));
  const page = await ev.textContent('body');
  assert(page.includes('Kwame Test') && page.includes('CEO, Test Mining'), 'the speaker is on the public forum page');
  assert(page.includes('Latest news') && page.includes('MOCK news: Kwame Test joins the panel.'), 'and the news line under "Latest news"');
  await ev.screenshot({ path: '/tmp/qa/tc-event.png', fullPage: true });
  await po.goto(B + '/admin#chat'); await po.waitForSelector('#cht'); await po.screenshot({ path: '/tmp/qa/tc-desk.png' });

  // phone
  const ph = await (await b.newContext(devices['iPhone 14'])).newPage(); watch(ph);
  await signIn(ph, 'joy@gothamconsult.com', joyPw);
  await ph.goto(B + '/admin#chat'); await ph.waitForSelector('#cht');
  assert(await ph.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, 'phone: no sideways scroll');
  assert(await ph.$('#bnav a[data-b="chat"]'), 'phone: Chat in the bottom bar');
  await ph.screenshot({ path: '/tmp/qa/tc-phone.png' });
  assert(errs.length === 0, 'no script errors: ' + errs.join(' | '));
  await b.close(); console.log('PASSED');
})().catch(e => { console.error(e.message); process.exit(1); });
