# Accounts: first-password change, own password change, owner adds/resets/disables/removes people
import subprocess, time, json, os, urllib.request, urllib.error, signal, sys, itertools
import os
DB=os.environ.get('TEST_DATABASE_URL','postgres://test@127.0.0.1:5439/gotham_test')
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
os.chdir(ROOT+'/apps/crm')
env=dict(os.environ); env.update({'DATABASE_URL':DB,'SESSION_SECRET':'t','PORT':'4199',
 'ADMIN_EMAIL':'Admin','ADMIN_PASSWORD':'Admin2025','ADMIN_NAME':'Admin','MEDIA_DIR':'/tmp/mediatest','PUBLIC_URL':'http://127.0.0.1:4199'})
srv=subprocess.Popen(['node','server.js'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
B='http://127.0.0.1:4199'; _ip=itertools.count(10)
def call(path,data=None,method=None,cookie=None):
    req=urllib.request.Request(B+path,data=json.dumps(data).encode() if data is not None else None,method=method or ('POST' if data is not None else 'GET'))
    req.add_header('content-type','application/json'); req.add_header('x-real-ip','10.6.%d.%d'%divmod(next(_ip),250))
    if cookie: req.add_header('cookie',cookie)
    try: r=urllib.request.urlopen(req,timeout=30); return r.status,json.loads(r.read() or b'{}'),r.headers
    except urllib.error.HTTPError as e: return e.code,json.loads(e.read() or b'{}'),e.headers
for _ in range(60):
    try:
        if call('/api/health')[0]==200: break
    except Exception: pass
    time.sleep(.4)
else: print(srv.stdout.read()[:2000]); sys.exit(1)
ok=lambda m: print('  ok',m)

def login(u,p):
    st,d,h=call('/api/login',{'email':u,'password':p}); return st,d,(h['set-cookie'].split(';')[0] if st==200 else None)

st,d,ck=login('Admin','Admin2025'); assert st==200 and d['must_change'] and d['role']=='owner'; ok('Admin / Admin2025 signs in (username is not case sensitive), told to choose a password')
st,d,_=call('/api/registrations',cookie=ck); assert st==401; ok('before choosing a password, the back office stays locked')
st,d,_=call('/api/me',cookie=ck); assert st==200 and d['must_change']; ok('/api/me still answers so the screen can ask for a new password')
st,d,_=call('/api/password',{'current':'wrong','password':'JoyGotham2026!'},cookie=ck); assert st==400 and d['error']=='wrong_current'; ok('wrong current password refused')
st,d,_=call('/api/password',{'current':'Admin2025','password':'short'},cookie=ck); assert d['error']=='too_short'; ok('short password refused')
st,d,_=call('/api/password',{'current':'Admin2025','password':'Admin2025'},cookie=ck); assert d['error'] in ('too_short','same_as_old'); ok('reusing the given password refused')
st,d,_=call('/api/password',{'current':'Admin2025','password':'1234567890'},cookie=ck); assert d['error']=='too_weak'; ok('1234567890 refused as too easy')
st,d,h=call('/api/password',{'current':'Admin2025','password':'JoyGotham2026!'},cookie=ck); assert st==200,d; ck2=h['set-cookie'].split(';')[0]
ok('password changed, new session cookie issued')
st,d,_=call('/api/registrations',cookie=ck2); assert st==200; ok('back office opens with the new session')
st,d,_=call('/api/registrations',cookie=ck); assert st==401; ok('the old session (e.g. another phone) is signed out')
st,d,_=login('admin','Admin2025')[:2] and login('admin','Admin2025'); assert st==401; ok('old password no longer works')
st,d,ck=login('ADMIN','JoyGotham2026!'); assert st==200 and not d['must_change']; ok('new password works')

# owner adds people
st,d,_=call('/api/users',{'name':'Kofi Door','email':'kofi','role':'staff'},cookie=ck); assert st==200 and len(d['password'])>=10; kpw=d['password']; ok('owner adds a staff sign-in with a username')
st,d,_=call('/api/users',{'name':'Kofi Again','email':'KOFI','role':'admin'},cookie=ck); assert st==409 and d['error']=='exists'; ok('same username again is refused, not silently ignored')
st,d,_=call('/api/users',{'name':'','email':'ama@gothamconsult.com','role':'admin'},cookie=ck); assert st==400 and d['error']=='name_required'; ok('name required')
st,d,_=call('/api/users',{'name':'Bad','email':'a b@@x','role':'admin'},cookie=ck); assert st==400 and d['error']=='bad_login_name'; ok('nonsense sign-in name refused')
st,d,_=call('/api/users',{'name':'Ama Owusu','email':'ama@gothamconsult.com','role':'admin'},cookie=ck); assert st==200; apw=d['password']; ok('owner adds an admin by email')
st,d,_=call('/api/users',{'name':'X','email':'x@y.com','role':'superuser'},cookie=ck); assert st==200 and d['role']=='staff'; ok('unknown role falls back to staff')

# the new person
st,d,kck=login('kofi',kpw); assert st==200 and d['must_change']; ok('new person signs in with the first password and must choose their own')
st,d,h=call('/api/password',{'current':kpw,'password':'kofi-door-2026'},cookie=kck); assert st==200,d; kck=h['set-cookie'].split(';')[0]; ok('they set their own password')
st,d,_=call('/api/users',{'name':'Sneaky','email':'sneaky','role':'owner'},cookie=kck); assert st==401; ok('staff cannot add people')
st,d,_=call('/api/users/kofi/reset',{},cookie=kck); assert st==401; ok('staff cannot reset passwords')
st,d,_=call('/api/users/admin',{'role':'staff'},method='PATCH',cookie=kck); assert st==401; ok('staff cannot change roles')
st,d,ack=login('ama@gothamconsult.com',apw); st,d,h=call('/api/password',{'current':apw,'password':'ama-pass-2026'},cookie=ack); ack=h['set-cookie'].split(';')[0]
st,d,_=call('/api/users',{'name':'Z','email':'z','role':'owner'},cookie=ack); assert st==401; ok('admin (not owner) cannot add people either')

# role change applies at once
st,d,_=call('/api/users/ama%40gothamconsult.com',{'role':'staff'},method='PATCH',cookie=ck); assert st==200
st,d,_=call('/api/settings',{'max_seats':'41'},cookie=ack); assert st==401,(st,d); ok('demoting admin to staff applies on their next click')
st,d,_=call('/api/users/ama%40gothamconsult.com',{'role':'admin'},method='PATCH',cookie=ck)
# disable ends the session immediately
st,d,_=call('/api/users/kofi',{'active':False},method='PATCH',cookie=ck); assert st==200
st,d,_=call('/api/registrations',cookie=kck); assert st==401; ok('turning access off signs them out immediately')
st,d,_=login('kofi','kofi-door-2026'); assert st==401; ok('and they cannot sign in again')
st,d,_=call('/api/users/kofi',{'active':True},method='PATCH',cookie=ck)
st,d,kck=login('kofi','kofi-door-2026'); assert st==200; ok('turning access back on restores it')
# reset
st,d,_=call('/api/users/kofi/reset',{},cookie=ck); assert st==200; npw=d['password']
st,d,_=call('/api/registrations',cookie=kck); assert st==401; ok('reset signs out their open sessions')
st,d,_=login('kofi','kofi-door-2026'); assert st==401; st,d,kck=login('kofi',npw); assert st==200 and d['must_change']; ok('reset password works once and forces a new choice')
# remove
st,d,_=call('/api/users/kofi',method='DELETE',cookie=ck); assert st==200
st,d,_=call('/api/me',cookie=kck); assert st==401; ok('removing someone ends their session at once')
st,d,_=call('/api/users/admin',method='DELETE',cookie=ck); assert st==400 and d['error']=='not_yourself'; ok('an owner cannot remove themselves')
st,d,_=call('/api/users',cookie=ck); assert [u['email'] for u in d['rows']]==['admin','ama@gothamconsult.com','x@y.com'],d; assert 'pw_hash' not in json.dumps(d); ok('team list correct, no password hashes exposed')
st,d,_=call('/api/data-health',cookie=ck) if False else (0,0,0)
srv.send_signal(signal.SIGTERM); time.sleep(.5)
print('\nALL ACCOUNT TESTS PASSED')
