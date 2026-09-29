import http from 'node:http';
import tls from 'node:tls';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import QR from 'qrcode';
import sharp from 'sharp';
import ExcelJS from 'exceljs';
import nodemailer from 'nodemailer';

const PORT = process.env.PORT || 4100;
const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
// API calls are same-origin by default. Cross-origin use must name each trusted origin;
// an environment value of "*" is ignored because credentials must never be reflected to every site.
const ORIGINS = (process.env.ALLOW_ORIGINS || '').split(',').map(s => s.trim()).filter(s => s && s !== '*');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (t, p) => pool.query(t, p);
const here = path.dirname(new URL(import.meta.url).pathname);
const MEDIA = process.env.MEDIA_DIR || path.join(here, 'media');
const SITE_DIR = process.env.SITE_DIR || '';        // static website, served at / when set
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://gothamconsult.com').replace(/\/$/, '');
const CANON_HOST = new URL(PUBLIC_URL).host;
const PROXY_KEY = process.env.PROXY_KEY || '';
const REDIRECT_HOSTS = (process.env.REDIRECT_HOSTS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
/* where uploaded images are fetched from; set it to the server's own address while gothamconsult.com
   reaches us through the WordPress bridge, so pictures load directly instead of through PHP */
const MEDIA_URL = (process.env.MEDIA_URL || PUBLIC_URL).replace(/\/$/, '');
const SITE_URL = (process.env.SITE_URL || process.env.PUBLIC_URL || 'https://gothamconsult.com').replace(/\/$/, '');
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
/* ---------- two-step sign-in (TOTP, RFC 6238): Google Authenticator, Microsoft Authenticator, 1Password… ----------
   The secret is stored encrypted with a key derived from SESSION_SECRET; recovery codes are stored hashed. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32enc = buf => { let bits = '', out = ''; for (const x of buf) bits += x.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; };
const b32dec = str => { let bits = ''; for (const c of String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')) bits += B32.indexOf(c).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
const totpKey = () => crypto.createHash('sha256').update('totp:' + SECRET).digest();
const totpSeal = plain => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', totpKey(), iv); const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]); return [iv, c.getAuthTag(), ct].map(x => x.toString('base64')).join('.'); };
const totpOpen = sealed => { try { const [iv, tag, ct] = String(sealed).split('.').map(x => Buffer.from(x, 'base64')); const d = crypto.createDecipheriv('aes-256-gcm', totpKey(), iv); d.setAuthTag(tag); return Buffer.concat([d.update(ct), d.final()]).toString('utf8'); } catch { return null; } };
function hotp(secretB32, counter) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', b32dec(secretB32)).update(buf).digest(), o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
/* returns the time step that matched (so a code cannot be used twice), or 0 */
function totpCheck(secretB32, code, lastStep = 0, now = Date.now()) {
  const c = String(code || '').replace(/\D/g, ''); if (c.length !== 6) return 0;
  const step = Math.floor(now / 30e3);
  for (const d of [0, -1, 1]) { const s = step + d; if (s > lastStep && crypto.timingSafeEqual(Buffer.from(hotp(secretB32, s)), Buffer.from(c))) return s; }
  return 0;
}
const recHash = c => crypto.createHash('sha256').update('rec:' + String(c).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');
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
function rawBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    const parts = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too_large')); req.destroy(); return; } parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts))); req.on('error', reject);
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
const BASE = process.env.PUBLIC_URL || 'https://gothamconsult.com';
const FROM = process.env.MAIL_FROM || 'Gotham Consult <info@gothamconsult.com>';

async function queueMail(to_email, to_name, subject, body, kind, reg_id = null, unsub_url = null) {
  if (!to_email) return null;
  const { rows } = await q('insert into outbox(to_email,to_name,subject,body,kind,reg_id,unsub_url) values ($1,$2,$3,$4,$5,$6,$7) returning id',
    [to_email, to_name, subject, body, kind, reg_id, unsub_url]);
  return rows[0].id;
}
/* Email goes out through the gothamconsult.com mailbox on our web host (SMTP), or Resend if that key is set.
   Shared hosting allows only so many emails an hour, so tickets and confirmations always go before newsletters. */
/* Resend first when its key is set (built for this, no hosting-plan limits); otherwise the mailbox on our web host. */
const mailVia = () => process.env.RESEND_API_KEY ? 'resend' : (process.env.SMTP_HOST && process.env.SMTP_PASS) ? 'smtp' : null;
/* hourly and daily caps: the web host allows ~50 an hour on the basic plan; Resend's free plan 100 a day */
const MAIL_HOURLY = Math.max(1, +(process.env.MAIL_HOURLY_LIMIT || (process.env.RESEND_API_KEY ? 100 : 50)));
const MAIL_DAILY = Math.max(1, +(process.env.MAIL_DAILY_LIMIT || (process.env.RESEND_API_KEY ? 100 : 1000)));
let smtpClient = null;
function smtp() {
  if (smtpClient) return smtpClient;
  const port = +(process.env.SMTP_PORT || 465);
  smtpClient = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, pool: true, maxConnections: 2,
    ...(process.env.SMTP_INSECURE_TEST === '1' ? { ignoreTLS: true } : {}),
    auth: { user: process.env.SMTP_USER || 'info@gothamconsult.com', pass: process.env.SMTP_PASS } });
  return smtpClient;
}
const htmlToText = h => String(h || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d|tr|li)>/gi, '\n')
  .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
async function flushMail(limit = 20) {
  const via = mailVia();
  const queued = (await q("select count(*)::int as n from outbox where status='queued'")).rows[0].n;
  if (!queued) return { sent: 0, held: 0 };
  if (!via) return { sent: 0, held: queued };          // no mail account set up yet: leave them for staff to send by hand
  const lim = (await q(`select count(*) filter (where sent_at > now() - interval '1 hour')::int as h, count(*)::int as d
    from outbox where status='sent' and sent_at > now() - interval '24 hours'`)).rows[0];
  const room = Math.min(limit, MAIL_HOURLY - lim.h, MAIL_DAILY - lim.d);
  if (room <= 0) return { sent: 0, held: queued, reason: 'mail_limit' };
  const { rows } = await q(`select * from outbox where status='queued'
    order by case when kind in ('campaign') then 1 else 0 end, id limit $1`, [room]);
  let sent = 0;
  for (const m of rows) {
    let ok = false, pid = null, err = null;
    try {
      const headers = m.unsub_url ? { 'List-Unsubscribe': `<${m.unsub_url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined;
      if (via === 'smtp') {
        const info = await smtp().sendMail({ from: FROM, to: m.to_name ? { name: m.to_name, address: m.to_email } : m.to_email,
          subject: m.subject, html: m.body, text: htmlToText(m.body), headers });
        ok = true; pid = info.messageId || null;
      } else {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { 'authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: [m.to_email], subject: m.subject, html: m.body, headers }) });
        const d = await r.json().catch(() => ({}));
        ok = r.ok; pid = d.id || null; if (!ok) err = JSON.stringify(d).slice(0, 400);
      }
    } catch (e) { err = String(e.message || e).slice(0, 400); }
    if (ok) { await q("update outbox set status='sent', sent_at=now(), provider_id=$1 where id=$2", [pid, m.id]); sent++; }
    else await q("update outbox set status='failed', error=$1 where id=$2", [err, m.id]);
    await q(`update campaign_sends set status=$1, error=$2 where outbox_id=$3`, [ok ? 'sent' : 'failed', ok ? null : err, m.id]);
  }
  return { sent, held: queued - sent };
}

/* SMS (Arkesel) and WhatsApp (Meta WhatsApp Business) go out once their keys are set on the server;
   until then they wait in msg_outbox and the back office shows them as tap-to-send links. */
const smsReady = () => !!process.env.ARKESEL_API_KEY;
const waReady = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
async function sendSms(to, text) {
  const r = await fetch(process.env.ARKESEL_URL || 'https://sms.arkesel.com/api/v2/sms/send', { method: 'POST',
    headers: { 'api-key': process.env.ARKESEL_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ sender: process.env.SMS_SENDER_ID || 'GOTHAM', message: text, recipients: [String(to).replace(/^\+/, '')] }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || (d.status && d.status !== 'success')) throw new Error(JSON.stringify(d).slice(0, 300) || 'sms_failed');
  return (d.data && (d.data.id || (Array.isArray(d.data) && d.data[0] && d.data[0].id))) || null;
}
async function sendWhatsApp(to, template, lang, params) {
  const r = await fetch(`${process.env.WHATSAPP_API_BASE || 'https://graph.facebook.com/v21.0'}/${process.env.WHATSAPP_PHONE_ID}/messages`, { method: 'POST',
    headers: { authorization: 'Bearer ' + process.env.WHATSAPP_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: String(to).replace(/^\+/, ''), type: 'template',
      template: { name: template, language: { code: lang || 'en' },
        components: params && params.length ? [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: String(t).slice(0, 1000) })) }] : [] } }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(JSON.stringify(d.error || d).slice(0, 300));
  return d.messages && d.messages[0] && d.messages[0].id || null;
}
async function flushMessages(limit = 60) {
  const chans = [smsReady() && 'sms', waReady() && 'whatsapp'].filter(Boolean);
  if (!chans.length) return 0;
  const { rows } = await q(`select m.*, c.status as c_status, c.sms_unsub_at, c.whatsapp_unsub_at, c.consent_sms, c.consent_whatsapp
    from msg_outbox m left join contacts c on c.id = m.contact_id
    where m.status='queued' and m.channel = any($1) order by m.id limit $2`, [chans, limit]);
  let n = 0;
  for (const m of rows) {
    /* someone who opted out after the message was queued does not get it */
    if (m.contact_id && (m.c_status === 'do_not_contact' || (m.channel === 'sms' ? (m.sms_unsub_at || m.consent_sms === 'no') : (m.whatsapp_unsub_at || m.consent_whatsapp !== 'yes')))) {
      await q("update msg_outbox set status='cancelled', error='opted out' where id=$1", [m.id]);
      await q("update campaign_sends set status='skipped', skip_reason='opted out' where msg_id=$1", [m.id]);
      continue;
    }
    let ok = false, pid = null, err = null;
    try {
      pid = m.channel === 'sms' ? await sendSms(m.to_phone, m.body) : await sendWhatsApp(m.to_phone, m.template, m.lang, m.params || []);
      ok = true;
    } catch (e) { err = String(e.message || e).slice(0, 400); }
    await q("update msg_outbox set status=$1, sent_at=case when $1='sent' then now() else sent_at end, provider_id=$2, error=$3 where id=$4",
      [ok ? 'sent' : 'failed', pid, err, m.id]);
    await q('update campaign_sends set status=$1, error=$2 where msg_id=$3', [ok ? 'sent' : 'failed', err, m.id]);
    if (ok) n++;
  }
  return n;
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
<p style="margin-top:22px;font-size:13px;color:#5A6472">Gotham Consult, Accra<br>WhatsApp +233 55 041 6627 · info@gothamconsult.com</p>
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
  for (const [k, v] of [['momo_number', '+233550416627'], ['momo_name', 'Gotham Consult'], ['whatsapp', '233550416627'], ['pay_link', '']])
    await q('insert into settings(key,value) values ($1,$2) on conflict (key) do nothing', [k, v]);
  // The owner confirmed Joy's WhatsApp line is also the MoMo receiving number.
  // Fill older installs that still have the original empty/default placeholder.
  await q(`update settings set value='+233550416627' where key='momo_number'
    and (value='' or value='[Gotham MoMo number]')`);
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
    kb: Math.round((row.bytes || 0) / 1024), url: `${MEDIA_URL}/media/${row.variants.file}`
  };
  const out = { id: row.id, kind: row.kind, alt: row.alt || '', sizes: {} };
  for (const [k, v] of Object.entries(row.variants || {}))
    out.sizes[k] = { w: v.w, h: v.h, webp: `${MEDIA_URL}/media/${v.webp}`, jpg: `${MEDIA_URL}/media/${v.jpg}` };
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

/* ---------- Reading client lists in any common format ----------
   Everything becomes { sheets: [{ name, columns, rows }] }, so one mapping
   step and one import path serve Excel, LibreOffice, Numbers, CSV/TSV (any
   separator, any encoding), vCard, JSON and Google Sheets. */
const MAX_IMPORT_ROWS = 20000;
const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;
let XLSX_MOD;
async function sheetjs() {
  if (XLSX_MOD === undefined) XLSX_MOD = await import('xlsx').then(m => m.default || m).catch(() => null);
  return XLSX_MOD;
}
const colName = i => { let s = ''; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };

/* Rows of cells → a table: the header is the first row with two or more
   filled cells. A "header" that holds an email address is really data, so
   the columns get letters instead and we guess from the values. */
function tableFrom(name, aoa) {
  const rows = [];
  for (const r of aoa) { if (rows.length > MAX_IMPORT_ROWS + 8) break; rows.push(Array.from(r || [], cellText)); }
  let h = -1;
  for (let i = 0; i < Math.min(8, rows.length); i++) if (rows[i].filter(Boolean).length >= 2) { h = i; break; }
  if (h < 0) return null;
  let columns = rows[h].slice(), body = rows.slice(h + 1);
  if (columns.some(c => EMAIL_RE.test(c))) { body = rows.slice(h); columns = columns.map(() => ''); }
  let width = columns.length;
  for (const r of body.slice(0, 500)) width = Math.max(width, r.length);
  body = body.filter(r => r.some(Boolean));
  const seen = Object.create(null);
  columns = Array.from({ length: width }, (_, i) => {
    let c = String(columns[i] || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!c) c = body.some(r => r[i]) ? 'Column ' + colName(i) : '';
    if (!c) return '';
    const k = c.toLowerCase(); seen[k] = (seen[k] || 0) + 1;
    return seen[k] > 1 ? `${c} (${seen[k]})` : c;
  });
  body = body.slice(0, MAX_IMPORT_ROWS);
  return body.length && columns.filter(Boolean).length ? { name: String(name || 'Sheet').slice(0, 80), columns, rows: body } : null;
}

/* Text files: Excel saves CSV as Windows-1252 or UTF-16, Google as UTF-8. */
function decodeText(buf) {
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return buf.subarray(3).toString('utf8');
  if (buf[0] === 0xFF && buf[1] === 0xFE) return buf.subarray(2).toString('utf16le');
  if (buf[0] === 0xFE && buf[1] === 0xFF) { const b = Buffer.from(buf.subarray(2, 2 + ((buf.length - 2) & ~1))); return b.swap16().toString('utf16le'); }
  let zOdd = 0; const n = Math.min(buf.length, 400);
  for (let i = 1; i < n; i += 2) if (buf[i] === 0) zOdd++;
  if (n > 20 && zOdd > n / 4) return buf.toString('utf16le');
  const s = buf.toString('utf8');
  if (!s.includes('�')) return s;
  try { return new TextDecoder('windows-1252').decode(buf); } catch { return buf.toString('latin1'); }
}

/* CSV, TSV, semicolons (European Excel) or pipes, quoted fields with line breaks. */
function parseDelimited(text) {
  text = String(text || '').replace(/^﻿/, '');
  let delim = null;
  const sep = /^sep=(.)\s*\r?\n/i.exec(text);
  if (sep) { delim = sep[1]; text = text.slice(sep[0].length); }
  if (!delim) {
    const sample = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 8);
    const count = (l, d) => { let n = 0, q = false; for (const ch of l) { if (ch === '"') q = !q; else if (!q && ch === d) n++; } return n; };
    let best = ',', score = 0;
    for (const d of [',', ';', '\t', '|']) {
      /* the header's count, and how many lines agree with it (a quoted note
         with a line break makes a few lines disagree, that is fine) */
      const c = sample.map(l => count(l, d)); if (!c.length || !c[0]) continue;
      const s = c.filter(x => x === c[0]).length * 100 + c[0];
      if (s > score) { best = d; score = s; }
    }
    delim = best;
  }
  const rows = []; let row = [], cur = '', q = false, wasQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"' && !cur.trim() && !wasQ) { q = true; wasQ = true; cur = ''; }
    else if (ch === delim) { row.push(cur.trim()); cur = ''; wasQ = false; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur.trim()); rows.push(row); row = []; cur = ''; wasQ = false; if (rows.length > MAX_IMPORT_ROWS + 8) break; }
    else cur += ch;
  }
  if (cur.trim() || row.length) { row.push(cur.trim()); rows.push(row); }
  return rows;
}

/* vCard 2.1 / 3.0 / 4.0 — what iPhone, Android, Outlook and Google export. */
function parseVcf(text) {
  if (/QUOTED-PRINTABLE/i.test(text)) text = text.replace(/=\r?\n/g, '');
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const cards = []; let c = null;
  const un = s => String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;:\\])/g, '$1').trim();
  const parts = s => s.split(/(?<!\\);/).map(un);
  for (const raw of lines) {
    if (/^BEGIN:VCARD/i.test(raw)) { c = { emails: [], tels: [], cats: [] }; continue; }
    if (/^END:VCARD/i.test(raw)) { if (c) cards.push(c); c = null; if (cards.length >= MAX_IMPORT_ROWS) break; continue; }
    if (!c) continue;
    const at = raw.indexOf(':'); if (at < 0) continue;
    const keyParts = raw.slice(0, at).split(';');
    const key = keyParts[0].toUpperCase().replace(/^ITEM\d+\./, ''), params = keyParts.slice(1).join(';').toUpperCase();
    let val = raw.slice(at + 1);
    if (/QUOTED-PRINTABLE/.test(params)) val = Buffer.from(val.replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
    if (key === 'FN') c.fn = un(val);
    else if (key === 'N') { const [last, first, middle] = parts(val); c.first = [first, middle].filter(Boolean).join(' '); c.last = last; }
    else if (key === 'ORG') c.org = parts(val).filter(Boolean).join(', ');
    else if (key === 'TITLE' || (key === 'ROLE' && !c.title)) c.title = un(val);
    else if (key === 'EMAIL') c.emails.push(un(val).replace(/^mailto:/i, ''));
    else if (key === 'TEL') c.tels.push({ v: un(val).replace(/^tel:/i, ''), cell: /CELL|MOBILE|IPHONE/.test(params), wa: /WHATSAPP/.test(params) });
    else if (key === 'URL' && !c.url) c.url = un(val);
    else if (key === 'ADR') { const a = parts(val); c.city = c.city || a[3]; c.country = c.country || a[6]; }
    else if (key === 'NOTE') c.note = un(val);
    else if (key === 'CATEGORIES') c.cats.push(...val.split(/(?<!\\),/).map(un).filter(Boolean));
    else if (key === 'X-WHATSAPP' || key === 'IMPP' && /whatsapp/i.test(val)) c.tels.push({ v: un(val).replace(/^[a-z-]+:/i, ''), wa: true });
  }
  const head = ['Name', 'Company', 'Job title', 'Email', 'Other email', 'Mobile', 'Other phone', 'WhatsApp', 'Website', 'City', 'Country', 'Categories', 'Notes'];
  const rows = cards.map(k => {
    const mob = k.tels.find(t => t.cell) || k.tels.find(t => !t.wa);
    const other = k.tels.find(t => t !== mob && !t.wa);
    const wa = k.tels.find(t => t.wa);
    return [k.fn || [k.first, k.last].filter(Boolean).join(' '), k.org, k.title, k.emails[0], k.emails.slice(1).join(', '),
      mob && mob.v, other && other.v, wa && wa.v, k.url, k.city, k.country, k.cats.join(', '), k.note].map(v => v || '');
  });
  return [head, ...rows];
}

/* JSON: a list of objects (or of rows), or an object holding such a list.
   One level of nesting is flattened: {address:{city}} → "address.city". */
function parseJsonTable(text) {
  let d = JSON.parse(text);
  if (d && !Array.isArray(d) && typeof d === 'object') {
    const k = Object.keys(d).find(k => Array.isArray(d[k]) && d[k].some(x => x && typeof x === 'object'));
    d = k ? d[k] : [d];
  }
  if (!Array.isArray(d)) return [];
  if (d.every(x => Array.isArray(x))) return d;
  const flatVal = v => Array.isArray(v) ? v.map(x => x && typeof x === 'object' ? (x.value || x.address || x.email || x.number || x.name || '') : x).filter(x => x !== '' && x != null).join(', ')
    : v && typeof v === 'object' ? '' : v;
  const cols = new Map(), objs = [];
  for (const o of d.slice(0, MAX_IMPORT_ROWS)) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
    const flat = new Map();
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) { for (const [k2, v2] of Object.entries(v)) flat.set(k + '.' + k2, flatVal(v2)); }
      else flat.set(k, flatVal(v));
    }
    for (const k of flat.keys()) if (!cols.has(k) && cols.size < 120) cols.set(k, cols.size);
    objs.push(flat);
  }
  const head = [...cols.keys()];
  return [head, ...objs.map(f => head.map(k => f.has(k) ? f.get(k) : ''))];
}

async function readWithSheetJS(buf) {
  const X = await sheetjs();
  if (!X) { const e = new Error('format_not_supported'); e.code = 'format_not_supported'; throw e; }
  let wb;
  try { wb = X.read(buf, { type: 'buffer', cellDates: true, dense: true, sheetRows: MAX_IMPORT_ROWS + 10 }); }
  catch (e) { if (/password|encrypt/i.test(String(e && e.message))) { const x = new Error('encrypted'); x.code = 'encrypted'; throw x; } throw e; }
  const sheets = [];
  for (const name of wb.SheetNames) {
    const aoa = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false });
    const t = tableFrom(name, aoa); if (t) sheets.push(t);
  }
  return sheets;
}
async function readWithExcelJS(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const sheets = [];
  for (const ws of wb.worksheets) {
    if (ws.rowCount < 2) continue;
    const aoa = [];
    for (let i = 1; i <= Math.min(ws.rowCount, MAX_IMPORT_ROWS + 10); i++) aoa.push((ws.getRow(i).values || []).slice(1));
    const t = tableFrom(ws.name, aoa); if (t) sheets.push(t);
  }
  return sheets;
}

/* Read an uploaded file or pasted text into { kind, sheets }. The content
   decides, not the file name, so a mislabelled export still reads. */
async function readSheet(buf, filename) {
  const ext = (String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  const zip = buf[0] === 0x50 && buf[1] === 0x4B, ole = buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0;
  if (zip) {
    if (['ods', 'numbers', 'xlsb'].includes(ext)) return { kind: ext, sheets: await readWithSheetJS(buf) };
    try { const s = await readWithExcelJS(buf); if (s.length) return { kind: 'xlsx', sheets: s }; } catch {}
    return { kind: ext || 'xlsx', sheets: await readWithSheetJS(buf) };
  }
  if (ole) return { kind: ext === 'xlsx' ? 'xlsx' : 'xls', sheets: await readWithSheetJS(buf) };
  const text = decodeText(buf), head = text.slice(0, 2000).trimStart();
  if (/^BEGIN:VCARD/im.test(head)) { const t = tableFrom('Contacts', parseVcf(text)); return { kind: 'vcf', sheets: t ? [t] : [] }; }
  if (/^[\[{]/.test(head)) {
    try { const t = tableFrom('Records', parseJsonTable(text)); return { kind: 'json', sheets: t ? [t] : [] }; } catch {}
  }
  if (/^<(\?xml|!doctype html|html|table|workbook)/i.test(head)) return { kind: ext || 'xml', sheets: await readWithSheetJS(Buffer.from(text, 'utf8')) };
  const t = tableFrom(ext === 'tsv' ? 'TSV' : ext ? ext.toUpperCase() : 'Pasted rows', parseDelimited(text));
  return { kind: ext === 'tsv' ? 'tsv' : 'csv', sheets: t ? [t] : [] };
}

/* Google Sheets shared as "anyone with the link": fetch the workbook. Only
   that exact host and path shape, so this cannot be pointed anywhere else. */
async function fetchGoogleSheet(url) {
  const m = String(url || '').trim().match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,120})(?:[\/?#]|$)/);
  if (!m) { const e = new Error('bad_link'); e.code = 'bad_link'; throw e; }
  const r = await fetch(`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=xlsx`, { redirect: 'follow', signal: AbortSignal.timeout(25000) });
  const type = r.headers.get('content-type') || '';
  if (!r.ok || /text\/html/.test(type)) { const e = new Error('not_shared'); e.code = 'not_shared'; throw e; }
  const len = +r.headers.get('content-length') || 0;
  if (len > 20 * 1048576) { const e = new Error('file_too_large'); e.code = 'file_too_large'; throw e; }
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 20 * 1048576) { const e = new Error('file_too_large'); e.code = 'file_too_large'; throw e; }
  return buf;
}
/* The body of /inspect and /import-sheet: a file (base64), pasted text or a Google Sheets link. */
async function readImportBody(b) {
  if (b.url) return readSheet(await fetchGoogleSheet(b.url), 'google.xlsx');
  if (typeof b.text === 'string' && b.text.trim()) return readSheet(Buffer.from(b.text, 'utf8'), 'pasted.txt');
  const raw = String(b.data || '').replace(/^data:[^;]*;base64,/, '');
  if (!raw) { const e = new Error('no_file'); e.code = 'no_file'; throw e; }
  return readSheet(Buffer.from(raw, 'base64'), b.name || '');
}
const importError = e => ['format_not_supported', 'encrypted', 'bad_link', 'not_shared', 'file_too_large', 'no_file'].includes(e && e.code) ? e.code : 'unreadable';

/* Which column is which field. Exact names from the common exports first
   (Outlook, Google Contacts, LinkedIn, Mailchimp, HubSpot, our own template),
   then looser patterns, then the values themselves. */
const IMPORT_FIELDS = ['company', 'full_name', 'first_name', 'last_name', 'role', 'email', 'phone', 'whatsapp', 'website',
  'sector', 'city', 'country', 'language', 'client_type', 'tags', 'priority', 'status', 'notes',
  'consent_email', 'consent_sms', 'consent_whatsapp', 'opt_out'];
const hnorm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const EXACT_COLS = {
  company: ['company', 'companyname', 'client', 'clientname', 'customer', 'customername', 'account', 'organization', 'organisation', 'organization1name', 'organizationname', 'employer', 'accountname', 'business', 'businessname', 'firm'],
  full_name: ['name', 'fullname', 'contactname', 'displayname', 'person', 'contact', 'contactperson'],
  first_name: ['firstname', 'givenname', 'forename', 'fname'],
  last_name: ['lastname', 'surname', 'familyname', 'lname'],
  role: ['jobtitle', 'position', 'role', 'organization1title', 'designation', 'occupation'],
  email: ['email', 'emailaddress', 'email1value', 'mail', 'workemail', 'businessemail', 'primaryemail', 'emailaddress1'],
  phone: ['mobile', 'mobilephone', 'mobilenumber', 'cell', 'cellphone', 'phone', 'phonenumber', 'phone1value', 'telephone', 'tel', 'primaryphone', 'businessphone'],
  whatsapp: ['whatsapp', 'whatsappnumber', 'whatsappphone', 'wa'],
  website: ['website', 'webpage', 'web', 'url', 'site', 'companywebsite'],
  sector: ['sector', 'industry'],
  city: ['city', 'town', 'businesscity', 'homecity', 'address1city'],
  country: ['country', 'countryregion', 'businesscountryregion', 'homecountryregion', 'address1country', 'nationality'],
  language: ['language', 'preferredlanguage', 'lang', 'locale'],
  client_type: ['clienttype', 'customertype', 'typeofclient', 'clientcategory', 'segment', 'type'],
  tags: ['tags', 'tag', 'labels', 'categories', 'groups', 'groupmembership', 'lists'],
  priority: ['priority', 'tier'],
  status: ['status', 'outreachstatus', 'leadstatus'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks', 'description'],
  consent_email: ['emailconsent', 'emailoptin', 'optin', 'marketingoptin', 'marketingconsent', 'consent', 'subscribed', 'newsletter', 'mayemail'],
  consent_sms: ['smsconsent', 'smsoptin', 'textconsent', 'maysms'],
  consent_whatsapp: ['whatsappconsent', 'whatsappoptin', 'maywhatsapp'],
  opt_out: ['unsubscribed', 'optout', 'optedout', 'donotcontact', 'donotemail', 'dnc', 'emailoptout']
};
const CONSENT_COL = /consent|opt[\s_-]?in|opted|permission|subscri|newsletter|may (contact|email)|gdpr/i;
const OPTOUT_COL = /unsub|opt[\s_-]?out|do[\s_-]?not[\s_-]?(contact|email|call)|\bdnc\b/i;
const FIELD_HINTS = {
  company:     [/company/i, /organisation/i, /organization/i, /\bfirm\b/i, /institution/i, /business/i, /entity/i, /employer/i],
  full_name:   [/ghana (md|ceo)/i, /\bmd\b/i, /\bceo\b/i, /leader/i, /contact name/i, /^name$/i, /person/i, /manager/i, /\bname\b/i],
  first_name:  [/first ?name/i, /given/i, /forename/i],
  last_name:   [/last ?name/i, /surname/i, /family ?name/i],
  role:        [/role/i, /title/i, /position/i, /designation/i],
  email:       [/e-?mail/i],
  whatsapp:    [/whats ?app/i],
  phone:       [/mobile/i, /phone/i, /telephone/i, /\btel\b/i, /\bcell\b/i, /contact (no|number)/i],
  website:     [/website/i, /\bweb\b/i, /\burl\b/i, /domain/i],
  sector:      [/sector/i, /industry/i, /mineral/i, /category/i],
  city:        [/city/i, /town/i, /location/i],
  country:     [/country/i, /nation/i],
  language:    [/language/i, /\blang\b/i],
  client_type: [/client ?type|customer ?type|type of client|client category|segment/i],
  tags:        [/\btags?\b/i, /label/i, /group/i],
  priority:    [/priority/i, /tier/i, /rank/i],
  status:      [/outreach status/i, /^status$/i],
  notes:       [/notes/i, /sensitiv/i, /comment/i, /pitch/i, /next step/i, /remark/i]
};
function guessMapping(columns, sample = []) {
  const map = {}, taken = new Set(), done = new Set();
  const put = (i, f) => { map[i] = f; taken.add(i); done.add(f); };
  /* 1. consent and opt-out columns first, so "Email opt-in" is never read as the address */
  columns.forEach((c, i) => {
    if (!c) return;
    if (OPTOUT_COL.test(c)) { if (!done.has('opt_out')) put(i, 'opt_out'); else taken.add(i); return; }
    if (CONSENT_COL.test(c)) {
      const f = /sms|text/i.test(c) ? 'consent_sms' : /whats ?app/i.test(c) ? 'consent_whatsapp' : 'consent_email';
      if (!done.has(f)) put(i, f); else taken.add(i);
    }
  });
  /* 2. exact names, in order of preference ("Mobile Phone" before "Business Phone") */
  const normed = columns.map(hnorm);
  for (const [f, names] of Object.entries(EXACT_COLS)) {
    if (done.has(f)) continue;
    for (const n of names) { const i = normed.findIndex((c, j) => c === n && !taken.has(j)); if (i >= 0) { put(i, f); break; } }
  }
  /* 3. patterns, one pattern at a time across all fields, so a specific
     pattern ("Ghana MD") beats a loose one ("CEO") even when the loose
     column comes first. */
  const depth = Math.max(...Object.values(FIELD_HINTS).map(p => p.length));
  for (let round = 0; round < depth; round++) {
    for (const [field, pats] of Object.entries(FIELD_HINTS)) {
      if (done.has(field) || !pats[round]) continue;
      for (let i = 0; i < columns.length; i++) {
        if (taken.has(i) || !columns[i]) continue;
        if (pats[round].test(columns[i])) { put(i, field); break; }
      }
    }
  }
  /* 4. whatever is left: look at the values */
  const PHONE_V = /^\+?[\d\s().-]{8,20}$/, WEB_V = /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;
  columns.forEach((c, i) => {
    if (!c || taken.has(i)) return;
    const vals = sample.map(r => String(r[i] || '').trim()).filter(Boolean).slice(0, 30);
    if (vals.length < 2) return;
    const share = re => vals.filter(v => re.test(v)).length / vals.length;
    if (!done.has('email') && share(EMAIL_RE) >= .6) put(i, 'email');
    else if (!done.has('phone') && share(PHONE_V) >= .6 && vals.some(v => v.replace(/\D/g, '').length >= 9)) put(i, 'phone');
    else if (!done.has('website') && share(WEB_V) >= .6 && !vals.some(v => v.includes('@'))) put(i, 'website');
  });
  /* A full name wins over first + last; both stay mapped so nothing is lost. */
  return map;
}

/* Normalising what people type into those columns. */
const TYPE_WORDS = [
  ['international', /international|foreign|multinational|intl|overseas|embassy|diaspora|global/i],
  ['government', /government|ministry|\bgov\b|public sector|state|agency|authority|municipal|assembly/i],
  ['investor', /investor|\bfund\b|capital|\bvc\b|private equity|\bpe\b|angel|bank|financ/i],
  ['media', /media|press|journalist|news|tv|radio|publisher/i],
  ['partner', /partner|alliance|association|chamber|ngo|non-?profit/i],
  ['sme', /\bsme\b|small|startup|start-up|entrepreneur|micro/i],
  ['corporate', /corporate|corporation|company|enterprise|\bltd\b|\bplc\b|business|firm/i],
  ['other', /^other$/i]
];
const normType = v => { v = String(v || '').trim(); if (!v) return null; if (CLIENT_TYPES.includes(v.toLowerCase())) return v.toLowerCase(); const hit = TYPE_WORDS.find(([, re]) => re.test(v)); return hit ? hit[0] : null; };
const LANG_WORDS = { english: 'en', anglais: 'en', french: 'fr', francais: 'fr', 'français': 'fr', spanish: 'es', espanol: 'es', 'español': 'es', german: 'de', deutsch: 'de',
  danish: 'da', dansk: 'da', portuguese: 'pt', 'português': 'pt', chinese: 'zh', mandarin: 'zh', arabic: 'ar', italian: 'it', dutch: 'nl', swedish: 'sv', norwegian: 'no',
  twi: 'tw', akan: 'ak', ewe: 'ee', ga: 'gaa', hausa: 'ha', yoruba: 'yo', igbo: 'ig', swahili: 'sw', japanese: 'ja', korean: 'ko', russian: 'ru', turkish: 'tr', hindi: 'hi' };
const normLang = v => { v = String(v || '').trim().toLowerCase(); if (!v) return null; if (LANG_WORDS[v]) return LANG_WORDS[v]; const m = v.match(/^([a-z]{2,3})([-_][a-z]{2})?$/); return m ? m[1] : null; };
const COUNTRY_CODES = { gh: 'Ghana', gha: 'Ghana', ng: 'Nigeria', nga: 'Nigeria', ci: "Côte d'Ivoire", tg: 'Togo', bf: 'Burkina Faso', sn: 'Senegal', ke: 'Kenya', za: 'South Africa',
  us: 'United States', usa: 'United States', uk: 'United Kingdom', gb: 'United Kingdom', dk: 'Denmark', de: 'Germany', fr: 'France', nl: 'Netherlands', se: 'Sweden', no: 'Norway',
  ch: 'Switzerland', es: 'Spain', it: 'Italy', be: 'Belgium', ca: 'Canada', cn: 'China', in: 'India', jp: 'Japan', ae: 'United Arab Emirates', uae: 'United Arab Emirates',
  sa: 'Saudi Arabia', tr: 'Turkey', au: 'Australia', br: 'Brazil', ma: 'Morocco', eg: 'Egypt', rw: 'Rwanda', ug: 'Uganda', tz: 'Tanzania', lr: 'Liberia', sl: 'Sierra Leone', cm: 'Cameroon' };
const normCountry = v => { v = String(v || '').trim().replace(/\s+/g, ' '); if (!v) return null;
  const c = COUNTRY_CODES[v.toLowerCase().replace(/\./g, '')]; if (c) return c; if (v.length > 60) return null;
  return (v === v.toLowerCase() || v === v.toUpperCase()) ? v.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, s, a) => s + a.toUpperCase()) : v; };
const YES_V = /^(y|yes|true|1|x|✓|✔|ja|oui|si|sí|opted[\s_-]?in|opt[\s_-]?in|subscribed|agreed|granted|confirmed|active)$/i;
const NO_V = /^(n|no|false|0|nej|non|opted[\s_-]?out|opt[\s_-]?out|unsubscribed|refused|declined|revoked|cleaned|bounced)$/i;
const yesNo = v => { v = String(v || '').trim(); return !v ? null : YES_V.test(v) ? 'yes' : NO_V.test(v) ? 'no' : null; };
const splitTags = v => String(v || '').split(/[,;|]| ::: /).map(t => t.replace(/^\*\s*/, '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '').slice(0, 40)).filter(t => t && t !== 'mycontacts');
const mergeTags = (...lists) => [...new Set(lists.flatMap(l => Array.isArray(l) ? l : splitTags(l)))].join(',').slice(0, 400);

/* Import one table. With dry=true nothing is written and the answer says
   what would happen, row by row counts, so the admin can check first. */
async function importTable(sh, b, u, fileLabel) {
  const map = Object.create(null);
  const given = (b.mapping && typeof b.mapping === 'object') ? b.mapping : guessMapping(sh.columns, sh.rows.slice(0, 30));
  for (const [k, v] of Object.entries(given)) if (/^\d+$/.test(k) && IMPORT_FIELDS.includes(v)) map[+k] = v;
  const source = clean(b.source, 120);
  const D = {
    client_type: CLIENT_TYPES.includes(b.client_type) ? b.client_type : null,
    country: normCountry(clean(b.country, 60)), language: normLang(clean(b.language, 20)),
    tags: splitTags(clean(b.tags, 200)), sector: clean(b.sector, 60) || null,
    consent: Object.fromEntries(CHANNELS.map(ch => [ch, b['consent_' + ch] === 'yes' ? 'yes' : null])),
    consent_source: clean(b.consent_source, 200)
  };
  const colOf = f => { const i = Object.keys(map).find(k => map[k] === f); return i === undefined ? '' : sh.columns[i]; };
  const R = { added: 0, updated: 0, skipped: 0, no_name: 0, email_unreadable: 0, left_alone: 0, opted_out: 0, consent_yes: 0, seen: sh.rows.length, sample: [] };
  /* Everyone already in the CRM, looked up in memory: a 20,000-row list
     would otherwise mean 60,000 table scans. Writes go in one transaction,
     so a failure half-way saves nothing. */
  const byEmail = new Map(), byPhone = new Map(), byName = new Map();
  const nameKey = (co, n) => String(co || '').toLowerCase() + '|' + String(n || '').toLowerCase();
  const index = c => {
    if (c.email) byEmail.set(c.email.toLowerCase(), c);
    for (const ph of [c.phone, c.whatsapp]) if (ph && !byPhone.has(ph)) byPhone.set(ph, c);
    const nk = nameKey(c.company, c.full_name); if (nk !== '|' && !byName.has(nk)) byName.set(nk, c);
  };
  (await q('select * from contacts order by id')).rows.forEach(index);
  const client = b.dry ? null : await pool.connect();
  const cq = (t, p) => client.query(t, p);
  try {
  if (client) await cq('begin');
  for (const cells of sh.rows.slice(0, MAX_IMPORT_ROWS)) {
    const f = Object.create(null), extra = Object.create(null), emails = [];
    cells.forEach((v, i) => {
      const val = realValue(v), field = map[i];
      if (!val) return;
      if (field === 'email') emails.push(...val.split(/[\s,;]+/).filter(Boolean));
      else if (field) f[field] = f[field] ? f[field] + ' · ' + val : val;
      else if (sh.columns[i]) extra[sh.columns[i].slice(0, 80)] = val.slice(0, 1000);
    });
    const good = emails.map(e => e.replace(/^mailto:/i, '').toLowerCase()).filter(e => EMAIL_RE.test(e));
    const email = good[0] || null;
    if (good.length > 1) extra['Other emails'] = good.slice(1).join(', ');
    if (emails.length && !email) { extra['Email as given'] = emails.join(' ').slice(0, 200); R.email_unreadable++; }
    const company = clean(f.company, 160);
    let full_name = clean(f.full_name, 160) || clean([f.first_name, f.last_name].filter(Boolean).join(' '), 160), role = clean(f.role, 140);
    if (full_name && !role) {           /* "Ama Mensah – Managing Director" in one cell */
      const m = full_name.match(/^(.*?)\s+[–—-]\s+(.+)$/);
      if (m && m[2].length < 90) { full_name = m[1].trim(); role = m[2].trim(); }
    }
    const phone = phoneGH(clean(f.phone, 60).split(/\s*[,;\/]\s*|\s+·\s+/)[0]) || '';
    const whatsapp = f.whatsapp ? phoneGH(clean(f.whatsapp, 60).split(/\s*[,;\/]\s*|\s+·\s+/)[0]) : '';
    if (!company && !full_name && !email && !phone && !whatsapp) { R.skipped++; R.no_name++; continue; }
    const optOut = yesNo(f.opt_out) === 'yes';
    const cons = {};
    for (const ch of CHANNELS) {
      const own = optOut ? 'no' : yesNo(f['consent_' + ch]);
      cons[ch] = own || D.consent[ch];
    }
    if (optOut) R.opted_out++;
    const anyYes = CHANNELS.some(ch => cons[ch] === 'yes');
    if (anyYes) R.consent_yes++;
    const consentSrc = CHANNELS.some(ch => cons[ch] === 'yes' && yesNo(f['consent_' + ch]) === 'yes')
      ? `${fileLabel}: column "${CHANNELS.map(ch => colOf('consent_' + ch)).filter(Boolean).join('", "')}"`.slice(0, 200)
      : D.consent_source;
    const client_type = normType(f.client_type) || D.client_type;
    const country = normCountry(f.country) || D.country;
    const vals = {
      company, full_name: full_name.slice(0, 120), role, email, phone, whatsapp,
      sector: clean(f.sector, 60) || D.sector, city: clean(f.city, 80), website: clean(f.website, 200), priority: clean(f.priority, 40),
      tags: mergeTags(D.tags, splitTags(f.tags), f.priority ? splitTags(f.priority) : []),
      notes: clean(f.notes, 4000), client_type, country, language: normLang(f.language) || D.language,
      status: STATUS_WORDS[String(f.status || '').toLowerCase().trim()] || (optOut ? 'do_not_contact' : null)
    };
    if (R.sample.length < 6) R.sample.push({ company: vals.company, full_name: vals.full_name, role: vals.role, email, phone: vals.phone || vals.whatsapp,
      country, client_type, consent: cons, tags: vals.tags });

    /* Same person? email first, then phone, then company plus person. Rows
       with none of those are new. The same key twice in one file merges. */
    const fits = c => c && (!email || !c.email || c.email.toLowerCase() === email) ? c : null;
    const ph = vals.phone || vals.whatsapp;
    let found = (email && byEmail.get(email)) || (ph && fits(byPhone.get(ph))) || ((company || vals.full_name) && fits(byName.get(nameKey(company, vals.full_name)))) || null;
    if (b.dry) {
      if (found) { if (found.status === 'do_not_contact' || found.unsubscribed_at) R.left_alone++; else R.updated++; }
      else { R.added++; index({ email, phone: vals.phone, whatsapp: vals.whatsapp, company, full_name: vals.full_name, status: 'new' }); }
      continue;
    }
    if (found) {
      if (found.status === 'do_not_contact' || found.unsubscribed_at) { R.left_alone++; continue; }
      /* Fill gaps, add tags, never overwrite what someone typed in the CRM,
         and never turn a "no" into a "yes". */
      const nc = {};
      let newYes = false;
      for (const ch of CHANNELS) {
        const cur = found['consent_' + ch] || 'unknown';
        nc[ch] = cur === 'no' ? 'no' : cons[ch] === 'no' ? 'no' : cons[ch] === 'yes' ? 'yes' : cur;
        if (nc[ch] === 'yes' && cur !== 'yes') newYes = true;
      }
      let ex = {}; try { ex = typeof found.extra === 'string' ? JSON.parse(found.extra) : (found.extra || {}); } catch {}
      const upd = await cq(`update contacts set
          company=coalesce(nullif(company,''),nullif($1,'')), full_name=coalesce(nullif(full_name,''),nullif($2,'')),
          role=coalesce(nullif(role,''),nullif($3,'')), email=coalesce(email,$4), phone=coalesce(nullif(phone,''),nullif($5,'')),
          whatsapp=coalesce(nullif(whatsapp,''),nullif($6,'')), sector=coalesce(nullif(sector,''),nullif($7,'')), city=coalesce(nullif(city,''),nullif($8,'')),
          website=coalesce(nullif(website,''),nullif($9,'')), priority=coalesce(nullif($10,''),priority), tags=$11,
          notes=case when coalesce(notes,'')='' then nullif($12,'') when $12<>'' and position($12 in notes)=0 then notes||E'\n'||$12 else notes end,
          extra=$13::jsonb, client_type=coalesce(client_type,$14), country=case when $15::text is not null and (country is null or country='' or (country='Ghana' and $15<>'Ghana' and source is not distinct from $22)) then $15 else country end,
          language=case when $16::text is not null and coalesce(language,'en')='en' then $16 else language end,
          consent_email=$17, consent_sms=$18, consent_whatsapp=$19,
          consent_source=case when $20 then coalesce($21,consent_source) else consent_source end,
          consent_at=case when $20 then now() else consent_at end,
          status=case when $23::text is not null and status='new' then $23 else status end
        where id=$24 returning *`,
        [vals.company, vals.full_name, vals.role, email, vals.phone, vals.whatsapp, vals.sector, vals.city, vals.website, vals.priority,
          mergeTags(found.tags, vals.tags), vals.notes, JSON.stringify({ ...extra, ...ex }), vals.client_type, vals.country, vals.language,
          nc.email, nc.sms, nc.whatsapp, newYes, consentSrc || null, source, vals.status, found.id]);
      Object.assign(found, upd.rows[0]); index(found);
      R.updated++;
    } else {
      const ins = await cq(`insert into contacts(company,full_name,role,email,phone,whatsapp,sector,city,website,priority,tags,notes,source,extra,status,
          client_type,country,language,consent_email,consent_sms,consent_whatsapp,consent_source,consent_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,coalesce($15,'new'),$16,$17,$18,$19,$20,$21,$22,$23) returning *`,
        [vals.company || null, vals.full_name || null, vals.role || null, email, vals.phone || null, vals.whatsapp || null, vals.sector, vals.city || null,
          vals.website || null, vals.priority || null, vals.tags || null, vals.notes || null, source, JSON.stringify(extra), vals.status,
          vals.client_type, vals.country || (vals.client_type === 'international' ? null : 'Ghana'), vals.language || 'en',
          cons.email || 'unknown', cons.sms || 'unknown', cons.whatsapp || 'unknown', anyYes ? consentSrc : null, anyYes ? new Date() : null]);
      index(ins.rows[0]);
      R.added++;
    }
  }
  if (client) await cq('commit');
  } catch (e) { if (client) await cq('rollback').catch(() => {}); throw e; }
  finally { if (client) client.release(); }
  return R;
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
/* Carlson Capital Ltd is Gotham's partner only for renewable energy and AI/software. Only campaigns
   marked as such name it, with Uffe's number; everything else carries Gotham Consult and its own number. */
const partnerFoot = cam => cam && cam.carlson
  ? 'Gotham Consult, Accra · Renewable energy &amp; AI/software partner: Carlson Capital Ltd · WhatsApp or call +233 55 239 5548'
  : 'Gotham Consult, Accra · WhatsApp or call +233 55 041 6627';
function campaignHtml(cam, c, item, links) {
  if (cam.template === 'designer') return mailDoc(merge(cam.subject, c), designerBody(cam, c, item && item.designer ? item : { media: {}, events: {}, sponsors: [] }, links, !!links.preview));
  return mailDoc(merge(cam.subject, c), campaignBody(cam, c, item, links));
}
function campaignBody(cam, c, item, links) {
  const body = merge(cam.intro, c);
  const cta = cam.cta_label ? `<tr><td style="padding:6px 0 4px">
      <a href="${links.cta}" style="display:inline-block;background:#0F1B2D;color:#ffffff;text-decoration:none;
        border-radius:999px;padding:13px 26px;font-weight:600;font-size:15px">${esc(merge(cam.cta_label, c))}</a></td></tr>` : '';
  const foot = `<tr><td style="padding:22px 0 0;border-top:1px solid #E2E4E7;color:#8A93A0;font-size:12px;line-height:1.6">
      ${partnerFoot(cam)}<br>
      You are receiving this because we believe it is relevant to your work${c.source ? ' (' + esc(c.source) + ')' : ''}.
      <a href="${links.unsub}" style="color:#8A93A0">Tell us to stop</a> and we will not write again.</td></tr>`;

  if (cam.template === 'plain') {
    return `<div style="font:16px/1.65 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:560px">
      ${paras(body, 'margin:0 0 14px')}
      ${cam.cta_label ? `<p style="margin:0 0 14px"><a href="${links.cta}" style="color:#0F1B2D">${esc(merge(cam.cta_label, c))}</a></p>` : ''}
      <p style="margin:0 0 4px">${esc(cam.from_name || 'Joy Anthony Preston')}<br>
      <span style="color:#555">Gotham Consult · +233 55 041 6627${cam.carlson ? '<br>Renewable energy &amp; AI partner: Carlson Capital Ltd · +233 55 239 5548' : ''}</span></p>
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
        <td align="right" style="font-size:11px;color:#8A93A0">${cam.carlson ? 'Renewable energy &amp; AI partner: Carlson Capital Ltd' : 'Accra, Ghana'}</td>
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

/* ---------- email designer: blocks with pictures, built into a mail-safe email ----------
   A designed email is a list of blocks. Every link in it goes through the campaign's tracked
   /c/<token>?l=<n> address; n is the link's place in the blocks, so nobody can use it to
   redirect anywhere the email did not already point. */
const BLOCK_TYPES = ['heading', 'text', 'image', 'image_text', 'button', 'event', 'sponsors', 'divider'];
function cleanBlocks(list) {
  return (Array.isArray(list) ? list : []).slice(0, 40).map(b => {
    if (!b || !BLOCK_TYPES.includes(b.type)) return null;
    const o = { type: b.type };
    for (const [k, n] of [['text', 4000], ['title', 200], ['label', 80], ['alt', 200], ['caption', 300]]) if (typeof b[k] === 'string') o[k] = clean(b[k], n);
    if (typeof b.code === 'string') o.code = clean(b.code, 12).toUpperCase();
    if (typeof b.media === 'string') o.media = b.media.replace(/[^a-f0-9]/g, '').slice(0, 32) || undefined;
    if (typeof b.url === 'string') { const u = clean(b.url, 500); if (/^(https?:\/\/|mailto:|tel:)/i.test(u)) o.url = u; }
    if (['l', 'm'].includes(b.size)) o.size = b.size;
    if (['left', 'right'].includes(b.side)) o.side = b.side;
    if (['dark', 'gold'].includes(b.style)) o.style = b.style;
    if (['all', 'headline', 'partner', 'supporting'].includes(b.tier)) o.tier = b.tier;
    return o;
  }).filter(Boolean);
}
const MD_LINK = /\[([^\]]{1,120})\]\(((?:https?:\/\/|mailto:|tel:)[^)\s]{1,400})\)/g;
/* The links of a designed email, in the order they appear. The same walk renders them. */
function designerLinks(blocks) {
  const out = [];
  for (const b of blocks || []) {
    if (b.type === 'text' || b.type === 'image_text') for (const m of String(b.text || '').matchAll(MD_LINK)) out.push(m[2]);
    if (['image', 'image_text'].includes(b.type) && b.url) out.push(b.url);
    if (b.type === 'button') out.push(b.url || SITE_URL);   // a button always goes somewhere: its link, or the website
    if (b.type === 'event' && b.code) out.push(`${SITE_URL.replace(/\/$/, '')}/register?e=${encodeURIComponent(b.code)}`);
  }
  return out;
}
async function designerData(cam) {
  const blocks = cam.blocks || [];
  const ids = [...new Set(blocks.map(b => b.media).filter(Boolean))];
  const media = {};
  if (ids.length) for (const r of (await q('select id, variants, width, height from media where id = any($1)', [ids])).rows) {
    const v = (r.variants || {}).email || (r.variants || {}).og || (r.variants || {}).lg || Object.values(r.variants || {})[0];
    if (v) media[r.id] = { url: `${MEDIA_URL}/media/${v.jpg}`, w: v.w, h: v.h };
  }
  const events = {};
  for (const code of [...new Set(blocks.filter(b => b.type === 'event' && b.code).map(b => b.code))]) { const it = await itemForMail(code); if (it) events[code] = it; }
  let sponsors = [];
  if (blocks.some(b => b.type === 'sponsors')) sponsors = (await q(`select s.name, s.tier, s.url as website, m.variants from sponsors s left join media m on m.id=s.logo
      where s.published and (s.starts_on is null or s.starts_on <= current_date) and (s.ends_on is null or s.ends_on >= current_date)
      order by case s.tier when 'headline' then 0 when 'partner' then 1 when 'supporting' then 2 else 3 end, s.sort, s.name`)).rows
    .map(r => ({ name: r.name, tier: r.tier, url: r.website, logo: r.variants && (r.variants.lg || r.variants.sm) ? `${MEDIA_URL}/media/${(r.variants.lg || r.variants.sm).jpg}` : null }));
  return { designer: true, media, events, sponsors };
}
function designerBody(cam, c, data, links, preview) {
  const blocks = cam.blocks || [];
  /* every link is looked up in the list designerLinks() makes, so its number is its place there */
  const LINKS = designerLinks(blocks);
  const L = u => { const i = LINKS.indexOf(String(u).replace(/&amp;/g, '&')); return i < 0 ? SITE_URL : `${links.cta}${links.cta.includes('?') ? '&' : '?'}l=${i}`; };
  const inline = (t, withLinks = true) => {
    let h = esc(merge(t, c)).replace(/\*\*([^*]{1,200})\*\*/g, '<b>$1</b>');
    if (withLinks) h = h.replace(/\[([^\]]{1,120})\]\(((?:https?:\/\/|mailto:|tel:)[^)\s]{1,400})\)/g, (m, label, u) => `<a href="${L(u)}" style="color:#0F1B2D;font-weight:600">${label}</a>`);
    return h;
  };
  const paras = t => String(t || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean)
    .map(x => `<p style="margin:0 0 14px;color:#3A4453;font-size:16px;line-height:1.65">${inline(x).replace(/\n/g, '<br>')}</p>`).join('');
  const img = (b, w) => {
    const m = data.media[b.media];
    if (!m) return preview ? `<div style="background:#F1F1EC;border:2px dashed #D5D8DC;border-radius:12px;color:#8A93A0;font-size:14px;text-align:center;padding:48px 12px">Add a picture</div>` : '';
    const tag = `<img src="${m.url}" width="${w}" alt="${esc(b.alt || '')}" style="width:100%;max-width:${w}px;height:auto;display:block;border:0;border-radius:12px">`;
    return b.url ? `<a href="${L(b.url)}" style="text-decoration:none">${tag}</a>` : tag;
  };
  const btn = (label, style, u) => `<a href="${L(u || SITE_URL)}" style="display:inline-block;${style === 'gold' ? 'background:#E9B75A;color:#1a1205' : 'background:#0F1B2D;color:#ffffff'};text-decoration:none;border-radius:999px;padding:14px 28px;font-weight:700;font-size:15px">${esc(merge(label || 'Find out more', c))}</a>`;
  const row = inner => `<tr><td style="padding:0 32px 18px">${inner}</td></tr>`;
  const out = [];
  for (const b of blocks) {
    if (b.type === 'heading') { if (b.text) out.push(row(`<h${b.size === 'm' ? 2 : 1} style="margin:6px 0 0;color:#0F1B2D;font-size:${b.size === 'm' ? 21 : 28}px;line-height:1.2;letter-spacing:-.01em">${inline(b.text, false)}</h${b.size === 'm' ? 2 : 1}>`)); }
    else if (b.type === 'text') { if (b.text) out.push(row(paras(b.text))); }
    else if (b.type === 'image') { const h = img(b, 536); if (h) out.push(row(h + (b.caption ? `<p style="margin:8px 0 0;color:#8A93A0;font-size:13px">${esc(b.caption)}</p>` : ''))); }
    else if (b.type === 'image_text') {
      const pic = `<div style="display:inline-block;width:100%;max-width:250px;vertical-align:top;margin:0 0 12px">${img(b, 250)}</div>`;
      const words = `<div style="display:inline-block;width:100%;max-width:262px;vertical-align:top;${b.side === 'right' ? 'padding-right:20px' : 'padding-left:20px'};box-sizing:border-box">
        ${b.title ? `<h3 style="margin:0 0 8px;color:#0F1B2D;font-size:19px;line-height:1.25">${inline(b.title, false)}</h3>` : ''}${paras(b.text)}
        ${b.url && b.label ? `<a href="${L(b.url)}" style="color:#0F1B2D;font-weight:700;font-size:15px">${esc(b.label)} →</a>` : ''}</div>`;
      out.push(row(`<div style="font-size:0">${b.side === 'right' ? words + pic : pic + words}</div>`));
    }
    else if (b.type === 'button') out.push(row(`<div style="padding:4px 0">${btn(b.label, b.style, b.url)}</div>`));
    else if (b.type === 'event') {
      const it = data.events[b.code];
      if (!it) { if (preview) out.push(row('<div style="background:#F1F1EC;border-radius:12px;color:#8A93A0;padding:20px;text-align:center">Pick an event</div>')); continue; }
      const when = it.starts_at ? new Date(it.starts_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Accra' })
        + ' · ' + new Date(it.starts_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' }) : '';
      out.push(row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E6D3A8;border-radius:16px;background:#FFF9EC;border-collapse:separate">
        ${it.cover_url ? `<tr><td><img src="${it.cover_url}" width="534" alt="" style="width:100%;height:auto;display:block;border-radius:15px 15px 0 0"></td></tr>` : ''}
        <tr><td style="padding:18px 20px 20px">
          <p style="margin:0 0 6px;color:#8A6116;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${esc(when)}</p>
          <p style="margin:0 0 6px;color:#0F1B2D;font-size:20px;font-weight:700;line-height:1.25">${esc(it.title)}</p>
          <p style="margin:0 0 14px;color:#5A6472;font-size:14.5px">${esc([it.venue, Number(it.price) > 0 ? 'GHS ' + Number(it.price).toLocaleString('en-GB') : 'Free'].filter(Boolean).join(' · '))}</p>
          ${btn(b.label || (it.approval ? 'Request your invitation' : 'Reserve your seat'), 'gold', `${SITE_URL.replace(/\/$/, '')}/register?e=${encodeURIComponent(b.code)}`)}</td></tr></table>`));
    }
    else if (b.type === 'sponsors') {
      const S = data.sponsors.filter(s => s.logo && (!b.tier || b.tier === 'all' || s.tier === b.tier)).slice(0, 12);
      if (!S.length) { if (preview) out.push(row('<div style="color:#8A93A0;font-size:13px">No current sponsor logos to show.</div>')); continue; }
      out.push(row(`<p style="margin:0 0 10px;color:#8A93A0;font-size:12px;letter-spacing:.1em;text-transform:uppercase">${esc(b.title || 'With thanks to our partners')}</p>
        <div>${S.map(s => `<img src="${s.logo}" alt="${esc(s.name)}" height="40" style="height:40px;width:auto;margin:0 18px 12px 0;vertical-align:middle">`).join('')}</div>`));
    }
    else if (b.type === 'divider') out.push(row('<div style="height:1px;background:#E2E4E7;margin:4px 0"></div>'));
  }
  return `<div style="background:#EDEDE8;padding:26px 12px">
   <table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center"
     style="max-width:600px;width:100%;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
    <tr><td style="height:6px;background:#A9761F;font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td style="padding:22px 32px 18px">
      <table role="presentation" width="100%"><tr>
        <td style="font-size:15px;font-weight:700;color:#0F1B2D">Gotham Consult</td>
        <td align="right" style="font-size:11px;color:#8A93A0">${cam.carlson ? 'Renewable energy &amp; AI partner: Carlson Capital Ltd' : 'Accra, Ghana'}</td>
      </tr></table></td></tr>
    ${out.join('\n')}
    <tr><td style="padding:10px 32px 26px"><div style="border-top:1px solid #E2E4E7;padding-top:18px;color:#8A93A0;font-size:12px;line-height:1.6">
      ${partnerFoot(cam)}<br>
      You are receiving this because we believe it is relevant to your work${c.source ? ' (' + esc(c.source) + ')' : ''}.
      <a href="${links.unsub}" style="color:#8A93A0">Tell us to stop</a> and we will not write again.</div></td></tr>
    <tr><td style="font-size:0;line-height:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="height:5px;background:#A9761F"></td><td style="height:5px;background:#0F1B2D"></td><td style="height:5px;background:#1F6B4E"></td><td style="height:5px;background:#C9A24B"></td></tr></table></td></tr>
   </table></div>`;
}
/* What a campaign's email needs besides the contact: its event, or a designed email's pictures, events and sponsors. */
const mailContext = async cam => cam.template === 'designer' ? designerData(cam) : (cam.item_code ? itemForMail(cam.item_code) : null);

