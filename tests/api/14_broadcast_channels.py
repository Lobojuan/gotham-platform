# Client database and broadcasts by email (the gothamconsult.com mailbox over SMTP), SMS (Arkesel) and WhatsApp (Meta):
# client type / country / consent per channel, audiences, suppression per channel, providers mocked, manual fallback,
# the hourly email limit, WhatsApp STOP and delivery webhooks, Brief subscribers joining the client list.
import subprocess, time, json, os, urllib.request, urllib.error, sys, re, atexit, threading, socketserver, hmac, hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
DB = os.environ.get('TEST_DATABASE_URL', 'postgres://test@127.0.0.1:5439/gotham_test')
TEST_PORT = int(os.environ.get('TEST_PORT', '4199'))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(os.path.join(ROOT, 'apps', 'crm'))

# ---- mock SMTP server (what the gothamconsult.com mailbox would accept) ----
MAILS = []
class SMTPH(socketserver.StreamRequestHandler):
    def handle(self):
        w = lambda s: self.wfile.write((s + '\r\n').encode())
        w('220 mock ESMTP'); data = None; rcpt = []
        while True:
            line = self.rfile.readline()
            if not line: return
            cmd = line.decode(errors='replace').strip()
            up = cmd.upper()
            if data is not None:
                if cmd == '.': MAILS.append({'rcpt': rcpt, 'data': '\n'.join(data)}); data = None; rcpt = []; w('250 queued'); continue
                data.append(cmd); continue
            if up.startswith('EHLO'): self.wfile.write(b'250-mock\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n')
            elif up.startswith('AUTH'): w('235 ok')
            elif up.startswith('MAIL'): w('250 ok')
            elif up.startswith('RCPT'): rcpt.append(cmd); w('250 ok')
            elif up == 'DATA': data = []; w('354 go')
            elif up == 'QUIT': w('221 bye'); return
            else: w('250 ok')
class TS(socketserver.ThreadingMixIn, socketserver.TCPServer): allow_reuse_address = True; daemon_threads = True
smtp = TS(('127.0.0.1', 2526), SMTPH); threading.Thread(target=smtp.serve_forever, daemon=True).start()

