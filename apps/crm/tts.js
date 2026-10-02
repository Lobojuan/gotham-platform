/* The receptionist demo's voice ("Jenny (Dioco)", a free Piper voice) made on our own server.
   One Python worker (tts.py) keeps the voice model loaded; requests queue one at a time (the server has one CPU).
   Speech is returned as MP3 (small enough for a phone on mobile data); recent sentences are kept in memory. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function makeTTS({ python = process.env.PIPER_PYTHON || '/opt/piper/bin/python', model = process.env.PIPER_MODEL || '/opt/voices/en_GB-jenny_dioco-medium.onnx',
  script = path.join(HERE, 'tts.py'), ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg', cacheMax = 300, timeoutMs = 30e3 } = {}) {
  let worker = null, ready = null, buf = Buffer.alloc(0), waiting = null, chain = Promise.resolve(), deadUntil = 0;
  const cache = new Map();
  const available = () => fs.existsSync(python) && fs.existsSync(model) && fs.existsSync(script);

  function start() {
    if (ready) return ready;
    if (!available() || Date.now() < deadUntil) return Promise.reject(new Error('voice_unavailable'));
    ready = new Promise((resolve, reject) => {
      const w = spawn(python, [script, model], { stdio: ['pipe', 'pipe', 'pipe'] });
      worker = w; buf = Buffer.alloc(0);
      let up = false;
      const t = setTimeout(() => { if (!up) { reject(new Error('voice_start_timeout')); w.kill(); } }, 60e3);
      w.stderr.on('data', d => { const s = String(d).trim(); if (s) console.error('tts:', s.slice(0, 300)); });
      w.stdout.on('data', d => {
        buf = Buffer.concat([buf, d]);
        if (!up) { const i = buf.indexOf(10); if (i < 0) return; if (buf.subarray(0, i).toString() === 'READY') { up = true; clearTimeout(t); buf = buf.subarray(i + 1); resolve(); } }
        if (waiting && buf.length >= 4) { const n = buf.readUInt32BE(0); if (buf.length >= 4 + n) { const wav = buf.subarray(4, 4 + n); buf = buf.subarray(4 + n); const cb = waiting; waiting = null; cb(null, Buffer.from(wav)); } }
      });
      const gone = why => { if (worker !== w) return; worker = null; ready = null; clearTimeout(t); if (!up) { deadUntil = Date.now() + 60e3; reject(new Error(why)); }
        if (waiting) { const cb = waiting; waiting = null; cb(new Error(why)); } };
      w.on('exit', c => gone('voice_worker_exit_' + c)); w.on('error', e => gone('voice_worker_' + e.code));
    });
    ready.catch(() => {});
    return ready;
  }

  const wavOnce = text => new Promise((resolve, reject) => {
    const t = setTimeout(() => { waiting = null; reject(new Error('voice_timeout')); if (worker) worker.kill(); }, timeoutMs);
    waiting = (err, wav) => { clearTimeout(t); if (err) return reject(err); if (!wav.length) return reject(new Error('voice_failed')); resolve(wav); };
    worker.stdin.write(JSON.stringify({ text }) + '\n');
  });

  const toMp3 = wav => new Promise((resolve, reject) => {
    const f = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'wav', '-i', 'pipe:0', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '48k', '-f', 'mp3', 'pipe:1']);
    const parts = []; f.stdout.on('data', d => parts.push(d)); f.on('error', reject);
    f.on('close', c => (c === 0 && parts.length ? resolve(Buffer.concat(parts)) : reject(new Error('mp3_failed_' + c))));
    f.stdin.on('error', () => {}); f.stdin.end(wav);
  });

  /* text → MP3 bytes; one at a time, cached */
  function say(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 800);
    if (!text) return Promise.reject(new Error('empty'));
    const key = crypto.createHash('sha1').update(text).digest('hex');
    if (cache.has(key)) { const v = cache.get(key); cache.delete(key); cache.set(key, v); return Promise.resolve(v); }
    const job = chain.then(async () => {
      if (cache.has(key)) return cache.get(key);
      await start();
      const mp3 = await toMp3(await wavOnce(text));
      cache.set(key, mp3); while (cache.size > cacheMax) cache.delete(cache.keys().next().value);
      return mp3;
    });
    chain = job.catch(() => {});
    return job;
  }

  /* load the model before the first caller speaks (called when the demo page opens) */
  const warm = greeting => { if (!available()) return; start().then(() => greeting && say(greeting)).catch(() => {}); };
  const stop = () => { if (worker) worker.kill(); };
  return { say, warm, available, stop };
}

/* the voice is only for the receptionist's own words: a sentence must come from what she said on this call */
export function sentences(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t ? t.split(/(?<=[.!?]["')\]]*) (?=\S)/).filter(Boolean) : [];
}

/* the reply cut into pieces to speak one after another: the first can play while the next is being made */
export function chunks(text, min = 40, max = 240) {
  const out = [];
  for (const s of sentences(text)) {
    const last = out[out.length - 1];
    /* the first piece stays short so she starts speaking sooner; later pieces are joined into fuller phrases */
    const short = out.length === 1 ? last.length < 12 : last && last.length < min;
    if (last && (short || s.length < 12) && last.length + s.length + 1 <= max) out[out.length - 1] = last + ' ' + s;
    else out.push(s.slice(0, max * 2));
  }
  return out.slice(0, 8);
}
