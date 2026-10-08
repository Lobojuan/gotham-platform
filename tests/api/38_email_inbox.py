"""The private CRM inbox syncs mail and sends threaded replies through Gotham SMTP."""
import subprocess, time, json, os, urllib.request, urllib.error, atexit, threading, socketserver, sys
from http.server import BaseHTTPRequestHandler

DB=os.environ.get('TEST_DATABASE_URL','postgres://test@127.0.0.1:5439/gotham_test')
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
os.chdir(os.path.join(ROOT,'apps','crm'))
MAIL=[]
class SMTP(socketserver.StreamRequestHandler):
 def handle(self):
  send=lambda s:self.wfile.write((s+'\r\n').encode());send('220 mock ESMTP');data=None;rcpt=[]
  while True:
   line=self.rfile.readline()
   if not line:return
   cmd=line.decode(errors='replace').strip();up=cmd.upper()
   if data is not None:
    if cmd=='.':MAIL.append({'rcpt':rcpt,'data':'\n'.join(data)});data=None;rcpt=[];send('250 queued');continue
    data.append(cmd);continue
   if up.startswith('EHLO'):self.wfile.write(b'250-mock\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n')
   elif up.startswith('AUTH'):send('235 ok')
   elif up.startswith('MAIL'):send('250 ok')
   elif up.startswith('RCPT'):rcpt.append(cmd);send('250 ok')
   elif up=='DATA':data=[];send('354 go')
   elif up=='QUIT':send('221 bye');return
   else:send('250 ok')
class TS(socketserver.ThreadingMixIn,socketserver.TCPServer):allow_reuse_address=True;daemon_threads=True
smtp=TS(('127.0.0.1',2527),SMTP);threading.Thread(target=smtp.serve_forever,daemon=True).start()
RAW=(b'From: Nora Example <nora@example.test>\r\nTo: Uffe Carlson <uffe.carlson@gothamconsult.com>\r\nSubject: Synced from IMAP\r\nMessage-ID: <imap-test-1@example.test>\r\nDate: Thu, 08 Oct 2026 10:00:00 +0000\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nThis message arrived from the mocked IMAP mailbox.\r\n')
IMAP_COMMANDS=[]
class IMAP(socketserver.StreamRequestHandler):
 def handle(self):
  send=lambda s:self.wfile.write((s+'\r\n').encode());send('* OK IMAP4rev1 mock ready')
  while True:
   line=self.rfile.readline()
   if not line:return
   cmd=line.decode(errors='replace').strip();IMAP_COMMANDS.append(cmd);parts=cmd.split(' ',2);tag=parts[0];verb=parts[1].upper() if len(parts)>1 else ''
   if verb=='CAPABILITY':send('* CAPABILITY IMAP4rev1 AUTH=PLAIN AUTH=LOGIN UIDPLUS');send(tag+' OK capability')
   elif verb=='AUTHENTICATE':
    send('+')
    if not self.rfile.readline():return
    send(tag+' OK authenticated')
   elif verb=='LOGIN':send(tag+' OK authenticated')
   elif verb=='LIST':send('* LIST (\\HasNoChildren) "/" "INBOX"');send(tag+' OK list')
   elif verb=='NAMESPACE':send('* NAMESPACE (("" "/")) NIL NIL');send(tag+' OK namespace')
   elif verb=='SELECT' or verb=='EXAMINE':
    send('* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)');send('* 1 EXISTS');send('* 0 RECENT');send('* OK [UIDVALIDITY 2468] valid');send('* OK [UIDNEXT 2] next');send('* OK [PERMANENTFLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)] flags');send(tag+' OK [READ-ONLY] selected')
   elif verb=='UID':
    send('* 1 FETCH (UID 1 FLAGS () INTERNALDATE "08-Oct-2026 10:00:00 +0000" RFC822.SIZE %d BODY[] {%d}'%(len(RAW),len(RAW)))
    self.wfile.write(RAW+b')\r\n');send(tag+' OK fetch')
   elif verb=='FETCH':
    send(tag+' OK sequence fetch not expected')
   elif verb=='LOGOUT':send('* BYE logging out');send(tag+' OK logout');return
   else:send(tag+' OK completed')
