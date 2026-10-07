/* Native-language voices for Ask Gotham. Only an answer just issued to this visitor may be spoken.
   Tokens and audio never go into the database. English retains Jarvis's Kokoro bm_fable;
   France/Spain speech uses regional Piper recordings rather than English speaker embeddings. */
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
const payments=JSON.parse(fs.readFileSync(fileURLToPath(new URL('./ask-payment.json',import.meta.url)),'utf8'));
const voices=JSON.parse(fs.readFileSync(fileURLToPath(new URL('./ask-voices.json',import.meta.url)),'utf8'));
const regional=Object.fromEntries(['fr','es','de'].map(language=>[language,makeTTS({
  python:process.env.PIPER_PYTHON || '/opt/piper/bin/python',
  model:path.join(process.env.ASK_PIPER_VOICES || '/opt/voices',voices[language].model+'.onnx'),
  script:fileURLToPath(new URL('./ask-piper.py',import.meta.url)),maxChars:2000,cacheMax:20,timeoutMs:300000,
  workerEnv:{ASK_PIPER_LANGUAGE:language,OMP_NUM_THREADS:'1'}
})]));
const chinese = makeTTS({ python:process.env.KOKORO_ZH_PYTHON || '/opt/kokoro-zh-venv/bin/python',
  model:process.env.KOKORO_ZH_MODEL || '/opt/ask-voices/zh/kokoro-v1.1-zh.onnx',
  script:fileURLToPath(new URL('./ask-chinese.py',import.meta.url)),maxChars:2000,cacheMax:20,timeoutMs:300000,
  workerEnv:{KOKORO_ZH_VOICES:process.env.KOKORO_ZH_VOICES || '/opt/ask-voices/zh/voices-v1.1-zh.bin',KOKORO_ZH_CONFIG:process.env.KOKORO_ZH_CONFIG || '/opt/ask-voices/zh/config.json',OMP_NUM_THREADS:'1'} });
const arabic = makeTTS({ python:process.env.KOKORO_ZH_PYTHON || '/opt/kokoro-zh-venv/bin/python',
  model:process.env.SUPERTONIC_MODEL || '/opt/ask-voices/ar/onnx/tts.json',
  script:fileURLToPath(new URL('./ask-arabic.py',import.meta.url)),maxChars:2000,cacheMax:20,timeoutMs:300000,
  workerEnv:{SUPERTONIC_STYLE:process.env.SUPERTONIC_STYLE || '/opt/ask-voices/ar/voice_styles/M1.json',OMP_NUM_THREADS:'1'} });
const workers={en:voice,...regional,zh:chinese,ar:arabic};
const installationAvailable=(language='en')=>(workers[language] || voice).available();
function introAudio(text,language) {
  const filename=voices[language].voice+'-'+language+'.mp3';
  const intro=path.join(process.env.KOKORO_INTROS || '/opt/kokoro-intros',filename);
  if(text===welcomes[language] && fs.existsSync(intro))return fs.readFileSync(intro);
  const payment=path.join(process.env.KOKORO_PAYMENTS || '/opt/kokoro-payments',filename);
  if(text===payments[language] && fs.existsSync(payment))return fs.readFileSync(payment);
  return null;
}
async function renderVoice(text,language,signal) {
  const cached=introAudio(text,language);if(cached)return cached;
  return (workers[language] || voice).say(text,language,signal);
}
export function makeAskVoice({ enabled = installationAvailable, render = renderVoice,
  dailyCap = Number(process.env.ASK_TTS_DAILY_CAP ?? 400), now = Date.now } = {}) {
  const tickets = new Map(),jobs=new Map(); let day = '', used = 0, minute = 0, burst = 0, active = 0;
  const available = (language='en') => enabled(language) && Number.isFinite(dailyCap) && dailyCap > 0;
  function issue(text, ip, language = 'en') {
    language = Object.hasOwn(voices,language) ? language : 'en';
    if (!available(language)) return null;
    for (const [k, t] of tickets) if (t.expires <= now()) tickets.delete(k);
    while (tickets.size >= 1000) tickets.delete(tickets.keys().next().value);
    const token = crypto.randomBytes(24).toString('base64url');
    tickets.set(token, { text: String(text).slice(0, 2000).replace(/https?:\/\/\S+/g,({en:'source link in the chat',fr:'lien source dans le chat',es:'enlace de la fuente en el chat',de:'Quellenlink im Chat',zh:'聊天中的来源链接',ar:'رابط المصدر في المحادثة'})[language] || 'source link in the chat'), language, ip, expires: now() + 10 * 60e3 });
    return { token, voice: voices[language].voice };
  }
  function take(token, ip) {
    const t = tickets.get(token);
    if (!available(t?.language)) return { status: 503, error: 'voice_unavailable' };
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
  function start(token,ip,stream=false) {
    const ticket=tickets.get(token);
    if(ticket && ticket.ip===ip && ticket.expires>now())for(const [key,j]of jobs)if(j.ip===ip && !j.complete)cancel(key,ip);
    const taken=take(token,ip);if(!taken.ticket)return taken;
    const cached=introAudio(taken.ticket.text,taken.ticket.language);if(cached){active--;return {status:200,audio:cached};}
    for(const [key,j]of jobs)if(j.expires<=now())jobs.delete(key);
    while(jobs.size>=100){const old=[...jobs].find(([,j])=>j.status!==202);if(!old)break;jobs.delete(old[0]);}
    const job=crypto.randomBytes(24).toString('base64url'),state={ip,expires:now()+10*60e3,status:202,parts:[],complete:false,controller:new AbortController()};jobs.set(job,state);
    Promise.resolve().then(async()=>{
      if(!stream){state.parts.push(await render(taken.ticket.text,taken.ticket.language,state.controller.signal));state.complete=true;state.status=200;return;}
      // A short first phrase starts speaking sooner. Every word is retained; later parts continue in order.
      let rest=taken.ticket.text.replace(/\s+/g,' ').trim(),first=true;
      while(rest){if(state.controller.signal.aborted)throw new Error('cancelled');const max=first?45:150;
        let cut=rest.length<=max?rest.length:rest.lastIndexOf(' ',max);if(cut<1)cut=Math.min(max,rest.length);
        const text=rest.slice(0,cut);rest=rest.slice(cut).trim();first=false;
        state.parts.push(await render(text,taken.ticket.language,state.controller.signal));
      }
      state.complete=true;state.status=200;
    }).catch(()=>{state.complete=true;state.error='voice_unavailable';state.status=503;}).finally(()=>{if(!state.released)active--;});
    return {status:202,job,retry_after:1};
  }
  function result(job,ip) {
    const state=jobs.get(job);
    if(!state || state.ip!==ip || state.expires<=now())return {status:403,error:'invalid_voice_job'};
    if(state.parts.length){const audio=state.parts.shift(),more=!state.complete || state.parts.length>0;if(!more)jobs.delete(job);return {status:200,audio,more};}
    if(!state.complete)return {status:202,retry_after:1};
    jobs.delete(job);return {status:503,error:'voice_unavailable'};
  }
  function cancel(job,ip){const state=jobs.get(job);if(!state || state.ip!==ip)return {status:403,error:'invalid_voice_job'};jobs.delete(job);if(!state.complete && !state.released){state.released=true;active--;}state.controller.abort();return {status:200,ok:true};}
  return { issue, speak, start, result, cancel, available };
}
