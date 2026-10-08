/* Gotham members: free accounts, paid plans and the compliance calendar.

   Free account   sign-in by an emailed link (no password), sectors and language chosen by the member, a weekly digest
                  of the report updates a person approved, the next compliance deadlines as a preview.
   Paid           Pro membership, compliance calendar per company, expert calls and counterparty checks. Every purchase
                  is a normal cedi invoice (VAT and levies added by the invoice rules), paid on the /i/ page by Paystack
                  (card, mobile money) or bank transfer; the plan starts when the invoice is paid. Renewal invoices go out
                  7 days before a plan ends. Staff can grant a plan (e.g. compliance free for year 1 with a registration).
   Smart          every step leaves a trail in the back office: a contact tagged member / member-pro / member-compliance,
                  a lead deal on purchase, tasks for calls and checks, a "we file it for you" offer before each deadline,
                  a follow-up task when a free member keeps reading a sector, and the numbers on the Members dashboard.
   Text the member sees comes from site-i18n/<lang>.json (keyed by the English text). */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
export const LANGS = ['en', 'fr', 'es', 'de', 'ar', 'zh'];
export const SECTORS = ['macro', 'mining', 'energy', 'agri', 'industry'];
/* prices in cedis, before VAT and levies (member-products.json); the back office can change them (setting member_prices) */
export const PRODUCTS = JSON.parse(fs.readFileSync(path.join(HERE, 'member-products.json'), 'utf8')).products;
const RULES = JSON.parse(fs.readFileSync(path.join(HERE, 'compliance-rules.json'), 'utf8'));
const TR = Object.fromEntries(LANGS.slice(1).map(l => {
  try { return [l, JSON.parse(fs.readFileSync(path.join(HERE, 'site-i18n', l + '.json'), 'utf8')).strings || {}]; } catch { return [l, {}]; }
}));
export const tr = (lang, s) => (TR[lang] || {})[s] || s;
export const PERMITS = RULES.permit_suggestions || [];

const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const ymd = d => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
const addMonths = (d, n) => { const x = new Date(d + 'T00:00:00Z'); const day = x.getUTCDate(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); x.setUTCDate(Math.min(day, last)); return ymd(x); };

