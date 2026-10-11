"""Ghana Investment Report: every figure sourced, the six-hour watch flags changed sources and newsrooms once,
nothing is published without a person, company news and partner enquiries reach the back office."""
import os, sys, json, threading, http.server, subprocess
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ok = lambda m: print('  ok', m)

# 1. the watch on its own
code = r'''
import assert from 'node:assert/strict';
import {makeReportWatch,loadReport,reportFacts} from './apps/crm/report-watch.js';
const real=loadReport();assert.ok(real.chapters.length>=5);const rf=reportFacts(real);assert.ok(rf.length>=50);
assert.ok(rf.every(f=>f.sources[0].url.startsWith('https://')&&f.sources[0].expect.length),'every figure has a source and a phrase to check');
const R={updated:'2026-10-07',review_days:120,chapters:[{id:'macro',title:'Economy',figures:[
  {id:'macro-gdp',label:'GDP growth',value:'6.0',unit:'%',period:'Q2 2026',source_label:'GSS',source_url:'https://gss.test/gdp',official:true,quote:'grew 6.0%'}],
  watch:[{label:'BoG newsroom',url:'https://bog.test/news',why:''}]}]};
const long=t=>Buffer.from('<html><body><p>'+t+' '+'Official text. '.repeat(30)+'</p></body></html>');
let pages={'https://gss.test/gdp':long('The economy grew 6.0% in Q2'),'https://bog.test/news':long('Policy rate held at 14%')};
const get=async u=>({status:200,type:'text/html',buf:pages[u]});
let clock=Date.parse('2026-10-07T08:00:00Z'),st=null,lg=null,alerts=[],requests=0;
const countedGet=async u=>{requests++;return get(u)};
const W=makeReportWatch({report:R,get:countedGet,now:()=>clock,everyDays:6/24,save:async s=>{st=structuredClone(s)},saveLog:async l=>{lg=structuredClone(l)},alert:async(s,l)=>{alerts.push([s,l])}});
let r=await W.run();assert.equal(r.facts[0].status,'ok');assert.equal(r.updates.length,0,'first look is only a baseline');assert.equal(alerts.length,0);
assert.equal(Date.parse(r.next)-Date.parse(r.checked),6*3600e3,'next report/source check is scheduled in six hours');
r=await W.run();assert.equal(r.updates.length,0,'not again within six hours');assert.equal(requests,2);
clock+=5*3600e3;r=await W.run();assert.equal(requests,2,'source checks stay throttled inside the six-hour interval');
clock+=2*3600e3;pages['https://bog.test/news']=long('Policy rate cut to 13.5%');pages['https://gss.test/gdp']=long('The economy grew 5.1% in Q3');r=await W.run();
assert.equal(r.facts[0].status,'review');assert.match(r.facts[0].problems[0].text,/grew 6.0%/);
assert.equal(r.pending,1);assert.equal(r.updates[0].kind,'source');assert.match(alerts.at(-1)[0],/1 source to read/);
console.log('  ok after six hours: a changed figure is flagged and a changed newsroom becomes one pending update with an alert');
clock+=7*3600e3;r=await W.run();assert.equal(r.pending,1,'an unchanged newsroom is not reported again');
let pub=await W.publicReport();assert.equal(pub.updates.length,0,'nothing is published by itself');assert.equal(pub.figures[0].status,'review');
const it=r.updates[0];assert.equal(await W.decide('nope','publish','admin',{title:'x'}),null);assert.equal(await W.decide(it.id,'approve','admin'),null,'only publish or dismiss');
await W.decide(it.id,'publish','admin',{title:'Bank of Ghana cuts the policy rate to 13.5%',text:'First cut this year.'});
await W.submit({kind:'news',chapter:'macro',title:'News from Acme',text:'We opened a plant https://acme.test/x',url:'https://acme.test/x'});
pub=await W.publicReport();assert.equal(pub.updates.length,1);assert.equal(pub.updates[0].title,'Bank of Ghana cuts the policy rate to 13.5%');
await W.review('macro-gdp','admin','checked');pub=await W.publicReport();assert.equal(pub.figures[0].status,'ok');
const again=makeReportWatch({report:R,get,now:()=>clock,load:async()=>st,loadLog:async()=>lg});assert.equal((await again.publicReport()).updates.length,1);
assert.ok(!JSON.stringify(pub).includes('problems'));
console.log('  ok a person publishes or dismisses; company news waits; "Still correct" clears a figure; state persists');
'''
subprocess.run(['node', '--input-type=module', '-e', code], cwd=ROOT, check=True)

