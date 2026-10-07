# gothamconsult.com reaches the server through the WordPress bridge (integrations/wordpress/gotham-bridge).
# Visitors who use the server's own address are moved to gothamconsult.com; bridge requests and framed pages are not.
import subprocess, time, os, urllib.request, urllib.error, sys
DB=os.environ.get('TEST_DATABASE_URL','postgres://test@127.0.0.1:5439/gotham_test')
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
os.chdir(ROOT+'/apps/crm')
env=dict(os.environ); env.update({
 'DATABASE_URL':DB,'SESSION_SECRET':'t','PORT':'4199','ADMIN_EMAIL':'admin','ADMIN_PASSWORD':'ownerpass123','ADMIN_NAME':'Admin',
 'MEDIA_DIR':'/tmp/mediatest','PUBLIC_URL':'https://gothamconsult.com','SITE_URL':'https://gothamconsult.com',
 'MEDIA_URL':'https://server.example','REDIRECT_HOSTS':'127.0.0.1','PROXY_KEY':'bridge-key-123','SITE_DIR':ROOT+'/apps/site/dist'})
os.makedirs('/tmp/mediatest',exist_ok=True)
srv=subprocess.Popen(['node','server.js'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*a,**k): return None
op=urllib.request.build_opener(NoRedirect)
def get(path,**hdr):
    req=urllib.request.Request('http://127.0.0.1:4199'+path,headers=hdr)
    try: r=op.open(req,timeout=20); return r.status,r.headers
    except urllib.error.HTTPError as e: return e.code,e.headers
for _ in range(60):
    try:
        if get('/api/health')[0]==200: break
    except Exception: pass
    time.sleep(0.4)
else: print('NO START'); print(srv.stdout.read()[:2000]); sys.exit(1)
ok=lambda m: print('  ok',m)
try:
    st,h=get('/register?e=F1')
    assert st==301 and h['location']=='https://gothamconsult.com/register?e=F1',(st,h.get('location'))
    ok('the server address moves visitors to gothamconsult.com, keeping the path')
    st,h=get('/admin'); assert st==301 and h['location']=='https://gothamconsult.com/admin'
    ok('back office on the server address moves too')
    st,_=get('/register',**{'X-GC-Proxy-Key':'bridge-key-123','X-GC-Client-IP':'1.2.3.4'}); assert st==200,st
    st,_=get('/',**{'X-GC-Proxy-Key':'bridge-key-123'}); assert st==200,st
    ok('requests from the WordPress bridge are served, not redirected (no loop)')
    st,_=get('/',**{'X-GC-Proxy-Key':'wrong'}); assert st==301,st
    ok('a wrong bridge key is treated as an ordinary visitor')
    st,_=get('/',**{'Sec-Fetch-Dest':'iframe'}); assert st==200,st
    ok('pages shown inside the WordPress fallback frames are not redirected')
    for p in ('/api/health','/media/nothing.jpg'):
        st,_=get(p); assert st!=301,(p,st)
    ok('API and media are never redirected (old forms keep working)')
    st,h=get('/assets/v2/v2.css'); assert st==200 and h.get('access-control-allow-origin')=='*',(st,dict(h))
    st,_=get('/img/forum.webp'); assert st==200,st
    ok('css, js and images are served straight from the server address (faster than the bridge), usable from gothamconsult.com')
    K={'X-GC-Proxy-Key':'bridge-key-123'}
    st,h=get('/invest',**K,**{'X-Forwarded-Host':'www.gothamconsult.com'}); assert st==301 and h['location']=='https://gothamconsult.com/invest',(st,h.get('location'))
    st,_=get('/api/health',**K,**{'X-Forwarded-Host':'www.gothamconsult.com'}); assert st==200,st
    ok('www.gothamconsult.com (through the bridge) moves to gothamconsult.com; the API is left alone')
    st,h=get('/fr/invest?source=seo',**K,**{'X-GC-Forwarded-Host':'www.gothamconsult.com','X-Forwarded-Host':'origin.example'})
    assert st==301 and h['location']=='https://gothamconsult.com/fr/invest?source=seo'
    st,_=get('/',**K,**{'X-GC-Forwarded-Host':'www.attacker.example'}); assert st==200
    st,_=get('/',**{'X-GC-Forwarded-Host':'www.gothamconsult.com','Sec-Fetch-Dest':'iframe'}); assert st==200
    ok('Caddy-preserved host keeps locale/query; unrelated and unsigned hosts cannot trigger it')
    for a,b in (('/about/','/about'),('/about.html','/about'),('/services/ai/','/services/ai'),('/index.html','/'),('/register.html?e=F1','/register?e=F1')):
        st,h=get(a,**K); assert st==301 and h['location']==b,(a,st,h.get('location'))
    st,h=get('/no-such-page',**K); assert st==404 and 'text/html' in h['content-type'],(st,dict(h))
    ok('one address per page for Google: trailing slash and .html move to the clean address; unknown pages get the site 404 page')
    print('PASSED')
finally:
    srv.terminate()