/* ---------- compliance: the dates a company must meet, from compliance-rules.json ---------- */
const isWeekend = d => [0, 6].includes(d.getUTCDay());
function workday(d, rule) {           // when a deadline falls on a weekend the rules say: the next working day, or the last one before
  const x = new Date(d);
  if (rule === 'next') while (isWeekend(x)) x.setUTCDate(x.getUTCDate() + 1);
  if (rule === 'previous') while (isWeekend(x)) x.setUTCDate(x.getUTCDate() - 1);
  return x;
}
const lastWorkday = (y, m) => { const x = new Date(Date.UTC(y, m + 1, 0)); while (isWeekend(x)) x.setUTCDate(x.getUTCDate() - 1); return x; };
export function deadlines(co, from = new Date(), days = 120) {
  const out = [], start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())), end = new Date(start.getTime() + days * 864e5);
  const ye = Math.min(12, Math.max(1, +co.year_end_month || 12));
  const has = k => ({ employees: !!co.has_employees, vat: !!co.vat_registered, always: true, foreign: co.foreign_owned !== false, foreign_staff: !!co.foreign_staff })[k] ?? true;
  for (const r of RULES.rules) {
    if (!(r.applies || ['always']).every(has)) continue;
    for (let i = -2; i < 16; i++) {
      const base = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1)); const y = base.getUTCFullYear(), m = base.getUTCMonth();
      let due = null, period = '';
      if (r.when.type === 'monthly_day') { due = new Date(Date.UTC(y, m, r.when.day)); const pm = new Date(Date.UTC(y, m - 1, 1)); period = pm.toISOString().slice(0, 7); }
      else if (r.when.type === 'monthly_last_workday') { due = lastWorkday(y, m); const pm = new Date(Date.UTC(y, m - 1, 1)); period = pm.toISOString().slice(0, 7); }
      else if (r.when.type === 'quarterly_after_year_end') {   // e.g. provisional tax: end of the 3rd, 6th, 9th and 12th month of the basis period
        const months = r.when.months || [3, 6, 9, 12]; const ys = (ye % 12);   // month index after year end (0 = January when ye = 12)
        const rel = ((m - ys) % 12 + 12) % 12 + 1;   // 1..12 = month of the basis period
        if (!months.includes(rel)) continue;
        due = r.when.day === 'last' ? new Date(Date.UTC(y, m + 1, 0)) : new Date(Date.UTC(y, m, r.when.day)); period = `Q${months.indexOf(rel) + 1}`;
      } else if (r.when.type === 'months_after_year_end') {
        if (((m - (ye % 12) - (r.when.months - 1)) % 12 + 12) % 12 !== 0) continue;
        due = new Date(Date.UTC(y, m + 1, 0)); period = `FY ending ${String(ye).padStart(2, '0')}`;
      } else if (r.when.type === 'yearly_date') {
        if (m !== r.when.month - 1) continue;
        due = new Date(Date.UTC(y, m, r.when.day)); period = String(y);
      } else if (r.when.type === 'anniversary' && co.incorporated_on) {
        const inc = new Date(co.incorporated_on + 'T00:00:00Z'); if (inc.getUTCMonth() !== m) continue;
        due = new Date(Date.UTC(y, m, Math.min(inc.getUTCDate(), new Date(Date.UTC(y, m + 1, 0)).getUTCDate())));
        if (r.when.offset_days) due = new Date(due.getTime() + r.when.offset_days * 864e5);
        period = String(y);
      } else continue;
      if (!due) continue;
      due = workday(due, r.when.weekend);
      if (due < start || due > end) continue;
      out.push({ key: r.id, name: r.name, due: ymd(due), period, how: r.how || '', source_url: r.source_url, penalty: r.penalty || '', filing_offer: r.filing_offer !== false });
    }
  }
  for (const p of Array.isArray(co.permits) ? co.permits : []) {   // permits and certificates the member typed in, with their expiry dates
    if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(p.expires || '')) continue;
    const lead = Math.max(0, +p.lead_days || 90), apply = new Date(Date.parse(p.expires) - lead * 864e5), exp = new Date(p.expires + 'T00:00:00Z');
    if (apply >= start && apply <= end) out.push({ key: 'renew:' + clip(p.name, 60), name: `Start renewal: ${clip(p.name, 80)}`, due: ymd(apply), period: p.expires, how: '', source_url: '', filing_offer: true });
    if (exp >= start && exp <= end) out.push({ key: 'expires:' + clip(p.name, 60), name: `Expires: ${clip(p.name, 80)}`, due: p.expires, period: p.expires, how: '', source_url: '', filing_offer: false });
  }
  const seen = new Set();
  return out.filter(x => { const k = x.key + x.due; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
}

export function makeMembers({ q, sign, base, now = Date.now, queueMail, wrapMail, esc, report, alertTeam = async () => {}, invoices, inboundDeal = async () => null, mergeTags, flushMail = async () => {} }) {
  const T = (lang, s) => tr(lang, s);
  const dname = (L, x) => x.key.startsWith('renew:') ? `${T(L, 'Start renewal')}: ${x.key.slice(6)}` : x.key.startsWith('expires:') ? `${T(L, 'Expires')}: ${x.key.slice(8)}` : T(L, x.name);
  const page = (lang, p) => `${base}${lang === 'en' ? '' : '/' + lang}${p}`;
  const token = (o, ttl) => { const v = Buffer.from(JSON.stringify({ ...o, exp: now() + ttl })).toString('base64url'); return v + '.' + sign('member:' + v); };
  const readToken = t => { const [v, s] = String(t || '').split('.'); if (!v || !s || s.length > 100) return null;
    const want = sign('member:' + v); if (want.length !== s.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(s))) return null;
    try { const o = JSON.parse(Buffer.from(v, 'base64url').toString()); return o.exp > now() ? o : null; } catch { return null; } };
  async function prices() {
    let over = {}; try { over = JSON.parse((await q("select value from settings where key='member_prices'")).rows[0]?.value || '{}'); } catch {}
    return Object.fromEntries(Object.entries(PRODUCTS).map(([k, p]) => [k, { ...p, price: +over[k] > 0 ? +over[k] : p.price }]));
  }

  /* ---------- accounts ---------- */
  async function signup(b, ip) {
    const email = clip(b.email, 160).toLowerCase(), lang = LANGS.includes(b.lang) ? b.lang : 'en';
    if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'email' };
    if (b.consent !== true) return { error: 'consent' };
    const sectors = (Array.isArray(b.sectors) ? b.sectors : []).filter(s => SECTORS.includes(s));
    const name = clip(b.name, 120), company = clip(b.company, 160), country = clip(b.country, 80);
    let m = (await q('select * from members where email=$1', [email])).rows[0];
    if (!m) {
      m = (await q(`insert into members(email,name,company,country,lang,sectors,alerts,consent_at,marketing,unsub_token,source)
        values ($1,$2,$3,$4,$5,$6,true,now(),$7,$8,$9) returning *`, [email, name || null, company || null, country || null, lang, sectors.length ? sectors : SECTORS,
        b.updates === true, crypto.randomBytes(16).toString('hex'), clip(b.source, 60) || 'website'])).rows[0];
      await linkContact(m, ['member'], false);   // marketing consent counts only once the address is confirmed (login)
    }
    await sendLink(m, lang, clip(b.next, 80));
    return { ok: true };
  }
  async function sendLink(m, lang, next = '') {
    const nonce = crypto.randomBytes(12).toString('hex');
    await q('insert into member_logins(nonce, member_id) values ($1,$2)', [nonce, m.id]);
    const link = `${base}/m/login?t=${token({ m: m.id, n: nonce, l: lang, next: /^[a-z_]{0,40}$/.test(next) ? next : '' }, 45 * 60e3)}`;
    await queueMail(m.email, m.name || '', T(lang, 'Your sign-in link for Gotham Consult'),
      wrapMail(esc(T(lang, 'Sign in to your Gotham account')),
        `<div dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><p style="color:#5A6472;font-size:15px;line-height:1.6">${esc(T(lang, 'Click the button to sign in. The link works once, for 45 minutes. If you did not ask for it, you can ignore this email.'))}</p>
        <p style="margin:22px 0"><a href="${esc(link)}" style="background:#0F1B2D;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:999px;display:inline-block">${esc(T(lang, 'Sign in'))}</a></p></div>`), 'member_login', null);
    flushMail(2).catch(() => {});
  }
  async function login(t) {
    const o = readToken(t); if (!o || !o.n) return null;
    const used = (await q('update member_logins set used_at=now() where nonce=$1 and member_id=$2 and used_at is null returning member_id', [o.n, o.m])).rows[0];
    if (!used) return null;
    const m = (await q('update members set last_login=now(), verified_at=coalesce(verified_at, now()) where id=$1 returning *', [o.m])).rows[0]; if (!m) return null;
    if (m.marketing && m.contact_id) await q(`update contacts set consent_email='yes', consent_source='Member account: asked for updates, email confirmed', consent_at=now()
      where id=$1 and coalesce(consent_email,'unknown')='unknown' and unsubscribed_at is null`, [m.contact_id]);
    return { member: m, cookie: token({ mid: m.id, sv: m.sv || 0 }, 30 * 864e5), lang: LANGS.includes(o.l) ? o.l : m.lang, next: o.next || '' };
  }
  async function fromCookie(cookieHeader) {
    const c = /(?:^|;\s*)gc_member=([^;]+)/.exec(String(cookieHeader || '')); if (!c) return null;
    const o = readToken(decodeURIComponent(c[1])); if (!o || !o.mid) return null;
    const m = (await q('select * from members where id=$1', [o.mid])).rows[0];
    return m && (m.sv || 0) === (o.sv || 0) && !m.closed_at ? m : null;
  }
  async function linkContact(m, tags, consent = m.marketing) {
    const c = (await q('select id, tags from contacts where lower(email)=lower($1)', [m.email])).rows[0];
    if (c) await q(`update contacts set tags=$2, language=coalesce(nullif($3,'en'),language), full_name=coalesce(full_name,$4), company=coalesce(company,$5) where id=$1`,
      [c.id, mergeTags(c.tags, tags), m.lang, m.name, m.company]);
    const id = c ? c.id : (await q(`insert into contacts(full_name,email,company,country,tags,source,language,status,consent_email,consent_source,consent_at)
        values ($1,$2,$3,$4,$5,'Website: member account',$6,'new',$7,$8,now()) returning id`,
      [m.name, m.email, m.company, m.country, tags.join(','), m.lang, consent ? 'yes' : 'unknown', consent ? 'Member account: asked for updates' : null])).rows[0].id;
    await q('update members set contact_id=$2 where id=$1', [m.id, id]);
    return id;
  }
  async function prefs(m, b) {
    const sectors = Array.isArray(b.sectors) ? b.sectors.filter(s => SECTORS.includes(s)) : m.sectors;
    const r = (await q(`update members set name=coalesce($2,name), company=coalesce($3,company), country=coalesce($4,country), phone=coalesce($5,phone),
        lang=$6, sectors=$7, alerts=$8, marketing=$9 where id=$1 returning *`,
      [m.id, b.name === undefined ? null : clip(b.name, 120), b.company === undefined ? null : clip(b.company, 160), b.country === undefined ? null : clip(b.country, 80),
       b.phone === undefined ? null : clip(b.phone, 40), LANGS.includes(b.lang) ? b.lang : m.lang, sectors, b.alerts === undefined ? m.alerts : b.alerts === true,
       b.marketing === undefined ? m.marketing : b.marketing === true])).rows[0];
    if (r.contact_id && b.marketing !== undefined) await q(`update contacts set consent_email=$2, consent_source=$3, consent_at=now() where id=$1 and unsubscribed_at is null`,
      [r.contact_id, r.marketing ? 'yes' : 'no', 'Member account settings']);
    return r;
  }

  /* ---------- plans and orders ---------- */
  async function active(memberId, at = ymd(new Date(now()))) {
    return (await q(`select o.*, c.name as company_name from member_orders o left join member_companies c on c.id=o.company_id
      where o.member_id=$1 and o.status='active' and o.starts <= $2 and o.ends >= $2 order by o.ends`, [memberId, at])).rows;
  }
  async function buy(m, b) {
    const P = await prices(), p = P[b.product]; if (!p) return { error: 'product' };
    let company = null;
    if (p.company) {
      company = (await q('select * from member_companies where id=$1 and member_id=$2', [+b.company_id || 0, m.id])).rows[0];
      if (!company && p.plan === 'compliance') return { error: 'company' };
    }
    if (p.months) {
      const open = (await q(`select o.id, i.token from member_orders o join invoices i on i.id=o.invoice_id where o.member_id=$1 and o.product=$2 and coalesce(o.company_id,0)=coalesce($3,0)
          and o.status='pending' and o.renewal_of is null and i.status not in ('paid','void','cancelled') and o.created_at > now() - interval '30 days' order by o.id desc limit 1`,
        [m.id, b.product, company ? company.id : null])).rows[0];
      if (open) return { ok: true, order: open.id, pay_url: `${base}/i/${open.token}` };
    }
    const brief = clip(b.details, 1500);
    if (p.booking && !brief) return { error: 'details' };
    const desc = `${p.name}${company ? ' · ' + company.name : ''}${p.booking ? ' · ' + brief.slice(0, 120) : ''}`;
    const inv = await invoices.create({ member: m, description: desc, amount: p.price, note: `Member order (${b.product})` });
    if (inv.error) return inv;
    const o = (await q(`insert into member_orders(member_id, product, company_id, invoice_id, status, details) values ($1,$2,$3,$4,'pending',$5) returning *`,
      [m.id, b.product, company ? company.id : null, inv.id, JSON.stringify({ brief, slots: clip(b.slots, 300), price: p.price })])).rows[0];
    await inboundDeal({ company: m.company || null, full_name: m.name || m.email, email: m.email, phone: m.phone || null, kind: p.plan === 'pro' ? 'membership' : 'consulting',
      title: `${p.name} · ${m.company || m.name || m.email}`, source: 'Website member account', task: null }).catch(() => {});
    return { ok: true, order: o.id, pay_url: `${base}/i/${inv.token}` };
  }
  /* an invoice became paid: start the plan or open the booking */
  async function invoicePaid(invoiceId) {
    const o = (await q("select * from member_orders where invoice_id=$1 and status='pending'", [invoiceId])).rows[0]; if (!o) return null;
    return activate(o, 'payment');
  }
  async function activate(o, by) {
    // claim the order first: the Paystack webhook and the browser return can both report the same payment
    o = (await q("update member_orders set paid_at=coalesce(paid_at, now()), status='activating' where id=$1 and status='pending' returning *", [o.id])).rows[0];
    if (!o) return null;
    const P = await prices(), p = P[o.product] || {}, m = (await q('select * from members where id=$1', [o.member_id])).rows[0];
    if (p.months) {
      const today = ymd(new Date(now()));
      const last = (await q(`select max(ends) as e from member_orders where member_id=$1 and product like $2 and status='active' and coalesce(company_id,0)=coalesce($3,0) and id<>$4`,
        [o.member_id, p.plan + '%', o.company_id, o.id])).rows[0].e;
      const starts = last && ymd(last) >= today ? ymd(new Date(Date.parse(ymd(last)) + 864e5)) : today;
      const ends = ymd(new Date(Date.parse(addMonths(starts, p.months)) - 864e5));
      await q("update member_orders set status='active', starts=$2, ends=$3, paid_at=now() where id=$1", [o.id, starts, ends]);
      await linkContact(m, ['member', 'member-' + p.plan]);
      await queueMail(m.email, m.name || '', T(m.lang, 'Your plan is active'), wrapMail(esc(T(m.lang, 'Thank you, your plan is active')),
        `<div dir="${m.lang === 'ar' ? 'rtl' : 'ltr'}"><p style="color:#5A6472;font-size:15px;line-height:1.6">${esc(T(m.lang, p.name))}: ${esc(starts)} – ${esc(ends)}.</p>
        <p style="margin:22px 0"><a href="${page(m.lang, '/account')}" style="background:#0F1B2D;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:999px;display:inline-block">${esc(T(m.lang, 'Open your account'))}</a></p></div>`), 'member_plan', null);
    } else {
      await q("update member_orders set status='open', paid_at=now() where id=$1", [o.id]);
      const d = o.details || {};
      await q(`insert into tasks(title, due_at, contact_id, created_by, priority) values ($1, now() + interval '1 day', $2, 'website', 'high')`,
        [`${p.name} for ${m.name || m.email}${m.company ? ' (' + m.company + ')' : ''}: ${clip(d.brief, 200)}${d.slots ? ' · times: ' + clip(d.slots, 120) : ''}`, m.contact_id]);
      await alertTeam(`Paid: ${p.name}`, [`${m.name || ''} <${m.email}> ${m.company || ''}`, clip(d.brief, 600), d.slots ? 'Preferred times: ' + d.slots : '', 'Back office → Members']).catch(() => {});
    }
    await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [by, 'member_order_active', `${o.id} ${o.product} member ${o.member_id}`]);
    return (await q('select * from member_orders where id=$1', [o.id])).rows[0];
  }
  async function grant(memberId, product, months, companyId, by) {   // staff: e.g. compliance free for year 1 with a registration
    const P = await prices(); if (!P[product] || !P[product].months) return null;
    const o = (await q(`insert into member_orders(member_id, product, company_id, status, details) values ($1,$2,$3,'pending',$4) returning *`,
      [memberId, product, companyId || null, JSON.stringify({ granted_by: by, months })])).rows[0];
    const r = await activate(o, by);
    if (months && months !== P[product].months) await q('update member_orders set ends=$2 where id=$1', [r.id, ymd(new Date(Date.parse(addMonths(ymd(r.starts), months)) - 864e5))]);
    return (await q('select * from member_orders where id=$1', [o.id])).rows[0];
  }

  /* ---------- companies and the calendar ---------- */
  async function saveCompany(m, b) {
    const permits = (Array.isArray(b.permits) ? b.permits : []).slice(0, 30).map(p => ({ name: clip(p.name, 120), expires: /^\d{4}-\d{2}-\d{2}$/.test(p.expires || '') ? p.expires : '',
      lead_days: Math.max(0, Math.min(365, +p.lead_days || 90)) })).filter(p => p.name);
    const v = [clip(b.name, 160), clip(b.tin, 40) || null, clip(b.reg_no, 40) || null, /^\d{4}-\d{2}-\d{2}$/.test(b.incorporated_on || '') ? b.incorporated_on : null,
      Math.max(1, Math.min(12, +b.year_end_month || 12)), b.vat_registered === true, b.has_employees === true, b.foreign_owned !== false, JSON.stringify(permits), b.foreign_staff === true];
    if (!v[0]) return { error: 'name' };
    if (b.id) {
      const r = (await q(`update member_companies set name=$3,tin=$4,reg_no=$5,incorporated_on=$6,year_end_month=$7,vat_registered=$8,has_employees=$9,foreign_owned=$10,permits=$11,foreign_staff=$12
        where id=$1 and member_id=$2 returning *`, [+b.id, m.id, ...v])).rows[0];
      return r ? { company: r } : { error: 'not_found' };
    }
    if (+(await q('select count(*) n from member_companies where member_id=$1', [m.id])).rows[0].n >= 20) return { error: 'too_many' };
    return { company: (await q(`insert into member_companies(member_id,name,tin,reg_no,incorporated_on,year_end_month,vat_registered,has_employees,foreign_owned,permits,foreign_staff)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`, [m.id, ...v])).rows[0] };
  }
  async function calendar(m) {
    const cos = (await q('select * from member_companies where member_id=$1 order by id', [m.id])).rows, plans = await active(m.id);
    return cos.map(c => {
      const full = plans.some(p => p.product.startsWith('compliance') && p.company_id === c.id);
      const all = deadlines({ ...c, incorporated_on: c.incorporated_on ? ymd(c.incorporated_on) : null }, new Date(now()), full ? 120 : 45);
      return { company: c, full, deadlines: full ? all : all.slice(0, 3), hidden: full ? 0 : Math.max(0, all.length - 3) };
    });
  }

  /* ---------- what the member sees ---------- */
  async function me(m) {
    const plans = await active(m.id), P = await prices();
    const orders = (await q(`select o.id, o.product, o.status, o.starts, o.ends, o.created_at, o.details, i.number, i.token, i.total, i.status as invoice_status
      from member_orders o left join invoices i on i.id=o.invoice_id where o.member_id=$1 order by o.id desc limit 50`, [m.id])).rows;
    const updates = (await q('select title, body, url, status, at from member_updates where member_id=$1 order by at desc limit 50', [m.id])).rows;
    const pro = plans.some(p => p.product.startsWith('pro'));
    const posts = (await q(`select id, title, sector, body, published_at from member_posts where published_at is not null ${pro ? '' : 'and false'} order by published_at desc limit 20`)).rows;
    return { member: { email: m.email, name: m.name, company: m.company, country: m.country, phone: m.phone, lang: m.lang, sectors: m.sectors, alerts: m.alerts, marketing: m.marketing },
      plans: plans.map(p => ({ product: p.product, ends: ymd(p.ends), company: p.company_name })), pro, prices: Object.fromEntries(Object.entries(P).map(([k, p]) => [k, p.price])),
      orders: orders.map(o => ({ id: o.id, product: o.product, status: o.status, starts: o.starts && ymd(o.starts), ends: o.ends && ymd(o.ends), at: o.created_at,
        invoice: o.number, pay_url: o.token ? `${base}/i/${o.token}` : null, invoice_status: o.invoice_status, total: o.total })),
      calendar: await calendar(m), updates, posts };
  }

  /* ---------- jobs ---------- */
  async function weekly(force = false) {   // Monday digest: approved report updates in the member's sectors, the next deadlines, one useful offer
    const d = new Date(now()); if (!force && d.getUTCDay() !== 1) return 0;
    const week = `${d.getUTCFullYear()}-${ymd(d)}`.slice(0, 15), since = new Date(now() - 7 * 864e5);
    const pub = (await report.publicReport()).updates.filter(u => new Date(u.at) >= since);
    let n = 0;
    for (const m of (await q("select * from members where alerts and verified_at is not null and closed_at is null")).rows) {
      if ((await q('select 1 from member_digests where member_id=$1 and week=$2', [m.id, week])).rows.length) continue;
      const mine = pub.filter(u => !u.chapter || (m.sectors || []).includes(u.chapter));
      const cal = (await calendar(m)).flatMap(c => c.deadlines.slice(0, 3).map(x => ({ ...x, company: c.company.name }))).filter(x => Date.parse(x.due) - now() < 21 * 864e5);
      if (!mine.length && !cal.length) continue;
      const L = m.lang, li = s => `<li style="margin:0 0 8px">${s}</li>`;
      const body = (mine.length ? `<h3 style="font-size:16px;margin:18px 0 8px;color:#0F1B2D">${esc(T(L, 'New in the Ghana Investment Report'))}</h3><ul style="padding-inline-start:18px;color:#0F1B2D;font-size:14.5px;line-height:1.55">`
          + mine.slice(0, 8).map(u => li(`<b>${esc(u.title)}</b>${u.text ? ' ' + esc(u.text) : ''}${u.url ? ` <a href="${esc(u.url)}">${esc(T(L, 'source'))}</a>` : ''}`)).join('') + '</ul>' : '')
        + (cal.length ? `<h3 style="font-size:16px;margin:18px 0 8px;color:#0F1B2D">${esc(T(L, 'Your next deadlines'))}</h3><ul style="padding-inline-start:18px;color:#0F1B2D;font-size:14.5px;line-height:1.55">`
          + cal.map(x => li(`<b>${esc(x.due)}</b> · ${esc(dname(L, x))} · ${esc(x.company)}`)).join('') + '</ul>' : '')
        + `<p style="margin:22px 0"><a href="${page(L, '/account')}" style="background:#0F1B2D;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px;display:inline-block">${esc(T(L, 'Open your account'))}</a></p>`
        + `<p style="color:#8A93A0;font-size:12px">${esc(T(L, 'You get this because you chose sector alerts in your Gotham account.'))} <a href="${base}/m/stop?u=${m.unsub_token}" style="color:#8A93A0">${esc(T(L, 'Stop these emails'))}</a></p>`;
      await queueMail(m.email, m.name || '', T(L, 'Ghana this week: your Gotham alerts'), wrapMail(esc(T(L, 'Ghana this week')), `<div dir="${L === 'ar' ? 'rtl' : 'ltr'}">${body}</div>`), 'member_digest', null, `${base}/m/stop?u=${m.unsub_token}`);
      await q('insert into member_digests(member_id, week) values ($1,$2) on conflict do nothing', [m.id, week]); n++;
    }
    return n;
  }
  async function daily() {
    const today = ymd(new Date(now())), out = { reminders: 0, renewals: 0, expired: 0, nudges: 0, recovered: 0 };
    /* safety sweep: a paid invoice whose order never started (process stopped mid-way) gets its plan now */
    await q("update member_orders set status='pending' where status='activating' and paid_at < now() - interval '15 minutes'");
    for (const o of (await q("select o.* from member_orders o join invoices i on i.id=o.invoice_id where o.status='pending' and i.status='paid'")).rows)
      if (await activate(o, 'sweep').catch(e => { console.error('member sweep', e.message); return null; })) out.recovered++;
    /* deadline reminders 7 days and 1 day before, with the offer to file it for them */
    for (const row of (await q(`select c.*, m.email, m.name as mname, m.lang, m.id as mid from member_companies c join members m on m.id=c.member_id
        join member_orders o on o.company_id=c.id and o.status='active' and o.product like 'compliance%' and o.starts <= $1 and o.ends >= $1 where m.closed_at is null`, [today])).rows) {
      for (const x of deadlines({ ...row, incorporated_on: row.incorporated_on ? ymd(row.incorporated_on) : null }, new Date(now()), 8)) {
        const left = Math.round((Date.parse(x.due) - Date.parse(today)) / 864e5), kind = left === 7 ? 'd7' : left === 1 ? 'd1' : null; if (!kind) continue;
        const ins = await q('insert into member_reminders(company_id,key,due,kind) values ($1,$2,$3,$4) on conflict do nothing returning 1', [row.id, x.key, x.due, kind]);
        if (!ins.rows.length) continue;
        const L = row.lang;
        await queueMail(row.email, row.mname || '', `${T(L, 'Deadline')} ${x.due}: ${dname(L, x)} (${row.name})`, wrapMail(esc(dname(L, x)),
          `<div dir="${L === 'ar' ? 'rtl' : 'ltr'}"><p style="color:#0F1B2D;font-size:15px;line-height:1.6"><b>${esc(row.name)}</b> · ${esc(T(L, 'due'))} <b>${esc(x.due)}</b>${x.period ? ' · ' + esc(x.period) : ''}</p>
           ${x.how ? `<p style="color:#5A6472;font-size:14px;line-height:1.6">${esc(T(L, x.how))}</p>` : ''}${x.source_url ? `<p style="font-size:13px"><a href="${esc(x.source_url)}">${esc(T(L, 'Official source'))}</a></p>` : ''}
           ${x.filing_offer ? `<p style="margin:20px 0"><a href="${page(L, '/account')}#file" style="background:#B8862F;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px;display:inline-block">${esc(T(L, 'Let us file it for you'))}</a></p>` : ''}</div>`), 'member_deadline', null);
        out.reminders++;
      }
    }
    /* renewal invoices 7 days before a plan ends (one per plan), then expiry */
    for (const o of (await q(`select o.*, m.email from member_orders o join members m on m.id=o.member_id where o.status='active' and o.ends between $1 and ($1::date + 7) and not o.renew_invoiced and m.closed_at is null
        and not exists (select 1 from member_orders x where x.member_id=o.member_id and x.product=o.product and coalesce(x.company_id,0)=coalesce(o.company_id,0) and x.id<>o.id and ((x.status='pending' and x.renewal_of is not null) or (x.status='active' and x.ends > o.ends)))`, [today])).rows) {
      if (!(await q('update member_orders set renew_invoiced=true where id=$1 and not renew_invoiced returning id', [o.id])).rows.length) continue;   // claim first: two job runs never bill twice
      const m = (await q('select * from members where id=$1', [o.member_id])).rows[0], P = await prices(), p = P[o.product];
      const co = o.company_id ? (await q('select name from member_companies where id=$1', [o.company_id])).rows[0] : null;
      const inv = await invoices.create({ member: m, description: `${p.name}${co ? ' · ' + co.name : ''} (renewal)`, amount: p.price, note: `Member renewal (${o.product})`, send: true });
      if (inv.error) { await q('update member_orders set renew_invoiced=false where id=$1', [o.id]); continue; }
      await q(`insert into member_orders(member_id, product, company_id, invoice_id, status, renewal_of, details) values ($1,$2,$3,$4,'pending',$5,$6)`, [o.member_id, o.product, o.company_id, inv.id, o.id, JSON.stringify({ price: p.price })]);
      out.renewals++;
    }
    out.expired = (await q("update member_orders set status='ended' where status='active' and ends < $1 returning 1", [today])).rows.length;
    /* smart follow-up: a free member who is active and has a company but no plan → one task for the team, once */
    for (const m of (await q(`select m.* from members m where m.closed_at is null and m.verified_at is not null and m.nudged_at is null and m.created_at < now() - interval '3 days'
        and exists (select 1 from member_companies c where c.member_id=m.id)
        and not exists (select 1 from member_orders o where o.member_id=m.id and o.status in ('active','pending','open')) limit 20`)).rows) {
      await q(`insert into tasks(title, due_at, contact_id, created_by, priority) values ($1, now() + interval '1 day', $2, 'website', 'normal')`,
        [`Call ${m.name || m.email}${m.company ? ' (' + m.company + ')' : ''}: added a company to the compliance calendar but has no plan yet; offer the 12-month plan or filing`, m.contact_id]);
      await q('update members set nudged_at=now() where id=$1', [m.id]); out.nudges++;
    }
    return out;
  }
  async function stop(unsub) {
    const r = (await q('update members set alerts=false where unsub_token=$1 returning id', [clip(unsub, 64)])).rows[0];
    return !!r;
  }

  /* ---------- back office ---------- */
  async function dashboard() {
    const P = await prices();
    const k = (await q(`select (select count(*) from members where closed_at is null)::int as members,
        (select count(*) from members where created_at > now() - interval '7 days')::int as new_7d,
        (select count(*) from members where created_at > now() - interval '30 days')::int as new_30d,
        (select count(distinct member_id) from member_orders where status='active')::int as paying,
        (select count(*) from member_orders where status='pending')::int as unpaid,
        (select count(*) from member_orders where status='open')::int as open_bookings`)).rows[0];
    const act = (await q("select product, count(*)::int n from member_orders where status='active' and current_date between starts and ends group by product")).rows;
    const mrr = act.reduce((s, a) => s + (P[a.product] && P[a.product].months ? P[a.product].price / P[a.product].months * a.n : 0), 0);
    const paid30 = +(await q(`select coalesce(sum(i.total),0) s from member_orders o join invoices i on i.id=o.invoice_id where o.paid_at > now() - interval '30 days'`)).rows[0].s;
    const list = (await q(`select m.id, m.email, m.name, m.company, m.country, m.lang, m.sectors, m.alerts, m.created_at, m.last_login, m.verified_at, m.contact_id,
        (select string_agg(o.product || ' to ' || to_char(o.ends,'YYYY-MM-DD'), ', ') from member_orders o where o.member_id=m.id and o.status='active') as plans,
        (select count(*) from member_companies c where c.member_id=m.id)::int as companies,
        (select count(*) from member_orders o where o.member_id=m.id and o.status='pending')::int as unpaid
        from members m where m.closed_at is null order by m.id desc limit 500`)).rows;
    const open = (await q(`select o.id, o.product, o.status, o.details, o.created_at, o.paid_at, m.email, m.name, m.company, i.number, i.status as invoice_status
        from member_orders o join members m on m.id=o.member_id left join invoices i on i.id=o.invoice_id where o.status in ('pending','open') order by o.id desc limit 100`)).rows;
    return { kpi: { ...k, conversion: k.members ? Math.round(1000 * k.paying / k.members) / 10 : 0, mrr: Math.round(mrr), paid_30d: Math.round(paid30) }, active: act, members: list, open, prices: P };
  }
  async function memberDetail(id) {
    const m = (await q('select * from members where id=$1', [id])).rows[0]; if (!m) return null;
    return { member: m, ...(await me(m)), companies: (await q('select * from member_companies where member_id=$1 order by id', [id])).rows };
  }
  async function addUpdate(memberId, b, by) {
    const m = (await q('select * from members where id=$1', [memberId])).rows[0]; if (!m) return null;
    const u = (await q('insert into member_updates(member_id,title,body,url,status,by_user) values ($1,$2,$3,$4,$5,$6) returning *',
      [memberId, clip(b.title, 200), clip(b.body, 3000), /^https?:\/\//.test(b.url || '') ? clip(b.url, 500) : null, clip(b.status, 40) || null, by])).rows[0];
    if (b.notify) await queueMail(m.email, m.name || '', `${T(m.lang, 'Update on your case')}: ${u.title}`, wrapMail(esc(u.title),
      `<div dir="${m.lang === 'ar' ? 'rtl' : 'ltr'}"><p style="color:#5A6472;font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(u.body || '')}</p><p><a href="${page(m.lang, '/account')}">${esc(T(m.lang, 'Open your account'))}</a></p></div>`), 'member_update', null);
    return u;
  }
  async function closeOrder(orderId, by) {
    const r = (await q("update member_orders set status='done', details=details || $2::jsonb where id=$1 and status='open' returning *", [orderId, JSON.stringify({ done_by: by, done_at: new Date(now()).toISOString() })])).rows[0];
    return r || null;
  }
  async function post(b, by) {   // a Pro briefing
    const r = (await q('insert into member_posts(title, sector, body, published_at, by_user) values ($1,$2,$3,$4,$5) returning *',
      [clip(b.title, 200), SECTORS.includes(b.sector) ? b.sector : null, clip(b.body, 20000), b.publish ? new Date(now()) : null, by])).rows[0];
    return r;
  }

  return { signup, sendLink, login, fromCookie, prefs, buy, invoicePaid, activate, grant, saveCompany, calendar, me, weekly, daily, stop, dashboard, memberDetail, addUpdate, closeOrder, post, prices, active, deadlines };
}
