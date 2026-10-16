# Team chat in the back office (apps/crm/chat.js): channels, direct messages, threads on companies / deals / events,
# who may see what (staff never see company or deal threads), unread counts and @mentions, files kept private,
# mention emails after the delay (not when already read), and the AI's website proposals that only an admin can publish.
import subprocess, time, json, os, urllib.request, urllib.error, sys, atexit, base64, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
DB = os.environ.get('TEST_DATABASE_URL', 'postgres://test@127.0.0.1:5439/gotham_test')
TEST_PORT = int(os.environ.get('TEST_PORT', '4199'))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(os.path.join(ROOT, 'apps', 'crm'))
mock = subprocess.Popen(['node', os.path.join(ROOT, 'tests', 'e2e', 'mock_ai.js')], env={**os.environ, 'MOCK_PORT': '4293'}, stdout=subprocess.DEVNULL)
atexit.register(lambda: mock.poll() is None and mock.terminate())
env = dict(os.environ); env.update({'DATABASE_URL': DB, 'SESSION_SECRET': 't', 'PORT': str(TEST_PORT), 'ADMIN_EMAIL': 'owner', 'ADMIN_PASSWORD': 'ownerpass123', 'ADMIN_NAME': 'Uffe Carlson',
    'MEDIA_DIR': '/tmp/mediatest', 'PUBLIC_URL': f'http://127.0.0.1:{TEST_PORT}', 'SITE_URL': 'http://example.org',
    'OPENAI_API_KEY': 'test', 'OPENAI_BASE_URL': 'http://127.0.0.1:4293', 'OPENAI_MODEL': 'mock-model',
    'CHAT_MENTION_DELAY_MIN': '0.05', 'CHAT_NOTIFY_MS': '1000'})
