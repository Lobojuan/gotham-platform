import subprocess, time, json, os, urllib.request, urllib.error, signal, sys, itertools
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

base={'item_code':'F1','seats':1,'company':'Adwoa Farms','full_name':'Adwoa Boateng','email':'adwoa@farms.example',
 'phone':'0244123456','country':'Ghana','sector':'Agriculture','consent':True,'payment_method':'free'}

# new form, says yes
st,d,_=call('/api/register',{**base,'company_about':'Poultry farm supplying eggs in Accra','company_size':'6–20',
  'challenge':'Getting a bank loan for a second pen','heard_via':'WhatsApp','follow_up':'yes'})
assert st==200,(st,d); ok('registration with the new questions accepted')

st,regs,_=call('/api/registrations',cookie=ck)
r=[x for x in regs['rows'] if x['email']=='adwoa@farms.example'][0]
assert r['company_size']=='6–20' and r['follow_up']=='yes' and 'bank loan' in r['challenge'] and r['heard_via']=='WhatsApp'
ok('answers stored on the registration')

st,c,_=call('/api/contacts',cookie=ck)
lead=[x for x in c['rows'] if x['email']=='adwoa@farms.example']
assert len(lead)==1 and 'forum-lead' in lead[0]['tags'] and 'forum-yes' in lead[0]['tags']
assert 'bank loan' in lead[0]['notes'] and lead[0]['priority']=='Forum: yes'
assert lead[0]['extra']['Company size']=='6–20'
ok('"Yes" put her on the follow-up list with her challenge attached')

# maybe
st,d,_=call('/api/register',{**base,'email':'kojo@shop.example','full_name':'Kojo Asare','company':'Kojo Hardware',
  'company_about':'Hardware shop','company_size':'2–5','follow_up':'maybe'})
st,c,_=call('/api/contacts',cookie=ck)
k=[x for x in c['rows'] if x['email']=='kojo@shop.example'][0]
assert 'forum-maybe' in k['tags'] and k['priority']=='Forum: maybe'; ok('"Maybe" goes on the list, marked maybe')

# no -> registered, but not a lead
st,d,_=call('/api/register',{**base,'email':'esi@no.example','full_name':'Esi','company':'Esi Ltd','company_about':'x','company_size':'Just me','follow_up':'no'})
assert st==200
st,c,_=call('/api/contacts',cookie=ck)
assert not [x for x in c['rows'] if x['email']=='esi@no.example']; ok('"No" is respected: registered, but not added to follow-up')

# old copy of the form out on WhatsApp: none of the new fields
st,d,_=call('/api/register',{**base,'email':'old@netlify.example','full_name':'Old Link','company':'Old Link Ltd'})
assert st==200,(st,d); ok('old form without the new questions still registers fine')

# junk values are dropped
st,d,_=call('/api/register',{**base,'email':'junk@x.example','full_name':'J','company':'J','company_size':'a million','heard_via':'<b>x</b>','follow_up':'definitely'})
st,regs,_=call('/api/registrations',cookie=ck)
j=[x for x in regs['rows'] if x['email']=='junk@x.example'][0]
assert j['company_size'] is None and j['heard_via'] is None and j['follow_up'] is None; ok('unexpected answers are dropped, not stored')
st,c,_=call('/api/contacts',cookie=ck)
assert not [x for x in c['rows'] if x['email']=='junk@x.example']; ok('an unrecognised follow-up answer creates no lead')

# someone who opted out is never re-tagged
st,cc,_=call('/api/contacts',{'company':'Quiet Co','full_name':'Quiet','email':'quiet@x.example','status':'do_not_contact'},cookie=ck)
st,d,_=call('/api/register',{**base,'email':'quiet@x.example','full_name':'Quiet','company':'Quiet Co','company_about':'x','company_size':'2–5','follow_up':'yes'})
st,c,_=call('/api/contacts',cookie=ck)
q=[x for x in c['rows'] if x['email']=='quiet@x.example'][0]
assert 'forum-lead' not in (q['tags'] or ''); ok('someone marked do-not-contact is not pulled back onto a list')

# export
st,csv,_=call('/api/export.csv',cookie=ck,raw=True)
head=csv.decode('utf-8-sig').split('\n')[0]
assert all(k in head for k in ['company_about','company_size','challenge','heard_via','follow_up']); ok('CSV export includes the new answers')

srv.send_signal(signal.SIGTERM); time.sleep(0.5)
print('\nALL REGISTRATION QUESTION TESTS PASSED')
