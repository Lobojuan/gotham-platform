# AI everywhere, tested against a stand-in model (tests/e2e/mock_ai.js) and a stand-in WhatsApp (Meta) API:
# the website chat's buttons (register, leave your details, WhatsApp a person) and its leads in the CRM;
# the back-office helper (email, SMS, designer, client summary, deal next step); WhatsApp AI replies with hand-over to a person.
import subprocess, time, json, os, urllib.request, urllib.error, sys, atexit, threading, hmac, hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
DB = os.environ.get('TEST_DATABASE_URL', 'postgres://test@127.0.0.1:5439/gotham_test')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(os.path.join(ROOT, 'apps', 'crm'))
mock = subprocess.Popen(['node', os.path.join(ROOT, 'tests', 'e2e', 'mock_ai.js')], env={**os.environ, 'MOCK_PORT': '4297'}, stdout=subprocess.DEVNULL)
atexit.register(lambda: mock.poll() is None and mock.terminate())
WA = []
class API(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        b = json.loads(self.rfile.read(int(self.headers['content-length']))); WA.append(b)
        o = json.dumps({'messages': [{'id': 'wamid.out%d' % len(WA)}]}).encode(); self.send_response(200); self.send_header('content-type', 'application/json'); self.end_headers(); self.wfile.write(o)
api = HTTPServer(('127.0.0.1', 4296), API); threading.Thread(target=api.serve_forever, daemon=True).start()
env = dict(os.environ); env.update({'DATABASE_URL': DB, 'SESSION_SECRET': 't', 'PORT': '4199', 'ADMIN_EMAIL': 'admin', 'ADMIN_PASSWORD': 'ownerpass123', 'ADMIN_NAME': 'Admin',
    'MEDIA_DIR': '/tmp/mediatest', 'PUBLIC_URL': 'http://127.0.0.1:4199', 'SITE_URL': 'http://example.org',
    'OPENAI_API_KEY': 'test', 'OPENAI_BASE_URL': 'http://127.0.0.1:4297', 'OPENAI_MODEL': 'mock-model',
    'WHATSAPP_TOKEN': 'wa-token', 'WHATSAPP_PHONE_ID': '123', 'WHATSAPP_APP_SECRET': 'shh', 'WHATSAPP_API_BASE': 'http://127.0.0.1:4296'})
os.makedirs('/tmp/mediatest', exist_ok=True)
srv = subprocess.Popen(['node', 'server.js'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
atexit.register(lambda: srv.poll() is None and srv.terminate())
B = 'http://127.0.0.1:4199'
def call(path, data=None, method=None, cookie=None, headers=None, raw=None):
    req = urllib.request.Request(B + path, data=raw if raw is not None else (json.dumps(data).encode() if data is not None else None), method=method or ('POST' if (data is not None or raw is not None) else 'GET'))
    req.add_header('content-type', 'application/json')
    for k, v in (headers or {}).items(): req.add_header(k, v)
    if cookie: req.add_header('cookie', cookie)
    try:
        r = urllib.request.urlopen(req, timeout=60); return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b or b'{}')
        except Exception: return e.code, b[:300]
for _ in range(60):
    try:
        if call('/api/health')[0] == 200: break
    except Exception: pass
    time.sleep(0.4)
else: print('NO START'); print(srv.stdout.read()[:3000]); sys.exit(1)
def psql(sql): return subprocess.run(['psql', DB, '-qAtc', sql], capture_output=True, text=True, check=True).stdout.strip()
ok = lambda m: print('  ok', m)
psql('update users set must_change=false')
st, _ = call('/api/login', {'email': 'admin', 'password': 'ownerpass123'})
req = urllib.request.Request(B + '/api/login', data=json.dumps({'email': 'admin', 'password': 'ownerpass123'}).encode(), method='POST'); req.add_header('content-type', 'application/json')
ck = urllib.request.urlopen(req).headers['set-cookie'].split(';')[0]
IP = iter(range(10, 250))
def visitor(): return {'x-real-ip': '10.55.%d.1' % next(IP)}

# ---------- website chat: buttons under the answer ----------
st, a = call('/api/ask', {'q': 'I want a seat at the next forum'}, headers=visitor())
assert st == 200 and a['answer'].startswith('MOCK-AI answer') and '[[' not in a['answer'], a
reg = [x for x in a['actions'] if x['type'] == 'register']
assert reg and reg[0]['code'] == 'F1' and reg[0]['title'] and reg[0]['approval'] is True, a['actions']
st, a = call('/api/ask', {'q': 'Can someone call me with a quote?'}, headers=visitor()); assert {'type': 'lead'} in a['actions'], a
st, a = call('/api/ask', {'q': 'I want to speak to a human'}, headers=visitor()); assert {'type': 'person'} in a['actions'], a
st, a = call('/api/ask', {'q': 'What is GIPA?'}, headers=visitor()); assert a['actions'] == [], a
ok('chat answers carry the right button: register for a real open forum, leave your details, or a person; the tags never show')

# ---------- chat lead ----------
st, e = call('/api/chat-lead', {'name': 'Kwesi Owusu', 'contact': '0244 123 456', 'need': 'Market entry for a Danish solar firm'}, headers=visitor()); assert st == 400 and e['error'] == 'consent_required', e
st, e = call('/api/chat-lead', {'name': '', 'contact': 'x', 'consent': True}, headers=visitor()); assert st == 400 and e['error'] == 'missing_fields', e
st, d = call('/api/chat-lead', {'name': 'Kwesi Owusu', 'company': 'Nordic Sun', 'contact': '0244 123 456', 'need': 'Market entry for a Danish solar firm',
    'question': 'Can someone call me with a quote?', 'consent': True, 'language': 'fr'}, headers=visitor()); assert st == 200, d
c = json.loads(psql("select row_to_json(c) from contacts c where full_name='Kwesi Owusu'"))
assert c['phone'] == '+233244123456' and 'chat-lead' in c['tags'] and c['source'] == 'Website chat' and c['consent_email'] == 'unknown', c
assert psql("select count(*) from deals where contact_id=%d and title='Nordic Sun · website chat'" % c['id']) == '1'
assert 'Market entry for a Danish solar firm' in psql("select title from tasks where contact_id=%d" % c['id'])
assert 'Language: fr' in psql("select body from notes where contact_id=%d" % c['id'])
ok('"Leave your details" makes a contact, a deal and a task for tomorrow; no marketing consent is assumed')

# ---------- back-office helper ----------
st, r = call('/api/ai', {'task': 'email', 'brief': 'Invite mining MDs to the October forum'}, cookie=ck)
assert st == 200 and r['subject'] == 'MOCK subject for {{first_name}}' and r['body'].startswith('Hello {{first_name}}'), r
psql("update contacts set full_name='PII_SENTINEL', email='pii-sentinel@example.test', phone='+233240000000', client_type='investor', company='Nordic Sun', sector='Renewable energy', country='Denmark' where id=%d" % c['id'])
st, r = call('/api/ai', {'task': 'investor_letter', 'contact_id': c['id'], 'brief': 'Their public report mentions West Africa expansion.', 'source_url': 'https://example.org/report'}, cookie=ck)
assert st == 200 and r['subject'] == 'Ghana market entry conversation' and 'MOCK investor letter draft' in r['body'] and 'PII' not in r['body'], r
assert call('/api/ai', {'task': 'investor_letter', 'contact_id': 99999, 'brief': 'Research'}, cookie=ck)[0] == 404
assert call('/api/ai', {'task': 'investor_letter', 'contact_id': c['id']}, cookie=ck)[1]['error'] == 'brief_required'
assert call('/api/ai', {'task': 'investor_letter', 'contact_id': c['id'], 'brief': 'Research'})[0] == 401
st, saved = call('/api/notes', {'contact_id': c['id'], 'kind': 'note', 'body': 'AI investor letter draft — not sent\nSubject: Ghana market entry conversation\n\n' + r['body']}, cookie=ck)
assert st == 200 and 'not sent' in saved.get('body', ''), saved
assert psql("select count(*) from outbox where to_email='pii-sentinel@example.test'") == '0'
ok('investor letter drafts use business context only, require staff context, stay private until saved as a note, and never send')
st, reviewed = call('/api/ai', {'task': 'proofread_campaign', 'subject': 'Market entry for {{company}}', 'intro': 'Hello {{first_name}},\n\nWe invite you to discuss Ghana.', 'cta_label': 'Talk to us'}, cookie=ck)
assert st == 200 and reviewed['subject'] == 'Checked subject' and 'Checked English' in reviewed['body'] and reviewed['notes'], reviewed
st, tr = call('/api/ai', {'task': 'translate_campaign', 'subject': reviewed['subject'], 'intro': reviewed['body'], 'cta_label': reviewed['cta_label']}, cookie=ck)
assert st == 200 and set(tr['translations']) == {'fr','es','de','ar','zh'} and '{{first_name}}' in tr['translations']['fr']['body'], tr
assert call('/api/ai', {'task': 'translate_campaign', 'subject': 'Hi', 'intro': 'Write to ama@example.test'}, cookie=ck)[1]['error'] == 'personal_data_not_allowed'
st, cc = call('/api/contacts', {'company':'Frankfurt Fund','email':'localized@example.test','language':'fr-FR','client_type':'investor','country':'Germany','sector':'Mining','tags':'translate-test','consent_email':'yes','consent_source':'Asked to receive investor updates at the forum'}, cookie=ck)
assert st == 200, cc
st, camp = call('/api/campaigns', {'name':'Localized investor note','subject':reviewed['subject'],'intro':reviewed['body'],'cta_label':reviewed['cta_label'],'template':'plain','channel':'email','seg_tags':'translate-test','seg_consent':'yes','daily_limit':10,'translations':tr['translations']}, cookie=ck)
assert st == 200, camp
st, pv = call('/api/campaigns/%d/preview' % camp['id'], cookie=ck)
assert st == 200 and pv['translated'] and pv['sample_language'] == 'fr' and pv['subject'] == 'Invitation au Ghana' and 'Bonjour' in pv['html'] and 'dites-le ici' in pv['html'], pv
st, sent = call('/api/campaigns/%d/start' % camp['id'], {}, cookie=ck)
assert st == 200 and sent['queued'] == 1, sent
assert psql("select subject from outbox where to_email='localized@example.test' order by id desc limit 1") == 'Invitation au Ghana'
assert 'Texte de la campagne.' in psql("select body from outbox where to_email='localized@example.test' order by id desc limit 1")
ok('AI checks English, translates all five supported recipient languages, and French emails use the saved language with a localized opt-out')
st, r = call('/api/ai', {'task': 'sms', 'brief': 'Remind guests'}, cookie=ck); assert st == 200 and r['text'] == 'Hello {{first_name}}, MOCK short text.', r
st, r = call('/api/ai', {'task': 'designer', 'brief': 'Newsletter'}, cookie=ck)
assert st == 200 and [b['type'] for b in r['blocks']] == ['heading', 'text', 'image', 'button'] and r['subject'] == 'MOCK newsletter', r
ok('write an email, an SMS, or a whole designed email from one line (bad blocks and unknown events dropped)')
call('/api/notes', {'contact_id': c['id'], 'kind': 'call', 'body': 'Called Kwesi, wants the pack'}, cookie=ck)
st, r = call('/api/ai', {'task': 'client', 'contact_id': c['id']}, cookie=ck); assert st == 200 and r['summary'].startswith('MOCK summary') and r['next'], r
dl = int(psql("select id from deals where contact_id=%d" % c['id']))
st, r = call('/api/ai', {'task': 'deal', 'deal_id': dl}, cookie=ck); assert st == 200 and r['next_step'] == 'Send the sponsorship proposal' and len(r['next_date']) == 10, r
assert call('/api/ai', {'task': 'client', 'contact_id': 99999}, cookie=ck)[0] == 404
assert call('/api/ai', {'task': 'email', 'brief': ''}, cookie=ck)[1]['error'] == 'brief_required'
assert call('/api/ai', {'task': 'email', 'brief': 'x'})[0] == 401
ok('sum up a client and suggest a deal\'s next step; empty briefs, unknown records and signed-out calls refused')

# ---------- WhatsApp: AI replies ----------
def hook(msg, name='Ama Serwaa'):
    body = json.dumps({'entry': [{'changes': [{'value': {'contacts': [{'wa_id': msg['from'], 'profile': {'name': name}}], 'messages': [msg]}}]}]}).encode()
    sig = 'sha256=' + hmac.new(b'shh', body, hashlib.sha256).hexdigest()
    return call('/api/hooks/whatsapp', raw=body, headers={'x-hub-signature-256': sig})
def wait(cond, secs=8):
    for _ in range(int(secs / 0.25)):
        if cond(): return True
        time.sleep(0.25)
    return False
st, _ = hook({'from': '233244555666', 'id': 'wamid.in1', 'type': 'text', 'text': {'body': 'When is the next forum?'}}); assert st == 200
time.sleep(1.5); assert not WA, WA
assert psql("select count(*) from wa_messages where phone='+233244555666' and direction='in'") == '1'
amac = json.loads(psql("select row_to_json(c) from contacts c where phone='+233244555666'"))
assert amac['full_name'] == 'Ama Serwaa' and 'whatsapp-inbound' in amac['tags'] and 'Received: When is the next forum?' in psql("select body from notes where contact_id=%d" % amac['id'])
ok('with AI replies off, a message is saved on a new contact and waits for the team')
st, w = call('/api/whatsapp/autoreply', {'on': True}, cookie=ck); assert w['on'] and w['connected'] and w['ai'] and len(w['recent']) == 1, w
hook({'from': '233244555666', 'id': 'wamid.in2', 'type': 'text', 'text': {'body': 'How much is the forum?'}})
assert wait(lambda: len(WA) == 1), WA
assert WA[0]['type'] == 'text' and WA[0]['to'] == '233244555666' and WA[0]['text']['body'].startswith('MOCK-AI answer. You asked: How much is the forum?'), WA
hook({'from': '233244555666', 'id': 'wamid.in2', 'type': 'text', 'text': {'body': 'How much is the forum?'}}); time.sleep(1.2)
assert len(WA) == 1, 'answered a retried webhook twice'
ok('AI replies on: answered on WhatsApp once, even when Meta sends the same message again')
hook({'from': '233244555666', 'id': 'wamid.in3', 'type': 'text', 'text': {'body': 'I have a complaint about my payment, I want to talk to Joy'}})
assert wait(lambda: len(WA) == 2)
assert 'passed this to our team' in WA[1]['text']['body'], WA[1]
assert 'reply personally' in psql("select title from tasks where contact_id=%d and priority='high'" % amac['id'])
hook({'from': '233244555666', 'id': 'wamid.in4', 'type': 'audio', 'audio': {'id': 'x'}})
assert wait(lambda: len(WA) == 3) and psql("select count(*) from tasks where contact_id=%d" % amac['id']) == '2'
hook({'from': '233244555666', 'id': 'wamid.in5', 'type': 'text', 'text': {'body': 'Can we book a meeting?'}})
assert wait(lambda: len(WA) == 4) and 'follow up with you personally' in WA[3]['text']['body'] and psql("select count(*) from tasks where contact_id=%d" % amac['id']) == '3'
ok('complaints, voice notes and meeting requests go to the team as tasks, with a polite reply')
hook({'from': '233244555666', 'id': 'wamid.in6', 'type': 'text', 'text': {'body': 'STOP'}}); time.sleep(1.2)
assert len(WA) == 4 and psql("select consent_whatsapp from contacts where id=%d" % amac['id']) == 'no'
hook({'from': '233244555666', 'id': 'wamid.in7', 'type': 'text', 'text': {'body': 'hello again'}}); time.sleep(1.2)
assert len(WA) == 4
ok('STOP opts them out and the AI never writes to them again')
body = json.dumps({'entry': []}).encode()
assert call('/api/hooks/whatsapp', raw=body, headers={'x-hub-signature-256': 'sha256=bad'})[0] == 401
st, w = call('/api/whatsapp/autoreply', {'on': False}, cookie=ck); assert not w['on'] and len(w['recent']) >= 8
ok('unsigned webhooks refused; the switch turns AI replies off; the conversation shows in Settings')
print('\nALL AI TESTS PASSED')
