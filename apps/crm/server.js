import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import QR from 'qrcode';
import sharp from 'sharp';
import ExcelJS from 'exceljs';

const PORT = process.env.PORT || 4100;
const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const ORIGINS = (process.env.ALLOW_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (t, p) => pool.query(t, p);
const here = path.dirname(new URL(import.meta.url).pathname);
const MEDIA = process.env.MEDIA_DIR || path.join(here, 'media');
const SITE_DIR = process.env.SITE_DIR || '';        // static website, served at / when set
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://gotham.84-12-73-59.sslip.io').replace(/\/$/, '');
const SITE_URL = (process.env.SITE_URL || process.env.PUBLIC_URL || 'https://gotham.84-12-73-59.sslip.io').replace(/\/$/, '');
fs.mkdirSync(MEDIA, { recursive: true });

/* ---------- image sizes, fixed to the website layout ---------- */
const SIZES = {
  hero:  { w: 1600, h: 900 },   // full-width band on an event page
  card:  { w: 800,  h: 450 },   // event card on the site and register page
  thumb: { w: 400,  h: 225 },   // admin list and small tiles
  og:    { w: 1200, h: 630 }    // WhatsApp / LinkedIn share preview
};
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_DOC_BYTES = 20 * 1024 * 1024;

/* ---------- helpers ---------- */
const json = (res, code, body, extra = {}) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', ...extra });
  res.end(JSON.stringify(body));
};
const b64 = s => Buffer.from(s).toString('base64url');
const unb64 = s => Buffer.from(s, 'base64url').toString();
const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
function makeToken(user) {
  const p = b64(JSON.stringify({ id: user.id, email: user.email, role: user.role, sv: user.sv || 0, exp: Date.now() + 12 * 3600e3 }));
  return p + '.' + sign(p);
}
function readToken(tok) {
  if (!tok || !tok.includes('.')) return null;
  const [p, s] = tok.split('.');
  if (sign(p) !== s) return null;
  try { const d = JSON.parse(unb64(p)); return d.exp > Date.now() ? d : null; } catch { return null; }
}
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(a => a[0]));
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const newSalt = () => crypto.randomBytes(16).toString('hex');
const clean = (s, n = 200) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
const ref = code => 'GC-' + code + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();

function body(req) {
  return new Promise((resolve, reject) => {
    let d = ''; let size = 0;
    req.on('data', c => { size += c.length; if (size > 1e5) { reject(new Error('too_large')); req.destroy(); } d += c; });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { reject(new Error('bad_json')); } });
  });
}
function bodyBig(req, limit) {
  return new Promise((resolve, reject) => {
    const parts = []; let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('too_large')); req.destroy(); return; }
      parts.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); }
      catch { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}
const hits = new Map();
/* One counter per form per IP. A shared counter meant signing in, or
   registering for a forum, used up someone's allowance for another form. */
function rateLimited(ip, max = 20, win = 60e3, bucket = 'default') {
  const key = bucket + ':' + ip;
  const now = Date.now(); const a = (hits.get(key) || []).filter(t => now - t < win);
  a.push(now); hits.set(key, a);
  if (hits.size > 5000) hits.clear();
  return a.length > max;
}
const csvCell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tok = () => crypto.randomBytes(16).toString('base64url');
const qrSvg = async t => { try { return await QR.toString(t, { type: 'svg', margin: 1, width: 220, color: { dark: '#0F1B2D', light: '#ffffff' } }); } catch { return ''; } };
const ticket = () => 'GC' + crypto.randomBytes(4).toString('hex').toUpperCase();
function phoneGH(raw) {                       // normalise Ghanaian numbers to +233...
  let p = String(raw || '').replace(/[^0-9+]/g, '');
  if (!p) return '';
  if (p.startsWith('+')) return p;
  if (p.startsWith('00')) return '+' + p.slice(2);
  if (p.startsWith('233')) return '+' + p;
  if (p.startsWith('0') && p.length >= 9) return '+233' + p.slice(1);
  if (p.length === 9) return '+233' + p;
  return p;
}
/* phoneGH() assumes Ghana: "07700 900123" typed in London would become a
   wrong +233 number. Anyone abroad gives a dial code and a local number. */
function phoneIntl(dial, local) {
  const cc = String(dial || '').trim();
  if (!/^\+\d{1,4}$/.test(cc)) return '';
  let n = String(local || '').replace(/[^0-9+]/g, '');
  if (!n) return '';
  if (n.startsWith('+')) return /^\+\d{8,15}$/.test(n) ? n : '';      // they typed the full number anyway
  if (n.startsWith('00')) { n = '+' + n.slice(2); return /^\+\d{8,15}$/.test(n) ? n : ''; }
  if (n.startsWith(cc.slice(1)) && n.length > 9) n = n.slice(cc.length - 1);  // "44 7700…" typed after +44
  if (cc !== '+39' && n.startsWith('0')) n = n.slice(1);                 // drop the trunk 0, except Italy
  const full = cc + n;
  return /^\+\d{8,15}$/.test(full) ? full : '';
}
const BASE = process.env.PUBLIC_URL || 'https://gotham.84-12-73-59.sslip.io';
const FROM = process.env.MAIL_FROM || 'Gotham Consult <info@gothamconsult.com>';

async function queueMail(to_email, to_name, subject, body, kind, reg_id = null) {
  if (!to_email) return;
  await q('insert into outbox(to_email,to_name,subject,body,kind,reg_id) values ($1,$2,$3,$4,$5,$6)',
    [to_email, to_name, subject, body, kind, reg_id]);
}
async function flushMail(limit = 20) {
  const key = process.env.RESEND_API_KEY;
  const { rows } = await q("select * from outbox where status='queued' order by id limit $1", [limit]);
  if (!rows.length) return { sent: 0, held: 0 };
  if (!key) return { sent: 0, held: rows.length };          // no key yet: leave them for staff to send by hand
  let sent = 0;
  for (const m of rows) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'authorization': 'Bearer ' + key, 'content-type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [m.to_email], subject: m.subject, html: m.body })
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { await q("update outbox set status='sent', sent_at=now(), provider_id=$1 where id=$2", [d.id || null, m.id]); sent++; }
      else await q("update outbox set status='failed', error=$1 where id=$2", [JSON.stringify(d).slice(0, 400), m.id]);
    } catch (e) {
      await q("update outbox set status='failed', error=$1 where id=$2", [String(e).slice(0, 400), m.id]);
    }
  }
  return { sent, held: 0 };
}
/* Every outgoing email must declare its character set, or an em dash
   arrives in someone's inbox as three pieces of rubbish. */
const mailDoc = (title, body) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>${esc(title)}</title></head><body style="margin:0;padding:0;background:#EDEDE8">${body}</body></html>`;

const wrapMail = (title, inner, footer = '') => mailDoc(title, `<div style="font-family:system-ui,-apple-system,'Hanken Grotesk',sans-serif;background:#FAFAF8;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E2E4E7;border-radius:18px;overflow:hidden">
<div style="height:6px;background:repeating-linear-gradient(90deg,#A9761F 0 28px,#0F1B2D 28px 40px,#1F6B4E 40px 64px,#C9A24B 64px 76px)"></div>
<div style="padding:26px">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#A9761F;font-weight:600">Gotham Consult</p>
<h1 style="margin:0 0 14px;font-size:22px;color:#0F1B2D">${title}</h1>
${inner}
<p style="margin-top:22px;font-size:13px;color:#5A6472">Gotham Consult, Accra · in strategic partnership with Carlson Capital Ltd<br>WhatsApp +233 55 041 6627 · info@gothamconsult.com</p>
${footer}
</div></div></div>`);

/* ---------- bootstrap ---------- */
async function init() {
  await q(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  const { rows } = await q('select count(*)::int n from users');
  if (!rows[0].n) {
    const email = (process.env.ADMIN_EMAIL || 'admin@gothamconsult.com').toLowerCase();
    const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
    const salt = newSalt();
    await q('insert into users(email,name,role,pw_hash,pw_salt,must_change) values ($1,$2,$3,$4,$5,true)',
      [email, process.env.ADMIN_NAME || 'Administrator', 'owner', hash(pw, salt), salt]);
    console.log('FIRST ADMIN:', email, 'password:', pw);
  }
  const seed = [
    ['F1', 'event', 'SMEs at the Centre: Inclusive Partnerships under the GIPA Act 2026', 'By invitation · free for SMEs, stakeholders and investors', 'Tang Palace Hotel, Accra', '2026-10-24T14:00:00Z', '2026-10-24T16:00:00Z', 'GHS', 0, null, 120, true, 1],
    ['F2', 'event', 'AI in Your Business: Hands-on Workshop for SME Owners', 'Bring your laptop', 'East Legon, Accra', '2026-11-07T10:00:00Z', '2026-11-07T13:00:00Z', 'GHS', 450, null, 40, false, 2],
    ['F3', 'event', 'Diaspora & Nordic Investor Roundtable', 'Ghana briefing, sector outlook and Q&A', 'Online', '2026-11-21T16:00:00Z', '2026-11-21T17:30:00Z', 'GHS', 0, null, 200, false, 3],
    ['M1', 'membership', 'Member', '20% off forums, monthly clinic, priority grant alerts', null, null, null, 'GHS', 150, '/ month', null, true, 10],
    ['M2', 'membership', 'Business Pro', 'Bookkeeping, E-VAT filing, compliance calendar', null, null, null, 'GHS', 1200, '/ month', null, true, 11],
    ['M3', 'membership', 'Investor Desk', 'Local representation, site visits, monthly report', null, null, null, 'GHS', 11500, '/ month', null, true, 12],
    ['B1', 'briefing', 'Ghana investor briefing', '60-minute call, credited to follow-on work', null, null, null, 'GHS', 2900, null, null, true, 20],
    ['B2', 'briefing', 'Mining regime briefing', 'Royalties, reform status, licences and risks', null, null, null, 'GHS', 8500, null, null, true, 21],
  ];
  // Bank of Ghana: prices may only be shown and charged in cedis. Earlier builds seeded three
  // investor products in USD; move them to GHS (about GHS 11.40 per USD, Sept 2026, rounded).
  for (const [code, usd, ghs] of [['M3', 1000, 11500], ['B1', 250, 2900], ['B2', 750, 8500]])
    await q(`update items set currency='GHS', price=$3 where code=$1 and currency='USD' and price=$2`, [code, usd, ghs]);
  for (const s of seed) {
    await q(`insert into items(code,kind,title,subtitle,venue,starts_at,ends_at,currency,price,per,capacity,published,sort)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) on conflict (code) do nothing`, s);
  }
  await q(`update items set approval=true, audiences=$1 where code='F1' and audiences is null`,
    ['SME / business owner,Investor,Government / institution,Partner or sponsor,Media,Other']);
  for (const [k, v] of [['momo_number', ''], ['momo_name', 'Gotham Consult'], ['whatsapp', '233550416627'], ['pay_link', '']])
    await q('insert into settings(key,value) values ($1,$2) on conflict (key) do nothing', [k, v]);
}

/* ---------- media ---------- */
const MEDIA_MIME = {
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.pdf': 'application/pdf', '.svg': 'image/svg+xml'
};
const mediaId = () => crypto.randomBytes(8).toString('hex');
const safeName = n => clean(n, 90).replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-') || 'file';

/* Resize one uploaded image into every layout size, in WebP and JPEG.
   Cover-crops to the exact aspect ratio so nothing ever breaks the grid. */
async function storeImage(buf, originalName, alt, who) {
  const id = mediaId();
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) throw new Error('not_an_image');
  const variants = {};
  for (const [name, s] of Object.entries(SIZES)) {
    // never upscale past the source; keep the ratio of the target box
    const w = Math.min(s.w, Math.max(320, meta.width));
    const h = Math.round(w * s.h / s.w);
    const base = sharp(buf).rotate().resize(w, h, { fit: 'cover', position: 'attention' });
    const webp = await base.clone().webp({ quality: 82 }).toBuffer();
    const jpg = await base.clone().jpeg({ quality: 84, mozjpeg: true }).toBuffer();
    fs.writeFileSync(path.join(MEDIA, `${id}-${name}.webp`), webp);
    fs.writeFileSync(path.join(MEDIA, `${id}-${name}.jpg`), jpg);
    variants[name] = { w, h, webp: `${id}-${name}.webp`, jpg: `${id}-${name}.jpg`, kb: Math.round(webp.length / 1024) };
  }
  await q(`insert into media(id,kind,original_name,mime,bytes,width,height,variants,alt,uploaded_by)
           values ($1,'image',$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, safeName(originalName), 'image/' + (meta.format || 'jpeg'), buf.length, meta.width, meta.height,
      JSON.stringify(variants), clean(alt, 200), who]);
  return { id, width: meta.width, height: meta.height, variants };
}

/* A logo must never be cropped and must keep its transparent background,
   so it is resized to fit inside a box rather than filling one. */
