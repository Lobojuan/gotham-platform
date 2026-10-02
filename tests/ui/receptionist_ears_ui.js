// /demo/receptionist with her own ears: where the browser's speech service does not work (Chrome on some computers says
// "network" at once) or does not exist (Firefox), the page records the caller from the microphone, notices when they stop
// talking, and our server turns the recording into text. A real Chromium with a fake microphone that plays a recorded
// sentence ("Hello, I would like to book an appointment for my daughter tomorrow morning.") is used, so the whole path is real:
// microphone, recording, the quiet/loud detection, upload, Whisper, the answer.
// Needs a server on :4199 with the stand-in model AND the listening model:
//   WHISPER_PYTHON=/tmp/qa/wh/bin/python WHISPER_MODEL=/tmp/qa/whisper/tiny bash /tmp/qa/server_ai.sh
// and /tmp/qa/stt/u1.wav (the sentence, made with Piper by tests/api/27_receptionist_listen.py).
const { chromium } = require(process.env.PLAYWRIGHT);
const { execSync } = require('child_process');
const B = 'http://127.0.0.1:4199';
const assert = (c, m) => { if (!c) throw new Error('FAIL ' + m); console.log('  ok', m); };
// 1.2 s of silence, the sentence, then 4 s of silence: what the fake microphone plays once
execSync('ffmpeg -v error -y -f lavfi -i anullsrc=r=48000:cl=mono -t 1.2 /tmp/qa/stt/sil1.wav && ffmpeg -v error -y -f lavfi -i anullsrc=r=48000:cl=mono -t 4 /tmp/qa/stt/sil2.wav && ffmpeg -v error -y -i /tmp/qa/stt/u1.wav -ac 1 -ar 48000 /tmp/qa/stt/u1_48.wav && ffmpeg -v error -y -i /tmp/qa/stt/sil1.wav -i /tmp/qa/stt/u1_48.wav -i /tmp/qa/stt/sil2.wav -filter_complex "[0][1][2]concat=n=3:v=0:a=1" -ac 1 -ar 48000 -c:a pcm_s16le /tmp/qa/stt/call.wav');
const common = () => {
  window.__spoken = [];
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: u => { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 50); }, cancel() {}, getVoices: () => [] } });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
};
// Chrome as on the owner's Mac: the speech service starts the microphone and then answers "network"
const brokenService = () => {
  class SR { start() { setTimeout(() => this.onaudiostart && this.onaudiostart(), 20); setTimeout(() => { this.onerror && this.onerror({ error: 'network' }); this.onend && this.onend(); }, 60); } abort() {} stop() {} }
  window.webkitSpeechRecognition = SR; window.SpeechRecognition = SR; window.__nativeStarts = 0;
};
const noService = () => { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=/tmp/qa/stt/call.wav%noloop', '--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  const watch = p => { p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); }); };

  // ---------- 1. the browser's speech service says "network" ----------
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.grantPermissions(['microphone'], { origin: B });
  await ctx.addInitScript(common); await ctx.addInitScript(brokenService); await ctx.addInitScript(() => { window.__greetWait = 20000; });
  const p = await ctx.newPage(); watch(p);
  const listenReq = []; p.on('response', r => { if (r.url().endsWith('/receptionist/listen')) listenReq.push(r.status()); });
  await p.goto(B + '/demo/receptionist'); await p.waitForTimeout(1000);
  await p.click('#rc-mic');
  await p.waitForFunction(() => [...document.querySelectorAll('#rc-log li.u')].length >= 1, null, { timeout: 40000 });
  const said = await p.textContent('#rc-log li.u');
  assert(/appointment/i.test(said) && /daughter/i.test(said), 'the browser\'s speech service failed, so the page listened itself: what was said arrives as text: "' + said + '"');
  assert(listenReq[0] === 200, 'the recording went to our server and came back (200)');
  assert(await p.evaluate(() => getComputedStyle(document.getElementById('rc-warn')).display) === 'none', 'no error is shown to the caller: it just works');
  assert(await p.evaluate(() => localStorage.getItem('rc-ears')) === '1', 'the page remembers to use our listening from now on');
  await p.waitForFunction(() => [...document.querySelectorAll('#rc-log li.a')].some(x => x.textContent.startsWith('MOCK')), null, { timeout: 20000 });
  assert(true, 'the answer to what she heard appears');
  await p.waitForFunction(() => document.getElementById('rc-mic').dataset.state === 'listening', null, { timeout: 10000 });
  assert(true, 'after the answer the page listens again');
  await p.screenshot({ path: '/tmp/qa/ears-1.png' });
  await p.click('#rc-end');
  await p.waitForTimeout(300);
  assert(await p.getAttribute('#rc-mic', 'data-state') === 'idle', 'ending the call returns to idle');
  await ctx.close();

  // ---------- 2. a browser with no speech service at all (Firefox) ----------
  const ctx2 = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx2.grantPermissions(['microphone'], { origin: B });
  await ctx2.addInitScript(common); await ctx2.addInitScript(noService); await ctx2.addInitScript(() => { window.__greetWait = 20000; });
  const p2 = await ctx2.newPage(); watch(p2);
  await p2.goto(B + '/demo/receptionist'); await p2.waitForTimeout(1000);
  assert(await p2.evaluate(() => document.getElementById('rc-warn').style.display) !== 'block', 'without any speech service the page does not say "voice is not supported"');
  await p2.click('#rc-mic');
  await p2.waitForFunction(() => [...document.querySelectorAll('#rc-log li.u')].length >= 1, null, { timeout: 40000 });
  assert(/appointment/i.test(await p2.textContent('#rc-log li.u')), 'and still understands the caller');
  await ctx2.close();

  // ---------- 3. the server has no listening installed: the page says so and types ----------
  const ctx3 = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx3.addInitScript(common); await ctx3.addInitScript(noService);
  const p3 = await ctx3.newPage(); watch(p3);
  await p3.route(/\/api\/demo\/receptionist\?/, async r => { const resp = await r.fetch(); const j = await resp.json(); j.listen = false; await r.fulfill({ response: resp, json: j }); });
  await p3.goto(B + '/demo/receptionist'); await p3.waitForTimeout(1200);
  assert((await p3.textContent('#rc-warn')).includes('Voice needs Chrome'), 'no speech service and no server listening: the page says voice is not available and offers typing');
  await ctx3.close();

  assert(errs.length === 0, 'no script errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
