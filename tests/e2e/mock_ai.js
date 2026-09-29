// A stand-in for Groq/OpenAI during tests: answers every chat request with a recognisable line.
// Chat answers carry the action tags the real model is asked for ([[register:F1]], [[lead]], [[person]]) when the question
// calls for them; back-office requests that ask for JSON get small, valid JSON of the requested shape.
const http = require('http');
const port = +(process.env.MOCK_PORT || 4299);
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    let q = ''; try { const j = JSON.parse(b); q = (j.messages || []).slice(-1)[0].content || ''; } catch {}
    let out;
    if (/Answer only with JSON/.test(q)) {
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
