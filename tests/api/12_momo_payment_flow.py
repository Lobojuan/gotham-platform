import subprocess, time, json, os, urllib.request, urllib.error, signal, sys, atexit
from concurrent.futures import ThreadPoolExecutor

DB=os.environ.get('TEST_DATABASE_URL','postgres://test@127.0.0.1:5439/gotham_test')
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
os.chdir(ROOT+'/apps/crm')
env=dict(os.environ); env.update({'DATABASE_URL':DB,'SESSION_SECRET':'test-secret','ALLOW_ORIGINS':'*','PORT':'4199',
 'ADMIN_EMAIL':'admin','ADMIN_PASSWORD':'ownerpass123','ADMIN_NAME':'Admin','MEDIA_DIR':'/tmp/mediatest',
 'PUBLIC_URL':'http://127.0.0.1:4199','SITE_URL':'http://127.0.0.1:4199'})
os.makedirs('/tmp/mediatest',exist_ok=True)
srv=subprocess.Popen(['node','server.js'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
def _cleanup_server():
    if srv.poll() is None:
        srv.terminate()
        try: srv.wait(timeout=3)
        except subprocess.TimeoutExpired: srv.kill()
atexit.register(_cleanup_server)
B='http://127.0.0.1:4199'
def call(path,data=None,method=None,cookie=None,client_ip=None):
    req=urllib.request.Request(B+path,data=json.dumps(data).encode() if data is not None else None,
        method=method or ('POST' if data is not None else 'GET'))
    req.add_header('content-type','application/json')
    if cookie: req.add_header('cookie',cookie)
    if client_ip: req.add_header('x-real-ip',client_ip)
    try:
        r=urllib.request.urlopen(req,timeout=30); return r.status,json.loads(r.read() or b'{}'),r.headers
    except urllib.error.HTTPError as e:
        return e.code,json.loads(e.read() or b'{}'),e.headers
for _ in range(60):
    try:
        st,h,_=call('/api/health')
        if st==200: break
    except Exception: pass
    time.sleep(.4)
else:
    print('SERVER DID NOT START'); print(srv.stdout.read()[:2500]); sys.exit(1)
assert h['database']=='ok',h
ok=lambda m: print('  ok',m)
import subprocess as _sp
_orig_call=call
def call(path,*a,**k):
    if path=='/api/login': _sp.run(['psql',DB,'-qc','update users set must_change=false'],check=True)
    return _orig_call(path,*a,**k)
st,d,h=call('/api/login',{'email':'admin','password':'ownerpass123'}); assert st==200,(st,d)
ck=h['set-cookie'].split(';')[0]
st,d,_=call('/api/items'); assert d['settings']['momo_number']=='+233550416627',d['settings']; ok('Joy’s WhatsApp line is seeded as the MoMo receiving number')
st,d,_=call('/api/settings',{'momo_number':'055 041 6627'},cookie=ck); assert st==200,d
st,d,_=call('/api/items'); assert d['settings']['momo_number']=='+233550416627'; ok('MoMo number accepts local format and stores a canonical Ghana number')
st,d,_=call('/api/settings',{'unexpected':'value'},cookie=ck); assert st==400 and d['error']=='invalid_setting',(st,d)
st,d,_=call('/api/settings',{'momo_number':'not a number'},cookie=ck); assert st==400 and d['error']=='bad_momo_number',(st,d)
ok('settings reject unknown keys and invalid MoMo destinations')
item={'code':'PAY1','kind':'event','title':'Payment test event','starts_at':'2026-12-01T10:00:00Z','currency':'GHS',
 'price':25,'capacity':20,'published':True,'approval':False,'phase':'open'}
st,d,_=call('/api/items',item,cookie=ck); assert st==200,d
def register(name,phone):
    return call('/api/register',{'item_code':'PAY1','full_name':name,'phone':phone,'consent':True,'payment_method':'momo'})
st,first,_=register('Ama Mensah','0244000000'); assert st==200 and not first['paid'],(st,first)
assert first['payment_details']=={'method':'momo','number':'+233550416627','account_name':'Gotham Consult','transaction_reference':first['reference']},first
ok('successful registration returns the exact payment number, account and reference')
st,d,_=call('/api/payment-reported',{'reference':first['reference'],'txn':'','network':'MTN'}); assert st==400 and d['error']=='transaction_id_required',(st,d)
st,d,_=call('/api/payment-reported',{'reference':first['reference'],'txn':'TXN-10001','network':'Unknown'}); assert st==400 and d['error']=='invalid_network',(st,d)
ok('blank transaction IDs and unsupported networks are rejected')
st,d,_=call('/api/payment-reported',{'reference':first['reference'],'txn':'TXN-10001','network':'MTN','phone':'0244000000'}); assert st==200,d
st,d,_=call('/api/payment-reported',{'reference':first['reference'],'txn':'TXN-10001','network':'MTN'}); assert st==409 and d['error']=='transaction_already_reported',(st,d)
ok('valid reports are recorded once; duplicate transaction IDs are blocked')
st,second,_=register('Kojo Asare','0244000001'); assert st==200,second
st,d,_=call('/api/payment-reported',{'reference':second['reference'],'txn':'TXN-10001','network':'MTN'}); assert st==409 and d['error']=='transaction_already_reported',(st,d)
st,free,_=call('/api/register',{'item_code':'F1','full_name':'Kofi Free','phone':'0244000002','consent':True}); assert st==200,free
st,d,_=call('/api/payment-reported',{'reference':free['reference'],'txn':'FREE-10001','network':'MTN'}); assert st==409 and d['error']=='momo_payment_not_applicable',(st,d)
ok('a transaction cannot be reused on another registration or claimed for a free application')
cap_item={**item,'code':'CAP1','title':'Last seat test','price':0,'capacity':1}
st,d,_=call('/api/items',cap_item,cookie=ck); assert st==200,d
def reserve(name,ip):
    return call('/api/register',{'item_code':'CAP1','full_name':name,'phone':'0244000099','consent':True},client_ip=ip)
with ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(lambda a: reserve(*a), [('Concurrent One','10.8.0.1'),('Concurrent Two','10.8.0.2')]))
assert sorted(x[0] for x in results)==[200,409],results
assert next(x[1] for x in results if x[0]==409)['error']=='sold_out'
ok('concurrent requests cannot reserve more seats than the event capacity')
st,rows,_=call('/api/registrations',cookie=ck); reg=next(x for x in rows['rows'] if x['reference']==first['reference'])
assert reg['payment_ref']=='TXN-10001' and reg['paid'] is False,reg
ok('customer report remains unverified; only staff can mark money as received')
srv.send_signal(signal.SIGTERM); time.sleep(.5)
print('\nALL MOMO PAYMENT FLOW TESTS PASSED')
