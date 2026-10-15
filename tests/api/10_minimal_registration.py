import subprocess, time, json, os, urllib.request, urllib.error, signal, sys, itertools, atexit
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
_ip=itertools.count(20)
def call(path,data=None,method=None,cookie=None,raw=False):
    req=urllib.request.Request(B+path,data=json.dumps(data).encode() if data is not None else None,
        method=method or ('POST' if data is not None else 'GET'))
    req.add_header('content-type','application/json'); req.add_header('x-real-ip','10.7.0.%d'%next(_ip))
    if cookie: req.add_header('cookie',cookie)
    try:
        r=urllib.request.urlopen(req,timeout=30); b=r.read()
        return r.status,(b if raw else json.loads(b or b'{}')),r.headers
    except urllib.error.HTTPError as e:
        b=e.read()
        try: return e.code,json.loads(b or b'{}'),e.headers
        except Exception: return e.code,b[:300],e.headers
for _ in range(60):
    try:
        if call('/api/health')[0]==200: break
    except Exception: pass
    time.sleep(0.4)
else:
    print('NO START'); print(srv.stdout.read()[:2500]); sys.exit(1)
ok=lambda m: print('  ok',m)
# accounts on a given password must choose their own before the back office opens (tested in smoke9);
# the other suites start from staff who have already done so
import subprocess as _sp
_orig_call=call
def call(path,*a,**k):
    if path=='/api/login': _sp.run(['psql',DB,'-qc','update users set must_change=false'],check=True)
    return _orig_call(path,*a,**k)
st,d,h=call('/api/login',{'email':'admin','password':'ownerpass123'}); ck=h['set-cookie'].split(';')[0]
st,d,_=call('/api/items',{'code':'F1','kind':'event','title':'SMEs at the Centre','starts_at':'2026-10-24T14:00:00Z',
  'price':0,'currency':'GHS','capacity':40,'published':True,'approval':False,'phase':'open'},cookie=ck)
assert st==200,(st,d)


ok_=ok
st,d,_=call('/api/items',{'code':'F9','kind':'event','title':'Invite-only forum','starts_at':'2026-10-24T14:00:00Z','price':0,'currency':'USD',
  'capacity':40,'published':True,'approval':True,'phase':'open','audiences':'SME / business owner,Investor,Other'},cookie=ck)
assert st==200,(st,d)
st,it,_=call('/api/items'); f9=[i for i in it['items'] if i['code']=='F9'][0]; assert f9['currency']=='GHS'; ok('prices are always stored in cedis, even if another currency is sent')
st,d,_=call('/api/register',{'item_code':'F9','full_name':'Ama Owusu','phone':'024 412 3456','email':'ama@owusu.example','consent':True}); assert st==200 and d['status']=='pending',(st,d); ok('name, WhatsApp, email and consent record the registration and enable email confirmation')
st,d,_=call('/api/register',{'item_code':'F9','full_name':'','phone':'','consent':True}); assert st==400 and d['fields']==['full_name','phone','email'],d; ok('missing name, phone and email reported field by field')
st,d,_=call('/api/register',{'item_code':'F9','full_name':'Kofi','phone':'0244','email':'kofi@example.test','consent':True}); assert st==400 and d['fields']==['phone'],d; ok('too-short phone number refused')
st,d,_=call('/api/register',{'item_code':'F9','full_name':'Kofi','phone':'0244123457','email':'not-an-email','consent':True}); assert d['fields']==['email']; ok('a badly typed or missing email is refused')
st,d,_=call('/api/register',{'item_code':'F9','full_name':'Kofi','phone':'0244123457','email':'kofi@example.test','consent':False}); assert d['error']=='consent_required'; ok('consent still required')
old={'item_code':'F9','seats':1,'company':'Old Form Ltd','reg_no':'','full_name':'Old Form','job_title':'','email':'old@x.example','phone':'0244123458','country':'Ghana','sector':'Agriculture','category':'Investor','utm_source':None,'utm_campaign':None,'guests':[],'payment_method':'free','consent':True}
st,d,_=call('/api/register',old); assert st==200,d; ok('the old Netlify form payload is accepted')
st,d,_=call('/api/register',{**old,'phone':'0244123459','category':'Nonsense'}); assert st==200,d; ok('an unknown "attending as" no longer blocks the registration')
st,regs,_=call('/api/registrations',cookie=ck)
a=[r for r in regs['rows'] if r['full_name']=='Ama Owusu'][0]; assert a['company']=='Not given' and a['email']=='ama@owusu.example' and a['phone']=='+233244123456'; ok('stored in CRM with email and normalised WhatsApp number')
st,ob,_=call('/api/outbox',cookie=ck); assert not [m for m in ob['rows'] if not m['to_email']]; ok('no email is queued without a valid recipient')
st,d,_=call('/api/stats',cookie=ck); assert all(x['total']>0 for x in d['paid']); ok('free seats are not counted as money received')
srv.send_signal(signal.SIGTERM); time.sleep(0.5)
print('\nALL MINIMAL REGISTRATION TESTS PASSED')