WA = []
class API(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        WA.append(json.loads(self.rfile.read(int(self.headers['content-length']))))
        o = json.dumps({'messages': [{'id': 'wamid.%d' % len(WA)}]}).encode(); self.send_response(200); self.send_header('content-type', 'application/json'); self.end_headers(); self.wfile.write(o)
api = HTTPServer(('127.0.0.1', 4292), API); threading.Thread(target=api.serve_forever, daemon=True).start()
env.update({'WHATSAPP_TOKEN': 'wa-token', 'WHATSAPP_PHONE_ID': '123', 'WHATSAPP_API_BASE': 'http://127.0.0.1:4292'})
os.makedirs('/tmp/mediatest', exist_ok=True)
srv = subprocess.Popen(['node', 'server.js'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
atexit.register(lambda: srv.poll() is None and srv.terminate())
B = f'http://127.0.0.1:{TEST_PORT}'
def call(path, data=None, method=None, cookie=None):
    req = urllib.request.Request(B + path, data=json.dumps(data).encode() if data is not None else None, method=method or ('POST' if data is not None else 'GET'))
    req.add_header('content-type', 'application/json')
    if cookie: req.add_header('cookie', cookie)
    try:
        r = urllib.request.urlopen(req, timeout=60); raw = r.read()
        try: return r.status, json.loads(raw or b'{}'), r.headers
        except Exception: return r.status, raw, r.headers
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b or b'{}'), e.headers
        except Exception: return e.code, b[:300], e.headers
for _ in range(60):
    try:
        if call('/api/health')[0] == 200: break
    except Exception: pass
    time.sleep(0.4)
else: print('NO START'); print(srv.stdout.read()[:3000]); sys.exit(1)
def psql(sql): return subprocess.run(['psql', DB, '-qAtc', sql], capture_output=True, text=True, check=True).stdout.strip()
ok = lambda m: print('  ok', m)
psql('update users set must_change=false')
def login(u, p):
    st, d, h = call('/api/login', {'email': u, 'password': p}); assert st == 200, d; return h['set-cookie'].split(';')[0]
own = login('owner', 'ownerpass123')
pw = {}
for e, n, r in [('joy@gothamconsult.com', 'Joy Preston', 'admin'), ('door', 'Ama Door', 'staff')]:
    st, d, _ = call('/api/users', {'email': e, 'name': n, 'role': r}, cookie=own); assert st == 200, d; pw[e] = d['password']
psql('update users set must_change=false')
joy, staff = login('joy@gothamconsult.com', pw['joy@gothamconsult.com']), login('door', pw['door'])

# ---------- alert settings ----------
st, a, _ = call('/api/chat/prefs', {'phone': '024 555 0101'}, cookie=staff); assert st == 200, a
st, a, _ = call('/api/chat/prefs', cookie=staff); assert a['phone'] == '+233245550101' and 'wa_template' not in a and a['wa_ready'] is True, a
st, a, _ = call('/api/chat/prefs', {'wa_template': 'team_mention'}, cookie=staff); assert st == 403, a
st, a, _ = call('/api/chat/prefs', {'phone': '12'}, cookie=own); assert st == 400 and a['error'] == 'bad_phone', a
st, a, _ = call('/api/chat/prefs', {'wa_template': 'Team Mention!'}, cookie=joy); assert st == 400, a
st, a, _ = call('/api/chat/prefs', {'wa_template': 'team_mention'}, cookie=joy); assert st == 200, a
st, a, _ = call('/api/chat/prefs', cookie=own); assert a['wa_template'] == 'team_mention', a
ok('alert settings: each person sets their own WhatsApp number; only admins set the approved template name')

# ---------- channels and messages ----------
st, s, _ = call('/api/chat/state', cookie=own)
names = [c['name'] for c in s['channels']]
assert st == 200 and {'general', 'forums', 'investors'} <= set(names) and s['unread'] == 0 and s['ai'] is True, s
assert {u['email'] for u in s['users']} == {'owner', 'joy@gothamconsult.com', 'door'}, s['users']
gen = next(c['id'] for c in s['channels'] if c['name'] == 'general')
st, a, _ = call('/api/chat/messages', {'channel': gen, 'body': 'Morning team. @Joy can you check the venue list?'}, cookie=own)
m1 = a['message']; assert st == 200 and m1['mentions'] == ['joy@gothamconsult.com'] and m1['author_name'] == 'Uffe Carlson', a
st, a, _ = call('/api/chat/messages', {'channel': gen, 'body': '   '}, cookie=own); assert st == 400, a
st, s, _ = call('/api/chat/state', cookie=joy)
g = next(c for c in s['channels'] if c['id'] == gen); assert g['unread'] == 1 and g['mentioned'] == 1 and s['mentioned'] == 1, g
st, s2, _ = call('/api/chat/state', cookie=staff); assert next(c for c in s2['channels'] if c['id'] == gen)['unread'] == 1 and s2['mentioned'] == 0, s2
st, s3, _ = call('/api/chat/state', cookie=own); assert s3['unread'] == 0, s3
st, l, _ = call('/api/chat/messages?channel=%d' % gen, cookie=joy); assert [m['id'] for m in l['messages']] == [m1['id']] and not l['more'], l
call('/api/chat/read', {'channel': gen, 'last': m1['id']}, cookie=joy)
st, s, _ = call('/api/chat/state', cookie=joy); assert s['unread'] == 0 and s['mentioned'] == 0, s
st, a, _ = call('/api/chat/messages', {'channel': gen, 'body': 'Done. @all the venue is booked'}, cookie=joy)
assert sorted(a['message']['mentions']) == ['door', 'owner'], a
st, l, _ = call('/api/chat/messages?channel=%d&after=%d' % (gen, m1['id']), cookie=own); assert len(l['messages']) == 1, l
ok('channels: send, @first-name and @all mentions, unread and mention counts per person, mark as read, only newer messages on request')

# ---------- channels, DMs, threads and who sees what ----------
st, a, _ = call('/api/chat/channels', {'name': '#Sponsors 2027!', 'topic': 'Headline deals'}, cookie=joy); assert st == 200 and a['channel']['name'] == 'sponsors-2027', a
st, a, _ = call('/api/chat/channels', {'name': 'x'}, cookie=staff); assert st == 403, a
st, a, _ = call('/api/chat/dm', {'email': 'door'}, cookie=own); dm = a['channel']['id']
st, a2, _ = call('/api/chat/dm', {'email': 'owner'}, cookie=staff); assert a2['channel']['id'] == dm, a2
call('/api/chat/messages', {'channel': dm, 'body': 'Can you open the door at 8?'}, cookie=own)
st, l, _ = call('/api/chat/messages?channel=%d' % dm, cookie=joy); assert st == 404, l
st, s, _ = call('/api/chat/state', cookie=joy); assert dm not in [c['id'] for c in s['channels']], s
st, a, _ = call('/api/chat/dm', {'email': 'owner'}, cookie=own); assert st == 400, a
cid = int(psql("insert into contacts(company, full_name, email) values ('Asante Gold Test','Kofi Asante','kofi@example.com') returning id"))
st, a, _ = call('/api/chat/thread', {'ref_type': 'contact', 'ref_id': cid}, cookie=joy); th = a['channel']['id']
assert st == 200 and a['channel']['name'] == 'Asante Gold Test', a
st, a, _ = call('/api/chat/thread', {'ref_type': 'contact', 'ref_id': cid}, cookie=own); assert a['channel']['id'] == th, a
st, s, _ = call('/api/chat/state', cookie=joy); assert th not in [c['id'] for c in s['channels']], 'an empty thread is not listed'
call('/api/chat/messages', {'channel': th, 'body': 'Kofi wants the mining briefing next week'}, cookie=joy)
st, s, _ = call('/api/chat/state', cookie=own); assert any(c['id'] == th and c['ref_type'] == 'contact' and c['unread'] == 1 for c in s['channels']), s
st, l, _ = call('/api/chat/messages?channel=%d' % th, cookie=staff); assert st == 404, l
st, s, _ = call('/api/chat/state', cookie=staff); assert th not in [c['id'] for c in s['channels']], s
st, a, _ = call('/api/chat/thread', {'ref_type': 'contact', 'ref_id': cid}, cookie=staff); assert st == 403, a
st, a, _ = call('/api/chat/thread', {'ref_type': 'item', 'ref_id': 'F1'}, cookie=staff); ev = a['channel']['id']; assert st == 200 and '(F1)' in a['channel']['name'], a
st, a, _ = call('/api/chat/thread', {'ref_type': 'item', 'ref_id': 'NOPE'}, cookie=own); assert st == 404, a
ok('new channels (admins), direct messages only for the two people, a thread per company / deal / event; staff never see company or deal threads')

# ---------- files ----------
png = base64.b64encode(subprocess.run(['node', '-e', "require('sharp')({create:{width:900,height:600,channels:3,background:'#2F5D8C'}}).png().toBuffer().then(b=>process.stdout.write(b.toString('base64')))"], capture_output=True, text=True, check=True).stdout.encode()).decode()
png = base64.b64decode(png).decode()
st, a, _ = call('/api/chat/upload', {'name': 'venue.png', 'type': 'image/png', 'data': png}, cookie=own); fid = a['file']
st, a, _ = call('/api/chat/messages', {'channel': th, 'body': '', 'file': fid}, cookie=own); assert st == 200 and a['message']['file']['kind'] == 'image', a
st, a, _ = call('/api/chat/upload', {'name': 'x.exe', 'type': 'application/x-msdownload', 'data': 'TVqQ'}, cookie=own); assert st == 400 and a['error'] == 'file_type', a
st, body, h = call('/api/chat/files/%s?thumb=1' % fid, cookie=joy); assert st == 200 and h['content-type'] == 'image/jpeg' and body[:2] == b'\xff\xd8', (st, h)
st, body, h = call('/api/chat/files/%s' % fid, cookie=staff); assert st == 404, st
st, body, h = call('/api/chat/files/%s' % fid); assert st == 401, st
st, a, _ = call('/api/chat/upload', {'name': 'b.png', 'type': 'image/png', 'data': png}, cookie=joy)
st, a2, _ = call('/api/chat/messages', {'channel': gen, 'body': 'x', 'file': a['file']}, cookie=own); assert st == 400 and a2['error'] == 'bad_file', a2
ok('photos and files: kept in the database, a small preview for images, only people who can read the conversation can open them; unknown file types refused')

# ---------- deleting ----------
st, a, _ = call('/api/chat/messages/%d' % m1['id'], method='DELETE', cookie=joy); assert st == 403, a
st, a, _ = call('/api/chat/messages/%d' % m1['id'], method='DELETE', cookie=own); assert st == 200, a
st, l, _ = call('/api/chat/messages?channel=%d' % gen, cookie=joy); assert l['messages'][0]['deleted'] and l['messages'][0]['body'] == '', l
ok('only the writer (or the owner) deletes a message; it shows as deleted')

# ---------- AI proposals for the website ----------
call('/api/chat/messages', {'channel': ev, 'body': 'Maybe we should ask the minister?'}, cookie=staff)
call('/api/chat/messages', {'channel': ev, 'body': 'Kwame Test from Test Mining confirmed as speaker!'}, cookie=staff)
for _ in range(40):
    st, l, _ = call('/api/chat/messages?channel=%d' % ev, cookie=own)
    props = [m for m in l['messages'] if m['kind'] == 'proposal']
    if props: break
    time.sleep(0.25)
assert len(props) == 1 and props[0]['author_name'] == 'Gotham AI' and props[0]['data']['code'] == 'F1' and props[0]['data']['status'] == 'pending', l
assert [u['type'] for u in props[0]['data']['updates']] == ['add_speaker', 'news'] and 'Kwame Test' in props[0]['body'], props[0]
before = json.loads(psql("select speakers from items where code='F1'") or '[]')
assert not any(s['name'] == 'Kwame Test' for s in before)
st, a, _ = call('/api/chat/proposal', {'id': props[0]['id'], 'decision': 'publish'}, cookie=staff); assert st == 403, a
st, a, _ = call('/api/chat/proposal', {'id': props[0]['id'], 'decision': 'publish'}, cookie=joy); assert st == 200, a
st, a, _ = call('/api/chat/proposal', {'id': props[0]['id'], 'decision': 'publish'}, cookie=own); assert st == 409, a
sp = json.loads(psql("select speakers from items where code='F1'"))
assert {'name': 'Kwame Test', 'role': 'CEO, Test Mining'} in sp, sp
up = json.loads(psql("select updates from items where code='F1'")); assert up[0]['text'] == 'MOCK news: Kwame Test joins the panel.', up
st, l, _ = call('/api/chat/messages?channel=%d' % ev, cookie=own)
assert l['messages'][-1]['kind'] == 'system' and 'Published to the website by Joy Preston' in l['messages'][-1]['body'], l['messages'][-1]
assert psql("select count(*) from audit_log where action='chat_publish'") == '1'
ok('a confirmed speaker becomes a proposal (questions do not); staff cannot publish; an admin publishes once: speaker and news line go on the forum page, logged')

# ---------- mention emails ----------
time.sleep(5)
mails = psql("select to_email||'|'||subject from outbox where kind='chat_mention' order by id")
assert 'door|Joy Preston mentioned you in #general' in mails and 'owner|Joy Preston mentioned you in #general' in mails, mails
assert 'joy@gothamconsult.com|' not in mails, 'Joy read her mention before the email was due: no email'
assert psql("select count(*) from chat_notify where sent_at is null and skipped is not true") == '0'
wa = [m for m in WA if m.get('type') == 'template']
assert len(wa) == 1 and wa[0]['to'] == '233245550101' and wa[0]['template']['name'] == 'team_mention', WA
assert [p['text'] for p in wa[0]['template']['components'][0]['parameters']][:2] == ['Joy Preston', '#general'], wa
assert psql("select count(*) from chat_notify where wa='sent'") == '1'
ok('@mentions not read in time get one email each, and a WhatsApp template message where a number is set; mentions already read get none')

srv.terminate(); print('PASSED')
