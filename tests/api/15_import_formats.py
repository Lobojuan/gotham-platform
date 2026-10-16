# Importing client lists in every common format: Outlook CSV (semicolons, Windows-1252, a note with a line break),
# Google Contacts CSV, vCard 2.1/3.0 from phones, JSON from other systems, old Excel .xls, LibreOffice .ods,
# UTF-16 text from Excel, headerless pasted rows, Google Sheets links. Also: import-wide defaults (client type,
# country, language, tags, consent with a recorded reason), dry runs, opt-outs respected, no duplicates.
import subprocess, time, json, os, base64, urllib.request, urllib.error, sys, atexit
DB = os.environ.get('TEST_DATABASE_URL', 'postgres://test@127.0.0.1:5439/gotham_test')
TEST_PORT = int(os.environ.get('TEST_PORT', '4199'))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(os.path.join(ROOT, 'apps', 'crm'))
env = dict(os.environ); env.update({'DATABASE_URL': DB, 'SESSION_SECRET': 't', 'PORT': str(TEST_PORT), 'ADMIN_EMAIL': 'admin', 'ADMIN_PASSWORD': 'ownerpass123',
    'ADMIN_NAME': 'Admin', 'MEDIA_DIR': '/tmp/mediatest', 'PUBLIC_URL': f'http://127.0.0.1:{TEST_PORT}', 'SITE_URL': 'http://example.org'})