const LOGO_SIZES = { lg: { w: 480, h: 200 }, sm: { w: 240, h: 100 } };
async function storeLogo(buf, originalName, alt, who) {
  const id = mediaId();
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) throw new Error('not_an_image');
  const variants = {};
  for (const [name, s] of Object.entries(LOGO_SIZES)) {
    const base = sharp(buf).rotate().resize(s.w, s.h, {
      fit: 'inside', withoutEnlargement: false, background: { r: 0, g: 0, b: 0, alpha: 0 } });
    const webp = await base.clone().webp({ quality: 90, alphaQuality: 100 }).toBuffer();
    const png = await base.clone().png({ compressionLevel: 9, palette: true }).toBuffer();
    const m2 = await sharp(webp).metadata();
    fs.writeFileSync(path.join(MEDIA, `${id}-${name}.webp`), webp);
    fs.writeFileSync(path.join(MEDIA, `${id}-${name}.png`), png);
    variants[name] = { w: m2.width, h: m2.height, webp: `${id}-${name}.webp`, jpg: `${id}-${name}.png`, kb: Math.round(webp.length / 1024) };
  }
  await q(`insert into media(id,kind,original_name,mime,bytes,width,height,variants,alt,uploaded_by)
           values ($1,'logo',$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, safeName(originalName), 'image/' + (meta.format || 'png'), buf.length, meta.width, meta.height,
      JSON.stringify(variants), clean(alt, 200), who]);
  return { id, width: meta.width, height: meta.height, variants };
}

async function storeDoc(buf, originalName, label, who) {
  if (buf.slice(0, 5).toString('latin1') !== '%PDF-') throw new Error('not_a_pdf');
  const id = mediaId();
  const file = `${id}.pdf`;
  fs.writeFileSync(path.join(MEDIA, file), buf);
  await q(`insert into media(id,kind,original_name,mime,bytes,variants,alt,uploaded_by)
           values ($1,'doc',$2,'application/pdf',$3,$4,$5,$6)`,
    [id, safeName(originalName), buf.length, JSON.stringify({ file }), clean(label, 200), who]);
  return { id, bytes: buf.length, file };
}

function deleteMediaFiles(row) {
  const v = row.variants || {};
  const files = row.kind === 'doc'
    ? [v.file]
    : Object.values(v).flatMap(x => [x.webp, x.jpg]);
  for (const f of files) { try { fs.unlinkSync(path.join(MEDIA, f)); } catch {} }
}

/* Shape a media row for the public API: absolute URLs, ready for <picture>. */
const mediaPublic = row => {
  if (!row) return null;
  if (row.kind === 'doc') return {
    id: row.id, kind: 'doc', label: row.alt || row.original_name, name: row.original_name,
    kb: Math.round((row.bytes || 0) / 1024), url: `${PUBLIC_URL}/media/${row.variants.file}`
  };
  const out = { id: row.id, kind: row.kind, alt: row.alt || '', sizes: {} };
  for (const [k, v] of Object.entries(row.variants || {}))
    out.sizes[k] = { w: v.w, h: v.h, webp: `${PUBLIC_URL}/media/${v.webp}`, jpg: `${PUBLIC_URL}/media/${v.jpg}` };
  return out;
};

/* ---------- outreach ---------- */
const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';
/* Merge fields. Anything we do not know becomes a sensible neutral word,
   never an empty gap or a visible {{placeholder}} in someone's inbox. */
function merge(text, c) {
  return String(text || '')
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName(c.full_name) || 'there')
    .replace(/\{\{\s*full_name\s*\}\}/gi, c.full_name || 'there')
    .replace(/\{\{\s*company\s*\}\}/gi, c.company || 'your company')
    .replace(/\{\{\s*role\s*\}\}/gi, c.role || '')
    .replace(/\{\{\s*sector\s*\}\}/gi, c.sector || 'your sector')
    .replace(/\{\{\s*city\s*\}\}/gi, c.city || 'Accra');
}
const paras = (t, style) => String(t || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean)
  .map(x => `<p style="${style}">${esc(x).replace(/\n/g, '<br>')}</p>`).join('');

/* A spreadsheet cell can be a string, a number, a date, a formula result or a
   rich-text object. Everything becomes a plain trimmed string. */
function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('').trim();
    if (v.text) return String(v.text).trim();
    if (v.result !== undefined) return cellText(v.result);
    if (v.hyperlink) return String(v.hyperlink).trim();
  }
  return String(v).trim();
}
/* Placeholders people type when they have not found something yet. */
const PLACEHOLDER = /^(to find|tofind|tbd|tba|t\.b\.d\.?|n\/?a|none|unknown|\?+|-+|—+)$/i;
const realValue = t => (PLACEHOLDER.test(String(t || '').trim()) ? '' : String(t || '').trim());

/* Read an uploaded workbook or CSV into { sheets: [{name, columns, rows}] }. */
async function readSheet(buf, filename) {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(filename || '')) {
    const { rows } = parseContacts(buf.toString('utf8'));   // csv path stays as it was
    return { csv: true, rows };
  }
  await wb.xlsx.load(buf);
  const sheets = [];
  for (const ws of wb.worksheets) {
    if (ws.rowCount < 2) continue;
    /* The header is the first row with two or more non-empty cells. */
    let headRow = 1;
    for (let i = 1; i <= Math.min(8, ws.rowCount); i++) {
      const filled = (ws.getRow(i).values || []).slice(1).filter(v => cellText(v)).length;
      if (filled >= 2) { headRow = i; break; }
    }
    const columns = (ws.getRow(headRow).values || []).slice(1).map(v => cellText(v));
    if (columns.filter(Boolean).length < 2) continue;
    const rows = [];
    for (let i = headRow + 1; i <= ws.rowCount; i++) {
      const vals = (ws.getRow(i).values || []).slice(1).map(cellText);
      if (!vals.some(Boolean)) continue;
      rows.push(vals);
    }
    if (rows.length) sheets.push({ name: ws.name, columns, rows });
  }
  return { sheets };
}

/* Guess which spreadsheet column is which CRM field. The user can override
   every one of these in the mapping step. */
const FIELD_HINTS = {
  company:   [/company/i, /organisation/i, /organization/i, /\bfirm\b/i, /institution/i, /business/i, /entity/i],
  full_name: [/ghana (md|ceo)/i, /\bmd\b/i, /\bceo\b/i, /leader/i, /contact name/i, /^name$/i, /person/i, /manager/i],
  role:      [/role/i, /title/i, /position/i],
  email:     [/e-?mail/i],
  phone:     [/phone/i, /telephone/i, /mobile/i, /whatsapp/i, /\btel\b/i],
  website:   [/website/i, /\bweb\b/i, /\burl\b/i, /domain/i],
  sector:    [/sector/i, /industry/i, /mineral/i, /category/i],
  city:      [/city/i, /town/i, /location/i],
  priority:  [/priority/i, /tier/i, /rank/i],
  status:    [/outreach status/i, /^status$/i],
  notes:     [/notes/i, /sensitiv/i, /comment/i, /pitch/i, /next step/i]
};
function guessMapping(columns) {
  const map = {}, taken = new Set(), done = new Set();
  /* Walk the hints one pattern at a time rather than one field at a time, so a
     specific pattern ("Ghana MD") beats a loose one ("CEO") even when the loose
     column comes first. Without this, a list of local managing directors gets
     mapped to the group chief executive in another country. */
  const depth = Math.max(...Object.values(FIELD_HINTS).map(p => p.length));
  for (let round = 0; round < depth; round++) {
    for (const [field, pats] of Object.entries(FIELD_HINTS)) {
      if (done.has(field) || !pats[round]) continue;
      for (let i = 0; i < columns.length; i++) {
        if (taken.has(i) || !columns[i]) continue;
        if (pats[round].test(columns[i])) { map[i] = field; taken.add(i); done.add(field); break; }
      }
    }
  }
  return map;
}
const STATUS_WORDS = {
  'not contacted': 'new', 'new': 'new', 'to contact': 'new',
  'contacted': 'contacted', 'emailed': 'contacted', 'sent': 'contacted',
  'replied': 'replied', 'responded': 'replied',
  'meeting': 'meeting', 'meeting booked': 'meeting', 'call booked': 'meeting',
  'won': 'won', 'signed': 'won', 'closed won': 'won',
  'lost': 'lost', 'declined': 'lost', 'no': 'lost',
  'do not contact': 'do_not_contact', 'dnc': 'do_not_contact', 'opted out': 'do_not_contact'
};

/* Parse a pasted list: CSV, semicolons or tabs, with or without a header row. */
function parseContacts(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], columns: [] };
  const split = l => {
    const out = []; let cur = '', inQ = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (inQ && l[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (!inQ && (ch === ',' || ch === ';' || ch === '\t')) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(x => x.trim().replace(/^"|"$/g, ''));
  };
  const head = split(lines[0]).map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
  const KNOWN = {
    company: ['company','organisation','organization','firm','business','employer'],
    full_name: ['name','fullname','contact','contactname','person'],
    role: ['role','title','position','jobtitle'],
    email: ['email','emailaddress','mail'],
    phone: ['phone','telephone','mobile','tel','whatsapp'],
    sector: ['sector','industry','category'],
    city: ['city','town','location'],
    country: ['country'],
    tags: ['tags','tag','labels'],
    source: ['source','where','origin'],
    notes: ['notes','note','comment','comments']
  };
  const map = {};
  head.forEach((h, i) => {
    for (const [field, names] of Object.entries(KNOWN)) if (names.includes(h)) map[i] = field;
  });
  const hasHeader = Object.keys(map).length >= 2;
  const body = hasHeader ? lines.slice(1) : lines;
  /* No header? Guess by shape: whatever looks like an email is the email. */
  const rows = body.map(l => {
    const cells = split(l);
    const r = {};
    if (hasHeader) cells.forEach((v, i) => { if (map[i] && v) r[map[i]] = v; });
    else {
      cells.forEach(v => {
        if (/^\S+@\S+\.\S+$/.test(v) && !r.email) r.email = v;
        else if (/^[+\d][\d\s()-]{6,}$/.test(v) && !r.phone) r.phone = v;
        else if (!r.company) r.company = v;
        else if (!r.full_name) r.full_name = v;
        else if (!r.role) r.role = v;
      });
    }
    return r;
  }).filter(r => r.email || r.company);
  return { rows, columns: hasHeader ? Object.values(map) : ['guessed'] };
}

/* The four email designs. Plain is deliberately undesigned: for a managing
   director, a message that looks like a newsletter is a message that gets
   deleted. */
function campaignHtml(cam, c, item, links) {
  return mailDoc(merge(cam.subject, c), campaignBody(cam, c, item, links));
}
function campaignBody(cam, c, item, links) {
  const body = merge(cam.intro, c);
  const cta = cam.cta_label ? `<tr><td style="padding:6px 0 4px">
      <a href="${links.cta}" style="display:inline-block;background:#0F1B2D;color:#ffffff;text-decoration:none;
        border-radius:999px;padding:13px 26px;font-weight:600;font-size:15px">${esc(merge(cam.cta_label, c))}</a></td></tr>` : '';
  const foot = `<tr><td style="padding:22px 0 0;border-top:1px solid #E2E4E7;color:#8A93A0;font-size:12px;line-height:1.6">
      Gotham Consult, Accra, in partnership with Carlson Capital Ltd · WhatsApp or call +233 55 239 5548<br>
      You are receiving this because we believe it is relevant to your work${c.source ? ' (' + esc(c.source) + ')' : ''}.
      <a href="${links.unsub}" style="color:#8A93A0">Tell us to stop</a> and we will not write again.</td></tr>`;

  if (cam.template === 'plain') {
    return `<div style="font:16px/1.65 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:560px">
      ${paras(body, 'margin:0 0 14px')}
      ${cam.cta_label ? `<p style="margin:0 0 14px"><a href="${links.cta}" style="color:#0F1B2D">${esc(merge(cam.cta_label, c))}</a></p>` : ''}
      <p style="margin:0 0 4px">${esc(cam.from_name || 'Joy Anthony Preston')}<br>
      <span style="color:#555">Gotham Consult · +233 55 239 5548</span></p>
      <p style="margin:18px 0 0;color:#999;font-size:12px">
        If you would rather not hear from us, <a href="${links.unsub}" style="color:#999">say so here</a>.</p></div>`;
  }

  const when = item && item.starts_at
    ? new Date(item.starts_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  const cover = item && item.cover_url
    ? `<tr><td style="padding:0"><img src="${item.cover_url}" width="600" alt="" style="width:100%;max-width:600px;display:block;border-radius:12px"></td></tr>` : '';
  const facts = item ? `<tr><td style="padding:16px 0 4px">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        ${when ? `<tr><td style="padding:3px 18px 3px 0;color:#8A93A0;font-size:12px;letter-spacing:.1em;text-transform:uppercase">Date</td><td style="font-size:15px;font-weight:600;color:#0F1B2D">${esc(when)}</td></tr>` : ''}
        ${item.venue ? `<tr><td style="padding:3px 18px 3px 0;color:#8A93A0;font-size:12px;letter-spacing:.1em;text-transform:uppercase">Venue</td><td style="font-size:15px;font-weight:600;color:#0F1B2D">${esc(item.venue)}</td></tr>` : ''}
        <tr><td style="padding:3px 18px 3px 0;color:#8A93A0;font-size:12px;letter-spacing:.1em;text-transform:uppercase">Entry</td><td style="font-size:15px;font-weight:600;color:#0F1B2D">${Number(item.price) > 0 ? esc(item.currency + ' ' + Number(item.price).toLocaleString()) : 'By invitation, no charge'}</td></tr>
      </table></td></tr>` : '';

  return `<div style="background:#EDEDE8;padding:26px 14px">
   <table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center"
     style="max-width:600px;margin:0 auto;background:#FAFAF8;border-radius:18px;overflow:hidden;
     font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
    <tr><td style="height:6px;background:#A9761F;font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td style="padding:26px 34px 0">
      <table role="presentation" width="100%"><tr>
        <td style="font-size:15px;font-weight:700;color:#0F1B2D;letter-spacing:.01em">Gotham Consult</td>
        <td align="right" style="font-size:11px;color:#8A93A0">with Carlson Capital Ltd</td>
      </tr></table></td></tr>
    <tr><td style="padding:22px 34px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${cover}
        ${paras(body, 'margin:0 0 14px;color:#3A4453;font-size:15.5px;line-height:1.66') ? `<tr><td style="padding:${item && item.cover_url ? '20px' : '0'} 0 0">${paras(body, 'margin:0 0 14px;color:#3A4453;font-size:15.5px;line-height:1.66')}</td></tr>` : ''}
        ${facts}
        ${cta}
        ${foot}
      </table></td></tr>
    <tr><td style="padding:24px 34px 26px">
      <table role="presentation" width="100%"><tr>
        <td style="height:5px;background:#A9761F;font-size:0">&nbsp;</td>
        <td style="height:5px;background:#0F1B2D;font-size:0">&nbsp;</td>
        <td style="height:5px;background:#1F6B4E;font-size:0">&nbsp;</td>
        <td style="height:5px;background:#C9A24B;font-size:0">&nbsp;</td>
      </tr></table></td></tr>
   </table></div>`;
}

/* Who this campaign would go to, after the suppression rules. */
function segmentSql(cam) {
  const where = [`(c.email is not null and c.email <> '')`,
    `c.unsubscribed_at is null`, `not coalesce(c.bounced,false)`, `c.status <> 'do_not_contact'`];
  const vals = [];
  if (cam.seg_sector) { vals.push(cam.seg_sector); where.push(`lower(c.sector) = lower($${vals.length})`); }
  if (cam.seg_status) { vals.push(cam.seg_status); where.push(`c.status = $${vals.length}`); }
  if (cam.seg_tags) {
    for (const t of String(cam.seg_tags).split(',').map(x => x.trim()).filter(Boolean)) {
      vals.push('%' + t.toLowerCase() + '%');
      where.push(`lower(coalesce(c.tags,'')) like $${vals.length}`);
    }
  }
  return { where: where.join(' and '), vals };
}

/* ---------- queries ---------- */
const ITEM_COLS = `i.code,i.kind,i.title,i.subtitle,i.venue,i.starts_at,i.ends_at,i.currency,i.price,i.per,i.capacity,
    i.approval,i.phase,i.audiences,i.slug,i.summary,i.description,i.cover,i.gallery,i.docs,i.agenda,i.speakers,
    case when i.capacity is null then null else greatest(i.capacity - coalesce((
      select sum(r.seats) from registrations r where r.item_code=i.code and r.status<>'cancelled'),0),0) end as seats_left`;
const itemsPublic = () => q(`select ${ITEM_COLS} from items i where i.published order by i.sort, i.starts_at`);

/* Attach resolved image/doc objects to a list of items in one extra query. */
async function withMedia(rows) {
  const ids = new Set();
  for (const r of rows) {
    if (r.cover) ids.add(r.cover);
    for (const g of (r.gallery || [])) ids.add(typeof g === 'string' ? g : g.id);
    for (const d of (r.docs || [])) ids.add(typeof d === 'string' ? d : d.id);
    for (const sp of (r.speakers || [])) if (sp && sp.media) ids.add(sp.media);
  }
  if (!ids.size) return rows.map(r => ({ ...r, cover_image: null, images: [], documents: [] }));
  const { rows: m } = await q('select * from media where id = any($1)', [[...ids]]);
  const by = Object.fromEntries(m.map(x => [x.id, x]));
  return rows.map(r => ({
    ...r,
    cover_image: mediaPublic(by[r.cover]),
    images: (r.gallery || []).map(g => mediaPublic(by[typeof g === 'string' ? g : g.id])).filter(Boolean),
    documents: (r.docs || []).map(d => {
      const row = by[typeof d === 'string' ? d : d.id]; if (!row) return null;
      const out = mediaPublic(row);
      if (typeof d === 'object' && d.label) out.label = d.label;
      return out;
    }).filter(Boolean),
    speakers: (r.speakers || []).map(sp => ({ ...sp, photo: sp && sp.media ? mediaPublic(by[sp.media]) : null }))
  }));
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const ip = (req.headers['x-real-ip'] || req.socket.remoteAddress || '').toString();
  const origin = req.headers.origin;
  const cors = origin && (ORIGINS.includes(origin) || ORIGINS.includes('*'))
    ? { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'vary': 'Origin' } : {};
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...cors, 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS', 'access-control-allow-headers': 'content-type' });
    return res.end();
  }
  // A signed cookie alone is not enough: every signed-in request is checked against the
  // users table, so removing, disabling or resetting someone takes effect on their next click,
  // and a role change applies at once. Someone still on a first/reset password can only reach
  // /api/me and /api/password until they choose their own.
  let sess = null;
  const auth = () => (sess && !sess.must_change ? sess : null);
  const authAny = () => sess;
  const need = role => { const u = auth(); if (!u) return null; if (role === 'admin' && u.role === 'staff') return null; return u; };

  try {
    const ctok = readToken(cookies(req).gc_session);
    if (ctok && p.startsWith('/api/')) {
      const r = (await q('select id,email,name,role,must_change,coalesce(active,true) as active,sv from users where id=$1', [ctok.id])).rows[0];
      if (r && r.active && (r.sv || 0) === (ctok.sv || 0)) sess = { id: r.id, email: r.email, name: r.name, role: r.role, must_change: !!r.must_change };
    }
    /* ---- public ---- */
    if (p === '/api/health') return json(res, 200, { ok: true });

    if (p === '/api/items' && req.method === 'GET') {
      const { rows } = await itemsPublic();
      const full = await withMedia(rows);
      const s = await q('select key,value from settings');
      return json(res, 200, { items: full, settings: Object.fromEntries(s.rows.map(r => [r.key, r.value])) }, cors);
    }

    /* serve an uploaded image or PDF */
    const mMedia = p.match(/^\/media\/([A-Za-z0-9._-]+)$/);
    if (mMedia && req.method === 'GET') {
      const file = mMedia[1];
      if (file.includes('..')) return json(res, 400, { error: 'bad_path' });
      const full = path.join(MEDIA, file);
      if (!fs.existsSync(full)) return json(res, 404, { error: 'not_found' }, cors);
      const type = MEDIA_MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const buf = fs.readFileSync(full);
      const etag = '"' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) + '"';
      if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
      res.writeHead(200, {
        'content-type': type,
        'content-length': buf.length,
        'cache-control': 'public, max-age=31536000, immutable',
        etag,
        'access-control-allow-origin': '*',
        ...(type === 'application/pdf' ? { 'content-disposition': 'inline' } : {})
      });
      return res.end(buf);
    }


    /* ---- sponsors: who is on the wall ---- */
    if (p === '/api/sponsors' && req.method === 'GET') {
      const { rows } = await q(`select s.*, m.variants, m.alt as logo_alt, m.kind as logo_kind
        from sponsors s left join media m on m.id = s.logo
        where s.published
          and (s.starts_on is null or s.starts_on <= current_date)
          and (s.ends_on   is null or s.ends_on   >= current_date)
        order by case s.tier when 'headline' then 0 when 'partner' then 1 when 'supporting' then 2 else 3 end,
                 s.sort, s.name`);
      const out = rows.map(r => ({
        name: r.name, tier: r.tier, category: r.category, blurb: r.blurb, url: r.url,
        item_code: r.item_code,
        logo: r.variants ? mediaPublic({ id: r.logo, kind: r.logo_kind || 'logo', variants: r.variants, alt: r.logo_alt }) : null
      }));
      return json(res, 200, { sponsors: out }, cors);
    }

    /* ---- someone wants to sponsor us ---- */
    if (p === '/api/sponsor-enquiry' && req.method === 'POST') {
      if (rateLimited(ip, 6, 300e3, 'sponsor')) return json(res, 429, { error: 'too_many' }, cors);
      const b = await body(req);
      const company = clean(b.company, 160), email = clean(b.email, 160).toLowerCase();
      if (!company || !/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { error: 'missing_fields' }, cors);
      const { rows } = await q(`insert into sponsor_leads(company,contact_name,email,phone,tier,item_code,budget,message,utm_source,utm_campaign)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [company, clean(b.contact_name, 120), email, phoneGH(clean(b.phone, 40)),
          ['headline','partner','supporting','listing'].includes(b.tier) ? b.tier : null,
          clean(b.item_code, 12).toUpperCase() || null, clean(b.budget, 60), clean(b.message, 2000),
          clean(b.utm_source, 60), clean(b.utm_campaign, 60)]);
      await queueMail(email, clean(b.contact_name, 120) || company, 'Thank you for your interest in sponsoring',
        wrapMail('We have your details',
          `<p style="color:#5A6472;font-size:15px">Thank you for your interest in partnering with Gotham Consult. We will come back to you within two working days with the pack and the options for ${esc(company)}.</p>
           <p style="color:#5A6472;font-size:15px">If it is urgent, WhatsApp or call +233 55 239 5548.</p>`),
        'sponsor_ack', null);
      await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', ['website', 'sponsor_enquiry', company + ' · ' + (b.tier || 'no tier')]);
      return json(res, 200, { ok: true, id: rows[0].id }, cors);
    }


    /* ---- Family Desk: founding families interest list ----
       Deliberately collects nothing about the parent's health and not even
       their name. Under Act 843 the parent is the data subject; we ask them
       directly, in their own language, when we call. */
    if (p === '/api/family-interest' && req.method === 'POST') {
      if (rateLimited(ip, 5, 600e3, 'family')) return json(res, 429, { error: 'too_many' }, cors);
      const b = await body(req);
      if (clean(b.website, 200)) return json(res, 200, { ok: true }, cors);      // honeypot: pretend success
      const REGIONS = ['Greater Accra','Ashanti','Central','Eastern','Western','Western North','Volta','Oti',
        'Northern','Savannah','North East','Upper East','Upper West','Bono','Bono East','Ahafo'];
      const NEEDS = ['SSNIT pension renewal','NHIS renewal','Ghana Card','Bills and paperwork','Regular visits',
        'Property or land watch','Appointments and hospital visits','A carer or nurse','Will or estate','Not sure yet'];
      const LANGS = ['English','Twi','Fante','Ga','Ewe','Dagbani','Hausa','Nzema','Dagaare','Other'];
      const full_name = clean(b.full_name, 120), email = clean(b.email, 160).toLowerCase();
      const country = clean(b.country, 60);
      const phone = country === 'Ghana' ? phoneGH(clean(b.phone_local, 40)) : phoneIntl(b.dial, b.phone_local);
      const region = REGIONS.includes(b.parent_region) ? b.parent_region : '';
      const needs = (Array.isArray(b.needs) ? b.needs : []).filter(x => NEEDS.includes(x)).slice(0, 10);
      const langs = (Array.isArray(b.languages) ? b.languages : []).filter(x => LANGS.includes(x)).slice(0, 6);
      const errors = [];
      if (!full_name) errors.push('full_name');
      if (!/^\S+@\S+\.\S+$/.test(email)) errors.push('email');
      if (!phone) errors.push('phone');
      if (!country) errors.push('country');
      if (!region) errors.push('parent_region');
      if (!needs.length) errors.push('needs');
      if (b.consent !== true) errors.push('consent');
      if (errors.length) return json(res, 400, { error: 'missing_fields', fields: errors }, cors);

      const extra = {
        'Family Desk': 'founding families interest',
        'Lives in': country,
        'Relationship': clean(b.relationship, 40),
        'Parent town': clean(b.parent_town, 80),
        'Parent region': region,
        'Parent languages': langs.join(', '),
        'Help wanted': needs.join(', '),
        'Heard about us': clean(b.heard, 80),
        'Message': clean(b.message, 600)
      };
      Object.keys(extra).forEach(k => { if (!extra[k]) delete extra[k]; });
      const notes = `Family Desk interest. ${extra['Relationship'] ? extra['Relationship'] + ' of a parent in ' : 'Parent in '}` +
        `${[extra['Parent town'], region].filter(Boolean).join(', ')}. Wants: ${needs.join(', ')}.`;

      const ex = await q('select id, tags from contacts where lower(email)=lower($1)', [email]);
      if (ex.rows.length) {
        const tags = new Set(String(ex.rows[0].tags || '').split(',').map(t => t.trim()).filter(Boolean));
        ['family-desk', 'founding'].forEach(t => tags.add(t));
        await q(`update contacts set full_name=coalesce(nullif($1,''),full_name), phone=coalesce(nullif($2,''),phone),
            country=coalesce(nullif($3,''),country), tags=$4, extra=coalesce(extra,'{}'::jsonb) || $5::jsonb,
            notes=concat_ws(E'\\n', nullif(notes,''), $6::text)
          where id=$7 and unsubscribed_at is null and status <> 'do_not_contact'`,
          [full_name, phone, country, [...tags].join(','), JSON.stringify(extra), notes, ex.rows[0].id]);
      } else {
        await q(`insert into contacts(full_name,email,phone,country,sector,city,tags,source,notes,extra,status)
                 values ($1,$2,$3,$4,'Family Desk',$5,'family-desk,founding',$6,$7,$8::jsonb,'new')`,
          [full_name, email, phone, country, clean(b.parent_town, 80) || region,
            'Website: Family Desk founding families list', notes, JSON.stringify(extra)]);
      }
      await queueMail(email, full_name, 'You are on the Family Desk founding list',
        wrapMail('Thank you, ' + esc(firstName(full_name)),
          `<p style="color:#5A6472;font-size:15px;line-height:1.6">You are on the founding families list for Family Desk. We will call or WhatsApp you within two working days to hear what your family needs.</p>
           <p style="color:#5A6472;font-size:15px;line-height:1.6">Before anything starts, we speak to your ${esc(extra['Relationship'] ? 'parent' : 'family member')} in Ghana directly, in their own language, and nothing happens without their agreement.</p>
           <p style="color:#5A6472;font-size:15px;line-height:1.6">Please do not send medical details by email. We will talk about care needs in person.</p>`),
        'family_ack', null);
      await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)',
        ['website', 'family_interest', `${country} · ${region} · ${needs.join(', ')}`]);
      return json(res, 200, { ok: true }, cors);
    }

    if (p === '/api/register' && req.method === 'POST') {
      if (rateLimited(ip, 10, 60e3, 'register')) return json(res, 429, { error: 'too_many' }, cors);
      const b = await body(req);
      // Only a name and a phone number are required. Many SME owners have no registered
      // company name or no email they check; asking for them lost registrations.
      const full_name = clean(b.full_name), email = clean(b.email).toLowerCase(), phone = phoneGH(clean(b.phone));
      const company = clean(b.company) || 'Not given';
      const fields = [];
      if (!full_name) fields.push('full_name');
      if (!phone || phone.replace(/\D/g, '').length < 9) fields.push('phone');
      if (email && !/^\S+@\S+\.\S+$/.test(email)) fields.push('email');
      if (fields.length) return json(res, 400, { error: 'missing_fields', fields }, cors);
      if (b.consent !== true) return json(res, 400, { error: 'consent_required' }, cors);
      const it = (await q('select * from items where code=$1 and published', [clean(b.item_code, 12)])).rows[0];
      if (!it) return json(res, 400, { error: 'unknown_item' }, cors);
      if (it.phase === 'past') return json(res, 409, { error: 'closed' }, cors);
      const categoryIn = clean(b.category, 60);
      // An unrecognised or missing "attending as" no longer blocks anyone; staff see it blank and ask.
      const category = it.audiences && !it.audiences.split(',').map(x => x.trim()).includes(categoryIn) ? '' : categoryIn;
      let seats = it.kind === 'event' ? Math.max(1, Math.min(10, parseInt(b.seats) || 1)) : 1;
      const left = it.capacity === null ? null : (await itemsPublic()).rows.find(r => r.code === it.code)?.seats_left;
      if (left !== null && left !== undefined && left < seats) return json(res, 409, { error: 'sold_out' }, cors);
      const amount = Number(it.price) * seats;
      const method = amount === 0 ? 'free' : (['momo', 'invoice', 'online'].includes(b.payment_method) ? b.payment_method : 'momo');
      const r = ref(it.code);
      const status = it.approval ? 'pending' : (amount === 0 ? 'confirmed' : 'new');
      const { rows } = await q(`insert into registrations
        (reference,item_code,company,reg_no,full_name,job_title,email,phone,country,sector,seats,guests,currency,amount,
         payment_method,paid,status,consent_at,marketing_opt_in,ip,category,utm_source,utm_campaign,
         confirm_token,unsub_token,ticket_code)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now(),$18,$19,$20,$21,$22,$23,$24,$25)
        returning id,reference,ticket_code,confirm_token,unsub_token`,
        [r, it.code, company, clean(b.reg_no, 60), full_name, clean(b.job_title, 80), email || null, phone, clean(b.country, 60),
          clean(b.sector, 60), seats, clean(Array.isArray(b.guests) ? b.guests.join('\n') : b.guests, 1000), it.currency, amount,
          method, amount === 0, status, b.marketing_opt_in === true, ip, category, clean(b.utm_source, 60), clean(b.utm_campaign, 60),
          tok(), tok(), ticket()]);
      const reg = rows[0];
      await q('insert into activity(reg_id,actor,action,detail) values ($1,$2,$3,$4)', [reg.id, 'website', 'registered', it.title]);

      /* The SMEs at the Centre questions. Optional here on purpose: older copies
         of the form, still out in WhatsApp groups, don't send them. */
      const SIZES = ['Just me', '2–5', '6–20', '21–50', '50+'];
      const HEARD = ['WhatsApp', 'Social media', 'Friend or colleague', 'Gotham Consult directly', 'Church or association', 'Other'];
      const follow = ['yes', 'maybe', 'no'].includes(b.follow_up) ? b.follow_up : null;
      const about = clean(b.company_about, 160), challenge = clean(b.challenge, 500);
      await q(`update registrations set company_about=$1, company_size=$2, challenge=$3, heard_via=$4, follow_up=$5 where id=$6`,
        [about || null, SIZES.includes(b.company_size) ? b.company_size : null, challenge || null,
          HEARD.includes(b.heard_via) ? b.heard_via : null, follow, reg.id]);

      /* "Yes" or "Maybe" is an explicit ask to hear from us, so the person goes
         straight onto the follow-up list in Outreach with their challenge
         attached. That list is where the money is the week after the forum. */
      if (follow === 'yes' || follow === 'maybe') {
        const note = `${it.title}: said ${follow} to hearing about our services.` + (challenge ? ` Biggest challenge: ${challenge}` : '');
        const tagFor = 'forum-lead,forum-' + follow;
        const ex = email ? await q('select id, tags from contacts where lower(email)=lower($1)', [email])
                          : await q('select id, tags from contacts where phone=$1 and email is null', [phone]);
        if (ex.rows.length) {
          const tags = new Set(String(ex.rows[0].tags || '').split(',').map(t => t.trim()).filter(Boolean));
          tagFor.split(',').forEach(t => tags.add(t));
          await q(`update contacts set tags=$1, notes=concat_ws(E'\\n', nullif(notes,''), $2::text),
              company=coalesce(nullif(company,''),$3), phone=coalesce(nullif(phone,''),$4)
            where id=$5 and unsubscribed_at is null and status <> 'do_not_contact'`, [[...tags].join(','), note, company, phone, ex.rows[0].id]);
        } else {
          await q(`insert into contacts(company,full_name,role,email,phone,sector,country,tags,source,notes,priority,extra,status)
                   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,'new')`,
            [company, full_name, clean(b.job_title, 80), email || null, phone, clean(b.sector, 60), clean(b.country, 60) || 'Ghana',
              tagFor, 'Forum registration: ' + it.code, note, follow === 'yes' ? 'Forum: yes' : 'Forum: maybe',
              JSON.stringify(Object.fromEntries(Object.entries({
                'What they do': about, 'Company size': b.company_size, 'Biggest challenge': challenge,
                'Heard via': b.heard_via, 'Registered for': it.title }).filter(([, v]) => v)))]);
        }
      }

      const confirmUrl = BASE + '/confirm/' + reg.confirm_token;
      const unsubUrl = BASE + '/unsubscribe/' + reg.unsub_token;
      const unsubFoot = `<p style="margin-top:14px;font-size:12px;color:#8A93A0">You are receiving this because you signed up at gothamconsult.com. <a href="${unsubUrl}" style="color:#5A6472">Unsubscribe</a>.</p>`;

      if (it.code === 'BRIEF') {
        await queueMail(email, full_name, 'Confirm your Ghana Business Brief',
          wrapMail('One click and you are on the list',
            `<p style="color:#5A6472;font-size:15px">Hello ${esc(full_name.split(' ')[0])}, please confirm this address so we can send you the brief.</p>
             <p style="margin:18px 0"><a href="${confirmUrl}" style="background:#0F1B2D;color:#fff;text-decoration:none;border-radius:999px;padding:12px 22px;display:inline-block;font-weight:600">Confirm my email</a></p>
             <p style="color:#5A6472;font-size:13px">If you did not ask for this, ignore this message and nothing further is sent.</p>`, unsubFoot),
          'brief_confirm', reg.id);
      } else if (it.approval) {
        await queueMail(email, full_name, 'We have your application · ' + it.title,
          wrapMail('Application received',
            `<p style="color:#5A6472;font-size:15px">Thank you, ${esc(full_name.split(' ')[0])}. We review every application so the room stays the right mix of SMEs, stakeholders and investors.</p>
             <p style="color:#5A6472;font-size:15px"><b style="color:#0F1B2D">${esc(it.title)}</b><br>${it.starts_at ? new Date(it.starts_at).toUTCString().slice(0, 16) : ''} ${esc(it.venue || '')}</p>
             <p style="color:#5A6472;font-size:15px">Your reference is <b style="color:#0F1B2D">${reg.reference}</b>. We come back to you on WhatsApp or by email, usually the same day.</p>`),
          'application_received', reg.id);
      } else {
        const paidNow = amount === 0;
        await queueMail(email, full_name, (paidNow ? 'Your place is confirmed · ' : 'We have your registration · ') + it.title,
          wrapMail(paidNow ? 'Your place is confirmed' : 'Registration received',
            `<p style="color:#5A6472;font-size:15px">Thank you, ${esc(full_name.split(' ')[0])}.</p>
             <p style="color:#5A6472;font-size:15px"><b style="color:#0F1B2D">${esc(it.title)}</b><br>${it.starts_at ? new Date(it.starts_at).toUTCString().slice(0, 16) : ''} ${esc(it.venue || '')}</p>
             <p style="color:#5A6472;font-size:15px">Reference <b style="color:#0F1B2D">${reg.reference}</b>${paidNow ? '' : ` · amount ${it.currency} ${amount}`}.</p>
             ${paidNow ? `<p style="margin:18px 0"><a href="${BASE}/ticket/${reg.ticket_code}" style="background:#0F1B2D;color:#fff;text-decoration:none;border-radius:999px;padding:12px 22px;display:inline-block;font-weight:600">Open your ticket</a></p>` :
               `<p style="color:#5A6472;font-size:15px">Your place is held for 24 hours while payment is confirmed.</p>`}`),
          paidNow ? 'ticket' : 'registration_received', reg.id);
      }
      flushMail().catch(() => {});
      return json(res, 200, { reference: reg.reference, amount, currency: it.currency, paid: amount === 0,
        status, approval: !!it.approval, double_optin: it.code === 'BRIEF' }, cors);
    }

    if (p === '/api/payment-reported' && req.method === 'POST') {
      if (rateLimited(ip, 10)) return json(res, 429, { error: 'too_many' }, cors);
      const b = await body(req);
      const r = (await q('select id from registrations where reference=$1', [clean(b.reference, 40).toUpperCase()])).rows[0];
      if (!r) return json(res, 404, { error: 'unknown_reference' }, cors);
      await q('update registrations set payment_ref=$1, payment_note=$2, updated_at=now() where id=$3',
        [clean(b.txn, 60), clean(b.network, 40) + ' ' + clean(b.phone, 40), r.id]);
      await q('insert into activity(reg_id,actor,action,detail) values ($1,$2,$3,$4)', [r.id, 'customer', 'payment_reported', clean(b.txn, 60)]);
      return json(res, 200, { ok: true }, cors);
    }

    /* ---- confirm / unsubscribe / ticket (public) ---- */
    const pageShell = (title, inner) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Gotham Consult</title>
<style>:root{color-scheme:light}body{margin:0;background:#FAFAF8;color:#0F1B2D;font:16.5px/1.6 system-ui,-apple-system,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px}
.c{background:#fff;border:1px solid #E2E4E7;border-radius:20px;padding:30px;max-width:460px;width:100%;text-align:center;box-shadow:0 18px 50px rgba(15,27,45,.08)}
.k{height:6px;border-radius:99px;background:repeating-linear-gradient(90deg,#A9761F 0 28px,#0F1B2D 28px 40px,#1F6B4E 40px 64px,#C9A24B 64px 76px);margin-bottom:20px}
h1{font-size:23px;margin:0 0 10px}p{color:#5A6472;margin:0 0 8px}code{background:#F2F2EE;border-radius:6px;padding:2px 8px}
a.btn{display:inline-block;margin-top:16px;background:#0F1B2D;color:#fff;text-decoration:none;border-radius:999px;padding:12px 22px;font-weight:600}
.qr{margin:18px auto 6px;width:220px;height:220px}.mut{font-size:13px;color:#8A93A0}</style></head>
<body><div class="c"><div class="k"></div>${inner}</div></body></html>`;
    const sendHtml = html => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); };

    const mConf = p.match(/^\/confirm\/([A-Za-z0-9_-]{10,})$/);
    if (mConf) {
      const { rows } = await q("update registrations set confirmed_email=true, status=case when status='new' then 'confirmed' else status end where confirm_token=$1 returning id, full_name", [mConf[1]]);
      if (!rows[0]) return sendHtml(pageShell('Link not recognised', '<h1>That link is no longer valid</h1><p>It may already have been used. Write to info@gothamconsult.com and we will sort it out.</p>'));
      await q('insert into activity(reg_id,actor,action) values ($1,$2,$3)', [rows[0].id, 'customer', 'email_confirmed']);
      return sendHtml(pageShell('Confirmed', `<h1>You are on the list</h1><p>Thank you, ${esc(String(rows[0].full_name).split(' ')[0])}. The Ghana Business Brief reaches you on the next send.</p><a class="btn" href="https://gotham-consult-gh.netlify.app">Back to the website</a>`));
    }

    const mUnsub = p.match(/^\/unsubscribe\/([A-Za-z0-9_-]{10,})$/);
    if (mUnsub) {
      const { rows } = await q('update registrations set marketing_opt_in=false, unsubscribed_at=now() where unsub_token=$1 returning id', [mUnsub[1]]);
      if (rows[0]) await q('insert into activity(reg_id,actor,action) values ($1,$2,$3)', [rows[0].id, 'customer', 'unsubscribed']);
      return sendHtml(pageShell('Unsubscribed', '<h1>Done, you are unsubscribed</h1><p>You will not receive the brief again. Registrations and tickets you already hold are unaffected.</p>'));
    }

    const mTicket = p.match(/^\/ticket\/([A-Za-z0-9]{6,20})$/);
    if (mTicket) {
      const { rows } = await q(`select r.*, i.title, i.venue, i.starts_at from registrations r join items i on i.code=r.item_code where r.ticket_code=$1`, [mTicket[1].toUpperCase()]);
      const t = rows[0];
      if (!t) return sendHtml(pageShell('Ticket not found', '<h1>We cannot find that ticket</h1><p>Check the link, or write to info@gothamconsult.com.</p>'));
      const ok = ['confirmed', 'attended'].includes(t.status);
      const qr = await qrSvg(BASE + '/ticket/' + t.ticket_code);
      return sendHtml(pageShell('Your ticket', `<h1>${esc(t.title)}</h1>
        <p>${t.starts_at ? new Date(t.starts_at).toUTCString().slice(0, 16) : ''} ${esc(t.venue || '')}</p>
        <div class="qr">${qr}</div>
        <p><b>${esc(t.full_name)}</b><br>${esc(t.company)}</p>
        <p>Ticket <code>${esc(t.ticket_code)}</code> · reference <code>${esc(t.reference)}</code></p>
        <p class="mut">${ok ? (t.checked_in_at ? 'Checked in' : 'Confirmed — show this at the door') : 'Not yet confirmed. We confirm once your application or payment is approved.'}</p>`));
    }

    /* ---- auth ---- */
    if (p === '/api/login' && req.method === 'POST') {
      if (rateLimited(ip, 8, 300e3, 'login')) return json(res, 429, { error: 'too_many' });
      const b = await body(req);
      const u = (await q('select * from users where email=$1 and coalesce(active,true)', [clean(b.email).toLowerCase()])).rows[0];
      const ok = u && crypto.timingSafeEqual(Buffer.from(hash(String(b.password || ''), u.pw_salt)), Buffer.from(u.pw_hash));
      if (!ok) return json(res, 401, { error: 'bad_login' });
      await q('update users set last_login=now() where id=$1', [u.id]);
      return json(res, 200, { name: u.name, email: u.email, role: u.role, must_change: u.must_change },
        { 'set-cookie': `gc_session=${makeToken(u)}; HttpOnly; Path=/; Max-Age=43200; SameSite=Lax; Secure` });
    }
    if (p === '/api/logout') return json(res, 200, { ok: true }, { 'set-cookie': 'gc_session=; Path=/; Max-Age=0' });
    if (p === '/api/me') { const u = authAny(); return u ? json(res, 200, u) : json(res, 401, { error: 'no_session' }); }

    if (p === '/api/password' && req.method === 'POST') {
      const u = authAny(); if (!u) return json(res, 401, { error: 'no_session' });
      if (rateLimited(ip, 6, 300e3, 'password')) return json(res, 429, { error: 'too_many' });
      const b = await body(req);
      const row = (await q('select * from users where id=$1', [u.id])).rows[0];
      const cur = String(b.current || '');
      const okCur = row && crypto.timingSafeEqual(Buffer.from(hash(cur, row.pw_salt)), Buffer.from(row.pw_hash));
      if (!okCur) return json(res, 400, { error: 'wrong_current' });
      const pw = String(b.password || '');
      if (pw.length < 10) return json(res, 400, { error: 'too_short' });
      if (pw.length > 200) return json(res, 400, { error: 'too_long' });
      if (pw === cur) return json(res, 400, { error: 'same_as_old' });
      if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|password\d*|qwertyuiop)$/i.test(pw)) return json(res, 400, { error: 'too_weak' });
      const salt = newSalt();
      const up = (await q('update users set pw_hash=$1, pw_salt=$2, must_change=false, pw_changed_at=now(), sv=coalesce(sv,0)+1 where id=$3 returning *',
        [hash(pw, salt), salt, u.id])).rows[0];
      await q('insert into jobs_log(job,detail) values ($1,$2)', ['password_changed', up.email + ' changed their own password']);
      // other devices are signed out; this one gets a fresh cookie
      return json(res, 200, { ok: true, name: up.name, email: up.email, role: up.role, must_change: false },
        { 'set-cookie': `gc_session=${makeToken(up)}; HttpOnly; Path=/; Max-Age=43200; SameSite=Lax; Secure` });
    }

    /* ---- admin data ---- */
    if (p === '/api/registrations' && req.method === 'GET') {
      if (!auth()) return json(res, 401, { error: 'no_session' });
      const u = auth();
      const { rows } = await q(`select r.*, i.title as item_title, i.kind from registrations r
        join items i on i.code=r.item_code order by r.created_at desc limit 1000`);
      if (u.role === 'staff') for (const r of rows) {       // door staff do not need contact details
        r.email = r.email ? r.email.replace(/^(.).*(@.*)$/, '$1•••$2') : '';
        r.phone = r.phone ? r.phone.slice(0, 5) + '•••' + r.phone.slice(-2) : '';
      }
      return json(res, 200, { rows });
    }
    if (p === '/api/stats' && req.method === 'GET') {
      if (!auth()) return json(res, 401, { error: 'no_session' });
      const paid = await q(`select currency, sum(amount)::float total, count(*)::int n from registrations
        where paid and status<>'cancelled' group by currency`);
      const due = await q(`select currency, sum(amount)::float total, count(*)::int n from registrations
        where not paid and amount>0 and status<>'cancelled' group by currency`);
      const ev = await q(`select i.code,i.title,i.capacity,i.currency,
          coalesce(sum(r.seats) filter (where r.status<>'cancelled'),0)::int seats,
          coalesce(sum(r.seats) filter (where r.paid and r.status<>'cancelled'),0)::int seats_paid,
          coalesce(count(r.id) filter (where r.checked_in_at is not null),0)::int checked_in
        from items i left join registrations r on r.item_code=i.code where i.kind='event' group by i.id order by i.sort`);
      const week = await q(`select count(*)::int n from registrations where created_at > now() - interval '7 days'`);
      const cats = await q(`select coalesce(category,'Not stated') category, count(*)::int n from registrations
        where status not in ('cancelled','declined') group by 1 order by 2 desc`);
      const src = await q(`select coalesce(nullif(utm_source,''),'direct') source, count(*)::int n from registrations
        where status not in ('cancelled','declined') group by 1 order by 2 desc`);
      return json(res, 200, { paid: paid.rows, due: due.rows, events: ev.rows, week: week.rows[0].n,
        categories: cats.rows, sources: src.rows });
    }
    const mReg = p.match(/^\/api\/registrations\/(\d+)$/);
    if (mReg && req.method === 'PATCH') {
      const u = auth(); if (!u) return json(res, 401, { error: 'no_session' });
      const b = await body(req); const id = +mReg[1]; const sets = []; const vals = []; const log = [];
      if (typeof b.paid === 'boolean') {
        sets.push(`paid=$${vals.push(b.paid)}`, `paid_at=${b.paid ? 'now()' : 'null'}`, `paid_by=$${vals.push(b.paid ? u.email : null)}`);
        if (b.paid) sets.push(`status=case when status='new' then 'confirmed' else status end`);
        log.push(b.paid ? 'marked_paid' : 'marked_unpaid');
      }
      if (b.status) { sets.push(`status=$${vals.push(clean(b.status, 20))}`); log.push('status:' + b.status); }
      if (typeof b.notes === 'string') { sets.push(`notes=$${vals.push(clean(b.notes, 2000))}`); log.push('note'); }
      if (typeof b.payment_ref === 'string') { sets.push(`payment_ref=$${vals.push(clean(b.payment_ref, 60))}`); log.push('payment_ref'); }
      if (b.check_in === true) { sets.push(`checked_in_at=now()`, `status='attended'`); log.push('checked_in'); }
      if (!sets.length) return json(res, 400, { error: 'nothing_to_update' });
      sets.push('updated_at=now()');
      await q(`update registrations set ${sets.join(',')} where id=$${vals.push(id)}`, vals);
      await q('insert into activity(reg_id,actor,action,detail) values ($1,$2,$3,$4)', [id, u.email, 'update', log.join(', ')]);
      const { rows } = await q('select * from registrations where id=$1', [id]);
      return json(res, 200, rows[0]);
    }
    const mAppr = p.match(/^\/api\/registrations\/(\d+)\/(approve|decline)$/);
    if (mAppr && req.method === 'POST') {
      const u = auth(); if (!u) return json(res, 401, { error: 'no_session' });
      const id = +mAppr[1]; const ok = mAppr[2] === 'approve';
      const code = ok ? 'INV-' + crypto.randomBytes(3).toString('hex').toUpperCase() : null;
      const reg = (await q('select amount from registrations where id=$1', [id])).rows[0];
      if (!reg) return json(res, 404, { error: 'not_found' });
      await q(`update registrations set status=$1, invite_code=coalesce(invite_code,$2), updated_at=now() where id=$3`,
        [ok ? (Number(reg.amount) === 0 ? 'confirmed' : 'new') : 'declined', code, id]);
      await q('insert into activity(reg_id,actor,action,detail) values ($1,$2,$3,$4)', [id, u.email, ok ? 'approved' : 'declined', code || '']);
      const { rows } = await q('select * from registrations where id=$1', [id]);
      return json(res, 200, rows[0]);
    }

    /* ---- short links ---- */

    /* tracked click from a campaign email */
    const mClick = p.match(/^\/c\/([A-Za-z0-9_-]{10,})$/);
    if (mClick && req.method === 'GET') {
      const { rows } = await q(`update campaign_sends set clicked_at=coalesce(clicked_at,now())
        where token=$1 returning campaign_id`, [mClick[1]]);
      let to = SITE_URL;
      if (rows[0]) {
        const c = (await q('select cta_url from campaigns where id=$1', [rows[0].campaign_id])).rows[0];
        if (c && c.cta_url) to = c.cta_url;
      }
      res.writeHead(302, { location: to });
      return res.end();
    }

    /* one click and we never write to them again */
    const mUnsub2 = p.match(/^\/u\/([A-Za-z0-9_-]{10,})$/);
    if (mUnsub2 && req.method === 'GET') {
      const { rows } = await q(`update contacts set unsubscribed_at=now(), status='do_not_contact'
        where id = (select contact_id from campaign_sends where token=$1) returning company, full_name`, [mUnsub2[1]]);
      return sendHtml(pageShell('Removed', rows[0]
        ? `<h1>Done, we will not write again</h1><p>${esc(rows[0].company || rows[0].full_name || 'You')} has been removed from our list. Nothing further will be sent.</p>`
        : '<h1>That link is no longer valid</h1><p>Write to info@gothamconsult.com and we will remove you by hand.</p>'));
    }

    const mShort = p.match(/^\/s\/([A-Za-z0-9_-]{1,40})$/);
    if (mShort && req.method === 'GET') {
      const { rows } = await q('select * from shortlinks where lower(slug)=lower($1)', [mShort[1]]);
      if (!rows[0]) return json(res, 404, { error: 'unknown_link' });
      await q('update shortlinks set clicks=clicks+1 where slug=$1', [rows[0].slug]);
      const sep = rows[0].target.includes('?') ? '&' : '?';
      const extra = [rows[0].utm_source && 'utm_source=' + encodeURIComponent(rows[0].utm_source),
        rows[0].utm_campaign && 'utm_campaign=' + encodeURIComponent(rows[0].utm_campaign)].filter(Boolean).join('&');
      res.writeHead(302, { location: rows[0].target + (extra ? sep + extra : '') });
      return res.end();
    }

    /* ---- QR codes ---- */
    /* Raw QR image for any URL. Admin only, so nobody can use us as a free QR farm. */
    if (p === '/api/qr' && req.method === 'GET') {
      if (!auth()) return json(res, 401, { error: 'no_session' });
      const target = url.searchParams.get('data') || '';
      if (!/^(https?:\/\/|mailto:|tel:)/.test(target)) return json(res, 400, { error: 'bad_target' });
      const fmt = url.searchParams.get('fmt') === 'png' ? 'png' : 'svg';
      const size = Math.min(2000, Math.max(200, parseInt(url.searchParams.get('size')) || 1200));
      const opts = { margin: 2, width: size, errorCorrectionLevel: 'M', color: { dark: '#0F1B2D', light: '#FFFFFF' } };
      const dl = url.searchParams.get('download') === '1';
      const name = (url.searchParams.get('name') || 'gotham-qr').replace(/[^\w-]/g, '') || 'gotham-qr';
      if (fmt === 'png') {
        const buf = await QR.toBuffer(target, { ...opts, type: 'png' });
        res.writeHead(200, { 'content-type': 'image/png', 'content-length': buf.length,
          ...(dl ? { 'content-disposition': `attachment; filename="${name}.png"` } : {}) });
        return res.end(buf);
      }
      const svg = await QR.toString(target, { ...opts, type: 'svg' });
      res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8',
        ...(dl ? { 'content-disposition': `attachment; filename="${name}.svg"` } : {}) });
      return res.end(svg);
    }

    /* Create a tracked scan code: a shortlink plus the QR that points at it,
       so every poster, flyer or banner reports its own scans. */
    if (p === '/api/qr' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const b = await body(req);
      let target = clean(b.target, 400);
      const itemCode = clean(b.item_code, 12).toUpperCase();
      if (b.kind === 'register' && itemCode) {
        const it = (await q('select code from items where code=$1', [itemCode])).rows[0];
        if (!it) return json(res, 400, { error: 'unknown_item' });
        target = `${SITE_URL}/register.html?e=${encodeURIComponent(itemCode)}`;
      } else if (b.kind === 'whatsapp') {
        const num = String(b.whatsapp || '').replace(/[^\d]/g, '');
        if (num.length < 9) return json(res, 400, { error: 'bad_number' });
        target = `https://wa.me/${num}` + (b.message ? '?text=' + encodeURIComponent(clean(b.message, 300)) : '');
      } else if (b.kind === 'site') {
        target = SITE_URL + (b.path ? clean(b.path, 80) : '');
      }
      if (!/^https?:\/\//.test(target)) return json(res, 400, { error: 'bad_target' });
      const base = (clean(b.slug, 40) || clean(b.label, 40) || 'scan').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scan';
      let slug = base, n = 1;
      while ((await q('select 1 from shortlinks where lower(slug)=lower($1)', [slug])).rows.length) slug = base + '-' + (++n);
      await q(`insert into shortlinks(slug,target,label,utm_source,utm_campaign,kind,item_code)
               values ($1,$2,$3,$4,$5,$6,$7)`,
        [slug, target, clean(b.label, 80) || slug, clean(b.utm_source, 60) || 'qr', clean(b.utm_campaign, 60) || (itemCode || 'general').toLowerCase(),
          clean(b.kind, 20) || 'link', itemCode || null]);
      await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, 'qr_create', slug + ' → ' + target]);
      return json(res, 200, { ok: true, slug, target, short: `${PUBLIC_URL}/s/${slug}` });
    }

    /* Print-ready poster. Open in a browser, Cmd+P, save as PDF. */
    const mPoster = p.match(/^\/poster\/([A-Za-z0-9_-]{1,40})$/);
    if (mPoster && req.method === 'GET') {
      const { rows } = await q('select * from shortlinks where lower(slug)=lower($1)', [mPoster[1]]);
      if (!rows[0]) return json(res, 404, { error: 'unknown_link' });
      const link = rows[0];
      const short = `${PUBLIC_URL}/s/${link.slug}`;
      const qr = await QR.toString(short, { type: 'svg', margin: 1, width: 620, errorCorrectionLevel: 'M', color: { dark: '#0F1B2D', light: '#FFFFFF' } });
      let ev = null;
      if (link.item_code) ev = (await q('select * from items where code=$1', [link.item_code])).rows[0] || null;
      const size = url.searchParams.get('size') === 'a5' ? 'A5' : 'A4';
      const when = ev && ev.starts_at
        ? new Date(ev.starts_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
        : '';
      const headline = ev ? ev.title : (link.label || 'Gotham Consult');
      const sub = ev ? (ev.subtitle || ev.summary || '') : '';
      const price = ev ? (Number(ev.price) > 0 ? `${ev.currency} ${Number(ev.price).toLocaleString()}` : 'Free to attend') : '';
      return sendHtml(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Poster · ${esc(headline)}</title>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Newsreader:ital@1&display=swap" rel="stylesheet">
<style>
@page{size:${size} portrait;margin:0}
*{box-sizing:border-box}
body{margin:0;background:#EDEDE8;font-family:'Hanken Grotesk',system-ui,sans-serif;color:#0F1B2D;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{width:210mm;min-height:297mm;margin:16px auto;background:#FAFAF8;padding:22mm 20mm;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(15,27,45,.16)}
.kente{height:9px;border-radius:99px;background:repeating-linear-gradient(90deg,#A9761F 0 34px,#0F1B2D 34px 48px,#1F6B4E 48px 78px,#C9A24B 78px 92px)}
.brand{display:flex;justify-content:space-between;align-items:baseline;margin:14px 0 0;font-size:13pt;font-weight:600;letter-spacing:.02em}
.brand span{color:#5A6472;font-weight:500;font-size:10pt}
.eyebrow{margin:16mm 0 4mm;font-size:10pt;letter-spacing:.16em;text-transform:uppercase;color:#A9761F;font-weight:600}
h1{font-size:34pt;line-height:1.04;margin:0 0 5mm;letter-spacing:-.02em}
h1 em{font-family:Newsreader,Georgia,serif;font-style:italic;color:#1F6B4E}
.sub{font-size:13pt;color:#5A6472;margin:0 0 8mm;max-width:130mm}
.facts{display:flex;gap:10mm;flex-wrap:wrap;margin-bottom:9mm}
.fact b{display:block;font-size:8.5pt;letter-spacing:.12em;text-transform:uppercase;color:#8A93A0;margin-bottom:1.5mm}
.fact span{font-size:12.5pt;font-weight:600}
.scan{margin-top:auto;display:flex;gap:9mm;align-items:center;border-top:1px solid #E2E4E7;padding-top:8mm}
.qr{width:52mm;height:52mm;flex:0 0 auto;background:#fff;border:1px solid #E2E4E7;border-radius:5mm;padding:3mm}
.qr svg{width:100%;height:100%;display:block}
.scan h2{font-size:17pt;margin:0 0 2mm}
.scan p{margin:0 0 2mm;color:#5A6472;font-size:11pt}
.url{font-size:12pt;font-weight:600;color:#A9761F;word-break:break-all}
.foot{margin-top:7mm;font-size:9pt;color:#8A93A0;display:flex;justify-content:space-between;gap:6mm}
.bar{display:flex;gap:5px;margin-top:6mm}
.bar i{height:5px;flex:1;border-radius:99px}
.no-print{max-width:210mm;margin:16px auto;font-size:14px;color:#5A6472;text-align:center}
.no-print a{color:#0F1B2D}
@media print{.no-print{display:none}body{background:#fff}.sheet{margin:0;box-shadow:none}}
</style></head><body>
<div class="no-print">Print this page, or use your browser's Print dialog and choose <b>Save as PDF</b>. Paper size is set to ${size}. <a href="?size=${size === 'A4' ? 'a5' : 'a4'}">Switch to ${size === 'A4' ? 'A5' : 'A4'}</a></div>
<div class="sheet">
  <div class="kente"></div>
  <div class="brand">Gotham Consult <span>in partnership with Carlson Capital Ltd</span></div>
  <p class="eyebrow">${esc(ev ? (ev.kind === 'event' ? 'You are invited' : 'Gotham Consult') : 'Gotham Consult')}</p>
  <h1>${esc(headline)}</h1>
  ${sub ? `<p class="sub">${esc(sub)}</p>` : ''}
  <div class="facts">
    ${when ? `<div class="fact"><b>Date</b><span>${esc(when)}</span></div>` : ''}
    ${ev && ev.venue ? `<div class="fact"><b>Venue</b><span>${esc(ev.venue)}</span></div>` : ''}
    ${price ? `<div class="fact"><b>Entry</b><span>${esc(price)}</span></div>` : ''}
  </div>
  <div class="scan">
    <div class="qr">${qr}</div>
    <div>
      <h2>Scan to register</h2>
      <p>Point your phone camera at the code. No app needed.</p>
      <div class="url">${esc(short.replace(/^https?:\/\//, ''))}</div>
    </div>
  </div>
  <div class="bar"><i style="background:#A9761F"></i><i style="background:#0F1B2D"></i><i style="background:#1F6B4E"></i><i style="background:#C9A24B"></i></div>
  <div class="foot"><span>WhatsApp or call +233 55 239 5548</span><span>${esc(SITE_URL.replace(/^https?:\/\//, ''))}</span></div>
</div></body></html>`);
    }

    if (p === '/api/shortlinks' && req.method === 'GET') {
      if (!auth()) return json(res, 401, { error: 'no_session' });
      const { rows } = await q('select * from shortlinks order by created_at desc');
      return json(res, 200, { rows });
    }
    if (p === '/api/shortlinks' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const b = await body(req);
      const slug = clean(b.slug, 40).replace(/[^A-Za-z0-9_-]/g, '');
      if (!slug || !/^https?:\/\//.test(b.target || '')) return json(res, 400, { error: 'bad_link' });
      await q(`insert into shortlinks(slug,target,label,utm_source,utm_campaign) values ($1,$2,$3,$4,$5)
        on conflict (slug) do update set target=excluded.target,label=excluded.label,utm_source=excluded.utm_source,utm_campaign=excluded.utm_campaign`,
        [slug, clean(b.target, 400), clean(b.label, 80), clean(b.utm_source, 60), clean(b.utm_campaign, 60)]);
      return json(res, 200, { ok: true, slug });
    }

    const mAct = p.match(/^\/api\/registrations\/(\d+)\/activity$/);
    if (mAct) {
      if (!auth()) return json(res, 401, { error: 'no_session' });
      const { rows } = await q('select actor,action,detail,at from activity where reg_id=$1 order by at desc', [+mAct[1]]);
      return json(res, 200, { rows });
    }
    if (p === '/api/subscribers' && req.method === 'GET') {
      if (!auth()) return json(res, 401, { error: 'no_session' });
      const { rows } = await q(`select id,reference,full_name,company,email,phone,sector,country,confirmed_email,
        marketing_opt_in,unsubscribed_at,utm_source,created_at from registrations
        where item_code='BRIEF' order by created_at desc limit 5000`);
      return json(res, 200, { rows });
    }
    if (p === '/api/outbox' && req.method === 'GET') {
      if (!auth()) return json(res, 401, { error: 'no_session' });
      const { rows } = await q('select id,to_email,to_name,subject,kind,status,error,created_at,sent_at,body from outbox order by id desc limit 200');
      const key = !!process.env.RESEND_API_KEY;
      return json(res, 200, { rows, sending_enabled: key });
    }
    if (p === '/api/outbox/flush' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const r = await flushMail(50);
      return json(res, 200, r);
    }
    const mOut = p.match(/^\/api\/outbox\/(\d+)\/(sent|cancelled)$/);
    if (mOut && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      await q('update outbox set status=$1, sent_at=case when $1=\'sent\' then now() else sent_at end where id=$2', [mOut[2], +mOut[1]]);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/checkin' && req.method === 'POST') {
      const u = auth(); if (!u) return json(res, 401, { error: 'no_session' });
      const b = await body(req);
      const code = clean(b.code, 60).toUpperCase().replace(/^.*\/TICKET\//, '');
      const { rows } = await q(`select r.*, i.title from registrations r join items i on i.code=r.item_code
        where upper(r.ticket_code)=$1 or upper(r.reference)=$1`, [code]);
      const t = rows[0];
      if (!t) return json(res, 200, { ok: false, reason: 'unknown', code });
      if (!['confirmed', 'attended'].includes(t.status)) return json(res, 200, { ok: false, reason: 'not_confirmed', name: t.full_name, company: t.company, status: t.status });
      if (t.checked_in_at) return json(res, 200, { ok: false, reason: 'already', name: t.full_name, company: t.company, at: t.checked_in_at });
      await q("update registrations set checked_in_at=now(), status='attended' where id=$1", [t.id]);
      await q('insert into activity(reg_id,actor,action) values ($1,$2,$3)', [t.id, u.email, 'checked_in']);
      return json(res, 200, { ok: true, name: t.full_name, company: t.company, seats: t.seats, item: t.title });
    }
    if (p === '/api/duplicates' && req.method === 'GET') {
      if (!auth()) return json(res, 401, { error: 'no_session' });
      const emails = await q(`select lower(email) k, count(*)::int n, array_agg(id) ids, min(full_name) nm
        from registrations group by 1 having count(*)>1 order by 2 desc limit 50`);
      const phones = await q(`select phone k, count(*)::int n, array_agg(id) ids, min(full_name) nm
        from registrations where phone<>'' group by 1 having count(*)>1 order by 2 desc limit 50`);
      const bad = await q(`select id, full_name, phone from registrations where phone !~ '^\\+[0-9]{9,15}$' limit 50`);
      return json(res, 200, { emails: emails.rows, phones: phones.rows, bad_phones: bad.rows });
    }
    if (p === '/api/fix-phones' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const { rows } = await q("select id, phone from registrations where phone !~ '^\\+[0-9]{9,15}$'");
      let n = 0;
      for (const r of rows) { const f = phoneGH(r.phone); if (f && f !== r.phone) { await q('update registrations set phone=$1 where id=$2', [f, r.id]); n++; } }
      await q('insert into jobs_log(job,detail) values ($1,$2)', ['fix_phones', n + ' numbers normalised by ' + u.email]);
      return json(res, 200, { fixed: n });
    }
    if (p === '/api/jobs' && req.method === 'GET') {
      if (!auth()) return json(res, 401, { error: 'no_session' });
      const { rows } = await q('select job,detail,at from jobs_log order by id desc limit 40');
      return json(res, 200, { rows });
    }
    if (p === '/api/export.csv') {
      if (!auth()) return json(res, 401, { error: 'no_session' });
      const { rows } = await q(`select r.reference,i.title item,r.company,r.reg_no,r.full_name,r.job_title,r.email,r.phone,
        r.country,r.sector,r.seats,r.currency,r.amount,r.payment_method,r.paid,r.paid_at,r.payment_ref,r.status,
        r.checked_in_at,r.company_about,r.company_size,r.challenge,r.heard_via,r.follow_up,r.notes,r.created_at
        from registrations r join items i on i.code=r.item_code order by r.created_at desc`);
      const head = Object.keys(rows[0] || { reference: '' });
      const csv = [head.join(','), ...rows.map(r => head.map(h => csvCell(r[h])).join(','))].join('\n');
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="gotham-registrations.csv"' });
      return res.end('﻿' + csv);
    }

    /* ---- sponsors: admin ---- */
    if (p === '/api/sponsors/all' && req.method === 'GET') {
      if (!auth()) return json(res, 401, { error: 'no_session' });
      const { rows } = await q(`select s.*, m.variants, m.alt as logo_alt, m.kind as logo_kind
        from sponsors s left join media m on m.id = s.logo
        order by case s.tier when 'headline' then 0 when 'partner' then 1 when 'supporting' then 2 else 3 end, s.sort, s.name`);
      return json(res, 200, { rows: rows.map(r => ({ ...r,
        logo_image: r.variants ? mediaPublic({ id: r.logo, kind: r.logo_kind || 'logo', variants: r.variants, alt: r.logo_alt }) : null })) });
    }

    if (p === '/api/sponsors' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const b = await body(req);
      const name = clean(b.name, 160);
      if (!name) return json(res, 400, { error: 'name_required' });
      const tier = ['headline','partner','supporting','listing'].includes(b.tier) ? b.tier : 'listing';
      const vals = [name, tier, clean(b.category, 60), clean(b.blurb, 200), clean(b.url, 300),
        clean(b.logo, 32) || null, clean(b.item_code, 12).toUpperCase() || null,
        b.starts_on || null, b.ends_on || null, Number(b.amount) || 0, 'GHS',
        b.paid === true, clean(b.contact_name, 120), clean(b.contact_email, 160).toLowerCase(),
        phoneGH(clean(b.contact_phone, 40)), clean(b.notes, 2000), b.published !== false, +b.sort || 0];
      if (b.id) {
        await q(`update sponsors set name=$1,tier=$2,category=$3,blurb=$4,url=$5,logo=$6,item_code=$7,
          starts_on=$8,ends_on=$9,amount=$10,currency=$11,paid=$12,contact_name=$13,contact_email=$14,
          contact_phone=$15,notes=$16,published=$17,sort=$18 where id=$19`, [...vals, +b.id]);
      } else {
        await q(`insert into sponsors(name,tier,category,blurb,url,logo,item_code,starts_on,ends_on,amount,currency,
          paid,contact_name,contact_email,contact_phone,notes,published,sort)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`, vals);
      }
      await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, 'sponsor_save', name + ' · ' + tier]);
      return json(res, 200, { ok: true });
    }

    const mSpon = p.match(/^\/api\/sponsors\/(\d+)$/);
    if (mSpon && req.method === 'DELETE') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      await q('delete from sponsors where id=$1', [+mSpon[1]]);
      await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, 'sponsor_delete', 'id ' + mSpon[1]]);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/sponsor-leads' && req.method === 'GET') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const { rows } = await q('select * from sponsor_leads order by created_at desc limit 300');
      return json(res, 200, { rows });
    }

    const mLead = p.match(/^\/api\/sponsor-leads\/(\d+)$/);
    if (mLead && req.method === 'PATCH') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const b = await body(req);
      if (!['new','talking','won','lost'].includes(b.status)) return json(res, 400, { error: 'bad_status' });
      await q('update sponsor_leads set status=$1 where id=$2', [b.status, +mLead[1]]);
      return json(res, 200, { ok: true });
    }


    /* ---- contacts ---- */
    if (p === '/api/contacts' && req.method === 'GET') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const { rows } = await q(`select * from contacts
        order by case priority when 'Tier 1' then 0 when 'Tier 2' then 1 when 'Tier 3' then 2 else 3 end,
                 company nulls last, id desc limit 2000`);
      const sec = await q(`select coalesce(nullif(sector,''),'Not stated') as sector, count(*)::int as n
        from contacts group by 1 order by n desc`);
      return json(res, 200, { rows, sectors: sec.rows });
    }

    if (p === '/api/contacts' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const b = await body(req);
      const company = clean(b.company, 160), full_name = clean(b.full_name, 120);
      const email = clean(b.email, 160).toLowerCase();
      if (!company && !full_name) return json(res, 400, { error: 'name_required' });
      if (email && !/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { error: 'bad_email' });
      /* warn rather than silently create a second copy of someone */
      const dup = email
        ? await q('select id, company, full_name from contacts where lower(email)=lower($1)', [email])
        : await q(`select id, company, full_name from contacts
             where lower(coalesce(company,''))=lower($1) and lower(coalesce(full_name,''))=lower($2)`, [company, full_name]);
      if (dup.rows.length && b.confirm_duplicate !== true)
        return json(res, 409, { error: 'already_there', id: dup.rows[0].id,
          who: dup.rows[0].company || dup.rows[0].full_name });
      const { rows } = await q(`insert into contacts(company,full_name,role,email,phone,sector,city,country,
          website,priority,tags,notes,source,status,unsubscribed_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
          case when $14::text = 'do_not_contact' then now() else null end) returning id`,
        [company, full_name, clean(b.role, 140), email || null, phoneGH(clean(b.phone, 60)),
          clean(b.sector, 60), clean(b.city, 80), clean(b.country, 60) || 'Ghana',
          clean(b.website, 200), clean(b.priority, 40), clean(b.tags, 200), clean(b.notes, 4000),
          clean(b.source, 120) || 'added by hand',
          ['new','contacted','replied','meeting','won','lost','do_not_contact'].includes(b.status) ? b.status : 'new']);
      await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)',
        [u.email, 'contact_add', company || full_name]);
      return json(res, 200, { ok: true, id: rows[0].id });
    }

    if (p === '/api/contacts/import' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      let b;
      try { b = await bodyBig(req, 4 * 1024 * 1024); } catch { return json(res, 413, { error: 'too_large' }); }
      const source = clean(b.source, 120) || 'imported';
      const tags = clean(b.tags, 200);
      const sector = clean(b.sector, 60);
      const { rows: parsed } = parseContacts(b.text);
      if (!parsed.length) return json(res, 400, { error: 'nothing_recognised' });
      let added = 0, updated = 0, skipped = 0;
      for (const r of parsed.slice(0, 5000)) {
        const email = clean(r.email, 160).toLowerCase();
        if (email && !/^\S+@\S+\.\S+$/.test(email)) { skipped++; continue; }
        if (!email && !clean(r.company, 160)) { skipped++; continue; }
        const vals = [clean(r.company, 160), clean(r.full_name, 120), clean(r.role, 140),
          email || null, phoneGH(clean(r.phone, 40)), clean(r.sector, 60) || sector || null,
          clean(r.city, 80), clean(r.country, 60) || 'Ghana',
          [tags, clean(r.tags, 200)].filter(Boolean).join(','), clean(r.source, 120) || source, clean(r.notes, 1000)];
        {
          const ex = email
            ? await q(`select id from contacts where lower(email)=lower($1)
                 or (lower(coalesce(company,''))=lower($2) and lower(coalesce(full_name,''))=lower($3)
                     and coalesce(email,'')='')`, [email, clean(r.company, 160), clean(r.full_name, 120)])
            : await q(`select id from contacts where lower(coalesce(company,''))=lower($1)
                 and lower(coalesce(full_name,''))=lower($2)`, [clean(r.company, 160), clean(r.full_name, 120)]);
          if (ex.rows.length) {
            /* fill gaps only, and never touch someone who has told us to stop */
            await q(`update contacts set company=coalesce(nullif($1,''),company), full_name=coalesce(nullif($2,''),full_name),
              role=coalesce(nullif($3,''),role), phone=coalesce(nullif($4,''),phone), sector=coalesce(nullif($5,''),sector),
              city=coalesce(nullif($6,''),city), tags=coalesce(nullif($7,''),tags)
              , email=coalesce(email, $9)
              where id=$8 and unsubscribed_at is null and status <> 'do_not_contact'`,
              [vals[0], vals[1], vals[2], vals[4], vals[5], vals[6], vals[8], ex.rows[0].id, email || null]);
            updated++; continue;
          }
        }
        await q(`insert into contacts(company,full_name,role,email,phone,sector,city,country,tags,source,notes)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, vals);
        added++;
      }
      await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)',
        [u.email, 'contacts_import', `${added} added, ${updated} updated, ${skipped} skipped — source: ${source}`]);
      return json(res, 200, { added, updated, skipped, seen: parsed.length });
    }

    if (p === '/api/contacts/preview' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      let b; try { b = await bodyBig(req, 4 * 1024 * 1024); } catch { return json(res, 413, { error: 'too_large' }); }
      const { rows } = parseContacts(b.text);
      return json(res, 200, { count: rows.length, sample: rows.slice(0, 5) });
    }


    /* Step 1: hand us the file, we tell you what is in it and what we think
       each column is. Nothing is saved yet. */
    if (p === '/api/contacts/inspect' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      let b; try { b = await bodyBig(req, 28 * 1024 * 1024); } catch { return json(res, 413, { error: 'file_too_large' }); }
      const raw = String(b.data || '').replace(/^data:[^;]+;base64,/, '');
      if (!raw) return json(res, 400, { error: 'no_file' });
      let out;
      try { out = await readSheet(Buffer.from(raw, 'base64'), b.name || ''); }
      catch { return json(res, 400, { error: 'unreadable' }); }
      if (out.csv) return json(res, 200, { csv: true, count: out.rows.length, sample: out.rows.slice(0, 5) });
      if (!out.sheets.length) return json(res, 400, { error: 'no_table_found' });
      return json(res, 200, {
        sheets: out.sheets.map(sh => ({
          name: sh.name, rows: sh.rows.length, columns: sh.columns,
          mapping: guessMapping(sh.columns),
          sample: sh.rows.slice(0, 3)
        }))
      });
    }

    /* Step 2: import one sheet with a mapping you have confirmed. */
    if (p === '/api/contacts/import-sheet' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      let b; try { b = await bodyBig(req, 28 * 1024 * 1024); } catch { return json(res, 413, { error: 'file_too_large' }); }
      const source = clean(b.source, 120);
      if (!source) return json(res, 400, { error: 'source_required' });
      const raw = String(b.data || '').replace(/^data:[^;]+;base64,/, '');
      let out;
      try { out = await readSheet(Buffer.from(raw, 'base64'), b.name || ''); }
      catch { return json(res, 400, { error: 'unreadable' }); }
      const sh = (out.sheets || []).find(x => x.name === b.sheet) || (out.sheets || [])[0];
      if (!sh) return json(res, 400, { error: 'no_table_found' });
      const map = (b.mapping && typeof b.mapping === 'object') ? b.mapping : guessMapping(sh.columns);
      const tags = clean(b.tags, 200), sector = clean(b.sector, 60);

      let added = 0, updated = 0, skipped = 0;
      for (const cells of sh.rows.slice(0, 5000)) {
        const f = {}, extra = {};
        cells.forEach((v, i) => {
          const val = realValue(v);
          const field = map[i] ?? map[String(i)];
          if (field && field !== 'ignore') f[field] = [f[field], val].filter(Boolean).join(' · ');
          else if (val && sh.columns[i]) extra[sh.columns[i]] = val;
        });
        const company = clean(f.company, 160);
        /* "Ama Mensah – Managing Director" in one cell: split it. */
        let full_name = clean(f.full_name, 160), role = clean(f.role, 140);
        if (full_name && !role) {
          const m = full_name.match(/^(.*?)\s*[–—-]\s*(.+)$/);
          if (m && m[2].length < 90) { full_name = m[1].trim(); role = m[2].trim(); }
        }
        const email = clean(f.email, 160).toLowerCase();
        if (email && !/^\S+@\S+\.\S+$/.test(email)) { skipped++; continue; }
        if (!company && !full_name && !email) { skipped++; continue; }
        const status = STATUS_WORDS[String(f.status || '').toLowerCase().trim()] || null;
        const vals = {
          company, full_name: full_name.slice(0, 120), role,
          email: email || null, phone: phoneGH(clean(f.phone, 60)),
          sector: clean(f.sector, 60) || sector || null, city: clean(f.city, 80),
          website: clean(f.website, 200), priority: clean(f.priority, 40),
          tags: [tags, clean(f.priority, 40)].filter(Boolean).join(','),
          notes: clean(f.notes, 4000), source, extra: JSON.stringify(extra), status
        };

        /* Match on email when we have one; otherwise on company plus person,
           because a list of leads often has no addresses yet and importing
           the same sheet twice must not double it. */
        const found = email
          ? await q('select id from contacts where lower(email)=lower($1)', [email])
          : await q(`select id from contacts where lower(coalesce(company,''))=lower($1)
                     and lower(coalesce(full_name,''))=lower($2)`, [company, vals.full_name]);
        if (found.rows.length) {
          await q(`update contacts set
              company=coalesce(nullif($1,''),company), full_name=coalesce(nullif($2,''),full_name),
              role=coalesce(nullif($3,''),role), email=coalesce($4,email), phone=coalesce(nullif($5,''),phone),
              sector=coalesce(nullif($6,''),sector), city=coalesce(nullif($7,''),city),
              website=coalesce(nullif($8,''),website), priority=coalesce(nullif($9,''),priority),
              tags=coalesce(nullif($10,''),tags), notes=coalesce(nullif($11,''),notes),
              extra = coalesce(extra,'{}'::jsonb) || $12::jsonb,
              status = case when status in ('do_not_contact') then status else coalesce($13,status) end
            where id=$14 and unsubscribed_at is null and status <> 'do_not_contact'`,
            [vals.company, vals.full_name, vals.role, vals.email, vals.phone, vals.sector, vals.city,
              vals.website, vals.priority, vals.tags, vals.notes, vals.extra, vals.status, found.rows[0].id]);
          updated++;
        } else {
          await q(`insert into contacts(company,full_name,role,email,phone,sector,city,website,priority,tags,notes,source,extra,status)
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,coalesce($14,'new'))`,
            [vals.company, vals.full_name, vals.role, vals.email, vals.phone, vals.sector, vals.city,
              vals.website, vals.priority, vals.tags, vals.notes, vals.source, vals.extra, vals.status]);
          added++;
        }
      }
      await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)',
        [u.email, 'contacts_import', `${sh.name}: ${added} added, ${updated} updated, ${skipped} skipped — source: ${source}`]);
      return json(res, 200, { added, updated, skipped, sheet: sh.name });
    }

    const mCon = p.match(/^\/api\/contacts\/(\d+)$/);
    if (mCon && (req.method === 'PATCH' || req.method === 'DELETE')) {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      if (req.method === 'DELETE') { await q('delete from contacts where id=$1', [+mCon[1]]); return json(res, 200, { ok: true }); }
      const b = await body(req);
      if (b.status && !['new','contacted','replied','meeting','won','lost','do_not_contact'].includes(b.status))
        return json(res, 400, { error: 'bad_status' });
      const email = b.email === undefined ? undefined : clean(b.email, 160).toLowerCase();
      if (email && !/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { error: 'bad_email' });
      if (email) {
        const clash = await q('select id from contacts where lower(email)=lower($1) and id<>$2', [email, +mCon[1]]);
        if (clash.rows.length) return json(res, 409, { error: 'email_taken' });
      }
      /* undefined leaves a field alone; an empty string clears it */
      const set = (v, col) => v === undefined ? null : v;
      await q(`update contacts set
          company   = coalesce($1, company),   full_name = coalesce($2, full_name),
          role      = coalesce($3, role),      email     = case when $4 = '' then null else coalesce($4, email) end,
          phone     = coalesce($5, phone),     sector    = coalesce($6, sector),
          city      = coalesce($7, city),      website   = coalesce($8, website),
          priority  = coalesce($9, priority),  tags      = coalesce($10, tags),
          notes     = coalesce($11, notes),    status    = coalesce($12, status),
          unsubscribed_at = case when $12='do_not_contact' then coalesce(unsubscribed_at, now()) else unsubscribed_at end
        where id=$13`,
        [set(b.company), set(b.full_name), set(b.role), email === undefined ? null : email,
          b.phone === undefined ? null : phoneGH(clean(b.phone, 60)), set(b.sector), set(b.city),
          set(b.website), set(b.priority), set(b.tags), set(b.notes), b.status || null, +mCon[1]]);
      return json(res, 200, { ok: true });
    }

    /* ---- campaigns ---- */
    if (p === '/api/campaigns' && req.method === 'GET') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const { rows } = await q(`select c.*,
        (select count(*)::int from campaign_sends s where s.campaign_id=c.id and s.status='sent') as sent,
        (select count(*)::int from campaign_sends s where s.campaign_id=c.id and s.status='queued') as pending,
        (select count(*)::int from campaign_sends s where s.campaign_id=c.id and s.clicked_at is not null) as clicked
        from campaigns c order by c.id desc`);
      return json(res, 200, { rows });
    }

    if (p === '/api/campaigns' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const b = await body(req);
      if (!clean(b.name, 120) || !clean(b.subject, 200)) return json(res, 400, { error: 'name_and_subject' });
      const vals = [clean(b.name, 120), clean(b.subject, 200),
        ['invitation','sponsor','brief','plain'].includes(b.template) ? b.template : 'invitation',
        clean(b.intro, 6000), clean(b.cta_label, 60), clean(b.cta_url, 400),
        clean(b.item_code, 12).toUpperCase() || null, clean(b.seg_sector, 60), clean(b.seg_tags, 200),
        clean(b.seg_status, 20), clean(b.from_name, 120),
        Math.max(1, Math.min(200, parseInt(b.daily_limit) || 40))];
      if (b.id) {
        await q(`update campaigns set name=$1,subject=$2,template=$3,intro=$4,cta_label=$5,cta_url=$6,item_code=$7,
          seg_sector=$8,seg_tags=$9,seg_status=$10,from_name=$11,daily_limit=$12 where id=$13`, [...vals, +b.id]);
        return json(res, 200, { ok: true, id: +b.id });
      }
      const { rows } = await q(`insert into campaigns(name,subject,template,intro,cta_label,cta_url,item_code,
        seg_sector,seg_tags,seg_status,from_name,daily_limit,created_by)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`, [...vals, u.email]);
      return json(res, 200, { ok: true, id: rows[0].id });
    }

    const mCam = p.match(/^\/api\/campaigns\/(\d+)$/);
    if (mCam && req.method === 'DELETE') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      await q('delete from campaigns where id=$1', [+mCam[1]]);
      return json(res, 200, { ok: true });
    }

    /* how many it would reach, and what it looks like */
    const mCamPrev = p.match(/^\/api\/campaigns\/(\d+)\/preview$/);
    if (mCamPrev && req.method === 'GET') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const cam = (await q('select * from campaigns where id=$1', [+mCamPrev[1]])).rows[0];
      if (!cam) return json(res, 404, { error: 'not_found' });
      const { where, vals } = segmentSql(cam);
      const cnt = await q(`select count(*)::int as n from contacts c where ${where}`, vals);
      const one = (await q(`select * from contacts c where ${where} order by id limit 1`, vals)).rows[0]
        || { company: 'Acme Mining Ghana', full_name: 'Ama Mensah', role: 'Managing Director', sector: 'Mining', source: 'sample' };
      const item = cam.item_code ? await itemForMail(cam.item_code) : null;
      const html = campaignHtml(cam, one, item, { cta: PUBLIC_URL + '/c/sample', unsub: PUBLIC_URL + '/u/sample' });
      return json(res, 200, { audience: cnt.rows[0].n, sample_to: one.company || one.full_name, subject: merge(cam.subject, one), html });
    }

    /* send one to yourself before it goes to two hundred people */
    const mCamTest = p.match(/^\/api\/campaigns\/(\d+)\/test$/);
    if (mCamTest && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const b = await body(req);
      const to = clean(b.email, 160).toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(to)) return json(res, 400, { error: 'bad_email' });
      const cam = (await q('select * from campaigns where id=$1', [+mCamTest[1]])).rows[0];
      if (!cam) return json(res, 404, { error: 'not_found' });
      const sample = { company: 'Acme Mining Ghana', full_name: 'Ama Mensah', role: 'Managing Director', sector: 'Mining', city: 'Accra', source: 'test send' };
      const item = cam.item_code ? await itemForMail(cam.item_code) : null;
      await queueMail(to, 'Test', '[TEST] ' + merge(cam.subject, sample),
        campaignHtml(cam, sample, item, { cta: PUBLIC_URL + '/c/sample', unsub: PUBLIC_URL + '/u/sample' }), 'campaign_test');
      await flushMail(3);
      return json(res, 200, { ok: true });
    }

    /* build the queue and start sending, a few a day */
    const mCamStart = p.match(/^\/api\/campaigns\/(\d+)\/(start|pause)$/);
    if (mCamStart && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const id = +mCamStart[1];
      if (mCamStart[2] === 'pause') {
        await q("update campaigns set status='paused' where id=$1", [id]);
        return json(res, 200, { ok: true, status: 'paused' });
      }
      const cam = (await q('select * from campaigns where id=$1', [id])).rows[0];
      if (!cam) return json(res, 404, { error: 'not_found' });
      const { where, vals } = segmentSql(cam);
      const { rows: aud } = await q(`select c.id from contacts c where ${where}`, vals);
      if (!aud.length) return json(res, 400, { error: 'empty_audience' });
      for (const a of aud) {
        await q(`insert into campaign_sends(campaign_id,contact_id,token) values ($1,$2,$3)
                 on conflict (campaign_id,contact_id) do nothing`, [id, a.id, tok() + tok()]);
      }
      await q("update campaigns set status='sending' where id=$1", [id]);
      await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)',
        [u.email, 'campaign_start', `${cam.name} → ${aud.length} contacts, ${cam.daily_limit}/day`]);
      const r = await runCampaigns();
      return json(res, 200, { ok: true, queued: aud.length, sent_now: r });
    }

    if (p === '/api/audit' && req.method === 'GET') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const { rows } = await q('select actor,action,detail,at from audit_log order by at desc limit 100');
      return json(res, 200, { rows });
    }

    if (p === '/api/items/all' && req.method === 'GET') {
      if (!auth()) return json(res, 401, { error: 'no_session' });
      const { rows } = await q(`select ${ITEM_COLS},
        (select count(*) from registrations r where r.item_code=i.code and r.status<>'cancelled') as registrations
        from items i order by i.sort, i.starts_at nulls last`);
      return json(res, 200, { rows: await withMedia(rows) });
    }

    const mItemDel = p.match(/^\/api\/items\/([A-Za-z0-9_-]+)$/);
    if (mItemDel && req.method === 'DELETE') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const code = mItemDel[1].toUpperCase();
      const used = await q('select count(*)::int as n from registrations where item_code=$1', [code]);
      if (used.rows[0].n > 0) return json(res, 409, { error: 'has_registrations', n: used.rows[0].n });
      await q('delete from items where code=$1', [code]);
      await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, 'item_delete', code]);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/media' && req.method === 'GET') {
      if (!auth()) return json(res, 401, { error: 'no_session' });
      const kind = url.searchParams.get('kind');
      const { rows } = await q(
        kind ? 'select * from media where kind=$1 order by created_at desc limit 200'
             : 'select * from media order by created_at desc limit 200', kind ? [kind] : []);
      return json(res, 200, { rows: rows.map(r => ({ ...mediaPublic(r), name: r.original_name, bytes: r.bytes, created_at: r.created_at })) });
    }

    if (p === '/api/media' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      let b;
      try { b = await bodyBig(req, 28 * 1024 * 1024); }
      catch (e) { return json(res, 413, { error: e.message === 'too_large' ? 'file_too_large' : 'bad_json' }); }
      const raw = String(b.data || '').replace(/^data:[^;]+;base64,/, '');
      if (!raw) return json(res, 400, { error: 'no_file' });
      let buf;
      try { buf = Buffer.from(raw, 'base64'); } catch { return json(res, 400, { error: 'bad_file' }); }
      const isDoc = b.kind === 'doc' || /pdf$/i.test(b.name || '');
      const isLogo = !isDoc && b.kind === 'logo';
      if (isDoc && buf.length > MAX_DOC_BYTES) return json(res, 413, { error: 'file_too_large' });
      if (!isDoc && buf.length > MAX_IMAGE_BYTES) return json(res, 413, { error: 'file_too_large' });
      try {
        const out = isDoc ? await storeDoc(buf, b.name, b.label || b.alt, u.email)
          : isLogo ? await storeLogo(buf, b.name, b.alt, u.email)
          : await storeImage(buf, b.name, b.alt, u.email);
        const { rows } = await q('select * from media where id=$1', [out.id]);
        await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)',
          [u.email, 'media_upload', `${isDoc ? 'PDF' : isLogo ? 'logo' : 'image'} ${safeName(b.name)} (${Math.round(buf.length / 1024)} KB)`]);
        return json(res, 200, { ...mediaPublic(rows[0]), name: rows[0].original_name, bytes: rows[0].bytes });
      } catch (e) {
        return json(res, 400, { error: e.message === 'not_a_pdf' ? 'not_a_pdf' : e.message === 'not_an_image' ? 'not_an_image' : 'process_failed' });
      }
    }

    const mMedDel = p.match(/^\/api\/media\/([A-Za-z0-9]+)$/);
    if (mMedDel && req.method === 'DELETE') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const { rows } = await q('select * from media where id=$1', [mMedDel[1]]);
      if (!rows[0]) return json(res, 404, { error: 'not_found' });
      const inUse = await q(`select code as label from items where cover=$1
          or gallery @> $2::jsonb or docs @> $3::jsonb
        union all
        select name as label from sponsors where logo=$1`,
        [rows[0].id, JSON.stringify([rows[0].id]), JSON.stringify([{ id: rows[0].id }])]);
      if (inUse.rows.length) return json(res, 409, { error: 'in_use', items: inUse.rows.map(r => r.label) });
      deleteMediaFiles(rows[0]);
      await q('delete from media where id=$1', [rows[0].id]);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/items' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const b = await body(req);
      const code = clean(b.code, 12).toUpperCase();
      if (!code || !clean(b.title, 200)) return json(res, 400, { error: 'code_and_title_required' });
      /* a room only holds so many people: the venue limit in Settings is the ceiling */
      const capRow = (await q("select value from settings where key='max_seats'")).rows[0];
      const maxSeats = parseInt(capRow && capRow.value) || 0;
      if (maxSeats > 0 && b.capacity && +b.capacity > maxSeats)
        return json(res, 400, { error: 'over_venue_limit', max: maxSeats });
      const slugify = t => clean(t, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const slug = slugify(b.slug || b.title) || code.toLowerCase();
      const list = v => Array.isArray(v) ? v : [];
      await q(`insert into items(code,kind,title,subtitle,venue,starts_at,ends_at,currency,price,per,capacity,published,sort,approval,phase,audiences,
                 slug,summary,description,cover,gallery,docs,agenda,speakers)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
        on conflict (code) do update set kind=excluded.kind,title=excluded.title,subtitle=excluded.subtitle,venue=excluded.venue,
          starts_at=excluded.starts_at,ends_at=excluded.ends_at,currency=excluded.currency,price=excluded.price,per=excluded.per,
          capacity=excluded.capacity,published=excluded.published,sort=excluded.sort,approval=excluded.approval,
          phase=excluded.phase,audiences=excluded.audiences,slug=excluded.slug,summary=excluded.summary,
          description=excluded.description,cover=excluded.cover,gallery=excluded.gallery,docs=excluded.docs,
          agenda=excluded.agenda,speakers=excluded.speakers`,
        [code, clean(b.kind, 12) || 'event', clean(b.title, 200), clean(b.subtitle, 200), clean(b.venue, 120),
          b.starts_at || null, b.ends_at || null, 'GHS', Number(b.price) || 0, clean(b.per, 20) || null,
          b.capacity ? +b.capacity : null, b.published !== false, +b.sort || 0,
          b.approval === true, ['teaser','open','live','past'].includes(b.phase) ? b.phase : 'open', clean(b.audiences, 300),
          slug, clean(b.summary, 300), clean(b.description, 6000), clean(b.cover, 32) || null,
          JSON.stringify(list(b.gallery).slice(0, 12)),
          JSON.stringify(list(b.docs).slice(0, 8).map(d => ({ id: clean(d.id, 32), label: clean(d.label, 120) }))),
          JSON.stringify(list(b.agenda).slice(0, 30).map(a => ({ time: clean(a.time, 20), what: clean(a.what, 200) }))),
          JSON.stringify(list(b.speakers).slice(0, 20).map(x => ({ name: clean(x.name, 100), role: clean(x.role, 140), media: clean(x.media, 32) || null })))]);
      await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, 'item_save', code + ' — ' + clean(b.title, 120)]);
      return json(res, 200, { ok: true, code, slug });
    }
    if (p === '/api/settings' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const b = await body(req);
      for (const [k, v] of Object.entries(b))
        await q('insert into settings(key,value) values ($1,$2) on conflict (key) do update set value=excluded.value', [clean(k, 40), clean(String(v), 200)]);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/users' && req.method === 'POST') {
      const u = auth(); if (!u || u.role !== 'owner') return json(res, 401, { error: 'not_allowed' });
      const b = await body(req);
      const login = clean(b.email, 120).toLowerCase(), name = clean(b.name, 80);
      if (!/^[a-z0-9][a-z0-9._+@-]{1,119}$/.test(login) || (login.includes('@') && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(login)))
        return json(res, 400, { error: 'bad_login_name', fields: ['email'] });
      if (!name) return json(res, 400, { error: 'name_required', fields: ['name'] });
      const role = ['owner', 'admin', 'staff'].includes(b.role) ? b.role : 'staff';
      const salt = newSalt();
      const pw = crypto.randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x');
      const r = await q('insert into users(email,name,role,pw_hash,pw_salt,must_change) values ($1,$2,$3,$4,$5,true) on conflict (email) do nothing',
        [login, name, role, hash(pw, salt), salt]);
      if (!r.rowCount) return json(res, 409, { error: 'exists' });
      await q('insert into jobs_log(job,detail) values ($1,$2)', ['user_added', login + ' as ' + role + ' by ' + u.email]);
      return json(res, 200, { email: login, name, role, password: pw });
    }
    if (p === '/api/users' && req.method === 'GET') {
      if (!auth()) return json(res, 401, { error: 'no_session' });
      const { rows } = await q('select email,name,role,last_login,coalesce(active,true) as active,must_change from users order by id');
      return json(res, 200, { rows });
    }

    const mUser = p.match(/^\/api\/users\/([^/]+)$/);
    if (mUser && (req.method === 'PATCH' || req.method === 'DELETE')) {
      const u = auth(); if (!u || u.role !== 'owner') return json(res, 401, { error: 'not_allowed' });
      const email = decodeURIComponent(mUser[1]).toLowerCase();
      if (email === u.email) return json(res, 400, { error: 'not_yourself' });
      if (req.method === 'DELETE') {
        await q('delete from users where email=$1', [email]);
        await q('insert into jobs_log(job,detail) values ($1,$2)', ['user_removed', email + ' by ' + u.email]);
        return json(res, 200, { ok: true });
      }
      const b = await body(req); const sets = []; const vals = [];
      if (['owner', 'admin', 'staff'].includes(b.role)) sets.push(`role=$${vals.push(b.role)}`);
      if (typeof b.active === 'boolean') { sets.push(`active=$${vals.push(b.active)}`); if (!b.active) sets.push('sv=coalesce(sv,0)+1'); }
      if (b.role && b.role !== 'owner' || b.active === false) {
        const owners = (await q("select count(*)::int n from users where role='owner' and coalesce(active,true) and email<>$1", [email])).rows[0].n;
        const isOwner = (await q("select 1 from users where email=$1 and role='owner'", [email])).rowCount;
        if (isOwner && owners < 1) return json(res, 400, { error: 'last_owner' });
      }
      if (typeof b.name === 'string' && b.name.trim()) sets.push(`name=$${vals.push(clean(b.name, 80))}`);
      if (!sets.length) return json(res, 400, { error: 'nothing_to_update' });
      await q(`update users set ${sets.join(',')} where email=$${vals.push(email)}`, vals);
      await q('insert into jobs_log(job,detail) values ($1,$2)', ['user_updated', email + ' ' + JSON.stringify(b) + ' by ' + u.email]);
      return json(res, 200, { ok: true });
    }
    const mReset = p.match(/^\/api\/users\/([^/]+)\/reset$/);
    if (mReset && req.method === 'POST') {
      const u = auth(); if (!u || u.role !== 'owner') return json(res, 401, { error: 'not_allowed' });
      const email = decodeURIComponent(mReset[1]).toLowerCase();
      const pw = crypto.randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x');
      const salt = newSalt();
      const r = await q('update users set pw_hash=$1, pw_salt=$2, must_change=true, sv=coalesce(sv,0)+1 where email=$3', [hash(pw, salt), salt, email]);
      if (!r.rowCount) return json(res, 404, { error: 'no_such_user' });
      await q('insert into jobs_log(job,detail) values ($1,$2)', ['password_reset', email + ' by ' + u.email]);
      return json(res, 200, { email, password: pw });
    }

    /* ---- static admin ---- */
    if (p === '/admin' || p === '/admin/' || (!SITE_DIR && p === '/')) {
      const html = fs.readFileSync(path.join(here, 'public', 'admin.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-frame-options': 'DENY' });
      return res.end(html);
    }

    /* ---- the public website, same machine, same domain ---- */
    if (SITE_DIR && (req.method === 'GET' || req.method === 'HEAD')) {
      const TYPES = {
        '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
        '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
        '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
        '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.pdf': 'application/pdf'
      };
      /* resolve inside SITE_DIR or refuse: no ../ escaping to the rest of the disk */
      const root = fs.realpathSync(SITE_DIR);
      const wanted = decodeURIComponent(p);
      const candidates = wanted.endsWith('/')
        ? [wanted + 'index.html']
        : [wanted, wanted + '.html', wanted + '/index.html'];
      for (const c of candidates) {
        let full;
        try { full = fs.realpathSync(path.join(root, c)); } catch { continue; }
        if (full !== root && !full.startsWith(root + path.sep)) break;
        if (!fs.statSync(full).isFile()) continue;
        const ext = path.extname(full).toLowerCase();
        const buf = fs.readFileSync(full);
        const etag = '"' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) + '"';
        if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
        const cacheCtl = ext === '.html' ? 'public, max-age=60' : 'public, max-age=604800';
        /* byte ranges: iPhones will not play a video without them, and seeking needs them everywhere */
        const rg = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
        if (rg && (rg[1] || rg[2])) {
          let start = rg[1] ? +rg[1] : buf.length - +rg[2], end = rg[1] && rg[2] ? Math.min(+rg[2], buf.length - 1) : buf.length - 1;
          if (start < 0) start = 0;
          if (start >= buf.length || start > end) {
            res.writeHead(416, { 'content-range': `bytes */${buf.length}` }); return res.end();
          }
          res.writeHead(206, { 'content-type': TYPES[ext] || 'application/octet-stream', 'accept-ranges': 'bytes',
            'content-range': `bytes ${start}-${end}/${buf.length}`, 'content-length': end - start + 1, etag, 'cache-control': cacheCtl });
          return res.end(req.method === 'HEAD' ? undefined : buf.subarray(start, end + 1));
        }
        res.writeHead(200, {
          'accept-ranges': 'bytes',
          'content-type': TYPES[ext] || 'application/octet-stream',
          'content-length': buf.length, etag,
          'cache-control': cacheCtl
        });
        return res.end(req.method === 'HEAD' ? undefined : buf);
      }
      /* unknown page: show the site's own 404 if it has one */
      const nf = path.join(root, '404.html');
      if (fs.existsSync(nf)) {
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(fs.readFileSync(nf));
      }
    }
    return json(res, 404, { error: 'not_found' }, cors);
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'server_error' }, cors);
  }
});
/* Look up an event once for the mail templates. */
async function itemForMail(code) {
  const it = (await q('select * from items where code=$1', [code])).rows[0];
  if (!it) return null;
  let cover_url = null;
  if (it.cover) {
    const m = (await q('select variants from media where id=$1', [it.cover])).rows[0];
    if (m && m.variants && m.variants.og) cover_url = `${PUBLIC_URL}/media/${m.variants.og.jpg}`;
  }
  return { ...it, cover_url };
}

