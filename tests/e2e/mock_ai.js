// A stand-in for Groq/OpenAI during end-to-end tests: answers every chat request with a recognisable line.
const http = require('http');
const port = +(process.env.MOCK_PORT || 4299);
http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    let q = ''; try { const j = JSON.parse(b); q = (j.messages || []).slice(-1)[0].content || ''; } catch {}
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'MOCK-AI answer. You asked: ' + q.slice(0, 120) } }] }));
  });
}).listen(port, '127.0.0.1', () => console.log('mock AI on', port));
