/* Pictures, videos and PDFs that people upload: when they were taken, and the Gotham logo on them.

   Dates, best source first:
     camera    the photo's own EXIF date (DateTimeOriginal, with its time zone when the phone wrote one)
     video     the video file's creation date (an edited or exported video carries the export date)
     pdf       the PDF's creation date
     whatsapp  the date in a WhatsApp file name: when it was SENT, the real date is usually earlier
     filename  a date in the file name (IMG_20260523_144207, PXL_…, 2026-05-23 14.42.07 …)
     manual    typed in the back office
   WhatsApp, Facebook and most chat apps remove the camera date, so a photo received that way has none.

   Privacy: location (GPS) is never kept. Pictures are re-encoded without metadata, videos with
   -map_metadata -1, and only "had_location: true" is recorded so the team knows the original had it. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import exifReader from 'exif-reader';
import { PDFDocument } from 'pdf-lib';

const here = path.dirname(new URL(import.meta.url).pathname);
export const LOGO_FILE = path.join(here, 'public', 'brand', 'mark-white-256.png');
const LOGO_TILE = path.join(here, 'public', 'brand', 'mark-tile.png');

const okYear = d => d instanceof Date && !isNaN(d) && d.getUTCFullYear() >= 2000 && d <= new Date(Date.now() + 2 * 864e5);

/* ---------- dates ---------- */
export function dateFromName(name) {
  const n = String(name || '');
  const mk = (y, mo, d, h = 12, mi = 0, s = 0) => { const t = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)); return okYear(t) ? t : null; };
  let m = n.match(/WhatsApp (?:Image|Video|Audio)[ _](\d{4})-(\d\d)-(\d\d)[ _]at[ _](\d\d)[.:](\d\d)[.:](\d\d)/i);
  if (m) { const at = mk(...m.slice(1)); if (at) return { at, source: 'whatsapp' }; }
  m = n.match(/(?:IMG|VID|AUD|PTT)-(\d{4})(\d\d)(\d\d)-WA\d+/i);
  if (m) { const at = mk(...m.slice(1)); if (at) return { at, source: 'whatsapp' }; }
  m = n.match(/(?:^|[^\d])(\d{4})(\d\d)(\d\d)[_-](\d\d)(\d\d)(\d\d)/);
  if (m) { const at = mk(...m.slice(1)); if (at) return { at, source: 'filename' }; }
  m = n.match(/(\d{4})-(\d\d)-(\d\d)(?:[ _T]+(?:at[ _])?(\d\d)[.:-](\d\d)(?:[.:-](\d\d))?)?/);
  if (m) { const at = mk(m[1], m[2], m[3], m[4] || 12, m[5] || 0, m[6] || 0); if (at) return { at, source: 'filename' }; }
  return null;
}

const offsetMin = o => { const m = /^([+-])(\d\d):?(\d\d)$/.exec(String(o || '')); return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0; };

/* EXIF from sharp's metadata().exif buffer */
export function imageInfo(meta, name) {
  let e = null;
  try { e = meta && meta.exif ? exifReader(meta.exif) : null; } catch { e = null; }
  const ph = (e && e.Photo) || {}, im = (e && e.Image) || {};
  const camera = [im.Make, im.Model].filter(Boolean).join(' ').trim().slice(0, 80) || null;
  const had_location = !!(e && e.GPSInfo && (e.GPSInfo.GPSLatitude || e.GPSInfo.GPSLongitude));
  for (const [d, off] of [[ph.DateTimeOriginal, ph.OffsetTimeOriginal], [ph.DateTimeDigitized, ph.OffsetTimeDigitized], [im.DateTime, ph.OffsetTime]]) {
    if (okYear(d)) return { at: new Date(d.getTime() - offsetMin(off) * 6e4), source: 'camera', camera, had_location };
  }
  const f = dateFromName(name);
  return { at: f ? f.at : null, source: f ? f.source : null, camera, had_location };
}

export function run(cmd, args, { timeout = 15 * 60e3 } = {}) {
  return new Promise((ok, no) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); no(new Error('timeout')); }, timeout);
    p.stdout.on('data', d => { out += d; if (out.length > 4e6) out = out.slice(-4e6); });
    p.stderr.on('data', d => { err += d; if (err.length > 2e4) err = err.slice(-2e4); });
    p.on('error', e => { clearTimeout(t); no(e); });
    p.on('close', c => { clearTimeout(t); c === 0 ? ok(out) : no(new Error(err.trim().split('\n').slice(-3).join(' ') || 'exit ' + c)); });
  });
}

export async function hasFfmpeg() {
  try { await run('ffmpeg', ['-version'], { timeout: 1e4 }); await run('ffprobe', ['-version'], { timeout: 1e4 }); return true; } catch { return false; }
}

export async function videoInfo(file, name) {
  const j = JSON.parse(await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeout: 6e4 }));
  const v = (j.streams || []).find(s => s.codec_type === 'video');
  if (!v) throw new Error('not_a_video');
  const tags = { ...(j.format && j.format.tags || {}), ...(v.tags || {}) };
  const low = Object.fromEntries(Object.entries(tags).map(([k, x]) => [k.toLowerCase(), x]));
  let rot = Math.abs(+(v.tags && v.tags.rotate) || 0);
  for (const sd of v.side_data_list || []) if (sd.rotation != null) rot = Math.abs(+sd.rotation);
  const swap = rot === 90 || rot === 270;
  const out = {
    w: swap ? v.height : v.width, h: swap ? v.width : v.height,
    duration: Math.round(+(j.format && j.format.duration) || +v.duration || 0),
    had_location: !!(low['location'] || low['com.apple.quicktime.location.iso6709'] || low['location-eng']),
    camera: [low['com.apple.quicktime.make'], low['com.apple.quicktime.model']].filter(Boolean).join(' ') || null,
    has_audio: (j.streams || []).some(s => s.codec_type === 'audio')
  };
  for (const k of ['com.apple.quicktime.creationdate', 'creation_time', 'date']) {
    const d = low[k] ? new Date(low[k]) : null;
    if (okYear(d)) return { ...out, at: d, source: 'video' };
  }
  const f = dateFromName(name);
  return { ...out, at: f ? f.at : null, source: f ? f.source : null };
}

