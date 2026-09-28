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



st,d,_=call('/api/users',{'name':'Door','email':'door','role':'staff'},cookie=ck); spw=d['password']
st,d,h=call('/api/login',{'email':'door','password':spw}); sck=h['set-cookie'].split(';')[0]
st,d,h=call('/api/password',{'current':spw,'password':'door-pass-2026'},cookie=sck); sck=h['set-cookie'].split(';')[0]
st,d,_=call('/api/users',{'name':'Ama','email':'ama','role':'admin'},cookie=ck); apw=d['password']

# ---- deals
st,d,_=call('/api/deals',{'title':'','kind':'consulting'},cookie=ck); assert st==400 and d['fields']==['title']; ok('a deal needs a title (or a contact)')
st,d,_=call('/api/deals',{'new_contact':{'company':'Kumasi Cocoa Ltd','full_name':'Yaw Boateng','phone':'0244111222','email':'yaw@kc.example'},
  'kind':'consulting','value':'GHS 45,000','next_step':'Send proposal','next_date':'2026-10-02'},cookie=ck)
assert st==200 and d['title']=='Kumasi Cocoa Ltd' and float(d['value'])==45000 and d['owner']=='admin' and d['stage']=='lead',d; deal=d; ok('deal created with a new company in one step; "GHS 45,000" read as 45000; owner = creator')
st,d,_=call('/api/deals',{'title':'X','owner':'nobody@x'},cookie=ck); assert st==400 and d['error']=='unknown_owner'; ok('owner must be a real team member')
st,d,_=call('/api/deals/%d'%deal['id'],{'stage':'proposal'},method='PATCH',cookie=ck); assert d['stage']=='proposal' and d['closed_at'] is None
st,d,_=call('/api/deals/%d'%deal['id'],{'stage':'won'},method='PATCH',cookie=ck); assert d['stage']=='won' and d['closed_at']; ok('moving to Won stamps the close date')
st,d,_=call('/api/deals/%d'%deal['id'],cookie=ck); assert [e['to_stage'] for e in d['events']]==['won','proposal','lead'],d['events']; ok('every stage move is recorded')
st,c,_=call('/api/contacts',cookie=ck); yaw=[x for x in c['rows'] if x['email']=='yaw@kc.example'][0]; assert yaw['status']=='won'; ok('winning the deal marks the contact as won')
st,d,_=call('/api/deals',{'title':'Lost one','value':1000,'stage':'lead'},cookie=ck); lost=d
st,d,_=call('/api/deals/%d'%lost['id'],{'stage':'lost','lost_reason':'Budget moved to 2027'},method='PATCH',cookie=ck); assert d['lost_reason']=='Budget moved to 2027'; ok('lost reason kept')
st,d,_=call('/api/deals',cookie=sck); assert st==401; ok('staff cannot see the pipeline')
st,d,_=call('/api/deals',cookie=ck); assert len(d['rows'])==2 and d['stages'][0]=='lead'; ok('board lists deals with stages')

# ---- tasks
st,t,_=call('/api/tasks',{'title':'Call Yaw about the invoice','due_at':'2026-01-01T09:00:00Z','contact_id':yaw['id'],'priority':'high'},cookie=ck); assert st==200 and t['assignee']=='admin'
st,t2,_=call('/api/tasks',{'title':'Print name badges','assignee':'door','due_at':'2030-01-01T09:00:00Z'},cookie=ck); assert t2['assignee']=='door'
st,d,_=call('/api/tasks',{'title':'x','assignee':'ghost'},cookie=ck); assert st==400; ok('tasks can only go to real team members')
st,d,_=call('/api/tasks',cookie=sck); assert [x['title'] for x in d['rows']]==['Print name badges']; ok('staff see only their own tasks')
st,d,_=call('/api/tasks/%d'%t['id'],{'done':True},method='PATCH',cookie=sck); assert st==401; ok("staff cannot tick someone else's task")
st,d,_=call('/api/tasks/%d'%t2['id'],{'done':True},method='PATCH',cookie=sck); assert st==200 and d['done_by']=='door'; ok('staff tick their own task')
st,d,_=call('/api/tasks?scope=all',cookie=ck); assert len(d['rows'])==1; st,d,_=call('/api/tasks?scope=all&status=done',cookie=ck); assert len(d['rows'])==1; ok('open and done lists separate')
st,o,_=call('/api/overview',cookie=ck); assert o['my_tasks']['overdue']==1 and o['my_tasks']['open']==1; ok('overview counts my overdue task')