# 2. the page
sys.path.insert(0, os.path.join(ROOT, 'apps', 'site'))
import report_page
assert not report_page.check(), report_page.check()
html = report_page.render(); rep = report_page.load()
ids = [f['id'] for c in rep['chapters'] for f in c['figures']]
assert all(f'data-fig="{i}"' in html for i in ids) and '/api/report/public' in html and '/api/report/enquiry' in html and '/api/ghana-data' in html
assert html.count('class="sec rp-ch"') == len(rep['chapters']) and 'GHS 9,800' in html and 'EUR' not in html and 'Partner' in html
ok(f'the report page shows {len(ids)} sourced figures in {len(rep["chapters"])} chapters, live numbers, the change log and the partner form')

# 3. the server
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        body = ('<html><body><p>The economy grew 6.0% in Q2. ' + 'Official text. ' * 30 + '</p></body></html>').encode()
        self.send_response(200); self.send_header('content-type', 'text/html'); self.end_headers(); self.wfile.write(body)
src = http.server.ThreadingHTTPServer(('127.0.0.1', 4297), H); threading.Thread(target=src.serve_forever, daemon=True).start()
tf = '/tmp/report-test.json'
json.dump({'updated': '2026-10-07', 'review_days': 120, 'chapters': [{'id': 'macro', 'title': 'Economy', 'figures': [
    {'id': 'macro-gdp', 'label': 'GDP growth', 'value': '6.0', 'unit': '%', 'period': 'Q2 2026', 'source_label': 'GSS', 'source_url': 'http://127.0.0.1:4297/gdp', 'official': True, 'quote': 'grew 6.0%'},
    {'id': 'macro-cpi', 'label': 'Inflation', 'value': '5.0', 'unit': '%', 'period': 'Aug 2026', 'source_label': 'GSS', 'source_url': 'http://127.0.0.1:4297/cpi', 'official': True, 'quote': 'inflation 9.9%'}],
    'watch': [{'label': 'Newsroom', 'url': 'http://127.0.0.1:4297/news', 'why': ''}]}],
    'authors': [{'name': 'Uffe Carlson', 'role': 'Partner', 'email': 'uffe@test.gh', 'phone': '+233 55 000 0001', 'whatsapp': '233550000001'}],
    'edition': {'label': 'Test edition', 'file': 'test-edition.pdf', 'files': {'fr': 'test-edition-fr.pdf'}}}, open(tf, 'w'))
