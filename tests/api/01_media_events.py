import subprocess, time, json, os, base64, urllib.request, urllib.error, signal, sys, atexit
import os
DB=os.environ.get('TEST_DATABASE_URL','postgres://test@127.0.0.1:5439/gotham_test')
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
os.chdir(ROOT+'/apps/crm')
env = dict(os.environ)
env.update({
 'DATABASE_URL':DB,
 'SESSION_SECRET':'test-secret','ALLOW_ORIGINS':'*','PORT':'4199',
 'ADMIN_EMAIL':'owner@test.local','ADMIN_PASSWORD':'ownerpass123','ADMIN_NAME':'Owner',
 'MEDIA_DIR':'/tmp/mediatest','PUBLIC_URL':'http://127.0.0.1:4199','SITE_URL':'https://example.org'})
os.makedirs('/tmp/mediatest', exist_ok=True)
srv = subprocess.Popen(['node','server.js'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
def _cleanup_server():
    if srv.poll() is None:
        srv.terminate()
        try: srv.wait(timeout=3)
        except subprocess.TimeoutExpired: srv.kill()
atexit.register(_cleanup_server)
B='http://127.0.0.1:4199'
def call(path, data=None, method=None, cookie=None, raw=False):
    req = urllib.request.Request(B+path, data=json.dumps(data).encode() if data is not None else None,
        method=method or ('POST' if data is not None else 'GET'))
    req.add_header('content-type','application/json')
    if cookie: req.add_header('cookie', cookie)
    try:
        r = urllib.request.urlopen(req, timeout=60)
        body = r.read()
        return r.status, (body if raw else json.loads(body or b'{}')), r.headers
    except urllib.error.HTTPError as e:
        body = e.read()
        try: return e.code, json.loads(body or b'{}'), e.headers
        except Exception: return e.code, body[:200], e.headers

for _ in range(50):
    try:
        if call('/api/health')[0]==200: break
    except Exception: pass
    time.sleep(0.4)
else:
    print('SERVER DID NOT START'); print(srv.stdout.read()[:3000]); sys.exit(1)
print('health OK')

# accounts on a given password must choose their own before the back office opens (tested in smoke9);
# the other suites start from staff who have already done so
import subprocess as _sp
_orig_call=call
def call(path,*a,**k):
    if path=='/api/login': _sp.run(['psql',DB,'-qc','update users set must_change=false'],check=True)
    return _orig_call(path,*a,**k)
st,d,h = call('/api/login', {'email':'owner@test.local','password':'ownerpass123'})
assert st==200, (st,d)
ck = h['set-cookie'].split(';')[0]
print('login OK', d['role'])

# --- image upload: a real, deliberately non-16:9 image ---
img = open(os.path.join(os.path.dirname(__file__),'test-wide.png'),'rb').read()   # 2400x1000, not 16:9
st,d,_ = call('/api/media', {'kind':'image','name':'wide photo!!.png','data':base64.b64encode(img).decode(),'alt':'A test photo'}, cookie=ck)
assert st==200, (st,d)
print('image upload OK ->', {k:(v['w'],v['h']) for k,v in d['sizes'].items()})
cover = d['id']
for name,v in d['sizes'].items():
    for f in ('webp','jpg'):
        s2,_b,_h = call(v[f].replace('http://127.0.0.1:4199',''), raw=True)
        assert s2==200, (name,f,s2)
print('all variants served OK')

# aspect ratios must match the layout boxes exactly
want={'hero':16/9,'card':16/9,'thumb':16/9,'og':1200/630}
for k,r in want.items():
    got=d['sizes'][k]['w']/d['sizes'][k]['h']
    assert abs(got-r)<0.02, (k,got,r)
print('aspect ratios locked OK')

# --- PDF upload ---
pdf=b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'
st,doc,_ = call('/api/media', {'kind':'doc','name':'Sponsorship Pack.pdf','data':base64.b64encode(pdf).decode(),'label':'Sponsorship pack'}, cookie=ck)
assert st==200, (st,doc)
print('pdf upload OK', doc['label'], doc['kb'],'KB')

# a non-pdf pretending to be one must be refused
st,bad,_ = call('/api/media', {'kind':'doc','name':'evil.pdf','data':base64.b64encode(b'not a pdf at all').decode()}, cookie=ck)
assert st==400 and bad['error']=='not_a_pdf', (st,bad)
print('fake pdf rejected OK')

# --- save an event with all the new content ---
ev={'code':'F5','kind':'event','title':'SMEs at the Centre','subtitle':'A working forum',
 'summary':'One room, real decisions.','description':'Para one.\n\nPara two.',
 'venue':'Tang Palace Hotel, Accra','starts_at':'2026-10-24T14:00:00.000Z',
 'currency':'GHS','price':0,'capacity':120,'published':True,'approval':True,'phase':'open',
 'audiences':'SME / business owner,Investor','cover':cover,'gallery':[cover],
 'docs':[{'id':doc['id'],'label':'Sponsorship pack'}],
 'agenda':[{'time':'09:30','what':'Registration'},{'time':'10:00','what':'Opening'}],
 'speakers':[{'name':'Joy Anthony Preston','role':'Gotham Consult'}],
 'flyer':{'eyebrow':'You are invited','headline':'SMEs at the Centre','body':'A working forum for Ghanaian enterprise.','cta':'Scan to register',
          'template':'navy','format':'social','language':'en','image':'cover','qr_slug':'event-f5'} }
st,d,_ = call('/api/items', ev, cookie=ck)
assert st==200, (st,d)
print('event saved OK slug =', d['slug'])

# Flyer settings persist with the event and remain editable in the back office.
st,d,_ = call('/api/items')
assert st==200, (st,d)  # public list is intentionally available without a session
it=[x for x in d['items'] if x['code']=='F5'][0]
assert it['flyer']['headline']=='SMEs at the Centre' and it['flyer']['template']=='navy' and it['flyer']['qr_slug']=='event-f5', it.get('flyer')
print('flyer settings persisted and returned OK')

# AI flyer suggestions stay behind the admin gate and explain when the server key is absent.
st,d,_ = call('/api/items/F5/flyer-copy', {'language':'en'}, cookie=None)
assert st==401, (st,d)
st,d,_ = call('/api/items/F5/flyer-copy', {'language':'en'}, cookie=ck)
assert st==503 and d.get('error')=='ai_off', (st,d)
print('AI flyer copy is admin-only and degrades clearly without a configured key')

st,pub,_ = call('/api/items')
it=[x for x in pub['items'] if x['code']=='F5'][0]
assert it['cover_image']['sizes']['card']['webp'].startswith('http'), it['cover_image']
assert it['documents'][0]['label']=='Sponsorship pack'
assert len(it['agenda'])==2 and it['agenda'][0]['time']=='09:30'
assert it['speakers'][0]['name']=='Joy Anthony Preston'
print('public API carries cover, docs, agenda, speakers OK')

# media in use cannot be deleted
st,d,_ = call('/api/media/'+cover, method='DELETE', cookie=ck)
assert st==409 and d['error']=='in_use', (st,d)
print('in-use media protected OK')

# --- QR + poster ---
st,qr,_ = call('/api/qr', {'kind':'register','item_code':'F5','label':'Tang Palace lobby banner'}, cookie=ck)
assert st==200 and qr['short'].endswith('/s/'+qr['slug']), (st,qr)
print('qr created OK', qr['slug'], '->', qr['target'])
st,svg,_ = call('/api/qr?fmt=svg&data='+qr['short'].replace(':','%3A').replace('/','%2F'), cookie=ck, raw=True)
assert st==200 and b'<svg' in svg, st
print('qr svg OK', len(svg),'bytes')
st,png_,_ = call('/api/qr?fmt=png&size=800&data='+qr['short'].replace(':','%3A').replace('/','%2F'), cookie=ck, raw=True)
assert st==200 and png_[:4]==b'\x89PNG', st
print('qr png OK', len(png_),'bytes')
st,pos,_ = call('/poster/'+qr['slug'], raw=True)
assert st==200 and b'Scan to register' in pos and b'Tang Palace' in pos, st
print('poster OK', len(pos),'bytes')
st,pos5,_ = call('/poster/'+qr['slug']+'?size=a5', raw=True)
assert b'size:A5' in pos5, 'A5 switch failed'
print('poster A5 OK')

# shortlink redirect counts a scan (don't follow it — the target is off-network here)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
op = urllib.request.build_opener(NoRedirect)
try:
    op.open(B+'/s/'+qr['slug'], timeout=20)
except urllib.error.HTTPError as e:
    print('scan redirect status', e.code, '->', e.headers.get('location'))
st,links,_ = call('/api/shortlinks', cookie=ck)
row=[r for r in links['rows'] if r['slug']==qr['slug']][0]
assert row['clicks']>=1, row
print('scan counted OK, clicks =', row['clicks'])

# whatsapp code
st,wa,_ = call('/api/qr', {'kind':'whatsapp','whatsapp':'+233 55 239 5548','message':'Hello','label':'Flyer batch A'}, cookie=ck)
assert st==200 and wa['target'].startswith('https://wa.me/233552395548'), wa
print('whatsapp code OK', wa['target'][:48])

# staff must not be able to upload or edit
st,_d,_h = call('/api/users', {'email':'door1','name':'Door One','role':'staff'}, cookie=ck)
print('staff user created', st)
st,d,h3 = call('/api/login', {'email':'door1','password':_d['password']})
ck2=h3['set-cookie'].split(';')[0]
st,d,_ = call('/api/media', {'kind':'image','name':'x.png','data':base64.b64encode(img).decode()}, cookie=ck2)
assert st==401, (st,d)
st,d,_ = call('/api/items', ev, cookie=ck2)
assert st==401, (st,d)
print('staff blocked from uploads and event edits OK')

# oversized upload refused
big = base64.b64encode(b'\x00'*(13*1024*1024)).decode()
st,d,_ = call('/api/media', {'kind':'image','name':'huge.png','data':big}, cookie=ck)
assert st in (400,413), (st,d)
print('oversized upload refused OK ->', st, d.get('error'))

srv.send_signal(signal.SIGTERM); time.sleep(0.5)
print('\nALL SMOKE TESTS PASSED')
