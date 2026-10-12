// A stand-in for Groq/OpenAI during tests: answers every chat request with a recognisable line.
// Chat answers carry the action tags the real model is asked for ([[register:F1]], [[lead]], [[person]]) when the question
// calls for them; back-office requests that ask for JSON get small, valid JSON of the requested shape.
const http = require('http');
const port = +(process.env.MOCK_PORT || 4299);
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    let q = '', sys = ''; try { const j = JSON.parse(b); q = (j.messages || []).slice(-1)[0].content || ''; sys = (j.messages || [])[0].content || ''; } catch {}
    let out;
    if (/You are the Gotham Consult CRM onboarding guide/.test(sys)) {
      out = JSON.stringify({ answer: '1. Open System → Users. 2. Select Add user, enter their details, and choose the correct role. Only the owner can create an account.' });
    } else if (/keep the website's forum pages up to date/.test(q)) {
      /* the team chat: a confirmed speaker becomes a proposal for forum F1; anything else proposes nothing */
      const msg = (q.match(/New message from [^:]+: ([^\n]*)/) || [])[1] || '';
      out = /confirmed/i.test(msg) ? JSON.stringify({ code: 'F1', updates: [{ type: 'add_speaker', name: 'Kwame Test', role: 'CEO, Test Mining' }, { type: 'news', text: 'MOCK news: Kwame Test joins the panel.' }, { type: 'nonsense' }] })
        : JSON.stringify({ code: '', updates: [] });
    } else if (/virtual receptionist of Kasa Family Clinic/.test(sys)) {
      /* the receptionist demo: a booking takes the first free time in the prompt; "busy slot" asks for a time that is not free */
      const m = q.match(/\((\d{4}-\d\d-\d\d)\): (\d\d:\d\d)/);
      const R = (say, action) => JSON.stringify({ say, action: action || { type: 'none' } });
      if (/^Action failed/.test(q)) out = R('MOCK sorry, ' + q.slice(15, 80));
      else if (/busy slot/i.test(q)) out = R('MOCK booking', { type: 'book', service: 'gp', date: '2000-01-01', time: '03:00', name: 'Ama Test', phone: '0241234567' });
      else if (/^Result of find_slots/.test(q) && m) out = R('MOCK booked', { type: 'book', service: 'gp', date: m[1], time: m[2], name: 'Ama Test', phone: '024 123 4567' });
      else if (/book/i.test(q)) out = R('', { type: 'find_slots', service: 'gp' });
      else if (/pay/i.test(q)) out = R('MOCK link sent', { type: 'pay_link', booking: 'B1' });
      else if (/cancel/i.test(q)) out = R('MOCK cancelled', { type: 'cancel', booking: 'B1' });
      else if (/no details/i.test(q)) out = R('MOCK a person will call', { type: 'handover', reason: 'x', name: '[caller name]', phone: '' });
      else if (/person|human|nurse/i.test(q)) out = R('MOCK a nurse will call you', { type: 'handover', reason: 'Wants a nurse', name: 'Ama Test', phone: '0241234567' });
      else out = 'Sure.\n' + R('MOCK receptionist: ' + q.slice(0, 60) + (/(French|Spanish)/.exec(sys.match(/Reply in (\w+)/)?.[0] || '') ? ' [' + sys.match(/Reply in (\w+)/)[1] + ']' : ''));
    } else if (/investor approach letter/.test(q)) {
      out = JSON.stringify({ subject: 'Ghana market entry conversation', body: /PII_SENTINEL|pii-sentinel@example\.test|0240000000/.test(q) ? 'MOCK leaked PII' : 'Dear {{first_name}},\n\nMOCK investor letter draft grounded in the supplied business context.' });
      out = 'Here you go:\n' + out;
    } else if (/Review this English campaign email/.test(q)) {
      out = JSON.stringify({ subject: 'Checked subject', body: 'Dear {{first_name}},\n\nChecked English campaign copy.', cta_label: 'Request a call', notes: ['Confirm the event date before sending.'] });
      out = 'Here you go:\n' + out;
    } else if (/Translate this reviewed English campaign email/.test(q)) {
      out = JSON.stringify({
        fr: { subject: 'Invitation au Ghana', body: 'Bonjour {{first_name}},\n\nTexte de la campagne.', cta_label: 'Demander un entretien' },
        es: { subject: 'Invitación a Ghana', body: 'Hola {{first_name}},\n\nTexto de la campaña.', cta_label: 'Solicitar una reunión' },
        de: { subject: 'Einladung nach Ghana', body: 'Guten Tag {{first_name}},\n\nKampagnentext.', cta_label: 'Gespräch anfragen' },
        ar: { subject: 'دعوة إلى غانا', body: 'مرحبًا {{first_name}}،\n\nنص الحملة.', cta_label: 'طلب اجتماع' },
        zh: { subject: '加纳邀请', body: '您好，{{first_name}}：\n\n活动邮件内容。', cta_label: '申请会谈' }
      });
      out = 'Here you go:\n' + out;
    } else if (/Answer only with JSON|Answer only JSON/.test(q)) {
      out = JSON.stringify(/"blocks"/.test(q) ? { subject: 'MOCK newsletter', blocks: [{ type: 'heading', text: 'MOCK heading', size: 'l' }, { type: 'text', text: 'Hello {{first_name}}, MOCK text.' },
            { type: 'image' }, { type: 'button', label: 'Read more', url: 'https://gothamconsult.com/forums', style: 'gold' }, { type: 'event', code: 'NOPE' }, { type: 'script' }] }
        : /"summary"/.test(q) ? { summary: 'MOCK summary: a mining company met at the forum.', next: 'Call them on Friday about the headline package' }
        : /"next_step"/.test(q) ? { next_step: 'Send the sponsorship proposal', next_date: day(3), why: 'They asked for the pack.' }
        : { subject: 'MOCK subject for {{first_name}}', body: 'Hello {{first_name}},\n\nMOCK body about the forum.' });
      out = 'Here you go:\n' + out;
    } else if (/one SMS text|WhatsApp message, at most/.test(q)) out = '"Hello {{first_name}}, MOCK short text."';
    else {
      out = 'MOCK-AI answer. You asked: ' + q.slice(0, 120);
      if (/seat|register/i.test(q)) out += '\n[[register:F1]]';
      else if (/call me|quote|meeting/i.test(q)) out += '\n[[lead]]';
      else if (/human|person|complain/i.test(q)) out += '\n[[person]]';
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: out } }] }));
  });
}).listen(port, '127.0.0.1', () => console.log('mock AI on', port));