export async function pdfInfo(buf, name) {
  try {
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
    const d = doc.getCreationDate();
    if (okYear(d)) return { at: d, source: 'pdf', pages: doc.getPageCount() };
    const f = dateFromName(name);
    return { at: f ? f.at : null, source: f ? f.source : null, pages: doc.getPageCount() };
  } catch { const f = dateFromName(name); return { at: f ? f.at : null, source: f ? f.source : null }; }
}

/* ---------- the logo ---------- */
/* White logo with a soft shadow, so it reads on light walls and dark stages alike. Same look as the website build. */
const LOGO_CACHE = new Map();
export async function logoFor(width, height) {
  const lw = Math.max(22, Math.round(Math.min(width, height * 1.4) * 0.06));
  const key = lw;
  if (LOGO_CACHE.has(key)) return LOGO_CACHE.get(key);
  const mark = await sharp(LOGO_FILE).resize({ width: lw }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = mark.info, pad = Math.max(2, Math.round(lw * 0.08));
  const px = Buffer.from(mark.data), sh = Buffer.alloc(px.length);
  for (let i = 0; i < px.length; i += 4) { px[i + 3] = Math.round(px[i + 3] * 0.9); sh[i + 3] = Math.round(mark.data[i + 3] * 0.42); }
  const W = w + pad * 2, H = h + pad * 2;
  const shadow = await sharp(sh, { raw: { width: w, height: h, channels: 4 } }).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .blur(Math.max(0.6, lw / 26)).png().toBuffer();
  const markPng = await sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const out = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shadow, left: 1, top: 1 }, { input: markPng, left: pad, top: pad }]).png().toBuffer();
  const res = { buf: out, w: W, h: H, pad };
  LOGO_CACHE.set(key, res);
  return res;
}

/* the composite instruction for sharp: bottom-right corner, inside a small margin */
export async function logoLayer(width, height) {
  const L = await logoFor(width, height);
  const m = Math.max(8, Math.round(Math.min(width, height) * 0.035)) - L.pad;
  return { input: L.buf, left: Math.max(0, width - L.w - m), top: Math.max(0, height - L.h - m) };
}

/* stamp an already-encoded image buffer (keeps its format) */
export async function stampImage(buf) {
  const img = sharp(buf), meta = await img.metadata();
  const layer = await logoLayer(meta.width, meta.height);
  const s = img.composite([layer]);
  if (meta.format === 'webp') return s.webp({ quality: 82 }).toBuffer();
  if (meta.format === 'png') return s.png({ compressionLevel: 9 }).toBuffer();
  return s.jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}

/* ---------- video ---------- */
/* Re-encode to H.264 MP4 (plays on every phone), at most 1920 px on the long side, no metadata (no location),
   the logo in the corner unless the video already has it, and a poster frame. */
export async function processVideo(src, dst, posterJpg, { brand = true, info }) {
  const long = Math.max(info.w, info.h), scale = long > 1920 ? (info.w >= info.h ? 'scale=1920:-2' : 'scale=-2:1920') : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  const W = long > 1920 ? (info.w >= info.h ? 1920 : Math.round(info.w * 1920 / info.h)) : info.w, H = long > 1920 ? (info.w >= info.h ? Math.round(info.h * 1920 / info.w) : 1920) : info.h;
  const lw = Math.max(22, Math.round(Math.min(W, H * 1.4) * 0.06)); const lwe = lw + (lw % 2);
  const m = Math.max(10, Math.round(Math.min(W, H) * 0.035)), sh = Math.max(1, Math.round(lwe / 30));
  const fc = brand
    ? `[0:v]${scale},setsar=1[v];[1]scale=${lwe}:-1,format=rgba,split[a][b];[a]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.42,boxblur=${sh}:1[s];[b]colorchannelmixer=aa=0.9[l];[v][s]overlay=W-w-${m - 1}:H-h-${m - 1}[t];[t][l]overlay=W-w-${m}:H-h-${m}:format=auto,format=yuv420p[o]`
    : `[0:v]${scale},setsar=1,format=yuv420p[o]`;
  const args = ['-v', 'error', '-y', '-i', src];
  if (brand) args.push('-i', LOGO_FILE);
  args.push('-filter_complex', fc, '-map', '[o]', '-map', '0:a?', '-map_metadata', '-1', '-map_chapters', '-1',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-profile:v', 'high', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', dst);
  await run('ffmpeg', args, { timeout: 40 * 60e3 });
  const at = Math.min(2, Math.max(0, (info.duration || 1) / 3));
  await run('ffmpeg', ['-v', 'error', '-y', '-ss', String(at), '-i', dst, '-frames:v', '1', '-q:v', '3', posterJpg], { timeout: 6e4 });
}

/* ---------- PDF ---------- */
/* A small logo in the bottom-right corner of every page. Encrypted or broken PDFs are left as they are. */
export async function stampPdf(buf) {
  const doc = await PDFDocument.load(buf, { updateMetadata: false });
  const png = await doc.embedPng(fs.readFileSync(LOGO_TILE));
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const s = Math.max(18, Math.min(30, Math.min(width, height) * 0.045)), m = Math.max(10, s * 0.55);
    page.drawImage(png, { x: width - s - m, y: m, width: s, height: s, opacity: 0.92 });
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}
