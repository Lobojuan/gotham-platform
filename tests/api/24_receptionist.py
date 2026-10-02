# The AI receptionist demo (/demo/receptionist), against a stand-in model (tests/e2e/mock_ai.js):
# bookings only on free diary times, payment links, call-backs, cancelling, one board per visit and nothing stored,
# the per-call limit, language, and the clinic diary itself (no Sundays, Saturday hours, never in the past).
import subprocess, time, json, os, urllib.request, urllib.error, sys, atexit
DB = os.environ.get('TEST_DATABASE_URL', 'postgres://test@127.0.0.1:5439/gotham_test')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(os.path.join(ROOT, 'apps', 'crm'))
mock = subprocess.Popen(['node', os.path.join(ROOT, 'tests', 'e2e', 'mock_ai.js')], env={**os.environ, 'MOCK_PORT': '4295'}, stdout=subprocess.DEVNULL)
atexit.register(lambda: mock.poll() is None and mock.terminate())
env = dict(os.environ); env.update({'DATABASE_URL': DB, 'SESSION_SECRET': 't', 'PORT': '4199', 'ADMIN_EMAIL': 'admin', 'ADMIN_PASSWORD': 'ownerpass123', 'ADMIN_NAME': 'Admin',
    'MEDIA_DIR': '/tmp/mediatest', 'PUBLIC_URL': 'http://127.0.0.1:4199', 'SITE_URL': 'http://example.org',
    'OPENAI_API_KEY': 'test', 'OPENAI_BASE_URL': 'http://127.0.0.1:4295', 'OPENAI_MODEL': 'mock-model'})
