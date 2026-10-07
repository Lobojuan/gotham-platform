/* Ghana Investment Report: the weekly watch.
   report.json holds every figure with its source and a phrase that must still appear there, plus the
   newsrooms and data pages to watch for each chapter. Once a week (REPORT_EVERY_DAYS) the server opens
   all of them (fact-watch.js does the opening and comparing):
   - a figure whose source no longer says what we rely on, disappears or is overdue is flagged "review";
   - a watched newsroom or data page that changed becomes a pending update for a person to read;
   - companies can send news through the report page; it also waits as a pending update.
   Nothing is published by itself: a person publishes an update (it then shows on the page with its date)
   or dismisses it. Live economic numbers on the page come from /api/ghana-data and need no approval. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { makeFactWatch } from './fact-watch.js';

export function loadReport(file = new URL('./report.json', import.meta.url)) {
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(r.chapters) || !r.chapters.length) throw new Error('report has no chapters');
  return r;
}

export function reportFacts(r) {
  // the official forecasts the outlook starts from are watched too: a new IMF or Bank of Ghana figure means the scenarios need a look
  const anchors = (r.outlook?.indicators || []).flatMap(i => i.anchors.filter(a => a.quote).map((a, n) => ({
    id: `outlook-${i.id}-${n + 1}`, topic: 'Outlook', kind: 'stat', claim: `${i.label}: ${a.publisher}, ${a.what}`,
    checked: r.outlook.as_of || r.updated, review_days: 90, sources: [{ label: a.publisher, url: a.url, official: !!a.official, expect: [a.quote] }] })));
  return anchors.concat(r.chapters.flatMap(c => c.figures.map(f => ({
    id: f.id, topic: c.title, kind: 'stat', claim: `${f.label}: ${f.value} ${f.unit} (${f.period})`.replace(/\s+/g, ' '),
    checked: r.updated, review_days: r.review_days || 120,
    sources: [{ label: f.source_label, url: f.source_url, official: !!f.official, expect: f.quote ? [f.quote] : [] }],
  }))));
}

export function makeReportWatch({ report = loadReport(), load = async () => null, save = async () => {}, loadLog = async () => null, saveLog = async () => {},
  get, now = Date.now, alert = async () => {}, everyDays = 7 } = {}) {
  const facts = reportFacts(report);
  const watched = report.chapters.flatMap(c => c.watch.map(w => ({ url: w.url, label: w.label, page: c.id })));
  const W = makeFactWatch({ facts, load, save, now, alert, everyDays, links: async () => watched, ...(get ? { get } : {}) });
  let log = null;
  const readLog = async () => { if (!log) { try { log = (await loadLog()) || null; } catch {} log = { items: [], seen: {}, ...(log || {}) }; } return log; };
  const id = () => crypto.randomBytes(6).toString('hex');
  const clip = (s, n) => String(s || '').trim().slice(0, n);

  function add(item) {
    const it = { id: id(), at: new Date(now()).toISOString(), status: 'pending', kind: 'note', chapter: '', title: '', text: '', url: '', by: '', ...item };
    it.title = clip(it.title, 200); it.text = clip(it.text, 1200); it.url = /^https?:\/\//.test(it.url || '') ? clip(it.url, 500) : '';
    log.items.unshift(it); log.items = log.items.slice(0, 300); return it;
  }

  async function run(force = false) {
    const r = await W.run(force); await readLog();
    const st = await W.read(), fresh = [];
    for (const w of watched) {   // a watched page that changed since we last looked: someone should read it
      const u = st.urls[w.url];
      if (!u?.changed_at || log.seen[w.url] === u.changed_at) continue;
      log.seen[w.url] = u.changed_at;
      fresh.push(add({ kind: 'source', chapter: w.page, title: `${w.label} has new content`, url: w.url, text: '', by: 'weekly watch' }));
    }
    for (const w of watched) if (st.urls[w.url]?.hash && !(w.url in log.seen)) log.seen[w.url] = st.urls[w.url].changed_at || null;  // first look: baseline only
    log.checked = r.checked; await saveLog(log).catch(() => {});
    if (fresh.length) await alert(`Ghana Investment Report: ${fresh.length} source${fresh.length > 1 ? 's' : ''} to read`,
      [...fresh.slice(0, 15).map(f => `${f.title}: ${f.url}`), 'Back office → Settings → Investment report: publish an update or dismiss.']).catch(() => {});
    return adminReport();
  }

  /* "Still correct" on a figure also accepts its current warnings (for example a source that now shows a newer
     figure while the report deliberately quotes the earlier, dated one); a new, different warning shows again. */
  async function current() {
    const r = await W.report(), l = await readLog(), acc = l.accepted || {};
    for (const f of r.facts) {
      const keep = f.problems.filter(p => !(acc[f.id] || []).includes(p.key));
      if (keep.length !== f.problems.length) { f.problems = keep; f.status = keep.length ? 'review' : f.notes.length ? 'changed' : 'ok'; }
    }
    r.counts = { ok: 0, changed: 0, review: 0, unverified: 0 }; for (const f of r.facts) r.counts[f.status]++;
    return r;
  }
  async function review(figId, by, note) {
    const before = (await W.report()).facts.find(f => f.id === figId); if (!before) return null;
    const res = await W.review(figId, by, note); await readLog();
    log.accepted = { ...(log.accepted || {}), [figId]: before.problems.map(p => p.key) }; await saveLog(log).catch(() => {});
    return res;
  }

  async function adminReport() {
    const r = await current(), l = await readLog();
    return { ...r, updates: l.items, pending: l.items.filter(i => i.status === 'pending').length, watched: watched.length };
  }

  async function publicReport() {
    const r = await current(), l = await readLog();
    return { checked: r.checked, next: r.next, updated: report.updated,
      figures: r.facts.map(f => ({ id: f.id, status: f.status === 'review' ? 'review' : 'ok' })),
      updates: l.items.filter(i => i.status === 'published').slice(0, 30).map(i => ({ at: i.published_at || i.at, chapter: i.chapter, title: i.title, text: i.text, url: i.url })),
      partners: l.items.filter(i => i.status === 'published' && i.kind === 'partner').map(i => ({ chapter: i.chapter, name: i.title, url: i.url })) };
  }

  async function submit(item) { await readLog(); const it = add(item); await saveLog(log).catch(() => {}); return it; }

  async function decide(itemId, action, by, edit = {}) {
    await readLog();
    const it = log.items.find(i => i.id === itemId); if (!it) return null;
    if (action === 'publish') {
      if (edit.title) it.title = clip(edit.title, 200);
      if (edit.text !== undefined) it.text = clip(edit.text, 1200);
      if (edit.url !== undefined) it.url = /^https?:\/\//.test(edit.url) ? clip(edit.url, 500) : '';
      if (!it.title) return null;
      it.status = 'published'; it.published_at = new Date(now()).toISOString();
    } else if (action === 'dismiss') it.status = 'dismissed';
    else if (action === 'unpublish') it.status = 'dismissed';
    else return null;
    it.decided_by = clip(by, 120); await saveLog(log).catch(() => {}); return it;
  }

  return { run, report: adminReport, publicReport, review, submit, decide, facts, watched };
}