/* Pictures for email: never cropped, at most 1200 px wide (sharp on phones), light enough for mobile data. */
async function storeEmailImage(buf, originalName, alt, who) {
  const id = mediaId();
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) throw new Error('not_an_image');
  const base = sharp(buf).rotate().resize({ width: 1200, withoutEnlargement: true });
  const png = meta.hasAlpha && ['png', 'webp', 'gif'].includes(meta.format);
  const out = png ? await base.png({ compressionLevel: 9, palette: true }).toBuffer() : await base.flatten({ background: '#ffffff' }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  const m2 = await sharp(out).metadata(), file = `${id}-email.${png ? 'png' : 'jpg'}`;
  fs.writeFileSync(path.join(MEDIA, file), out);
  const variants = { email: { w: m2.width, h: m2.height, webp: file, jpg: file, kb: Math.round(out.length / 1024) } };
  await q(`insert into media(id,kind,original_name,mime,bytes,width,height,variants,alt,uploaded_by) values ($1,'email',$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, safeName(originalName), 'image/' + (png ? 'png' : 'jpeg'), out.length, meta.width, meta.height, JSON.stringify(variants), clean(alt, 200), who]);
  return { id };
}
/* Starting points in the designer. Saved templates sit next to these. */
const STARTER_TEMPLATES = [
  { id: 'starter-promo', name: 'Promotion', subject: '{{first_name}}, something for {{company}}', builtin: true, blocks: [
    { type: 'image' }, { type: 'heading', text: 'A better way to grow in Ghana', size: 'l' },
    { type: 'text', text: 'Hello {{first_name}},\n\nWrite two or three short lines about the offer: what it is, who it is for, and why now.' },
    { type: 'button', label: 'Find out more', style: 'gold', url: 'https://gothamconsult.com/services' }] },
  { id: 'starter-event', name: 'Event invitation', subject: 'You are invited, {{first_name}}', builtin: true, blocks: [
    { type: 'heading', text: 'You are invited', size: 'l' },
    { type: 'text', text: 'Dear {{first_name}},\n\nOne line on why this room matters for {{company}}.' },
    { type: 'event' }, { type: 'sponsors', tier: 'all' }] },
  { id: 'starter-news', name: 'Newsletter', subject: 'Ghana Business Brief', builtin: true, blocks: [
    { type: 'heading', text: 'Ghana Business Brief', size: 'l' }, { type: 'text', text: 'Hello {{first_name}}, three things worth knowing this week.' },
    { type: 'image_text', title: 'First story', text: 'Two lines and a [link](https://gothamconsult.com).', side: 'left' },
    { type: 'image_text', title: 'Second story', text: 'Two lines about it.', side: 'right' }, { type: 'divider' },
    { type: 'text', text: 'Reply to this email if you want to talk about any of it.' }] }
];

/* Who this campaign would go to, after the suppression rules for its channel. */
const CLIENT_TYPES = ['corporate','international','government','investor','sme','media','partner','other'];
const CHANNELS = ['email','sms','whatsapp'];
const csvList = v => String(v || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
function segmentSql(cam) {
  const ch = CHANNELS.includes(cam.channel) ? cam.channel : 'email';
  const where = [`c.status <> 'do_not_contact'`], vals = [];
  if (ch === 'email') where.push(`(c.email is not null and c.email <> '')`, `c.unsubscribed_at is null`, `not coalesce(c.bounced,false)`, `coalesce(c.consent_email,'unknown') <> 'no'`);
  if (ch === 'sms') where.push(`coalesce(c.phone,'') <> ''`, `c.sms_unsub_at is null`, `coalesce(c.consent_sms,'unknown') <> 'no'`);
  /* WhatsApp's rules: only people who said yes */
  if (ch === 'whatsapp') where.push(`coalesce(nullif(c.whatsapp,''), c.phone, '') <> ''`, `c.whatsapp_unsub_at is null`, `c.consent_whatsapp = 'yes'`);
  if (cam.seg_consent === 'yes' && ch !== 'whatsapp') where.push(`c.consent_${ch} = 'yes'`);
  if (cam.seg_sector) { vals.push(csvList(cam.seg_sector)); where.push(`lower(coalesce(c.sector,'')) = any($${vals.length})`); }
  if (cam.seg_status) { vals.push(cam.seg_status); where.push(`c.status = $${vals.length}`); }
  if (cam.seg_type) { vals.push(csvList(cam.seg_type)); where.push(`lower(coalesce(c.client_type,'')) = any($${vals.length})`); }
  if (cam.seg_country) { vals.push(csvList(cam.seg_country)); where.push(`lower(coalesce(c.country,'')) = any($${vals.length})`); }
  /* whole tags only: "gold" no longer matches "goldfields" */
  for (const t of csvList(cam.seg_tags)) {
    vals.push(t);
    where.push(`$${vals.length} = any(string_to_array(regexp_replace(lower(coalesce(c.tags,'')), '\\s*,\\s*', ',', 'g'), ','))`);
  }
  return { where: where.join(' and '), vals };
}
const addTag = (tags, t) => { const l = String(tags || '').split(',').map(x => x.trim()).filter(Boolean); if (!l.map(x => x.toLowerCase()).includes(t.toLowerCase())) l.push(t); return l.join(', '); };
/* the words of a text or WhatsApp message; the opt-out link is always added */
function msgText(cam, c, token) {
  const body = merge(cam.sms_text || cam.intro || '', c).trim();
  const link = cam.cta_url ? `\n${cam.cta_url}` : '';
  return `${body}${link}\nStop: ${PUBLIC_URL}/u/${token}`;
}
const waParams = (cam, c) => String(cam.wa_params || '').split('\n').map(x => merge(x.trim(), c)).filter(Boolean).slice(0, 10);
const toAddr = (ch, c) => ch === 'email' ? c.email : ch === 'sms' ? c.phone : (c.whatsapp || c.phone);

/* Brief subscribers and forum registrants join the client database, with the consent they gave on the form. */
async function syncRegistrations() {
  const { rows } = await q(`select r.*, i.kind as item_kind from registrations r left join items i on i.code=r.item_code
    where r.status not in ('declined') order by r.id`);
  let added = 0, updated = 0;
  for (const r of rows) {
    const brief = r.item_code === 'BRIEF';
    const tag = brief ? 'brief' : 'event-' + String(r.item_code).toLowerCase();
    const okEmail = brief ? (r.confirmed_email && !r.unsubscribed_at) : !!r.marketing_opt_in;
    const src = brief ? 'Ghana Business Brief signup (email confirmed)' : `registration ${r.reference}`;
    const email = r.email ? String(r.email).toLowerCase() : null;
    let c = (await q('select * from contacts where reg_id=$1', [r.id])).rows[0];
    if (!c && email) c = (await q('select * from contacts where lower(email)=$1', [email])).rows[0];
    if (!c && r.phone) c = (await q("select * from contacts where phone=$1 and coalesce(email,'')='' order by id limit 1", [r.phone])).rows[0];
    if (c) {
      const tags = addTag(c.tags, tag);
      const ce = c.consent_email === 'no' ? 'no' : (okEmail ? 'yes' : c.consent_email);
      if (tags !== c.tags || ce !== c.consent_email || (!c.reg_id && !c.email && email)) {
        await q(`update contacts set tags=$1, consent_email=$2, consent_source=case when $2='yes' and consent_email<>'yes' then $3 else consent_source end,
          consent_at=case when $2='yes' and consent_email<>'yes' then coalesce($4, now()) else consent_at end,
          email=coalesce(email,$5), phone=coalesce(phone,$6), company=coalesce(company,$7), full_name=coalesce(full_name,$8)
          where id=$9`, [tags, ce, src, r.consent_at, email, r.phone, r.company, r.full_name, c.id]);
        updated++;
      }
      if (!c.reg_id) await q('update contacts set reg_id=$1 where id=$2 and not exists (select 1 from contacts where reg_id=$1)', [r.id, c.id]);
    } else {
      if (brief && !okEmail) continue;     // an unconfirmed Brief signup is not a contact yet
      await q(`insert into contacts(company,full_name,role,email,phone,sector,country,tags,source,reg_id,client_type,consent_email,consent_source,consent_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict do nothing`,
        [r.company && r.company !== '-' ? r.company : null, r.full_name, r.job_title, email, r.phone, r.sector, r.country || 'Ghana', tag, src, r.id,
          /invest/i.test(r.category || '') ? 'investor' : /government|stakeholder/i.test(r.category || '') ? 'government' : /media/i.test(r.category || '') ? 'media' : null,
          okEmail ? 'yes' : 'unknown', okEmail ? src : null, okEmail ? (r.consent_at || r.created_at) : null]);
      added++;
    }
  }
  return { added, updated };
}

/* ---------- queries ---------- */
const ITEM_COLS = `i.code,i.kind,i.title,i.subtitle,i.venue,i.starts_at,i.ends_at,i.currency,i.price,i.per,i.capacity,
    i.approval,i.phase,i.audiences,i.slug,i.summary,i.description,i.cover,i.gallery,i.docs,i.agenda,i.speakers,
    case when i.capacity is null then null else greatest(i.capacity - coalesce((
      select sum(r.seats) from registrations r where r.item_code=i.code and r.status<>'cancelled'),0),0) end as seats_left`;
const itemsPublic = () => q(`select ${ITEM_COLS} from items i where i.published order by i.sort, i.starts_at`);

/* ---- "Ask Gotham": the website chat, answered by an OpenAI model ----
   Off until OPENAI_API_KEY is set on the server; the page then falls back to its built-in answers.
   Knowledge = assistant.md (edit in plain English) + the published forums from the database.
   Nothing the visitor types is stored. Per-visitor and per-day caps keep the bill bounded. */
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const OPENAI_BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const ASK_DAILY_CAP = +(process.env.ASK_DAILY_CAP || 400);
const askDay = { day: '', n: 0 };
let askKnow = { at: 0, text: '' };
/* Live exchange rates for the website and the invoice "Suggest rate" button. One source (open.er-api.com, updated
   daily from central-bank and market feeds), fetched at most once an hour and kept in settings, so a restart or an
   outage still shows the last good rates with their date. The page says it is a market rate, not the BoG rate. */
let fxMem = null;
async function liveRates(force = false) {
  if (!fxMem) { try { fxMem = JSON.parse((await q("select value from settings where key='fx_cache'")).rows[0]?.value || 'null'); } catch { fxMem = null; } }
  if (!force && fxMem && Date.now() - fxMem.fetched < 3600e3) return fxMem;
  try {
    const r = await fetch(`${process.env.FX_API || 'https://open.er-api.com/v6/latest'}/USD`, { signal: AbortSignal.timeout(8000) }); const j = await r.json();
    const g = +(j && j.rates && j.rates.GHS); if (!(g > 1) || !(+j.rates.EUR > 0) || !(+j.rates.GBP > 0)) throw new Error('bad rates');
    const r4 = n => Math.round(n * 10000) / 10000;
    fxMem = { base: 'GHS', rates: { USD: r4(g), EUR: r4(g / j.rates.EUR), GBP: r4(g / j.rates.GBP) },
      updated: j.time_last_update_utc ? new Date(j.time_last_update_utc).toISOString() : new Date().toISOString(), fetched: Date.now(),
      source: 'Market mid-rate (open.er-api.com). Official reference: Bank of Ghana.' };
    await q(`insert into settings(key,value) values ('fx_cache',$1) on conflict (key) do update set value=excluded.value`, [JSON.stringify(fxMem)]);
  } catch (e) { console.error('fx', e.message); if (fxMem) fxMem.fetched = Date.now() - 3000e3; }   // try again in ~10 minutes
  return fxMem;
}
async function askKnowledge() {
  if (Date.now() - askKnow.at < 5 * 60e3 && askKnow.text) return askKnow.text;
  let base = '';
  try { base = fs.readFileSync(path.join(here, 'assistant.md'), 'utf8'); } catch {}
  const { rows } = await itemsPublic();
  const when = d => d ? new Date(d).toLocaleString('en-GB', { timeZone: 'Africa/Accra', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'date to be announced';
  const up = rows.filter(r => r.phase !== 'past' && (!r.starts_at || new Date(r.starts_at) > Date.now() - 864e5));
  const forums = up.map(r => `- ${r.title}${r.subtitle ? ' — ' + r.subtitle : ''} (${r.code}): ${when(r.starts_at)} Accra time` +
    `${r.venue ? ', ' + r.venue : ''}; ${+r.price > 0 ? 'GHS ' + (+r.price).toLocaleString('en-GH') : 'free'}` +
    `${r.approval ? ', by invitation (apply on the registration page)' : ''}` +
    `${r.seats_left === 0 ? ', fully booked' : ''}. Register: gothamconsult.com/register?e=${r.code}`).join('\n');
  const fx = await liveRates().catch(() => null);
  const fxLine = fx ? `\n\n## Exchange rates (market mid-rate, updated ${String(fx.updated).slice(0, 10)}; the Bank of Ghana reference rate is the official one)\n` +
    Object.entries(fx.rates).map(([c, v]) => `- 1 ${c} = GHS ${v}`).join('\n') : '';
  askKnow = { at: Date.now(), text: base + fxLine + '\n\n## Upcoming forums and products (live from the back office)\n' + (forums || '- None published right now.') };
  return askKnow.text;
}
async function askModel(messages, opt = {}) {
  /* Works with any OpenAI-compatible chat API: OpenAI, Groq (OPENAI_BASE_URL=https://api.groq.com/openai/v1), Kimi…
     OPENAI_MODEL may list several models, comma-separated: when one is rate-limited (429) or down (5xx), the next is
     tried. On Groq's free tier each model has its own per-minute allowance, so this keeps answers flowing in bursts.
     Reasoning models get a low effort so answers stay fast; a rejected parameter is dropped and retried. */
  const models = OPENAI_MODEL.split(',').map(m => m.trim()).filter(Boolean);
  let last = '';
  for (const model of models) {
    const effort = process.env.OPENAI_REASONING || (/gpt-oss/.test(model) ? 'low' : /^(gpt-5|o\d)/.test(model) ? 'minimal' : '');
    let opts = { ...(opt.temperature != null ? { temperature: opt.temperature } : {}), max_completion_tokens: opt.max || 900, ...(effort ? { reasoning_effort: effort } : {}), ...(opt.json && !/gpt-oss/.test(model) ? { response_format: { type: 'json_object' } } : {}) };
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(OPENAI_BASE + '/chat/completions', {
        method: 'POST', signal: AbortSignal.timeout(25e3),
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + OPENAI_KEY },
        body: JSON.stringify({ model, messages, ...opts }) });
      if (r.ok) {
        const j = await r.json();
        if (opt.raw) return String(j.choices?.[0]?.message?.content || '').trim();
        /* the chat shows plain text: drop markdown marks the model may add anyway */
        return String(j.choices?.[0]?.message?.content || '')
          .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/^#{1,6}\s+/gm, '')
          .replace(/^\s*[*]\s+/gm, '• ').replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1 ($2)').trim();
      }
      const t = (await r.text()).slice(0, 300);
      if (r.status === 400 && opts.reasoning_effort && /reasoning/i.test(t)) { const { reasoning_effort, ...rest } = opts; opts = rest; continue; }
      if (r.status === 400 && opts.max_completion_tokens && /max_completion_tokens/i.test(t)) { const { max_completion_tokens, ...rest } = opts; opts = { ...rest, max_tokens: opt.max || 900 }; continue; }
      if (r.status === 400 && opts.response_format && /response_format|json/i.test(t)) { const { response_format, ...rest } = opts; opts = rest; continue; }
      last = 'ai ' + model + ' ' + r.status + ' ' + t;
      if (r.status === 429 || r.status >= 500) break;              // try the next model
      throw new Error(last);
    }
  }
  throw new Error(last || 'ai: no model answered');
}


