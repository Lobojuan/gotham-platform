# The receptionist demo's own ears (Whisper on our server, stt.js / stt.py), for browsers whose speech service does not work:
# a short recording of the caller becomes text, nothing is kept, only for a demo visit, rate limited, and a clean answer
# (the page types instead) when the model is not installed.
# Needs faster-whisper for python3 and a model folder in /tmp/qa/whisper/tiny (else the "installed" half is skipped),
# plus spoken test sentences made with Piper in /tmp/qa/stt/u1.wav (made by this test if the Piper voice is there).
import subprocess, time, json, os, urllib.request, urllib.error, sys, atexit, base64
DB = os.environ.get('TEST_DATABASE_URL', 'postgres://test@127.0.0.1:5439/gotham_test')
TEST_PORT = int(os.environ.get('TEST_PORT', '4199'))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(os.path.join(ROOT, 'apps', 'crm'))
MODEL = os.environ.get('TEST_WHISPER_MODEL', '/tmp/qa/whisper/tiny')            # the multilingual model (French, Spanish)
MODEL_EN = os.environ.get('TEST_WHISPER_MODEL_EN', '/tmp/qa/whisper/tiny.en')    # the English one
PY = os.environ.get('TEST_WHISPER_PYTHON', '/tmp/qa/wh/bin/python')
HAVE = os.path.exists(os.path.join(MODEL, 'model.bin')) and os.path.exists(os.path.join(MODEL_EN, 'model.bin')) and os.path.exists(PY) and subprocess.run([PY, '-c', 'import faster_whisper'], capture_output=True).returncode == 0
mock = subprocess.Popen(['node', os.path.join(ROOT, 'tests', 'e2e', 'mock_ai.js')], env={**os.environ, 'MOCK_PORT': '4295'}, stdout=subprocess.DEVNULL)
atexit.register(lambda: mock.poll() is None and mock.terminate())
B = f'http://127.0.0.1:{TEST_PORT}'
IP = iter(range(10, 250))
def start(ears):
    env = dict(os.environ); env.update({'DATABASE_URL': DB, 'SESSION_SECRET': 't', 'PORT': str(TEST_PORT), 'ADMIN_EMAIL': 'admin', 'ADMIN_PASSWORD': 'ownerpass123', 'ADMIN_NAME': 'Admin',
        'MEDIA_DIR': '/tmp/mediatest', 'PUBLIC_URL': f'http://127.0.0.1:{TEST_PORT}', 'SITE_URL': 'http://example.org',
        'OPENAI_API_KEY': 'test', 'OPENAI_BASE_URL': 'http://127.0.0.1:4295', 'OPENAI_MODEL': 'mock-model',
        'WHISPER_PYTHON': PY if ears else '/nonexistent/python', 'WHISPER_MODEL': MODEL, 'WHISPER_MODEL_EN': MODEL_EN, 'PIPER_PYTHON': '/nonexistent/python'})
    os.makedirs('/tmp/mediatest', exist_ok=True)
    srv = subprocess.Popen(['node', 'server.js'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    atexit.register(lambda: srv.poll() is None and srv.terminate())
    for _ in range(60):
        try:
            if call('/api/health')[0] == 200: return srv
        except Exception: pass
        time.sleep(0.4)
    print('NO START'); print(srv.stdout.read()[:3000]); sys.exit(1)
def call(path, data=None, ip=None):
    req = urllib.request.Request(B + path, data=json.dumps(data).encode() if data is not None else None, method='POST' if data is not None else 'GET')
    req.add_header('content-type', 'application/json'); req.add_header('x-real-ip', ip or '10.80.%d.1' % next(IP))
    try:
        r = urllib.request.urlopen(req, timeout=120); return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b or b'{}')
        except Exception: return e.code, b[:300]
ok = lambda m: print('  ok', m)
R = '/api/demo/receptionist'; L = R + '/listen'
b64 = lambda b: base64.b64encode(b).decode()
def clip(path, fmt):
    """a spoken sentence as the browsers send it: webm/opus (Chrome, Firefox), mp4/aac (Safari), wav"""
    out = '/tmp/qa/stt/clip.' + fmt
    args = {'webm': ['-c:a', 'libopus', '-b:a', '24k'], 'm4a': ['-c:a', 'aac', '-b:a', '32k'], 'wav': []}[fmt]
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-ac', '1', '-ar', '48000' if fmt != 'wav' else '16000'] + args + [out], check=True)
    return open(out, 'rb').read()
os.makedirs('/tmp/qa/stt', exist_ok=True)
if not os.path.exists('/tmp/qa/stt/u1.wav'):
    subprocess.run('echo "Hello, I would like to book an appointment for my daughter tomorrow morning." | piper -m /tmp/qa/voices/en_GB-jenny_dioco-medium.onnx -f /tmp/qa/stt/u1.wav', shell=True, capture_output=True)

# ---------- not installed: the page is told, and falls back to typing ----------
srv = start(False)
s, j = call(R + '?sid=noears-1234')
assert s == 200 and j['listen'] is False, j; ok('without the model installed the page is told listen:false')
s, j = call(L, {'sid': 'noears-1234', 'lang': 'en', 'audio': b64(b'RIFFxxxxWAVE' * 20)})
assert s == 503 and j['error'] == 'listen_unavailable', (s, j); ok('the listen address answers 503, nothing crashes')
srv.terminate(); srv.wait()

if not HAVE or not os.path.exists('/tmp/qa/stt/u1.wav'):
    print('  (faster-whisper, the model or the test speech is not here: skipped the installed half)'); print('PASSED'); sys.exit(0)

# ---------- installed ----------
srv = start(True)
sid = 'ears-test-1234'
s, j = call(R + '?sid=' + sid)
assert s == 200 and j['listen'] is True, j; ok('with the model installed the page is told listen:true (and the model starts loading)')
for fmt in ('webm', 'wav', 'm4a'):
    t0 = time.time(); s, j = call(L, {'sid': sid, 'lang': 'en', 'audio': b64(clip('/tmp/qa/stt/u1.wav', fmt))}); took = time.time() - t0
    assert s == 200 and 'appointment' in j['text'].lower() and 'daughter' in j['text'].lower(), (fmt, s, j)
    ok('a %s recording is understood in %.1f s: "%s"' % (fmt, took, j['text']))

s, j = call(L, {'sid': sid, 'lang': 'fr', 'audio': b64(clip('/tmp/qa/stt/u1.wav', 'webm'))})
assert s == 200 and 'text' in j, (s, j); ok('a French request goes to the multilingual model (loaded on first use) and answers: "%s"' % j['text'][:60])
s, j = call(L, {'sid': sid, 'lang': 'en', 'audio': b64(clip('/tmp/qa/stt/u1.wav', 'webm'))})
assert s == 200 and 'appointment' in j['text'].lower(), (s, j); ok('and English still uses the English model')
silent = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '3', '-f', 'wav', '-'], capture_output=True).stdout
s, j = call(L, {'sid': sid, 'lang': 'en', 'audio': b64(silent)})
assert s == 200 and j['text'] == '', j; ok('three seconds of silence give no text (no invented words)')
s, j = call(L, {'sid': sid, 'lang': 'en', 'audio': b64(b'this is not audio at all' * 50)})
assert s == 422, (s, j); ok('something that is not audio is refused (422), the worker keeps running')
s, j = call(L, {'sid': sid, 'lang': 'en', 'audio': b64(clip('/tmp/qa/stt/u1.wav', 'webm'))})
assert s == 200 and j['text'], j; ok('and the next real recording still works')
s, j = call(L, {'sid': 'bad', 'lang': 'en', 'audio': 'AAAA'}); assert s == 400, s; ok('a malformed visit id is refused (400)')
s, j = call(L, {'sid': sid, 'lang': 'en'}); assert s == 400, s; ok('no audio is refused (400)')
s, j = call(L, {'sid': sid, 'lang': 'en', 'audio': 'not base64 !!'}); assert s == 400, s; ok('audio that is not base64 is refused (400)')
s, j = call(L, {'sid': sid, 'lang': 'en', 'audio': 'A' * 1700000}); assert s in (400, 413), s; ok('an over-long recording is refused')

ip = '10.81.0.9'; codes = [call(L, {'sid': sid, 'lang': 'en', 'audio': b64(b'x' * 300)}, ip=ip)[0] for _ in range(302)]
assert codes[-1] == 429 and 429 not in codes[:300], codes[-5:]; ok('300 recordings per hour per visitor, then 429')

pid = subprocess.run(['pgrep', '-f', 'stt[.]py'], capture_output=True, text=True).stdout.split()
for p_ in pid: os.kill(int(p_), 9)
time.sleep(0.5)
s, j = call(L, {'sid': sid, 'lang': 'en', 'audio': b64(clip('/tmp/qa/stt/u1.wav', 'webm'))})
assert s == 200 and 'appointment' in j['text'].lower(), (s, j); ok('after the listening worker is killed, the next recording starts a new one and is understood')
print('PASSED')
