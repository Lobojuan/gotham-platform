/* The receptionist demo's ears: what the caller says, turned into text on our own server (Whisper, free).
   One Python worker (stt.py) keeps the model loaded; requests queue one at a time (the server has one CPU).
   The browser sends a short recording (any format it can make); ffmpeg turns it into 16 kHz mono audio for the model. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function makeSTT({ python = process.env.WHISPER_PYTHON || '/opt/whisper-venv/bin/python', model = process.env.WHISPER_MODEL || '/opt/whisper/base',
  script = path.join(HERE, 'stt.py'), ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg', timeoutMs = 40e3, maxSeconds = 20, queueMax = 3 } = {}) {
  let worker = null, ready = null, buf = Buffer.alloc(0), waiting = null, chain = Promise.resolve(), deadUntil = 0, queued = 0;
  const available = () => fs.existsSync(python) && fs.existsSync(path.join(model, 'model.bin')) && fs.existsSync(script);

  function start() {
    if (ready) return ready;
    if (!available() || Date.now() < deadUntil) return Promise.reject(new Error('stt_unavailable'));
    ready = new Promise((resolve, reject) => {
      const w = spawn(python, [script, model], { stdio: ['pipe', 'pipe', 'pipe'] });
      worker = w; buf = Buffer.alloc(0);
      let up = false;
      const t = setTimeout(() => { if (!up) { reject(new Error('stt_start_timeout')); w.kill(); } }, 90e3);
      w.stderr.on('data', d => { const s = String(d).trim(); if (s) console.error('stt:', s.slice(0, 300)); });
      w.stdout.on('data', d => {
        buf = Buffer.concat([buf, d]);
        for (;;) {
          const i = buf.indexOf(10); if (i < 0) return;
          const line = buf.subarray(0, i).toString(); buf = buf.subarray(i + 1);
          if (!up) { if (line === 'READY') { up = true; clearTimeout(t); resolve(); } continue; }
          if (waiting) { const cb = waiting; waiting = null; try { cb(null, JSON.parse(line)); } catch (e) { cb(e); } }
        }
      });
      const gone = why => { if (worker !== w) return; worker = null; ready = null; clearTimeout(t); if (!up) { deadUntil = Date.now() + 60e3; reject(new Error(why)); }
        if (waiting) { const cb = waiting; waiting = null; cb(new Error(why)); } };
      w.on('exit', c => gone('stt_worker_exit_' + c)); w.on('error', e => gone('stt_worker_' + e.code));
    });
    ready.catch(() => {});
    return ready;
  }

  /* any recording → raw 16 kHz mono signed 16-bit audio, at most maxSeconds long */
  const toPcm = audio => new Promise((resolve, reject) => {
    const f = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-t', String(maxSeconds), '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1']);
    const parts = []; f.stdout.on('data', d => parts.push(d)); f.on('error', reject);
    const kill = setTimeout(() => f.kill(), 15e3);
    f.on('close', c => { clearTimeout(kill); const pcm = Buffer.concat(parts); c === 0 && pcm.length ? resolve(pcm) : reject(new Error('audio_unreadable')); });
    f.stdin.on('error', () => {}); f.stdin.end(audio);
  });

  const once = (pcm, lang) => new Promise((resolve, reject) => {
    const t = setTimeout(() => { waiting = null; reject(new Error('stt_timeout')); if (worker) worker.kill(); }, timeoutMs);
    waiting = (err, r) => { clearTimeout(t); err ? reject(err) : resolve(r); };
    worker.stdin.write(JSON.stringify({ lang, n: pcm.length }) + '\n'); worker.stdin.write(pcm);
  });

  /* recording bytes → text ('' when nothing was understood); one at a time, and a short queue so a flood cannot pile up */
  async function listen(audio, lang = 'en') {
    if (!audio || !audio.length) throw new Error('empty');
    if (queued >= queueMax) throw new Error('stt_busy');
    queued++;
    try {
      const pcm = await toPcm(audio);
      if (pcm.length < 16000 * 2 * 0.3) return '';
      const job = chain.then(async () => { await start(); return once(pcm, lang); });
      chain = job.catch(() => {});
      return String((await job).text || '').replace(/\s+/g, ' ').trim();
    } finally { queued--; }
  }

  /* load the model before the first caller speaks (called when the demo page opens) */
  const warm = () => { if (available()) start().catch(() => {}); };
  const stop = () => { if (worker) worker.kill(); };
  return { listen, warm, available, stop };
}
