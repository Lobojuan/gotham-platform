/* The AI receptionist demo (gothamconsult.com/demo/receptionist), for showing businesses what AI can do for them.
   An invented clinic, "Kasa Family Clinic". Free to run: the visitor's browser turns speech into text and text into speech;
   the reply comes from the same chat model as Ask Gotham (Groq's free tier by default).
   Nothing is written to the database. Each visit gets its own short-lived board in memory (bookings, payment links,
   call-backs), so the visitor watches the "back office" fill in while they talk, and it is gone when they leave. */

export const CLINIC = {
  name: 'Kasa Family Clinic',
  services: [
    { id: 'gp', name: 'Family doctor consultation', price: 250, mins: 30 },
    { id: 'child', name: 'Child check-up', price: 200, mins: 30 },
    { id: 'lab', name: 'Blood test', price: 150, mins: 15 },
    { id: 'dental', name: 'Dental check and cleaning', price: 300, mins: 30 },
    { id: 'antenatal', name: 'Antenatal visit', price: 220, mins: 30 },
  ],
};
const SVC = Object.fromEntries(CLINIC.services.map(s => [s.id, s]));
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* Opening hours: Monday to Friday 08:00-18:00, Saturday 09:00-13:00, closed Sunday. Ghana is on GMT all year,
   so UTC dates and times are Accra's. Which slots are taken is fixed per day (a hash), so it looks like a real diary. */
