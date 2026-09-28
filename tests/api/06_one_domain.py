import subprocess, time, json, os, urllib.request, urllib.error, signal, sys, atexit
import os
DB=os.environ.get('TEST_DATABASE_URL','postgres://test@127.0.0.1:5439/gotham_test')
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
os.chdir(ROOT+'/apps/crm')
env=dict(os.environ); env.update({
 'DATABASE_URL':DB,'SESSION_SECRET':'t','ALLOW_ORIGINS':'*','PORT':'4199',
 'ADMIN_EMAIL':'admin','ADMIN_PASSWORD':'ownerpass123','ADMIN_NAME':'Admin',
 'MEDIA_DIR':'/tmp/mediatest','PUBLIC_URL':'http://127.0.0.1:4199','SITE_URL':'http://127.0.0.1:4199',
 'SITE_DIR':ROOT+'/apps/site/dist'})
os.makedirs('/tmp/mediatest',exist_ok=True)
srv=subprocess.Popen(['node','server.js'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
def _cleanup_server():
    if srv.poll() is None:
        srv.terminate()
        try: srv.wait(timeout=3)
        except subprocess.TimeoutExpired: srv.kill()
atexit.register(_cleanup_server)
B='http://127.0.0.1:4199'
def get(path,cookie=None,raw=True):
    req=urllib.request.Request(B+path)
    if cookie: req.add_header('cookie',cookie)
    try:
        r=urllib.request.urlopen(req,timeout=30); return r.status,r.read(),r.headers
    except urllib.error.HTTPError as e:
        return e.code,e.read(),e.headers
def post(path,data,cookie=None):
    req=urllib.request.Request(B+path,data=json.dumps(data).encode(),method='POST')
    req.add_header('content-type','application/json')
    if cookie: req.add_header('cookie',cookie)
    try:
        r=urllib.request.urlopen(req,timeout=30); return r.status,json.loads(r.read() or b'{}'),r.headers
    except urllib.error.HTTPError as e:
        b=e.read()
        try: return e.code,json.loads(b or b'{}'),e.headers
        except Exception: return e.code,b[:200],e.headers
for _ in range(60):
    try:
        if get('/api/health')[0]==200: break
    except Exception: pass
    time.sleep(0.4)
else:
    print('NO START'); print(srv.stdout.read()[:2500]); sys.exit(1)
ok=lambda m: print('  ok',m)

st,b,h=get('/')
assert st==200 and b'Gotham Consult' in b and b'<!doctype html>' in b.lower(), (st,b[:120])
assert 'text/html' in h['content-type']
ok('/ serves the website')

st,b,h=get('/admin')
assert st==200 and b'Gotham CRM' in b, (st,b[:120])
assert h.get('x-frame-options')=='SAMEORIGIN'
ok('/admin serves the back office')

for path,needle in [('/register.html',b'Register'),('/teaser.html',b''),('/privacy.html',b'Privacy'),
                    ('/terms.html',b'Terms'),('/robots.txt',b'Sitemap'),('/sitemap.xml',b'urlset')]:
    st,b,_=get(path); assert st==200 and needle in b,(path,st)
ok('every page and robots/sitemap served')

st,b,h=get('/img/boot2.webp')
assert st==200 and h['content-type']=='image/webp' and len(b)>1000
assert 'max-age=604800' in h['cache-control']
ok('images served with the right type and a long cache')

st,b,h=get('/index.html')
assert 'max-age=60' in h['cache-control']
ok('html cached only briefly, so edits appear quickly')

# conditional request
st,b,h=get('/img/boot2.webp'); etag=h['etag']
req=urllib.request.Request(B+'/img/boot2.webp'); req.add_header('if-none-match',etag)
try: r=urllib.request.urlopen(req,timeout=20); code=r.status
except urllib.error.HTTPError as e: code=e.code
assert code==304, code
ok('unchanged files return 304')

# path traversal must fail
for bad in ['/../server.js','/..%2fserver.js','/img/../../server.js','/%2e%2e/%2e%2e/etc/passwd']:
    st,b,_=get(bad)
    assert st in (400,404) or b'server.js' not in b, (bad, st, b[:80])
ok('path traversal refused')

st,b,_=get('/does-not-exist')
assert st==404; ok('unknown page returns 404')

# the API still works on the same origin
# accounts on a given password must choose their own before the back office opens (tested in smoke9);
# the other suites start from staff who have already done so
import subprocess as _sp
_orig_post=post
def post(path,*a,**k):
    if path=='/api/login': _sp.run(['psql',DB,'-qc','update users set must_change=false'],check=True)
    return _orig_post(path,*a,**k)
st,d,h=post('/api/login',{'email':'admin','password':'ownerpass123'})
assert st==200; ck=h['set-cookie'].split(';')[0]
assert 'Path=/' in h['set-cookie']
ok('sign-in works on the same origin, first-party cookie')

st,b,_=get('/api/items')
assert st==200 and b'items' in b; ok('/api/items reachable at the same host')

st,b,_=get('/api/sponsors'); assert st==200; ok('/api/sponsors reachable')

# site pages must call the API with no absolute host
site=open(ROOT+'/apps/site/dist/index.html',encoding='utf-8').read()
assert 'netlify' not in site and 'sslip.io' not in site.replace('gotham.84-12-73-59.sslip.io/img','').replace('https://gotham.84-12-73-59.sslip.io','META')
assert "const CRM_API = ''" in site
ok('site calls the API relatively, no cross-origin requests left')
assert 'href="/admin"' in site and 'target="_blank"' not in site.split('navlog')[1][:200]
assert 'gc-backoffice' in site and 'Back office' in site
ok('Login opens the back office in an in-page, same-origin dialog')

srv.send_signal(signal.SIGTERM); time.sleep(0.5)
print('\nALL ONE-DOMAIN TESTS PASSED')