/* The chat's buttons: the model ends a reply with [[register:F1]], [[lead]] or [[person]]; we check a
   forum code against what is really open, and a register link written in the answer counts too. */
async function chatActions(answer) {
  const tags = [...String(answer).matchAll(/\[\[\s*(register\s*:\s*([A-Za-z0-9]{1,12})|lead|person)\s*\]\]/gi)];
  let text = String(answer).replace(/\[\[[^\]]{0,40}\]\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const codes = new Set(tags.filter(t => t[2]).map(t => t[2].toUpperCase()));
  for (const m of text.matchAll(/register\?e=([A-Za-z0-9]{1,12})/g)) codes.add(m[1].toUpperCase());
  const actions = [];
  if (codes.size) {
    const { rows } = await itemsPublic();
    for (const code of codes) {
      const it = rows.find(r => r.code === code && r.phase !== 'past' && (!r.starts_at || new Date(r.starts_at) > Date.now() - 864e5));
      if (it && it.seats_left !== 0) actions.push({ type: 'register', code, title: it.title, approval: !!it.approval });
    }
  }
  if (tags.some(t => /^lead$/i.test(t[1]))) actions.push({ type: 'lead' });
  if (tags.some(t => /^person$/i.test(t[1]))) actions.push({ type: 'person' });
  return { text, actions: actions.slice(0, 3) };
}

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


/* ---------- Sign in with Google (OpenID Connect) ----------
   Only for people already in the team list: the Google account's verified email must match a
   sign-in an owner created. Nobody gets an account by signing in. State and PKCE protect the
   round trip; the ID token comes straight from Google's token endpoint over TLS and is checked
   for audience, issuer, expiry and a verified email. */
const G_ID = process.env.GOOGLE_CLIENT_ID || '', G_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const G_AUTH = process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const G_TOKEN = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const googleOn = () => !!(G_ID && G_SECRET);
const b64u = b => Buffer.from(b).toString('base64url');
const gSign = v => crypto.createHmac('sha256', SECRET).update('google:' + v).digest('base64url');
/* The state is also kept here for 10 minutes, single use: the WordPress bridge on gothamconsult.com
   only passes the sign-in cookie through, so on that road the cookie copy does not arrive. */
const GSTATE = new Map();
const gState = (req, state) => { if (/(?:^|;\s*)gc_g=/.test(String(req.headers.cookie || ''))) { const c = gCookie(req); return c && c.state === state ? (GSTATE.delete(state), c) : null; }
  const s = state && GSTATE.get(state); if (!s) return null; GSTATE.delete(state); return s.exp > Date.now() ? s : null; };
const gCookie = (req) => { const m = String(req.headers.cookie || '').match(/(?:^|;\s*)gc_g=([^;]+)/); if (!m) return null;
  const [v, sig] = decodeURIComponent(m[1]).split('.'); if (!v || !sig || gSign(v) !== sig) return null;
  try { const o = JSON.parse(Buffer.from(v, 'base64url').toString()); return o.exp > Date.now() ? o : null; } catch { return null; } };

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  /* The WordPress bridge on gothamconsult.com forwards visitors through its own server; it proves
     itself with PROXY_KEY and passes the visitor's real address, so rate limits stay per person. */
  const viaBridge = PROXY_KEY && req.headers['x-gc-proxy-key'] === PROXY_KEY;
  const ip = ((viaBridge && req.headers['x-gc-client-ip']) || req.headers['x-real-ip'] || req.socket.remoteAddress || '').toString().slice(0, 64);
  /* One address for everyone: pages asked for on an old host (www, the sslip test address)
     move to PUBLIC_URL. The API is left alone so older copies of the form keep working. */
  const host = String(req.headers.host || '').toLowerCase().split(':')[0];
  if ((req.method === 'GET' || req.method === 'HEAD') && REDIRECT_HOSTS.includes(host) && host !== CANON_HOST && !viaBridge
      && req.headers['sec-fetch-dest'] !== 'iframe'
      && !p.startsWith('/api/') && !p.startsWith('/media/') && !/^\/(assets|img|js)\//.test(p)) {   // static files are served here directly, faster than through the bridge
    res.writeHead(301, { location: PUBLIC_URL + req.url, 'cache-control': 'public, max-age=3600' }); return res.end();
  }
  /* addresses from the old WordPress site */
  /* the new design moved out of /v2 onto the main paths on 28 September 2026 */
  const OLD = { '/contact': '/about#contact', '/faq': '/about#contact', '/hello-world': '/',
    '/v2': '/', '/v2/services': '/services', '/v2/invest': '/invest', '/v2/mining': '/mining', '/v2/forums': '/forums', '/v2/about': '/about',
    '/index': '/',
    '/wp-admin': '/admin', '/wp-login.php': '/admin', '/feed': '/', '/wp-sitemap.xml': '/sitemap.xml', '/sample-page': '/' };
  const oldKey = p.replace(/\/+$/, '') || '/';
  if ((req.method === 'GET' || req.method === 'HEAD') && OLD[oldKey]) { res.writeHead(301, { location: OLD[oldKey] }); return res.end(); }
  if (req.method === 'GET' || req.method === 'HEAD') {
    /* one address per page for Google: www → gothamconsult.com (the bridge tells us the host), /about/ and /about.html → /about */
    const fwd = String(req.headers['x-forwarded-host'] || '').toLowerCase();
    if (viaBridge && fwd.startsWith('www.') && !p.startsWith('/api/')) { res.writeHead(301, { location: PUBLIC_URL + req.url, 'cache-control': 'public, max-age=3600' }); return res.end(); }
    if (p !== '/' && !/^\/(api|admin|media|assets|img|js|i|cal)(\/|$)/.test(p) && (/\/$/.test(p) || /\.html$/.test(p))) {
      const to = p.replace(/\/+$/, '').replace(/(\/index)?\.html$/, '') || '/';
      if (to !== p) { res.writeHead(301, { location: to + url.search, 'cache-control': 'public, max-age=3600' }); return res.end(); }
    }
  }
  const origin = req.headers.origin;
  const cors = origin && ORIGINS.includes(origin)
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
    if (p === '/api/health') {
      await q('select 1');
      return json(res, 200, { ok: true, database: 'ok' });
    }

    /* calendar files: the public events feed, one event, and each person's private feed */
    const mIcs = req.method === 'GET' && p.match(/^\/cal\/(?:(events)|event\/([A-Za-z0-9_-]{1,12})|([a-f0-9]{40}))\.ics$/);
    if (mIcs) {
      let name, entries, file = 'gotham.ics';
      if (mIcs[1] || mIcs[2]) {
        entries = await publicEvents(mIcs[2] ? mIcs[2].toUpperCase() : null);
        if (mIcs[2] && !entries.length) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
        name = mIcs[2] ? entries[0].title : 'Gotham Consult events'; file = mIcs[2] ? `gotham-${mIcs[2].toLowerCase()}.ics` : 'gotham-events.ics';
      } else {
        const cu = (await q('select email, role, name from users where cal_token=$1 and coalesce(active,true)', [mIcs[3]])).rows[0];
        if (!cu) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('This calendar link was reset or turned off.'); }
        const from = ymdOf(new Date(Date.now() - 31 * 864e5)), to = ymdOf(new Date(Date.now() + 366 * 864e5));
        entries = (await calEntries(cu, from, to, { mine: true, types: ['event', 'task', 'deal', 'campaign'] })).filter(e => !e.done && (e.type !== 'campaign' || e.movable));   // open tasks, next steps, events, scheduled campaigns
        name = 'Gotham · ' + (cu.name || cu.email.split('@')[0]);
      }
      const body = icsCalendar(name, entries, PUBLIC_URL + '/admin#cal');
      res.writeHead(200, { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': mIcs[3] ? 'private, max-age=300' : 'public, max-age=900',
        'content-disposition': `${mIcs[3] || mIcs[1] ? 'inline' : 'attachment'}; filename="${file}"`, 'x-robots-tag': 'noindex' });
      return res.end(body);
    }

    if (p === '/api/hit' && req.method === 'POST') {
      const ua = String(req.headers['user-agent'] || '');
      if (BOT_RE.test(ua) || sess || rateLimited(ip, 120, 600e3, 'hit')) { res.writeHead(204); return res.end(); }
      let b = {}; try { b = JSON.parse((await rawBody(req, 4000)).toString('utf8') || '{}'); } catch {}
      const pth = String(b.p || '').slice(0, 160);
      if (!/^\/[\w\-./]*$/.test(pth) || /^\/(admin|api|i)\b/.test(pth)) { res.writeHead(204); return res.end(); }
      let ref = null; try { const h = new URL(String(b.r || '')).hostname.replace(/^www\./, ''); if (h && !/gothamconsult\.com$|sslip\.io$|^127\.|localhost/.test(h)) ref = h.slice(0, 80); } catch {}
      const utm = String(b.u || '').replace(/[^\w\-./ ]/g, '').slice(0, 60) || null;
      const w = +b.w || 0, device = w && w < 700 ? 'phone' : w && w < 1100 ? 'tablet' : 'desktop';
      const lang = ['en', 'fr', 'es'].includes(b.l) ? b.l : 'en';
      await q("insert into page_hits(path, ref, utm, device, lang, visitor, kind) values ($1,$2,$3,$4,$5,$6,'view')",
        [pth.replace(/\/+$/, '') || '/', ref, utm, device, lang, visitorHash(ip, ua)]);
      res.writeHead(204); return res.end();
    }
    if (p === '/api/web-stats' && req.method === 'GET') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const days = Math.max(1, Math.min(400, +url.searchParams.get('days') || 30));
      const W = `day > current_date - $1::int`;
      const one = async (sql) => (await q(sql, [days])).rows;
      const [tot] = await one(`select count(*) filter (where kind='view')::int views, count(*) filter (where kind='enquiry')::int enquiries,
        (select count(*)::int from (select distinct day, visitor from page_hits where ${W} and kind='view') x) visitors from page_hits where ${W}`);
      const series = await one(`select to_char(day,'YYYY-MM-DD') d, count(distinct visitor) filter (where kind='view')::int visitors, count(*) filter (where kind='view')::int views,
        count(*) filter (where kind='enquiry')::int enquiries from page_hits where ${W} group by day order by day`);
      const pages = await one(`select path, count(*) filter (where kind='view')::int views, count(distinct (day, visitor)) filter (where kind='view')::int visitors,
        count(*) filter (where kind='enquiry')::int enquiries from page_hits where ${W} group by path order by views desc limit 25`);
      const sources = await one(`select coalesce(utm, ref, 'Direct / unknown') src, count(distinct (day, visitor))::int visitors from page_hits where ${W} and kind='view' group by 1 order by 2 desc limit 15`);
      const devices = await one(`select device k, count(distinct (day, visitor))::int n from page_hits where ${W} and kind='view' group by 1 order by 2 desc`);
      const langs = await one(`select lang k, count(distinct (day, visitor))::int n from page_hits where ${W} and kind='view' group by 1 order by 2 desc`);
      const enq = await one(`select what k, count(*)::int n from page_hits where ${W} and kind='enquiry' group by 1 order by 2 desc`);
      return json(res, 200, { days, totals: tot, series, pages, sources, devices, langs, enquiries: enq });
    }
    if (p === '/api/rates' && req.method === 'GET') {
      const fx = await liveRates();
      if (!fx) { res.setHeader('cache-control', 'public, max-age=300'); return json(res, 200, { rates: null, unavailable: true }, cors); }   // the page simply hides the rates
      res.setHeader('cache-control', 'public, max-age=900');
      return json(res, 200, { base: fx.base, rates: fx.rates, updated: fx.updated, source: fx.source }, cors);
    }
    if (p === '/api/items' && req.method === 'GET') {
      const { rows } = await itemsPublic();
      const full = await withMedia(rows);
      const s = await q("select key,value from settings where key = any($1)", [['max_seats', 'momo_number', 'momo_name', 'whatsapp', 'pay_link']]);   // public: never bank details or tax numbers
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
    if (p === '/api/ask' && req.method === 'POST') {
      if (!OPENAI_KEY) return json(res, 200, { fallback: true, actions: [{ type: 'person' }] }, cors);
      if (rateLimited(ip, 20, 3600e3, 'ask')) return json(res, 429, { error: 'too_many' }, cors);
      const today = new Date().toISOString().slice(0, 10);
      if (askDay.day !== today) { askDay.day = today; askDay.n = 0; }
      if (askDay.n >= ASK_DAILY_CAP) return json(res, 200, { fallback: true, reason: 'daily_cap' }, cors);
      const b = await body(req);
      const question = clean(b.q, 600);
      if (!question) return json(res, 400, { error: 'missing_question' }, cors);
      const selectedLanguage = ({ en: 'English', fr: 'French', es: 'Spanish' })[b.language] || '';
      const history = (Array.isArray(b.history) ? b.history : []).slice(-6)
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map(m => ({ role: m.role, content: m.content.slice(0, 1200) }));
      askDay.n++;
      const system = `You are "Ask Gotham", the assistant on the Gotham Consult website (Accra, Ghana).
Answer only from the knowledge below. Be warm, clear and brief: at most about 120 words, plain text, no markdown headings.
Language: reply in the language of the visitor's last message. A question written in English always gets an answer in English only. ${selectedLanguage && selectedLanguage !== 'English' ? `The selected website language is ${selectedLanguage}; if the message could be either, use ${selectedLanguage}. ` : ''}If the visitor writes in a Ghanaian language (Twi, Fante, Ga, Ewe, Dagbani, Hausa, Pidgin and others),
answer in that language as well as you can, keeping names, dates, prices and links exactly as given, then add one short
line in simple English with the key facts, because your Ghanaian-language writing may be imperfect. Do not mix up
Ga and Twi. Plain text only: no markdown, no asterisks. Always state our prices in Ghana cedis (GHS); if asked for dollars or euros, give the GHS price and say clients abroad can be invoiced in dollars, euros or pounds and pay by bank transfer.
Numbers: only use prices, fees, dates, rates and durations that appear word for word in the knowledge below. Never estimate or round a fee.
Do not invent prices, dates, people or services; if the answer is not below, say our team will answer on WhatsApp (+233 55 041 6627).
When one of our guides (gothamconsult.com/insights/...) covers the question, mention it at the end.
You give general information, not legal, tax or investment advice; for their specific case, suggest a call or WhatsApp.
Never ask the visitor to type personal details (name, phone, email) in the chat.
At the very end of your reply you may add ONE tag on its own line, and the page turns it into a button (never mention the tag):
[[register:CODE]] when they want to attend one of the forums listed below (CODE is the forum's code in brackets);
[[lead]] when they want a quote, a proposal, a call, a meeting, help with their own case, or to be contacted;
[[person]] when they ask for a human, are unhappy or in a hurry, or you cannot answer from the knowledge below.
Stay on Gotham Consult, doing business and investing in Ghana; politely decline anything else.

${await askKnowledge()}`;
      try {
        const answer = await askModel([{ role: 'system', content: system }, ...history, { role: 'user', content: question }], { temperature: 0.2 });
        if (!answer) return json(res, 200, { fallback: true, actions: [{ type: 'person' }] }, cors);
        const { text, actions } = await chatActions(answer);
        return json(res, 200, { answer: text.slice(0, 2000), actions }, cors);
      } catch (e) {
        console.error('ask failed:', String(e.message || e).slice(0, 300));
        return json(res, 200, { fallback: true }, cors);
      }
    }

    /* "Leave your details" in the chat: the visitor chooses to; it becomes a lead with a task for tomorrow */
    if (p === '/api/chat-lead' && req.method === 'POST') {
      if (rateLimited(ip, 5, 600e3, 'chatlead')) return json(res, 429, { error: 'too_many' }, cors);
      const b = await body(req);
      const name = clean(b.name, 120), company = clean(b.company, 160), need = clean(b.need, 600), reach = clean(b.contact, 160);
      const email = /^\S+@\S+\.\S+$/.test(reach) ? reach.toLowerCase() : '', phone = email ? '' : phoneGH(reach);
      if (!name || (!email && String(phone).replace(/\D/g, '').length < 9)) return json(res, 400, { error: 'missing_fields' }, cors);
      if (b.consent !== true) return json(res, 400, { error: 'consent_required' }, cors);
      const dealId = await inboundDeal({ company: company || null, full_name: name, email: email || null, phone: phone || null, kind: 'consulting',
        title: `${company || name} · website chat`, source: 'Website chat', task: `Reply to ${firstName(name)} from the website chat${need ? ': ' + need.slice(0, 120) : ''}` });
      if (dealId) {
        const c = (await q('select contact_id from deals where id=$1', [dealId])).rows[0];
        if (c && c.contact_id) {
          await q(`update contacts set tags=$2, phone=coalesce(phone, nullif($3,'')) where id=$1`, [c.contact_id, mergeTags((await q('select tags from contacts where id=$1', [c.contact_id])).rows[0]?.tags, ['chat-lead']), phone]);
          await q("insert into notes(contact_id,deal_id,kind,body,author) values ($1,$2,'note',$3,'website chat')", [c.contact_id, dealId,
            `Asked on the website chat to be contacted about: ${need || '(not said)'}` + (b.question ? `\nLast question: ${clean(b.question, 600)}` : '') + (b.language && b.language !== 'en' ? `\nLanguage: ${clean(b.language, 5)}` : '')]);
        }
      }
      webEnquiry(req, ip, 'chat').catch(() => {});
      return json(res, 200, { ok: true }, cors);
    }

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
           <p style="color:#5A6472;font-size:15px">If it is urgent, WhatsApp or call +233 55 041 6627.</p>`),
        'sponsor_ack', null);
      await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', ['website', 'sponsor_enquiry', company + ' · ' + (b.tier || 'no tier')]);
      await inboundDeal({ company, full_name: clean(b.contact_name, 120), email, phone: phoneGH(clean(b.phone, 40)), kind: 'sponsorship',
        title: `${company} · ${b.tier ? b.tier + ' sponsorship' : 'sponsorship'}`, source: 'Website sponsor enquiry', sponsor_lead_id: rows[0].id,
        task: `Send the sponsorship pack to ${clean(b.contact_name, 120) || company}` }).catch(e => console.error('inboundDeal', e.message));
      webEnquiry(req, ip, 'sponsor').catch(() => {});
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
      await inboundDeal({ full_name, email, phone, kind: 'family_desk', title: `Family Desk · ${full_name} (${region})`,
        source: 'Website Family Desk list', task: `Call ${firstName(full_name)} about Family Desk (${country})` }).catch(e => console.error('inboundDeal', e.message));
      webEnquiry(req, ip, 'family').catch(() => {});
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
      let it, category, seats, amount, method, status, reg;
      const client = await pool.connect();
      try {
      await client.query('begin');
      // Serialize reservations for an event so simultaneous requests cannot take the same last seats.
      it = (await client.query('select * from items where code=$1 and published for update', [clean(b.item_code, 12)])).rows[0];
      if (!it) { await client.query('rollback'); return json(res, 400, { error: 'unknown_item' }, cors); }
      if (it.phase === 'past') { await client.query('rollback'); return json(res, 409, { error: 'closed' }, cors); }
      const categoryIn = clean(b.category, 60);
      // An unrecognised or missing "attending as" no longer blocks anyone; staff see it blank and ask.
      category = it.audiences && !it.audiences.split(',').map(x => x.trim()).includes(categoryIn) ? '' : categoryIn;
      seats = it.kind === 'event' ? Math.max(1, Math.min(10, parseInt(b.seats) || 1)) : 1;
      if (it.capacity !== null) {
        const used = (await client.query(`select coalesce(sum(seats),0)::int n from registrations
          where item_code=$1 and status<>'cancelled'`, [it.code])).rows[0].n;
        if (it.capacity - used < seats) { await client.query('rollback'); return json(res, 409, { error: 'sold_out' }, cors); }
      }
      amount = Number(it.price) * seats;
      method = amount === 0 ? 'free' : (['momo', 'invoice', 'online'].includes(b.payment_method) ? b.payment_method : 'momo');
      const r = ref(it.code);
      status = it.approval ? 'pending' : (amount === 0 ? 'confirmed' : 'new');
      const { rows } = await client.query(`insert into registrations
        (reference,item_code,company,reg_no,full_name,job_title,email,phone,country,sector,seats,guests,currency,amount,
         payment_method,paid,status,consent_at,marketing_opt_in,ip,category,utm_source,utm_campaign,
         confirm_token,unsub_token,ticket_code)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now(),$18,$19,$20,$21,$22,$23,$24,$25)
        returning id,reference,ticket_code,confirm_token,unsub_token`,
        [r, it.code, company, clean(b.reg_no, 60), full_name, clean(b.job_title, 80), email || null, phone, clean(b.country, 60),
          clean(b.sector, 60), seats, clean(Array.isArray(b.guests) ? b.guests.join('\n') : b.guests, 1000), it.currency, amount,
          method, amount === 0, status, b.marketing_opt_in === true, ip, category, clean(b.utm_source, 60), clean(b.utm_campaign, 60),
          tok(), tok(), ticket()]);
      reg = rows[0];
      await client.query('insert into activity(reg_id,actor,action,detail) values ($1,$2,$3,$4)', [reg.id, 'website', 'registered', it.title]);
      await client.query('commit');
      } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
      } finally { client.release(); }

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
        /* a follow-up task for the day after the event, so a "yes" is never forgotten */
        const cid = (email ? (await q('select id,status from contacts where lower(email)=lower($1)', [email])).rows[0]
                           : (await q('select id,status from contacts where phone=$1 order by id desc limit 1', [phone])).rows[0]);
        if (cid && cid.status !== 'do_not_contact')
          await q(`insert into tasks(title,due_at,contact_id,reg_id,created_by,priority)
                   values ($1, coalesce(date_trunc('day',$2::timestamptz),date_trunc('day',now())) + interval '1 day 10 hours', $3, $4, 'website', $5)`,
            [`Follow up: ${full_name} said ${follow} at ${it.title}`, it.starts_at, cid.id, reg.id, follow === 'yes' ? 'high' : 'normal']);
      }

      if (method === 'invoice' && amount > 0) await draftFromRegistration(reg, it, { full_name, company, email, phone, country: clean(b.country, 60), seats, amount }).catch(e => console.error('draft invoice', e.message));
      const confirmUrl = BASE + '/confirm/' + reg.confirm_token;
      const unsubUrl = BASE + '/unsubscribe/' + reg.unsub_token;
      const paymentSettings = Object.fromEntries((await q("select key,value from settings where key in ('momo_number','momo_name')")).rows.map(x => [x.key, x.value]));
      const paymentDetails = { number: paymentSettings.momo_number || '+233550416627', account_name: paymentSettings.momo_name || 'Gotham Consult' };
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
               `<p style="color:#5A6472;font-size:15px">Your place is held for 24 hours while payment is confirmed.</p>${method === 'momo' ? `<p style="color:#5A6472;font-size:15px">Send ${it.currency} ${amount} by mobile money to <b>${esc(paymentDetails.number)}</b> (${esc(paymentDetails.account_name)}). Use reference <b>${reg.reference}</b>, then send us the transaction ID on WhatsApp. We confirm your place after we verify receipt.</p>` : ''}`}`),
          paidNow ? 'ticket' : 'registration_received', reg.id);
      }
      flushMail().catch(() => {});
      webEnquiry(req, ip, 'register').catch(() => {});
      return json(res, 200, { reference: reg.reference, amount, currency: it.currency, paid: amount === 0,
        status, approval: !!it.approval, double_optin: it.code === 'BRIEF',
        payment_details: method === 'momo' && amount > 0 ? {
          method: 'momo', number: paymentDetails.number,
          account_name: paymentDetails.account_name, transaction_reference: reg.reference
        } : null }, cors);
    }

    if (p === '/api/payment-reported' && req.method === 'POST') {
      if (rateLimited(ip, 10)) return json(res, 429, { error: 'too_many' }, cors);
      const b = await body(req);
      const txn = clean(b.txn, 80), network = clean(b.network, 20);
      if (!/^[A-Za-z0-9._-]{4,80}$/.test(txn)) return json(res, 400, { error: 'transaction_id_required' }, cors);
      if (!['MTN','Telecel','AirtelTigo'].includes(network)) return json(res, 400, { error: 'invalid_network' }, cors);
      const client = await pool.connect();
      try {
        await client.query('begin');
        const r = (await client.query(`select id,amount,paid,status,payment_method from registrations
          where reference=$1 for update`, [clean(b.reference, 40).toUpperCase()])).rows[0];
        if (!r) { await client.query('rollback'); return json(res, 404, { error: 'unknown_reference' }, cors); }
        if (r.payment_method !== 'momo' || Number(r.amount) <= 0)
          { await client.query('rollback'); return json(res, 409, { error: 'momo_payment_not_applicable' }, cors); }
        if (r.paid || ['pending','cancelled','declined','attended'].includes(r.status))
          { await client.query('rollback'); return json(res, 409, { error: 'payment_not_due' }, cors); }
        const duplicate = await client.query(`select id from registrations where id<>$1 and lower(payment_ref)=lower($2) limit 1`, [r.id, txn]);
        if (duplicate.rowCount) { await client.query('rollback'); return json(res, 409, { error: 'transaction_already_reported' }, cors); }
        await client.query('insert into payment_reports(reg_id,network,transaction_id,phone) values ($1,$2,$3,$4)',
          [r.id, network, txn, phoneGH(clean(b.phone, 40))]);
        await client.query('update registrations set payment_ref=$1,payment_note=$2,updated_at=now() where id=$3',
          [txn, network + (b.phone ? ' ' + phoneGH(clean(b.phone, 40)) : ''), r.id]);
        await client.query('insert into activity(reg_id,actor,action,detail) values ($1,$2,$3,$4)',
          [r.id, 'customer', 'payment_reported', network + ' · ' + txn]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback').catch(() => {});
        if (err.code === '23505') return json(res, 409, { error: 'transaction_already_reported' }, cors);
        throw err;
      } finally { client.release(); }
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
    /* ---- Sign in with Google ---- */
    if (p === '/api/auth/options') return json(res, 200, { google: googleOn() });
    if (p === '/auth/google' && req.method === 'GET') {
      if (!googleOn()) { res.writeHead(302, { location: '/admin?google=off' }); return res.end(); }
      if (rateLimited(ip, 20, 300e3, 'google')) { res.writeHead(302, { location: '/admin?google=busy' }); return res.end(); }
      const state = b64u(crypto.randomBytes(18)), verifier = b64u(crypto.randomBytes(32));
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      const v = b64u(JSON.stringify({ state, verifier, exp: Date.now() + 10 * 60e3 }));
      for (const [k, x] of GSTATE) if (x.exp < Date.now() || GSTATE.size > 2000) GSTATE.delete(k);
      GSTATE.set(state, { state, verifier, exp: Date.now() + 10 * 60e3 });
      const u = new URL(G_AUTH);
      Object.entries({ client_id: G_ID, redirect_uri: PUBLIC_URL + '/auth/google/callback', response_type: 'code', scope: 'openid email profile',
        state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' }).forEach(([k, x]) => u.searchParams.set(k, x));
      res.writeHead(302, { location: u.href, 'cache-control': 'no-store',
        'set-cookie': `gc_g=${encodeURIComponent(v + '.' + gSign(v))}; HttpOnly; Path=/auth/google; Max-Age=600; SameSite=Lax; Secure` });
      return res.end();
    }
    if (p === '/auth/google/callback' && req.method === 'GET') {
      const back = why => { res.writeHead(302, { location: '/admin?google=' + why, 'cache-control': 'no-store', 'set-cookie': 'gc_g=; Path=/auth/google; Max-Age=0' }); return res.end(); };
      if (!googleOn()) return back('off');
      if (url.searchParams.get('error')) { gState(req, url.searchParams.get('state')); return back('cancelled'); }
      const st = gState(req, url.searchParams.get('state')), code = url.searchParams.get('code');
      if (!st || !code) return back('expired');
      let claims;
      try {
        const r = await fetch(G_TOKEN, { method: 'POST', signal: AbortSignal.timeout(15e3), headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: G_ID, client_secret: G_SECRET, redirect_uri: PUBLIC_URL + '/auth/google/callback', grant_type: 'authorization_code', code_verifier: st.verifier }) });
        const t = await r.json();
        if (!r.ok || !t.id_token) throw new Error('token ' + r.status);
        claims = JSON.parse(Buffer.from(String(t.id_token).split('.')[1], 'base64url').toString());
      } catch (e) { console.error('google sign-in', e.message); return back('failed'); }
      const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!auds.includes(G_ID) || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) || !(claims.exp * 1000 > Date.now())
        || !(claims.email_verified === true || claims.email_verified === 'true') || !claims.email) return back('failed');
      const u = (await q('select * from users where lower(email)=lower($1) and coalesce(active,true)', [claims.email])).rows[0];
      if (!u) { await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [String(claims.email).slice(0, 120), 'google_refused', 'not in the team list']); return back('not_in_team'); }
      await q('update users set last_login=now() where id=$1', [u.id]);
      await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, 'login_google', 'signed in with Google']);
      res.writeHead(302, { location: '/admin', 'cache-control': 'no-store', 'set-cookie': [
        `gc_session=${makeToken(u)}; HttpOnly; Path=/; Max-Age=43200; SameSite=Lax; Secure`, 'gc_g=; Path=/auth/google; Max-Age=0'] });
      return res.end();
    }

    if (p === '/api/login' && req.method === 'POST') {
      if (rateLimited(ip, 8, 300e3, 'login')) return json(res, 429, { error: 'too_many' });
      const b = await body(req);
      const u = (await q('select * from users where email=$1 and coalesce(active,true)', [clean(b.email).toLowerCase()])).rows[0];
      const ok = u && crypto.timingSafeEqual(Buffer.from(hash(String(b.password || ''), u.pw_salt)), Buffer.from(u.pw_hash));
      if (!ok) return json(res, 401, { error: 'bad_login' });
      if (u.totp_on) {   // second step: a short-lived ticket, no session yet
        const t = b64(JSON.stringify({ id: u.id, sv: u.sv || 0, kind: 'totp', exp: Date.now() + 5 * 60e3 }));
        return json(res, 200, { need_code: true, ticket: t + '.' + sign(t) });
      }
      await q('update users set last_login=now() where id=$1', [u.id]);
      return json(res, 200, { name: u.name, email: u.email, role: u.role, must_change: u.must_change },
        { 'set-cookie': `gc_session=${makeToken(u)}; HttpOnly; Path=/; Max-Age=43200; SameSite=Lax; Secure` });
    }
    if (p === '/api/login/code' && req.method === 'POST') {
      if (rateLimited(ip, 10, 300e3, 'login_code')) return json(res, 429, { error: 'too_many' });
      const b = await body(req), t = readToken(String(b.ticket || ''));
      if (!t || t.kind !== 'totp') return json(res, 401, { error: 'expired' });
      const u = (await q('select * from users where id=$1 and coalesce(active,true)', [t.id])).rows[0];
      if (!u || !u.totp_on || (u.sv || 0) !== (t.sv || 0)) return json(res, 401, { error: 'expired' });
      const secret = totpOpen(u.totp_secret); let okc = false;
      const step = secret ? totpCheck(secret, b.code, +u.totp_last || 0) : 0;
      if (step) { okc = true; await q('update users set totp_last=$2 where id=$1', [u.id, step]); }
      else if (/[A-Za-z]/.test(String(b.code || ''))) {   // a recovery code: works once
        const h = recHash(b.code), list = Array.isArray(u.totp_recovery) ? u.totp_recovery : [];
        if (list.includes(h)) { okc = true; await q('update users set totp_recovery=$2 where id=$1', [u.id, JSON.stringify(list.filter(x => x !== h))]);
          await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, 'login_recovery_code', `${list.length - 1} recovery codes left`]); }
      }
      if (!okc) return json(res, 401, { error: 'bad_code' });
      await q('update users set last_login=now() where id=$1', [u.id]);
      return json(res, 200, { name: u.name, email: u.email, role: u.role, must_change: u.must_change },
        { 'set-cookie': `gc_session=${makeToken(u)}; HttpOnly; Path=/; Max-Age=43200; SameSite=Lax; Secure` });
    }
    /* setting up two-step sign-in for yourself */
    if (p === '/api/2fa' && req.method === 'GET') {
      const u = auth(); if (!u) return json(res, 401, { error: 'no_session' });
      const r = (await q('select totp_on, totp_recovery from users where id=$1', [u.id])).rows[0];
      return json(res, 200, { on: !!r.totp_on, recovery_left: Array.isArray(r.totp_recovery) ? r.totp_recovery.length : 0 });
    }
    if (p === '/api/2fa/setup' && req.method === 'POST') {
      const u = auth(); if (!u) return json(res, 401, { error: 'no_session' });
      const r = (await q('select totp_on from users where id=$1', [u.id])).rows[0]; if (r.totp_on) return json(res, 400, { error: 'already_on' });
      const secret = b32enc(crypto.randomBytes(20));
      await q('update users set totp_secret=$2 where id=$1', [u.id, totpSeal(secret)]);
      const uri = `otpauth://totp/${encodeURIComponent('Gotham CRM:' + u.email)}?secret=${secret}&issuer=${encodeURIComponent('Gotham CRM')}&algorithm=SHA1&digits=6&period=30`;
      return json(res, 200, { secret, uri, qr: await qrSvg(uri) });
    }
    if (p === '/api/2fa/enable' && req.method === 'POST') {
      const u = auth(); if (!u) return json(res, 401, { error: 'no_session' });
      if (rateLimited(ip, 10, 300e3, '2fa')) return json(res, 429, { error: 'too_many' });
      const b = await body(req), r = (await q('select totp_secret, totp_on from users where id=$1', [u.id])).rows[0];
      const secret = r && totpOpen(r.totp_secret); if (!secret || r.totp_on) return json(res, 400, { error: 'start_again' });
      const step = totpCheck(secret, b.code); if (!step) return json(res, 400, { error: 'bad_code' });
      const codes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex').toUpperCase().replace(/(.{5})(.{5})/, '$1-$2'));
      await q('update users set totp_on=true, totp_last=$2, totp_recovery=$3 where id=$1', [u.id, step, JSON.stringify(codes.map(recHash))]);
      await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, '2fa_on', 'two-step sign-in turned on']);
      return json(res, 200, { ok: true, recovery_codes: codes });
    }
    if (p === '/api/2fa/disable' && req.method === 'POST') {
      const u = auth(); if (!u) return json(res, 401, { error: 'no_session' });
      if (rateLimited(ip, 10, 300e3, '2fa')) return json(res, 429, { error: 'too_many' });
      const b = await body(req), r = (await q('select * from users where id=$1', [u.id])).rows[0];
      const pwOk = crypto.timingSafeEqual(Buffer.from(hash(String(b.password || ''), r.pw_salt)), Buffer.from(r.pw_hash));
      const secret = totpOpen(r.totp_secret);
      if (!pwOk || !secret || !totpCheck(secret, b.code, +r.totp_last || 0)) return json(res, 400, { error: 'bad_code' });
      await q('update users set totp_on=false, totp_secret=null, totp_recovery=null, totp_last=null where id=$1', [u.id]);
      await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, '2fa_off', 'two-step sign-in turned off']);
      return json(res, 200, { ok: true });
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
        where paid and amount>0 and status<>'cancelled' group by currency`);
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
        const c = (await q('select cta_url, template, blocks from campaigns where id=$1', [rows[0].campaign_id])).rows[0];
        const li = parseInt(url.searchParams.get('l'));
        if (c && c.template === 'designer') { const u = designerLinks(c.blocks)[li]; if (u) to = u; }   // only links that are in the email
        else if (c && c.cta_url) to = c.cta_url;
      }
      res.writeHead(302, { location: to });
      return res.end();
    }

    /* one click and we never write to them again on that channel (email also answers mail clients' one-click POST) */
    const mUnsub2 = p.match(/^\/u\/([A-Za-z0-9_-]{10,})$/);
    if (mUnsub2 && (req.method === 'GET' || req.method === 'POST')) {
      const s0 = (await q('select contact_id, channel from campaign_sends where token=$1', [mUnsub2[1]])).rows[0];
      let rows = [];
      if (s0) {
        const ch = s0.channel || 'email';
        rows = (await q(ch === 'sms' ? `update contacts set sms_unsub_at=coalesce(sms_unsub_at,now()), consent_sms='no' where id=$1 returning company, full_name`
          : ch === 'whatsapp' ? `update contacts set whatsapp_unsub_at=coalesce(whatsapp_unsub_at,now()), consent_whatsapp='no' where id=$1 returning company, full_name`
          : `update contacts set unsubscribed_at=coalesce(unsubscribed_at,now()), consent_email='no' where id=$1 returning company, full_name`, [s0.contact_id])).rows;
        await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', ['recipient', 'unsubscribe_' + ch, String(s0.contact_id)]);
      }
      if (req.method === 'POST') return json(res, 200, { ok: true });
      const what = s0 && s0.channel === 'sms' ? 'text messages' : s0 && s0.channel === 'whatsapp' ? 'WhatsApp messages' : 'emails';
      return sendHtml(pageShell('Removed', rows[0]
        ? `<h1>Done, no more ${what} from us</h1><p>${esc(rows[0].company || rows[0].full_name || 'You')} has been removed from this list. Nothing further will be sent this way.</p>`
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
  <div class="brand">Gotham Consult <span>Accra, Ghana</span></div>
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
  <div class="foot"><span>WhatsApp or call +233 55 041 6627</span><span>${esc(SITE_URL.replace(/^https?:\/\//, ''))}</span></div>
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
      return json(res, 200, { rows, sending_enabled: !!mailVia(), via: mailVia(), hourly_limit: MAIL_HOURLY });
    }

    /* which channels can send by themselves, and what is waiting to be sent by hand */
    if (p === '/api/channels' && req.method === 'GET') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const lastHour = (await q("select count(*)::int as n from outbox where status='sent' and sent_at > now() - interval '1 hour'")).rows[0].n;
      const waiting = (await q(`select channel, count(*)::int as n from msg_outbox where status='queued' group by channel`)).rows;
      const mailWaiting = (await q("select count(*)::int as n from outbox where status='queued'")).rows[0].n;
      const lastDay = (await q("select count(*)::int as n from outbox where status='sent' and sent_at > now() - interval '24 hours'")).rows[0].n;
      const lastFail = (await q("select error from outbox where status='failed' order by id desc limit 1")).rows[0];
      return json(res, 200, { email: { via: mailVia(), from: FROM, hourly_limit: MAIL_HOURLY, daily_limit: MAIL_DAILY, sent_last_hour: lastHour, sent_last_day: lastDay,
          waiting: mailWaiting, last_error: lastFail ? String(lastFail.error || '').slice(0, 200) : null },
        sms: { ready: smsReady(), sender: process.env.SMS_SENDER_ID || 'GOTHAM', waiting: (waiting.find(w => w.channel === 'sms') || {}).n || 0 },
        whatsapp: { ready: waReady(), waiting: (waiting.find(w => w.channel === 'whatsapp') || {}).n || 0 } });
    }
    if (p === '/api/messages' && req.method === 'GET') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const { rows } = await q(`select id,channel,to_phone,to_name,body,template,status,error,kind,created_at,sent_at from msg_outbox
        order by case status when 'queued' then 0 when 'failed' then 1 else 2 end, id desc limit 300`);
      return json(res, 200, { rows });
    }
    const mMsg = p.match(/^\/api\/messages\/(\d+)\/(sent|cancelled|retry)$/);
    if (mMsg && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const st = mMsg[2] === 'retry' ? 'queued' : mMsg[2];
      await q("update msg_outbox set status=$1, error=null, sent_at=case when $1='sent' then now() else sent_at end where id=$2", [st, +mMsg[1]]);
      await q("update campaign_sends set status=$1 where msg_id=$2", [st === 'queued' ? 'sending' : st === 'cancelled' ? 'skipped' : 'sent', +mMsg[1]]);
      if (st === 'queued') await flushMessages(5);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/contacts/sync' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      return json(res, 200, await syncRegistrations());
    }

    /* WhatsApp Business webhook: Meta checks the address once, then reports deliveries and replies (STOP = opt out) */
    if (p === '/api/hooks/whatsapp' && req.method === 'GET') {
      const sp = new URL(req.url, 'http://x').searchParams;
      if (process.env.WHATSAPP_VERIFY_TOKEN && sp.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) {
        res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(String(sp.get('hub.challenge') || ''));
      }
      return json(res, 403, { error: 'bad_token' });
    }
    if (p === '/api/hooks/whatsapp' && req.method === 'POST') {
      const raw = await rawBody(req, 1e6);
      const secret = process.env.WHATSAPP_APP_SECRET;
      if (secret) {
        const want = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
        const got = String(req.headers['x-hub-signature-256'] || '');
        if (got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) return json(res, 401, { error: 'bad_signature' });
      } else return json(res, 503, { error: 'not_configured' });
      let d = {}; try { d = JSON.parse(raw.toString('utf8')); } catch {}
      const inbound = [];
      for (const e of d.entry || []) for (const ch of e.changes || []) {
        const v = ch.value || {};
        for (const st of v.statuses || []) {
          const m = (await q("update msg_outbox set status=case when $1 in ('delivered','read') then 'delivered' when $1='failed' then 'failed' else status end, error=case when $1='failed' then $3 else error end where provider_id=$2 returning id",
            [st.status, st.id, JSON.stringify(st.errors || '').slice(0, 300)])).rows[0];
          if (m && (st.status === 'delivered' || st.status === 'read')) await q("update campaign_sends set status='delivered', delivered_at=coalesce(delivered_at,now()) where msg_id=$1", [m.id]);
          if (m && st.status === 'failed') await q("update campaign_sends set status='failed', error=$2 where msg_id=$1", [m.id, 'whatsapp: ' + (st.errors && st.errors[0] && st.errors[0].title || 'failed')]);
        }
        const names = Object.fromEntries((v.contacts || []).map(k => [k.wa_id, k.profile && k.profile.name]));
        for (const msg of v.messages || []) inbound.push([msg, names[msg.from]]);
        for (const msg of v.messages || []) {
          const text = String((msg.text && msg.text.body) || (msg.button && msg.button.text) || '').trim().toLowerCase();
          if (/^(stop|unsubscribe|stop all|opt out|cancel)$/.test(text)) {
            const ph = phoneGH('+' + String(msg.from || '').replace(/\D/g, ''));
            await q("update contacts set whatsapp_unsub_at=coalesce(whatsapp_unsub_at,now()), consent_whatsapp='no' where coalesce(nullif(whatsapp,''), phone)=$1", [ph]);
            await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', ['recipient', 'unsubscribe_whatsapp', ph]);
          }
        }
      }
      json(res, 200, { ok: true });                                  // answer Meta at once; the AI reply follows
      for (const [m, name] of inbound) await waInbound(m, name).catch(e => console.error('wa inbound', e.message));
      return;
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
      /* the same email address can only be on one record, so that case always points to the existing one */
      if (dup.rows.length && (email || b.confirm_duplicate !== true))
        return json(res, 409, { error: 'already_there', id: dup.rows[0].id, same_email: !!email,
          who: dup.rows[0].company || dup.rows[0].full_name });
      const cons = v => ['yes','no','unknown'].includes(v) ? v : 'unknown';
      const anyYes = [b.consent_email, b.consent_sms, b.consent_whatsapp].includes('yes');
      const { rows } = await q(`insert into contacts(company,full_name,role,email,phone,sector,city,country,
          website,priority,tags,notes,source,status,unsubscribed_at,client_type,language,whatsapp,
          consent_email,consent_sms,consent_whatsapp,consent_source,consent_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
          case when $14::text = 'do_not_contact' then now() else null end,$15,$16,$17,$18,$19,$20,$21,$22) returning id`,
        [company, full_name, clean(b.role, 140), email || null, phoneGH(clean(b.phone, 60)),
          clean(b.sector, 60), clean(b.city, 80), clean(b.country, 60) || 'Ghana',
          clean(b.website, 200), clean(b.priority, 40), clean(b.tags, 200), clean(b.notes, 4000),
          clean(b.source, 120) || 'added by hand',
          ['new','contacted','replied','meeting','won','lost','do_not_contact'].includes(b.status) ? b.status : 'new',
          CLIENT_TYPES.includes(b.client_type) ? b.client_type : null, clean(b.language, 10) || 'en',
          b.whatsapp ? phoneGH(clean(b.whatsapp, 60)) : null,
          cons(b.consent_email), cons(b.consent_sms), cons(b.consent_whatsapp),
          anyYes ? (clean(b.consent_source, 160) || 'recorded by ' + u.email) : null, anyYes ? new Date() : null]);
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


    /* Step 1: hand us a file (Excel, LibreOffice, Numbers, CSV/TSV, vCard,
       JSON), pasted rows or a Google Sheets link. We say what is in it and
       what we think each column is. Nothing is saved yet. */
    if (p === '/api/contacts/inspect' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      let b; try { b = await bodyBig(req, 28 * 1024 * 1024); } catch { return json(res, 413, { error: 'file_too_large' }); }
      let out;
      try { out = await readImportBody(b); } catch (e) { return json(res, 400, { error: importError(e) }); }
      if (!out.sheets.length) return json(res, 400, { error: 'no_table_found' });
      return json(res, 200, {
        kind: out.kind,
        sheets: out.sheets.map(sh => ({
          name: sh.name, rows: sh.rows.length, columns: sh.columns,
          mapping: guessMapping(sh.columns, sh.rows.slice(0, 30)),
          sample: sh.rows.slice(0, 3)
        }))
      });
    }

    /* Step 2: import one sheet with the mapping and the defaults you confirmed.
       dry:true answers "what would happen" without saving anything. */
    if (p === '/api/contacts/import-sheet' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      let b; try { b = await bodyBig(req, 28 * 1024 * 1024); } catch { return json(res, 413, { error: 'file_too_large' }); }
      const source = clean(b.source, 120);
      if (!source) return json(res, 400, { error: 'source_required' });
      if (CHANNELS.some(ch => b['consent_' + ch] === 'yes') && !clean(b.consent_source, 200))
        return json(res, 400, { error: 'consent_source_required' });
      let out;
      try { out = await readImportBody(b); } catch (e) { return json(res, 400, { error: importError(e) }); }
      const sh = out.sheets.find(x => x.name === b.sheet) || out.sheets[0];
      if (!sh) return json(res, 400, { error: 'no_table_found' });
      const label = (b.url ? 'Google Sheet' : b.text ? 'pasted list' : clean(b.name, 120) || 'file') + (out.sheets.length > 1 ? ' / ' + sh.name : '');
      const r = await importTable(sh, b, u, label);
      if (!b.dry) await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)',
        [u.email, 'contacts_import', `${label}: ${r.added} added, ${r.updated} updated, ${r.skipped} skipped, ${r.left_alone} opted out left alone — source: ${source}`]);
      return json(res, 200, { ...r, dry: !!b.dry, sheet: sh.name, kind: out.kind });
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
          unsubscribed_at = case when $12='do_not_contact' then coalesce(unsubscribed_at, now()) else unsubscribed_at end,
          country = coalesce($14, country), client_type = case when $15 = '' then null else coalesce($15, client_type) end,
          language = coalesce($16, language), whatsapp = case when $17 = '' then null else coalesce($17, whatsapp) end,
          consent_source = case when coalesce($18,consent_email)='yes' or coalesce($19,consent_sms)='yes' or coalesce($20,consent_whatsapp)='yes'
            then coalesce($21, consent_source) else consent_source end,
          consent_at = case when ($18='yes' and consent_email<>'yes') or ($19='yes' and consent_sms<>'yes') or ($20='yes' and consent_whatsapp<>'yes')
            then now() else consent_at end,
          consent_email = coalesce($18, consent_email), consent_sms = coalesce($19, consent_sms), consent_whatsapp = coalesce($20, consent_whatsapp),
          sms_unsub_at = case when $19='yes' then null else sms_unsub_at end,
          whatsapp_unsub_at = case when $20='yes' then null else whatsapp_unsub_at end
        where id=$13`,
        [set(b.company), set(b.full_name), set(b.role), email === undefined ? null : email,
          b.phone === undefined ? null : phoneGH(clean(b.phone, 60)), set(b.sector), set(b.city),
          set(b.website), set(b.priority), set(b.tags), set(b.notes), b.status || null, +mCon[1],
          set(b.country), b.client_type === undefined ? null : (CLIENT_TYPES.includes(b.client_type) ? b.client_type : ''),
          set(b.language), b.whatsapp === undefined ? null : (b.whatsapp ? phoneGH(clean(b.whatsapp, 60)) : ''),
          ...['consent_email','consent_sms','consent_whatsapp'].map(k => ['yes','no','unknown'].includes(b[k]) ? b[k] : null),
          b.consent_source ? clean(b.consent_source, 160) : 'recorded by ' + u.email]);
      return json(res, 200, { ok: true });
    }

    /* ---- campaigns ---- */
    if (p === '/api/campaigns' && req.method === 'GET') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const { rows } = await q(`select c.*,
        (select count(*)::int from campaign_sends s where s.campaign_id=c.id and s.status in ('sent','delivered')) as sent,
        (select count(*)::int from campaign_sends s where s.campaign_id=c.id and s.status='queued') as pending,
        (select count(*)::int from campaign_sends s where s.campaign_id=c.id and s.status in ('sending','manual')) as in_flight,
        (select count(*)::int from campaign_sends s where s.campaign_id=c.id and s.status not in ('queued','skipped')) as released,
        (select count(*)::int from campaign_sends s where s.campaign_id=c.id and s.status='failed') as failed,
        (select count(*)::int from campaign_sends s where s.campaign_id=c.id and s.clicked_at is not null) as clicked
        from campaigns c order by c.id desc`);
      return json(res, 200, { rows });
    }

    /* ---- email designer: saved templates and a live preview ---- */
    if (p === '/api/email-templates' && req.method === 'GET') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const { rows } = await q('select id, name, subject, blocks, created_by, updated_at from email_templates order by updated_at desc');
      return json(res, 200, { rows: [...rows.map(r => ({ ...r, id: String(r.id) })), ...STARTER_TEMPLATES] });
    }
    if (p === '/api/email-templates' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const b = await body(req); const name = clean(b.name, 80);
      if (!name) return json(res, 400, { error: 'name_required' });
      const blocks = JSON.stringify(cleanBlocks(b.blocks));
      const id = /^\d+$/.test(String(b.id || '')) ? +b.id : null;
      const r = id ? await q('update email_templates set name=$1, subject=$2, blocks=$3::jsonb, updated_at=now() where id=$4 returning id', [name, clean(b.subject, 200), blocks, id])
        : await q('insert into email_templates(name, subject, blocks, created_by) values ($1,$2,$3::jsonb,$4) returning id', [name, clean(b.subject, 200), blocks, u.email]);
      if (!r.rows.length) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { ok: true, id: String(r.rows[0].id) });
    }
    const mTpl = p.match(/^\/api\/email-templates\/(\d+)$/);
    if (mTpl && req.method === 'DELETE') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      await q('delete from email_templates where id=$1', [+mTpl[1]]); return json(res, 200, { ok: true });
    }
    if (p === '/api/campaigns/render' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const b = await body(req);
      const cam = { template: 'designer', subject: clean(b.subject, 200) || 'Preview', blocks: cleanBlocks(b.blocks), carlson: b.carlson === true };
      const sample = { company: 'Acme Mining Ghana', full_name: 'Ama Mensah', role: 'Managing Director', sector: 'Mining', city: 'Accra', source: 'sample' };
      const html = campaignHtml(cam, sample, await designerData(cam), { cta: PUBLIC_URL + '/c/sample', unsub: PUBLIC_URL + '/u/sample', preview: true });
      return json(res, 200, { html, subject: merge(cam.subject, sample), links: designerLinks(cam.blocks).length });
    }

    if (p === '/api/campaigns' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const b = await body(req);
      const channel = CHANNELS.includes(b.channel) ? b.channel : 'email';
      if (!clean(b.name, 120) || (channel === 'email' && !clean(b.subject, 200))) return json(res, 400, { error: 'name_and_subject' });
      const vals = [clean(b.name, 120), clean(b.subject, 200) || clean(b.name, 120),
        ['invitation','sponsor','brief','plain','designer'].includes(b.template) ? b.template : 'invitation',
        clean(b.intro, 6000), clean(b.cta_label, 60), clean(b.cta_url, 400),
        clean(b.item_code, 12).toUpperCase() || null, clean(b.seg_sector, 60), clean(b.seg_tags, 200),
        clean(b.seg_status, 20), clean(b.from_name, 120),
        Math.max(1, Math.min(channel === 'email' ? 200 : 2000, parseInt(b.daily_limit) || 40)),
        channel, clean(b.seg_type, 200), clean(b.seg_country, 200), b.seg_consent === 'yes' ? 'yes' : 'any',
        clean(b.sms_text, 900), clean(b.wa_template, 120).replace(/[^a-z0-9_]/gi, '').toLowerCase() || null, clean(b.wa_lang, 10) || 'en', clean(b.wa_params, 2000),
        b.carlson === true, JSON.stringify(cleanBlocks(b.blocks))];
      if (b.id) {
        await q(`update campaigns set name=$1,subject=$2,template=$3,intro=$4,cta_label=$5,cta_url=$6,item_code=$7,
          seg_sector=$8,seg_tags=$9,seg_status=$10,from_name=$11,daily_limit=$12,channel=$13,seg_type=$14,seg_country=$15,
          seg_consent=$16,sms_text=$17,wa_template=$18,wa_lang=$19,wa_params=$20,carlson=$21,blocks=$22::jsonb where id=$23`, [...vals, +b.id]);
        return json(res, 200, { ok: true, id: +b.id });
      }
      const { rows } = await q(`insert into campaigns(name,subject,template,intro,cta_label,cta_url,item_code,
        seg_sector,seg_tags,seg_status,from_name,daily_limit,channel,seg_type,seg_country,seg_consent,sms_text,wa_template,wa_lang,wa_params,carlson,blocks,created_by)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23) returning id`, [...vals, u.email]);
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
      const item = await mailContext(cam);
      const html = cam.channel === 'email' || !cam.channel ? campaignHtml(cam, one, item, { cta: PUBLIC_URL + '/c/sample', unsub: PUBLIC_URL + '/u/sample', preview: true }) : null;
      const text = cam.channel === 'sms' || cam.channel === 'whatsapp' ? msgText(cam, one, 'sample0000000') : null;
      return json(res, 200, { audience: cnt.rows[0].n, sample_to: one.company || one.full_name, subject: merge(cam.subject, one), html, text,
        channel: cam.channel || 'email', provider: cam.channel === 'sms' ? (smsReady() ? 'arkesel' : null) : cam.channel === 'whatsapp' ? (waReady() ? 'whatsapp_cloud' : null) : mailVia(),
        segments: text ? Math.ceil(text.length / (/[^\x00-\x7F]/.test(text) ? 67 : 153)) : null });
    }

    /* send one to yourself before it goes to two hundred people */
    const mCamTest = p.match(/^\/api\/campaigns\/(\d+)\/test$/);
    if (mCamTest && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const b = await body(req);
      const cam = (await q('select * from campaigns where id=$1', [+mCamTest[1]])).rows[0];
      if (!cam) return json(res, 404, { error: 'not_found' });
      if (cam.channel === 'sms' || cam.channel === 'whatsapp') {
        const ph = phoneGH(clean(b.phone, 40));
        if (!ph) return json(res, 400, { error: 'bad_phone' });
        const sample = { company: 'Acme Mining Ghana', full_name: 'Ama Mensah', role: 'Managing Director', sector: 'Mining' };
        await q(`insert into msg_outbox(channel,to_phone,to_name,body,template,lang,params,kind) values ($1,$2,'Test',$3,$4,$5,$6,'test')`,
          [cam.channel, ph, '[TEST] ' + msgText(cam, sample, 'sample0000000'), cam.wa_template, cam.wa_lang, JSON.stringify(waParams(cam, sample))]);
        const n = await flushMessages(5);
        return json(res, 200, { ok: true, sent: n, manual: n === 0 });
      }
      const to = clean(b.email, 160).toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(to)) return json(res, 400, { error: 'bad_email' });
      const sample = { company: 'Acme Mining Ghana', full_name: 'Ama Mensah', role: 'Managing Director', sector: 'Mining', city: 'Accra', source: 'test send' };
      const item = await mailContext(cam);
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
      const b = await body(req).catch(() => ({}));
      /* "Send on …": check it now, build the queue when the time comes */
      if (b && b.at) {
        const at = new Date(b.at);
        if (isNaN(at) || at < new Date(Date.now() + 60e3) || at > new Date(Date.now() + 400 * 864e5)) return json(res, 400, { error: 'bad_time' });
        if (cam.channel === 'sms' && !cam.sms_text) return json(res, 400, { error: 'sms_text_missing' });
        if (cam.channel === 'whatsapp' && !cam.wa_template && waReady()) return json(res, 400, { error: 'wa_template_missing' });
        const { where, vals } = segmentSql(cam);
        const n = (await q(`select count(*)::int as n from contacts c where ${where}`, vals)).rows[0].n;
        if (!n) return json(res, 400, { error: 'empty_audience' });
        await q("update campaigns set status='scheduled', starts_at=$2 where id=$1", [id, at]);
        await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, 'campaign_schedule', `${cam.name} → ${at.toISOString()}, about ${n} contacts`]);
        return json(res, 200, { ok: true, scheduled: at.toISOString(), audience: n });
      }
      const st = await startCampaign(cam, u.email);
      if (st.error) return json(res, 400, { error: st.error });
      const r = await runCampaigns();
      return json(res, 200, { ok: true, queued: st.queued, sent_now: r });
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
      const isLogo = !isDoc && b.kind === 'logo', isEmail = !isDoc && b.kind === 'email';
      if (isDoc && buf.length > MAX_DOC_BYTES) return json(res, 413, { error: 'file_too_large' });
      if (!isDoc && buf.length > MAX_IMAGE_BYTES) return json(res, 413, { error: 'file_too_large' });
      try {
        const out = isDoc ? await storeDoc(buf, b.name, b.label || b.alt, u.email)
          : isLogo ? await storeLogo(buf, b.name, b.alt, u.email)
          : isEmail ? await storeEmailImage(buf, b.name, b.alt, u.email)
          : await storeImage(buf, b.name, b.alt, u.email);
        const { rows } = await q('select * from media where id=$1', [out.id]);
        await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)',
          [u.email, 'media_upload', `${isDoc ? 'PDF' : isLogo ? 'logo' : isEmail ? 'email picture' : 'image'} ${safeName(b.name)} (${Math.round(buf.length / 1024)} KB)`]);
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
      const allowed = new Set(['max_seats','momo_number','momo_name','whatsapp','pay_link']);
      const entries = Object.entries(b);
      if (!entries.length || entries.some(([k]) => !allowed.has(k))) return json(res, 400, { error: 'invalid_setting' });
      const values = {};
      for (const [key, raw] of entries) {
        const value = clean(String(raw ?? ''), 200);
        if (key === 'momo_number') {
          const normalized = phoneGH(value);
          if (!/^\+233\d{9}$/.test(normalized)) return json(res, 400, { error: 'bad_momo_number', fields: ['momo_number'] });
          values[key] = normalized;
        } else if (key === 'momo_name') {
          if (!value || value.length > 80) return json(res, 400, { error: 'bad_momo_name', fields: ['momo_name'] });
          values[key] = value;
        } else if (key === 'whatsapp') {
          const digits = value.replace(/\D/g, '');
          if (digits.length < 9 || digits.length > 15) return json(res, 400, { error: 'bad_whatsapp', fields: ['whatsapp'] });
          values[key] = digits;
        } else if (key === 'pay_link') {
          if (value) { let url; try { url = new URL(value); } catch { return json(res, 400, { error: 'bad_pay_link', fields: ['pay_link'] }); }
            if (url.protocol !== 'https:') return json(res, 400, { error: 'bad_pay_link', fields: ['pay_link'] }); }
          values[key] = value;
        } else if (key === 'max_seats') {
          if (value && (!/^\d+$/.test(value) || +value < 1 || +value > 100000)) return json(res, 400, { error: 'bad_max_seats', fields: ['max_seats'] });
          values[key] = value;
        }
      }
      const client = await pool.connect();
      try {
        await client.query('begin');
        for (const [k, v] of Object.entries(values)) await client.query('insert into settings(key,value) values ($1,$2) on conflict (key) do update set value=excluded.value', [k, v]);
        await client.query('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, 'settings_save', Object.keys(values).join(', ')]);
        await client.query('commit');
      } catch (err) { await client.query('rollback').catch(() => {}); throw err; }
      finally { client.release(); }
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
      const { rows } = await q('select email,name,role,last_login,coalesce(active,true) as active,must_change,totp_on from users order by id');
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
      if (b.reset_2fa === true) sets.push('totp_on=false', 'totp_secret=null', 'totp_recovery=null', 'totp_last=null', 'sv=coalesce(sv,0)+1');
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

    /* =================== CRM: pipeline, tasks, notes, records, reports =================== */
    const STAGES = ['lead', 'contacted', 'meeting', 'proposal', 'won', 'lost'];
    const KINDS = ['sponsorship', 'consulting', 'family_desk', 'membership', 'event', 'other'];
    const NOTE_KINDS = ['note', 'call', 'whatsapp', 'meeting', 'email'];
    const day = s => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? s : null);
    const money = v => { const n = Math.round(Number(String(v ?? '').replace(/[^\d.]/g, '')) * 100) / 100; return isFinite(n) && n >= 0 ? Math.min(n, 1e12) : 0; };
    const isUser = async e => !e || (await q('select 1 from users where email=$1', [e])).rowCount > 0;

    /* ---- deals ---- */
    if (p === '/api/deals' && req.method === 'GET') {
      if (!need('admin')) return json(res, 401, { error: 'not_allowed' });
      const { rows } = await q(`select d.*, c.full_name as contact_name, c.phone as contact_phone, c.email as contact_email,
          (select count(*)::int from tasks t where t.deal_id=d.id and t.done_at is null) as open_tasks,
          (select min(t.due_at) from tasks t where t.deal_id=d.id and t.done_at is null) as next_task_due
        from deals d left join contacts c on c.id=d.contact_id
        order by d.stage, d.sort, d.updated_at desc limit 1000`);
      return json(res, 200, { rows, stages: STAGES, kinds: KINDS });
    }
    if (p === '/api/deals' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const b = await body(req);
      let contactId = Number(b.contact_id) || null;
      if (!contactId && b.new_contact && (clean(b.new_contact.company) || clean(b.new_contact.full_name))) {
        const nc = b.new_contact, em = clean(nc.email, 160).toLowerCase() || null;
        const ex = em ? (await q('select id from contacts where lower(email)=$1', [em])).rows[0] : null;
        contactId = ex ? ex.id : (await q(`insert into contacts(company,full_name,email,phone,source,status) values ($1,$2,$3,$4,$5,'new') returning id`,
          [clean(nc.company, 160) || null, clean(nc.full_name, 120) || null, em, phoneGH(clean(nc.phone, 40)) || null, 'Added with a deal by ' + u.email])).rows[0].id;
      }
      const c = contactId ? (await q('select * from contacts where id=$1', [contactId])).rows[0] : null;
      const title = clean(b.title, 160) || (c ? (c.company || c.full_name) : '');
      if (!title) return json(res, 400, { error: 'title_required', fields: ['title'] });
      const owner = clean(b.owner, 120).toLowerCase() || u.email;
      if (!(await isUser(owner))) return json(res, 400, { error: 'unknown_owner', fields: ['owner'] });
      const stage = STAGES.includes(b.stage) ? b.stage : 'lead';
      const { rows } = await q(`insert into deals(title,contact_id,company,kind,stage,value,owner,next_step,next_date,source,reg_id,sponsor_lead_id,created_by,closed_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
        [title, contactId, c ? (c.company || c.full_name) : clean(b.company, 160) || null, KINDS.includes(b.kind) ? b.kind : 'consulting', stage,
          money(b.value), owner, clean(b.next_step, 300) || null, day(b.next_date), clean(b.source, 120) || null,
          Number(b.reg_id) || null, Number(b.sponsor_lead_id) || null, u.email, ['won', 'lost'].includes(stage) ? new Date() : null]);
      await q('insert into deal_events(deal_id,to_stage,detail,by_user) values ($1,$2,$3,$4)', [rows[0].id, stage, 'created', u.email]);
      if (b.sponsor_lead_id) await q(`update sponsor_leads set status='talking' where id=$1 and status='new'`, [Number(b.sponsor_lead_id)]);
      return json(res, 200, rows[0]);
    }
    const mDeal = p.match(/^\/api\/deals\/(\d+)$/);
    if (mDeal && req.method === 'GET') {
      if (!need('admin')) return json(res, 401, { error: 'not_allowed' });
      const d = (await q(`select d.*, c.full_name as contact_name, c.phone as contact_phone, c.email as contact_email
        from deals d left join contacts c on c.id=d.contact_id where d.id=$1`, [+mDeal[1]])).rows[0];
      if (!d) return json(res, 404, { error: 'not_found' });
      const [ev, nt, tk] = await Promise.all([
        q('select * from deal_events where deal_id=$1 order by at desc', [d.id]),
        q('select * from notes where deal_id=$1 order by at desc', [d.id]),
        q('select * from tasks where deal_id=$1 order by done_at nulls first, due_at nulls last', [d.id])]);
      return json(res, 200, { deal: d, events: ev.rows, notes: nt.rows, tasks: tk.rows });
    }
    if (mDeal && req.method === 'PATCH') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const b = await body(req);
      const d = (await q('select * from deals where id=$1', [+mDeal[1]])).rows[0];
      if (!d) return json(res, 404, { error: 'not_found' });
      const sets = [], vals = [], put = (col, v) => sets.push(`${col}=$${vals.push(v)}`);
      if (typeof b.title === 'string') { if (!clean(b.title)) return json(res, 400, { error: 'title_required', fields: ['title'] }); put('title', clean(b.title, 160)); }
      if (KINDS.includes(b.kind)) put('kind', b.kind);
      if (b.value !== undefined) put('value', money(b.value));
      if (b.owner !== undefined) { const o = clean(b.owner, 120).toLowerCase(); if (!(await isUser(o))) return json(res, 400, { error: 'unknown_owner', fields: ['owner'] }); put('owner', o || null); }
      if (b.next_step !== undefined) put('next_step', clean(b.next_step, 300) || null);
      if (b.next_date !== undefined) put('next_date', day(b.next_date));
      if (b.source !== undefined) put('source', clean(b.source, 120) || null);
      if (b.sort !== undefined) put('sort', parseInt(b.sort) || 0);
      if (b.lost_reason !== undefined) put('lost_reason', clean(b.lost_reason, 300) || null);
      const moving = STAGES.includes(b.stage) && b.stage !== d.stage;
      if (moving) {
        put('stage', b.stage);
        put('closed_at', ['won', 'lost'].includes(b.stage) ? new Date() : null);
      }
      if (!sets.length) return json(res, 400, { error: 'nothing_to_update' });
      sets.push('updated_at=now()');
      const up = (await q(`update deals set ${sets.join(',')} where id=$${vals.push(d.id)} returning *`, vals)).rows[0];
      if (moving) {
        await q('insert into deal_events(deal_id,from_stage,to_stage,detail,by_user) values ($1,$2,$3,$4,$5)',
          [d.id, d.stage, b.stage, b.stage === 'lost' ? clean(b.lost_reason, 300) || null : null, u.email]);
        if (d.contact_id && b.stage === 'won') await q(`update contacts set status='won' where id=$1 and status<>'do_not_contact'`, [d.contact_id]);
        if (d.sponsor_lead_id && ['won', 'lost'].includes(b.stage)) await q('update sponsor_leads set status=$1 where id=$2', [b.stage, d.sponsor_lead_id]);
      }
      return json(res, 200, up);
    }
    if (mDeal && req.method === 'DELETE') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const d = (await q('delete from deals where id=$1 returning title', [+mDeal[1]])).rows[0];
      if (d) await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, 'deal_deleted', d.title]);
      return json(res, 200, { ok: true });
    }

    /* ---- tasks: staff see and tick their own; admins see everyone's ---- */
    if (p === '/api/tasks' && req.method === 'GET') {
      const u = auth(); if (!u) return json(res, 401, { error: 'no_session' });
      const scope = u.role === 'staff' ? 'mine' : (url.searchParams.get('scope') || 'mine');
      const where = ['1=1'], vals = [];
      if (scope === 'mine') where.push(`t.assignee=$${vals.push(u.email)}`);
      if (scope === 'unassigned') where.push('t.assignee is null');
      if (url.searchParams.get('contact_id')) where.push(`t.contact_id=$${vals.push(+url.searchParams.get('contact_id'))}`);
      if (url.searchParams.get('deal_id')) where.push(`t.deal_id=$${vals.push(+url.searchParams.get('deal_id'))}`);
      if (url.searchParams.get('status') === 'done') where.push(`t.done_at > now() - interval '30 days'`);
      else where.push('t.done_at is null');
      const { rows } = await q(`select t.*, c.company, c.full_name as contact_name, c.phone as contact_phone, d.title as deal_title
        from tasks t left join contacts c on c.id=t.contact_id left join deals d on d.id=t.deal_id
        where ${where.join(' and ')} order by t.done_at desc nulls first, t.due_at nulls last, t.id limit 500`, vals);
      if (u.role === 'staff') rows.forEach(r => { r.contact_phone = null; });
      return json(res, 200, { rows });
    }
    if (p === '/api/tasks' && req.method === 'POST') {
      const u = auth(); if (!u) return json(res, 401, { error: 'no_session' });
      const b = await body(req);
      const title = clean(b.title, 200); if (!title) return json(res, 400, { error: 'title_required', fields: ['title'] });
      let assignee = b.assignee === '' ? null : clean(b.assignee, 120).toLowerCase() || u.email;
      if (u.role === 'staff') assignee = u.email;
      if (!(await isUser(assignee))) return json(res, 400, { error: 'unknown_assignee', fields: ['assignee'] });
      const due = b.due_at && !isNaN(Date.parse(b.due_at)) ? new Date(b.due_at) : null;
      let dealId = Number(b.deal_id) || null, contactId = Number(b.contact_id) || null;
      if (dealId && !contactId) contactId = (await q('select contact_id from deals where id=$1', [dealId])).rows[0]?.contact_id || null;
      const { rows } = await q(`insert into tasks(title,notes,due_at,priority,assignee,contact_id,deal_id,reg_id,created_by)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
        [title, clean(b.notes, 1000) || null, due, b.priority === 'high' ? 'high' : 'normal', assignee, contactId, dealId, Number(b.reg_id) || null, u.email]);
      return json(res, 200, rows[0]);
    }
    const mTask = p.match(/^\/api\/tasks\/(\d+)$/);
    if (mTask && (req.method === 'PATCH' || req.method === 'DELETE')) {
      const u = auth(); if (!u) return json(res, 401, { error: 'no_session' });
      const t = (await q('select * from tasks where id=$1', [+mTask[1]])).rows[0];
      if (!t) return json(res, 404, { error: 'not_found' });
      if (u.role === 'staff' && t.assignee !== u.email) return json(res, 401, { error: 'not_allowed' });
      if (req.method === 'DELETE') {
        if (u.role === 'staff' && t.created_by !== u.email) return json(res, 401, { error: 'not_allowed' });
        await q('delete from tasks where id=$1', [t.id]); return json(res, 200, { ok: true });
      }
      const b = await body(req); const sets = [], vals = [], put = (col, v) => sets.push(`${col}=$${vals.push(v)}`);
      if (typeof b.done === 'boolean') { put('done_at', b.done ? new Date() : null); put('done_by', b.done ? u.email : null); }
      if (typeof b.title === 'string' && clean(b.title)) put('title', clean(b.title, 200));
      if (b.notes !== undefined) put('notes', clean(b.notes, 1000) || null);
      if (b.due_at !== undefined) put('due_at', b.due_at && !isNaN(Date.parse(b.due_at)) ? new Date(b.due_at) : null);
      if (b.priority !== undefined) put('priority', b.priority === 'high' ? 'high' : 'normal');
      if (b.assignee !== undefined && u.role !== 'staff') { const a = clean(b.assignee, 120).toLowerCase() || null; if (!(await isUser(a))) return json(res, 400, { error: 'unknown_assignee' }); put('assignee', a); }
      if (!sets.length) return json(res, 400, { error: 'nothing_to_update' });
      const up = (await q(`update tasks set ${sets.join(',')} where id=$${vals.push(t.id)} returning *`, vals)).rows[0];
      return json(res, 200, up);
    }


    /* ---- safety net ---- */
    if (p === '/api/safety' && (req.method === 'GET' || req.method === 'POST')) {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      if (req.method === 'POST') {
        const b = await body(req);
        if (b.alert_emails !== undefined) {
          const list = String(b.alert_emails || '').split(/[,;\s]+/).filter(Boolean);
          if (list.some(e => !/^\S+@\S+\.\S+$/.test(e)) || list.length > 5) return json(res, 400, { error: 'bad_email', fields: ['alert_emails'] });
          await setSetting('alert_emails', list.join(', '));
        }
        if (b.alert_whatsapp !== undefined) {
          const w = String(b.alert_whatsapp || '').replace(/[^\d+]/g, '');
          if (w && !/^\+?\d{9,15}$/.test(w)) return json(res, 400, { error: 'bad_phone', fields: ['alert_whatsapp'] });
          await setSetting('alert_whatsapp', w);
        }
        if (b.test) { const n = await alertTeam('Gotham platform: test alert', ['This is a test of the safety-net alerts. Nothing is wrong.']); return json(res, 200, { ok: true, sent_to: n }); }
      }
      return json(res, 200, await safetyReport());
    }

    /* ---- quotes and invoices ---- */
    if (p === '/api/invoice-settings' && (req.method === 'GET' || req.method === 'POST')) {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      if (req.method === 'POST') {
        const b = await body(req);
        for (const k of INV_KEYS) if (b[k] !== undefined) {
          let v = clean(String(b[k] ?? ''), k.startsWith('inv_bank') || k === 'inv_co_address' || k === 'inv_footer' ? 600 : 120);
          if (k === 'inv_vat_registered') v = v === 'yes' ? 'yes' : 'no';
          if (k.startsWith('inv_tax_') && v !== '' && !(+v >= 0 && +v <= 50)) return json(res, 400, { error: 'bad_rate', fields: [k] });
          if (k === 'inv_terms_days' && v !== '' && !(+v >= 0 && +v <= 180)) return json(res, 400, { error: 'bad_terms', fields: [k] });
          await q(`insert into settings(key,value) values ($1,$2) on conflict (key) do update set value=excluded.value`, [k, v]);
        }
        if (b.inv_bank !== undefined) {
          const bank = cleanBank(b.inv_bank), bad = bankErrors(bank);
          if (bad.length) return json(res, 400, { error: 'bad_bank', fields: bad });
          await q(`insert into settings(key,value) values ('inv_bank',$1) on conflict (key) do update set value=excluded.value`, [JSON.stringify(bank)]);
        }
        await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, 'invoice_settings', Object.keys(b).join(', ').slice(0, 300)]);
      }
      const st = await invSettings();
      return json(res, 200, { ...Object.fromEntries(INV_KEYS.map(k => [k, st[k] ?? ''])), inv_bank: st.bank, rates: st.rates, tax_default: TAX_DEFAULT, paystack: !!PAYSTACK_KEY });
    }
    /* a sample client page, so the team can check the bank details exactly as a client will see them */
    if (p === '/api/invoices/preview' && req.method === 'GET') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const st = await invSettings(), cur = CURRENCIES.includes(url.searchParams.get('c')) ? url.searchParams.get('c') : 'GHS';
      const inv = { kind: 'invoice', number: 'SAMPLE', status: 'sent', currency: cur, fx_rate: cur === 'GHS' ? null : 16, issue_date: new Date(), due_date: new Date(Date.now() + st.terms * 864e5),
        bill_to: { name: 'Sample client', company: cur === 'GHS' ? 'Sample Company Ltd' : 'Sample Company GmbH', country: cur === 'GHS' ? 'Ghana' : 'Germany', residency: cur === 'GHS' ? 'resident' : 'non_resident' },
        tax_mode: cur === 'GHS' && st.vat_registered ? 'standard' : cur === 'GHS' ? 'none' : 'zero', tax_note: cur === 'GHS' ? '' : 'Export of services to a non-resident', rates: st.rates,
        lines: [{ description: 'Sample line: advisory services', qty: 1, unit: 1000, discount: 0 }], wht_rate: 0, token: 'sample', notes: 'This is a sample to check the payment details. It is not an invoice.' };
      Object.assign(inv, invoiceTotals(inv, st.rates));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
      return res.end(invoicePage(inv, [], st, { msg: 'Sample only: check that every bank detail matches the bank’s letter.' }));
    }
    if (p === '/api/fx' && req.method === 'GET') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const c = String(url.searchParams.get('c') || '').toUpperCase(); if (!['EUR', 'USD', 'GBP'].includes(c)) return json(res, 400, { error: 'bad_currency' });
      const fx = await liveRates();
      if (!fx || !fx.rates[c]) return json(res, 502, { error: 'fx_unavailable' });
      return json(res, 200, { currency: c, rate: fx.rates[c], source: 'market mid-rate (check against the Bank of Ghana reference rate)', date: String(fx.updated).slice(0, 10) });
    }
    if (p === '/api/invoices' && req.method === 'GET') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const { rows } = await q(`select i.*, coalesce((select sum(amount+wht) from invoice_payments x where x.invoice_id=i.id),0) as paid,
          coalesce((select sum(c.total) from invoices c where c.credit_for=i.id and c.kind='credit' and c.status<>'void'),0) as credited,
          (select number from invoices o where o.id=i.credit_for) as credit_for_number
        from invoices i order by coalesce(i.issue_date, i.created_at::date) desc, i.id desc limit 1000`);
      const today = new Date().toISOString().slice(0, 10), m = today.slice(0, 7);
      const out = rows.map(r => ({ ...r, balance: r.kind === 'credit' ? 0 : r2(+r.total - +r.paid - +r.credited), overdue: r.kind === 'invoice' && ['sent', 'part_paid'].includes(r.status) && r.due_date && ymdOf(r.due_date) < today }));
      const owed = {}; out.filter(r => r.kind === 'invoice' && ['sent', 'part_paid'].includes(r.status)).forEach(r => owed[r.currency] = r2((owed[r.currency] || 0) + r.balance));
      const monthTax = out.filter(r => ['invoice', 'credit'].includes(r.kind) && r.number && r.status !== 'void' && r.issue_date && ymdOf(r.issue_date).startsWith(m)).reduce((s, r) => s + (r.kind === 'credit' ? -1 : 1) * (+r.tax_ghs), 0);
      return json(res, 200, { rows: out, summary: { owed, overdue: out.filter(r => r.overdue).length, tax_this_month_ghs: r2(monthTax) } });
    }
    const mInv = p.match(/^\/api\/invoices\/(\d+)(?:\/(issue|send|payment|void|convert|remind|credit|receipt))?(?:\/(\d+))?$/);
    if ((p === '/api/invoices' && req.method === 'POST') || (mInv && !mInv[2] && req.method === 'POST')) {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const b = await body(req), st = await invSettings();
      const id = mInv ? +mInv[1] : (+b.id || null);
      const cur = id ? (await q('select * from invoices where id=$1', [id])).rows[0] : null;
      if (id && !cur) return json(res, 404, { error: 'not_found' });
      if (cur && cur.status === 'void') return json(res, 400, { error: 'void' });
      const bt = b.bill_to || {};
      const inv = {
        kind: cur ? cur.kind : (b.kind === 'quote' ? 'quote' : 'invoice'),
        contact_id: +b.contact_id || null, deal_id: +b.deal_id || null,
        bill_to: { name: clean(bt.name, 160), company: clean(bt.company, 160), address: clean(bt.address, 400), country: clean(bt.country, 60) || 'Ghana',
          email: clean(bt.email, 160).toLowerCase(), tax_id: clean(bt.tax_id, 60), residency: ['resident', 'non_resident', 'expatriate'].includes(bt.residency) ? bt.residency : 'resident' },
        currency: CURRENCIES.includes(b.currency) ? b.currency : 'GHS', fx_rate: +b.fx_rate > 0 ? +b.fx_rate : null, fx_date: /^\d{4}-\d{2}-\d{2}$/.test(b.fx_date || '') ? b.fx_date : null,
        tax_mode: TAX_MODES.includes(b.tax_mode) ? b.tax_mode : (st.vat_registered ? 'standard' : 'none'), tax_note: clean(b.tax_note, 200),
        lines: cleanLines(b.lines), issue_date: /^\d{4}-\d{2}-\d{2}$/.test(b.issue_date || '') ? b.issue_date : null,
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(b.due_date || '') ? b.due_date : null, valid_until: /^\d{4}-\d{2}-\d{2}$/.test(b.valid_until || '') ? b.valid_until : null,
        notes: clean(b.notes, 2000), wht_rate: Math.max(0, Math.min(30, +b.wht_rate || 0)), evat_ref: clean(b.evat_ref, 120) };
      if (inv.currency === 'GHS') { inv.fx_rate = null; inv.fx_date = null; }
      if (!inv.bill_to.name && !inv.bill_to.company) return json(res, 400, { error: 'bill_to_required' });
      if (cur && cur.number) {
        /* issued: the money is fixed. Only the E-VAT reference, the due date and the notes may change. */
        await q('update invoices set evat_ref=$2, due_date=coalesce($3,due_date), valid_until=coalesce($4,valid_until), notes=$5, updated_at=now() where id=$1',
          [cur.id, inv.evat_ref || null, inv.due_date, inv.valid_until, inv.notes || null]);
        return json(res, 200, { ok: true, id: cur.id, locked: true });
      }
      const err = invoiceRules(inv, st); if (err) return json(res, 400, { error: err });
      const t = invoiceTotals(inv, st.rates);
      const vals = [inv.kind, inv.contact_id, inv.deal_id, JSON.stringify(inv.bill_to), inv.currency, inv.fx_rate, inv.fx_date, inv.tax_mode, inv.tax_note || null, JSON.stringify(st.rates),
        JSON.stringify(inv.lines), t.subtotal, t.discount, t.taxable, t.vat, t.nhil, t.getfund, t.total, t.total_ghs, t.tax_ghs, inv.issue_date, inv.due_date, inv.valid_until,
        inv.notes || null, inv.wht_rate, inv.evat_ref || null];
      let rid;
      if (cur) {
        await q(`update invoices set kind=$1, contact_id=$2, deal_id=$3, bill_to=$4, currency=$5, fx_rate=$6, fx_date=$7, tax_mode=$8, tax_note=$9, rates=$10, lines=$11,
          subtotal=$12, discount=$13, taxable=$14, vat=$15, nhil=$16, getfund=$17, total=$18, total_ghs=$19, tax_ghs=$20, issue_date=$21, due_date=$22, valid_until=$23,
          notes=$24, wht_rate=$25, evat_ref=$26, updated_at=now() where id=$27`, [...vals, cur.id]); rid = cur.id;
      } else {
        rid = (await q(`insert into invoices(kind, contact_id, deal_id, bill_to, currency, fx_rate, fx_date, tax_mode, tax_note, rates, lines, subtotal, discount, taxable, vat, nhil, getfund,
          total, total_ghs, tax_ghs, issue_date, due_date, valid_until, notes, wht_rate, evat_ref, created_by, token)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28) returning id`,
          [...vals, u.email, crypto.randomBytes(18).toString('base64url')])).rows[0].id;
      }
      return json(res, 200, { ok: true, id: rid, totals: t });
    }
    if (mInv && req.method === 'GET' && !mInv[2]) {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const inv = (await q('select * from invoices where id=$1', [+mInv[1]])).rows[0]; if (!inv) return json(res, 404, { error: 'not_found' });
      const pays = (await q('select * from invoice_payments where invoice_id=$1 order by paid_on, id', [inv.id])).rows;
      const credits = (await q("select id, number, total, issue_date, notes, status from invoices where credit_for=$1 and kind='credit' order by id", [inv.id])).rows;
      const orig = inv.credit_for ? (await q('select id, number from invoices where id=$1', [inv.credit_for])).rows[0] : null;
      return json(res, 200, { ...inv, payments: pays, credits, credit_for_number: orig ? orig.number : null, link: `${PUBLIC_URL}/i/${inv.token}` });
    }
    if (mInv && req.method === 'DELETE' && !mInv[2]) {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const r = await q("delete from invoices where id=$1 and number is null returning id", [+mInv[1]]);
      return r.rows.length ? json(res, 200, { ok: true }) : json(res, 400, { error: 'issued_cannot_delete' });
    }
    if (mInv && mInv[2] && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      let inv = (await q('select * from invoices where id=$1', [+mInv[1]])).rows[0]; if (!inv) return json(res, 404, { error: 'not_found' });
      const b = await body(req).catch(() => ({})), st = await invSettings(), act = mInv[2];
      if (inv.status === 'void' && act !== 'convert') return json(res, 400, { error: 'void' });
      if (act === 'issue' || act === 'send' || act === 'remind') {
        if (!inv.number) {
          const r = await issueInvoice(inv, st, u.email); if (r.error) return json(res, 400, { error: r.error }); inv = r.inv;
        }
        if (act === 'send' || act === 'remind') {
          const to = clean(b.to || inv.bill_to.email, 160).toLowerCase();
          if (!/^\S+@\S+\.\S+$/.test(to)) return json(res, 400, { error: 'no_email' });
          await mailInvoice(inv, to, act, st, u.email);
        }
        return json(res, 200, { ok: true, number: inv.number, link: `${PUBLIC_URL}/i/${inv.token}` });
      }
      if (act === 'payment') {
        if (inv.kind !== 'invoice' || !inv.number) return json(res, 400, { error: 'issue_first' });
        if (mInv[3]) { await q('delete from invoice_payments where id=$1 and invoice_id=$2', [+mInv[3], inv.id]); const x = await invoicePaid(inv.id); return json(res, 200, { ok: true, status: x.status }); }
        const amount = r2(+b.amount || 0), wht = r2(+b.wht || 0);
        if (!(amount > 0 || wht > 0)) return json(res, 400, { error: 'amount_required' });
        const pid = (await q(`insert into invoice_payments(invoice_id, paid_on, amount, wht, wht_cert, method, reference, fx_rate, note, recorded_by, receipt_no) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
          [inv.id, /^\d{4}-\d{2}-\d{2}$/.test(b.paid_on || '') ? b.paid_on : new Date().toISOString().slice(0, 10), amount, wht, b.wht_cert === true,
            ['momo', 'bank', 'card', 'cash', 'cheque', 'other'].includes(b.method) ? b.method : 'bank', clean(b.reference, 120) || null, +b.fx_rate > 0 ? +b.fx_rate : null, clean(b.note, 300) || null, u.email,
            await nextNumber('receipt')])).rows[0].id;
        const x = await invoicePaid(inv.id);
        if (b.send_receipt !== false && inv.bill_to.email) await sendReceipt(pid).catch(e => console.error('receipt', e.message));
        await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, 'invoice_payment', `${inv.number} ${inv.currency} ${amount}${wht ? ' + WHT ' + wht : ''}`]);
        return json(res, 200, { ok: true, status: x.status });
      }
      if (act === 'receipt') {
        const pay = mInv[3] && (await q('select id from invoice_payments where id=$1 and invoice_id=$2', [+mInv[3], inv.id])).rows[0];
        if (!pay) return json(res, 404, { error: 'not_found' });
        if (!inv.bill_to.email && !b.to) return json(res, 400, { error: 'no_email' });
        await sendReceipt(pay.id, b.to); return json(res, 200, { ok: true });
      }
      if (act === 'credit') {
        if (inv.kind !== 'invoice' || !inv.number) return json(res, 400, { error: 'issue_first' });
        const reason = clean(b.reason, 300); if (!reason) return json(res, 400, { error: 'reason_required' });
        const done = +(await q("select coalesce(sum(total),0) c from invoices where credit_for=$1 and kind='credit' and status<>'void'", [inv.id])).rows[0].c;
        const lines = b.lines ? cleanLines(b.lines) : inv.lines;
        const cn = { kind: 'credit', currency: inv.currency, fx_rate: inv.fx_rate, tax_mode: inv.tax_mode, lines };
        const t = invoiceTotals(cn, inv.rates || st.rates);
        if (!(t.total > 0)) return json(res, 400, { error: 'empty' });
        if (t.total > r2(+inv.total - done) + 0.005) return json(res, 400, { error: 'credit_too_big', left: r2(+inv.total - done) });
        const number = await nextNumber('credit');
        const nid = (await q(`insert into invoices(kind, number, status, contact_id, deal_id, credit_for, bill_to, currency, fx_rate, fx_date, tax_mode, tax_note, rates, lines,
            subtotal, discount, taxable, vat, nhil, getfund, total, total_ghs, tax_ghs, issue_date, notes, evat_ref, created_by, token, sent_at)
          values ('credit',$1,'sent',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,current_date,$22,$23,$24,$25,now()) returning id`,
          [number, inv.contact_id, inv.deal_id, inv.id, JSON.stringify(inv.bill_to), inv.currency, inv.fx_rate, inv.fx_date, inv.tax_mode, inv.tax_note, JSON.stringify(inv.rates || st.rates),
           JSON.stringify(lines), t.subtotal, t.discount, t.taxable, t.vat, t.nhil, t.getfund, t.total, t.total_ghs, t.tax_ghs, reason, clean(b.evat_ref, 120) || null, u.email,
           crypto.randomBytes(18).toString('base64url')])).rows[0].id;
        const x = await invoicePaid(inv.id);
        await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, 'credit_note', `${number} for ${inv.number}: ${inv.currency} ${t.total} (${reason})`]);
        return json(res, 200, { ok: true, id: nid, number, status: x.status });
      }
      if (act === 'void') {
        const reason = clean(b.reason, 300); if (!reason) return json(res, 400, { error: 'reason_required' });
        if (!inv.number) return json(res, 400, { error: 'delete_draft_instead' });
        await q("update invoices set status='void', voided_at=now(), void_reason=$2, updated_at=now() where id=$1", [inv.id, reason]);
        await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, 'invoice_void', `${inv.number}: ${reason}`]);
        return json(res, 200, { ok: true });
      }
      if (act === 'convert') {
        if (inv.kind !== 'quote') return json(res, 400, { error: 'not_a_quote' });
        const nid = (await q(`insert into invoices(kind, contact_id, deal_id, quote_id, bill_to, currency, fx_rate, fx_date, tax_mode, tax_note, rates, lines, subtotal, discount, taxable, vat, nhil, getfund,
            total, total_ghs, tax_ghs, notes, wht_rate, created_by, token)
          select 'invoice', contact_id, deal_id, id, bill_to, currency, fx_rate, fx_date, tax_mode, tax_note, rates, lines, subtotal, discount, taxable, vat, nhil, getfund,
            total, total_ghs, tax_ghs, notes, wht_rate, $2, $3 from invoices where id=$1 returning id`, [inv.id, u.email, crypto.randomBytes(18).toString('base64url')])).rows[0].id;
        if (inv.status === 'sent') await q("update invoices set status='accepted', accepted_at=coalesce(accepted_at,now()) where id=$1", [inv.id]);
        return json(res, 200, { ok: true, id: nid });
      }
    }
    if (p === '/api/invoices/vat.csv' && req.method === 'GET') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const m = /^\d{4}-\d{2}$/.test(url.searchParams.get('month') || '') ? url.searchParams.get('month') : new Date().toISOString().slice(0, 7);
      const { rows } = await q(`select i.*, (select number from invoices o where o.id=i.credit_for) as credit_for_number from invoices i
        where i.kind in ('invoice','credit') and i.number is not null and i.status <> 'void' and to_char(i.issue_date,'YYYY-MM')=$1 order by i.number`, [m]);
      const cols = ['number', 'type', 'credit_for', 'issue_date', 'client', 'client_tax_id', 'residency', 'tax_treatment', 'currency', 'fx_rate', 'taxable', 'vat', 'nhil', 'getfund', 'total', 'taxable_ghs', 'vat_ghs', 'nhil_ghs', 'getfund_ghs', 'total_ghs', 'evat_ref'];
      const csvq = v => /[",\n]/.test(String(v ?? '')) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v ?? '');
      const lines = [cols.join(',')].concat(rows.map(r => { const fx = r.currency === 'GHS' ? 1 : +r.fx_rate, sg = r.kind === 'credit' ? -1 : 1, n = v => r2(sg * +v);
        return [r.number, r.kind === 'credit' ? 'credit note' : 'invoice', r.credit_for_number || '', ymdOf(r.issue_date), r.bill_to.company || r.bill_to.name, r.bill_to.tax_id, r.bill_to.residency, r.tax_mode, r.currency, r.currency === 'GHS' ? '' : r.fx_rate,
          n(r.taxable), n(r.vat), n(r.nhil), n(r.getfund), n(r.total), n(r.taxable * fx), n(r.vat * fx), n(r.nhil * fx), n(r.getfund * fx), n(r.total_ghs), r.evat_ref].map(csvq).join(','); }));
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="vat-${m}.csv"` });
      return res.end('﻿' + lines.join('\r\n'));
    }

    /* ---- for the accountant: a monthly pack (Excel) and import files for Xero and QuickBooks ---- */
    const mAcc = p.match(/^\/api\/invoices\/(pack\.xlsx|xero\.csv|quickbooks\.csv)$/);
    if (mAcc && req.method === 'GET') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const m = /^\d{4}-\d{2}$/.test(url.searchParams.get('month') || '') ? url.searchParams.get('month') : new Date().toISOString().slice(0, 7);
      const P = await accountantPack(m);
      if (mAcc[1] === 'pack.xlsx') {
        const buf = await packWorkbook(P);
        res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="gotham-accounts-${m}.xlsx"` });
        return res.end(Buffer.from(buf));
      }
      const rows = mAcc[1] === 'xero.csv' ? P.xero : P.qb;
      const csvq = v => /[",\n]/.test(String(v ?? '')) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v ?? '');
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${mAcc[1].replace('.csv', '')}-invoices-${m}.csv"` });
      return res.end('\ufeff' + [rows.cols.join(','), ...rows.rows.map(r => r.map(csvq).join(','))].join('\r\n'));
    }

    /* ---- recurring invoices ---- */
    if (p === '/api/invoice-schedules' && req.method === 'GET') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const st = await invSettings();
      const rows = (await q('select s.*, (select number from invoices i where i.id=s.last_invoice_id) as last_number from invoice_schedules s order by active desc, next_date')).rows
        .map(r => ({ ...r, amount: invoiceTotals({ ...r.template, fx_rate: null, tax_mode: r.template.tax_mode === 'standard' && !st.vat_registered ? 'none' : r.template.tax_mode }, st.rates).total }));
      return json(res, 200, { rows });
    }
    const mSch = p.match(/^\/api\/invoice-schedules(?:\/(\d+))?$/);
    if (mSch && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const b = await body(req), ymd = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null;
      const every = ['month', 'quarter', 'year'].includes(b.every) ? b.every : null;
      if (!mSch[1]) {
        const src = (await q("select * from invoices where id=$1 and kind='invoice'", [+b.from_invoice_id])).rows[0];
        if (!src) return json(res, 404, { error: 'not_found' });
        if (!every || !ymd(b.next_date)) return json(res, 400, { error: 'every_and_date_required' });
        if (ymd(b.next_date) < new Date().toISOString().slice(0, 10)) return json(res, 400, { error: 'date_in_past' });
        const T = { contact_id: src.contact_id, deal_id: src.deal_id, bill_to: src.bill_to, currency: src.currency, tax_mode: src.tax_mode, tax_note: src.tax_note,
          lines: b.lines ? cleanLines(b.lines) : src.lines, notes: src.notes, wht_rate: src.wht_rate };
        const id = (await q(`insert into invoice_schedules(template, every, next_date, until, auto_send, created_by, source_invoice_id) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
          [JSON.stringify(T), every, ymd(b.next_date), ymd(b.until), b.auto_send === true, u.email, src.id])).rows[0].id;
        await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, 'schedule_create', `from ${src.number || 'draft ' + src.id}, every ${every} from ${b.next_date}`]);
        return json(res, 200, { ok: true, id });
      }
      const sets = [], vals = [];
      if (typeof b.active === 'boolean') sets.push(`active=$${vals.push(b.active)}`);
      if (typeof b.auto_send === 'boolean') sets.push(`auto_send=$${vals.push(b.auto_send)}`);
      if (every) sets.push(`every=$${vals.push(every)}`);
      if (ymd(b.next_date)) sets.push(`next_date=$${vals.push(ymd(b.next_date))}`);
      if (b.until !== undefined) sets.push(`until=$${vals.push(ymd(b.until))}`);
      if (!sets.length) return json(res, 400, { error: 'nothing_to_update' });
      const r = await q(`update invoice_schedules set ${sets.join(',')}, updated_at=now() where id=$${vals.push(+mSch[1])}`, vals);
      return r.rowCount ? json(res, 200, { ok: true }) : json(res, 404, { error: 'not_found' });
    }
    if (mSch && mSch[1] && req.method === 'DELETE') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      await q('delete from invoice_schedules where id=$1', [+mSch[1]]); return json(res, 200, { ok: true });
    }

    /* ---- the client's page: view, print, pay, accept a quotation ---- */
    const mRcpt = p.match(/^\/i\/([A-Za-z0-9_-]{20,40})\/receipt\/(\d+)$/);
    if (mRcpt && req.method === 'GET') {
      const inv = (await q('select id from invoices where token=$1 and number is not null', [mRcpt[1]])).rows[0];
      const pay = inv && (await q('select id from invoice_payments where id=$1 and invoice_id=$2', [+mRcpt[2], inv.id])).rows[0];
      if (!pay) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
      const d = await receiptData(pay.id);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' });
      return res.end(receiptPage(d, await invSettings()));
    }
    const mPub = p.match(/^\/i\/([A-Za-z0-9_-]{20,40})(?:\/(pay|accept))?$/);
    if (mPub) {
      const inv = (await q('select * from invoices where token=$1 and number is not null', [mPub[1]])).rows[0];
      if (!inv) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
      const st = await invSettings();
      if (mPub[2] === 'pay' && req.method === 'POST') {
        if (rateLimited(ip, 10, 600e3, 'pay')) { res.writeHead(429); return res.end('Too many tries'); }
        if (!paystackOn(inv.currency) || inv.kind !== 'invoice' || ['paid', 'void', 'credited'].includes(inv.status)) { res.writeHead(303, { location: `/i/${inv.token}` }); return res.end(); }
        const paid = +(await q('select coalesce(sum(amount+wht),0) s from invoice_payments where invoice_id=$1', [inv.id])).rows[0].s;
        const cr = +(await q("select coalesce(sum(total),0) c from invoices where credit_for=$1 and kind='credit' and status<>'void'", [inv.id])).rows[0].c, due = r2(+inv.total - paid - cr);
        if (!(due > 0)) { res.writeHead(303, { location: `/i/${inv.token}` }); return res.end(); }
        try {
          const r = await fetch(`${PAYSTACK}/transaction/initialize`, { method: 'POST', signal: AbortSignal.timeout(15e3),
            headers: { authorization: 'Bearer ' + PAYSTACK_KEY, 'content-type': 'application/json' },
            body: JSON.stringify({ email: inv.bill_to.email || st.inv_email || 'info@gothamconsult.com', amount: Math.round(due * 100), currency: inv.currency,
              reference: `${inv.number}-${crypto.randomBytes(4).toString('hex')}`, callback_url: `${PUBLIC_URL}/i/${inv.token}`, metadata: { invoice_id: inv.id, invoice: inv.number } }) });
          const j = await r.json(); if (!r.ok || !j.data || !j.data.authorization_url) throw new Error(JSON.stringify(j).slice(0, 200));
          res.writeHead(303, { location: j.data.authorization_url }); return res.end();
        } catch (e) { console.error('paystack init', e.message); res.writeHead(303, { location: `/i/${inv.token}?pay=failed` }); return res.end(); }
      }
      if (mPub[2] === 'accept' && req.method === 'POST') {
        if (inv.kind === 'quote' && inv.status === 'sent') {
          await q("update invoices set status='accepted', accepted_at=now() where id=$1", [inv.id]);
          await q(`insert into tasks(title, due_at, contact_id, deal_id, created_by, priority) values ($1, now() + interval '1 day', $2, $3, 'website', 'high')`,
            [`Quotation ${inv.number} accepted by ${inv.bill_to.company || inv.bill_to.name}: send the invoice`, inv.contact_id, inv.deal_id]);
        }
        res.writeHead(303, { location: `/i/${inv.token}?accepted=1` }); return res.end();
      }
      if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
      let msg = '', fresh = inv;
      const ref = url.searchParams.get('reference') || url.searchParams.get('trxref');
      if (ref && PAYSTACK_KEY) { const x = await paystackRecord(ref).catch(() => null); if (x) { fresh = x; msg = x.status === 'paid' ? 'Thank you. Your payment is received.' : 'Thank you. Your payment is received; a balance remains.'; } }
      if (url.searchParams.get('pay') === 'failed') msg = 'Online payment could not start. Please try again or use the bank details below.';
      if (url.searchParams.get('accepted')) msg = 'Thank you. The quotation is accepted; we will send the invoice.';
      const pays = (await q('select * from invoice_payments where invoice_id=$1', [inv.id])).rows;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' });
      const credits = (await q("select number, total from invoices where credit_for=$1 and kind='credit' and status<>'void' order by id", [inv.id])).rows;
      const origNumber = inv.credit_for ? (await q('select number from invoices where id=$1', [inv.credit_for])).rows[0]?.number : null;
      return res.end(invoicePage(fresh, pays, st, { msg, credits, origNumber, payUrl: paystackOn(fresh.currency) ? `/i/${fresh.token}/pay` : null }));
    }
    if (p === '/api/hooks/paystack' && req.method === 'POST') {
      const raw = await rawBody(req, 1e6);
      if (!PAYSTACK_KEY) return json(res, 503, { error: 'not_configured' });
      const want = crypto.createHmac('sha512', PAYSTACK_KEY).update(raw).digest('hex'), got = String(req.headers['x-paystack-signature'] || '');
      if (got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) return json(res, 401, { error: 'bad_signature' });
      let d = {}; try { d = JSON.parse(raw.toString('utf8')); } catch {}
      json(res, 200, { ok: true });
      if (d.event === 'charge.success' && d.data && d.data.reference) await paystackRecord(d.data.reference).catch(e => console.error('paystack hook', e.message));
      return;
    }

    /* ---- AI helper in the back office ---- */
    if (p === '/api/ai' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      if (!OPENAI_KEY) return json(res, 503, { error: 'ai_off' });
      const b = await body(req);
      try { const r = await aiHelp(u, b); return json(res, r.error ? (r.error === 'not_found' ? 404 : r.error === 'daily_cap' ? 429 : 400) : 200, r); }
      catch (e) { console.error('ai help', String(e.message || e).slice(0, 300)); return json(res, 502, { error: 'ai_failed' }); }
    }
    if (p === '/api/whatsapp/autoreply' && (req.method === 'GET' || req.method === 'POST')) {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      if (req.method === 'POST') {
        const b = await body(req); const v = b.on === true ? 'on' : 'off';
        await q(`insert into settings(key,value) values ('wa_autoreply',$1) on conflict (key) do update set value=excluded.value`, [v]);
        await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, 'whatsapp_autoreply', v]);
      }
      const on = ((await q("select value from settings where key='wa_autoreply'")).rows[0] || {}).value === 'on';
      const recent = (await q(`select w.phone, w.direction, w.body, w.kind, w.at, c.id as contact_id, c.company, c.full_name from wa_messages w
        left join contacts c on coalesce(nullif(c.whatsapp,''), c.phone)=w.phone order by w.at desc limit 30`)).rows;
      return json(res, 200, { on, connected: waReady(), ai: !!OPENAI_KEY, recent });
    }

    /* ---- calendar ---- */
    if (p === '/api/calendar' && req.method === 'GET') {
      const u = auth(); if (!u) return json(res, 401, { error: 'no_session' });
      const from = day(url.searchParams.get('from')), to = day(url.searchParams.get('to'));
      if (!from || !to || to < from || Date.parse(to) - Date.parse(from) > 122 * 864e5) return json(res, 400, { error: 'bad_range' });
      const types = String(url.searchParams.get('types') || '').split(',').filter(t => CAL_TYPES.includes(t));
      const rows = await calEntries(u, from, to, { mine: url.searchParams.get('mine') === '1', types: types.length ? types : null });
      return json(res, 200, { rows });
    }
    if (p === '/api/calendar/feed' && (req.method === 'GET' || req.method === 'POST')) {
      const u = auth(); if (!u) return json(res, 401, { error: 'no_session' });
      let t = (await q('select cal_token from users where email=$1', [u.email])).rows[0]?.cal_token;
      if (!t || req.method === 'POST') {
        t = crypto.randomBytes(20).toString('hex');
        await q('update users set cal_token=$1 where email=$2', [t, u.email]);
        await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [u.email, 'calendar_link', req.method === 'POST' ? 'reset' : 'created']);
      }
      const link = `${PUBLIC_URL}/cal/${t}.ics`;
      return json(res, 200, { url: link, webcal: link.replace(/^https?:/, 'webcal:') });
    }

    /* ---- notes: a call, a WhatsApp, a meeting ---- */
    if (p === '/api/notes' && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const b = await body(req);
      const text = clean(b.body, 4000); if (!text) return json(res, 400, { error: 'body_required', fields: ['body'] });
      let dealId = Number(b.deal_id) || null, contactId = Number(b.contact_id) || null;
      if (dealId && !contactId) contactId = (await q('select contact_id from deals where id=$1', [dealId])).rows[0]?.contact_id || null;
      if (!dealId && !contactId) return json(res, 400, { error: 'needs_record' });
      const { rows } = await q('insert into notes(contact_id,deal_id,kind,body,author) values ($1,$2,$3,$4,$5) returning *',
        [contactId, dealId, NOTE_KINDS.includes(b.kind) ? b.kind : 'note', text, u.email]);
      if (contactId && ['call', 'whatsapp', 'meeting', 'email'].includes(rows[0].kind))
        await q(`update contacts set status=case when status in ('new') then 'contacted' else status end where id=$1`, [contactId]);
      if (dealId) await q('update deals set updated_at=now() where id=$1', [dealId]);
      return json(res, 200, rows[0]);
    }
    const mNote = p.match(/^\/api\/notes\/(\d+)$/);
    if (mNote && req.method === 'DELETE') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const n = (await q('select * from notes where id=$1', [+mNote[1]])).rows[0];
      if (!n) return json(res, 404, { error: 'not_found' });
      if (n.author !== u.email && u.role !== 'owner') return json(res, 401, { error: 'not_allowed' });
      await q('delete from notes where id=$1', [n.id]); return json(res, 200, { ok: true });
    }

    /* ---- one company/person, everything that ever happened ---- */
    const mRec = p.match(/^\/api\/contacts\/(\d+)\/record$/);
    if (mRec && req.method === 'GET') {
      if (!need('admin')) return json(res, 401, { error: 'not_allowed' });
      const c = (await q('select * from contacts where id=$1', [+mRec[1]])).rows[0];
      if (!c) return json(res, 404, { error: 'not_found' });
      const em = (c.email || '').toLowerCase(), ph = c.phone || '';
      const [deals, tasks, notes, regs, sends, mails, leads, devs] = await Promise.all([
        q('select * from deals where contact_id=$1 order by closed_at nulls first, updated_at desc', [c.id]),
        q('select * from tasks where contact_id=$1 order by done_at nulls first, due_at nulls last', [c.id]),
        q('select * from notes where contact_id=$1 order by at desc limit 200', [c.id]),
        q(`select r.id,r.reference,r.created_at,r.status,r.paid,r.amount,r.currency,r.checked_in_at,i.title from registrations r join items i on i.code=r.item_code
           where ($1<>'' and lower(r.email)=$1) or ($2<>'' and r.phone=$2) order by r.created_at desc limit 50`, [em, ph]),
        q(`select s.status,s.sent_at,s.clicked_at,s.skip_reason,cp.name from campaign_sends s join campaigns cp on cp.id=s.campaign_id where s.contact_id=$1`, [c.id]),
        q(`select subject,kind,status,created_at,sent_at from outbox where $1<>'' and lower(to_email)=$1 order by created_at desc limit 50`, [em]),
        q(`select id,tier,budget,message,status,created_at from sponsor_leads where $1<>'' and lower(email)=$1`, [em]),
        q(`select e.*, d.title from deal_events e join deals d on d.id=e.deal_id where d.contact_id=$1 order by e.at desc limit 100`, [c.id])]);
      const tl = [];
      notes.rows.forEach(n => tl.push({ at: n.at, type: n.kind, text: n.body, by: n.author, id: n.id }));
      devs.rows.forEach(e => tl.push({ at: e.at, type: 'deal', text: e.detail === 'created' ? `Deal opened: ${e.title} (${e.to_stage})` : `${e.title}: ${e.from_stage} → ${e.to_stage}${e.detail ? ' · ' + e.detail : ''}`, by: e.by_user, deal_id: e.deal_id }));
      regs.rows.forEach(r => { tl.push({ at: r.created_at, type: 'registration', text: `Registered for ${r.title} · ${r.reference} · ${r.status}`, reg_id: r.id });
        if (r.checked_in_at) tl.push({ at: r.checked_in_at, type: 'attended', text: `Attended ${r.title}`, reg_id: r.id }); });
      sends.rows.forEach(s => { if (s.sent_at) tl.push({ at: s.sent_at, type: 'campaign', text: `Sent: ${s.name}` });
        if (s.clicked_at) tl.push({ at: s.clicked_at, type: 'click', text: `Opened the link in "${s.name}"` }); });
      mails.rows.forEach(m => tl.push({ at: m.sent_at || m.created_at, type: 'email', text: `${m.status === 'sent' ? 'Email sent' : 'Email ' + m.status}: ${m.subject}` }));
      leads.rows.forEach(l => tl.push({ at: l.created_at, type: 'enquiry', text: `Sponsorship enquiry${l.tier ? ' · ' + l.tier : ''}${l.budget ? ' · budget ' + l.budget : ''}${l.message ? ': ' + l.message : ''}` }));
      tasks.rows.filter(t => t.done_at).forEach(t => tl.push({ at: t.done_at, type: 'task', text: `Done: ${t.title}`, by: t.done_by }));
      tl.push({ at: c.created_at, type: 'created', text: `Added to contacts${c.source ? ' · ' + c.source : ''}` });
      tl.sort((a, b) => new Date(b.at) - new Date(a.at));
      return json(res, 200, { contact: c, deals: deals.rows, tasks: tasks.rows, timeline: tl.slice(0, 300) });
    }
    /* a registration or a sponsor enquiry becomes a proper record */
    const mFromReg = p.match(/^\/api\/contacts\/from-registration\/(\d+)$/);
    if (mFromReg && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const r = (await q('select * from registrations where id=$1', [+mFromReg[1]])).rows[0];
      if (!r) return json(res, 404, { error: 'not_found' });
      let c = r.email ? (await q('select id from contacts where lower(email)=lower($1)', [r.email])).rows[0] : null;
      if (!c && r.phone) c = (await q('select id from contacts where phone=$1 order by id limit 1', [r.phone])).rows[0];
      if (!c) c = (await q(`insert into contacts(company,full_name,role,email,phone,sector,country,source,status)
          values ($1,$2,$3,$4,$5,$6,$7,$8,'new') returning id`,
        [r.company === 'Not given' ? null : r.company, r.full_name, r.job_title, r.email, r.phone, r.sector, r.country, 'Registration ' + r.reference])).rows[0];
      return json(res, 200, { id: c.id });
    }
    const mFromLead = p.match(/^\/api\/sponsor-leads\/(\d+)\/deal$/);
    if (mFromLead && req.method === 'POST') {
      const u = need('admin'); if (!u) return json(res, 401, { error: 'not_allowed' });
      const l = (await q('select * from sponsor_leads where id=$1', [+mFromLead[1]])).rows[0];
      if (!l) return json(res, 404, { error: 'not_found' });
      const ex = (await q('select id from deals where sponsor_lead_id=$1', [l.id])).rows[0];
      if (ex) return json(res, 200, { id: ex.id, existed: true });
      const id = await inboundDeal({ company: l.company, full_name: l.contact_name, email: l.email, phone: l.phone, kind: 'sponsorship',
        title: `${l.company} · ${l.tier ? l.tier + ' sponsorship' : 'sponsorship'}`, source: 'Website sponsor enquiry', sponsor_lead_id: l.id, owner: u.email, task: null });
      return json(res, 200, { id });
    }

    /* ---- search across the whole back office ---- */
    if (p === '/api/search' && req.method === 'GET') {
      if (!need('admin')) return json(res, 401, { error: 'not_allowed' });
      const s = clean(url.searchParams.get('q'), 80); if (s.length < 2) return json(res, 200, { contacts: [], deals: [], registrations: [] });
      const like = '%' + s.replace(/[%_]/g, '') + '%', digits = s.replace(/\D/g, '').replace(/^0+/, '');
      const [c, d, r] = await Promise.all([
        q(`select id,company,full_name,email,phone,sector from contacts where company ilike $1 or full_name ilike $1 or email ilike $1
           or ($2<>'' and length($2)>=4 and regexp_replace(coalesce(phone,''),'\\D','','g') like '%'||$2||'%') order by company nulls last limit 8`, [like, digits]),
        q(`select id,title,company,stage,value from deals where title ilike $1 or company ilike $1 order by updated_at desc limit 6`, [like]),
        q(`select r.id,r.reference,r.company,r.full_name,r.status,i.title from registrations r join items i on i.code=r.item_code
           where r.reference ilike $1 or r.company ilike $1 or r.full_name ilike $1 or r.email ilike $1
           or ($2<>'' and length($2)>=4 and regexp_replace(r.phone,'\\D','','g') like '%'||$2||'%') order by r.created_at desc limit 6`, [like, digits])]);
      return json(res, 200, { contacts: c.rows, deals: d.rows, registrations: r.rows });
    }

    /* ---- overview for the dashboard ---- */
    if (p === '/api/overview' && req.method === 'GET') {
      const u = auth(); if (!u) return json(res, 401, { error: 'no_session' });
      const staff = u.role === 'staff';
      const [pipe, won, recv, spons, wk, mine, ev, act] = await Promise.all([
        q(`select stage, count(*)::int n, coalesce(sum(value),0)::float v from deals where stage not in ('won','lost') group by stage`),
        q(`select count(*)::int n, coalesce(sum(value),0)::float v from deals where stage='won' and closed_at >= date_trunc('month', now())`),
        q(`select coalesce(sum(amount),0)::float v from registrations where paid and amount>0 and status<>'cancelled' and paid_at >= date_trunc('month', now())`),
        q(`select coalesce(sum(amount),0)::float v from sponsors where paid and created_at >= date_trunc('month', now())`),
        q(`select count(*)::int n from registrations where created_at > now() - interval '7 days'`),
        q(`select count(*) filter (where due_at < date_trunc('day', now()))::int overdue,
                  count(*) filter (where due_at >= date_trunc('day', now()) and due_at < date_trunc('day', now()) + interval '1 day')::int today,
                  count(*)::int open
           from tasks where done_at is null and assignee=$1`, [u.email]),
        q(`select i.code,i.title,i.starts_at,i.venue,i.capacity,
             coalesce((select sum(seats) from registrations r where r.item_code=i.code and r.status not in ('cancelled','declined')),0)::int seats,
             (select count(*)::int from registrations r where r.item_code=i.code and r.status='pending') pending,
             (select count(*)::int from registrations r where r.item_code=i.code and r.checked_in_at is not null) checked_in
           from items i where i.kind='event' and i.published and i.starts_at > now() order by i.starts_at limit 1`),
        staff ? { rows: [] } : q(`(select at, 'note' as type, kind as sub, body as text, author as who, contact_id, deal_id from notes order by at desc limit 12)
           union all (select e.at, 'deal', e.to_stage, d.title || coalesce(': ' || e.from_stage || ' → ' || e.to_stage, ' opened'), e.by_user, d.contact_id, d.id from deal_events e join deals d on d.id=e.deal_id order by e.at desc limit 12)
           union all (select r.created_at, 'registration', r.status, r.full_name || ' · ' || i.title, 'website', null, null from registrations r join items i on i.code=r.item_code order by r.created_at desc limit 12)
           union all (select created_at, 'enquiry', tier, company || ' asked about sponsoring', 'website', null, null from sponsor_leads order by created_at desc limit 6)
           order by 1 desc limit 15`)]);
      return json(res, 200, {
        pipeline: pipe.rows, pipeline_value: pipe.rows.reduce((a, r) => a + r.v, 0), open_deals: pipe.rows.reduce((a, r) => a + r.n, 0),
        won_month: won.rows[0], received_month: recv.rows[0].v + spons.rows[0].v, regs_week: wk.rows[0].n,
        my_tasks: mine.rows[0], next_event: ev.rows[0] || null, activity: act.rows });
    }

    /* ---- reports ---- */
    if (p === '/api/reports' && req.method === 'GET') {
      if (!need('admin')) return json(res, 401, { error: 'not_allowed' });
      const from = day(url.searchParams.get('from')) || new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
      const to = day(url.searchParams.get('to')) || new Date().toISOString().slice(0, 10);
      const P = [from, to];
      const rng = col => `${col} >= $1::date and ${col} < ($2::date + 1)`;
      const [revReg, revSp, wonM, chan, funnel, stages, kinds, winloss, taskStats, items, lostWhy] = await Promise.all([
        q(`select to_char(date_trunc('month', paid_at),'YYYY-MM') m, sum(amount)::float v, count(*)::int n from registrations
           where paid and amount>0 and status<>'cancelled' and ${rng('paid_at')} group by 1 order by 1`, P),
        q(`select to_char(date_trunc('month', created_at),'YYYY-MM') m, sum(amount)::float v, count(*)::int n from sponsors
           where paid and amount>0 and ${rng('created_at')} group by 1 order by 1`, P),
        q(`select to_char(date_trunc('month', closed_at),'YYYY-MM') m, kind, sum(value)::float v, count(*)::int n from deals
           where stage='won' and ${rng('closed_at')} group by 1,2 order by 1`, P),
        q(`select coalesce(nullif(utm_source,''),'direct') src, count(*)::int n,
             count(*) filter (where status in ('confirmed','attended') or paid)::int confirmed,
             count(*) filter (where checked_in_at is not null or status='attended')::int attended,
             coalesce(sum(amount) filter (where paid),0)::float paid
           from registrations where ${rng('created_at')} group by 1 order by 2 desc`, P),
        q(`select count(*)::int registered,
             count(*) filter (where status in ('confirmed','attended') or (paid and amount>0))::int confirmed,
             count(*) filter (where checked_in_at is not null or status='attended')::int attended,
             count(distinct r.id) filter (where exists (select 1 from contacts c join deals d on d.contact_id=c.id and d.stage='won'
                where (r.email is not null and lower(c.email)=lower(r.email)) or c.phone=r.phone))::int clients
           from registrations r where ${rng('r.created_at')}`, P),
        q(`select stage, count(*)::int n, coalesce(sum(value),0)::float v from deals group by stage`),
        q(`select kind, count(*) filter (where stage not in ('won','lost'))::int open, coalesce(sum(value) filter (where stage not in ('won','lost')),0)::float open_v,
             count(*) filter (where stage='won')::int won, coalesce(sum(value) filter (where stage='won'),0)::float won_v from deals group by kind`),
        q(`select count(*) filter (where stage='won')::int won, count(*) filter (where stage='lost')::int lost,
             coalesce(avg(extract(epoch from closed_at-created_at)/86400) filter (where stage='won'),0)::float days
           from deals where closed_at is not null and ${rng('closed_at')}`, P),
        q(`select count(*) filter (where done_at is null)::int open, count(*) filter (where done_at is null and due_at < now())::int overdue,
             count(*) filter (where ${rng('done_at')})::int done from tasks`, P),
        q(`select i.code,i.title,i.starts_at,i.capacity,count(r.id)::int regs,coalesce(sum(r.seats),0)::int seats,
             count(r.id) filter (where r.checked_in_at is not null)::int attended, coalesce(sum(r.amount) filter (where r.paid),0)::float paid
           from items i left join registrations r on r.item_code=i.code and r.status not in ('cancelled','declined')
           where i.kind='event' group by i.code,i.title,i.starts_at,i.capacity order by i.starts_at desc nulls last`),
        q(`select coalesce(nullif(lost_reason,''),'no reason given') why, count(*)::int n from deals where stage='lost' and ${rng('closed_at')} group by 1 order by 2 desc limit 8`, P)]);
      return json(res, 200, { from, to, revenue_registrations: revReg.rows, revenue_sponsors: revSp.rows, won_by_month: wonM.rows,
        channels: chan.rows, funnel: funnel.rows[0], stages: stages.rows, kinds: kinds.rows, winloss: winloss.rows[0],
        tasks: taskStats.rows[0], events: items.rows, lost_reasons: lostWhy.rows });
    }

    /* ---- static admin ---- */
    if (p === '/admin' || p === '/admin/' || (!SITE_DIR && p === '/')) {
      const html = fs.readFileSync(path.join(here, 'public', 'admin.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-frame-options': 'SAMEORIGIN' });
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
          ...(ext !== '.html' ? { 'access-control-allow-origin': '*', 'timing-allow-origin': '*' } : {}),
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

/* An inbound lead (sponsor enquiry, Family Desk family) becomes a contact, an open deal and a
   follow-up task for tomorrow, so nothing sits unanswered in a list. Returns the deal id. */
async function inboundDeal({ company, full_name, email, phone, kind, title, source, sponsor_lead_id = null, owner = null, task }) {
  const em = (email || '').toLowerCase() || null;
  let c = em ? (await q('select id,status from contacts where lower(email)=$1', [em])).rows[0] : null;
  if (!c) c = (await q(`insert into contacts(company,full_name,email,phone,source,status) values ($1,$2,$3,$4,$5,'new') returning id,status`,
    [company || null, full_name || null, em, phone || null, source])).rows[0];
  if (c.status === 'do_not_contact') return null;
  const open = (await q(`select id from deals where contact_id=$1 and kind=$2 and stage not in ('won','lost')`, [c.id, kind])).rows[0];
  if (open) return open.id;
  const d = (await q(`insert into deals(title,contact_id,company,kind,stage,owner,source,sponsor_lead_id,created_by,next_step,next_date)
      values ($1,$2,$3,$4,'lead',$5,$6,$7,'website',$8,(now() + interval '1 day')::date) returning id`,
    [title, c.id, company || full_name, kind, owner, source, sponsor_lead_id, task])).rows[0];
  await q(`insert into deal_events(deal_id,to_stage,detail,by_user) values ($1,'lead','created','website')`, [d.id]);
  if (task) await q(`insert into tasks(title,due_at,assignee,contact_id,deal_id,created_by,priority)
      values ($1, date_trunc('day', now()) + interval '1 day 10 hours', $2, $3, $4, 'website', 'high')`, [task, owner, c.id, d.id]);
  return d.id;
}
/* Look up an event once for the mail templates. */
async function itemForMail(code) {
  const it = (await q('select * from items where code=$1', [code])).rows[0];
  if (!it) return null;
  let cover_url = null;
  if (it.cover) {
    const m = (await q('select variants from media where id=$1', [it.cover])).rows[0];
    if (m && m.variants && m.variants.og) cover_url = `${MEDIA_URL}/media/${m.variants.og.jpg}`;
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
    const ch = cam.channel || 'email';
    const today = await q(`select count(*)::int as n from campaign_sends
      where campaign_id=$1 and status <> 'queued' and status <> 'skipped' and sent_at > now() - interval '24 hours'`, [cam.id]);
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

    const item = ch === 'email' ? await mailContext(cam) : null;
    for (const c of due) {
      /* re-check suppression at send time, not just when the queue was built */
      const blocked = c.status === 'do_not_contact'
        || (ch === 'email' && (!c.email || c.unsubscribed_at || c.bounced || c.consent_email === 'no'))
        || (ch === 'sms' && (!c.phone || c.sms_unsub_at || c.consent_sms === 'no'))
        || (ch === 'whatsapp' && (!(c.whatsapp || c.phone) || c.whatsapp_unsub_at || c.consent_whatsapp !== 'yes'));
      if (blocked) {
        await q("update campaign_sends set status='skipped', skip_reason='suppressed' where id=$1", [c.send_id]);
        continue;
      }
      const unsub = `${PUBLIC_URL}/u/${c.token}`;
      if (ch === 'email') {
        const links = { cta: `${PUBLIC_URL}/c/${c.token}`, unsub };
        const oid = await queueMail(c.email, c.full_name || c.company, merge(cam.subject, c),
          campaignHtml(cam, c, item, links), 'campaign', null, unsub);
        await q("update campaign_sends set status='sending', sent_at=now(), outbox_id=$2, to_addr=$3 where id=$1", [c.send_id, oid, c.email]);
      } else {
        const to = ch === 'sms' ? c.phone : (c.whatsapp || c.phone);
        const { rows: m } = await q(`insert into msg_outbox(channel,to_phone,to_name,body,template,lang,params,kind,contact_id)
          values ($1,$2,$3,$4,$5,$6,$7,'campaign',$8) returning id`,
          [ch, to, c.full_name || c.company, msgText(cam, c, c.token), cam.wa_template, cam.wa_lang, JSON.stringify(waParams(cam, c)), c.contact_id]);
        await q("update campaign_sends set status='sending', sent_at=now(), msg_id=$2, to_addr=$3 where id=$1", [c.send_id, m[0].id, to]);
      }
      await q("update contacts set last_sent_at=now(), status = case when status='new' then 'contacted' else status end where id=$1", [c.contact_id]);
      sentTotal++;
    }
    await q('insert into jobs_log(job,detail) values ($1,$2)', ['campaign', `${cam.name} (${ch}): ${due.length} released`]);
  }
  if (sentTotal) { await flushMail(Math.min(100, sentTotal + 10)); await flushMessages(Math.min(500, sentTotal + 10)); }
  return sentTotal;
}

/* ---------- AI in the back office: write, sum up, suggest ----------
   Same model and key as the website chat (Groq's free tier by default). Admins only, with its own
   daily allowance. Nothing is saved until the person presses Save: the AI only fills in fields. */
const AI_ADMIN_CAP = +(process.env.AI_ADMIN_CAP || 200);
const aiDay = { day: '', n: 0 };
const AI_RULES = `You write for Gotham Consult, a business-development and advisory firm in Accra, Ghana.
Plain, warm, professional English (or the language asked). Short sentences. No hype, no emojis, no markdown.
Prices only in Ghana cedis (GHS). Never invent facts, prices, dates, names or results: use only what you are given.
Carlson Capital Ltd is Gotham's partner only for renewable energy and AI/software; mention it only for those topics.
Gotham's WhatsApp: +233 55 041 6627. Website: gothamconsult.com.`;
const jsonFrom = t => { const m = String(t || '').match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };
async function aiHelp(u, b) {
  const today = new Date().toISOString().slice(0, 10);
  if (aiDay.day !== today) { aiDay.day = today; aiDay.n = 0; }
  if (aiDay.n >= AI_ADMIN_CAP) return { error: 'daily_cap' };
  aiDay.n++;
  const know = await askKnowledge();
  const ask = async (instr, max = 900, json = false) => askModel([{ role: 'system', content: AI_RULES + '\n\n' + know.slice(0, 9000) }, { role: 'user', content: instr }], { raw: true, max, json });
  const brief = clean(b.brief, 1200);
  if (b.task === 'email') {
    if (!brief) return { error: 'brief_required' };
    const plain = b.template === 'plain';
    const out = jsonFrom(await ask(`Write a ${plain ? 'short personal email from Joy Anthony Preston' : 'campaign email'} about: ${brief}
Use {{first_name}} for the reader's first name and {{company}} for their company where natural. ${plain ? 'Under 120 words.' : 'Under 170 words.'}
Answer only with JSON: {"subject": "under 70 characters", "body": "paragraphs separated by a blank line, starting with a greeting, no signature"}`, 900, true));
    if (!out || !out.body) return { error: 'ai_failed' };
    return { subject: clean(String(out.subject || ''), 200), body: clean(String(out.body), 6000) };
  }
  if (b.task === 'sms' || b.task === 'whatsapp') {
    if (!brief) return { error: 'brief_required' };
    const text = await ask(`Write one ${b.task === 'sms' ? 'SMS text, at most 150 characters' : 'WhatsApp message, at most 400 characters'} about: ${brief}
Start with "Hello {{first_name}}," and do not add a link or an opt-out line (they are added automatically). Answer with the message only.`, 400);
    return { text: clean(text.replace(/^["']|["']$/g, ''), b.task === 'sms' ? 300 : 900) };
  }
  if (b.task === 'designer') {
    if (!brief) return { error: 'brief_required' };
    const { rows: evs } = await itemsPublic();
    const upcoming = evs.filter(r => r.starts_at && new Date(r.starts_at) > Date.now()).map(r => `${r.code}: ${r.title}`).join('; ') || 'none';
    const out = jsonFrom(await ask(`Design an email about: ${brief}
Available block types: heading {text, size:"l"|"m"}, text {text} (paragraphs separated by a blank line, may use {{first_name}}), image {} (an empty picture slot for the user to fill),
image_text {title, text, side:"left"|"right"}, button {label, url, style:"gold"|"dark"}, event {code} (only one of these upcoming codes: ${upcoming}), sponsors {tier:"all"}, divider {}.
Use 3 to 7 blocks, start with a heading, keep text short. Buttons point to https://gothamconsult.com pages or https://wa.me/233550416627.
Answer only with JSON: {"subject": "under 70 characters", "blocks": [ ... ]}`, 1400, true));
    const blocks = cleanBlocks(out && out.blocks).filter(x => x.type !== 'event' || evs.some(r => r.code === x.code));
    if (!blocks.length) return { error: 'ai_failed' };
    return { subject: clean(String(out.subject || ''), 200), blocks };
  }
  if (b.task === 'client') {
    const c = (await q('select * from contacts where id=$1', [+b.contact_id])).rows[0];
    if (!c) return { error: 'not_found' };
    const notes = (await q('select kind, body, author, at from notes where contact_id=$1 order by at desc limit 25', [c.id])).rows;
    const deals = (await q('select title, kind, stage, value, next_step, next_date from deals where contact_id=$1 order by updated_at desc limit 8', [c.id])).rows;
    const tasks = (await q('select title, due_at, done_at from tasks where contact_id=$1 order by coalesce(due_at, created_at) desc limit 10', [c.id])).rows;
    const regs = c.email ? (await q('select r.item_code, i.title, r.status, r.paid, r.created_at from registrations r join items i on i.code=r.item_code where lower(r.email)=lower($1) order by r.created_at desc limit 8', [c.email])).rows : [];
    const facts = JSON.stringify({ company: c.company, person: c.full_name, role: c.role, sector: c.sector, city: c.city, country: c.country, type: c.client_type, status: c.status,
      tags: c.tags, source: c.source, added: c.created_at, notes: notes.map(n => `${ymdOf(n.at)} ${n.kind} (${String(n.author || '').split('@')[0]}): ${String(n.body).slice(0, 300)}`),
      deals, tasks: tasks.map(t => `${t.title} — due ${t.due_at ? ymdOf(t.due_at) : 'no date'}${t.done_at ? ' (done)' : ''}`), registrations: regs, today: ymdOf(new Date()) }).slice(0, 7000);
    const out = jsonFrom(await ask(`Here is everything the back office holds on one client, as JSON: ${facts}
Sum it up for a colleague who is about to call them. Answer only with JSON:
{"summary": "3 to 5 short sentences: who they are, what has happened so far, where things stand", "next": "one concrete next step, with a suggested date if sensible"}`, 900, true));
    if (!out || !out.summary) return { error: 'ai_failed' };
    return { summary: clean(String(out.summary), 1500), next: clean(String(out.next || ''), 300) };
  }
  if (b.task === 'deal') {
    const d = (await q('select d.*, c.full_name, c.role from deals d left join contacts c on c.id=d.contact_id where d.id=$1', [+b.deal_id])).rows[0];
    if (!d) return { error: 'not_found' };
    const notes = (await q('select kind, body, at from notes where deal_id=$1 or (contact_id=$2 and deal_id is null) order by at desc limit 12', [d.id, d.contact_id || 0])).rows;
    const out = jsonFrom(await ask(`A deal: ${JSON.stringify({ title: d.title, company: d.company, person: d.full_name, role: d.role, kind: d.kind, stage: d.stage, value_ghs: d.value,
      current_next_step: d.next_step, next_date: d.next_date, source: d.source, notes: notes.map(n => `${ymdOf(n.at)} ${n.kind}: ${String(n.body).slice(0, 240)}`), today: ymdOf(new Date()) })}
Suggest the single best next step to move it forward. Answer only with JSON: {"next_step": "under 90 characters, starts with a verb", "next_date": "YYYY-MM-DD within the next 14 days", "why": "one short sentence"}`, 600, true));
    if (!out || !out.next_step) return { error: 'ai_failed' };
    const nd = /^\d{4}-\d{2}-\d{2}$/.test(out.next_date || '') ? out.next_date : null;
    return { next_step: clean(String(out.next_step), 300), next_date: nd, why: clean(String(out.why || ''), 300) };
  }
  return { error: 'unknown_task' };
}

/* ---------- WhatsApp: the AI answers incoming messages ----------
   Only when switched on in Settings and WhatsApp is connected. A customer's message opens Meta's 24-hour
   window, so a plain text reply is allowed. Anything that needs a person becomes a task for the team. */
async function sendWhatsAppText(to, body) {
  const r = await fetch(`${process.env.WHATSAPP_API_BASE || 'https://graph.facebook.com/v21.0'}/${process.env.WHATSAPP_PHONE_ID}/messages`, { method: 'POST',
    headers: { authorization: 'Bearer ' + process.env.WHATSAPP_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: String(to).replace(/^\+/, ''), type: 'text', text: { preview_url: true, body: String(body).slice(0, 4000) } }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(JSON.stringify(d.error || d).slice(0, 300));
  return d.messages && d.messages[0] && d.messages[0].id || null;
}
const WA_HUMAN = /\b(complain|complaint|refund|angry|urgent|emergency|lawyer|court|scam|fraud|cancel my|problem with (my )?payment|speak to (a|someone|joy)|talk to (a|someone|joy)|human|real person)\b/i;
async function waInbound(msg, contactName) {
  const from = phoneGH('+' + String(msg.from || '').replace(/\D/g, ''));
  const text = String((msg.text && msg.text.body) || (msg.button && msg.button.text) || (msg.interactive && (msg.interactive.button_reply || msg.interactive.list_reply || {}).title) || '').trim();
  if (!from || !msg.id) return;
  const fresh = await q(`insert into wa_messages(phone, direction, body, msg_id, kind) values ($1,'in',$2,$3,$4) on conflict (msg_id) do nothing returning id`,
    [from, text.slice(0, 4000), msg.id, msg.type || 'text']);
  if (!fresh.rows.length) return;                                    // Meta sends a webhook again when it is unsure: answer once
  let c = (await q(`select * from contacts where coalesce(nullif(whatsapp,''), phone)=$1 or phone=$1 or whatsapp=$1 order by id limit 1`, [from])).rows[0];
  if (!c) c = (await q(`insert into contacts(full_name, phone, whatsapp, source, tags, status) values ($1,$2,$2,'WhatsApp message','whatsapp-inbound','new') returning *`,
    [clean(contactName || '', 120) || null, from])).rows[0];
  await q("insert into notes(contact_id,kind,body,author) values ($1,'whatsapp',$2,'whatsapp')", [c.id, 'Received: ' + (text || `[${msg.type}]`)]);
  if (/^(stop|unsubscribe|stop all|opt out|cancel)$/i.test(text) || c.status === 'do_not_contact' || c.whatsapp_unsub_at || c.consent_whatsapp === 'no') return;   // opted out: the team decides
  const settingOn = ((await q("select value from settings where key='wa_autoreply'")).rows[0] || {}).value === 'on';
  if (!settingOn || !waReady() || !OPENAI_KEY) return;
  const recentOut = (await q(`select count(*)::int as n from wa_messages where phone=$1 and direction='out' and at > now() - interval '1 hour'`, [from])).rows[0].n;
  if (recentOut >= 10) return;                                        // a runaway conversation waits for a person
  const handover = async why => {
    const reply = 'Thank you. I have passed this to our team and Joy will reply to you personally here on WhatsApp soon.';
    const id = await sendWhatsAppText(from, reply).catch(e => { console.error('wa reply', e.message); return null; });
    await q(`insert into wa_messages(phone, direction, body, msg_id, kind) values ($1,'out',$2,$3,'handover')`, [from, reply, id || 'local-' + crypto.randomBytes(6).toString('hex')]);
    await q("insert into notes(contact_id,kind,body,author) values ($1,'whatsapp',$2,'whatsapp AI')", [c.id, 'Sent: ' + reply]);
    await q(`insert into tasks(title, due_at, contact_id, created_by, priority, notes) values ($1, now() + interval '2 hours', $2, 'whatsapp AI', 'high', $3)`,
      [`WhatsApp from ${c.full_name || c.company || from}: reply personally`, c.id, `${why}\n\nThey wrote: ${text.slice(0, 800)}`]);
  };
  if (!text || msg.type !== 'text' || WA_HUMAN.test(text)) return handover(!text ? 'They sent a ' + (msg.type || 'message') + ', not text.' : 'Asked for a person or raised a problem.');
  const hist = (await q(`select direction, body from wa_messages where phone=$1 and id <> $2 order by at desc limit 6`, [from, fresh.rows[0].id])).rows.reverse()
    .map(m => ({ role: m.direction === 'in' ? 'user' : 'assistant', content: String(m.body).slice(0, 800) }));
  const system = `You are the WhatsApp assistant of Gotham Consult (Accra, Ghana), answering on the company's WhatsApp.
Answer only from the knowledge below. Warm, brief (at most 90 words), plain text, no markdown. Reply in the language they write in.
Prices only in Ghana cedis (GHS). Do not invent prices, dates, people or services. General information only, not legal, tax or investment advice.
If you cannot answer from the knowledge, or they want a meeting, a quote or help with their own case, end your reply with [[person]] on its own line.
Registration links: gothamconsult.com/register?e=CODE.\n\n${await askKnowledge()}`;
  const today = new Date().toISOString().slice(0, 10);
  if (askDay.day !== today) { askDay.day = today; askDay.n = 0; }
  if (askDay.n >= ASK_DAILY_CAP) return handover('The day\'s AI allowance is used up.');
  askDay.n++;
  let answer;
  try { answer = await askModel([{ role: 'system', content: system }, ...hist, { role: 'user', content: text }]); } catch (e) { console.error('wa ai', e.message); return handover('The AI could not answer just now.'); }
  const needsPerson = /\[\[\s*(person|lead)\s*\]\]/i.test(answer);   // a meeting or a quote needs a person too
  answer = answer.replace(/\[\[[^\]]{0,40}\]\]/g, '').trim();
  if (!answer) return handover('The AI had no answer.');
  const id = await sendWhatsAppText(from, answer + (needsPerson ? '\n\nI have also asked our team to follow up with you personally.' : '')).catch(e => { console.error('wa reply', e.message); return null; });
  await q(`insert into wa_messages(phone, direction, body, msg_id, kind) values ($1,'out',$2,$3,'ai')`, [from, answer, id || 'local-' + crypto.randomBytes(6).toString('hex')]);
  await q("insert into notes(contact_id,kind,body,author) values ($1,'whatsapp',$2,'whatsapp AI')", [c.id, 'Sent (AI): ' + answer]);
  if (needsPerson) await q(`insert into tasks(title, due_at, contact_id, created_by, priority, notes) values ($1, now() + interval '4 hours', $2, 'whatsapp AI', 'high', $3)`,
    [`WhatsApp from ${c.full_name || c.company || from}: follow up`, c.id, `The AI answered but they need a person.\n\nThey wrote: ${text.slice(0, 800)}\n\nAI replied: ${answer.slice(0, 800)}`]);
}

/* ---------- quotes and invoices ----------
   Ghana tax from 1 January 2026 (Value Added Tax Act 2025): VAT 15%, NHIL 2.5% and GETFund 2.5%, each on the
   same taxable value, so 20% together. The COVID-19 levy is gone. Rates live in settings so a future budget
   is a settings change, not a code change; every invoice stores the rates it was made with.
   Currency: cedis for everyone in Ghana. Bank of Ghana allows EUR/USD invoices only to non-residents or
   expatriates, paid into a foreign exchange account, at a rate benchmarked to the BoG reference rate; the
   invoice therefore records the rate and shows the cedi value, which is also what the VAT return needs. */
const TAX_DEFAULT = { vat: 15, nhil: 2.5, getfund: 2.5, since: '2026-01-01' };
const INV_KEYS = ['inv_co_name', 'inv_co_address', 'inv_tin', 'inv_vat_registered', 'inv_vat_number', 'inv_terms_days', 'inv_bank_ghs', 'inv_bank_usd', 'inv_bank_eur',
  'inv_footer', 'inv_email', 'inv_tax_vat', 'inv_tax_nhil', 'inv_tax_getfund'];
/* Bank details, entered once in Settings exactly as on the bank's letter: the cedi account, optional
   foreign exchange accounts, and the bank's correspondent banks abroad (what a sender in Europe,
   the US or the UK types into a SWIFT transfer as the intermediary bank). */
const BANK_CURS = ['USD', 'EUR', 'GBP'];
const SWIFT_RE = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/, ACCT_RE = /^[A-Z0-9-]{4,34}$/;
function cleanBank(o) {
  o = o && typeof o === 'object' ? o : {};
  const t = (v, n = 120) => clean(String(v ?? ''), n), acct = v => t(v, 40).toUpperCase().replace(/\s+/g, ''), sw = v => t(v, 14).toUpperCase().replace(/\s+/g, '');
  const out = { bank_name: t(o.bank_name), bank_address: t(o.bank_address, 300), branch: t(o.branch, 80), branch_code: t(o.branch_code, 20), swift: sw(o.swift),
    account_name: t(o.account_name), account_ghs: acct(o.account_ghs), charges: o.charges === 'SHA' ? 'SHA' : 'OUR', fx: {}, corr: [] };
  for (const c of BANK_CURS) { const a = acct(o.fx && o.fx[c]); if (a) out.fx[c] = a; }
  out.corr = (Array.isArray(o.corr) ? o.corr : []).slice(0, 6).map(x => ({ currency: BANK_CURS.includes(x && x.currency) ? x.currency : '', bank: t(x && x.bank), swift: sw(x && x.swift),
    city: t(x && x.city, 160), account: acct(x && x.account) })).filter(x => x.currency && (x.bank || x.swift));
  return out;
}
function bankErrors(b) {
  const f = [];
  if (b.swift && !SWIFT_RE.test(b.swift)) f.push('swift');
  if (b.account_ghs && !ACCT_RE.test(b.account_ghs)) f.push('account_ghs');
  for (const c of Object.keys(b.fx)) if (!ACCT_RE.test(b.fx[c])) f.push('fx_' + c);
  b.corr.forEach((x, i) => { if (x.swift && !SWIFT_RE.test(x.swift)) f.push(`corr_${i}_swift`); if (x.account && !ACCT_RE.test(x.account)) f.push(`corr_${i}_account`); });
  return f;
}
async function invSettings() {
  const r = Object.fromEntries((await q("select key,value from settings where key = any($1) or key in ('momo_number','momo_name','inv_bank')", [INV_KEYS])).rows.map(x => [x.key, x.value]));
  let bank = {}; try { bank = JSON.parse(r.inv_bank || '{}'); } catch {}
  return { ...r, bank: cleanBank(bank), co_name: r.inv_co_name || 'Gotham Consult', vat_registered: r.inv_vat_registered === 'yes', terms: +r.inv_terms_days || 14,
    rates: { vat: +(r.inv_tax_vat ?? TAX_DEFAULT.vat), nhil: +(r.inv_tax_nhil ?? TAX_DEFAULT.nhil), getfund: +(r.inv_tax_getfund ?? TAX_DEFAULT.getfund) } };
}
const r2 = n => Math.round((+n + Number.EPSILON) * 100) / 100;
const CURRENCIES = ['GHS', 'EUR', 'USD', 'GBP'], TAX_MODES = ['standard', 'zero', 'exempt', 'none'];
function cleanLines(list) {
  return (Array.isArray(list) ? list : []).slice(0, 60).map(l => ({
    description: clean(String(l && l.description || ''), 400), qty: Math.max(0, Math.min(1e6, +l.qty || 0)),
    unit: r2(Math.max(0, Math.min(1e10, +l.unit || 0))), discount: Math.max(0, Math.min(100, +l.discount || 0)) })).filter(l => l.description || l.unit);
}
/* The sums. Prices are before tax; each tax is rounded to the pesewa/cent on its own line. */
function invoiceTotals(inv, rates) {
  const lines = inv.lines || [];
  let subtotal = 0, discount = 0;
  for (const l of lines) { const gross = r2(l.qty * l.unit), off = r2(gross * (l.discount || 0) / 100); subtotal += gross; discount += off; }
  subtotal = r2(subtotal); discount = r2(discount);
  const taxable = r2(subtotal - discount), std = inv.tax_mode === 'standard';
  const vat = std ? r2(taxable * rates.vat / 100) : 0, nhil = std ? r2(taxable * rates.nhil / 100) : 0, getfund = std ? r2(taxable * rates.getfund / 100) : 0;
  const total = r2(taxable + vat + nhil + getfund), fx = inv.currency === 'GHS' ? 1 : (+inv.fx_rate || 0);
  return { subtotal, discount, taxable, vat, nhil, getfund, total, total_ghs: r2(total * fx), tax_ghs: r2((vat + nhil + getfund) * fx) };
}
/* Check an invoice against the rules before it is saved. Returns an error code or null. */
function invoiceRules(inv, st) {
  if (!CURRENCIES.includes(inv.currency)) return 'bad_currency';
  if (inv.currency !== 'GHS') {
    if (!inv.bill_to || !['non_resident', 'expatriate'].includes(inv.bill_to.residency)) return 'fx_needs_nonresident';
    if (!(+inv.fx_rate > 0)) return 'fx_rate_required';
  }
  if (inv.tax_mode === 'standard' && !st.vat_registered) return 'not_vat_registered';
  if (inv.tax_mode === 'zero' && !inv.tax_note) return 'zero_needs_reason';
  if (inv.tax_mode === 'exempt' && !inv.tax_note) return 'exempt_needs_reason';
  return null;
}
async function nextNumber(kind) {
  const y = new Date().getFullYear();
  const n = (await q(`insert into invoice_seq(kind, year, n) values ($1,$2,1) on conflict (kind, year) do update set n = invoice_seq.n + 1 returning n`, [kind, y])).rows[0].n;
  return `${({ quote: 'QUO', credit: 'CRN', receipt: 'RCT' })[kind] || 'INV'}-${y}-${String(n).padStart(4, '0')}`;
}
async function invoicePaid(id) {
  const inv = (await q('select * from invoices where id=$1', [id])).rows[0]; if (!inv || inv.kind !== 'invoice' || inv.status === 'void') return inv;
  const p = (await q('select coalesce(sum(amount + wht),0) as got from invoice_payments where invoice_id=$1', [id])).rows[0].got;
  const cr = +(await q("select coalesce(sum(total),0) as c from invoices where credit_for=$1 and kind='credit' and status<>'void'", [id])).rows[0].c;
  const status = cr >= +inv.total - 0.005 && +inv.total > 0 ? 'credited'
    : +p + cr >= +inv.total - 0.005 && +inv.total > 0 ? 'paid' : +p > 0 ? 'part_paid' : (inv.sent_at ? 'sent' : 'draft');
  if (status !== inv.status) {
    await q(`update invoices set status=$2, paid_at=case when $2='paid' then coalesce(paid_at, now()) else null end, updated_at=now() where id=$1`, [id, status]);
    if (status === 'paid' && inv.deal_id) await q("insert into notes(deal_id, contact_id, kind, body, author) values ($1,$2,'note',$3,'invoices')", [inv.deal_id, inv.contact_id, `Invoice ${inv.number} paid in full (${inv.currency} ${(+inv.total).toFixed(2)}).`]);
  }
  return (await q('select * from invoices where id=$1', [id])).rows[0];
}
const money2 = (n, cur) => `${cur} ${(+n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* The page the client sees at /i/<token>: print it or save it as PDF from the browser. */
function invoicePage(inv, pays, st, opts = {}) {
  const b = inv.bill_to || {}, isQ = inv.kind === 'quote', isC = inv.kind === 'credit', cur = inv.currency, rates = inv.rates || st.rates;
  const credits = opts.credits || [], creditTotal = credits.reduce((s, c) => s + (+c.total), 0);
  const paid = pays.reduce((s, x) => s + (+x.amount) + (+x.wht), 0), balance = isC ? 0 : r2(+inv.total - paid - creditTotal);
  const d = x => x ? new Date(x).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  const legacy = cur === 'GHS' ? st.inv_bank_ghs : cur === 'USD' ? st.inv_bank_usd : cur === 'EUR' ? st.inv_bank_eur : '';
  const taxRows = inv.tax_mode === 'standard'
    ? `<tr><td>VAT ${rates.vat}%</td><td>${money2(inv.vat, cur)}</td></tr><tr><td>NHIL ${rates.nhil}%</td><td>${money2(inv.nhil, cur)}</td></tr><tr><td>GETFund levy ${rates.getfund}%</td><td>${money2(inv.getfund, cur)}</td></tr>`
    : `<tr><td>${inv.tax_mode === 'zero' ? 'VAT zero-rated' : inv.tax_mode === 'exempt' ? 'VAT exempt' : 'No VAT charged'}${inv.tax_note ? ` <small>(${esc(inv.tax_note)})</small>` : ''}</td><td>${money2(0, cur)}</td></tr>`;
  const stamp = inv.status === 'paid' ? 'PAID' : inv.status === 'void' ? 'VOID' : inv.status === 'accepted' ? 'ACCEPTED' : inv.status === 'credited' ? 'CREDITED' : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc((isQ ? 'Quotation ' : 'Invoice ') + (inv.number || 'draft'))} · ${esc(st.co_name)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#EDEDE8;font:15px/1.5 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#0F1B2D}
.bar{max-width:210mm;margin:16px auto;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;padding:0 12px}
.btn{border:0;border-radius:999px;padding:12px 20px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;min-height:44px}
.dark{background:#0F1B2D;color:#fff}.gold{background:linear-gradient(135deg,#F4C66A,#C8963E);color:#1a1205}.line{background:#fff;color:#0F1B2D;border:1px solid #D9DCE1}
.sheet{position:relative;max-width:210mm;margin:0 auto 24px;background:#fff;padding:16mm 16mm 12mm;box-shadow:0 10px 40px rgba(0,0,0,.08);overflow:hidden}
.kente{height:6px;margin:-16mm -16mm 12mm;background:linear-gradient(90deg,#A9761F 0 25%,#0F1B2D 25% 50%,#1F6B4E 50% 75%,#C9A24B 75%)}
.top{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}.co b{font-size:20px}.co div,.meta div{color:#5A6472;font-size:13.5px}
h1{margin:0;font-size:26px;letter-spacing:.02em;text-align:right}.meta{text-align:right}
.to{margin:22px 0 16px;display:flex;gap:24px;flex-wrap:wrap}.to div{flex:1 1 220px}.lab{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8A6116;font-weight:700;margin-bottom:4px}
table.items{width:100%;border-collapse:collapse;margin-top:8px}table.items th{text-align:left;font-size:12px;color:#5A6472;border-bottom:2px solid #0F1B2D;padding:8px 6px}table.items th.num{text-align:right}
table.items td{border-bottom:1px solid #E2E4E7;padding:9px 6px;vertical-align:top}.num{text-align:right;white-space:nowrap}
.sum{margin-left:auto;margin-top:12px;min-width:280px}.sum td{padding:5px 6px}.sum td:last-child{text-align:right;white-space:nowrap}
.sum .tot td{border-top:2px solid #0F1B2D;font-weight:800;font-size:17px;padding-top:9px}.sum small{color:#5A6472}
.box{margin-top:18px;border:1px solid #E2E4E7;border-radius:12px;padding:12px 14px;font-size:13.5px;white-space:pre-wrap}.box b{white-space:normal}
.foot{margin-top:18px;font-size:12px;color:#8A93A0;border-top:1px solid #E2E4E7;padding-top:10px}
.pay{margin-top:20px}.pay h2{font-size:15px;margin:0 0 8px;letter-spacing:.02em}.pays{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px}
.pc{border:1px solid #E2E4E7;border-radius:12px;padding:12px 14px;font-size:13.5px;break-inside:avoid}.pc b.t{display:block;margin-bottom:6px;font-size:14px}.pc p{margin:0 0 8px;color:#5A6472}
.pc dl{display:grid;grid-template-columns:minmax(92px,38%) minmax(0,1fr);gap:4px 10px;margin:0}.pc dt{color:#5A6472}.pc dd{margin:0;font-weight:600;overflow-wrap:anywhere}
.pc .via{margin-top:8px;padding-top:8px;border-top:1px dashed #E2E4E7}.cp{margin-left:6px;border:1px solid #D9DCE1;background:#fff;border-radius:6px;font:600 11px/1 inherit;padding:3px 6px;cursor:pointer;color:#5A6472;vertical-align:1px}
.safe{margin-top:10px;font-size:12.5px;color:#7A5310;background:#FFF7E8;border-radius:10px;padding:8px 12px}
@media print{.cp{display:none}}
.stamp{position:absolute;right:18mm;top:58mm;transform:rotate(-12deg);border:4px solid #1F6B4E;color:#1F6B4E;font-weight:900;font-size:34px;padding:4px 16px;border-radius:10px;opacity:.8}
.stamp.void{border-color:#A1322B;color:#A1322B}.msg{max-width:210mm;margin:0 auto 12px;padding:12px 16px;border-radius:12px;background:#E1EFE8;color:#1F6B4E;font-weight:600}
@media print{body{background:#fff}.bar,.msg{display:none}.sheet{box-shadow:none;margin:0;max-width:none}}
@media(max-width:600px){.sheet{padding:18px 16px}.kente{margin:-18px -16px 18px}h1,.meta{text-align:left}.sum{min-width:0;width:100%}}
</style></head><body>
${opts.msg ? `<div class="msg">${esc(opts.msg)}</div>` : ''}
<div class="bar"><button class="btn line" onclick="print()">Print or save as PDF</button>
${!isQ && !isC && opts.payUrl && balance > 0 && !['void', 'credited'].includes(inv.status) ? `<form method="post" action="${opts.payUrl}" style="margin:0"><button class="btn gold">Pay ${esc(money2(balance, cur))} online</button></form>` : ''}
${isQ && inv.status === 'sent' ? `<form method="post" action="/i/${inv.token}/accept" style="margin:0"><button class="btn dark">Accept this quotation</button></form>` : ''}</div>
<div class="sheet"><div class="kente"></div>${stamp ? `<div class="stamp ${stamp === 'VOID' ? 'void' : ''}">${stamp}</div>` : ''}
<div class="top"><div class="co"><b>${esc(st.co_name)}</b><div>${esc(st.inv_co_address || 'Accra, Ghana')}</div>
${st.inv_tin ? `<div>TIN: ${esc(st.inv_tin)}</div>` : ''}${st.vat_registered && st.inv_vat_number ? `<div>VAT registration: ${esc(st.inv_vat_number)}</div>` : ''}
<div>${esc(st.inv_email || 'info@gothamconsult.com')} · +233 55 041 6627</div></div>
<div class="meta"><h1>${isQ ? 'QUOTATION' : isC ? 'CREDIT NOTE' : inv.tax_mode === 'standard' ? 'TAX INVOICE' : 'INVOICE'}</h1>${isC && opts.origNumber ? `<div>Credit against invoice <b>${esc(opts.origNumber)}</b></div>` : ''}
<div><b>${esc(inv.number || 'Draft')}</b></div><div>Date: ${d(inv.issue_date)}</div>
${isQ ? (inv.valid_until ? `<div>Valid until: ${d(inv.valid_until)}</div>` : '') : (inv.due_date ? `<div>Due: ${d(inv.due_date)}</div>` : '')}
${inv.evat_ref ? `<div>E-VAT ref: ${esc(inv.evat_ref)}</div>` : ''}</div></div>
<div class="to"><div><div class="lab">${isQ ? 'Prepared for' : isC ? 'Credited to' : 'Bill to'}</div><b>${esc(b.company || b.name || '')}</b>${b.company && b.name ? `<div>${esc(b.name)}</div>` : ''}
${b.address ? `<div style="white-space:pre-wrap">${esc(b.address)}</div>` : ''}${b.country ? `<div>${esc(b.country)}</div>` : ''}${b.tax_id ? `<div>Tax / VAT no.: ${esc(b.tax_id)}</div>` : ''}${b.email ? `<div>${esc(b.email)}</div>` : ''}</div>
<div><div class="lab">Currency</div><b>${cur}</b>${cur !== 'GHS' ? `<div>Exchange rate: 1 ${cur} = GHS ${(+inv.fx_rate).toFixed(4)} (${d(inv.fx_date || inv.issue_date)})</div>` : ''}</div></div>
<table class="items"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead><tbody>
${(inv.lines || []).map(l => { const g = r2(l.qty * l.unit), off = r2(g * (l.discount || 0) / 100);
  return `<tr><td style="white-space:pre-wrap">${esc(l.description)}${l.discount ? `<div style="color:#5A6472;font-size:12.5px">Discount ${l.discount}%</div>` : ''}</td><td class="num">${l.qty}</td><td class="num">${money2(l.unit, cur)}</td><td class="num">${money2(g - off, cur)}</td></tr>`; }).join('')}
</tbody></table>
<table class="sum"><tr><td>Subtotal${+inv.discount ? ' after discounts' : ''}</td><td>${money2(inv.taxable, cur)}</td></tr>${taxRows}
<tr class="tot"><td>Total</td><td>${money2(inv.total, cur)}</td></tr>
${cur !== 'GHS' ? `<tr><td><small>Total in cedis (for VAT)</small></td><td><small>${money2(inv.total_ghs, 'GHS')}</small></td></tr>${inv.tax_mode === 'standard' ? `<tr><td><small>Tax in cedis</small></td><td><small>${money2(inv.tax_ghs, 'GHS')}</small></td></tr>` : ''}` : ''}
${!isQ && !isC ? credits.map(c => `<tr><td>Credit note ${esc(c.number)}</td><td>− ${money2(c.total, cur)}</td></tr>`).join('') : ''}
${!isQ && !isC && (paid > 0 || credits.length) ? `${paid > 0 ? `<tr><td>Paid</td><td>${money2(paid, cur)}</td></tr>` : ''}<tr><td><b>Balance due</b></td><td><b>${money2(Math.max(0, balance), cur)}</b></td></tr>` : ''}</table>
${!isQ && !isC && !['void', 'paid', 'credited'].includes(inv.status) && balance > 0 ? payBlocks(inv, st, legacy, Math.max(0, balance)) : ''}
${inv.notes ? `<div class="box">${esc(inv.notes)}</div>` : ''}
<div class="foot">${esc(st.inv_footer || `${st.co_name} · Accra, Ghana · gothamconsult.com`)}${cur !== 'GHS' ? ` · Foreign-currency invoices are issued only to non-residents or expatriates${st.bank && st.bank.fx[cur] ? ', payable into our foreign exchange account' : ''} (Bank of Ghana rules).` : ''}</div>
</div></body></html>`;
}
/* Someone registered and chose "Invoice & bank transfer": prepare the invoice as a draft (the team checks
   and issues it, so numbering and tax stay in human hands) and put a task on tomorrow's list. */
async function draftFromRegistration(reg, it, g) {
  const st = await invSettings();
  const c = (g.email ? (await q('select id from contacts where lower(email)=lower($1)', [g.email])).rows[0] : null)
         || (await q('select id from contacts where phone=$1 order by id desc limit 1', [g.phone])).rows[0];
  const abroad = g.country && !/^(gh|ghana)$/i.test(g.country.trim());
  const inv = { kind: 'invoice', currency: CURRENCIES.includes(it.currency) ? it.currency : 'GHS', fx_rate: null, tax_mode: st.vat_registered ? 'standard' : 'none',
    lines: [{ description: `${it.title}${g.seats > 1 ? ` (${g.seats} seats)` : ''} · registration ${reg.reference}`, qty: g.seats || 1, unit: r2(g.amount / (g.seats || 1)), discount: 0 }] };
  const t = invoiceTotals(inv, st.rates);
  const bill = { name: g.full_name, company: g.company === 'Not given' ? '' : g.company, address: '', country: g.country || 'Ghana', email: g.email || '', tax_id: '', residency: abroad ? 'non_resident' : 'resident' };
  const id = (await q(`insert into invoices(kind, contact_id, bill_to, currency, tax_mode, rates, lines, subtotal, discount, taxable, vat, nhil, getfund, total, total_ghs, tax_ghs, notes, created_by, token)
      values ('invoice',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'website',$17) returning id`,
    [c ? c.id : null, JSON.stringify(bill), inv.currency, inv.tax_mode, JSON.stringify(st.rates), JSON.stringify(inv.lines), t.subtotal, t.discount, t.taxable, t.vat, t.nhil, t.getfund, t.total,
     inv.currency === 'GHS' ? t.total : null, inv.currency === 'GHS' ? t.tax_ghs : null, `Registration ${reg.reference}`, crypto.randomBytes(18).toString('base64url')])).rows[0].id;
  await q(`insert into tasks(title, due_at, contact_id, reg_id, created_by, priority) values ($1, now() + interval '1 day', $2, $3, 'website', 'high')`,
    [`Send the invoice to ${g.company !== 'Not given' ? g.company : g.full_name} for ${it.title} (draft ready in Invoices & quotes${st.vat_registered ? '; check whether the price included VAT' : ''})`, c ? c.id : null, reg.id]);
  return id;
}
/* "How to pay" on the client page: mobile money, bank transfer in Ghana, and international transfer (SWIFT)
   with the correspondent bank for the currency. Every value has a copy button; the reference is the invoice number. */
function payBlocks(inv, st, legacy, due) {
  const B = st.bank || {}, cur = inv.currency, ref = inv.number || '';
  const row = (k, v, copy = true) => v ? `<dt>${esc(k)}</dt><dd>${esc(v)}${copy ? ` <button type="button" class="cp" data-c="${esc(v)}" aria-label="Copy ${esc(k)}">Copy</button>` : ''}</dd>` : '';
  const cards = [];
  const bankRows = acct => row('Account name', B.account_name || st.co_name) + row('Account number', acct) + row('Bank', B.bank_name, false)
    + row('Branch', [B.branch, B.branch_code ? 'code ' + B.branch_code : ''].filter(Boolean).join(', '), false);
  const swiftCard = (c, title, lead) => {
    const acct = B.fx[c] || B.account_ghs, via = B.corr.filter(x => x.currency === c);
    return `<div class="pc"><b class="t">${title}</b><p>${lead}</p><dl>${row('Beneficiary', B.account_name || st.co_name)}${row('Account number', acct)}
      ${row('Beneficiary bank', B.bank_name, false)}${row('SWIFT / BIC', B.swift)}${row('Bank address', B.bank_address, false)}${row('Reference', ref)}
      <dt>Charges</dt><dd>${B.charges === 'SHA' ? 'SHA (shared)' : 'OUR: please pay all bank charges so the full amount arrives'}</dd></dl>
      ${via.map((x, i) => `<div class="via"><dl>${row(i ? 'Or intermediary bank' : 'Intermediary bank', x.bank, false)}${row('Intermediary SWIFT', x.swift)}${row('Location', x.city, false)}
        ${row('Our bank’s account there', x.account)}</dl></div>`).join('')}
      <p style="margin:8px 0 0">Ghana has no IBAN: enter the account number and SWIFT/BIC code.${!B.fx[c] ? ` Payments arrive in our cedi account, converted by the bank on the day.` : ''}</p></div>`;
  };
  if (B.account_ghs && B.swift) {
    if (cur === 'GHS') {
      if (st.momo_number) cards.push(`<div class="pc"><b class="t">Mobile Money</b><dl>${row('Number', st.momo_number)}${row('Name', st.momo_name || st.co_name, false)}${row('Amount', money2(due, 'GHS'))}${row('Reference', ref)}</dl></div>`);
      cards.push(`<div class="pc"><b class="t">Bank transfer in Ghana</b><dl>${bankRows(B.account_ghs)}${row('Amount', money2(due, 'GHS'))}${row('Reference', ref)}</dl></div>`);
      const cs = BANK_CURS.filter(c => B.fx[c] || B.corr.some(x => x.currency === c));
      if (cs.length) cards.push(swiftCard(cs[0], 'Paying from abroad (SWIFT)', `Send US dollars, euros or pounds; this invoice is settled when ${esc(money2(due, 'GHS'))} arrives.${cs.length > 1 ? ' Intermediary banks for other currencies below.' : ''}`)
        + cs.slice(1).map(c => `<div class="pc"><b class="t">Sending ${c}</b><dl>${B.corr.filter(x => x.currency === c).map((x, i) => row(i ? 'Or intermediary' : 'Intermediary bank', x.bank, false) + row('Intermediary SWIFT', x.swift) + row('Account there', x.account)).join('')}</dl></div>`).join(''));
    } else cards.push(swiftCard(cur, `International bank transfer in ${cur}`, `Amount <b>${esc(money2(due, cur))}</b>. Use the invoice number as the reference.`));
  }
  const body = cards.length ? `<div class="pays">${cards.join('')}</div>`
    : `<div class="pc">${cur === 'GHS' && st.momo_number ? `Mobile Money: ${esc(st.momo_number)} (${esc(st.momo_name || st.co_name)})<br>` : ''}${legacy ? esc(legacy).replace(/\n/g, '<br>') : cur === 'GHS' ? '' : `Please ask us for the ${cur} account details.`}<br>Reference: ${esc(ref)}</div>`;
  return `<div class="pay"><h2>How to pay</h2>${body}
${+inv.wht_rate ? `<p style="font-size:13px;color:#5A6472;margin:8px 0 0">If you are required to withhold tax, deduct ${(+inv.wht_rate).toString()}% withholding tax and send us the certificate.</p>` : ''}
<div class="safe">Our bank details never change by email or WhatsApp. If a message tells you otherwise, call +233 55 041 6627 before you pay.</div></div>
<script>document.addEventListener('click',function(e){var b=e.target.closest('.cp');if(!b)return;navigator.clipboard&&navigator.clipboard.writeText(b.dataset.c).then(function(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy'},1500)})})</script>`;
}
/* Receipts: every payment gets a number (RCT-YYYY-NNNN), a printable page and, when the client has an email, an email. */
async function receiptData(pid) {
  const pay = (await q('select * from invoice_payments where id=$1', [pid])).rows[0]; if (!pay) return null;
  const inv = (await q('select * from invoices where id=$1', [pay.invoice_id])).rows[0];
  if (!pay.receipt_no) { pay.receipt_no = await nextNumber('receipt'); await q('update invoice_payments set receipt_no=$2 where id=$1', [pay.id, pay.receipt_no]); }
  const got = +(await q('select coalesce(sum(amount+wht),0) s from invoice_payments where invoice_id=$1 and (paid_on < $2 or (paid_on = $2 and id <= $3))', [inv.id, pay.paid_on, pay.id])).rows[0].s;
  const cr = +(await q("select coalesce(sum(total),0) c from invoices where credit_for=$1 and kind='credit' and status<>'void'", [inv.id])).rows[0].c;
  return { pay, inv, balance: Math.max(0, r2(+inv.total - got - cr)) };
}
async function sendReceipt(pid, to) {
  const d = await receiptData(pid); if (!d) return;
  const st = await invSettings(), email = clean(to || d.inv.bill_to.email, 160).toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(email)) return;
  const link = `${PUBLIC_URL}/i/${d.inv.token}/receipt/${d.pay.id}`, who = d.inv.bill_to.name || d.inv.bill_to.company || '';
  await queueMail(email, who, `Receipt ${d.pay.receipt_no} from ${st.co_name}`, wrapMail('Thank you, payment received',
    `<p style="color:#5A6472;font-size:15px">${who ? 'Dear ' + esc(firstName(who)) + ',' : 'Hello,'}</p>
     <p style="color:#5A6472;font-size:15px">We received ${esc(money2(d.pay.amount, d.inv.currency))}${+d.pay.wht ? ` and a withholding tax deduction of ${esc(money2(d.pay.wht, d.inv.currency))}` : ''} for invoice ${esc(d.inv.number)}. ${d.balance > 0 ? `The balance is ${esc(money2(d.balance, d.inv.currency))}.` : 'The invoice is now paid in full.'}</p>
     <p style="margin:18px 0"><a href="${link}" style="background:#0F1B2D;color:#fff;text-decoration:none;border-radius:999px;padding:12px 22px;display:inline-block;font-weight:600">View the receipt</a></p>`), 'receipt', null);
  await q('update invoice_payments set receipt_sent_at=now() where id=$1', [pid]);
  flushMail(3).catch(() => {});
}
function receiptPage(d, st) {
  const { pay, inv, balance } = d, cur = inv.currency, b = inv.bill_to || {};
  const day = x => new Date(x).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const M = { momo: 'Mobile Money', bank: 'Bank transfer', card: 'Card', cash: 'Cash', cheque: 'Cheque', paystack: 'Online payment (Paystack)', other: 'Other' };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Receipt ${esc(pay.receipt_no)} · ${esc(st.co_name)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#EDEDE8;font:15px/1.5 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#0F1B2D}
.bar{max-width:150mm;margin:16px auto;display:flex;justify-content:flex-end;padding:0 12px}.btn{border:1px solid #D9DCE1;background:#fff;border-radius:999px;padding:12px 20px;font:inherit;font-weight:700;cursor:pointer;min-height:44px}
.sheet{max-width:150mm;margin:0 auto 24px;background:#fff;padding:14mm;box-shadow:0 10px 40px rgba(0,0,0,.08)}.kente{height:6px;margin:-14mm -14mm 10mm;background:linear-gradient(90deg,#A9761F 0 25%,#0F1B2D 25% 50%,#1F6B4E 50% 75%,#C9A24B 75%)}
h1{margin:0 0 4px;font-size:24px}.mut{color:#5A6472;font-size:13.5px}table{width:100%;border-collapse:collapse;margin-top:18px}td{padding:9px 4px;border-bottom:1px solid #E2E4E7}td:last-child{text-align:right;font-weight:600}
.big td{font-size:18px;font-weight:800;border-bottom:2px solid #0F1B2D}.foot{margin-top:18px;font-size:12px;color:#8A93A0}
@media print{body{background:#fff}.bar{display:none}.sheet{box-shadow:none;margin:0}}@media(max-width:600px){.sheet{padding:18px 16px}.kente{margin:-18px -16px 16px}}
</style></head><body><div class="bar"><button class="btn" onclick="print()">Print or save as PDF</button></div><div class="sheet"><div class="kente"></div>
<h1>RECEIPT</h1><div class="mut"><b style="color:#0F1B2D">${esc(pay.receipt_no)}</b> · ${day(pay.paid_on)}</div>
<p style="margin:16px 0 0"><b>${esc(st.co_name)}</b><br><span class="mut">${esc(st.inv_co_address || 'Accra, Ghana')}${st.inv_tin ? ' · TIN ' + esc(st.inv_tin) : ''}</span></p>
<p style="margin:14px 0 0"><span class="mut">Received from</span><br><b>${esc(b.company || b.name || '')}</b>${b.company && b.name ? '<br>' + esc(b.name) : ''}</p>
<table><tr><td>For invoice</td><td>${esc(inv.number)}</td></tr><tr><td>Method</td><td>${esc(M[pay.method] || pay.method)}${pay.reference ? ' · ' + esc(pay.reference) : ''}</td></tr>
<tr class="big"><td>Amount received</td><td>${money2(pay.amount, cur)}</td></tr>
${+pay.wht ? `<tr><td>Withholding tax deducted by you${pay.wht_cert ? ' (certificate received)' : ''}</td><td>${money2(pay.wht, cur)}</td></tr>` : ''}
<tr><td>Balance on the invoice after this payment</td><td>${money2(balance, cur)}</td></tr></table>
<div class="foot">${esc(st.inv_footer || `${st.co_name} · Accra, Ghana · gothamconsult.com`)}</div></div></body></html>`;
}
/* Issue a draft (number, dates, locked) and email a document: used by the buttons and by recurring invoices. */
async function issueInvoice(inv, st, actor) {
  const err = invoiceRules({ ...inv, fx_rate: inv.fx_rate }, st); if (err) return { error: err };
  if (!(inv.lines || []).length || !(+inv.total > 0)) return { error: 'empty' };
  const today = new Date().toISOString().slice(0, 10), issue = inv.issue_date ? ymdOf(inv.issue_date) : today;
  const due = inv.due_date ? ymdOf(inv.due_date) : ymdOf(new Date(Date.parse(issue) + st.terms * 864e5));
  const valid = inv.valid_until ? ymdOf(inv.valid_until) : ymdOf(new Date(Date.parse(issue) + 30 * 864e5));
  const row = (await q(`update invoices set number=$2, status='sent', issue_date=$3, due_date=$4, valid_until=$5, sent_at=now(), updated_at=now() where id=$1 and number is null returning *`,
    [inv.id, await nextNumber(inv.kind), issue, inv.kind === 'invoice' ? due : null, inv.kind === 'quote' ? valid : null])).rows[0];
  if (!row) return { inv: (await q('select * from invoices where id=$1', [inv.id])).rows[0] };
  await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [actor, 'invoice_issue', `${row.number} ${row.currency} ${row.total}`]);
  return { inv: row };
}
async function mailInvoice(inv, to, act, st, actor) {
  const isQ = inv.kind === 'quote', isC = inv.kind === 'credit', link = `${PUBLIC_URL}/i/${inv.token}`, who = inv.bill_to.name || inv.bill_to.company || '';
  const paid = +(await q('select coalesce(sum(amount+wht),0) s from invoice_payments where invoice_id=$1', [inv.id])).rows[0].s
    + +(await q("select coalesce(sum(total),0) c from invoices where credit_for=$1 and kind='credit' and status<>'void'", [inv.id])).rows[0].c;
  const subject = act === 'remind' ? `Reminder: invoice ${inv.number} from ${st.co_name}` : `${isQ ? 'Quotation' : isC ? 'Credit note' : 'Invoice'} ${inv.number} from ${st.co_name}`;
  await queueMail(to, who, subject, wrapMail(isQ ? 'Your quotation' : isC ? 'Your credit note' : act === 'remind' ? 'A friendly reminder' : 'Your invoice',
    `<p style="color:#5A6472;font-size:15px">${who ? 'Dear ' + esc(firstName(who)) + ',' : 'Hello,'}</p>
     <p style="color:#5A6472;font-size:15px">${isC ? `Please find credit note ${esc(inv.number)} for ${esc(money2(inv.total, inv.currency))}. It reduces what you owe on the invoice it refers to.` : isQ ? `Please find our quotation ${esc(inv.number)} for ${esc(money2(inv.total, inv.currency))}, valid until ${esc(ymdOf(inv.valid_until))}.`
       : act === 'remind' ? `Invoice ${esc(inv.number)} has ${esc(money2(Math.max(0, +inv.total - paid), inv.currency))} outstanding${inv.due_date ? ', due ' + esc(ymdOf(inv.due_date)) : ''}.`
       : `Please find invoice ${esc(inv.number)} for ${esc(money2(inv.total, inv.currency))}${inv.due_date ? ', due ' + esc(ymdOf(inv.due_date)) : ''}.`}</p>
     <p style="margin:18px 0"><a href="${link}" style="background:#0F1B2D;color:#fff;text-decoration:none;border-radius:999px;padding:12px 22px;display:inline-block;font-weight:600">${isQ ? 'View the quotation' : isC ? 'View the credit note' : 'View and pay'}</a></p>
     <p style="color:#5A6472;font-size:13px">You can print it or save it as a PDF from that page.</p>`), isQ ? 'quote' : 'invoice', null);
  await q('update invoices set sent_at=now() where id=$1', [inv.id]);
  await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [actor, 'invoice_' + act, `${inv.number} → ${to}`]);
  flushMail(3).catch(() => {});
}

/* Recurring invoices (retainers, memberships): a schedule keeps a copy of the invoice and makes a new one on
   each date. Cedi invoices are issued (and emailed when asked); dollar/euro/pound ones wait as drafts with a
   task, because each needs that day's exchange rate. "{month}" in a line becomes e.g. "October 2026". */
const addPeriod = (ymd, every) => { const [y, m, d] = ymd.split('-').map(Number), add = { month: 1, quarter: 3, year: 12 }[every] || 1;
  const t = new Date(Date.UTC(y, m - 1 + add, 1)), last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return ymdOf(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last)))); };
async function runSchedules() {
  const today = new Date().toISOString().slice(0, 10), st = await invSettings();
  for (const sc of (await q("select * from invoice_schedules where active and next_date <= $1 and (until is null or next_date <= until) order by id", [today])).rows) {
    const T = sc.template, day = ymdOf(sc.next_date);
    const month = new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const lines = (T.lines || []).map(l => ({ ...l, description: String(l.description || '').replace(/\{month\}/g, month) }));
    const inv = { kind: 'invoice', currency: T.currency, fx_rate: null, tax_mode: T.tax_mode, lines };
    if (inv.tax_mode === 'standard' && !st.vat_registered) inv.tax_mode = 'none';
    const t = invoiceTotals(inv, st.rates);
    const row = (await q(`insert into invoices(kind, contact_id, deal_id, bill_to, currency, tax_mode, tax_note, rates, lines, subtotal, discount, taxable, vat, nhil, getfund, total, total_ghs, tax_ghs,
        issue_date, notes, wht_rate, created_by, token) values ('invoice',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'schedule',$21) returning *`,
      [T.contact_id || null, T.deal_id || null, JSON.stringify(T.bill_to), inv.currency, inv.tax_mode, T.tax_note || null, JSON.stringify(st.rates), JSON.stringify(lines),
       t.subtotal, t.discount, t.taxable, t.vat, t.nhil, t.getfund, t.total, inv.currency === 'GHS' ? t.total : null, inv.currency === 'GHS' ? t.tax_ghs : null,
       day, T.notes || null, +T.wht_rate || 0, crypto.randomBytes(18).toString('base64url')])).rows[0];
    let note = '';
    if (inv.currency === 'GHS') {
      const r = await issueInvoice(row, st, 'schedule');
      if (r.error) note = `could not issue (${r.error})`;
      else if (sc.auto_send && /^\S+@\S+\.\S+$/.test(r.inv.bill_to.email || '')) { await mailInvoice(r.inv, r.inv.bill_to.email, 'send', st, 'schedule'); note = `${r.inv.number} issued and emailed`; }
      else note = `${r.inv.number} issued`;
    }
    if (inv.currency !== 'GHS' || /could not/.test(note)) {
      await q(`insert into tasks(title, due_at, contact_id, deal_id, created_by, priority) values ($1, now(), $2, $3, 'schedule', 'high')`,
        [`Recurring invoice for ${T.bill_to.company || T.bill_to.name} is ready as a draft: ${inv.currency !== 'GHS' ? 'add today\'s exchange rate and ' : ''}issue it`, T.contact_id || null, T.deal_id || null]);
      note = note || 'draft waiting for the exchange rate';
    }
    await q('update invoice_schedules set next_date=$2, last_invoice_id=$3, runs=runs+1, updated_at=now() where id=$1', [sc.id, addPeriod(day, sc.every), row.id]);
    await q('insert into jobs_log(job,detail) values ($1,$2)', ['recurring_invoice', `${T.bill_to.company || T.bill_to.name}: ${note}`]);
  }
}
/* ---------- the accountant's monthly pack ---------- */
async function accountantPack(m) {
  const st = await invSettings();
  const docs = (await q(`select i.*, (select number from invoices o where o.id=i.credit_for) as credit_for_number from invoices i
    where i.kind in ('invoice','credit') and i.number is not null and i.status<>'void' and to_char(i.issue_date,'YYYY-MM')=$1 order by i.issue_date, i.number`, [m])).rows;
  const pays = (await q(`select p.*, i.number, i.currency, i.fx_rate as inv_fx, i.bill_to from invoice_payments p join invoices i on i.id=p.invoice_id
    where to_char(p.paid_on,'YYYY-MM')=$1 order by p.paid_on, p.id`, [m])).rows;
  const owing = (await q(`select i.number, i.issue_date, i.due_date, i.currency, i.total, i.fx_rate, i.bill_to,
      i.total - coalesce((select sum(amount+wht) from invoice_payments x where x.invoice_id=i.id and x.paid_on <= (date_trunc('month', $1::date) + interval '1 month - 1 day')),0)
        - coalesce((select sum(c.total) from invoices c where c.credit_for=i.id and c.kind='credit' and c.status<>'void' and c.issue_date <= (date_trunc('month', $1::date) + interval '1 month - 1 day')),0) as balance
    from invoices i where i.kind='invoice' and i.number is not null and i.status<>'void' and i.issue_date <= (date_trunc('month', $1::date) + interval '1 month - 1 day') order by i.issue_date`, [m + '-01'])).rows
    .filter(r => +r.balance > 0.004);
  const fxOf = r => r.currency === 'GHS' ? 1 : +r.fx_rate || 0, sg = r => r.kind === 'credit' ? -1 : 1, d = x => x ? ymdOf(x) : '';
  const client = b => (b && (b.company || b.name)) || '';
  const sum = f => r2(docs.reduce((a, r) => a + sg(r) * f(r), 0));
  const summary = [
    ['Period', m], ['Company', st.co_name], ['TIN', st.inv_tin || ''], ['VAT registered', st.vat_registered ? 'yes' : 'no'],
    ['Invoices issued', docs.filter(r => r.kind === 'invoice').length], ['Credit notes issued', docs.filter(r => r.kind === 'credit').length],
    ['Sales before tax (GHS)', sum(r => +r.taxable * fxOf(r))], ['VAT 15% (GHS)', sum(r => +r.vat * fxOf(r))], ['NHIL 2.5% (GHS)', sum(r => +r.nhil * fxOf(r))],
    ['GETFund 2.5% (GHS)', sum(r => +r.getfund * fxOf(r))], ['Total tax charged (GHS)', sum(r => (+r.vat + +r.nhil + +r.getfund) * fxOf(r))], ['Total invoiced incl. tax (GHS)', sum(r => +r.total * fxOf(r))],
    ['Money received (GHS equivalent)', r2(pays.reduce((a, p) => a + +p.amount * (p.currency === 'GHS' ? 1 : +p.fx_rate || +p.inv_fx || 0), 0))],
    ['Withholding tax deducted by clients (GHS equivalent)', r2(pays.reduce((a, p) => a + +p.wht * (p.currency === 'GHS' ? 1 : +p.fx_rate || +p.inv_fx || 0), 0))],
    ['WHT certificates missing', pays.filter(p => +p.wht > 0 && !p.wht_cert).length],
    ['Owed to us at month end (GHS equivalent)', r2(owing.reduce((a, r) => a + +r.balance * fxOf(r), 0))]];
  const docRows = docs.map(r => [r.number, r.kind === 'credit' ? 'Credit note' : 'Invoice', r.credit_for_number || '', d(r.issue_date), d(r.due_date), client(r.bill_to), r.bill_to.tax_id || '', r.bill_to.residency || '',
    r.tax_mode, r.currency, r.currency === 'GHS' ? '' : +r.fx_rate, ...[r.taxable, r.vat, r.nhil, r.getfund, r.total].map(v => r2(sg(r) * +v)), r2(sg(r) * +r.total * fxOf(r)), r.evat_ref || '']);
  const payRows = pays.map(p => [d(p.paid_on), p.receipt_no || '', p.number, client(p.bill_to), p.method, p.reference || '', p.currency, +p.amount, +p.wht, +p.wht > 0 ? (p.wht_cert ? 'yes' : 'missing') : '',
    r2((+p.amount + +p.wht) * (p.currency === 'GHS' ? 1 : +p.fx_rate || +p.inv_fx || 0))]);
  const dmy = x => { const [y, mo, da] = ymdOf(x).split('-'); return `${da}/${mo}/${y}`; };
  const xero = { cols: ['*ContactName', 'EmailAddress', 'POAddressLine1', 'POCountry', '*InvoiceNumber', 'Reference', '*InvoiceDate', '*DueDate', 'Description', '*Quantity', '*UnitAmount', 'Discount', '*AccountCode', '*TaxType', 'Currency'], rows: [] };
  const qb = { cols: ['InvoiceNo', 'Customer', 'InvoiceDate', 'DueDate', 'Memo', 'Item(Product/Service)', 'ItemDescription', 'ItemQuantity', 'ItemRate', 'ItemAmount', 'ItemTaxCode', 'Currency'], rows: [] };
  for (const r of docs) for (const l of r.lines || []) {
    const q2 = sg(r) * (+l.qty || 0);
    xero.rows.push([client(r.bill_to), r.bill_to.email || '', (r.bill_to.address || '').split('\n')[0], r.bill_to.country || '', r.number, r.credit_for_number ? 'Credit for ' + r.credit_for_number : '',
      dmy(r.issue_date), dmy(r.due_date || r.issue_date), l.description, q2, +l.unit, +l.discount || '', '200', r.tax_mode === 'standard' ? 'VAT + NHIL + GETFund 20%' : r.tax_mode === 'zero' ? 'Zero rated' : 'Exempt / no VAT', r.currency]);
    if (r.kind === 'invoice') qb.rows.push([r.number, client(r.bill_to), d(r.issue_date), d(r.due_date || r.issue_date), r.notes || '', 'Services', l.description, +l.qty || 0, +l.unit,
      r2((+l.qty || 0) * +l.unit * (1 - (+l.discount || 0) / 100)), r.tax_mode === 'standard' ? 'VAT 20%' : r.tax_mode === 'zero' ? 'Zero-rated' : 'Exempt', r.currency]);
  }
  return { m, st, summary, docRows, payRows, owing, xero, qb, creditsForQb: docs.filter(r => r.kind === 'credit') };
}
async function packWorkbook(P) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Gotham CRM'; wb.created = new Date();
  const sheet = (name, cols, rows, widths) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow(cols).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1B2D' } };
    rows.forEach(r => ws.addRow(r));
    ws.columns.forEach((c, i) => { c.width = (widths && widths[i]) || Math.min(40, Math.max(12, String(cols[i]).length + 2)); });
    return ws;
  };
  const S = sheet('Summary', ['Item', 'Value'], P.summary, [48, 22]);
  S.addRow([]); S.addRow(['Notes']).font = { bold: true };
  ['Amounts in foreign currency are converted at the exchange rate recorded on each invoice (or on the payment when given).',
   'Credit notes are negative. Void invoices are left out; their numbers stay in the back office so there are no gaps.',
   'Withholding tax deducted by clients is a tax credit for Gotham: keep the certificates (see Payments).',
   'The Xero and QuickBooks sheets are ready to import; check the account code and tax rate names against your file on the first import.'].forEach(t => S.addRow([t]));
  sheet('Invoices & credit notes', ['Number', 'Type', 'Credit for', 'Date', 'Due', 'Client', 'Client TIN', 'Residency', 'Tax treatment', 'Currency', 'Exchange rate', 'Before tax', 'VAT', 'NHIL', 'GETFund', 'Total', 'Total in GHS', 'E-VAT ref'], P.docRows);
  sheet('Payments & WHT', ['Date', 'Receipt', 'Invoice', 'Client', 'Method', 'Reference', 'Currency', 'Amount received', 'WHT deducted', 'WHT certificate', 'Settled in GHS'], P.payRows);
  sheet('Owed at month end', ['Invoice', 'Date', 'Due', 'Client', 'Currency', 'Balance'], P.owing.map(r => [r.number, ymdOf(r.issue_date), r.due_date ? ymdOf(r.due_date) : '', (r.bill_to.company || r.bill_to.name), r.currency, r2(+r.balance)]));
  sheet('Xero import', P.xero.cols, P.xero.rows);
  const Q = sheet('QuickBooks import', P.qb.cols, P.qb.rows);
  if (P.creditsForQb.length) { Q.addRow([]); Q.addRow(['Credit notes this month (enter in QuickBooks as credit memos): ' + P.creditsForQb.map(c => `${c.number} (${c.currency} ${c.total}, for ${c.credit_for_number})`).join('; ')]); }
  return wb.xlsx.writeBuffer();
}
/* Paystack: pay by card or mobile money. GHS and USD; EUR is paid by bank transfer. */
const PAYSTACK_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK = (process.env.PAYSTACK_API_BASE || 'https://api.paystack.co').replace(/\/$/, '');
const paystackOn = cur => !!PAYSTACK_KEY && ['GHS', 'USD'].includes(cur);
async function paystackRecord(ref) {
  const r = await fetch(`${PAYSTACK}/transaction/verify/${encodeURIComponent(ref)}`, { headers: { authorization: 'Bearer ' + PAYSTACK_KEY }, signal: AbortSignal.timeout(15e3) });
  const j = await r.json().catch(() => ({})), t = j.data || {};
  if (!r.ok || t.status !== 'success') return null;
  const id = +(t.metadata && t.metadata.invoice_id); const inv = id && (await q('select * from invoices where id=$1', [id])).rows[0];
  if (!inv || String(t.currency).toUpperCase() !== inv.currency) return null;
  const ins = await q(`insert into invoice_payments(invoice_id, paid_on, amount, method, reference, note, recorded_by) values ($1, current_date, $2, 'paystack', $3, $4, 'paystack')
    on conflict (method, reference) where reference is not null and method = 'paystack' do nothing returning id`, [inv.id, r2(t.amount / 100), ref, `Paystack ${t.channel || ''}`.trim()]);
  if (ins.rows[0]) {
    await q('update invoice_payments set receipt_no=$2 where id=$1', [ins.rows[0].id, await nextNumber('receipt')]);
    if (inv.bill_to && inv.bill_to.email) await sendReceipt(ins.rows[0].id).catch(e => console.error('receipt', e.message));
  }
  return invoicePaid(inv.id);
}

/* ---------- calendar: every dated thing in one place ----------
   Events, tasks and follow-ups, deal next steps, deals won and lost, campaigns (scheduled
   starts and what went out each day), logged calls and meetings, registrations and payments
   per day, sponsor start and end dates. Each entry says where it lives, so a click opens it. */
const ymdOf = d => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
const CAL_TYPES = ['event', 'task', 'deal', 'closed', 'campaign', 'activity', 'registration', 'payment', 'sponsor'];
async function calEntries(u, from, to, opt = {}) {
  const admin = u.role !== 'staff', mine = !!opt.mine, want = t => (!opt.types || opt.types.includes(t)) && (admin || ['event', 'task', 'registration', 'payment'].includes(t));
  const lo = from + 'T00:00:00Z', hi = to + 'T23:59:59Z', out = [];
  if (want('event')) {
    const { rows } = await q(`select i.code, i.title, i.kind, i.venue, i.starts_at, i.ends_at, i.capacity, i.published, i.phase,
        (select coalesce(sum(r.seats),0)::int from registrations r where r.item_code=i.code and r.status in ('new','pending','confirmed','attended')) as taken
      from items i where i.starts_at is not null and i.starts_at <= $2 and coalesce(i.ends_at, i.starts_at) >= $1 ${admin ? '' : 'and i.published'}
      order by i.starts_at`, [lo, hi]);
    for (const r of rows) out.push({ key: 'event-' + r.code, type: 'event', id: r.code, title: r.title,
      sub: [r.venue, `${r.taken}${r.capacity ? '/' + r.capacity : ''} registered`, r.published ? '' : 'draft'].filter(Boolean).join(' · '),
      start: r.starts_at, end: r.ends_at, all_day: false, location: r.venue || '', link: { kind: 'event', id: r.code } });
  }
  if (want('task')) {
    const cond = !admin ? 'and t.assignee=$3' : mine ? 'and (t.assignee=$3 or (t.assignee is null and t.created_by=$3))' : '';
    const { rows } = await q(`select t.id, t.title, t.due_at, t.done_at, t.priority, t.assignee, c.company, c.full_name, d.title as deal_title
      from tasks t left join contacts c on c.id=t.contact_id left join deals d on d.id=t.deal_id
      where t.due_at between $1 and $2 ${cond} order by t.due_at`, cond ? [lo, hi, u.email] : [lo, hi]);
    for (const r of rows) out.push({ key: 'task-' + r.id, type: 'task', id: r.id, title: r.title,
      sub: [admin ? (r.company || r.full_name) : '', r.deal_title, r.assignee ? r.assignee.split('@')[0] : 'unassigned'].filter(Boolean).join(' · '),
      start: r.due_at, all_day: /T00:00:00/.test(new Date(r.due_at).toISOString()), done: !!r.done_at, high: r.priority === 'high',
      mine: r.assignee === u.email, movable: true, link: { kind: 'task', id: r.id } });
  }
  if (want('deal')) {
    const { rows } = await q(`select id, title, company, next_step, next_date, owner, value, stage from deals
      where next_date between $1::date and $2::date and stage not in ('won','lost') ${mine ? 'and owner=$3' : ''} order by next_date`,
      mine ? [from, to, u.email] : [from, to]);
    for (const r of rows) out.push({ key: 'deal-' + r.id, type: 'deal', id: r.id, title: r.next_step || 'Next step: ' + r.title,
      sub: [r.company, r.title, Number(r.value) ? 'GHS ' + Number(r.value).toLocaleString('en-GB') : '', r.stage].filter(Boolean).join(' · '),
      start: ymdOf(r.next_date), all_day: true, mine: r.owner === u.email, movable: true, link: { kind: 'deal', id: r.id } });
  }
  if (want('closed')) {
    const { rows } = await q(`select id, title, company, stage, value, closed_at, owner from deals
      where closed_at between $1 and $2 and stage in ('won','lost') ${mine ? 'and owner=$3' : ''}`, mine ? [lo, hi, u.email] : [lo, hi]);
    for (const r of rows) out.push({ key: 'closed-' + r.id, type: 'closed', id: r.id, title: (r.stage === 'won' ? 'Won: ' : 'Lost: ') + r.title,
      sub: [r.company, Number(r.value) ? 'GHS ' + Number(r.value).toLocaleString('en-GB') : ''].filter(Boolean).join(' · '),
      start: r.closed_at, all_day: false, won: r.stage === 'won', link: { kind: 'deal', id: r.id } });
  }
  if (want('campaign')) {
    const { rows: sch } = await q(`select id, name, channel, starts_at, status from campaigns where status='scheduled' and starts_at between $1 and $2`, [lo, hi]);
    for (const r of sch) out.push({ key: 'camp-' + r.id, type: 'campaign', id: r.id, title: 'Starts: ' + r.name,
      sub: (r.channel === 'sms' ? 'SMS' : r.channel === 'whatsapp' ? 'WhatsApp' : 'Email') + ' · scheduled', start: r.starts_at, all_day: false,
      movable: true, link: { kind: 'campaign', id: r.id } });
    const { rows: sent } = await q(`select c.id, c.name, c.channel, date_trunc('day', s.sent_at) as d, count(*)::int as n,
        count(s.clicked_at)::int as clicks
      from campaign_sends s join campaigns c on c.id=s.campaign_id
      where s.sent_at between $1 and $2 group by c.id, c.name, c.channel, date_trunc('day', s.sent_at)`, [lo, hi]);
    for (const r of sent) out.push({ key: `sent-${r.id}-${ymdOf(r.d)}`, type: 'campaign', id: r.id, title: `${r.name}: ${r.n} sent`,
      sub: (r.channel === 'sms' ? 'SMS' : r.channel === 'whatsapp' ? 'WhatsApp' : 'Email') + (r.clicks ? ` · ${r.clicks} clicked` : ''),
      start: ymdOf(r.d), all_day: true, link: { kind: 'campaign', id: r.id } });
  }
  if (want('activity')) {
    const { rows } = await q(`select n.id, n.kind, n.body, n.at, n.author, n.contact_id, n.deal_id, c.company, c.full_name
      from notes n left join contacts c on c.id=n.contact_id where n.at between $1 and $2 ${mine ? 'and n.author=$3' : ''} order by n.at`,
      mine ? [lo, hi, u.email] : [lo, hi]);
    const KN = { note: 'Note', call: 'Call', whatsapp: 'WhatsApp', meeting: 'Meeting', email: 'Email' };
    for (const r of rows) out.push({ key: 'note-' + r.id, type: 'activity', id: r.id, title: `${KN[r.kind] || 'Note'}: ${r.company || r.full_name || 'contact'}`,
      sub: [String(r.body || '').slice(0, 90), r.author ? r.author.split('@')[0] : ''].filter(Boolean).join(' · '), start: r.at, all_day: false,
      link: r.contact_id ? { kind: 'rec', id: r.contact_id } : { kind: 'deal', id: r.deal_id } });
  }
  if (want('registration')) {
    const { rows } = await q(`select r.item_code, i.title, date_trunc('day', r.created_at) as d, count(*)::int as n, coalesce(sum(r.seats),0)::int as seats
      from registrations r join items i on i.code=r.item_code where r.created_at between $1 and $2 group by r.item_code, i.title, date_trunc('day', r.created_at)`, [lo, hi]);
    for (const r of rows) out.push({ key: `reg-${r.item_code}-${ymdOf(r.d)}`, type: 'registration', id: r.item_code,
      title: `${r.n} registration${r.n === 1 ? '' : 's'}`, sub: r.title + (r.seats > r.n ? ` · ${r.seats} seats` : ''), start: ymdOf(r.d), all_day: true,
      link: { kind: 'regs', id: r.item_code } });
  }
  if (want('payment')) {
    const { rows } = await q(`select r.item_code, i.title, date_trunc('day', r.paid_at) as d, count(*)::int as n, coalesce(sum(r.amount),0) as amt
      from registrations r join items i on i.code=r.item_code where r.paid and r.paid_at between $1 and $2 group by r.item_code, i.title, date_trunc('day', r.paid_at)`, [lo, hi]);
    for (const r of rows) out.push({ key: `pay-${r.item_code}-${ymdOf(r.d)}`, type: 'payment', id: r.item_code,
      title: `${r.n} payment${r.n === 1 ? '' : 's'}${admin ? ' · GHS ' + Number(r.amt).toLocaleString('en-GB') : ''}`, sub: r.title, start: ymdOf(r.d), all_day: true,
      link: { kind: 'regs', id: r.item_code } });
  }
  if (want('sponsor')) {
    const { rows } = await q(`select id, name, tier, starts_on, ends_on from sponsors
      where (starts_on between $1::date and $2::date) or (ends_on between $1::date and $2::date)`, [from, to]);
    for (const r of rows) {
      for (const [k, dte] of [['starts', r.starts_on], ['ends', r.ends_on]]) {
        if (!dte) continue; const s = ymdOf(dte); if (s < from || s > to) continue;
        out.push({ key: `spon-${r.id}-${k}`, type: 'sponsor', id: r.id, title: `Sponsor ${k}: ${r.name}`, sub: r.tier || '', start: s, all_day: true,
          link: { kind: 'spon', id: r.id } });
      }
    }
  }
  return out.sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

/* iCalendar text (RFC 5545): escaped, folded at 75 octets, CRLF line ends. */
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsFold = line => {
  const out = []; let cur = '';
  for (const ch of line) { if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) { out.push(cur); cur = ch; } else cur += ch; }
  out.push(cur); return out.join('\r\n ');
};
const icsStamp = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function icsCalendar(name, entries, link) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gotham Consult//Back office//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsEsc(name), 'X-WR-TIMEZONE:Africa/Accra', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  const now = icsStamp(new Date());
  for (const e of entries) {
    L.push('BEGIN:VEVENT', 'UID:' + e.key + '@gothamconsult.com', 'DTSTAMP:' + now);
    if (e.all_day) {
      const d = ymdOf(e.start), n = ymdOf(new Date(Date.parse(d + 'T00:00:00Z') + 864e5));
      L.push('DTSTART;VALUE=DATE:' + d.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + n.replace(/-/g, ''));
    } else {
      const s = new Date(e.start), en = e.end && new Date(e.end) > s ? new Date(e.end) : new Date(s.getTime() + (e.type === 'event' ? 3 : 0.5) * 36e5);
      L.push('DTSTART:' + icsStamp(s), 'DTEND:' + icsStamp(en));
    }
    L.push('SUMMARY:' + icsEsc((e.done ? '✓ ' : '') + e.title));
    if (e.sub || e.location) L.push('DESCRIPTION:' + icsEsc([e.sub, e.url || link].filter(Boolean).join('\n')));
    if (e.location) L.push('LOCATION:' + icsEsc(e.location));
    if (e.url || link) L.push('URL:' + (e.url || link));
    if (e.done) L.push('STATUS:CANCELLED');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(icsFold).join('\r\n') + '\r\n';
}
/* Published events for the public: the website calendar and "Add to my calendar". */
async function publicEvents(code) {
  const { rows } = await q(`select code, title, subtitle, venue, starts_at, ends_at, price, currency, slug from items
    where published and starts_at is not null and kind in ('event','briefing') ${code ? 'and code=$1' : "and starts_at > now() - interval '180 days'"} order by starts_at`, code ? [code] : []);
  return rows.map(r => ({ key: 'gc-event-' + r.code, type: 'event', title: r.title, start: r.starts_at, end: r.ends_at, all_day: false,
    location: r.venue || '', sub: r.subtitle || '', url: `${SITE_URL.replace(/\/$/, '')}/register?e=${encodeURIComponent(r.code)}` }));
}

/* Start a campaign: build its queue from the audience as it is right now. */
async function startCampaign(cam, actor) {
  if (cam.channel === 'sms' && !cam.sms_text) return { error: 'sms_text_missing' };
  if (cam.channel === 'whatsapp' && !cam.wa_template && waReady()) return { error: 'wa_template_missing' };
  const { where, vals } = segmentSql(cam);
  const { rows: aud } = await q(`select c.id, c.email, c.phone, c.whatsapp from contacts c where ${where} order by c.id`, vals);
  if (!aud.length) return { error: 'empty_audience' };
  const seenAddr = new Set();
  for (const a of aud) {
    const addr = String(toAddr(cam.channel || 'email', a) || '').toLowerCase();
    if (seenAddr.has(addr)) continue;            // one message per email or phone number, even if two records share it
    seenAddr.add(addr);
    await q(`insert into campaign_sends(campaign_id,contact_id,token,channel,to_addr) values ($1,$2,$3,$4,$5)
             on conflict (campaign_id,contact_id) do nothing`, [cam.id, a.id, tok() + tok(), cam.channel || 'email', addr]);
  }
  await q("update campaigns set status='sending', starts_at=coalesce(starts_at, now()) where id=$1", [cam.id]);
  await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)',
    [actor, 'campaign_start', `${cam.name} → ${aud.length} contacts, ${cam.daily_limit}/day`]);
  return { queued: aud.length };
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

    // 4. Brief subscribers and forum registrants into the client database
    await syncRegistrations();
    // 5. outreach campaigns, within their daily limit; then whatever email, SMS and WhatsApp is waiting
    // scheduled campaigns whose time has come
    for (const cam of (await q("select * from campaigns where status='scheduled' and starts_at <= now()")).rows) {
      const r = await startCampaign(cam, 'schedule');
      if (r.error) { await q("update campaigns set status='paused' where id=$1", [cam.id]);
        await q('insert into jobs_log(job,detail) values ($1,$2)', ['campaign_schedule', `${cam.name}: not started (${r.error})`]); }
      else await q('insert into jobs_log(job,detail) values ($1,$2)', ['campaign_schedule', `${cam.name}: started, ${r.queued} queued`]);
    }
    await runCampaigns();
    await flushMail(60);
    await flushMessages(200);
  } catch (e) { console.error('jobs', e); }
  await runSchedules().catch(e => console.error('schedules', e.message));
  await watchdog().catch(e => console.error('watchdog', e.message));
}

/* ---------- website visitors, privacy-friendly ----------
   No cookies, no IP addresses stored: a visitor is a hash of IP + browser with a salt that changes every day, so
   people can be counted per day but never followed from one day to the next. Team members signed in are not counted. */
const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|curl|wget|python|fetch|uptime/i;
const dayKey = () => new Date().toISOString().slice(0, 10);
const visitorOf = (ip, ua) => crypto.createHmac('sha256', SECRET).update('v:' + dayKey()).digest('hex').slice(0, 16) + ':' + crypto.createHash('sha256').update(ip + '|' + ua).digest('hex').slice(0, 16);
const visitorHash = (ip, ua) => crypto.createHash('sha256').update(visitorOf(ip, ua)).digest('hex').slice(0, 20);
async function webEnquiry(req, ip, what) {
  const v = visitorHash(ip, String(req.headers['user-agent'] || ''));
  const first = (await q("select path, ref from page_hits where day=current_date and visitor=$1 and kind='view' order by id limit 1", [v])).rows[0];
  await q("insert into page_hits(path, ref, visitor, kind, what) values ($1,$2,$3,'enquiry',$4)", [first ? first.path : '(unknown)', first ? first.ref : null, v, what]);
}
/* ---------- safety net: backups, email delivery, certificate, off-site copies ----------
   backup.sh (cron on the server) writes backup_status; the Mac job writes backup_offsite. Every hour the
   watchdog looks at them and warns the people in Settings → Safety net (email, and WhatsApp once connected),
   at most once every 12 hours per problem. */
const getSetting = async k => (await q('select value from settings where key=$1', [k])).rows[0]?.value;
const setSetting = (k, v) => q('insert into settings(key,value) values ($1,$2) on conflict (key) do update set value=excluded.value', [k, v]);
const jparse = (t, d = null) => { try { return JSON.parse(t); } catch { return d; } };
function certDays(host) {
  return new Promise(res => {
    const sock = tls.connect({ host, port: 443, servername: host, timeout: 8000 }, () => {
      const c = sock.getPeerCertificate(); sock.end();
      res(c && c.valid_to ? Math.floor((Date.parse(c.valid_to) - Date.now()) / 864e5) : null);
    });
    sock.on('error', () => res(null)); sock.on('timeout', () => { sock.destroy(); res(null); });
  });
}
async function safetyReport() {
  const bs = jparse(await getSetting('backup_status')), off = jparse(await getSetting('backup_offsite'));
  const hrs = t => t ? (Date.now() - Date.parse(t)) / 36e5 : Infinity;
  const failed = +(await q("select count(*) n from outbox where status='failed' and created_at > now() - interval '24 hours'")).rows[0].n;
  const host = new URL(PUBLIC_URL).hostname;
  const days = /^(127\.|localhost)/.test(host) ? null : await certDays(host);
  const problems = [];
  if (!bs) problems.push(['backup', 'No backup has been recorded yet.']);
  else if (!bs.ok) problems.push(['backup', `The last backup failed: ${bs.detail}`]);
  else if (hrs(bs.at) > 36) problems.push(['backup', `The last good backup is ${Math.round(hrs(bs.at))} hours old.`]);
  if (off && hrs(off.at) > 24 * 4) problems.push(['offsite', `The last off-site copy is ${Math.round(hrs(off.at) / 24)} days old. Is the Mac switched on?`]);
  if (failed > 5) problems.push(['mail', `${failed} emails failed to send in the last 24 hours.`]);
  if (days != null && days < 14) problems.push(['cert', `The security certificate for ${host} expires in ${days} days.`]);
  return { backup: bs, offsite: off, mail_failed_24h: failed, cert_days: days, host, problems,
    alert_emails: (await getSetting('alert_emails')) || '', alert_whatsapp: (await getSetting('alert_whatsapp')) || '' };
}
async function alertTeam(subject, lines) {
  let to = String((await getSetting('alert_emails')) || '').split(/[,;\s]+/).filter(e => /^\S+@\S+\.\S+$/.test(e));
  if (!to.length) to = (await q("select email from users where role='owner' and coalesce(active,true)")).rows.map(r => r.email).filter(e => /@/.test(e));
  for (const e of to.slice(0, 5)) await queueMail(e, '', subject, wrapMail(subject, lines.map(l => `<p style="color:#5A6472;font-size:15px">${esc(l)}</p>`).join('')), 'alert', null);
  const wa = await getSetting('alert_whatsapp');
  if (wa && process.env.WHATSAPP_TOKEN) await sendWhatsAppText(wa, subject + '\n' + lines.join('\n')).catch(() => {});
  flushMail(5).catch(() => {});
  return to.length;
}
async function watchdog() {
  const last = +(await getSetting('watchdog_at') || 0); if (Date.now() - last < 55 * 60e3) return;
  await setSetting('watchdog_at', String(Date.now()));
  await q("delete from page_hits where day < current_date - 400");
  const r = await safetyReport();
  for (const [kind, text] of r.problems) {
    const k = 'alert_last_' + kind, prev = +(await getSetting(k) || 0);
    if (Date.now() - prev < 12 * 36e5) continue;
    await setSetting(k, String(Date.now()));
    await alertTeam('Gotham platform: please check', [text, 'Open the back office → Settings → Safety net for details.']);
    await q('insert into jobs_log(job,detail) values ($1,$2)', ['watchdog', text.slice(0, 300)]);
  }
}

init().then(() => {
  server.listen(PORT, () => console.log('CRM on', PORT));
  runJobs();
  setInterval(runJobs, +process.env.JOBS_EVERY_MS || 15 * 60 * 1000);      // every 15 minutes (tests use less)
}).catch(e => { console.error(e); process.exit(1); });