# ---- notes and the record
st,n,_=call('/api/notes',{'contact_id':yaw['id'],'kind':'whatsapp','body':'Sent the invoice on WhatsApp, he will pay Friday'},cookie=ck); assert st==200
st,d,_=call('/api/notes',{'contact_id':yaw['id'],'body':''},cookie=ck); assert st==400; ok('empty note refused')
st,d,_=call('/api/notes',{'contact_id':yaw['id'],'body':'x'},cookie=sck); assert st==401; ok('staff cannot write notes')
st,r,_=call('/api/contacts/%d/record'%yaw['id'],cookie=ck); types=[x['type'] for x in r['timeline']]
assert 'whatsapp' in types and 'deal' in types and 'created' in types and len(r['deals'])==1 and len(r['tasks'])==1, types; ok('company record: deals, tasks and a timeline of notes and stage moves')

# ---- inbound leads become deals + tasks
st,d,_=call('/api/sponsor-enquiry',{'company':'Golden Star Mining','contact_name':'Efua Asante','email':'efua@gs.example','phone':'0200000001','tier':'headline','budget':'GHS 60,000'})
assert st==200
st,d,_=call('/api/deals',cookie=ck); sd=[x for x in d['rows'] if x['kind']=='sponsorship'][0]
assert sd['stage']=='lead' and sd['source']=='Website sponsor enquiry' and sd['open_tasks']==1; ok('a sponsor enquiry opens a sponsorship deal with a follow-up task')
st,d,_=call('/api/sponsor-leads/%d/deal'%sd['sponsor_lead_id'],{},cookie=ck); assert d.get('existed'); ok('converting the same enquiry twice does not duplicate')
fam={'full_name':'Akua Mensah','email':'akua@example.co.uk','country':'United Kingdom','dial':'+44','phone_local':'07700 900123','relationship':'Daughter',
 'parent_region':'Greater Accra','parent_town':'Dansoman','languages':['Twi'],'needs':['Regular visits'],'heard':'Church','message':'','website':'','consent':True}
st,d,_=call('/api/family-interest',fam); st,d,_=call('/api/family-interest',fam)
st,d,_=call('/api/deals',cookie=ck); fd=[x for x in d['rows'] if x['kind']=='family_desk']; assert len(fd)==1 and fd[0]['open_tasks']==1; ok('a Family Desk family opens one deal + call task, not two on resubmit')
st,d,_=call('/api/items',{'code':'F7','kind':'event','title':'Forum','starts_at':'2026-10-24T14:00:00Z','price':0,'capacity':40,'published':True,'phase':'open'},cookie=ck)
st,d,_=call('/api/register',{'item_code':'F7','full_name':'Kwesi','phone':'0244000111','consent':True,'follow_up':'yes','company_about':'Shop','company_size':'2–5'})
st,d,_=call('/api/tasks?scope=unassigned',cookie=ck); ft=[x for x in d['rows'] if x['title'].startswith('Follow up: Kwesi')]
assert ft and ft[0]['due_at'].startswith('2026-10-25'); ok('"Yes, follow up" at a forum creates a task for the day after the event')

# ---- search, registration → record
st,d,_=call('/api/search?q=cocoa',cookie=ck); assert d['contacts'] and d['deals']; ok('search finds companies and deals')
st,d,_=call('/api/search?q=0244000111',cookie=ck); assert d['registrations'] and d['contacts']; ok('search by phone number')
st,d,_=call('/api/search?q=x',cookie=sck); assert st==401; ok('staff cannot search contacts')
regid=d and call('/api/search?q=Kwesi',cookie=ck)[1]['registrations'][0]['id']
st,d,_=call('/api/contacts/from-registration/%d'%regid,{},cookie=ck); st,d2,_=call('/api/contacts/from-registration/%d'%regid,{},cookie=ck)
assert d['id']==d2['id']; ok('a registration opens the same company record every time')

# ---- reports
st,rp,_=call('/api/reports?from=2026-01-01&to=2030-12-31',cookie=ck)
assert rp['winloss']['won']==1 and rp['winloss']['lost']==1 and rp['won_by_month'][0]['v']==45000
assert rp['funnel']['registered']>=1 and any(c['src']=='direct' for c in rp['channels']) and rp['lost_reasons'][0]['why']=='Budget moved to 2027'
ok('reports: won/lost, value won by month, funnel, channels, lost reasons')
st,d,_=call('/api/reports',cookie=sck); assert st==401; ok('staff cannot see reports')
st,d,_=call('/api/overview',cookie=sck); assert st==200 and d['activity']==[]; ok('staff overview shows no customer activity')
st,d,_=call('/api/deals/%d'%lost['id'],method='DELETE',cookie=ck); assert st==200; ok('deal deleted (and logged)')
srv.send_signal(signal.SIGTERM); time.sleep(0.5)
print('\nALL CRM TESTS PASSED')
