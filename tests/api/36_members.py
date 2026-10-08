"""Members: a free account by emailed link, preferences, companies and their deadlines, paid plans through normal cedi
invoices, bookings that become tasks, the Pro data pack, the weekly digest and the back-office dashboard."""
import os, sys, json, re, subprocess, http.client, urllib.parse
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ok = lambda m: print('  ok', m)

# 1. the calendar engine on its own
code = r'''
import assert from 'node:assert/strict';
import {deadlines} from './apps/crm/members.js';
const d=deadlines({has_employees:true,vat_registered:true,foreign_staff:true,year_end_month:12,permits:[{name:'Work permit',expires:'2027-01-20',lead_days:60}]},new Date('2026-10-07T00:00:00Z'),120);
const at=(k,due)=>d.some(x=>x.key===k&&x.due===due);
assert.ok(at('ssnit','2026-10-14')&&at('paye','2026-10-15')&&at('vat','2026-10-30'),'monthly dates');
assert.ok(at('paye','2026-11-13'),'15 Nov 2026 is a Sunday: the reminder moves to Friday 13th');
assert.ok(at('cit_provisional','2026-12-31')&&at('quota_return','2027-01-15')&&at('renew:Work permit','2026-11-21'),'quarterly, yearly and permit dates');
assert.ok(d.every(x=>x.key.startsWith('renew:')||x.key.startsWith('expires:')||x.source_url.startsWith('https://')),'every rule has its official source');
const n=deadlines({has_employees:false,vat_registered:false,year_end_month:6},new Date('2026-10-07T00:00:00Z'),120);
assert.ok(!n.some(x=>['paye','ssnit','vat'].includes(x.key))&&n.some(x=>x.key==='cit_annual'&&x.due==='2026-10-31'),'only what applies; June year end → annual return 31 October');
console.log('  ok deadlines: monthly, weekend moves, quarterly, yearly, permits, only what applies, each with its source');
'''
subprocess.run(['node', '--input-type=module', '-e', code], cwd=ROOT, check=True)

# 1b. the back-office page script must parse (a duplicate declaration once stopped the whole back office loading)
_html = open(os.path.join(ROOT, 'apps/crm/public/admin.html')).read()
_js = '\n;\n'.join(re.findall(r'<script(?![^>]*src)[^>]*>(.*?)</script>', _html, re.S))
open('/tmp/_admin_check.js', 'w').write(_js)
subprocess.run(['node', '--check', '/tmp/_admin_check.js'], check=True)
print('  ok back-office script parses')

# 2. the server
exec(open(os.path.join(os.path.dirname(__file__), '07_family_desk.py')).read().split("ok=lambda m: print('  ok',m)")[0])
ok = lambda m: print('  ok', m)
import subprocess as _sp
psql = lambda sql: _sp.run(['psql', DB, '-tAc', sql], capture_output=True, text=True).stdout.strip()
def raw(path, cookie=None, method='GET', body=None):
    c = http.client.HTTPConnection('127.0.0.1', 4199, timeout=15); h = {'x-real-ip': '10.7.0.1', 'content-type': 'application/json'}
    if cookie: h['cookie'] = cookie
    c.request(method, path, body=json.dumps(body) if body is not None else None, headers=h); r = c.getresponse(); return r.status, {k.lower(): v for k, v in r.getheaders()}, r.read()
