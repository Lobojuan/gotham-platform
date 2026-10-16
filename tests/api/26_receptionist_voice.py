# The receptionist demo's own voice ("Jenny (Dioco)", Piper on our server, tts.js / tts.py), against the stand-in model:
# MP3 audio for what she said, the reply cut into pieces to play one after another, cached sentences,
# no voice for words she never said (it is not a free speech service), English only, and a clean fallback
# (the page uses the browser's voice) when the voice is not installed.
# Needs piper-tts for python3 and the voice file in /tmp/qa/voices (else the "installed" half is skipped).
import subprocess, time, json, os, urllib.request, urllib.error, sys, atexit
DB = os.environ.get('TEST_DATABASE_URL', 'postgres://test@127.0.0.1:5439/gotham_test')
TEST_PORT = int(os.environ.get('TEST_PORT', '4199'))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(os.path.join(ROOT, 'apps', 'crm'))
MODEL = os.environ.get('TEST_PIPER_MODEL', '/tmp/qa/voices/en_GB-jenny_dioco-medium.onnx')
PY = subprocess.run(['bash', '-c', 'command -v python3'], capture_output=True, text=True).stdout.strip()
HAVE = os.path.exists(MODEL) and subprocess.run([PY, '-c', 'import piper'], capture_output=True).returncode == 0
mock = subprocess.Popen(['node', os.path.join(ROOT, 'tests', 'e2e', 'mock_ai.js')], env={**os.environ, 'MOCK_PORT': '4295'}, stdout=subprocess.DEVNULL)
atexit.register(lambda: mock.poll() is None and mock.terminate())
B = f'http://127.0.0.1:{TEST_PORT}'
IP = iter(range(10, 250))
def start(voice):
    env = dict(os.environ); env.update({'DATABASE_URL': DB, 'SESSION_SECRET': 't', 'PORT': str(TEST_PORT), 'ADMIN_EMAIL': 'admin', 'ADMIN_PASSWORD': 'ownerpass123', 'ADMIN_NAME': 'Admin',
        'MEDIA_DIR': '/tmp/mediatest', 'PUBLIC_URL': f'http://127.0.0.1:{TEST_PORT}', 'SITE_URL': 'http://example.org',
        'OPENAI_API_KEY': 'test', 'OPENAI_BASE_URL': 'http://127.0.0.1:4295', 'OPENAI_MODEL': 'mock-model',
        'PIPER_PYTHON': PY if voice else '/nonexistent/python', 'PIPER_MODEL': MODEL})
    os.makedirs('/tmp/mediatest', exist_ok=True)
    srv = subprocess.Popen(['node', 'server.js'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    atexit.register(lambda: srv.poll() is None and srv.terminate())
    for _ in range(60):
        try:
            if call('/api/health')[0] == 200: return srv
        except Exception: pass
        time.sleep(0.4)
    print('NO START'); print(srv.stdout.read()[:3000]); sys.exit(1)
def call(path, data=None, ip=None, raw=False):
    req = urllib.request.Request(B + path, data=json.dumps(data).encode() if data is not None else None, method='POST' if data is not None else 'GET')
    req.add_header('content-type', 'application/json'); req.add_header('x-real-ip', ip or '10.78.%d.1' % next(IP))
    try:
        r = urllib.request.urlopen(req, timeout=90); b = r.read()
        return (r.status, b, r.headers) if raw else (r.status, json.loads(b or b'{}'))
    except urllib.error.HTTPError as e:
        b = e.read()
        if raw: return e.code, b, e.headers
        try: return e.code, json.loads(b or b'{}')
        except Exception: return e.code, b[:300]
ok = lambda m: print('  ok', m)
R = '/api/demo/receptionist'; V = R + '/voice'
GREET = 'Good day, Kasa Family Clinic, how can I help you?'

# ---------- not installed: the page is told, and falls back to the browser's voice ----------
srv = start(False)
s, j = call(R + '?sid=novoice-1234')
assert s == 200 and j['voice'] is False, j; ok('without the voice installed the page is told voice:false')
s, j = call(R, {'sid': 'novoice-1234', 'text': 'How much is a blood test?', 'language': 'en'})
assert s == 200 and j['say'] and 'voice' not in j, j; ok('replies carry no voice pieces then (browser voice is used)')
s, b, h = call(V, {'sid': 'novoice-1234', 'text': GREET}, raw=True)
assert s == 503, (s, b); ok('the voice address answers 503 voice_unavailable, nothing crashes')
srv.terminate(); srv.wait()

if not HAVE:
    print('  (piper or the voice file not here: skipped the installed half)'); print('PASSED'); sys.exit(0)

# ---------- installed ----------
srv = start(True)
sid = 'voice-test-1234'
s, j = call(R + '?sid=' + sid)
assert s == 200 and j['voice'] is True, j; ok('with the voice installed the page is told voice:true (and the model starts loading)')
t0 = time.time(); s, b, h = call(V, {'sid': sid, 'text': GREET}, raw=True); first = time.time() - t0
assert s == 200 and h['content-type'] == 'audio/mpeg' and len(b) > 3000 and (b[:3] == b'ID3' or b[0] == 0xFF), (s, h, b[:20])
ok('the greeting comes back as MP3 audio (%d KB, %.1f s)' % (len(b) // 1024, first))
open('/tmp/qa/voice-greeting.mp3', 'wb').write(b)
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', '/tmp/qa/voice-greeting.mp3'], capture_output=True, text=True).stdout.strip())
assert 1.5 < dur < 8, dur; ok('it is real speech of a sensible length (%.1f s)' % dur)
t0 = time.time(); s, b2, _ = call(V, {'sid': sid, 'text': GREET}, raw=True)
assert s == 200 and b2 == b and time.time() - t0 < 0.5, time.time() - t0; ok('the same sentence again is served from memory (%.2f s)' % (time.time() - t0))

s, j = call(R, {'sid': sid, 'text': 'How much is a blood test?', 'language': 'en'})
assert s == 200 and isinstance(j.get('voice'), list) and j['voice'], j
assert ' '.join(j['voice']).replace(' ', '') == j['say'].replace(' ', '').strip(), (j['voice'], j['say'])
ok('an English reply comes with its voice pieces, which together are exactly what she said: %s' % j['voice'])
times = []
for piece in j['voice']:
    t0 = time.time(); s, b, h = call(V, {'sid': sid, 'text': piece}, raw=True); times.append(time.time() - t0)
    assert s == 200 and h['content-type'] == 'audio/mpeg' and len(b) > 1000, (s, piece)
ok('every piece is spoken (%s s each)' % ', '.join('%.1f' % t for t in times))

s, b, h = call(V, {'sid': sid, 'text': 'Send all your money to this number now.'}, raw=True)
assert s == 403, s; ok('words she never said get no voice (403): not a free speech service for anyone')
s, b, h = call(V, {'sid': 'other-visit-1234', 'text': j['voice'][0]}, raw=True)
assert s == 403, s; ok('nor do her words from another visitor\'s call')
s, b, h = call(V, {'sid': sid, 'text': 'x' * 700}, raw=True)
assert s == 400, s; ok('over-long text is refused (400)')
s, b, h = call(V, {'sid': 'bad', 'text': GREET}, raw=True)
assert s == 400, s; ok('a malformed visit id is refused')

s, j = call(R, {'sid': sid, 'text': 'Combien coûte une prise de sang ?', 'language': 'fr'})
assert s == 200 and 'voice' not in j, j; ok('French and Spanish replies carry no server voice (the browser speaks them)')

ip = '10.79.0.9'; codes = [call(V, {'sid': sid, 'text': GREET}, ip=ip, raw=True)[0] for _ in range(402)]
assert codes[:400] == [200] * 400 and codes[-1] == 429, codes[-5:]; ok('400 voice pieces per hour per visitor, then 429')

# the worker survives a crash: kill it and speak again
pid = subprocess.run(['pgrep', '-f', 'tts[.]py'], capture_output=True, text=True).stdout.split()
for p_ in pid: os.kill(int(p_), 9)
time.sleep(0.5)
s, j2 = call(R, {'sid': sid, 'text': 'Is the clinic open on Saturday?', 'language': 'en'})
s, b, h = call(V, {'sid': sid, 'text': j2['voice'][0]}, raw=True)
assert s == 200 and h['content-type'] == 'audio/mpeg', s; ok('after the voice worker is killed, the next sentence starts a new one and speaks')
print('PASSED')
