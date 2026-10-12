/* Team chat in the back office.
   Channels (#general, #forums, #investors and any an admin adds), direct messages between two people, and one thread
   per company, deal or event, so talk about a client sits next to that client.
   Unread counts per person; @mentions (by first name, @all) send an email, and a WhatsApp message when that is set up,
   if the person has not read it within 15 minutes. Files and photos are kept in the database, readable only when signed in.
   When someone writes that a speaker is confirmed, the venue moved or there is news about a forum, the AI proposes the
   website update as a card in the chat; nothing reaches the website until an admin presses "Publish". */

const AI_NAME = 'Gotham AI';
const TRIGGER = /\b(confirm(ed|s)?|speak(er|ers|ing)|panel(ist)?s?|keynote|agenda|programme|program|venue|moved|postpone|reschedul\w*|new date|starts? at|news|announce\w*)\b|@gotham/i;
const MAX_FILE = 10 * 1024 * 1024;
const FILE_TYPES = { 'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'image/gif': 'image', 'application/pdf': 'file',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'file', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'file',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'file', 'text/plain': 'file', 'text/csv': 'file' };

export function makeChat(ctx) {
  const { q, json, body, bodyBig, clean, phoneGH, defaultInquiryNumbers, askModel, aiOn, queueMail, wrapMail, esc, BASE, waReady, sendWhatsApp, sharp, crypto } = ctx;
  const isStaff = u => u.role === 'staff';
  const firstName = s => String(s || '').trim().split(/[\s@._-]+/)[0] || '';

  async function users() {
    return (await q(`select email, name, role, phone from users where active order by name nulls last, email`)).rows;
  }
  async function channel(id) { return (await q('select * from chat_channels where id=$1', [+id || 0])).rows[0] || null; }
  async function member(chId, email) { return (await q('select * from chat_members where channel_id=$1 and user_email=$2', [chId, email])).rows[0] || null; }
  async function canSee(u, ch) {
    if (!ch || ch.archived) return false;
    if (ch.kind === 'channel') return true;
    if (ch.kind === 'dm') return !!(await member(ch.id, u.email));
    if (ch.kind === 'record') return ch.ref_type === 'item' || !isStaff(u);
    return false;
  }
  async function recordLabel(type, id) {
    if (type === 'contact') { const r = (await q('select company, full_name, email from contacts where id=$1', [+id || 0])).rows[0]; return r ? (r.company || r.full_name || r.email) : null; }
    if (type === 'deal') { const r = (await q('select title from deals where id=$1', [+id || 0])).rows[0]; return r ? r.title : null; }
    if (type === 'item') { const r = (await q('select title, code from items where code=$1', [String(id)])).rows[0]; return r ? `${r.title} (${r.code})` : null; }
    return null;
  }

  /* who is @mentioned: first names and email names of active users, @all / @channel for everyone who can read it */
  async function mentions(text, ch, author) {
    const all = await users();
    const tags = [...String(text).matchAll(/@([\p{L}][\p{L}0-9.'-]{1,30})/gu)].map(m => m[1].toLowerCase().replace(/[.'-]+$/, ''));
    const out = new Set(); let ai = false;
    for (const t of tags) {
      if (/^(gotham|gothamai|ai)$/.test(t)) { ai = true; continue; }
      if (/^(all|channel|everyone|team)$/.test(t)) {
        for (const x of all) if (await canSee(x, ch)) out.add(x.email);
        continue;
      }
      for (const x of all) if (firstName(x.name).toLowerCase() === t || x.email.split('@')[0].toLowerCase() === t) out.add(x.email);
    }
    out.delete(author);
    return { emails: [...out], ai };
  }

  async function post(ch, author, bodyText, opts = {}) {
    const { rows } = await q(`insert into chat_messages(channel_id, author, author_name, body, kind, data, file_id, mentions)
      values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [ch.id, author, opts.author_name || null, bodyText, opts.kind || 'msg', opts.data ? JSON.stringify(opts.data) : null, opts.file_id || null, opts.mentions || []]);
    await q('update chat_channels set last_at=now() where id=$1', [ch.id]);
    return rows[0];
  }
  const pubMsg = m => ({ id: +m.id, channel: m.channel_id, author: m.author, author_name: m.author_name, body: m.deleted ? '' : m.body, kind: m.kind,
    data: m.deleted ? null : m.data, file: m.deleted || !m.file_id ? null : { id: m.file_id, name: m.file_name, mime: m.file_mime, kind: FILE_TYPES[m.file_mime] || 'file', bytes: m.file_bytes },
    mentions: m.mentions || [], at: m.created_at, edited: !!m.edited_at, deleted: !!m.deleted });

  /* the AI looks at a message about a forum and proposes a website update (or nothing) */
  async function propose(ch, msg, u) {
    if (!aiOn() || !TRIGGER.test(msg.body)) return;
    const { rows: evs } = await q(`select code, title, venue, starts_at, speakers, agenda from items where kind='event' and published
      and (starts_at is null or starts_at > now() - interval '1 day') order by starts_at nulls last limit 12`);
    if (!evs.length) return;
    const recent = (await q(`select author_name, author, body from chat_messages where channel_id=$1 and kind='msg' and not deleted and id<$2 order by id desc limit 6`, [ch.id, msg.id])).rows.reverse();
    const here = ch.kind === 'record' && ch.ref_type === 'item' ? ch.ref_id : '';
    const list = evs.map(e => `${e.code}: ${e.title}; ${e.starts_at ? new Date(e.starts_at).toISOString().slice(0, 16).replace('T', ' ') + ' Accra' : 'date to be announced'}; venue: ${e.venue || '-'}; speakers: ${(e.speakers || []).map(s => s.name + (s.role ? ' (' + s.role + ')' : '')).join(', ') || 'none'}`).join('\n');
    const prompt = `You help the Gotham Consult team keep the website's forum pages up to date from their team chat.
Upcoming forums (code: title; start; venue; speakers):
${list}
${here ? `This chat thread is about forum ${here}.` : ''}
Recent messages:
${recent.map(r => `${r.author_name || r.author}: ${r.body}`).join('\n').slice(0, 1500)}
New message from ${u.name || u.email}: ${msg.body}

Only if the NEW message states a confirmed fact that belongs on a forum's public page, propose it. Do not propose anything for questions, maybes, plans or internal matters (money, contracts, people's contact details).
Answer only with JSON: {"code": "forum code or empty", "updates": [ ... ]} where each update is one of:
{"type": "add_speaker", "name": "...", "role": "job title and organisation"}
{"type": "remove_speaker", "name": "..."}
{"type": "agenda_add", "time": "HH:MM", "what": "..."}
{"type": "set_venue", "venue": "..."}
{"type": "set_start", "date": "YYYY-MM-DD", "time": "HH:MM"}
{"type": "news", "text": "one short public sentence for the forum page"}
Use "updates": [] when nothing should change.`;
    let out = null;
    try { const raw = await askModel([{ role: 'user', content: prompt }], { raw: true, json: true, max: 500, temperature: 0.1 });
      const a = raw.indexOf('{'), z = raw.lastIndexOf('}'); out = a >= 0 ? JSON.parse(raw.slice(a, z + 1)) : null; } catch { return; }
    const ev = out && evs.find(e => e.code === String(out.code || '').toUpperCase());
    if (!ev || !Array.isArray(out.updates)) return;
    const s = (v, n) => clean(String(v ?? ''), n);
    const ups = out.updates.slice(0, 6).map(x => {
      const t = String(x && x.type || '');
      if (t === 'add_speaker' && s(x.name, 80)) return { type: t, name: s(x.name, 80), role: s(x.role, 120) };
      if (t === 'remove_speaker' && s(x.name, 80)) return { type: t, name: s(x.name, 80) };
      if (t === 'agenda_add' && s(x.what, 160)) return { type: t, time: /^\d\d:\d\d$/.test(x.time) ? x.time : '', what: s(x.what, 160) };
      if (t === 'set_venue' && s(x.venue, 160)) return { type: t, venue: s(x.venue, 160) };
      if (t === 'set_start' && /^\d{4}-\d\d-\d\d$/.test(x.date) && /^\d\d:\d\d$/.test(x.time)) return { type: t, date: x.date, time: x.time };
      if (t === 'news' && s(x.text, 300)) return { type: t, text: s(x.text, 300) };
      return null;
    }).filter(Boolean);
    if (!ups.length) return;
    const line = ups.map(x => x.type === 'add_speaker' ? `add speaker ${x.name}${x.role ? ' (' + x.role + ')' : ''}` : x.type === 'remove_speaker' ? `remove speaker ${x.name}`
      : x.type === 'agenda_add' ? `add to the programme: ${x.time ? x.time + ' ' : ''}${x.what}` : x.type === 'set_venue' ? `venue: ${x.venue}`
      : x.type === 'set_start' ? `new date: ${x.date} ${x.time}` : `news: ${x.text}`).join('; ');
    await post(ch, 'ai', `Update the website for ${ev.title} (${ev.code})? ${line}.`, { author_name: AI_NAME, kind: 'proposal',
      data: { code: ev.code, title: ev.title, updates: ups, status: 'pending', from_message: +msg.id } });
  }

  async function apply(code, ups, who) {
    const it = (await q('select code, speakers, agenda, updates, starts_at from items where code=$1', [code])).rows[0];
    if (!it) return false;
    let speakers = Array.isArray(it.speakers) ? it.speakers.slice() : [], agenda = Array.isArray(it.agenda) ? it.agenda.slice() : [];
    let updates = Array.isArray(it.updates) ? it.updates.slice() : [], venue = null, starts = null;
    for (const x of ups) {
      if (x.type === 'add_speaker') { const k = speakers.findIndex(s => String(s.name).toLowerCase() === x.name.toLowerCase()); if (k >= 0) speakers[k] = { ...speakers[k], role: x.role || speakers[k].role }; else speakers.push({ name: x.name, role: x.role || '' }); }
      if (x.type === 'remove_speaker') speakers = speakers.filter(s => String(s.name).toLowerCase() !== x.name.toLowerCase());
      if (x.type === 'agenda_add') { agenda.push({ time: x.time, what: x.what }); agenda.sort((a, b) => String(a.time).localeCompare(String(b.time))); }
      if (x.type === 'set_venue') venue = x.venue;
      if (x.type === 'set_start') starts = new Date(`${x.date}T${x.time}:00Z`);   // Ghana is on GMT
      if (x.type === 'news') updates.unshift({ at: new Date().toISOString(), text: x.text });
    }
    await q(`update items set speakers=$2, agenda=$3, updates=$4, venue=coalesce($5, venue), starts_at=coalesce($6, starts_at) where code=$1`,
      [code, JSON.stringify(speakers), JSON.stringify(agenda), JSON.stringify(updates.slice(0, 20)), venue, starts]);
    await q('insert into audit_log(actor,action,detail) values ($1,$2,$3)', [who, 'chat_publish', `${code}: ${JSON.stringify(ups).slice(0, 900)}`]);
    return true;
  }

  async function handle(req, res, p, url, u, cors = {}) {
    if (!p.startsWith('/api/chat/')) return false;
    if (!u) { json(res, 401, { error: 'no_session' }); return true; }

    if (p === '/api/chat/state' && req.method === 'GET') {
      const me = (await q('select chat_since from users where email=$1', [u.email])).rows[0] || {};
      const { rows } = await q(`select c.*, m.last_read,
          (select count(*)::int from chat_messages x where x.channel_id=c.id and x.id > coalesce(m.last_read,0) and x.author<>$1 and not x.deleted and x.created_at >= $2) unread,
          (select count(*)::int from chat_messages x where x.channel_id=c.id and x.id > coalesce(m.last_read,0) and $1 = any(x.mentions) and not x.deleted) mentioned,
          (select array_agg(user_email) from chat_members y where y.channel_id=c.id) members
        from chat_channels c left join chat_members m on m.channel_id=c.id and m.user_email=$1
        where not c.archived and (c.kind<>'record' or exists (select 1 from chat_messages z where z.channel_id=c.id))
        order by c.kind, c.last_at desc nulls last, c.name`, [u.email, me.chat_since || new Date(0)]);
      const out = [];
      for (const c of rows) {
        if (!(c.kind === 'dm' ? (c.members || []).includes(u.email) : await canSee(u, c))) continue;
        out.push({ id: c.id, kind: c.kind, name: c.name, topic: c.topic, ref_type: c.ref_type, ref_id: c.ref_id, members: c.kind === 'dm' ? c.members : undefined,
          unread: c.unread, mentioned: c.mentioned, last_at: c.last_at });
      }
      const us = (await users()).map(x => ({ email: x.email, name: x.name, role: x.role }));
      json(res, 200, { me: u.email, channels: out, users: us, ai: aiOn(), unread: out.reduce((n, c) => n + c.unread, 0), mentioned: out.reduce((n, c) => n + c.mentioned, 0) });
      return true;
    }

    /* alerts: my own WhatsApp number; the approved WhatsApp template name (admins) */
    if (p === '/api/chat/prefs' && req.method === 'GET') {
      const me = (await q('select phone from users where email=$1', [u.email])).rows[0] || {};
      json(res, 200, { phone: me.phone || '', wa_template: isStaff(u) ? undefined : await ctx.setting('wa_mention_template'),
        wa_inquiry_numbers: isStaff(u) ? undefined : (await ctx.setting('wa_inquiry_numbers') || defaultInquiryNumbers.join(', ')),
        wa_inquiry_template: isStaff(u) ? undefined : (await ctx.setting('wa_inquiry_template') || await ctx.setting('wa_mention_template')),
        wa_inquiry_enabled: isStaff(u) ? undefined : (await ctx.setting('wa_inquiry_alerts')) !== 'off', wa_ready: waReady() }); return true;
    }
    if (p === '/api/chat/prefs' && req.method === 'POST') {
      const b = await body(req);
      if (b.phone !== undefined) {
        const ph = String(b.phone || '').trim() ? ctx.phoneGH(clean(String(b.phone), 30)) : '';
        if (ph && !/^\+\d{9,15}$/.test(ph)) { json(res, 400, { error: 'bad_phone' }); return true; }
        await q('update users set phone=$2 where email=$1', [u.email, ph || null]);
      }
      if (b.wa_template !== undefined) {
        if (isStaff(u)) { json(res, 403, { error: 'not_allowed' }); return true; }
        const t = clean(String(b.wa_template || ''), 60);
        if (t && !/^[a-z0-9_]{1,60}$/.test(t)) { json(res, 400, { error: 'bad_template' }); return true; }
        await q(`insert into settings(key,value) values ('wa_mention_template',$1) on conflict (key) do update set value=excluded.value`, [t]);
      }
      if (b.wa_inquiry_numbers !== undefined || b.wa_inquiry_template !== undefined || b.wa_inquiry_enabled !== undefined) {
        if (isStaff(u)) { json(res, 403, { error: 'not_allowed' }); return true; }
        if (b.wa_inquiry_numbers !== undefined) {
          const raw = String(b.wa_inquiry_numbers || '').trim();
          const numbers = raw ? raw.split(/[\n,;]+/).map(x => phoneGH(clean(x, 32))) : [];
          if (numbers.length < 1 || numbers.length > 4 || numbers.some(x => !/^\+\d{9,15}$/.test(x))) { json(res, 400, { error: 'bad_alert_numbers' }); return true; }
          await q(`insert into settings(key,value) values ('wa_inquiry_numbers',$1) on conflict (key) do update set value=excluded.value`, [numbers.join(',')]);
        }
        if (b.wa_inquiry_template !== undefined) {
          const t = clean(String(b.wa_inquiry_template || ''), 60);
          if (t && !/^[a-z0-9_]{1,60}$/.test(t)) { json(res, 400, { error: 'bad_template' }); return true; }
          await q(`insert into settings(key,value) values ('wa_inquiry_template',$1) on conflict (key) do update set value=excluded.value`, [t]);
        }
        if (b.wa_inquiry_enabled !== undefined) {
          const enabled = b.wa_inquiry_enabled === true ? 'on' : b.wa_inquiry_enabled === false ? 'off' : '';
          if (!enabled) { json(res, 400, { error: 'bad_enabled' }); return true; }
          await q(`insert into settings(key,value) values ('wa_inquiry_alerts',$1) on conflict (key) do update set value=excluded.value`, [enabled]);
        }
      }
      json(res, 200, { ok: true }); return true;
    }

    if (p === '/api/chat/messages' && req.method === 'GET') {
      const ch = await channel(url.searchParams.get('channel'));
      if (!(await canSee(u, ch))) { json(res, 404, { error: 'not_found' }); return true; }
      const after = +url.searchParams.get('after') || 0, before = +url.searchParams.get('before') || 0;
      const { rows } = await q(`select m.*, f.name file_name, f.mime file_mime, f.bytes file_bytes from chat_messages m left join chat_files f on f.id=m.file_id
        where m.channel_id=$1 ${after ? 'and m.id>$2' : before ? 'and m.id<$2' : 'and $2::int=0'} order by m.id ${after ? 'asc' : 'desc'} limit 60`, [ch.id, after || before || 0]);
      const list = after ? rows : rows.reverse();
      json(res, 200, { channel: { id: ch.id, kind: ch.kind, name: ch.name, topic: ch.topic, ref_type: ch.ref_type, ref_id: ch.ref_id }, messages: list.map(pubMsg), more: !after && rows.length === 60 });
      return true;
    }

    if (p === '/api/chat/messages' && req.method === 'POST') {
      const b = await body(req);
      const ch = await channel(b.channel);
      if (!(await canSee(u, ch))) { json(res, 404, { error: 'not_found' }); return true; }
      const text = clean(b.body, 4000);
      const fileId = b.file && /^[a-f0-9]{24}$/.test(b.file) ? b.file : null;
      if (!text && !fileId) { json(res, 400, { error: 'empty' }); return true; }
      if (fileId && !(await q('select 1 from chat_files where id=$1 and uploaded_by=$2', [fileId, u.email])).rowCount) { json(res, 400, { error: 'bad_file' }); return true; }
      const mm = await mentions(text, ch, u.email);
      const m = await post(ch, u.email, text, { author_name: u.name || null, file_id: fileId, mentions: mm.emails });
      if (fileId) { const f = (await q('select name, mime, bytes from chat_files where id=$1', [fileId])).rows[0]; Object.assign(m, { file_name: f.name, file_mime: f.mime, file_bytes: f.bytes }); }
      await q(`insert into chat_members(channel_id,user_email,last_read) values ($1,$2,$3) on conflict (channel_id,user_email) do update set last_read=greatest(chat_members.last_read, excluded.last_read)`, [ch.id, u.email, m.id]);
      for (const e of mm.emails) await q(`insert into chat_notify(message_id,user_email,due_at) values ($1,$2,now() + ($3 || ' minutes')::interval) on conflict do nothing`, [m.id, e, String(+(process.env.CHAT_MENTION_DELAY_MIN ?? 15))]);
      if (text) propose(ch, m, u).catch(e => console.error('chat ai:', String(e.message || e).slice(0, 200)));
      json(res, 200, { message: pubMsg(m) });
      return true;
    }

    const del = p.match(/^\/api\/chat\/messages\/(\d+)$/);
    if (del && req.method === 'DELETE') {
      const m = (await q('select * from chat_messages where id=$1', [+del[1]])).rows[0];
      if (!m || (m.author !== u.email && u.role !== 'owner')) { json(res, 403, { error: 'not_allowed' }); return true; }
      await q('update chat_messages set deleted=true, edited_at=now() where id=$1', [m.id]);
      json(res, 200, { ok: true }); return true;
    }

    if (p === '/api/chat/read' && req.method === 'POST') {
      const b = await body(req); const ch = await channel(b.channel);
      if (!(await canSee(u, ch))) { json(res, 404, { error: 'not_found' }); return true; }
      const last = +b.last || 0;
      await q(`insert into chat_members(channel_id,user_email,last_read) values ($1,$2,$3) on conflict (channel_id,user_email) do update set last_read=greatest(chat_members.last_read, excluded.last_read)`, [ch.id, u.email, last]);
      json(res, 200, { ok: true }); return true;
    }

    if (p === '/api/chat/channels' && req.method === 'POST') {
      if (isStaff(u)) { json(res, 403, { error: 'not_allowed' }); return true; }
      const b = await body(req);
      const name = clean(b.name, 40).toLowerCase().replace(/^#/, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
      if (!name) { json(res, 400, { error: 'name_required' }); return true; }
      const { rows } = await q(`insert into chat_channels(kind,slug,name,topic,created_by) values ('channel',$1,$1,$2,$3) on conflict (slug) do update set archived=false returning *`, [name, clean(b.topic, 200) || null, u.email]);
      json(res, 200, { channel: rows[0] }); return true;
    }

    if (p === '/api/chat/dm' && req.method === 'POST') {
      const b = await body(req); const other = clean(b.email, 160).toLowerCase();
      const o = (await q('select email, name from users where lower(email)=$1 and active', [other])).rows[0];
      if (!o || o.email === u.email) { json(res, 400, { error: 'bad_user' }); return true; }
      const slug = 'dm:' + [u.email, o.email].sort().join('|');
      const { rows } = await q(`insert into chat_channels(kind,slug,name,created_by) values ('dm',$1,$2,$3) on conflict (slug) do update set archived=false returning *`, [slug, 'Direct message', u.email]);
      for (const e of [u.email, o.email]) await q(`insert into chat_members(channel_id,user_email,last_read) values ($1,$2,0) on conflict do nothing`, [rows[0].id, e]);
      json(res, 200, { channel: { id: rows[0].id } }); return true;
    }

    if (p === '/api/chat/thread' && req.method === 'POST') {
      const b = await body(req); const type = String(b.ref_type || ''), id = clean(String(b.ref_id ?? ''), 40);
      if (!['contact', 'deal', 'item'].includes(type) || !id) { json(res, 400, { error: 'bad_ref' }); return true; }
      if (type !== 'item' && isStaff(u)) { json(res, 403, { error: 'not_allowed' }); return true; }
      const label = await recordLabel(type, id);
      if (!label) { json(res, 404, { error: 'not_found' }); return true; }
      const { rows } = await q(`insert into chat_channels(kind,slug,name,ref_type,ref_id,created_by) values ('record',$1,$2,$3,$4,$5)
        on conflict (slug) do update set name=excluded.name, archived=false returning *`, [`${type}:${id}`, label, type, id, u.email]);
      json(res, 200, { channel: { id: rows[0].id, name: rows[0].name } }); return true;
    }

    if (p === '/api/chat/upload' && req.method === 'POST') {
      let b; try { b = await bodyBig(req, 15 * 1024 * 1024); } catch { json(res, 413, { error: 'file_too_large' }); return true; }
      const mime = String(b.type || '').toLowerCase();
      if (!FILE_TYPES[mime]) { json(res, 400, { error: 'file_type' }); return true; }
      let buf; try { buf = Buffer.from(String(b.data || '').replace(/^data:[^;]+;base64,/, ''), 'base64'); } catch { buf = null; }
      if (!buf || !buf.length) { json(res, 400, { error: 'no_file' }); return true; }
      if (buf.length > MAX_FILE) { json(res, 413, { error: 'file_too_large' }); return true; }
      let thumb = null;
      if (FILE_TYPES[mime] === 'image') { try { thumb = await sharp(buf).rotate().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer(); } catch { json(res, 400, { error: 'not_an_image' }); return true; } }
      const id = crypto.randomBytes(12).toString('hex');
      await q('insert into chat_files(id,name,mime,bytes,data,thumb,uploaded_by) values ($1,$2,$3,$4,$5,$6,$7)', [id, clean(b.name, 120) || 'file', mime, buf.length, buf, thumb, u.email]);
      json(res, 200, { file: id }); return true;
    }

    const fm = p.match(/^\/api\/chat\/files\/([a-f0-9]{24})$/);
    if (fm && req.method === 'GET') {
      const f = (await q(`select f.*, (select channel_id from chat_messages where file_id=f.id limit 1) ch from chat_files f where f.id=$1`, [fm[1]])).rows[0];
      if (!f || (f.ch ? !(await canSee(u, await channel(f.ch))) : f.uploaded_by !== u.email)) { json(res, 404, { error: 'not_found' }); return true; }
      const small = url.searchParams.get('thumb') === '1' && f.thumb;
      res.writeHead(200, { 'content-type': small ? 'image/jpeg' : f.mime, 'cache-control': 'private, max-age=3600',
        'content-disposition': `${FILE_TYPES[f.mime] === 'image' ? 'inline' : 'attachment'}; filename="${String(f.name).replace(/[^\w.\- ]+/g, '_')}"`, 'x-content-type-options': 'nosniff' });
      res.end(small ? f.thumb : f.data); return true;
    }

    if (p === '/api/chat/proposal' && req.method === 'POST') {
      if (isStaff(u)) { json(res, 403, { error: 'not_allowed' }); return true; }
      const b = await body(req);
      const m = (await q("select * from chat_messages where id=$1 and kind='proposal'", [+b.id || 0])).rows[0];
      if (!m || !(await canSee(u, await channel(m.channel_id)))) { json(res, 404, { error: 'not_found' }); return true; }
      if (m.data.status !== 'pending') { json(res, 409, { error: 'already_' + m.data.status }); return true; }
      const ch = await channel(m.channel_id);
      if (b.decision === 'publish') {
        if (!(await apply(m.data.code, m.data.updates, u.email))) { json(res, 404, { error: 'event_gone' }); return true; }
        await q(`update chat_messages set data = data || $2::jsonb where id=$1`, [m.id, JSON.stringify({ status: 'published', by: u.email, at: new Date().toISOString() })]);
        await post(ch, 'ai', `Published to the website by ${u.name || u.email}: ${m.data.title}.`, { author_name: AI_NAME, kind: 'system', data: { code: m.data.code } });
      } else {
        await q(`update chat_messages set data = data || $2::jsonb where id=$1`, [m.id, JSON.stringify({ status: 'dismissed', by: u.email, at: new Date().toISOString() })]);
      }
      json(res, 200, { ok: true }); return true;
    }
    json(res, 404, { error: 'not_found' }); return true;
  }

  /* @mentions still unread after 15 minutes: one email (and a WhatsApp message when set up) per message */
  async function notify() {
    const { rows } = await q(`select n.id, n.user_email, m.id mid, m.body, m.author, m.author_name, c.id cid, c.kind, c.name, u.name uname, u.phone, mb.last_read
      from chat_notify n join chat_messages m on m.id=n.message_id join chat_channels c on c.id=m.channel_id join users u on u.email=n.user_email and u.active
      left join chat_members mb on mb.channel_id=c.id and mb.user_email=n.user_email
      where n.sent_at is null and n.skipped is not true and n.due_at <= now() order by n.id limit 50`);
    const tpl = await ctx.setting('wa_mention_template');
    for (const r of rows) {
      if (+r.last_read >= +r.mid) { await q('update chat_notify set skipped=true where id=$1', [r.id]); continue; }
      const where = r.kind === 'dm' ? 'a direct message' : r.kind === 'record' ? r.name : '#' + r.name;
      const who = r.author_name || r.author;
      const link = `${BASE}/admin#chat/${r.cid}`;
      await queueMail(r.user_email, r.uname || '', `${who} mentioned you in ${where}`,
        wrapMail('You were mentioned', `<p style="color:#5A6472;font-size:15px"><b style="color:#0F1B2D">${esc(who)}</b> in ${esc(where)}:</p>
          <blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #A9761F;background:#fff;color:#0F1B2D">${esc(String(r.body).slice(0, 600))}</blockquote>
          <p style="margin:18px 0"><a href="${link}" style="background:#0F1B2D;color:#fff;text-decoration:none;border-radius:999px;padding:12px 22px;display:inline-block;font-weight:600">Open the team chat</a></p>`),
        'chat_mention');
      let wa = 'skipped';
      if (tpl && r.phone && waReady()) { try { await sendWhatsApp(r.phone, tpl, 'en', [who, where, String(r.body).slice(0, 300)]); wa = 'sent'; } catch (e) { wa = 'failed: ' + String(e.message || e).slice(0, 120); } }
      await q('update chat_notify set sent_at=now(), wa=$2 where id=$1', [r.id, wa]);
    }
    return rows.length;
  }

  return { handle, notify, post, apply };
}