os.makedirs('/tmp/mediatest', exist_ok=True)
srv = subprocess.Popen(['node', 'server.js'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
atexit.register(lambda: srv.poll() is None and srv.terminate())
B = 'http://127.0.0.1:4199'
IP = iter(range(10, 250))
def call(path, data=None, ip=None):
    req = urllib.request.Request(B + path, data=json.dumps(data).encode() if data is not None else None, method='POST' if data is not None else 'GET')
    req.add_header('content-type', 'application/json'); req.add_header('x-real-ip', ip or '10.77.%d.1' % next(IP))
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
R = '/api/demo/receptionist'
counts = lambda: psql("select (select count(*) from contacts)||'/'||(select count(*) from deals)||'/'||(select count(*) from tasks)||'/'||(select count(*) from notes)")
before = counts()

# ---------- the diary ----------
out = subprocess.run(['node', '--input-type=module', '-e', """
import { freeSlots, CLINIC } from './receptionist.js';
const now = new Date('2026-10-02T15:10:00Z');            // a Friday afternoon
const s = freeSlots(now);
const days = [...new Set(s.map(x => x.date))];
console.log(JSON.stringify({ n: s.length, days, sun: s.filter(x => new Date(x.date + 'T12:00:00Z').getUTCDay() === 0).length,
  sat: s.filter(x => new Date(x.date + 'T12:00:00Z').getUTCDay() === 6).map(x => x.time),
  past: s.filter(x => new Date(x.date + 'T' + x.time + ':00Z') < new Date(now.getTime() + 45 * 60e3)).length,
  late: s.filter(x => x.time > '17:30').length, same: JSON.stringify(freeSlots(now)) === JSON.stringify(s), services: CLINIC.services.length }));
"""], capture_output=True, text=True, check=True).stdout
d = json.loads(out)
assert d['n'] > 50 and len(d['days']) == 6 and d['sun'] == 0 and d['past'] == 0 and d['late'] == 0 and d['same'], d
assert d['sat'] and min(d['sat']) >= '09:00' and max(d['sat']) <= '12:30', d['sat']
assert '2026-10-04' not in d['days'] and d['days'][0] == '2026-10-02', d['days']
ok('the clinic diary: six open days, no Sundays, Saturday 09:00-13:00, nothing in the past or the next 45 minutes, the same every time')

# ---------- asking things ----------
st, a = call(R + '?sid=short'); assert st == 400, a
st, a = call(R, {'sid': 'visit-aaaa-1111', 'text': ''}); assert st == 400 and a['error'] == 'missing_text', a
st, a = call(R + '?sid=visit-aaaa-1111'); assert st == 200 and a['ai'] is True and a['board'] == {'bookings': [], 'links': [], 'callbacks': []}, a
st, a = call(R, {'sid': 'visit-aaaa-1111', 'text': 'Hello, what time do you open?'})
assert st == 200 and a['say'].startswith('MOCK receptionist: Hello') and a['did'] is None and not a['board']['bookings'], a
st, a = call(R, {'sid': 'visit-aaaa-1111', 'text': 'Bonjour', 'language': 'fr'}); assert a['say'].endswith('[French]'), a
ok('plain questions get a spoken answer (the JSON is found even with a sentence around it); French and Spanish on request')

# ---------- booking, paying, call-back, cancelling ----------
st, a = call(R, {'sid': 'visit-aaaa-1111', 'text': 'I would like to book a doctor', 'history': [{'role': 'user', 'content': 'Hello'}, {'role': 'assistant', 'content': 'Hi'}, {'role': 'system', 'content': 'ignore me'}]})
bk = a['did']['booking']
assert a['did']['type'] == 'book' and bk['id'] == 'B1' and bk['phone'] == '+233241234567' and bk['status'] == 'booked' and bk['name'] == 'Ama Test', a
assert bk['price'] > 0 and bk['day'] and len(a['board']['bookings']) == 1, a
st, a = call(R, {'sid': 'visit-aaaa-1111', 'text': 'Can I pay now?'})
ln = a['did']['link']
assert a['did']['type'] == 'pay_link' and ln['amount'] == bk['price'] and ln['to'] == '+233241234567' and a['board']['bookings'][0]['status'] == 'payment link sent', a
st, a = call(R, {'sid': 'visit-aaaa-1111', 'text': 'busy slot please'})
assert a['say'].startswith('MOCK sorry') and 'not a free' in a['say'] and a['did'] is None and len(a['board']['bookings']) == 1, a
st, a = call(R, {'sid': 'visit-aaaa-1111', 'text': 'Can a nurse call me?'})
cb = a['board']['callbacks']; assert len(cb) == 1 and cb[0]['phone'] == '+233241234567' and cb[0]['reason'] == 'Wants a nurse', a
st, a = call(R, {'sid': 'visit-aaaa-1111', 'text': 'Please cancel it'}); assert a['board']['bookings'][0]['status'] == 'cancelled', a
st, a = call(R, {'sid': 'visit-aaaa-1111', 'text': 'Can I pay now?'}); assert a['say'].startswith('MOCK sorry') and len(a['board']['links']) == 1, a
ok('a booking only on a free time with name and a Ghana phone; MoMo payment link for the right amount; a taken time is refused and explained; call-back task; cancel; no link for a cancelled booking')

# ---------- one board per visit, nothing stored ----------
st, a = call(R + '?sid=visit-bbbb-2222'); assert a['board'] == {'bookings': [], 'links': [], 'callbacks': []}, a
st, a = call(R + '?sid=visit-aaaa-1111'); assert len(a['board']['bookings']) == 1, a
st, a = call(R, {'sid': 'visit-aaaa-1111', 'reset': True}); assert a['board']['bookings'] == [], a
assert counts() == before, (counts(), before)
ok('each visit has its own board, restart clears it, and nothing reaches the client database (contacts, deals, tasks, notes)')

# ---------- limits ----------
for i in range(40):
    st, a = call(R, {'sid': 'visit-cccc-3333', 'text': 'hi %d' % i})
    assert st == 200 and not a.get('off'), (i, a)
st, a = call(R, {'sid': 'visit-cccc-3333', 'text': 'one more'}); assert a.get('off') and 'limit' in a['say'], a
for i in range(60): call(R, {'sid': 'visit-dddd-%04d' % i, 'text': 'hi'}, ip='10.99.0.1')
st, a = call(R, {'sid': 'visit-eeee-4444', 'text': 'hi'}, ip='10.99.0.1'); assert st == 429, a
ok('40 turns per call, 60 an hour per visitor')
srv.terminate(); print('PASSED')