os.environ['REPORT_FILE'] = tf
os.makedirs('/tmp/report-pdf-test', exist_ok=True); PDF = b'%PDF-1.4 test edition ' + os.urandom(64)
open('/tmp/report-pdf-test/test-edition.pdf', 'wb').write(PDF); os.environ['REPORT_PDF_DIR'] = '/tmp/report-pdf-test'
PDF_FR = b'%PDF-1.4 edition francaise ' + os.urandom(32); open('/tmp/report-pdf-test/test-edition-fr.pdf', 'wb').write(PDF_FR)
exec(open(os.path.join(os.path.dirname(__file__), '07_family_desk.py')).read().split("ok=lambda m: print('  ok',m)")[0])
ok = lambda m: print('  ok', m)
import subprocess as _sp
assert call('/api/report', cookie=None)[0] == 401 and call('/api/report/check', {}, cookie=None)[0] == 401 and call('/api/report/decide', {'action': 'publish', 'title': 'x'})[0] == 401
_sp.run(['psql', DB, '-qc', 'update users set must_change=false'], check=True)
st, d, h = call('/api/login', {'email': 'admin', 'password': 'ownerpass123'}); ck = h['set-cookie'].split(';')[0]
st, r, _ = call('/api/report/check', {'wait': True}, cookie=ck); assert st == 200, (st, r)
by = {f['id']: f['status'] for f in r['facts']}
assert by == {'macro-gdp': 'ok', 'macro-cpi': 'review'}, by
ok('weekly check over the real HTTP path: a figure whose source no longer says it is flagged; admins only')
st, p, _ = call('/api/report/public'); assert st == 200 and p['updates'] == [] and {f['id']: f['status'] for f in p['figures']} == by
st, b, _ = call('/api/report/enquiry', {'kind': 'partner', 'package': 'sector', 'chapter': 'mining', 'full_name': 'Ama Mensah', 'company': 'Gold Co', 'email': 'ama@goldco.test', 'consent': True})
assert st == 200, b
row = _sp.run(['psql', DB, '-tAc', "select tags||'|'||source from contacts where email='ama@goldco.test'"], capture_output=True, text=True).stdout.strip()
assert row == 'report-partner|Website: Ghana Investment Report', row
deal = _sp.run(['psql', DB, '-tAc', "select kind from deals where title like 'Report partner%'"], capture_output=True, text=True).stdout.strip()
assert deal == 'sponsorship', deal
mail = _sp.run(['psql', DB, '-tAc', "select count(*) from outbox where to_email='uffe.carlson@gothamconsult.com' and subject like 'Report: Report partner from Ama%'"], capture_output=True, text=True).stdout.strip()
assert mail == '1', mail
assert call('/api/report/enquiry', {'kind': 'partner', 'full_name': 'X', 'email': 'bad', 'consent': True})[0] == 400
assert call('/api/report/enquiry', {'kind': 'news', 'full_name': 'Kofi', 'email': 'kofi@x.test', 'consent': True})[0] == 400, 'news needs a message'
st, b, _ = call('/api/report/enquiry', {'kind': 'news', 'chapter': 'energy', 'full_name': 'Kofi', 'company': 'Sun Ltd', 'email': 'kofi@sun.test', 'consent': True, 'message': 'We commissioned 50 MW https://sun.test/pr'})
assert st == 200
st, r, _ = call('/api/report', cookie=ck); pend = [u for u in r['updates'] if u['status'] == 'pending']
assert len(pend) == 1 and pend[0]['kind'] == 'news' and pend[0]['url'] == 'https://sun.test/pr', pend
ok('a partner enquiry becomes a tagged contact, a sponsorship deal and an email to Uffe; company news waits for review')
assert call('/api/report/public')[1]['updates'] == []
st, r, _ = call('/api/report/decide', {'id': pend[0]['id'], 'action': 'publish', 'title': 'Sun Ltd commissions 50 MW of solar', 'text': 'Grid-connected, Bono Region.'}, cookie=ck); assert st == 200
st, r, _ = call('/api/report/decide', {'action': 'publish', 'title': '2027 Budget date set', 'text': 'Presented on 5 November.', 'url': 'https://mofep.gov.gh/'}, cookie=ck); assert st == 200
st, p, _ = call('/api/report/public'); titles = [u['title'] for u in p['updates']]
assert set(titles) == {'Sun Ltd commissions 50 MW of solar', '2027 Budget date set'} and 'email' not in json.dumps(p), p
log = _sp.run(['psql', DB, '-tAc', "select count(*) from jobs_log where job='report_update'"], capture_output=True, text=True).stdout.strip(); assert log == '2'
ok('an admin publishes the news or adds an update; the public log shows it without any personal data')
st, r, _ = call('/api/report/review', {'id': 'macro-cpi', 'note': 'GSS page re-read'}, cookie=ck); assert st == 200
assert {f['id']: f['status'] for f in r['facts']}['macro-cpi'] == 'ok' and call('/api/report/review', {'id': 'nope'}, cookie=ck)[0] == 404
ok('"Still correct" is recorded')
# the PDF edition in exchange for an email
assert call('/api/report/enquiry', {'kind': 'download', 'full_name': 'Kwame Investor', 'email': 'kwame@fund.test'})[0] == 400, 'consent is required'
st, b, _ = call('/api/report/enquiry', {'kind': 'download', 'full_name': 'Kwame Investor', 'email': 'Kwame@Fund.test', 'company': 'Volta Fund', 'role': 'investor',
    'country': 'United Kingdom', 'phone': '+44 7700 900123', 'updates': True, 'consent': True})
assert st == 200 and b['url'].startswith('http://127.0.0.1:4199/api/report/pdf?'), b
row = _sp.run(['psql', DB, '-tAc', "select tags||'|'||consent_email||'|'||sector||'|'||phone from contacts where email='kwame@fund.test'"], capture_output=True, text=True).stdout.strip()
assert row == 'report-download,report-updates|yes|Investor|+447700900123', row
row = _sp.run(['psql', DB, '-tAc', "select country||'|'||client_type||'|'||consent_source||'|'||(consent_at is not null)||'|'||source from contacts where email='kwame@fund.test'"], capture_output=True, text=True).stdout.strip()
assert row == 'United Kingdom|investor|Ghana Investment Report: asked for quarterly updates|true|Website: Ghana Investment Report', row
deal = _sp.run(['psql', DB, '-tAc', "select kind from deals where title like 'Report download%'"], capture_output=True, text=True).stdout.strip(); assert deal == 'investor', deal
body = _sp.run(['psql', DB, '-tAc', "select body from outbox where to_email='kwame@fund.test' and subject='Your Ghana Investment Report 2026'"], capture_output=True, text=True).stdout
assert b['url'].replace('&', '&amp;') in body and 'uffe@test.gh' in body and 'wa.me/233550000001' in body, body[:400]
alert = _sp.run(['psql', DB, '-tAc', "select body from outbox where to_email='uffe.carlson@gothamconsult.com' and subject like 'Report: Report download from Kwame%'"], capture_output=True, text=True).stdout
assert 'United Kingdom' in alert and 'Investor or fund' in alert and 'opted in' in alert, alert[:300]
ok('a download request becomes a tagged contact (opted in to updates), an investor lead, an email with the link and the authors, and an alert to Uffe')
import http.client
def raw_get(path):
    c = http.client.HTTPConnection('127.0.0.1', 4199, timeout=10); c.request('GET', path, headers={'x-real-ip': '10.9.1.1'}); r = c.getresponse(); return r.status, r.getheader('location') or r.getheader('content-type'), r.read()