assert call('/api/member/signup', {'email': 'ama@co.test', 'consent': False})[0] == 400, 'consent needed'
st, b, _ = call('/api/member/signup', {'email': 'Ama@Co.test', 'name': 'Ama Owusu', 'company': 'Volta Ltd', 'country': 'Ghana', 'sectors': ['mining', 'energy', 'nope'], 'consent': True, 'updates': True, 'lang': 'fr'})
assert st == 200, b
assert psql("select lang||'|'||array_to_string(sectors,',')||'|'||marketing from members where email='ama@co.test'") == 'fr|mining,energy|true'
assert psql("select tags||'|'||source from contacts where email='ama@co.test'") == 'member|Website: member account'
assert psql("select consent_email from contacts where email='ama@co.test'") == 'unknown', 'no marketing consent before the email is confirmed'
mail = psql("select subject||'#'||body from outbox where to_email='ama@co.test' and kind='member_login' order by id desc limit 1")
FR = json.load(open(os.path.join(ROOT, 'apps/crm/site-i18n/fr.json')))['strings']
assert mail.startswith(FR['Your sign-in link for Gotham Consult']), mail[:80]
link = re.search(r'href="(http://127\.0\.0\.1:4199/m/login\?t=[^"]+)"', mail).group(1).replace('&amp;', '&')
st, h, _ = raw(link.split('4199', 1)[1]); assert st == 302 and h['location'] == '/fr/account' and 'gc_member=' in h['set-cookie'], (st, h)
ck = h['set-cookie'].split(';')[0]
assert psql("select consent_email from contacts where email='ama@co.test'") == 'yes', 'consent counts once the address is confirmed'
st, h, _ = raw(link.split('4199', 1)[1]); assert st == 302 and 'link=expired' in h['location'], 'a sign-in link works once'
ok('free account: consent required, French sign-in email, the link signs in once, contact tagged member')
st, me, _ = call('/api/member/me', cookie=ck); assert st == 200 and me['member']['email'] == 'ama@co.test' and me['plans'] == [] and me['pro'] is False
assert call('/api/member/me', cookie='gc_member=x.y')[1] == {'member': None} and call('/api/member/prefs', {}, cookie='gc_member=x.y')[0] == 401
st, me, _ = call('/api/member/prefs', {'sectors': ['agri'], 'alerts': True, 'lang': 'de', 'marketing': False}, cookie=ck)
assert me['member']['sectors'] == ['agri'] and me['member']['lang'] == 'de' and psql("select consent_email from contacts where email='ama@co.test'") == 'no'
st, me, _ = call('/api/member/company', {'name': 'Volta Ltd', 'vat_registered': True, 'has_employees': True, 'year_end_month': 12, 'permits': [{'name': 'Work permit', 'expires': '2027-03-01', 'lead_days': 60}]}, cookie=ck)
assert st == 200 and len(me['calendar']) == 1 and me['calendar'][0]['full'] is False and len(me['calendar'][0]['deadlines']) <= 3, me['calendar']
coid = me['calendar'][0]['company']['id']
ok('member page: preferences change the contact consent, a company gives a 3-deadline preview')
# a paid plan through a normal invoice
_sp.run(['psql', DB, '-qc', "insert into settings(key,value) values ('inv_vat_registered','yes') on conflict (key) do update set value='yes'"], check=True)
assert call('/api/member/buy', {'product': 'compliance_year'}, cookie=ck)[0] == 400, 'compliance needs a company'
st, b, _ = call('/api/member/buy', {'product': 'compliance_year', 'company_id': coid}, cookie=ck); assert st == 200 and '/i/' in b['pay_url'], b
st, b2, _ = call('/api/member/buy', {'product': 'compliance_year', 'company_id': coid}, cookie=ck); assert b2['pay_url'] == b['pay_url'] and b2['order'] == b['order'], 'a second click reuses the unpaid invoice'
inv = json.loads(psql(f"select row_to_json(i) from invoices i join member_orders o on o.invoice_id=i.id where o.id={b['order']}"))
assert inv['currency'] == 'GHS' and inv['number'].startswith('INV-') and float(inv['taxable']) == 12000 and float(inv['total']) == 14400.0, inv
assert psql("select kind from deals where title like 'Compliance calendar%'") == 'consulting'
_sp.run(['psql', DB, '-qc', 'update users set must_change=false'], check=True)
st, d, h = call('/api/login', {'email': 'admin', 'password': 'ownerpass123'}); adm = h['set-cookie'].split(';')[0]
st, r, _ = call(f"/api/invoices/{inv['id']}/payment", {'amount': 14400, 'method': 'momo', 'reference': 'MM123'}, cookie=adm); assert st == 200 and r['status'] == 'paid', r
import time; time.sleep(0.5)
st, me, _ = call('/api/member/me', cookie=ck)
assert [p['product'] for p in me['plans']] == ['compliance_year'] and me['calendar'][0]['full'] is True and len(me['calendar'][0]['deadlines']) > 3
assert 'member-compliance' in psql("select tags from contacts where email='ama@co.test'")
ok('compliance plan: cedi invoice with VAT and levies (12,000 + 20%), a lead deal, plan starts when the payment is recorded, full calendar unlocked')
# a booking becomes a task once paid
st, b, _ = call('/api/member/buy', {'product': 'call', 'details': 'Entering cocoa processing', 'slots': 'Tue 10-12'}, cookie=ck); assert st == 200
inv2 = psql(f"select invoice_id from member_orders where id={b['order']}")
call(f"/api/invoices/{inv2}/payment", {'amount': 1800, 'method': 'card'}, cookie=adm); time.sleep(0.5)
assert psql(f"select status from member_orders where id={b['order']}") == 'open' and psql("select count(*) from tasks where title like 'Expert call, 30 minutes for Ama%Entering cocoa%'") == '1'
st, dash, _ = call('/api/members', cookie=adm); assert dash['kpi']['members'] == 1 and dash['kpi']['paying'] == 1 and dash['kpi']['mrr'] == 1000 and dash['kpi']['open_bookings'] == 1, dash['kpi']
assert call(f"/api/members/orders/{b['order']}/done", {}, cookie=adm)[0] == 200 and psql(f"select status from member_orders where id={b['order']}") == 'done'
assert call('/api/members', cookie=None)[0] == 401
ok('expert call: paid → open order with a task for the team; dashboard counts members, paying, monthly income and to-dos; staff mark it done')
# Pro: granted by staff, data pack
assert raw('/api/member/datapack.xlsx', ck)[0] == 403
ama_id = psql("select id from members where email='ama@co.test'")
st, r, _ = call(f"/api/members/{ama_id}/grant", {'product': 'pro_year', 'months': 12}, cookie=adm); assert st == 200
st, h, data = raw('/api/member/datapack.xlsx', ck); assert st == 200 and data[:2] == b'PK' and 'spreadsheetml' in h['content-type']
ok('Pro: staff can give a plan; Pro members download the Excel data pack, others cannot')
# weekly digest and reminders
call('/api/report/decide', {'action': 'publish', 'title': 'Cocoa price set', 'text': 'New season price.', 'url': 'https://cocobod.gh/'}, cookie=adm)
_sp.run(['psql', DB, '-qc', "update member_orders set ends=current_date + 5 where product='compliance_year'"], check=True)
st, r, _ = call('/api/members/run-jobs', {'weekly': True}, cookie=adm); assert st == 200 and r['digests'] == 1 and r['renewals'] == 1, r
dg = psql("select subject||'#'||body from outbox where to_email='ama@co.test' and kind='member_digest'")
DE = json.load(open(os.path.join(ROOT, 'apps/crm/site-i18n/de.json')))['strings']
assert dg.startswith(DE['Ghana this week: your Gotham alerts']) and 'Cocoa price set' in dg and '/m/stop?u=' in dg, dg[:200]
assert psql("select count(*) from member_orders where renewal_of is not null and status='pending'") == '1'
st, r, _ = call('/api/members/run-jobs', {'weekly': True}, cookie=adm); assert r['digests'] == 0 and r['renewals'] == 0, 'not twice'
tok = re.search(r'/m/stop\?u=([0-9a-f]+)', dg).group(1); st, h, _ = raw('/m/stop?u=' + tok, method='POST', body={}); assert st == 200 and psql("select alerts from members where email='ama@co.test'") == 'f'
ok('weekly digest in the member’s language with the approved report update and a one-click stop; renewal invoice 7 days before the end, once')
st, p, _ = call('/api/member/prices'); assert p['prices']['pro_year'] == 4500 and p['permits']
call('/api/members/prices', {'pro_year': 5200}, cookie=adm); assert call('/api/member/prices')[1]['prices']['pro_year'] == 5200
ok('prices are public for the membership page and the back office can change them')
# an order whose payment landed but whose plan never started is picked up by the daily sweep
st, b3, _ = call('/api/member/buy', {'product': 'pro_month'}, cookie=ck); assert st == 200
_sp.run(['psql', DB, '-qc', f"update invoices set status='paid' where id=(select invoice_id from member_orders where id={b3['order']})"], check=True)
st, r, _ = call('/api/members/run-jobs', {}, cookie=adm); assert r.get('recovered') == 1, r
assert psql(f"select status from member_orders where id={b3['order']}") == 'active'
st, r, _ = call('/api/members/run-jobs', {}, cookie=adm); assert r.get('recovered') == 0 and r['renewals'] == 0, r
# no order is left half-activated
assert psql("select count(*) from member_orders where status='activating'") == '0'
# sign out ends the session everywhere; a two-step ticket is never a session
assert call('/api/member/logout', {}, cookie=ck)[0] == 200 and call('/api/member/me', cookie=ck)[1] == {'member': None}
import hmac, hashlib, base64, time as _t
b64u = lambda x: base64.urlsafe_b64encode(x).rstrip(b'=').decode()
def forged(d):
    pl = b64u(json.dumps(d).encode()); return 'gc_session=' + pl + '.' + b64u(hmac.new(b't', pl.encode(), hashlib.sha256).digest())
uid = int(psql("select id from users where email='admin'")); exp = int(_t.time() * 1000) + 60000
assert call('/api/members', cookie=forged({'id': uid, 'sv': 0, 'kind': 'totp', 'exp': exp}))[0] == 401, 'two-step ticket must not open the back office'
ok('one invoice per unpaid plan, mail-app one-click unsubscribe, sign-out ends the session, a two-step ticket is not a session')
print('PASSED')
