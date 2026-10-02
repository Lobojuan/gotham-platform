// /demo/receptionist: a voice call with a stand-in microphone and speaker (the browser's speech APIs are replaced), typing,
// the "try" buttons, the live back office, restart, French, no voice support, and the phone layout.
// Needs a server on :4199 started with the stand-in model (tests/e2e/mock_ai.js). Screenshots in /tmp/qa/rc-*.png
const { chromium, devices } = require(process.env.PLAYWRIGHT);
const B = 'http://127.0.0.1:4199';
const assert = (c, m) => { if (!c) throw new Error('FAIL ' + m); console.log('  ok', m); };
/* a fake microphone: each start() "hears" the next line, then ends; a fake speaker that finishes at once */
const fakeVoice = lines => {
  window.__heard = lines.slice(); window.__spoken = [];
  class SR { start() { setTimeout(() => this.onaudiostart && this.onaudiostart(), 20); const t = window.__heard.shift(); setTimeout(() => { if (t) this.onresult && this.onresult({ results: [[{ transcript: t }]] }); this.onend && this.onend(); }, t ? 150 : 400); } abort() {} }
  window.webkitSpeechRecognition = SR; window.SpeechRecognition = SR;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: u => { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 50); }, cancel() {}, getVoices: () => [] } });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
};
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(fakeVoice, ['How much is a dental check?', 'I would like to book a doctor', 'Can I pay now?']);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(B + '/services/ai'); await p.click('.hero-cta a[href="/demo/receptionist"]');
  await p.waitForURL('**/demo/receptionist');
  assert((await p.textContent('h1')).includes('Call our AI receptionist'), 'the AI page links to the demo');
  assert((await p.textContent('#rc-bookings')).includes('Nothing yet'), 'empty back office to start');
  await p.click('#rc-mic');
  await p.waitForFunction(() => document.querySelectorAll('#rc-log li.a').length >= 4, null, { timeout: 15000 });
  await p.waitForFunction(() => document.querySelectorAll('#rc-links li:not(.rc-empty)').length === 1, null, { timeout: 15000 });
  const log = await p.$$eval('#rc-log li', l => l.map(x => x.className + ':' + x.textContent));
  assert(log[0].startsWith('a:Good day, Kasa Family Clinic'), 'the call opens with the greeting written out');
  assert(log.some(x => x === 'u:I would like to book a doctor') && log.some(x => x.startsWith('a:MOCK booked')), 'what was heard is sent and answered, turn after turn');
  assert(log.some(x => x === 's:Appointment added to the clinic diary') && log.some(x => x === 's:Payment link sent'), 'the log marks what was done');
  const spoken = await p.evaluate(() => window.__spoken);
  assert(!spoken.some(t => t.startsWith('Good day')) && spoken.some(t => t.startsWith('MOCK booked')), 'the caller spoke at once, so the greeting was not read over them; answers are spoken aloud');
  const bk = await p.textContent('#rc-bookings');
  assert(/Ama Test · \+233241234567 · GHS \d+/.test(bk) && bk.includes('Payment link sent'), 'the booking shows in the back office with its status');
  assert((await p.textContent('#rc-links')).includes('To +233241234567 by SMS and WhatsApp'), 'the payment link shows');
  await p.waitForFunction(() => document.getElementById('rc-mic').dataset.state === 'listening', null, { timeout: 5000 });
  await p.click('#rc-end'); assert(await p.getAttribute('#rc-mic', 'data-state') === 'idle', 'end call stops listening');
  await p.fill('#rc-text', 'Can a nurse call me?'); await p.press('#rc-text', 'Enter');
  await p.waitForFunction(() => document.querySelectorAll('#rc-callbacks li:not(.rc-empty)').length === 1, null, { timeout: 10000 });
  assert((await p.textContent('#rc-callbacks')).includes('Call back Ama Test'), 'typing works too: a call-back task appears');
  await p.click('.rc-try button:first-child');
  await p.waitForFunction(() => [...document.querySelectorAll('#rc-log li.u')].some(x => x.textContent === 'How much is a dental check?'), null, { timeout: 10000 });
  assert(true, 'a "try" button asks its question');
  await p.screenshot({ path: '/tmp/qa/rc-desk.png', fullPage: true });
  await p.reload(); await p.waitForTimeout(600);
  assert((await p.textContent('#rc-bookings')).includes('Ama Test'), 'reloading the page keeps this visit\'s board');
  await p.click('#rc-reset'); await p.waitForTimeout(500);
  assert((await p.textContent('#rc-bookings')).includes('Nothing yet') && !(await p.textContent('#rc-log')), 'restart clears the call and the board');

  // French, and a browser without speech recognition
  const fr = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await fr.addInitScript(() => { try { localStorage.setItem('gc-language', 'fr'); } catch {} delete window.webkitSpeechRecognition; delete window.SpeechRecognition; });
  const pf = await fr.newPage(); pf.on('pageerror', e => errs.push(e.message));
  await pf.goto(B + '/demo/receptionist'); await pf.waitForTimeout(1200);
  assert((await pf.textContent('h1')).includes('Appelez notre réceptionniste IA'), 'French page');
  assert((await pf.textContent('#rc-warn')).includes('La voix nécessite Chrome'), 'no speech recognition: says so in French and offers typing');
  await pf.fill('#rc-text', 'Bonjour'); await pf.press('#rc-text', 'Enter');
  await pf.waitForFunction(() => document.querySelectorAll('#rc-log li.a').length === 1, null, { timeout: 10000 });
  assert((await pf.textContent('#rc-log')).includes('[French]'), 'the receptionist is asked to answer in French');
  await pf.screenshot({ path: '/tmp/qa/rc-fr.png' });

  // phone
  const ph = await (await b.newContext(devices['iPhone 14'])).newPage(); ph.on('pageerror', e => errs.push(e.message));
  await ph.goto(B + '/demo/receptionist');
  assert(await ph.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, 'phone: no sideways scroll');
  const small = await ph.evaluate(() => [...document.querySelectorAll('#rc-mic, #rc-form button, #rc-text, .rc-try button, #rc-reset')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 40).length);
  assert(small === 0, 'phone: buttons and the text box are big enough to tap');
  await ph.screenshot({ path: '/tmp/qa/rc-phone.png', fullPage: true });
  assert(errs.length === 0, 'no script errors: ' + errs.join(' | '));
  await b.close(); console.log('PASSED');
})().catch(e => { console.error(e.message); process.exit(1); });
