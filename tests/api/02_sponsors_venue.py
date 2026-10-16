import subprocess, time, json, os, base64, urllib.request, urllib.error, signal, sys, atexit
import os
DB=os.environ.get('TEST_DATABASE_URL','postgres://test@127.0.0.1:5439/gotham_test')
TEST_PORT = int(os.environ.get('TEST_PORT', '4199'))
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
os.chdir(os.path.join(ROOT,'apps','crm'))
env=dict(os.environ); env.update({
 'DATABASE_URL':DB,'SESSION_SECRET':'t','ALLOW_ORIGINS':'*','PORT':str(TEST_PORT),
 'ADMIN_EMAIL':'admin','ADMIN_PASSWORD':'ownerpass123','ADMIN_NAME':'Admin',
 'MEDIA_DIR':'/tmp/mediatest','PUBLIC_URL':f'http://127.0.0.1:{TEST_PORT}','SITE_URL':'http://127.0.0.1:8777'})
os.makedirs('/tmp/mediatest',exist_ok=True)
srv=subprocess.Popen(['node','server.js'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
def _cleanup_server():
    if srv.poll() is None:
        srv.terminate()
        try: srv.wait(timeout=3)
        except subprocess.TimeoutExpired: srv.kill()
atexit.register(_cleanup_server)
B=f'http://127.0.0.1:{TEST_PORT}'
def call(path,data=None,method=None,cookie=None,raw=False):
    req=urllib.request.Request(B+path,data=json.dumps(data).encode() if data is not None else None,
        method=method or ('POST' if data is not None else 'GET'))
    req.add_header('content-type','application/json')
    if cookie: req.add_header('cookie',cookie)
    try:
        r=urllib.request.urlopen(req,timeout=60); b=r.read()
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
    print('NO START'); print(srv.stdout.read()[:3000]); sys.exit(1)
ok=lambda m: print('  ok', m)
print('health OK')
# accounts on a given password must choose their own before the back office opens (tested in smoke9);
# the other suites start from staff who have already done so
import subprocess as _sp
_orig_call=call
def call(path,*a,**k):
    if path=='/api/login': _sp.run(['psql',DB,'-qc','update users set must_change=false'],check=True)
    return _orig_call(path,*a,**k)
st,d,h=call('/api/login',{'email':'admin','password':'ownerpass123'}); assert st==200,(st,d)
ck=h['set-cookie'].split(';')[0]; ok('login')

# --- venue limit ---
st,d,_=call('/api/settings',{'max_seats':'40'},cookie=ck); assert st==200,(st,d)
ev={'code':'F9','kind':'event','title':'Test forum','capacity':120,'published':True}
st,d,_=call('/api/items',ev,cookie=ck)
assert st==400 and d['error']=='over_venue_limit' and d['max']==40,(st,d)
ok('capacity above the venue limit is refused')
ev['capacity']=40
st,d,_=call('/api/items',ev,cookie=ck); assert st==200,(st,d); ok('capacity at the limit saves')

# --- logo upload keeps shape and transparency ---
import subprocess as sp
sp.run(['node','-e','''const sharp=require("sharp");
sharp({create:{width:900,height:300,channels:4,background:{r:20,g:90,b:60,alpha:1}}}).png().toFile("/tmp/logo.png").then(()=>console.log("made"))'''],check=True,capture_output=True)
logo=open('/tmp/logo.png','rb').read()
st,d,_=call('/api/media',{'kind':'logo','name':'Acme Mining logo.png','data':base64.b64encode(logo).decode(),'alt':'Acme Mining'},cookie=ck)
assert st==200,(st,d)
lg=d['sizes']['lg']
assert abs(lg['w']/lg['h'] - 3.0) < 0.05, ('logo was cropped!', lg)
ok(f"logo fitted not cropped: {lg['w']}x{lg['h']} (source 900x300)")
assert lg['jpg'].endswith('.png'), lg['jpg']
ok('logo served as PNG so transparency survives')
logo_id=d['id']
st,_b,_=call(lg['webp'].replace(B,''),raw=True); assert st==200; ok('logo file served')

# photos still crop to fill
sp.run(['node','-e','''const sharp=require("sharp");
sharp({create:{width:2400,height:1000,channels:3,background:{r:180,g:120,b:40}}}).png().toFile("/tmp/photo.png").then(()=>console.log("x"))'''],check=True,capture_output=True)
st,d,_=call('/api/media',{'kind':'image','name':'photo.png','data':base64.b64encode(open('/tmp/photo.png','rb').read()).decode()},cookie=ck)
assert st==200 and d['sizes']['card']['w']==800 and d['sizes']['card']['h']==450,(st,d)
ok('photos still crop to the exact layout box')

# --- sponsors ---
sp1={'name':'Acme Mining Ghana','tier':'headline','category':'Mining','blurb':'Responsible gold mining in the Eastern Region',
     'url':'https://example.com','logo':logo_id,'item_code':'F9','amount':25000,'currency':'GHS','paid':True,
     'contact_name':'Ama Mensah','contact_email':'ama@example.com','contact_phone':'0244000000','published':True}
st,d,_=call('/api/sponsors',sp1,cookie=ck); assert st==200,(st,d); ok('sponsor saved')
st,d,_=call('/api/sponsors',{'name':'Tang Palace Hotel','tier':'partner','category':'Hospitality','published':True},cookie=ck)
assert st==200; ok('second sponsor saved')
# expired sponsor must not show publicly
st,d,_=call('/api/sponsors',{'name':'Old Sponsor','tier':'listing','ends_on':'2020-01-01','published':True},cookie=ck)
assert st==200
st,pub,_=call('/api/sponsors')
names=[x['name'] for x in pub['sponsors']]
assert 'Acme Mining Ghana' in names and 'Old Sponsor' not in names, names
assert pub['sponsors'][0]['tier']=='headline', pub['sponsors'][0]
assert pub['sponsors'][0]['logo']['sizes']['lg']['webp'].startswith('http')
ok('public wall: ordered by tier, expired hidden, logo resolved')
st,allr,_=call('/api/sponsors/all',cookie=ck)
assert len(allr['rows'])==3; ok('back office sees all three including the expired one')

# --- sponsor enquiry from the website ---
st,d,_=call('/api/sponsor-enquiry',{'company':'Gold Coast Logistics','contact_name':'Kojo','email':'kojo@example.com',
  'phone':'0201234567','tier':'partner','message':'We ship for mining clients.'})
assert st==200,(st,d); ok('sponsorship enquiry accepted')
st,d,_=call('/api/sponsor-enquiry',{'company':'No Email Ltd'}); assert st==400,(st,d); ok('enquiry without a valid email refused')
st,leads,_=call('/api/sponsor-leads',cookie=ck)
assert leads['rows'][0]['company']=='Gold Coast Logistics' and leads['rows'][0]['phone'].startswith('+233'),leads['rows'][0]
ok('lead stored, phone normalised to +233')
st,d,_=call('/api/sponsor-leads/'+str(leads['rows'][0]['id']),{'status':'talking'},method='PATCH',cookie=ck)
assert st==200; ok('lead status updated')

# --- permissions ---
st,u1,_=call('/api/users',{'email':'door9','name':'Door','role':'staff'},cookie=ck)
st,d,h2=call('/api/login',{'email':'door9','password':u1['password']}); ck2=h2['set-cookie'].split(';')[0]
for path,payload in [('/api/sponsors',sp1),('/api/media',{'kind':'logo','name':'x.png','data':base64.b64encode(logo).decode()})]:
    st,d,_=call(path,payload,cookie=ck2); assert st==401,(path,st,d)
ok('staff cannot add sponsors or upload logos')
st,d,_=call('/api/sponsors/1',method='DELETE',cookie=ck2); assert st==401; ok('staff cannot delete sponsors')

# --- deleting a logo that a sponsor uses ---
st,d,_=call('/api/media/'+logo_id,method='DELETE',cookie=ck)
assert st==409 and d['error']=='in_use' and 'Acme Mining Ghana' in d['items'],(st,d)
ok('a logo in use by a sponsor cannot be deleted')

srv.send_signal(signal.SIGTERM); time.sleep(0.5)
print('\nALL SPONSOR + VENUE TESTS PASSED')