/* Send each running campaign's daily allowance, slowly and on purpose.
   Cold outreach that arrives in one burst is what gets a domain blocked,
   and a blocked domain means registration confirmations stop arriving too. */
async function runCampaigns() {
  let sentTotal = 0;
  const { rows: cams } = await q("select * from campaigns where status='sending'");
  for (const cam of cams) {
    const today = await q(`select count(*)::int as n from campaign_sends
      where campaign_id=$1 and status='sent' and sent_at > now() - interval '24 hours'`, [cam.id]);
    const room = cam.daily_limit - today.rows[0].n;
    if (room <= 0) continue;

    /* c.* would clobber s.id, so both keys are aliased explicitly */
    const { rows: due } = await q(`select s.id as send_id, s.token, s.contact_id, c.*
      from campaign_sends s join contacts c on c.id = s.contact_id
      where s.campaign_id=$1 and s.status='queued' order by s.id limit $2`, [cam.id, room]);
    if (!due.length) {
      const left = await q("select count(*)::int as n from campaign_sends where campaign_id=$1 and status='queued'", [cam.id]);
      if (left.rows[0].n === 0) await q("update campaigns set status='done' where id=$1", [cam.id]);
      continue;
    }

    const item = cam.item_code ? await itemForMail(cam.item_code) : null;
    for (const c of due) {
      /* re-check suppression at send time, not just when the queue was built */
      if (!c.email || c.unsubscribed_at || c.bounced || c.status === 'do_not_contact') {
        await q("update campaign_sends set status='skipped', skip_reason='suppressed' where id=$1", [c.send_id]);
        continue;
      }
      const links = { cta: `${PUBLIC_URL}/c/${c.token}`, unsub: `${PUBLIC_URL}/u/${c.token}` };
      await queueMail(c.email, c.full_name || c.company, merge(cam.subject, c),
        campaignHtml(cam, c, item, links), 'campaign');
      await q("update campaign_sends set status='sent', sent_at=now() where id=$1", [c.send_id]);
      await q("update contacts set last_sent_at=now(), status = case when status='new' then 'contacted' else status end where id=$1", [c.contact_id]);
      sentTotal++;
    }
    await q('insert into jobs_log(job,detail) values ($1,$2)', ['campaign', `${cam.name}: ${due.length} queued to send`]);
  }
  if (sentTotal) await flushMail(Math.min(100, sentTotal + 10));
  return sentTotal;
}

