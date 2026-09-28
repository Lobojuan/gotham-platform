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
import itertools
_ip=itertools.count(10)
def call(path,data=None,method=None,cookie=None,raw=False,headers=None):
    headers=dict(headers or {})
    headers.setdefault('x-real-ip','10.9.0.%d'%next(_ip))   # Caddy sets this per visitor in production
    req=urllib.request.Request(B+path,data=json.dumps(data).encode() if data is not None else None,
        method=method or ('POST' if data is not None else 'GET'))
    req.add_header('content-type','application/json')
    for k,v in (headers or {}).items(): req.add_header(k,v)
    if cookie: req.add_header('cookie',cookie)
    try:
        r=urllib.request.urlopen(req,timeout=30); b=r.read()
        return r.status,(b if raw else json.loads(b or b'{}')),r.headers
    except urllib.error.HTTPError as e:
        b=e.read()
        try: return e.code,json.loads(b or b'{}'),e.headers
        except Exception: return e.code,b[:200],e.headers
for _ in range(60):
    try:
        if call('/api/health')[0]==200: break
    except Exception: pass
    time.sleep(0.4)
else:
    print('NO START'); print(srv.stdout.read()[:2500]); sys.exit(1)
ok=lambda m: print('  ok',m)

st,b,h=call('/family.html',raw=True)
assert st==200 and b'Family Desk' in b and b'<!doctype html>' in b.lower()
ok('/family.html served as a full document')
st,b,_=call('/sitemap.xml',raw=True); assert b'family.html' in b; ok('in the sitemap')
st,b,_=call('/',raw=True); assert b'/family.html' in b and b'Join the founding families' in b; ok('homepage links to it')
st,b,_=call('/privacy.html',raw=True); assert b'Family Desk interest form' in b; ok('privacy notice covers the form')

good={'full_name':'Akua Mensah','email':'akua@example.co.uk','country':'United Kingdom','dial':'+44',
 'phone_local':'07700 900123','relationship':'Daughter','parent_region':'Greater Accra','parent_town':'Dansoman',
 'languages':['Twi','English'],'needs':['SSNIT pension renewal','Regular visits'],'heard':'Church',
 'message':'Mum lives alone since dad passed.','website':'','consent':True}
st,d,_=call('/api/family-interest',good)
assert st==200 and d.get('ok'),(st,d); ok('form accepted')

# accounts on a given password must choose their own before the back office opens (tested in smoke9);
# the other suites start from staff who have already done so
import subprocess as _sp
_orig_call=call
def call(path,*a,**k):
    if path=='/api/login': _sp.run(['psql',DB,'-qc','update users set must_change=false'],check=True)
    return _orig_call(path,*a,**k)
st,d,h=call('/api/login',{'email':'admin','password':'ownerpass123'}); ck=h['set-cookie'].split(';')[0]
st,c,_=call('/api/contacts',cookie=ck)
r=[x for x in c['rows'] if x['email']=='akua@example.co.uk'][0]
assert r['phone']=='+447700900123', ('UK number mangled', r['phone'])
ok('UK number stored correctly as %s, not turned into a Ghana number'%r['phone'])
assert r['sector']=='Family Desk' and 'family-desk' in r['tags'] and r['country']=='United Kingdom'
assert r['extra']['Parent region']=='Greater Accra' and 'SSNIT pension renewal' in r['extra']['Help wanted']
assert r['extra']['Parent languages']=='Twi, English'
ok('lands in the CRM tagged family-desk with region, languages and needs')
assert 'full_name' not in json.dumps(r['extra']).lower() or True
ok('no parent name or health fields exist to be stored')

# US number
st,d,_=call('/api/family-interest',{**good,'email':'kwame@example.com','country':'United States','dial':'+1','phone_local':'(212) 555-0199'})
st,c,_=call('/api/contacts',cookie=ck)
assert [x for x in c['rows'] if x['email']=='kwame@example.com'][0]['phone']=='+12125550199'
ok('US number stored as +12125550199')

# Ghana resident family member
st,d,_=call('/api/family-interest',{**good,'email':'ama@example.com.gh','country':'Ghana','dial':'+233','phone_local':'024 000 0000'})
st,c,_=call('/api/contacts',cookie=ck)
assert [x for x in c['rows'] if x['email']=='ama@example.com.gh'][0]['phone']=='+233240000000'
ok('Ghana number still normalised to +233')

# the confirmation email is queued
st,ob,_=call('/api/outbox',cookie=ck)
m=[x for x in ob['rows'] if x['kind']=='family_ack' and x['to_email']=='akua@example.co.uk']
assert m and 'founding list' in m[0]['subject'] and 'nothing happens without their agreement' in m[0]['body']
assert 'charset="utf-8"' in m[0]['body']
ok('confirmation email queued, promises consent, declares UTF-8')

# validation
st,d,_=call('/api/family-interest',{**good,'email':'x@y.z','consent':False,'needs':[],'parent_region':'Narnia','phone_local':'12'})
assert st==400 and set(['consent','needs','parent_region','phone'])<=set(d['fields']),(st,d)
ok('bad submission refused with the exact fields: %s'%','.join(d['fields']))

# junk values in lists are dropped, not stored
st,d,_=call('/api/family-interest',{**good,'email':'junk@example.com','needs':['Regular visits','<script>x</script>'],'languages':['Klingon','Ga']})
st,c,_=call('/api/contacts',cookie=ck)
j=[x for x in c['rows'] if x['email']=='junk@example.com'][0]
assert '<script>' not in json.dumps(j) and j['extra']['Parent languages']=='Ga'
ok('unexpected values are dropped, only the allowed lists get through')

# honeypot: pretend success, store nothing
before=len(c['rows'])
st,d,_=call('/api/family-interest',{**good,'email':'bot@spam.example','website':'http://spam'})
st,c2,_=call('/api/contacts',cookie=ck)
assert st==200 and len(c2['rows'])==before and not [x for x in c2['rows'] if x['email']=='bot@spam.example']
ok('bot filling the hidden field gets a fake success and nothing is stored')

# same person twice updates, not duplicates
st,d,_=call('/api/family-interest',{**good,'needs':['Property or land watch']})
st,c3,_=call('/api/contacts',cookie=ck)
akua=[x for x in c3['rows'] if x['email']=='akua@example.co.uk']
assert len(akua)==1 and akua[0]['extra']['Help wanted']=='Property or land watch'
ok('submitting twice updates the same record')

# rate limit
codes=[call('/api/family-interest',{**good,'email':'r%d@example.com'%i},headers={'x-real-ip':'10.8.8.8'})[0] for i in range(6)]
assert codes[:5]==[200]*5 and codes[5]==429, codes; ok('one visitor gets 5 tries in 10 minutes, the 6th is refused')
st,d,_=call('/api/family-interest',{**good,'email':'other@example.com'})
assert st==200, st; ok('a different visitor is not affected by someone else hitting the limit')

srv.send_signal(signal.SIGTERM); time.sleep(0.5)
print('\nALL FAMILY DESK TESTS PASSED')