const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
export function freeSlots(now = new Date(), days = 6) {
  const out = [];   // { service, date, time }
  const d0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let added = 0;
  for (let i = 0; added < days && i < 14; i++) {
    const d = new Date(d0.getTime() + i * 864e5), dow = d.getUTCDay();
    if (dow === 0) continue;
    const [open, close] = dow === 6 ? [9, 13] : [8, 18];
    const date = d.toISOString().slice(0, 10);
    for (const s of CLINIC.services) {
      for (let m = open * 60; m + s.mins <= close * 60; m += 30) {
        const time = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
        if (new Date(date + 'T' + time + ':00Z') < new Date(now.getTime() + 45 * 60e3)) continue;   // not in the past or the next 45 minutes
        if (hash(s.id + date + time) % 100 < 55) continue;                                              // about half the diary is taken
        out.push({ service: s.id, date, time });
      }
    }
    added++;
  }
  return out;
}
export const dayLabel = date => { const d = new Date(date + 'T12:00:00Z'); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

/* one board per visit */
const boards = new Map();
export function board(sid) {
  let b = boards.get(sid);
  if (!b) {
    if (boards.size >= 400) { const oldest = [...boards.entries()].sort((x, y) => x[1].at - y[1].at)[0]; boards.delete(oldest[0]); }
    b = { at: Date.now(), n: 0, bookings: [], links: [], callbacks: [] };
    boards.set(sid, b);
  }
  b.at = Date.now();
  return b;
}
export function resetBoard(sid) { boards.delete(sid); }
setInterval(() => { const cut = Date.now() - 2 * 3600e3; for (const [k, v] of boards) if (v.at < cut) boards.delete(k); }, 10 * 60e3).unref();
export const publicBoard = b => ({ bookings: b.bookings, links: b.links, callbacks: b.callbacks });

export function systemPrompt(b, language, now = new Date()) {
  const lang = ({ fr: 'French', es: 'Spanish' })[language] || 'English';
  const slots = freeSlots(now);
  const byKey = {};
  for (const s of slots) (byKey[s.service + ' ' + s.date] ||= []).push(s.time);
  const diary = Object.entries(byKey).map(([k, t]) => { const [svc, date] = k.split(' '); return `- ${svc} ${date} (${dayLabel(date)}): ${t.slice(0, 8).join(' ')}`; }).join('\n');
  const today = now.toISOString().slice(0, 10);
  const mine = b.bookings.length ? b.bookings.map(x => `- ${x.id}: ${SVC[x.service].name}, ${dayLabel(x.date)} at ${x.time}, for ${x.name}, ${x.status}`).join('\n') : '- none yet';
  return `You are the virtual receptionist of Kasa Family Clinic, a private family clinic in Accra, Ghana. This is a sales demo with an invented clinic.
You speak on the phone, so every reply is read aloud: at most 2 short sentences (about 40 words), warm, clear, no lists, no emojis, no markdown.
Reply in ${lang}. Today is ${dayLabel(today)} (${today}); the time in Accra is ${now.toISOString().slice(11, 16)}.

Clinic facts (use only these, never invent):
- Open Monday to Friday 08:00 to 18:00, Saturday 09:00 to 13:00, closed Sunday and public holidays.
- Services and prices (Ghana cedis): ${CLINIC.services.map(s => `${s.name} GHS ${s.price} (${s.mins} min, code ${s.id})`).join('; ')}.
- Payment: Mobile Money (MTN, Telecel, AirtelTigo), card, or cash at the desk. NHIS is accepted for family doctor and antenatal visits.
- No medical advice, diagnosis or medicine doses: offer an appointment instead. If the caller describes an emergency (chest pain, heavy bleeding, difficulty breathing, unconscious, a baby not breathing, an accident), tell them to call 112 or go to the nearest emergency unit now.
- Never ask for card numbers or PINs.

Free appointment times (service code, date: times). Offer only these:
${diary}

Bookings made in this call:
${mine}

To book you need: the service, a free date and time from the list, the caller's name and a phone number. Ask for what is missing, one thing at a time, then confirm the details in one sentence.
Answer only with JSON, no other text: {"say": "what you say aloud", "action": ACTION}
ACTION is one of:
{"type": "none"}
{"type": "book", "service": "gp", "date": "YYYY-MM-DD", "time": "HH:MM", "name": "...", "phone": "..."}  (only when you have all five and the caller agreed)
{"type": "pay_link", "booking": "B1"}  (when the caller wants to pay now by Mobile Money for a booking made in this call)
{"type": "cancel", "booking": "B1"}
{"type": "handover", "reason": "...", "name": "...", "phone": "..."}  (the caller wants a person, a nurse or a doctor to call back, or you cannot help)
When you use an action, "say" tells the caller what you did (for a payment link: it was sent by SMS and WhatsApp).`;
}

/* the model's JSON, tolerant of a stray sentence or code fence around it */
export function parseReply(raw) {
  const s = String(raw || ''); const a = s.indexOf('{'), z = s.lastIndexOf('}');
  let j = null;
  if (a >= 0 && z > a) { try { j = JSON.parse(s.slice(a, z + 1)); } catch {} }
  if (!j || typeof j !== 'object') return { say: s.replace(/[{}"]/g, '').trim().slice(0, 400), action: { type: 'none' } };
  const say = String(j.say || '').replace(/\*\*|__|#+\s/g, '').trim().slice(0, 500);
  const action = j.action && typeof j.action === 'object' ? j.action : { type: 'none' };
  return { say, action };
}

/* carry out what the model asked for, on this visit's board; returns { ok, did } or { ok:false, why } */
export function act(b, action, phoneGH, now = new Date()) {
  const t = String(action.type || 'none');
  const str = (v, n) => String(v ?? '').trim().slice(0, n);
  if (t === 'none') return { ok: true };
  if (t === 'book') {
    const service = str(action.service, 20), date = str(action.date, 10), time = str(action.time, 5), name = str(action.name, 80);
    const phone = phoneGH(str(action.phone, 30));
    if (!SVC[service]) return { ok: false, why: 'unknown service' };
    if (!name) return { ok: false, why: 'the caller\'s name is missing' };
    if (!/^\+\d{9,15}$/.test(phone)) return { ok: false, why: 'the phone number is not complete' };
    if (!freeSlots(now).some(s => s.service === service && s.date === date && s.time === time)) return { ok: false, why: `${time} on ${date} is not a free ${SVC[service].name} time` };
    if (b.bookings.some(x => x.service === service && x.date === date && x.time === time && x.status !== 'cancelled')) return { ok: false, why: 'that time was just booked' };
    if (b.bookings.length >= 5) return { ok: false, why: 'the demo allows five bookings per visit' };
    const bk = { id: 'B' + (b.bookings.length + 1), service, serviceName: SVC[service].name, price: SVC[service].price, date, day: dayLabel(date), time, name, phone, status: 'booked' };
    b.bookings.push(bk);
    return { ok: true, did: { type: 'book', booking: bk } };
  }
  if (t === 'pay_link' || t === 'cancel') {
    const bk = b.bookings.find(x => x.id === str(action.booking, 6).toUpperCase()) || (b.bookings.length === 1 ? b.bookings[0] : null);
    if (!bk) return { ok: false, why: 'there is no booking with that number in this call' };
    if (t === 'cancel') { bk.status = 'cancelled'; return { ok: true, did: { type: 'cancel', booking: bk } }; }
    if (bk.status === 'cancelled') return { ok: false, why: 'that booking was cancelled' };
    const link = { booking: bk.id, amount: bk.price, to: bk.phone, url: `pay.example/kasa/${bk.id}-${Math.random().toString(36).slice(2, 7)}`, via: 'SMS and WhatsApp', status: 'sent' };
    b.links.push(link); bk.status = 'payment link sent';
    return { ok: true, did: { type: 'pay_link', link } };
  }
  if (t === 'handover') {
    if (b.callbacks.length >= 5) return { ok: false, why: 'too many call-backs in this demo' };
    const cb = { reason: str(action.reason, 160) || 'Caller asked for a person', name: str(action.name, 80), phone: phoneGH(str(action.phone, 30)), due: 'within 1 hour', status: 'task for the front desk' };
    b.callbacks.push(cb);
    return { ok: true, did: { type: 'handover', callback: cb } };
  }
  return { ok: false, why: 'unknown action' };
}
