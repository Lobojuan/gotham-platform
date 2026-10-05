/* Fable for Ask Gotham. Only an answer just issued to this visitor may be spoken.
   Tokens and audio never go into the database. Kokoro's bm_fable is the same local voice as Jarvis. */
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTTS } from './tts.js';
const model = process.env.KOKORO_MODEL || '/opt/kokoro/kokoro-v1.0.onnx';
const voice = makeTTS({ python: process.env.KOKORO_PYTHON || '/opt/kokoro-venv/bin/python', model,
  script: fileURLToPath(new URL('./ask-voice.py', import.meta.url)), maxChars: 2000, cacheMax: 20, timeoutMs: 90000,
  workerEnv: { KOKORO_VOICES: process.env.KOKORO_VOICES || path.join(path.dirname(model), 'voices-v1.0.bin'), OMP_NUM_THREADS: '1' } });

export function makeAskVoice({ enabled = () => voice.available(), render = (text, language) => voice.say(text, language),
  dailyCap = Number(process.env.ASK_TTS_DAILY_CAP ?? 400), now = Date.now } = {}) {
  const tickets = new Map(); let day = '', used = 0, minute = 0, burst = 0, active = 0;
  const available = () => enabled() && Number.isFinite(dailyCap) && dailyCap > 0;
  function issue(text, ip, language = 'en') {
    if (!available()) return null;
    for (const [k, t] of tickets) if (t.expires <= now()) tickets.delete(k);
    while (tickets.size >= 1000) tickets.delete(tickets.keys().next().value);
    const token = crypto.randomBytes(24).toString('base64url');
    tickets.set(token, { text: String(text).slice(0, 2000), language: ['en', 'fr', 'es'].includes(language) ? language : 'en', ip, expires: now() + 10 * 60e3 });
    return { token, voice: 'bm_fable' };
  }
  async function speak(token, ip) {
    if (!available()) return { status: 503, error: 'voice_unavailable' };
    const t = tickets.get(token);
    if (!t || t.ip !== ip || t.expires <= now()) return { status: 403, error: 'invalid_voice_token' };
    const today = new Date(now()).toISOString().slice(0, 10), m = Math.floor(now() / 60000);
    if (day !== today) { day = today; used = 0; }
    if (minute !== m) { minute = m; burst = 0; }
    if (used >= dailyCap || burst >= 20 || active >= 3) return { status: 429, error: 'voice_limit' };
    // Consume before the async call: parallel requests cannot charge twice for this answer.
    tickets.delete(token); used++; burst++; active++;
    try { return { status: 200, audio: await render(t.text, t.language) }; }
    catch { return { status: 503, error: 'voice_unavailable' }; }
    finally { active--; }
  }
  return { issue, speak, available };
}
