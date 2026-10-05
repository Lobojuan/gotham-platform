/* Fable for Ask Gotham. Only an answer just issued to this visitor may be spoken.
   Tokens and audio never go into the database. Kokoro's bm_fable is the same local voice as Jarvis. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTTS } from './tts.js';
const model = process.env.KOKORO_MODEL || '/opt/kokoro/kokoro-v1.0.onnx';
const voice = makeTTS({ python: process.env.KOKORO_PYTHON || '/opt/kokoro-venv/bin/python', model,
  script: fileURLToPath(new URL('./ask-voice.py', import.meta.url)), maxChars: 2000, cacheMax: 20, timeoutMs: 300000,
  workerEnv: { KOKORO_VOICES: process.env.KOKORO_VOICES || path.join(path.dirname(model), 'voices-v1.0.bin'), OMP_NUM_THREADS: '1' } });

const welcomes=JSON.parse(fs.readFileSync(fileURLToPath(new URL('./ask-welcome.json',import.meta.url)),'utf8'));
function introAudio(text,language) {
  const intro=path.join(process.env.KOKORO_INTROS || '/opt/kokoro-intros',language+'.mp3');
  if(text===welcomes[language] && fs.existsSync(intro))return fs.readFileSync(intro);
  return null;
}
async function renderVoice(text,language) {
  const cached=introAudio(text,language);if(cached)return cached;
  return voice.say(text,language);
}
export function makeAskVoice({ enabled = () => voice.available(), render = renderVoice,
  dailyCap = Number(process.env.ASK_TTS_DAILY_CAP ?? 400), now = Date.now } = {}) {
  const tickets = new Map(),jobs=new Map(); let day = '', used = 0, minute = 0, burst = 0, active = 0;
  const available = () => enabled() && Number.isFinite(dailyCap) && dailyCap > 0;
  function issue(text, ip, language = 'en') {
    if (!available()) return null;
    for (const [k, t] of tickets) if (t.expires <= now()) tickets.delete(k);
    while (tickets.size >= 1000) tickets.delete(tickets.keys().next().value);
    const token = crypto.randomBytes(24).toString('base64url');
    tickets.set(token, { text: String(text).slice(0, 2000), language: ['en', 'fr', 'es'].includes(language) ? language : 'en', ip, expires: now() + 10 * 60e3 });
    return { token, voice: 'bm_fable' };
  }
  function take(token, ip) {
    if (!available()) return { status: 503, error: 'voice_unavailable' };
    const t = tickets.get(token);
    if (!t || t.ip !== ip || t.expires <= now()) return { status: 403, error: 'invalid_voice_token' };
    const today = new Date(now()).toISOString().slice(0, 10), m = Math.floor(now() / 60000);
    if (day !== today) { day = today; used = 0; }
    if (minute !== m) { minute = m; burst = 0; }
    if (used >= dailyCap || burst >= 20 || (active >= 2 && !introAudio(t.text,t.language))) return { status: 429, error: 'voice_limit' };
    // Consume before the async call: parallel requests cannot charge twice for this answer.
    tickets.delete(token); used++; burst++; active++;
    return {ticket:t};
  }
  async function speak(token, ip) {
    const taken=take(token,ip);if(!taken.ticket)return taken;const t=taken.ticket;
    try { return { status: 200, audio: await render(t.text, t.language) }; }
    catch { return { status: 503, error: 'voice_unavailable' }; }
    finally { active--; }
  }
  function start(token,ip) {
    const taken=take(token,ip);if(!taken.ticket)return taken;
    const cached=introAudio(taken.ticket.text,taken.ticket.language);if(cached){active--;return {status:200,audio:cached};}
    for(const [key,j]of jobs)if(j.expires<=now())jobs.delete(key);
    while(jobs.size>=100){const old=[...jobs].find(([,j])=>j.status!==202);if(!old)break;jobs.delete(old[0]);}
    const job=crypto.randomBytes(24).toString('base64url'),state={ip,expires:now()+10*60e3,status:202};jobs.set(job,state);
    Promise.resolve().then(()=>render(taken.ticket.text,taken.ticket.language))
      .then(audio=>{state.audio=audio;state.status=200;},()=>{state.error='voice_unavailable';state.status=503;}).finally(()=>active--);
    return {status:202,job,retry_after:3};
  }
  function result(job,ip) {
    const state=jobs.get(job);
    if(!state || state.ip!==ip || state.expires<=now())return {status:403,error:'invalid_voice_job'};
    if(state.status===202)return {status:202,retry_after:3};
    jobs.delete(job);return state.audio?{status:200,audio:state.audio}:{status:503,error:'voice_unavailable'};
  }
  return { issue, speak, start, result, available };
}
