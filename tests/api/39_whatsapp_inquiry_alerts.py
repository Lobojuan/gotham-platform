"""Website service enquiries notify the configured Gotham WhatsApp team numbers."""
import subprocess, time, json, os, urllib.request, urllib.error, atexit, threading, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

DB=os.environ.get('TEST_DATABASE_URL','postgres://test@127.0.0.1:5439/gotham_test')
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
os.chdir(os.path.join(ROOT,'apps','crm'))
BASE='http://127.0.0.1:4219'; WA=[]
class API(BaseHTTPRequestHandler):
 def log_message(self,*a): pass
 def do_POST(self):
  WA.append(json.loads(self.rfile.read(int(self.headers['content-length']))))
  raw=json.dumps({'messages':[{'id':'wamid.%d'%len(WA)}]}).encode()
  self.send_response(200);self.send_header('content-type','application/json');self.end_headers();self.wfile.write(raw)
api=HTTPServer(('127.0.0.1',4299),API);threading.Thread(target=api.serve_forever,daemon=True).start()
env={**os.environ,'DATABASE_URL':DB,'SESSION_SECRET':'test-secret','PORT':'4219','NODE_ENV':'test',
 'ADMIN_EMAIL':'owner','ADMIN_PASSWORD':'ownerpass123','ADMIN_NAME':'Uffe Carlson','MEDIA_DIR':'/tmp/gotham-wa-alert-test',
 'PUBLIC_URL':BASE,'SITE_URL':'http://example.org','WHATSAPP_TOKEN':'wa-test','WHATSAPP_PHONE_ID':'123',
 'WHATSAPP_API_BASE':'http://127.0.0.1:4299'}
os.makedirs('/tmp/gotham-wa-alert-test',exist_ok=True)
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

# The two agreed service lines are prefilled, while delivery remains dependent on Meta setup.
st,prefs,_=call('/api/chat/prefs',cookie=owner)
assert st==200 and prefs['wa_inquiry_numbers']=='+233550416627, +233552395548' and prefs['wa_inquiry_enabled'] is True and prefs['wa_ready'] is True,prefs
st,err,_=call('/api/chat/prefs',{'wa_inquiry_numbers':'+233550416627, not-a-number'},cookie=owner)
assert st==400 and err['error']=='bad_alert_numbers',err
st,saved,_=call('/api/chat/prefs',{'wa_inquiry_template':'team_mention','wa_inquiry_numbers':prefs['wa_inquiry_numbers'],'wa_inquiry_enabled':True},cookie=owner)
assert st==200 and saved['ok'],saved
ok('owner can review and save the two team recipients and approved-template name; invalid numbers are rejected')

# A real consented website follow-up queues and delivers a privacy-minimised alert to both numbers.
st,body,_=call('/api/chat-lead',{'name':'Kwesi Client','company':'Nordic Sun','contact':'kwesi.client@example.test',
 'need':'Market entry for a solar project','consent':True},ip='127.0.0.32')
assert st==200 and body['ok'],body
for _ in range(50):
 if len(WA)>=2:break
 time.sleep(.1)
assert len(WA)==2,WA
assert {m['to'] for m in WA}=={'233550416627','233552395548'},WA
for m in WA:
 assert m['type']=='template' and m['template']['name']=='team_mention',m
 params=[p['text'] for p in m['template']['components'][0]['parameters']]
 assert params[0]=='New Gotham enquiry' and 'Website chat enquiry' in params[1] and 'Nordic Sun' in params[1],params
 assert 'solar project' in params[2].lower() and 'kwesi.client@example.test' not in json.dumps(m) and '024' not in json.dumps(m),m
assert psql("select count(*) from msg_outbox where kind='team_inquiry' and status='sent'")=='2'
ok('a consented service enquiry sends one internal, privacy-minimised WhatsApp template alert to each recipient')

# Alerts are opt-out configurable and the public form still rejects missing consent.
st,err,_=call('/api/chat-lead',{'name':'Another Client','contact':'another@example.test','need':'Advice','consent':False},ip='127.0.0.33')
assert st==400 and err['error']=='consent_required',err
st,_,_=call('/api/chat/prefs',{'wa_inquiry_enabled':False},cookie=owner);assert st==200
st,off,_=call('/api/chat/prefs',cookie=owner);assert off['wa_inquiry_enabled'] is False,off
before=len(WA)
st,body,_=call('/api/chat-lead',{'name':'Opted Out','contact':'off@example.test','need':'Web services','consent':True},ip='127.0.0.34')
assert st==200 and body['ok'],body
time.sleep(.3);assert len(WA)==before,WA
ok('visitors must consent; owner can pause WhatsApp alerts without affecting lead capture')
srv.terminate();api.shutdown();print('PASSED WhatsApp enquiry alert checks')
