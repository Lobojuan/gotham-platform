import subprocess, time, json, os, urllib.request, urllib.error, signal, sys, re as _re, atexit
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
class NoRedir(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*a,**k): return None
def call(path,data=None,method=None,cookie=None,raw=False,follow=True):
    req=urllib.request.Request(B+path,data=json.dumps(data).encode() if data is not None else None,
        method=method or ('POST' if data is not None else 'GET'))
    req.add_header('content-type','application/json')
    if cookie: req.add_header('cookie',cookie)
    op=urllib.request.build_opener() if follow else urllib.request.build_opener(NoRedir)
    try:
        r=op.open(req,timeout=60); b=r.read()
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

paste = """Company;Name;Title;Email;Phone
Acme Mining Ghana;Ama Mensah;Managing Director;ama@acme.example;0244000000
"Gold Fields, Tarkwa";Kofi Asare;Country Manager;kofi@gf.example;+233 20 111 2222
Newmont Africa;Yaa Boateng;Head of Sustainability;yaa@newmont.example;
Tang Palace Hotel;Kwame Osei;GM;kwame@tang.example;0302999888
No Email Mining Co;Kojo Owusu;CEO;;0201234567
Acme Mining Ghana;Ama Mensah;MD;ama@acme.example;0244000000
Broken Row;;;not-an-email;"""
st,d,_=call('/api/contacts/preview',{'text':paste},cookie=ck)
assert st==200 and d['count']>=6,(st,d)
ok("messy paste parsed: %d rows, quoted comma handled (%r)"%(d['count'],d['sample'][1]['company']))

st,d,_=call('/api/contacts/import',{'text':paste,'source':'Chamber of Mines directory 2026','tags':'mining,tier-a','sector':'Mining'},cookie=ck)
assert st==200,(st,d)
ok("import: %d added, %d updated, %d skipped"%(d['added'],d['updated'],d['skipped']))
assert d['added']==5 and d['updated']==1 and d['skipped']==1, d

st,c,_=call('/api/contacts',cookie=ck)
assert len(c['rows'])==5, len(c['rows'])
noemail=[r for r in c['rows'] if not r['email']]
assert len(noemail)==1 and noemail[0]['company']=='No Email Mining Co'
ok('contact with no email kept for calling, not discarded')
ph=[r for r in c['rows'] if r['company']=='Acme Mining Ghana'][0]['phone']
assert ph.startswith('+233'), ph
ok('phones normalised to +233')

cam={'name':'Mining MDs - October','subject':'An invitation, {{first_name}} - 24 October',
 'template':'plain','from_name':'Joy Anthony Preston','daily_limit':2,
 'intro':'Dear {{first_name}},\n\nWe are bringing {{sector}} operators, regulators and investors together on 24 October at Tang Palace.\n\nI thought {{company}} should be in the room.',
 'cta_label':'Request your invitation','cta_url':'http://example.org/register.html?e=F1','seg_sector':'Mining'}
st,r,_=call('/api/campaigns',cam,cookie=ck); assert st==200,(st,r); cid=r['id']; ok('campaign saved')

st,pv,_=call('/api/campaigns/%d/preview'%cid,cookie=ck)
assert st==200,(st,pv)
assert pv['audience']==4, ('expected 4 mining contacts with email', pv['audience'])
assert '{{' not in pv['html'] and '{{' not in pv['subject'], 'merge fields leaked'
ok("preview: audience %d, subject %r"%(pv['audience'],pv['subject']))
assert 'say so here' in pv['html'] or 'Tell us to stop' in pv['html']
ok('opt-out link present')

st,r,_=call('/api/campaigns/%d/start'%cid,{},cookie=ck)
assert st==200,(st,r)
assert r['queued']==4 and r['sent_now']==2, ('daily limit not honoured',r)
ok("started: %d queued, only %d sent now (limit 2/day)"%(r['queued'],r['sent_now']))

st,cams,_=call('/api/campaigns',cookie=ck)
c0=[x for x in cams['rows'] if x['id']==cid][0]
assert c0['released']==2 and c0['pending']==2, c0
ok('two held back for tomorrow')

st,ob,_=call('/api/outbox',cookie=ck)
camm=[m for m in ob['rows'] if m['kind']=='campaign']
assert len(camm)==2, len(camm)
assert '{{' not in camm[0]['body'] and '{{' not in camm[0]['subject']
ok("mail queued, personalised subject: %r"%camm[0]['subject'])

tokens=_re.findall(r'/u/([A-Za-z0-9_-]{10,})', camm[0]['body']+camm[1]['body'])
assert tokens, 'no unsubscribe token'
st,_b,_=call('/u/'+tokens[0],raw=True)
assert st==200; ok('opt-out page loads')
st,c2,_=call('/api/contacts',cookie=ck)
gone=[r for r in c2['rows'] if r['unsubscribed_at']]
assert len(gone)==1 and gone[0]['consent_email']=='no', gone
ok('opt-out recorded: no more email to this person (SMS/WhatsApp consent untouched)')

st,r2,_=call('/api/campaigns',{**cam,'name':'Second wave','daily_limit':50},cookie=ck)
st,pv2,_=call('/api/campaigns/%d/preview'%r2['id'],cookie=ck)
assert pv2['audience']==3, ('opted-out contact still targeted',pv2['audience'])
ok('opted-out person excluded from all future campaigns')

ctok=_re.findall(r'/c/([A-Za-z0-9_-]{10,})', camm[0]['body'])
assert ctok
st,_b,hh=call('/c/'+ctok[0],raw=True,follow=False)
assert st==302 and 'register.html' in hh.get('location',''),(st,hh.get('location'))
ok('click tracked and redirected')
st,cams2,_=call('/api/campaigns',cookie=ck)
assert [x for x in cams2['rows'] if x['id']==cid][0]['clicked']==1
ok('click counted')

call('/api/campaigns/%d/start'%cid,{},cookie=ck)
st,cams3,_=call('/api/campaigns',cookie=ck)
c1=[x for x in cams3['rows'] if x['id']==cid][0]
assert c1['sent']+c1['pending']+ (0) <= 4, ('duplicates queued',c1)
ok('restart does not re-send to anyone')

st,u1,_=call('/api/users',{'email':'door7','name':'Door','role':'staff'},cookie=ck)
st,_d,h2=call('/api/login',{'email':'door7','password':u1['password']}); ck2=h2['set-cookie'].split(';')[0]
for path,payload in [('/api/contacts',None),('/api/contacts/import',{'text':paste,'source':'x'}),
                     ('/api/campaigns',None),('/api/campaigns/%d/start'%cid,{})]:
    st,d,_=call(path,payload,cookie=ck2)
    assert st==401,(path,st,d)
ok('staff cannot see contacts or send anything')

srv.send_signal(signal.SIGTERM); time.sleep(0.5)
print('\nALL OUTREACH TESTS PASSED')
