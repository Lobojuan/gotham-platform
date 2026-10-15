"""Consented website follow-ups email the configured Gotham team inboxes."""
import subprocess, time, json, os, urllib.request, urllib.error, atexit, sys

DB=os.environ.get('TEST_DATABASE_URL','postgres://test@127.0.0.1:5439/gotham_test')
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
os.chdir(os.path.join(ROOT,'apps','crm'))
BASE='http://127.0.0.1:4219'
env={**os.environ,'DATABASE_URL':DB,'SESSION_SECRET':'test-secret','PORT':'4219','NODE_ENV':'test',
 'ADMIN_EMAIL':'owner','ADMIN_PASSWORD':'ownerpass123','ADMIN_NAME':'Uffe Carlson','MEDIA_DIR':'/tmp/gotham-email-alert-test',
 'PUBLIC_URL':BASE,'SITE_URL':'http://example.org'}
os.makedirs('/tmp/gotham-email-alert-test',exist_ok=True)
srv=subprocess.Popen(['node','server.js'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
atexit.register(lambda:srv.poll() is None and srv.terminate())
def call(path,data=None,method=None,cookie=None,ip='127.0.0.31'):
 req=urllib.request.Request(BASE+path,data=json.dumps(data).encode() if data is not None else None,
  method=method or ('POST' if data is not None else 'GET'),headers={'content-type':'application/json','x-real-ip':ip})
 if cookie:req.add_header('cookie',cookie)
 try:
  r=urllib.request.urlopen(req,timeout=30);return r.status,json.loads(r.read() or b'{}'),r.headers
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read() or b'{}'),e.headers
def psql(sql):return subprocess.run(['psql',DB,'-qAtc',sql],capture_output=True,text=True,check=True).stdout.strip()
def ok(s):print('  ok',s)
for _ in range(80):
 try:
  if call('/api/health')[0]==200:break
 except Exception:pass
 time.sleep(.25)
else:print('NO START',srv.stdout.read()[:3000]);sys.exit(1)
psql('update users set must_change=false')
st,_,h=call('/api/login',{'email':'owner','password':'ownerpass123'});assert st==200
owner=h['set-cookie'].split(';')[0]

# The two Gotham team inboxes are prefilled; email readiness reflects server mail configuration.
st,prefs,_=call('/api/chat/prefs',cookie=owner)
assert st==200 and prefs['enquiry_emails']=='joy@gothamconsult.com, uffe.carlson@gothamconsult.com' and prefs['enquiry_enabled'] is True and prefs['mail_ready'] is False,prefs
st,err,_=call('/api/chat/prefs',{'enquiry_emails':'joy@gothamconsult.com, not-an-email'},cookie=owner)
assert st==400 and err['error']=='bad_enquiry_emails',err
st,saved,_=call('/api/chat/prefs',{'enquiry_emails':'joy@gothamconsult.com; uffe.carlson@gothamconsult.com','enquiry_enabled':True},cookie=owner)
assert st==200 and saved['ok'],saved
ok('owner can configure up to five team email recipients; invalid addresses are rejected')

# A consented website follow-up queues a short internal email to each team inbox, without sending visitor contact data.
st,body,_=call('/api/chat-lead',{'name':'Kwesi Client','company':'Nordic Sun','contact':'kwesi.client@example.test',
 'need':'Market entry for a solar project','consent':True},ip='127.0.0.32')
assert st==200 and body['ok'],body
for _ in range(30):
 if psql("select count(*) from outbox where kind='staff_alert'")=='2':break
 time.sleep(.1)
assert psql("select count(*) from outbox where kind='staff_alert' and status='queued'")=='2'
assert psql("select string_agg(to_email,',' order by to_email) from outbox where kind='staff_alert'")== 'joy@gothamconsult.com,uffe.carlson@gothamconsult.com'
mail=psql("select string_agg(subject || ' ' || body,' ') from outbox where kind='staff_alert'")
assert 'New Gotham enquiry' in mail and 'Nordic Sun' in mail and 'solar project' in mail and 'kwesi.client@example.test' not in mail,mail
assert psql("select count(*) from msg_outbox where kind='team_inquiry'")=='0'
ok('consented service enquiry queues email to both team inboxes and does not use Meta WhatsApp')

# Every registration queues the registrant's receipt and a CRM notice for Joy and Uffe,
# even when the person declines marketing or service follow-up.
st,item,_=call('/api/items',{'code':'MAIL1','kind':'event','title':'Email confirmation forum','starts_at':'2026-12-02T14:00:00Z',
 'price':0,'currency':'GHS','capacity':20,'published':True,'approval':False,'phase':'open'},cookie=owner)
assert st==200,item
st,reg,_=call('/api/register',{'item_code':'MAIL1','full_name':'Ama Registered','email':'ama.registered@example.test',
 'phone':'0244000123','consent':True,'follow_up':'no'},ip='127.0.0.35')
assert st==200,reg
for _ in range(30):
 if psql("select count(*) from outbox where reg_id=(select id from registrations where reference='"+reg['reference']+"')")== '3':break
 time.sleep(.1)
reg_id=psql("select id from registrations where reference='"+reg['reference']+"'")
assert psql(f"select count(*) from outbox where reg_id={reg_id} and to_email='ama.registered@example.test' and kind='ticket'")=='1'
assert psql(f"select string_agg(to_email,',' order by to_email) from outbox where reg_id={reg_id} and kind='staff_alert'")== 'joy@gothamconsult.com,uffe.carlson@gothamconsult.com'
assert psql(f"select count(*) from registrations where id={reg_id} and email='ama.registered@example.test'")=='1'
ok('every registration is saved in CRM and queues a registrant confirmation plus email notices to Joy and Uffe')

# The required email is enforced server-side, not just by browser validation.
st,err,_=call('/api/register',{'item_code':'MAIL1','full_name':'No Email','phone':'0244000124','consent':True},ip='127.0.0.36')
assert st==400 and err['fields']==['email'],err
ok('registration without a deliverable confirmation address is rejected')

# The homepage appointment and About contact forms use the same CRM-first email flow.
st,lead,_=call('/api/site-enquiry',{'type':'call','name':'Kofi Request','email':'kofi.request@example.test',
 'topic':'Company set-up','preferred_day':'2026-11-02','preferred_time':'14:00','consent':True},ip='127.0.0.37')
assert st==200 and lead['ok'] and lead['email_queued'],lead
for _ in range(30):
 if psql("select count(*) from outbox where to_email='kofi.request@example.test'")=='1':break
 time.sleep(.1)
assert psql("select count(*) from contacts where lower(email)='kofi.request@example.test'")=='1'
assert psql("select count(*) from deals where source='Website call request' and title like '%website call request'")=='1'
assert psql("select count(*) from notes where author='website' and body like '%2026-11-02 at 14:00 Accra time%'")=='1'
assert psql("select count(*) from outbox where kind='staff_alert' and to_email in ('joy@gothamconsult.com','uffe.carlson@gothamconsult.com') and subject like 'New enquiry · Call request'")=='2'
ok('call requests are saved as CRM contacts/deals with preferred time and email confirmations to the visitor and both staff')

st,err,_=call('/api/site-enquiry',{'type':'contact','name':'No consent','email':'no.consent@example.test','consent':False},ip='127.0.0.38')
assert st==400 and err['error']=='consent_required',err
ok('website contact information is stored only after explicit privacy consent')

# Lead capture still works with no consent, but notification is rejected; owner may pause alerts.
st,err,_=call('/api/chat-lead',{'name':'Another Client','contact':'another@example.test','need':'Advice','consent':False},ip='127.0.0.33')
assert st==400 and err['error']=='consent_required',err
st,_,_=call('/api/chat/prefs',{'enquiry_enabled':False},cookie=owner);assert st==200
st,off,_=call('/api/chat/prefs',cookie=owner);assert off['enquiry_enabled'] is False,off
before=psql("select count(*) from outbox where kind='staff_alert'")
st,body,_=call('/api/chat-lead',{'name':'Opted Out','contact':'off@example.test','need':'Web services','consent':True},ip='127.0.0.34')
assert st==200 and body['ok'],body
time.sleep(.2);assert psql("select count(*) from outbox where kind='staff_alert'")==before
ok('owner can pause enquiry emails without affecting lead capture')
srv.terminate();print('PASSED website enquiry email checks')