os.makedirs('/tmp/mediatest', exist_ok=True)
srv = subprocess.Popen(['node', 'server.js'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
atexit.register(lambda: srv.poll() is None and srv.terminate())
B = f'http://127.0.0.1:{TEST_PORT}'
def call(path, data=None, method=None, cookie=None):
    req = urllib.request.Request(B + path, data=json.dumps(data).encode() if data is not None else None, method=method or ('POST' if data is not None else 'GET'))
    req.add_header('content-type', 'application/json')
    if cookie: req.add_header('cookie', cookie)
    try:
        r = urllib.request.urlopen(req, timeout=120); return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b or b'{}')
        except Exception: return e.code, b[:300]
for _ in range(60):
    try:
        if call('/api/health')[0] == 200: break
    except Exception: pass
    time.sleep(0.4)
else: print('NO START'); print(srv.stdout.read()[:3000]); sys.exit(1)
def psql(sql): return subprocess.run(['psql', DB, '-qAtc', sql], capture_output=True, text=True, check=True).stdout.strip()
ok = lambda m: print('  ok', m)
psql('update users set must_change=false')
st, _ = call('/api/login', {'email': 'admin', 'password': 'ownerpass123'})
req = urllib.request.Request(B + '/api/login', data=json.dumps({'email': 'admin', 'password': 'ownerpass123'}).encode(), method='POST'); req.add_header('content-type', 'application/json')
ck = urllib.request.urlopen(req).headers['set-cookie'].split(';')[0]
b64 = lambda raw: base64.b64encode(raw).decode()
def inspect(name, raw): return call('/api/contacts/inspect', {'name': name, 'data': b64(raw)}, cookie=ck)
def imp(name, raw, **kw): return call('/api/contacts/import-sheet', {'name': name, 'data': b64(raw), 'source': kw.pop('source', 'test list ' + name), **kw}, cookie=ck)
def contact(where): 
    rows = call('/api/contacts', cookie=ck)[1]['rows']; hit = [c for c in rows if where(c)]; return hit[0] if hit else None
def colmap(sh): return {sh['columns'][int(k)]: v for k, v in sh['mapping'].items()}

# ---------- 1. Outlook CSV: semicolons, Windows-1252, note over two lines ----------
outlook = ('Title;First Name;Last Name;Company;Job Title;Business Phone;Mobile Phone;E-mail Address;Business City;Business Country/Region;Categories;Notes\r\n'
    'Mr.;Søren;Ørsted;Nordic Wind ApS;CEO;+45 33 12 34 56;+45 20 11 22 33;soren@nordicwind.example;København;DK;\"Investors; Energy\";"Met in Accra,\r\nwants a site visit"\r\n'
    'Ms.;Adwoa;Boateng;Volta Foods Ltd;Finance Director;0302 123456;024 555 1234;ADWOA@voltafoods.example;Accra;Ghana;;\r\n').encode('cp1252')
st, d = inspect('outlook-export.csv', outlook); assert st == 200, d
sh = d['sheets'][0]; m = colmap(sh)
assert sh['rows'] == 2 and m == {'First Name': 'first_name', 'Last Name': 'last_name', 'Company': 'company', 'Job Title': 'role', 'Mobile Phone': 'phone',
    'E-mail Address': 'email', 'Business City': 'city', 'Business Country/Region': 'country', 'Categories': 'tags', 'Notes': 'notes'}, m
ok('Outlook CSV: semicolons and Windows-1252 read, columns mapped (mobile before business phone, job title not "Title")')
st, d = imp('outlook-export.csv', outlook, dry=True); assert st == 200 and d['dry'] and d['added'] == 2 and d['updated'] == 0, d
assert psql('select count(*) from contacts') == '0'
ok('dry run says 2 new and saves nothing')
st, d = imp('outlook-export.csv', outlook, client_type='investor'); assert st == 200 and d['added'] == 2, d
s = contact(lambda c: c['email'] == 'soren@nordicwind.example')
assert s['full_name'] == 'Søren Ørsted' and s['company'] == 'Nordic Wind ApS' and s['role'] == 'CEO' and s['phone'] == '+4520112233', s
assert s['city'] == 'København' and s['country'] == 'Denmark' and s['tags'] == 'investors,energy' and 'site visit' in s['notes'], s
assert s['client_type'] == 'investor' and s['consent_email'] == 'unknown' and s['extra'].get('Business Phone') == '+45 33 12 34 56', s
a = contact(lambda c: c['email'] == 'adwoa@voltafoods.example')
assert a['phone'] == '+233245551234' and a['country'] == 'Ghana', a
ok('names joined, Danish letters kept, DK → Denmark, tags split, Ghana number normalised, business phone kept as extra detail')
st, d = imp('outlook-export.csv', outlook, dry=True); assert d['added'] == 0 and d['updated'] == 2, d
st, d = imp('outlook-export.csv', outlook); assert d['added'] == 0 and d['updated'] == 2 and psql('select count(*) from contacts') == '2', d
ok('importing it again updates, no duplicates (dry run agrees)')

# ---------- 2. Google Contacts CSV (UTF-8 with BOM) + defaults with consent ----------
google = ('﻿Name,Given Name,Family Name,Organization 1 - Name,Organization 1 - Title,E-mail 1 - Type,E-mail 1 - Value,Phone 1 - Type,Phone 1 - Value,Group Membership\n'
    'Kofi Annan-Mensah,Kofi,Annan-Mensah,Accra Logistics,COO,* Work,kofi@acclog.example,Mobile,0201234567,* myContacts ::: Clients\n'
    'Jean Dupont,Jean,Dupont,Paris Capital SAS,Partner,* Work,jean@pariscap.example,Mobile,+33 6 12 34 56 78,* myContacts\n').encode('utf-8')
st, d = inspect('contacts.csv', google); m = colmap(d['sheets'][0])
assert m['Name'] == 'full_name' and m['Organization 1 - Name'] == 'company' and m['Organization 1 - Title'] == 'role' and m['E-mail 1 - Value'] == 'email' \
    and m['Phone 1 - Value'] == 'phone' and m['Group Membership'] == 'tags', m
ok('Google Contacts CSV mapped')
st, d = imp('contacts.csv', google, consent_email='yes'); assert st == 400 and d['error'] == 'consent_source_required', d
ok('saying "they agreed" without saying how is refused')
st, d = imp('contacts.csv', google, consent_email='yes', consent_source='Signed up at the Gotham investor breakfast, 12 Sep 2026', client_type='corporate', country='Ghana', tags='breakfast-2026')
assert st == 200 and d['added'] == 2 and d['consent_yes'] == 2, d
k = contact(lambda c: c['email'] == 'kofi@acclog.example')
assert k['consent_email'] == 'yes' and 'investor breakfast' in k['consent_source'] and k['consent_at'] and k['consent_sms'] == 'unknown', k
assert k['tags'] == 'breakfast-2026,clients' and k['client_type'] == 'corporate' and k['phone'] == '+233201234567', k
j = contact(lambda c: c['email'] == 'jean@pariscap.example'); assert j['phone'] == '+33612345678' and j['tags'] == 'breakfast-2026', j
ok('defaults for every row: client type, country, tags, email consent with its reason; Google group labels become tags')

# ---------- 3. vCard 3.0 and 2.1 (quoted-printable) from phones ----------
vcf = ('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ama Serwaa\r\nN:Serwaa;Ama;;;\r\nORG:Serwaa Mining Services;\r\nTITLE:Managing Director\r\n'
    'EMAIL;TYPE=INTERNET,WORK:ama@serwaamining.example\r\nTEL;TYPE=CELL:+233 24 400 1122\r\nTEL;TYPE=WORK:030 222 3344\r\n'
    'ADR;TYPE=WORK:;;12 Liberation Rd;Accra;;;Ghana\r\nCATEGORIES:Mining,Tier A\r\nNOTE:Prefers WhatsApp\\, mornings\r\nEND:VCARD\r\n'
    'BEGIN:VCARD\r\nVERSION:2.1\r\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=C3=98stergaard;Mette;;;\r\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Mette =C3=98stergaard\r\n'
    'ORG:Danida Business\r\nTEL;CELL:+4540506070\r\nEMAIL;PREF;INTERNET:mette@danida.example\r\nEND:VCARD\r\n').encode()
st, d = inspect('contacts.vcf', vcf); sh = d['sheets'][0]; m = colmap(sh)
assert d['kind'] == 'vcf' and sh['rows'] == 2 and m['Name'] == 'full_name' and m['Company'] == 'company' and m['Mobile'] == 'phone' and m['Email'] == 'email' and m['Categories'] == 'tags', (d['kind'], m)
st, d = imp('contacts.vcf', vcf, client_type='international'); assert d['added'] == 2, d
v = contact(lambda c: c['email'] == 'ama@serwaamining.example')
assert v['full_name'] == 'Ama Serwaa' and v['role'] == 'Managing Director' and v['phone'] == '+233244001122' and v['city'] == 'Accra' and v['country'] == 'Ghana', v
assert v['tags'] == 'mining,tier-a' and v['notes'] == 'Prefers WhatsApp, mornings' and v['extra'].get('Other phone') == '030 222 3344', v
mt = contact(lambda c: c['email'] == 'mette@danida.example'); assert mt['full_name'] == 'Mette Østergaard' and mt['country'] is None and mt['client_type'] == 'international', mt
ok('vCards read (3.0 and quoted-printable 2.1); international contact without a country is not assumed to be in Ghana')

# ---------- 4. JSON from another system ----------
js = json.dumps({'data': [
    {'name': 'Claire Martin', 'email': 'claire@lyonenergie.example', 'company': {'name': 'Lyon Énergie'}, 'phone': '+33 7 11 22 33 44',
     'country': 'france', 'language': 'French', 'type': 'International client', 'whatsapp_opt_in': 'yes', '__proto__': {'polluted': 1}},
    {'name': 'Yaw Darko', 'email': 'not-an-email', 'company': {'name': 'Darko Farms'}, 'phone': '0555123456', 'country': 'GH', 'language': 'en', 'type': 'SME', 'tags': ['agri', 'north']}
]}).encode()
st, d = inspect('export.json', js); sh = d['sheets'][0]; m = colmap(sh)
assert d['kind'] == 'json' and m.get('company.name') == 'company' and m.get('whatsapp_opt_in') == 'consent_whatsapp' and m.get('type') == 'client_type', m
st, d = imp('export.json', js); assert d['added'] == 2 and d['email_unreadable'] == 1, d
c = contact(lambda c: c['email'] == 'claire@lyonenergie.example')
assert c['company'] == 'Lyon Énergie' and c['country'] == 'France' and c['language'] == 'fr' and c['client_type'] == 'international', c
assert c['consent_whatsapp'] == 'yes' and 'whatsapp_opt_in' in c['consent_source'] and c['consent_email'] == 'unknown', c
y = contact(lambda c: c['full_name'] == 'Yaw Darko')
assert y['email'] is None and y['extra'].get('Email as given') == 'not-an-email' and y['client_type'] == 'sme' and y['country'] == 'Ghana' and y['tags'] == 'agri,north', y
assert psql("select count(*) from contacts where extra ? 'polluted'") == '0'
ok('JSON: nested company name, consent column (reason recorded as the column), bad email kept aside, row not lost')

# ---------- 5. old Excel .xls and LibreOffice .ods ----------
gen = r"""
const X=require('xlsx');
const rows=[['Client','Contact person','Email','Phone','Client type','Country','Email consent','Unsubscribed'],
 ['Tema Port Services','Kwesi Owusu','kwesi@temaport.example','0244 777 888','Corporate','Ghana','Yes',''],
 ['Lagos Trade House','Ngozi Eze','ngozi@lagostrade.example','+234 803 123 4567','International','Nigeria','Yes','Yes'],
 ['Cape Coast Hotels','Esi Arthur','esi@cchotels.example','0209998877','SME','GH','','']];
for (const t of ['xls','ods']) { const wb=X.utils.book_new(); X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(rows),'Clients'); X.writeFile(wb,'/tmp/gotham-fixture.'+t,{bookType:t}); }
"""
subprocess.run(['node', '-e', gen], check=True)
xls = open('/tmp/gotham-fixture.xls', 'rb').read(); ods = open('/tmp/gotham-fixture.ods', 'rb').read()
st, d = inspect('clients.xls', xls); assert st == 200 and d['kind'] == 'xls', d
m = colmap(d['sheets'][0]); assert m['Client'] == 'company' and m['Contact person'] == 'full_name' and m['Email consent'] == 'consent_email' and m['Unsubscribed'] == 'opt_out' and m['Email'] == 'email', m
st, d = imp('clients.xls', xls); assert d['added'] == 3 and d['opted_out'] == 1, d
kw = contact(lambda c: c['email'] == 'kwesi@temaport.example'); ng = contact(lambda c: c['email'] == 'ngozi@lagostrade.example')
assert kw['consent_email'] == 'yes' and kw['phone'] == '+233244777888' and kw['client_type'] == 'corporate', kw
assert ng['consent_email'] == 'no' and ng['consent_sms'] == 'no' and ng['consent_whatsapp'] == 'no' and ng['status'] == 'do_not_contact', ng
ok('.xls read; an "Unsubscribed" column wins over "Email consent" and marks every channel no')
st, d = inspect('clients.ods', ods); assert st == 200 and d['kind'] == 'ods' and d['sheets'][0]['rows'] == 3, d
st, d = imp('clients.ods', ods, dry=True); assert d['added'] == 0 and d['updated'] == 2 and d['left_alone'] == 1, d
ok('.ods read; the same people are recognised (2 to update, 1 opted out left alone)')

# ---------- 6. existing contacts: never flip a no, keep their tags ----------
psql("update contacts set tags='brief,vip', consent_email='no' where email='kofi@acclog.example'")
psql("update contacts set tags='brief' where email='kwesi@temaport.example'")
st, d = imp('clients.ods', ods, consent_email='yes', consent_sms='yes', consent_source='Existing clients who asked for news', tags='q4')
kw = contact(lambda c: c['email'] == 'kwesi@temaport.example'); assert kw['tags'] == 'brief,q4' and kw['consent_sms'] == 'yes' and kw['consent_email'] == 'yes', kw
ng = contact(lambda c: c['email'] == 'ngozi@lagostrade.example'); assert ng['consent_email'] == 'no' and ng['consent_sms'] == 'no', ng
st, d = imp('contacts.csv', google, consent_email='yes', consent_source='again')
k = contact(lambda c: c['email'] == 'kofi@acclog.example'); assert k['consent_email'] == 'no' and set(k['tags'].split(',')) >= {'brief', 'vip', 'clients'}, k
ok('re-import adds tags instead of replacing them; a recorded "no" never becomes "yes"; opted-out people untouched')

# ---------- 7. UTF-16 text from Excel ("Unicode Text"), WhatsApp column ----------
u16 = '﻿Company\tName\tEmail\tWhatsApp\nAbidjan Cocoa SA\tAya Koné\taya@abidjancocoa.example\t+225 07 01 02 03 04\n'.encode('utf-16-le')
st, d = inspect('unicode.txt', u16); m = colmap(d['sheets'][0]); assert m == {'Company': 'company', 'Name': 'full_name', 'Email': 'email', 'WhatsApp': 'whatsapp'}, m
imp('unicode.txt', u16); ay = contact(lambda c: c['email'] == 'aya@abidjancocoa.example'); assert ay['full_name'] == 'Aya Koné' and ay['whatsapp'] == '+2250701020304', ay
ok('UTF-16 tab-separated text read, WhatsApp number stored separately')

# ---------- 8. pasted rows with no header: guessed from the values ----------
paste = 'Ashanti Gold Traders, Kojo Mensah, kojo@agt.example, 0244 123 456\nKumasi Textiles, Abena Osei, abena@kt.example, 0277 654 321\n'
st, d = call('/api/contacts/inspect', {'text': paste}, cookie=ck); sh = d['sheets'][0]
assert sh['rows'] == 2 and sh['columns'][:4] == ['Column A', 'Column B', 'Column C', 'Column D'] and colmap(sh) == {'Column C': 'email', 'Column D': 'phone'}, sh
st, d = call('/api/contacts/import-sheet', {'text': paste, 'source': 'pasted from WhatsApp group', 'mapping': {'0': 'company', '1': 'full_name', '2': 'email', '3': 'phone', '4': 'password'}}, cookie=ck)
assert d['added'] == 2, d
kt = contact(lambda c: c['email'] == 'abena@kt.example'); assert kt['company'] == 'Kumasi Textiles' and kt['phone'] == '+233277654321' and kt['source'] == 'pasted from WhatsApp group', kt
ok('headerless paste: email and phone found from the values; your mapping fills the rest; unknown fields ignored')

# ---------- 9. same person twice in one file, phone-only match ----------
dup = 'Company,Name,Email,Phone\nDup Co,Efo Kwami,efo@dup.example,0244999000\nDup Co,Efo Kwami,efo@dup.example,0244999000\nPhone Only Ltd,Mawuli,,0244999111\n'.encode()
st, d = imp('dup.csv', dup, dry=True); assert d['added'] == 2 and d['updated'] == 1, d
imp('dup.csv', dup); assert psql("select count(*) from contacts where email='efo@dup.example'") == '1'
st, d = imp('dup2.csv', 'Name,Mobile,Email\nMawuli Agbeko,+233 24 499 9111,mawuli@phone.example\n'.encode())
assert d['updated'] == 1 and psql("select email from contacts where phone='+233244999111'") == 'mawuli@phone.example', d
ok('duplicates inside a file merge; a later list with an email finds the phone-only contact')

# ---------- 10. Google Sheets links and bad files ----------
st, d = call('/api/contacts/inspect', {'url': 'https://evil.example/spreadsheets/d/abcdefghijklmnopqrstuvwxyz'}, cookie=ck); assert st == 400 and d['error'] == 'bad_link', d
st, d = call('/api/contacts/inspect', {'url': 'https://docs.google.com.evil.example/spreadsheets/d/abcdefghijklmnopqrstuvwxyz'}, cookie=ck); assert st == 400 and d['error'] == 'bad_link', d
st, d = inspect('broken.xlsx', b'PK\x03\x04garbage'); assert st == 400, d
st, d = inspect('empty.csv', b'\n\n'); assert st == 400 and d['error'] == 'no_table_found', d
st, d = call('/api/contacts/import-sheet', {'name': 'x.csv', 'data': b64(dup)}, cookie=ck); assert st == 400 and d['error'] == 'source_required', d
ok('only real Google Sheets links are fetched; broken and empty files give a clear error; source still required')
assert int(psql("select count(*) from audit_log where action='contacts_import'")) >= 9
ok('every import is in the audit log')
print('\nALL IMPORT FORMAT TESTS PASSED')
