import subprocess, time, json, os, base64, urllib.request, urllib.error, signal, sys, atexit
import os
DB=os.environ.get('TEST_DATABASE_URL','postgres://test@127.0.0.1:5439/gotham_test')
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
os.chdir(os.path.join(ROOT,'apps','crm'))
XLS='/tmp/gotham-import-fixture.xlsx'
subprocess.run(['node','--input-type=module','-e',"""
import ExcelJS from 'exceljs';
const w=new ExcelJS.Workbook();
let s=w.addWorksheet('Mining Companies');
s.addRow(['Company (Ghana entity)','Ghana MD / CEO','Official email','Priority','Suggested package']);
for(let i=1;i<=14;i++) s.addRow([i===1?'Gold Fields Ghana':`Mining Co ${i}`,i===1?'Elliot Twum – Managing Director':`Person ${i} – Director`,i===1?'TO FIND':`person${i}@example.org`,`Tier ${i===1?1:2}`,i===1?'Signature package':'Standard package']);
let t=w.addWorksheet('Institutions'); t.addRow(['Institution','Contact','Official email','Priority']);
for(let i=1;i<=4;i++) t.addRow([`Institution ${i}`,`Contact ${i}`,`institution${i}@example.org`,'Tier 2']);
await w.xlsx.writeFile('/tmp/gotham-import-fixture.xlsx');
"""],check=True)
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
        r=urllib.request.urlopen(req,timeout=120); return r.status,json.loads(r.read() or b'{}'),r.headers
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

data=base64.b64encode(open(XLS,'rb').read()).decode()
st,insp,_=call('/api/contacts/inspect',{'name':'Ghana_Mining.xlsx','data':data},cookie=ck)
assert st==200,(st,insp)
names=[s['name'] for s in insp['sheets']]
ok('sheets found: %s'%names)
mining=[s for s in insp['sheets'] if s['name']=='Mining Companies'][0]
assert mining['rows']==14, mining['rows']
ok('Mining Companies: %d data rows, %d columns'%(mining['rows'],len(mining['columns'])))
guessed={mining['columns'][int(k)]:v for k,v in mining['mapping'].items()}
ok('columns auto-mapped: %s'%json.dumps(guessed,ensure_ascii=False))
assert guessed.get('Company (Ghana entity)')=='company', guessed
assert guessed.get('Ghana MD / CEO')=='full_name', ('should pick the Ghana MD, not the group CEO', guessed)
assert guessed.get('Official email')=='email', guessed
assert guessed.get('Priority')=='priority', guessed

st,r,_=call('/api/contacts/import-sheet',{'name':'Ghana_Mining.xlsx','data':data,'sheet':'Mining Companies',
  'mapping':mining['mapping'],'source':'Top Guide research, September 2026','tags':'mining,sponsor-target'},cookie=ck)
assert st==200,(st,r)
assert r['added']==14 and r['skipped']==0,(r)
ok('imported: %d added, %d skipped'%(r['added'],r['skipped']))

st,c,_=call('/api/contacts',cookie=ck)
rows=c['rows']
gf=[x for x in rows if 'Gold Fields' in (x['company'] or '')][0]
ok('Gold Fields contact: %r — %r'%(gf['full_name'],gf['role']))
assert 'Twum' in (gf['full_name'] or ''), ('picked the wrong person', gf['full_name'])
assert gf['priority']=='Tier 1', gf['priority']
assert gf['email'] is None, ('TO FIND should not become an email', gf['email'])
ok('"TO FIND" treated as empty, not imported as an address')
assert gf['full_name'] and '–' not in gf['full_name'], gf['full_name']
ok('name and job title split out of one cell')
assert gf['extra'] and 'Suggested package' in gf['extra'], list((gf['extra'] or {}).keys())
ok('unmapped columns kept: %s'%', '.join(list(gf['extra'].keys())[:6]))
assert gf['extra'].get('Suggested package','').startswith('Signature')
assert rows[0]['priority']=='Tier 1', 'not sorted by tier'
ok('list sorted by tier, Tier 1 first')

# re-import the same file: must update, not duplicate
st,r2,_=call('/api/contacts/import-sheet',{'name':'Ghana_Mining.xlsx','data':data,'sheet':'Mining Companies',
  'mapping':mining['mapping'],'source':'Top Guide research, September 2026'},cookie=ck)
assert r2['added']==0 and r2['updated']==14,(r2)
ok('re-importing the same file updates 14, adds 0 — no duplicates')
st,c2,_=call('/api/contacts',cookie=ck)
assert len(c2['rows'])==14, len(c2['rows'])

# the institutions sheet has different columns
inst=[s for s in insp['sheets'] if s['name']=='Institutions'][0]
g2={inst['columns'][int(k)]:v for k,v in inst['mapping'].items()}
ok('Institutions sheet mapped separately: %s'%json.dumps(g2,ensure_ascii=False))
st,r3,_=call('/api/contacts/import-sheet',{'name':'x.xlsx','data':data,'sheet':'Institutions',
  'mapping':inst['mapping'],'source':'Top Guide research','tags':'institution'},cookie=ck)
assert st==200 and r3['added']==4,(r3)
ok('institutions imported as %d more contacts'%r3['added'])

# a contact gets an email later -> update, still no duplicate
st,c3,_=call('/api/contacts',cookie=ck)
before=len(c3['rows'])
st,r4,_=call('/api/contacts/import',{'text':'Company;Name;Email\nGold Fields Ghana;Elliot Twum;elliot@goldfields.example',
  'source':'follow-up call'},cookie=ck)
st,c4,_=call('/api/contacts',cookie=ck)
gf2=[x for x in c4['rows'] if 'Gold Fields' in (x['company'] or '')]
assert len(gf2)==1, ('duplicate created when an email was added later', len(gf2))
assert gf2[0]['email']=='elliot@goldfields.example', gf2[0]['email']
assert r4['added']==0 and r4['updated']==1, r4
ok('adding an email later updates the existing contact, no duplicate')

# importing without saying where it came from
st,d,_=call('/api/contacts/import-sheet',{'name':'x.xlsx','data':data,'sheet':'Mining Companies','mapping':mining['mapping'],'source':''},cookie=ck)
assert st==400 and d['error']=='source_required'
ok('import refused without a recorded source')

# staff cannot
st,u1,_=call('/api/users',{'email':'door5','name':'D','role':'staff'},cookie=ck)
st,_d,h2=call('/api/login',{'email':'door5','password':u1['password']}); ck2=h2['set-cookie'].split(';')[0]
st,d,_=call('/api/contacts/inspect',{'name':'x.xlsx','data':data},cookie=ck2)
assert st==401; ok('staff cannot upload contact lists')

srv.send_signal(signal.SIGTERM); time.sleep(0.5)
print('\nALL SPREADSHEET IMPORT TESTS PASSED')
