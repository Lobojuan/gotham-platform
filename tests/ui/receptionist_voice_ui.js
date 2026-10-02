// /demo/receptionist with her own voice ("Jenny (Dioco)", made on our server): the greeting and answers play as audio
// from the server (not the browser's voice), piece after piece; tapping while she speaks cuts her off and listens;
// if the server voice fails the browser's voice takes over; French uses the browser's voice.
// Needs a server on :4199 with the stand-in model AND the voice:
//   PIPER_PYTHON=$(command -v python3) PIPER_MODEL=/tmp/qa/voices/en_GB-jenny_dioco-medium.onnx bash /tmp/qa/server_ai.sh
const { chromium } = require(process.env.PLAYWRIGHT);
const B = 'http://127.0.0.1:4199';
const assert = (c, m) => { if (!c) throw new Error('FAIL ' + m); console.log('  ok', m); };
const fakeVoice = lines => {
  window.__heard = lines.slice(); window.__spoken = []; window.__played = 0; window.__ended = 0;
  class SR { start() { if (!window.__prompt) setTimeout(() => this.onaudiostart && this.onaudiostart(), 20); const t = window.__heard.shift(); setTimeout(() => { if (t) this.onresult && this.onresult({ results: [[{ transcript: t }]] }); this.onend && this.onend(); }, t ? 150 : 400); } abort() {} }
  window.webkitSpeechRecognition = SR; window.SpeechRecognition = SR;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: u => { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 50); }, cancel() {}, getVoices: () => [] } });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { if (String(this.src).startsWith('blob:')) { window.__played++; this.addEventListener('ended', () => window.__ended++, { once: true }); } return play.call(this); };
};
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
  const errs = [];
  const watch = p => { p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); }); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(fakeVoice, []); await ctx.addInitScript(() => { window.__greetWait = 700; });
  const p = await ctx.newPage(); watch(p);
  const voiceReq = []; p.on('response', r => { if (r.url().endsWith('/receptionist/voice')) voiceReq.push(r.status() + ' ' + r.headers()['content-type']); });
  await p.goto(B + '/demo/receptionist'); await p.waitForTimeout(800);
  assert((await p.textContent('.rc-note')).includes('Jenny (Dioco)'), 'the page credits the voice "Jenny (Dioco)" (its licence asks for that)');
  await p.click('#rc-mic');
  assert(await p.getAttribute('#rc-mic', 'data-state') === 'listening', 'the microphone is open the moment the button is pressed');
  const t0 = Date.now();
  await p.waitForFunction(() => document.getElementById('rc-mic').dataset.state === 'speaking', null, { timeout: 20000 });
  const startMs = Date.now() - t0;
  await p.waitForFunction(() => window.__ended >= 1, null, { timeout: 20000 });
  assert(voiceReq[0] === '200 audio/mpeg', 'nobody spoke, so after a short silence she greets them: the greeting is fetched from the server as MP3');
  await p.evaluate(() => { window.__heard = ['How much is a dental check?']; });
  assert(!(await p.evaluate(() => window.__spoken)).length, 'and played as audio, not by the browser\'s voice (she started speaking %d ms after the silence began)'.replace('%d', startMs));
  await p.waitForFunction(() => [...document.querySelectorAll('#rc-log li.a')].some(x => x.textContent.startsWith('MOCK')) && window.__ended >= 2, null, { timeout: 20000 });
  assert((await p.evaluate(() => window.__spoken)).length === 0 && voiceReq.length >= 2, 'what she heard is answered, and the answer is spoken in her server voice too');
  await p.waitForFunction(() => document.getElementById('rc-mic').dataset.state === 'listening', null, { timeout: 5000 });
  assert(true, 'after she finishes, the page listens again');
  await p.click('#rc-end');

  // tapping while she speaks: she stops and the page listens
  await p.click('#rc-reset'); await p.waitForTimeout(300);
  await p.evaluate(() => { window.__heard = []; window.__ended = 0; });
  await p.click('#rc-mic');
  await p.waitForFunction(() => document.getElementById('rc-mic').dataset.state === 'speaking', null, { timeout: 20000 });
  await p.waitForTimeout(300); await p.click('#rc-mic');
  await p.waitForFunction(() => document.getElementById('rc-mic').dataset.state === 'listening', null, { timeout: 2000 });
  assert(await p.evaluate(() => window.__ended === 0), 'tapping while she speaks cuts her off at once and listens');
  await p.click('#rc-end');

  // the server voice fails: the browser's voice takes over
  await p.route('**/api/demo/receptionist/voice', r => r.fulfill({ status: 503, body: '{"error":"voice_failed"}', contentType: 'application/json' }));
  await p.click('#rc-reset'); await p.waitForTimeout(300);
  await p.evaluate(() => { window.__heard = []; window.__spoken = []; });
  await p.click('#rc-mic');
  await p.waitForFunction(() => window.__spoken.length >= 1, null, { timeout: 10000 });
  assert((await p.evaluate(() => window.__spoken[0])).startsWith('Good day'), 'when the server voice fails, the browser\'s voice speaks instead');
  await p.click('#rc-end'); await p.unroute('**/api/demo/receptionist/voice');

  // a phone's first visit: while the "Allow microphone?" question is open (no capture yet) she must not start talking
  const ph = await b.newContext(); await ph.addInitScript(fakeVoice, []); await ph.addInitScript(() => { window.__greetWait = 500; window.__prompt = true; });
  const pp = await ph.newPage(); watch(pp);
  await pp.goto(B + '/demo/receptionist'); await pp.waitForTimeout(500); await pp.click('#rc-mic'); await pp.waitForTimeout(2500);
  assert(await pp.getAttribute('#rc-mic', 'data-state') === 'listening' && (await pp.evaluate(() => window.__played)) === 0 && !(await pp.evaluate(() => window.__spoken)).length, 'while the microphone question is open, she waits and does not greet over it');
  assert((await pp.textContent('#rc-state')).includes('Please tap “Allow” to open the microphone') && (await pp.textContent('#rc-hint')).includes('Tap Allow so we can talk'), 'and politely asks the caller to tap Allow');
  await pp.evaluate(() => { window.__prompt = false; });
  await pp.waitForFunction(() => window.__played >= 1 || window.__spoken.length >= 1, null, { timeout: 15000 });
  assert(true, 'once the microphone is capturing and nobody speaks, she greets');
  assert(!(await pp.textContent('#rc-state')).includes('Allow'), 'the ask disappears once the microphone is open');

  // the microphone cannot be used (here: the browser says not-allowed): clear instructions, the page is not frozen, she still greets and answers out loud
  const bl = await b.newContext(); await bl.addInitScript(fakeVoice, []);
  await bl.addInitScript(() => { class SRX { start() { setTimeout(() => { this.onerror && this.onerror({ error: 'not-allowed' }); this.onend && this.onend(); }, 50); } abort() {} } window.webkitSpeechRecognition = SRX; window.SpeechRecognition = SRX; });
  const pb = await bl.newPage(); watch(pb);
  await pb.goto(B + '/demo/receptionist'); await pb.waitForTimeout(500); await pb.click('#rc-mic');
  await pb.waitForFunction(() => document.getElementById('rc-warn').style.display === 'block', null, { timeout: 5000 });
  assert((await pb.textContent('#rc-warn')).includes('microphone is blocked for this site') && (await pb.textContent('#rc-warn')).includes('padlock'), 'a blocked microphone is explained with what to do, not left as a frozen "Allow" message');
  await pb.waitForFunction(() => document.getElementById('rc-mic').dataset.state === 'idle', null, { timeout: 20000 });
  assert(!(await pb.textContent('#rc-state')).includes('Allow') && await pb.evaluate(() => window.__played >= 1 || window.__spoken.length >= 1), 'the button is usable again and she still greeted out loud');
  await pb.fill('#rc-text', 'How much is a dental check?'); await pb.press('#rc-text', 'Enter');
  await pb.waitForFunction(() => window.__played >= 2 || window.__spoken.length >= 2, null, { timeout: 25000 });
  assert(true, 'typing works and the answer is spoken out loud');

  // she can't hear me: the page shows when sound arrives, and after two silent rounds says how to check the microphone
  const qc = await b.newContext(); await qc.addInitScript(fakeVoice, []);
  await qc.addInitScript(() => { window.__greetWait = 60000; class SRQ { start() { setTimeout(() => this.onaudiostart && this.onaudiostart(), 20); if (window.__sound) setTimeout(() => this.onsoundstart && this.onsoundstart(), 100);
    setTimeout(() => { this.onerror && this.onerror({ error: 'no-speech' }); this.onend && this.onend(); }, 400); } abort() {} } window.webkitSpeechRecognition = SRQ; window.SpeechRecognition = SRQ; window.__sound = true; });
  const pq = await qc.newPage(); watch(pq);
  await pq.goto(B + '/demo/receptionist'); await pq.waitForTimeout(500); await pq.click('#rc-mic');
  await pq.waitForFunction(() => document.getElementById('rc-state').textContent.includes('I can hear you'), null, { timeout: 5000 });
  assert(true, 'when sound reaches the microphone, the page says "I can hear you"');
  await pq.waitForFunction(() => document.getElementById('rc-warn').textContent.includes('I cannot hear anything') && document.getElementById('rc-warn').style.display === 'block', null, { timeout: 8000 });
  assert((await pq.textContent('#rc-warn')).includes('System Settings, Sound, Input'), 'after two silent rounds it says how to check the microphone, and the note stays up');

  // French: the browser speaks
  const fr = await b.newContext(); await fr.addInitScript(() => { try { localStorage.setItem('gc-language', 'fr'); } catch {} });
  await fr.addInitScript(fakeVoice, []);
  const pf = await fr.newPage(); watch(pf);
  await pf.goto(B + '/demo/receptionist'); await pf.waitForTimeout(600); await pf.click('#rc-mic');
  await pf.waitForFunction(() => window.__spoken.length >= 1, null, { timeout: 10000 });
  assert((await pf.evaluate(() => window.__spoken[0])).startsWith('Bonjour') && (await pf.evaluate(() => window.__played)) === 0, 'French: the browser speaks, no server audio');
  assert(errs.length === 0, 'no script errors: ' + errs.join(' | '));
  await b.close(); console.log('PASSED');
})().catch(e => { console.error(e.message); process.exit(1); });