imap=TS(('127.0.0.1',0),IMAP);threading.Thread(target=imap.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:4208'; ENV={'DATABASE_URL':DB,'SESSION_SECRET':'test-secret','PORT':'4208','NODE_ENV':'test','ADMIN_EMAIL':'admin','ADMIN_PASSWORD':'ownerpass123','ADMIN_NAME':'Admin','MEDIA_DIR':'/tmp/gotham-inbox-test','PUBLIC_URL':BASE,'SITE_URL':'http://example.org','SMTP_HOST':'127.0.0.1','SMTP_PORT':'2527','SMTP_USER':'uffe.carlson@gothamconsult.com','SMTP_PASS':'test-secret','SMTP_INSECURE_TEST':'1','IMAP_HOST':'127.0.0.1','IMAP_PORT':str(imap.server_address[1]),'IMAP_INSECURE_TEST':'1'}
srv=None
def call(path,data=None,method=None,cookie=None):
 req=urllib.request.Request(BASE+path,data=json.dumps(data).encode() if data is not None else None,method=method or ('POST' if data is not None else 'GET'),headers={'content-type':'application/json'})
 if cookie:req.add_header('cookie',cookie)
 try:
  r=urllib.request.urlopen(req,timeout=20);return r.status,json.loads(r.read() or b'{}'),r.headers
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read() or b'{}'),e.headers
def psql(sql):return subprocess.run(['psql',DB,'-qAtc',sql],capture_output=True,text=True,check=True).stdout.strip()
def ok(s):print('  ok',s)
srv=subprocess.Popen(['node','server.js'],env={**os.environ,**ENV},stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
for _ in range(70):
 try:
  if call('/api/health')[0]==200:break
 except Exception:pass
 time.sleep(.3)
else: print('NO START',srv.stdout.read()[:3000]);sys.exit(1)
atexit.register(lambda:srv.poll() is None and srv.terminate())
psql("update users set must_change=false")
st,_,h=call('/api/login',{'email':'admin','password':'ownerpass123'});assert st==200
ck=h['set-cookie'].split(';')[0]
st,new_staff,_=call('/api/users',{'name':'Door staff','email':'door','role':'staff'},method='POST',cookie=ck);assert st==200,new_staff
psql("update users set must_change=false where email='door'")
st,_,h=call('/api/login',{'email':'door','password':new_staff['password']});assert st==200
staff=h['set-cookie'].split(';')[0]

# Inbox and message bodies are private to admin accounts.
assert call('/api/inbox')[0]==401
assert call('/api/inbox/sync',{},cookie=None)[0]==401
assert call('/api/inbox',cookie=staff)[0]==401
ok('inbox and sync endpoints reject unauthenticated access')

psql("""insert into inbox_messages(message_id,from_email,from_name,to_email,subject,body_text,received_at,is_read)
 values ('<incoming-1@example.test>','client@example.test','Client Name','uffe.carlson@gothamconsult.com','A project question','Hello Gotham, please share the next steps.',now(),false)""")
st,listing,_=call('/api/inbox',cookie=ck);assert st==200 and listing['unread']==1 and len(listing['rows'])==1,listing
mid=listing['rows'][0]['id']
st,msg,_=call('/api/inbox/'+str(mid),cookie=ck);assert st==200 and msg['body_text'].startswith('Hello Gotham') and msg['is_read'] is True,msg
assert call('/api/inbox/'+str(mid))[0]==401
ok('admin sees the latest message and opening marks it read; staff and guests cannot read message content')

st,err,_=call('/api/inbox/'+str(mid)+'/reply',{'text':'A reply'},method='POST',cookie=None);assert st==401
st,err,_=call('/api/inbox/'+str(mid)+'/reply',{'text':'   '},method='POST',cookie=ck);assert st==400 and err['error']=='reply_length',err
st,out,_=call('/api/inbox/'+str(mid)+'/reply',{'text':'Thank you. We will send the next steps shortly.'},method='POST',cookie=ck)
assert st==200 and out['ok'] and MAIL, (st,out,MAIL)
sent=MAIL[-1]['data'].lower()
assert 'to: client@example.test' in sent and 'in-reply-to: <incoming-1@example.test>' in sent and 'thank you. we will send the next steps shortly.' in sent,sent
st,listing,_=call('/api/inbox',cookie=ck);assert len(listing['rows'])==2 and listing['rows'][0]['is_outgoing'] is True,listing
ok('admin can send a threaded SMTP reply, and the sent copy appears alongside the original in CRM')

st,synced,_=call('/api/inbox/sync',{},method='POST',cookie=ck)
assert st==200 and synced['ok'] and synced['imported']==1,(synced,IMAP_COMMANDS)
assert any(' UID FETCH ' in f' {cmd} ' for cmd in IMAP_COMMANDS),IMAP_COMMANDS
assert psql("select body_text from inbox_messages where message_id='<imap-test-1@example.test>'").startswith('This message arrived from the mocked IMAP mailbox.')
ok('IMAP sync parses a message, stores its plain-text body, and keeps it in the same mailbox view')
print('PASSED email inbox/reply checks')