# ---- mock Arkesel + Meta ----
SMS, WA = [], []
class API(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        b = json.loads(self.rfile.read(int(self.headers['content-length'])))
        if self.path.startswith('/sms'):
            SMS.append({'key': self.headers.get('api-key'), **b}); out = {'status': 'success', 'data': {'id': 'sms%d' % len(SMS)}}
        else:
            WA.append({'auth': self.headers.get('authorization'), 'path': self.path, **b}); out = {'messages': [{'id': 'wamid.%d' % len(WA)}]}
        o = json.dumps(out).encode(); self.send_response(200); self.send_header('content-type', 'application/json'); self.end_headers(); self.wfile.write(o)
api = HTTPServer(('127.0.0.1', 4298), API); threading.Thread(target=api.serve_forever, daemon=True).start()

BASEENV = {'DATABASE_URL': DB, 'SESSION_SECRET': 't', 'PORT': str(TEST_PORT), 'ADMIN_EMAIL': 'admin', 'ADMIN_PASSWORD': 'ownerpass123', 'ADMIN_NAME': 'Admin',
    'MEDIA_DIR': '/tmp/mediatest', 'PUBLIC_URL': f'http://127.0.0.1:{TEST_PORT}', 'SITE_URL': 'http://example.org'}
os.makedirs('/tmp/mediatest', exist_ok=True)
srv = None
def start(extra):
    global srv
    if srv and srv.poll() is None: srv.terminate(); srv.wait(5)
    env = dict(os.environ); env.update(BASEENV); env.update(extra)
    srv = subprocess.Popen(['node', 'server.js'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for _ in range(60):
        try:
            if call('/api/health')[0] == 200: return
        except Exception: pass
        time.sleep(0.4)
    print('NO START'); print(srv.stdout.read()[:3000]); sys.exit(1)
atexit.register(lambda: srv and srv.poll() is None and srv.terminate())
B = f'http://127.0.0.1:{TEST_PORT}'
def call(path, data=None, method=None, cookie=None, raw=False, headers=None, body=None):
    req = urllib.request.Request(B + path, data=body if body is not None else (json.dumps(data).encode() if data is not None else None),
        method=method or ('POST' if (data is not None or body is not None) else 'GET'))
    req.add_header('content-type', 'application/json')
    for k, v in (headers or {}).items(): req.add_header(k, v)
    if cookie: req.add_header('cookie', cookie)
    try:
        r = urllib.request.urlopen(req, timeout=60); b = r.read()
        return r.status, (b if raw else json.loads(b or b'{}')), r.headers
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b or b'{}'), e.headers
        except Exception: return e.code, b[:300], e.headers
def psql(sql): return subprocess.run(['psql', DB, '-qAtc', sql], capture_output=True, text=True, check=True).stdout.strip()
ok = lambda m: print('  ok', m)
def login():
    psql('update users set must_change=false')
    st, d, h = call('/api/login', {'email': 'admin', 'password': 'ownerpass123'}); return h['set-cookie'].split(';')[0]

# ===== 1. no providers: everything waits, nothing is lost =====
start({})
ck = login()
people = [
    dict(company='Nordic Solar AS', full_name='Lars Holm', email='lars@nordic.example', phone='+47 912 34 567', client_type='international', country='Norway',
         consent_email='yes', consent_sms='yes', consent_whatsapp='yes', consent_source='met at the Oslo roadshow'),
    dict(company='Accra Brewery', full_name='Ama Owusu', email='ama@brew.example', phone='0244111222', client_type='corporate', country='Ghana',
         consent_email='yes', consent_sms='unknown', consent_whatsapp='no', tags='tier-a, gold'),
    dict(company='Goldfields Ghana', full_name='Kojo Asante', email='kojo@gf.example', phone='0244333444', client_type='corporate', country='Ghana', tags='goldfields'),
    dict(company='Ministry of Trade', full_name='Efua Mensah', email='efua@gov.example', phone='0244555666', client_type='government', country='Ghana', consent_sms='no'),
]
ids = []
for p in people:
    st, d, _ = call('/api/contacts', p, cookie=ck); assert st == 200, (st, d); ids.append(d['id'])
st, cs, _ = call('/api/contacts', cookie=ck)
lars = [c for c in cs['rows'] if c['id'] == ids[0]][0]
assert lars['client_type'] == 'international' and lars['country'] == 'Norway' and lars['consent_whatsapp'] == 'yes' and lars['consent_at'] and lars['phone'].startswith('+47'), lars
ok('client type, country, consent per channel and where consent came from are stored')
st, _, _ = call('/api/contacts/%d' % ids[2], {'client_type': 'international', 'country': 'UK', 'consent_sms': 'yes'}, method='PATCH', cookie=ck)
k2 = [c for c in call('/api/contacts', cookie=ck)[1]['rows'] if c['id'] == ids[2]][0]
assert k2['client_type'] == 'international' and k2['country'] == 'UK' and k2['consent_sms'] == 'yes' and k2['consent_at'], k2
call('/api/contacts/%d' % ids[2], {'client_type': 'corporate', 'country': 'Ghana', 'consent_sms': 'unknown'}, method='PATCH', cookie=ck)
ok('editing type, country and consent works')

def camp(**kw):
    st, d, _ = call('/api/campaigns', {'name': kw.pop('name', 'T'), 'subject': 'News from Gotham', 'intro': 'Hello {{first_name}}', 'daily_limit': 100, **kw}, cookie=ck)
    assert st == 200, d; return d['id']
def aud(cid): return call('/api/campaigns/%d/preview' % cid, cookie=ck)[1]
assert aud(camp(seg_type='international'))['audience'] == 1
assert aud(camp(seg_type='corporate', seg_country='ghana'))['audience'] == 2
assert aud(camp(seg_tags='gold'))['audience'] == 1, 'tag "gold" must not match "goldfields"'
assert aud(camp(seg_consent='yes'))['audience'] == 2
ok('audiences by client type, country, whole tags and "said yes" work')
assert aud(camp(channel='sms', sms_text='Hi'))['audience'] == 3, 'SMS: the person who said no is left out'
assert aud(camp(channel='whatsapp', sms_text='Hi'))['audience'] == 1, 'WhatsApp: only people who said yes'
ok('SMS leaves out people who said no; WhatsApp only goes to people who said yes')

sms_id = camp(name='SMS wave', channel='sms', sms_text='Hello {{first_name}}, Gotham invites you to SMEs at the Centre.', cta_url='https://gothamconsult.com/register?e=F1')
pv = aud(sms_id); assert pv['text'] and pv['text'].startswith('Hello Lars') and '/u/' in pv['text'] and pv['provider'] is None, pv
st, r, _ = call('/api/campaigns/%d/start' % sms_id, {}, cookie=ck); assert st == 200 and r['queued'] == 3, r
st, msgs, _ = call('/api/messages', cookie=ck)
q = [m for m in msgs['rows'] if m['channel'] == 'sms' and m['status'] == 'queued']
assert len(q) == 3 and all('/u/' in m['body'] and 'register?e=F1' in m['body'] for m in q), q
assert any(m['body'].startswith('Hello Lars') for m in q)
ok('without an SMS provider the texts wait, personalised, with the link and an opt-out link')
st, ch, _ = call('/api/channels', cookie=ck)
assert ch['sms']['ready'] is False and ch['sms']['waiting'] == 3 and ch['email']['via'] is None, ch
call('/api/messages/%d/sent' % q[0]['id'], {}, cookie=ck)
assert psql("select status from msg_outbox where id=%d" % q[0]['id']) == 'sent'
assert psql("select status from campaign_sends where msg_id=%d" % q[0]['id']) == 'sent'
ok('marking a hand-sent text as sent updates the campaign too')

em_id = camp(name='Email wave', seg_country='norway')
call('/api/campaigns/%d/start' % em_id, {}, cookie=ck)
c = [x for x in call('/api/campaigns', cookie=ck)[1]['rows'] if x['id'] == em_id][0]
assert c['sent'] == 0 and c['in_flight'] == 1, c
ok('email without a mail account is not counted as sent (it waits in the outbox)')

# opt-out per channel
tok = psql("select token from campaign_sends where campaign_id=%d and contact_id=%d" % (sms_id, ids[0]))
st, _, _ = call('/u/' + tok, raw=True); assert st == 200
row = psql("select consent_sms||'|'||coalesce(sms_unsub_at::text,'')||'|'||consent_email||'|'||status from contacts where id=%d" % ids[0]).split('|')
assert row[0] == 'no' and row[1] and row[2] == 'yes' and row[3] != 'do_not_contact', row
assert aud(camp(channel='sms', sms_text='x'))['audience'] == 2 and aud(camp(seg_country='norway'))['audience'] == 1
ok('SMS opt-out stops SMS only; Lars still gets email')

# Brief subscribers and registrants join the client list
psql("insert into items(code,kind,title,currency,price) values ('BRIEF','membership','Ghana Business Brief','GHS',0) on conflict do nothing")
psql("""insert into registrations(reference,item_code,company,full_name,email,phone,currency,confirmed_email,marketing_opt_in,consent_at,status)
        values ('GC-B-1','BRIEF','Oslo Invest','Nina Berg','nina@oslo.example','+4790000000','GHS',true,true,now(),'confirmed'),
               ('GC-B-2','BRIEF','Nope Ltd','Not Confirmed','nc@x.example','0244000999','GHS',false,true,now(),'new')""")
st, sy, _ = call('/api/contacts/sync', {}, cookie=ck); assert sy['added'] == 1, sy
nina = [x for x in call('/api/contacts', cookie=ck)[1]['rows'] if x['email'] == 'nina@oslo.example'][0]
assert 'brief' in nina['tags'] and nina['consent_email'] == 'yes' and 'Brief' in (nina['consent_source'] or ''), nina
st, sy2, _ = call('/api/contacts/sync', {}, cookie=ck); assert sy2['added'] == 0, sy2
assert aud(camp(seg_tags='brief'))['audience'] == 1
ok('confirmed Brief subscribers join the client list once, tagged "brief", with their email consent; unconfirmed ones do not')

# ===== 2. providers on: SMTP mailbox, Arkesel, WhatsApp Cloud =====
start({'SMTP_HOST': '127.0.0.1', 'SMTP_PORT': '2526', 'SMTP_USER': 'info@gothamconsult.com', 'SMTP_PASS': 'x', 'SMTP_INSECURE_TEST': '1',
       'MAIL_HOURLY_LIMIT': '3', 'ARKESEL_API_KEY': 'ark-test', 'ARKESEL_URL': 'http://127.0.0.1:4298/sms', 'SMS_SENDER_ID': 'GOTHAM',
       'WHATSAPP_TOKEN': 'wa-test', 'WHATSAPP_PHONE_ID': '123', 'WHATSAPP_API_BASE': 'http://127.0.0.1:4298/wa',
       'WHATSAPP_VERIFY_TOKEN': 'verify-me', 'WHATSAPP_APP_SECRET': 'app-secret'})
ck = login()
for _ in range(40):
    if MAILS: break
    time.sleep(0.25)
st, ch, _ = call('/api/channels', cookie=ck)
assert ch['email']['via'] == 'smtp' and ch['sms']['ready'] and ch['whatsapp']['ready'], ch
st, _, _ = call('/api/outbox/flush', {}, cookie=ck)
assert MAILS and any('lars@nordic.example' in ' '.join(m['rcpt']) for m in MAILS), MAILS
m0 = [m for m in MAILS if 'lars@nordic.example' in ' '.join(m['rcpt'])][0]['data']
assert 'List-Unsubscribe:' in m0 and 'uffe.carlson@gothamconsult.com' in m0, m0[:600]
assert psql("select status from campaign_sends where campaign_id=%d" % em_id) == 'sent'
ok('email goes out through the mailbox by SMTP, with a List-Unsubscribe header, and the campaign shows it as sent')

for i in range(5): psql("insert into outbox(to_email,subject,body,kind) values ('x%d@x.example','s','<p>b</p>','campaign')" % i)
psql("insert into outbox(to_email,subject,body,kind) values ('ticket@x.example','Your ticket','<p>t</p>','ticket')")
call('/api/outbox/flush', {}, cookie=ck)
sent_hour = int(psql("select count(*) from outbox where status='sent' and sent_at > now() - interval '1 hour'"))
assert sent_hour <= 3, sent_hour
assert psql("select status from outbox where to_email='ticket@x.example'") == 'sent', 'tickets go before newsletters'
ok('hourly email limit respected (%d/3) and tickets go before newsletters' % sent_hour)

# SMS through Arkesel (the 2 queued ones from before: Lars opted out, so re-check suppression happens on queue → he was already queued)
wa_id = camp(name='WA invite', channel='whatsapp', sms_text='Hello {{first_name}}', wa_template='forum_invitation', wa_lang='en', wa_params='{{first_name}}\nSMEs at the Centre')
st, r, _ = call('/api/campaigns/%d/start' % wa_id, {}, cookie=ck); assert st == 200 and r['queued'] == 1, r
for _ in range(20):
    if WA: break
    time.sleep(0.25)
assert WA and WA[0]['template']['name'] == 'forum_invitation' and WA[0]['to'] == '4791234567' and WA[0]['auth'] == 'Bearer wa-test', WA
assert [p['text'] for p in WA[0]['template']['components'][0]['parameters']] == ['Lars', 'SMEs at the Centre'], WA[0]
ok('WhatsApp goes out as the approved template with personalised values')
sms2 = camp(name='SMS 2', channel='sms', sms_text='Hi {{first_name}}')
call('/api/campaigns/%d/start' % sms2, {}, cookie=ck)
for _ in range(20):
    if SMS: break
    time.sleep(0.25)
assert SMS and SMS[0]['key'] == 'ark-test' and SMS[0]['sender'] == 'GOTHAM' and all(not r.startswith('+') for r in SMS[0]['recipients']), SMS
assert not any('4791234567' in ' '.join(s['recipients']) for s in SMS), 'opted-out number must not get SMS'
ok('SMS goes out through Arkesel from GOTHAM, never to the person who opted out')

# WhatsApp webhook: verification, delivery status, STOP
st, body, _ = call('/api/hooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42', raw=True)
assert st == 200 and body == b'42'
payload = json.dumps({'entry': [{'changes': [{'value': {'statuses': [{'id': 'wamid.1', 'status': 'delivered'}],
    'messages': [{'from': '4791234567', 'text': {'body': 'STOP'}}]}}]}]}).encode()
st, _, _ = call('/api/hooks/whatsapp', body=payload, headers={'x-hub-signature-256': 'sha256=bad'}); assert st == 401
sig = 'sha256=' + hmac.new(b'app-secret', payload, hashlib.sha256).hexdigest()
st, _, _ = call('/api/hooks/whatsapp', body=payload, headers={'x-hub-signature-256': sig}); assert st == 200
assert psql("select status from campaign_sends where campaign_id=%d" % wa_id) == 'delivered'
assert psql("select consent_whatsapp from contacts where id=%d" % ids[0]) == 'no'
assert aud(camp(channel='whatsapp', sms_text='x'))['audience'] == 0
ok('WhatsApp webhook: signed calls only, delivery recorded, STOP opts the person out of WhatsApp')

srv.terminate(); smtp.shutdown(); api.shutdown()
print('PASSED')