async function runJobs() {
  try {
    // 1. release seats whose hold expired
    const exp = await q(`update registrations set status='cancelled', notes=coalesce(notes,'') || ' [hold expired]'
      where status='new' and payment_method<>'free' and not paid and created_at < now() - interval '24 hours' returning id`);
    if (exp.rowCount) await q('insert into jobs_log(job,detail) values ($1,$2)', ['expire_holds', exp.rowCount + ' seats released']);

    // 2. day-before reminders for confirmed seats
    const rem = await q(`select r.id, r.full_name, r.email, r.ticket_code, r.reference, i.title, i.venue, i.starts_at
      from registrations r join items i on i.code=r.item_code
      where r.status='confirmed' and r.reminder_sent_at is null and i.starts_at between now() and now() + interval '36 hours'`);
    for (const r of rem.rows) {
      await queueMail(r.email, r.full_name, 'Tomorrow · ' + r.title,
        wrapMail('See you tomorrow',
          `<p style="color:#5A6472;font-size:15px">Hello ${esc(String(r.full_name).split(' ')[0])}, a reminder about tomorrow.</p>
           <p style="color:#5A6472;font-size:15px"><b style="color:#0F1B2D">${esc(r.title)}</b><br>${new Date(r.starts_at).toUTCString().slice(0, 22)}<br>${esc(r.venue || '')}</p>
           <p style="margin:18px 0"><a href="${BASE}/ticket/${r.ticket_code}" style="background:#0F1B2D;color:#fff;text-decoration:none;border-radius:999px;padding:12px 22px;display:inline-block;font-weight:600">Open your ticket</a></p>`),
        'reminder', r.id);
      await q('update registrations set reminder_sent_at=now() where id=$1', [r.id]);
    }
    if (rem.rowCount) await q('insert into jobs_log(job,detail) values ($1,$2)', ['reminders', rem.rowCount + ' reminders queued']);

    // 3. payment nudge 12 hours before a hold expires
    const due = await q(`select r.id, r.full_name, r.email, r.reference, r.amount, r.currency, i.title
      from registrations r join items i on i.code=r.item_code
      where r.status='new' and not r.paid and r.amount>0 and r.duephone is null
        and r.created_at < now() - interval '12 hours'`);
    for (const r of due.rows) {
      await queueMail(r.email, r.full_name, 'Your seat is still held · ' + r.title,
        wrapMail('Your seat is still held',
          `<p style="color:#5A6472;font-size:15px">Hello ${esc(String(r.full_name).split(' ')[0])}, we are holding your place for ${esc(r.title)} for a few more hours.</p>
           <p style="color:#5A6472;font-size:15px">Amount ${r.currency} ${r.amount} · reference <b style="color:#0F1B2D">${r.reference}</b>. Reply here or on WhatsApp once you have paid and we confirm straight away.</p>`),
        'payment_nudge', r.id);
      await q("update registrations set duephone='nudged' where id=$1", [r.id]);
    }
    await flushMail(30);

    // 4. outreach campaigns, within their daily limit
    await runCampaigns();
  } catch (e) { console.error('jobs', e); }
}

init().then(() => {
  server.listen(PORT, () => console.log('CRM on', PORT));
  runJobs();
  setInterval(runJobs, 15 * 60 * 1000);      // every 15 minutes
}).catch(e => { console.error(e); process.exit(1); });
