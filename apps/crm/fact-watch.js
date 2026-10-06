/* Fact watch: keeps the website's laws, fees, rates, figures and prices honest.
   facts.json lists every claim, where the site states it, its sources and when a person last checked it.
   Once a week the server opens every source: is it still there, does it still say what we rely on
   (the "expect" phrases), has the page changed since a person last looked, and does a live figure
   (Bank of Ghana, Statistical Service) still match what the page states. Problems go to the back office
   (Settings → Facts and sources) and, once per new problem, to the safety-net email/WhatsApp.
   Nothing is rewritten automatically: a person checks the source and either confirms ("Still correct")
   or changes the site and facts.json. */
import fs from 'node:fs';
import crypto from 'node:crypto';

const UA = 'Mozilla/5.0 (compatible; GothamFactCheck/1.0; +https://gothamconsult.com/sources)';
const DAY = 864e5;

export function loadFacts(file = new URL('./facts.json', import.meta.url)) {
  const f = JSON.parse(fs.readFileSync(file, 'utf8')).facts || [];
  for (const x of f) if (!x.id || !x.claim || !Array.isArray(x.sources) || !/^\d{4}-\d{2}-\d{2}$/.test(x.checked || '')) throw new Error('bad fact ' + (x.id || '?'));
  return f;
}

/* page bytes → plain text we can search; null for a PDF (we only check it is still there) */
export function pageText(buf, url = '', type = '') {
  if (/pdf/i.test(type) || /\.pdf($|\?)/i.test(url)) {
    if (!buf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw Object.assign(new Error('not a PDF'), { code: 'bad_pdf' });
    return null;
  }
  const t = buf.toString('utf8').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, "'").replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#?[a-z0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  if (t.length < 200 || /just a moment|verify you are human|checking your browser|enable javascript and cookies/i.test(t.slice(0, 2000)))
    throw Object.assign(new Error('blocked'), { code: 'blocked' });
  return t;
}

export async function fetchSource(url, limit = 8e6) {
  const r = await fetch(url, { signal: AbortSignal.timeout(25000), redirect: 'follow', headers: { 'user-agent': UA, accept: 'text/html,application/pdf,*/*' } });
  const chunks = []; let size = 0;
  if (r.body) for await (const c of r.body) { size += c.length; if (size > limit) break; chunks.push(c); }
  return { status: r.status, type: r.headers.get('content-type') || '', buf: Buffer.concat(chunks) };
}

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
// numbers, dates and words only: menus, counters and cookie banners change too often to mean anything
const fingerprint = t => sha(t.replace(/\b\d{1,2}:\d{2}\b/g, '').replace(/\b(views?|comments?|share|cookies?)\b/gi, '').slice(0, 200000));

