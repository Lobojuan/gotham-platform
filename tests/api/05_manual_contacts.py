import subprocess, time, json, os, urllib.request, urllib.error, signal, sys, atexit
import os
DB=os.environ.get('TEST_DATABASE_URL','postgres://test@127.0.0.1:5439/gotham_test')
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
os.chdir(os.path.join(ROOT,'apps','crm'))
env=dict(os.environ); env.update({
 'DATABASE_URL':DB,'SESSION_SECRET':'t','ALLOW_ORIGINS':'*','PORT':'4199',
 'ADMIN_EMAIL':'admin','ADMIN_PASSWORD':'ownerpass123','ADMIN_NAME':'Admin',
 'MEDIA_DIR':'/tmp/mediatest','PUBLIC_URL':'http://127.0.0.1:4199','SITE_URL':'http://example.org'})
os.makedirs('/tmp/mediatest',exist_ok=True)
srv=subprocess.Popen(['node','server.js'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
def _cleanup_server():
    if srv.poll() is None:
        srv.terminate()
        try: srv.wait(timeout=3)
        except subprocess.TimeoutExpired: srv.kill()
atexit.register(_cleanup_server)
B='http://127.0.0.1:4199'
def call(path,data=None,method=None,cookie=None):
    req=urllib.request.Request(B+path,data=json.dumps(data).encode() if data is not None else None,
        method=method or ('POST' if data is not None else 'GET'))
    req.add_header('content-type','application/json')
    if cookie: req.add_header('cookie',cookie)
    try:
        r=urllib.request.urlopen(req,timeout=60); return r.status,json.loads(r.read() or b'{}'),r.headers
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
    print('NO START'); print(srv.stdout.read()[:3000]); sys.exit(1)
ok=lambda m: print('  ok',m)
# accounts on a given password must choose their own before the back office opens (tested in smoke9);
# the other suites start from staff who have already done so
import subprocess as _sp
_orig_call=call
def call(path,*a,**k):
    if path=='/api/login': _sp.run(['psql',DB,'-qc','update users set must_change=false'],check=True)
    return _orig_call(path,*a,**k)
st,d,h=call('/api/login',{'email':'admin','password':'ownerpass123'}); ck=h['set-cookie'].split(';')[0]
print('login OK')

# add one by hand
st,r,_=call('/api/contacts',{'company':'Kosmos Energy Ghana','full_name':'Ama Darko','role':'Country Manager',
 'email':'ama@kosmos.example','phone':'0244111222','sector':'Energy','city':'Accra','website':'kosmosenergy.com',
 'priority':'Tier 2','tags':'energy','notes':'Met at the Chamber breakfast.','source':'introduction'},cookie=ck)
assert st==200,(st,r); cid=r['id']; ok('company added by hand')
st,c,_=call('/api/contacts',cookie=ck)
row=[x for x in c['rows'] if x['id']==cid][0]
assert row['phone'].startswith('+233') and row['priority']=='Tier 2' and row['source']=='introduction'
ok('phone normalised, priority and source stored')

# minimum: just a company name
st,r2,_=call('/api/contacts',{'company':'Just A Name Ltd'},cookie=ck)
assert st==200,(st,r2); ok('company name alone is enough')

# neither company nor person
st,d,_=call('/api/contacts',{'sector':'Mining'},cookie=ck)
assert st==400 and d['error']=='name_required',(st,d); ok('refuses a contact with no name at all')

# bad email
st,d,_=call('/api/contacts',{'company':'X','email':'not-an-email'},cookie=ck)
assert st==400 and d['error']=='bad_email'; ok('bad email refused')

# duplicate warning, then override
st,d,_=call('/api/contacts',{'company':'Kosmos Energy Ghana','full_name':'Ama Darko','email':'ama@kosmos.example'},cookie=ck)
assert st==409 and d['error']=='already_there' and 'Kosmos' in d['who'],(st,d)
ok('duplicate is flagged rather than silently created')
st,d,_=call('/api/contacts',{'company':'Kosmos Energy Ghana','full_name':'Ama Darko','confirm_duplicate':True},cookie=ck)
assert st==200; ok('second entry allowed when confirmed')

# edit every field
st,d,_=call('/api/contacts/%d'%cid,{'role':'Managing Director','notes':'Promoted in September.',
 'sector':'Oil & gas','priority':'Tier 1','status':'meeting'},method='PATCH',cookie=ck)
assert st==200,(st,d)
st,c2,_=call('/api/contacts',cookie=ck)
row=[x for x in c2['rows'] if x['id']==cid][0]
assert row['role']=='Managing Director' and row['sector']=='Oil & gas' and row['status']=='meeting'
assert row['company']=='Kosmos Energy Ghana', ('untouched field was wiped', row['company'])
assert row['email']=='ama@kosmos.example', ('email wiped by a partial edit', row['email'])
ok('editing some fields leaves the others alone')

# email collision on edit
st,r3,_=call('/api/contacts',{'company':'Other Co','email':'other@x.example'},cookie=ck)
st,d,_=call('/api/contacts/%d'%r3['id'],{'email':'ama@kosmos.example'},method='PATCH',cookie=ck)
assert st==409 and d['error']=='email_taken',(st,d); ok('cannot give two contacts the same email')

# clearing an email on purpose
st,d,_=call('/api/contacts/%d'%r3['id'],{'email':''},method='PATCH',cookie=ck)
st,c3,_=call('/api/contacts',cookie=ck)
assert [x for x in c3['rows'] if x['id']==r3['id']][0]['email'] is None
ok('an email can be cleared deliberately')

# do-not-contact from the form suppresses them
st,d,_=call('/api/contacts/%d'%cid,{'status':'do_not_contact'},method='PATCH',cookie=ck)
st,c4,_=call('/api/contacts',cookie=ck)
assert [x for x in c4['rows'] if x['id']==cid][0]['unsubscribed_at']
ok('setting do-not-contact by hand also suppresses them from campaigns')

# delete
st,d,_=call('/api/contacts/%d'%r3['id'],method='DELETE',cookie=ck)
assert st==200; ok('contact removed')

# staff cannot add or edit
st,u1,_=call('/api/users',{'email':'door3','name':'D','role':'staff'},cookie=ck)
st,_d,h2=call('/api/login',{'email':'door3','password':u1['password']}); ck2=h2['set-cookie'].split(';')[0]
st,d,_=call('/api/contacts',{'company':'Sneaky Ltd'},cookie=ck2)
assert st==401; ok('staff cannot add contacts')

srv.send_signal(signal.SIGTERM); time.sleep(0.5)
print('\nALL MANUAL CONTACT TESTS PASSED')
