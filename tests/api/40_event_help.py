"""The event support form saves a CRM record before optional WhatsApp follow-up."""
import subprocess, time, json, os, urllib.request, urllib.error, atexit, sys

DB=os.environ.get('TEST_DATABASE_URL','postgres://test@127.0.0.1:5439/gotham_test')
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
os.chdir(os.path.join(ROOT,'apps','crm'))
BASE='http://127.0.0.1:4220'
env={**os.environ,'DATABASE_URL':DB,'SESSION_SECRET':'test-secret','PORT':'4220','NODE_ENV':'test',
 'ADMIN_EMAIL':'owner','ADMIN_PASSWORD':'ownerpass123','ADMIN_NAME':'Uffe Carlson','MEDIA_DIR':'/tmp/gotham-event-help-test',
 'PUBLIC_URL':BASE,'SITE_URL':'http://example.org'}
os.makedirs('/tmp/gotham-event-help-test',exist_ok=True)
srv=subprocess.Popen(['node','server.js'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
atexit.register(lambda:srv.poll() is None and srv.terminate())
def call(path,data=None,method=None,cookie=None,ip='127.0.0.41'):
 req=urllib.request.Request(BASE+path,data=json.dumps(data).encode() if data is not None else None,
  method=method or ('POST' if data is not None else 'GET'),headers={'content-type':'application/json','x-real-ip':ip})
 if cookie:req.add_header('cookie',cookie)
 try:
  r=urllib.request.urlopen(req,timeout=30);return r.status,json.loads(r.read() or b'{}'),r.headers
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read() or b'{}'),e.headers
def psql(sql):return subprocess.run(['psql',DB,'-qAtc',sql],capture_output=True,text=True,check=True).stdout.strip()
for _ in range(80):
 try:
  if call('/api/health')[0]==200:break
 except Exception:pass
 time.sleep(.25)
else:print('NO START',srv.stdout.read()[:3000]);sys.exit(1)

payload={'type':'event','item_code':'F1','name':'Akosua Visitor','email':'akosua.event@example.test',
 'company':'Accra Maker Studio','topic':'Company setup and market entry, AI, IT and business software',
 'message':'We need help formalising the business and selling our products online.', 'consent':True}
st,result,_=call('/api/site-enquiry',payload)
assert st==200 and result['ok'] and result['deal_id'] and result['reference'].startswith('GC-EF-'),result
deal_id=result['deal_id']
assert psql("select count(*) from contacts where lower(email)='akosua.event@example.test'")=='1'
assert psql(f"select count(*) from deals where id={deal_id} and kind='event' and source='SMEs at the Centre (F1) · post-registration business support follow-up'")=='1'
assert psql(f"select count(*) from notes where deal_id={deal_id} and author='website' and body like '%Company setup and market entry%' and body like '%selling our products online%'")=='1'
assert psql(f"select count(*) from tasks where deal_id={deal_id} and title like '%SMEs at the Centre business-support follow-up%'")=='1'
assert psql(f"select string_agg(to_email,',' order by to_email) from outbox where kind='staff_alert' and subject='New enquiry · SMEs at the Centre support follow-up'")=='joy@gothamconsult.com,uffe.carlson@gothamconsult.com'
assert psql("select count(*) from outbox where to_email='akosua.event@example.test' and kind='website_ack' and body like '%GC-EF-%'")=='1'
assert psql("select count(*) from msg_outbox where channel='whatsapp'")=='0'
print('  ok event form creates a CRM contact, event deal, private note, next-day task and email alerts; no WhatsApp message is sent automatically')

# The signed-in CRM exposes the event lead on the pipeline and keeps details on its contact record.
psql("update users set must_change=false")
st,_,h=call('/api/login',{'email':'owner','password':'ownerpass123'})
assert st==200
cookie=h['set-cookie'].split(';')[0]
st,deals,_=call('/api/deals',cookie=cookie)
assert st==200 and any(d['id']==deal_id and d['kind']=='event' for d in deals['rows']),deals
print('  ok admins can find event enquiries in the CRM pipeline')

st,err,_=call('/api/site-enquiry',{**payload,'email':'no.consent@example.test','consent':False},ip='127.0.0.42')
assert st==400 and err['error']=='consent_required',err
assert psql("select count(*) from contacts where lower(email)='no.consent@example.test'")=='0'
print('  ok missing privacy consent does not create a contact or enquiry')
srv.terminate();print('PASSED event help form checks')