/* one pass over every source URL; previous results carry failure counts and the last change */
export async function checkSources(prev = {}, { facts, links = [], get = fetchSource, now = Date.now(), concurrency = 4 }) {
  const urls = new Map();
  for (const f of facts) for (const s of f.sources) {
    const u = urls.get(s.url) || { url: s.url, label: s.label, expect: new Set() };
    for (const e of s.expect || []) u.expect.add(e);
    urls.set(s.url, u);
  }
  for (const l of links) if (l && /^https?:\/\//.test(l.url) && !urls.has(l.url)) urls.set(l.url, { url: l.url, label: l.label || l.url, expect: new Set(), page: l.page });
  const out = {}, list = [...urls.values()], at = new Date(now).toISOString();
  async function one(u) {
    const old = prev[u.url] || {};
    const base = { url: u.url, label: u.label, page: u.page || old.page || null, at };
    try {
      const r = await get(u.url);
      if (r.status === 404 || r.status === 410 || r.status >= 500) return { ...base, state: 'broken', code: r.status, fails: (old.fails || 0) + 1, hash: old.hash, changed_at: old.changed_at, found: old.found };
      if (r.status >= 400) return { ...base, state: 'blocked', code: r.status, fails: 0, hash: old.hash, changed_at: old.changed_at, found: old.found };
      const text = pageText(r.buf, u.url, r.type);
      if (text === null) return { ...base, state: 'ok', code: r.status, fails: 0, hash: old.hash || sha(r.buf), changed_at: old.changed_at || null, found: {} };
      const hash = fingerprint(text), found = {};
      for (const e of u.expect) found[e] = text.includes(e);
      return { ...base, state: 'ok', code: r.status, fails: 0, hash, found,
        changed_at: old.hash && old.hash !== hash ? at : (old.changed_at || null) };
    } catch (e) {
      const blocked = e.code === 'blocked';
      return { ...base, state: blocked ? 'blocked' : 'unreachable', code: null, fails: blocked ? 0 : (old.fails || 0) + 1, hash: old.hash, changed_at: old.changed_at, found: old.found };
    }
  }
  for (let i = 0; i < list.length; i += concurrency) {
    const part = await Promise.all(list.slice(i, i + concurrency).map(one));
    for (const r of part) out[r.url] = r;
  }
  return out;
}

const liveValue = (live, f) => live?.[f.live.source]?.metrics?.[f.live.metric]?.value;

/* the verdict for one fact: ok, changed (page changed, worth a look), review (something to act on), unverified (sources unreachable) */
export function factStatus(f, urls = {}, reviews = {}, live = null, now = Date.now()) {
  const rv = reviews[f.id];
  const checked = [f.checked, rv?.at?.slice(0, 10)].filter(Boolean).sort().pop();
  const problems = [], notes = [];
  let reachable = 0;
  for (const s of f.sources) {
    const u = urls[s.url];
    if (!u) continue;
    if (u.state === 'ok') {
      reachable++;
      for (const e of s.expect || []) if (u.found && u.found[e] === false) problems.push({ key: `${f.id}|missing|${s.url}|${e}`, text: `"${e}" no longer appears on ${s.label}` });
      if (u.changed_at && (!rv || u.changed_at > rv.at) && u.changed_at.slice(0, 10) > checked) notes.push({ key: `${f.id}|changed|${s.url}`, text: `${s.label} changed on ${u.changed_at.slice(0, 10)}` });
    } else if (u.state === 'broken' && u.fails >= 2) problems.push({ key: `${f.id}|broken|${s.url}`, text: `${s.label} is gone (HTTP ${u.code})` });
    else if (u.state === 'unreachable' && u.fails >= 3) problems.push({ key: `${f.id}|down|${s.url}`, text: `${s.label} could not be reached ${u.fails} times in a row` });
  }
  if (f.live && live) {
    const v = liveValue(live, f);
    if (Number.isFinite(v) && v !== f.live.value) problems.push({ key: `${f.id}|live|${v}`, text: `The live figure is now ${v} (the site says ${f.live.value})` });
  }
  const due = Date.parse(checked) + (f.review_days || 90) * DAY;
  if (now > due) problems.push({ key: `${f.id}|due|${checked}`, text: `Due for a person to re-check (last checked ${checked})` });
  const status = problems.length ? 'review' : notes.length ? 'changed' : (f.sources.length && !reachable && Object.keys(urls).length ? 'unverified' : 'ok');
  return { status, problems, notes, checked, due: new Date(due).toISOString().slice(0, 10) };
}

export function makeFactWatch({ facts = loadFacts(), load = async () => null, save = async () => {}, get = fetchSource, now = Date.now,
  live = async () => null, links = async () => [], alert = async () => {}, everyDays = 7 } = {}) {
  let state = null, busy = null;
  const read = async () => { if (!state) { try { state = (await load()) || null; } catch {} state = { urls: {}, reviews: {}, alerted: [], checked: null, ...(state || {}) }; } return state; };
  async function report() {
    const s = await read(), lv = await live().catch(() => null);
    const rows = facts.map(f => ({ ...f, ...factStatus(f, s.urls, s.reviews, lv, now()), review: s.reviews[f.id] || null }));
    const factUrls = new Set(facts.flatMap(f => f.sources.map(x => x.url)));
    const brokenLinks = Object.values(s.urls).filter(u => !factUrls.has(u.url) && ((u.state === 'broken' && u.fails >= 2) || (u.state === 'unreachable' && u.fails >= 3)))
      .map(u => ({ url: u.url, label: u.label, page: u.page, code: u.code, fails: u.fails }));
    const counts = { ok: 0, changed: 0, review: 0, unverified: 0 };
    for (const r of rows) counts[r.status]++;
    return { checked: s.checked, running: !!busy, next: s.checked ? new Date(Date.parse(s.checked) + everyDays * DAY).toISOString() : null,
      counts, facts: rows, broken_links: brokenLinks, sources_checked: Object.keys(s.urls).length };
  }
  async function run(force = false) {
    const s = await read();
    if (busy) return busy;
    if (!force && s.checked && now() - Date.parse(s.checked) < everyDays * DAY) return report();
    busy = (async () => {
      const ls = await links().catch(() => []);
      s.urls = await checkSources(s.urls, { facts, links: ls, get, now: now() });
      s.checked = new Date(now()).toISOString();
      const r = await report();
      const hard = r.facts.flatMap(f => f.problems.map(p => ({ ...p, claim: f.claim })));
      for (const l of r.broken_links) hard.push({ key: 'link|' + l.url, text: `Broken source link on ${l.page || 'an article'}: ${l.label}` });
      const fresh = hard.filter(p => !s.alerted.includes(p.key));
      if (fresh.length) await alert(`Gotham facts: ${fresh.length} to check`, [...fresh.slice(0, 12).map(p => p.claim ? `${p.text} — ${p.claim}` : p.text),
        ...(fresh.length > 12 ? [`…and ${fresh.length - 12} more.`] : []), 'Open the back office → Settings → Facts and sources.']).catch(() => {});
      s.alerted = hard.map(p => p.key);
      await save(s).catch(() => {});
      return r;
    })().finally(() => { busy = null; });
    return busy;
  }
  async function review(id, by, note = '') {
    const s = await read();
    if (!facts.some(f => f.id === id)) return null;
    s.reviews[id] = { at: new Date(now()).toISOString(), by: String(by || '').slice(0, 120), note: String(note || '').slice(0, 500) };
    s.alerted = s.alerted.filter(k => !k.startsWith(id + '|'));
    await save(s).catch(() => {});
    return s.reviews[id];
  }
  async function publicReport() {
    const r = await report();
    return { checked: r.checked, facts: r.facts.map(f => ({ id: f.id, status: f.status === 'review' ? 'review' : f.status === 'unverified' ? 'unverified' : 'ok', checked: f.checked })) };
  }
  return { read, run, review, report, publicReport, facts };
}