path = b['url'].split('4199', 1)[1]
st, ct, data = raw_get(path); assert st == 200 and ct == 'application/pdf' and data == PDF, (st, ct)
st, loc, _ = raw_get(path[:-3] + 'abc'); assert st == 302 and 'link=expired' in loc, (st, loc)
import re as _re
st, loc, _ = raw_get(_re.sub(r'x=\d+', 'x=1000', path)); assert st == 302, 'an old or altered date is refused'
st, loc, _ = raw_get('/api/report/pdf'); assert st == 302
log = _sp.run(['psql', DB, '-tAc', "select count(*) from audit_log where action='report_pdf' and detail='kwame@fund.test'"], capture_output=True, text=True).stdout.strip(); assert log == '1', log
ok('the signed link returns the PDF; a changed, expired or missing signature goes back to the form')
st, b, _ = call('/api/report/enquiry', {'kind': 'download', 'full_name': 'Ama', 'email': 'ama2@x.test', 'consent': True})
row = _sp.run(['psql', DB, '-tAc', "select tags||'|'||consent_email from contacts where email='ama2@x.test'"], capture_output=True, text=True).stdout.strip()
assert st == 200 and row == 'report-download|unknown', row
assert _sp.run(['psql', DB, '-tAc', "select kind from deals where title like 'Report download · Ama%'"], capture_output=True, text=True).stdout.strip() == 'other'
ok('without the updates box no marketing consent is recorded; a non-investor download is an "other" lead')
# the same in French: French email, French PDF, the contact remembers the language
FR = json.load(open(os.path.join(ROOT, 'apps', 'crm', 'report-i18n', 'fr.json')))['strings']
st, b, _ = call('/api/report/enquiry', {'kind': 'download', 'lang': 'fr', 'full_name': 'Claire Dubois', 'email': 'claire@fonds.test', 'role': 'investor', 'country': 'France', 'consent': True})
assert st == 200 and '&l=fr&' in b['url'], b
row = _sp.run(['psql', DB, '-tAc', "select language from contacts where email='claire@fonds.test'"], capture_output=True, text=True).stdout.strip(); assert row == 'fr', row
subj = _sp.run(['psql', DB, '-tAc', "select subject from outbox where to_email='claire@fonds.test'"], capture_output=True, text=True).stdout.strip()
assert subj == FR['Your Ghana Investment Report 2026'] != 'Your Ghana Investment Report 2026', subj
st, ct, data = raw_get(b['url'].split('4199', 1)[1]); assert st == 200 and data == PDF_FR, (st, ct)
st, loc, _ = raw_get(b['url'].split('4199', 1)[1].replace('&l=fr', '&l=de')); assert st == 302 and loc.startswith('/de/'), 'the language is part of the signature'
ok('a French reader gets the French email and the French PDF; the language is signed into the link and saved on the contact')
# every language has a complete translation and its own page
assert not [p for p in report_page.check() if p[0].startswith('i18n')], report_page.check()
for lang in ('fr', 'es', 'de', 'ar', 'zh'):
    h = report_page.render(lang)
    assert 'Key takeaways' not in h and 'Rules that matter' not in h, lang
ar, zh, fr = report_page.render('ar'), report_page.render('zh'), report_page.render('fr')
assert '亿美元' in zh and '年' in zh and '\u202f' in fr and 'أكتوبر' in ar
ok('the report reads fully in French, Spanish, German, Arabic and Chinese, with local numbers, dates and money')
st, b, _ = call('/ghana-investment-report', raw=True)
if st == 200: assert b'Ghana Investment Report' in b; ok('/ghana-investment-report is served')
print('PASSED')
