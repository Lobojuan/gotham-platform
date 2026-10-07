"""Fact register: the site states what the register says, sources are checked weekly, problems reach the team once,
a person confirms, and the public /sources page shows every fact with its source."""
import os, sys, json, subprocess, threading, http.server, time, urllib.request
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ok = lambda m: print('  ok', m)

# 1. the checking logic on its own
code = r'''
import assert from 'node:assert/strict';
import {checkSources,factStatus,makeFactWatch,pageText,loadFacts} from './apps/crm/fact-watch.js';
const facts=loadFacts();assert.ok(facts.length>=20);
const long=t=>Buffer.from('<html><body><nav>Menu</nav><p>'+t+' '+'Official text. '.repeat(30)+'</p></body></html>');
assert.throws(()=>pageText(Buffer.from('<p>Just a moment...</p>'+'x'.repeat(300))),/blocked/);
assert.equal(pageText(Buffer.from('%PDF-1.7 ...'),'a.pdf'),null);
const F=[{id:'vat',topic:'Tax',kind:'law',claim:'VAT is 15%',checked:'2026-10-01',review_days:90,sources:[{label:'GRA',url:'https://gra.test/vat',official:true,expect:['15%']}]},
 {id:'fee',topic:'Fees',kind:'fee',claim:'Fee 585',checked:'2026-10-01',review_days:90,sources:[{label:'ORC',url:'https://orc.test/fees',official:true,expect:['585']}]},
 {id:'gone',topic:'Fees',kind:'fee',claim:'Old page',checked:'2026-10-01',review_days:90,sources:[{label:'Gone',url:'https://gone.test/x',official:true,expect:[]}]},
 {id:'old',topic:'Prices',kind:'price',claim:'Our price',checked:'2026-01-01',review_days:90,sources:[]},
 {id:'rate',topic:'Economy',kind:'stat',claim:'Policy rate 14%',checked:'2026-10-01',review_days:60,live:{source:'bog',metric:'policy',value:14},sources:[]}];
let pages={'https://gra.test/vat':long('VAT is 15% plus NHIL'),'https://orc.test/fees':long('Company GHS 585.00'),'https://news.test/a':long('An article source')};
const get=async u=>{if(u.startsWith('https://gone.test'))return {status:404,type:'text/html',buf:Buffer.from('')};if(!pages[u])throw new Error('down');return {status:200,type:'text/html',buf:pages[u]};};
let clock=Date.parse('2026-10-06T08:00:00Z'),saved=null,alerts=[],policy=14;
const W=makeFactWatch({facts:F,get,now:()=>clock,save:async s=>{saved=structuredClone(s)},live:async()=>({bog:{metrics:{policy:{value:policy}}}}),
  links:async()=>[{url:'https://news.test/a',label:'An article source',page:'/insights/x'},{url:'https://dead.test/b',label:'Dead link',page:'/insights/y'}],
  alert:async(s,l)=>{alerts.push([s,l])}});
let r=await W.run();
const st=id=>r.facts.find(f=>f.id===id);
assert.equal(st('vat').status,'ok');assert.equal(st('fee').status,'ok');assert.equal(st('gone').status,'unverified','one 404 is not yet an alarm');
assert.equal(st('old').status,'review');assert.match(st('old').problems[0].text,/Due for a person/);
assert.equal(st('rate').status,'ok');assert.equal(alerts.length,1);assert.match(alerts[0][0],/1 to check/);
console.log('  ok first run: sources found, overdue price flagged, one alert');
r=await W.run();assert.equal(alerts.length,1,'not again within the week');
clock+=8*864e5;pages['https://orc.test/fees']=long('Company GHS 650.00');policy=13.5;r=await W.run();
assert.equal(st('fee').status,'review');assert.match(st('fee').problems[0].text,/"585" no longer appears on ORC/);
assert.equal(st('gone').status,'review');assert.match(st('gone').problems[0].text,/gone \(HTTP 404\)/);
assert.equal(st('rate').status,'review');assert.match(st('rate').problems[0].text,/live figure is now 13.5/);
assert.equal(r.broken_links.length,0,'an unreachable link needs three failures');
assert.equal(alerts.length,2);assert.ok(!alerts[1][1].some(l=>/Due for a person/.test(l)),'the overdue price was already reported');
assert.ok(alerts[1][1].some(l=>/585/.test(l))&&alerts[1][1].some(l=>/13.5/.test(l)));
console.log('  ok a week later: a changed fee, a vanished source and a moved live figure are flagged, alerts only for new problems');
pages['https://gra.test/vat']=long('VAT is 15% plus NHIL, page updated');clock+=8*864e5;r=await W.run();
assert.equal(st('vat').status,'changed');assert.match(st('vat').notes[0].text,/GRA changed on/);
await W.review('vat','admin@test','read it');r=await W.report();assert.equal(st('vat').status,'ok','confirmed by a person');
await W.review('old','admin@test','');r=await W.report();assert.equal(st('old').status,'ok');assert.equal(st('old').checked,'2026-10-22');
clock+=8*864e5;r=await W.run();assert.equal(r.broken_links.length,1);assert.equal(r.broken_links[0].page,'/insights/y');
assert.equal(await W.review('nope','x',''),null);
const pub=await W.publicReport();assert.ok(pub.facts.every(f=>['ok','review','unverified'].includes(f.status)&&f.checked));assert.ok(!JSON.stringify(pub).includes('problems'));
const again=makeFactWatch({facts:F,get,now:()=>clock,load:async()=>saved});assert.equal((await again.report()).facts.find(f=>f.id==='old').checked,'2026-10-22');
console.log('  ok a page edit is a soft note; "Still correct" clears it and restarts the clock; dead article links after three failures; state persists');
'''
subprocess.run(['node', '--input-type=module', '-e', code], cwd=ROOT, check=True)

# 2. the register and the website agree
sys.path.insert(0, os.path.join(ROOT, 'apps', 'site'))
import facts_page
from datetime import date
probs = facts_page.check(date(2026, 10, 6))
assert not probs, probs
ok('every claim in the register is written on the pages it names (and none is overdue on 6 Oct 2026)')
facts = facts_page.load(); ids = [f['id'] for f in facts]
assert len(ids) == len(set(ids)), 'duplicate fact ids'
assert all(f['sources'] or f.get('owner') for f in facts), 'a fact needs sources or an owner'
html = facts_page.render()
assert all(f'data-fact="{i}"' in html for i in ids) and '/api/facts/public' in html
ok('the /sources page lists every fact with its sources')
links = facts_page.links(); assert len(links) > 40 and any(l['page'].startswith('/insights/') for l in links)
ok('every article source link is handed to the weekly link check')

# 3. the server: weekly job, admin view, confirm, public status, alerts
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path == '/gone': self.send_response(404); self.end_headers(); return
        body = ('<html><body><p>The fee is GHS 585.00 and VAT is 15%. ' + 'Official text. ' * 30 + '</p></body></html>').encode()
        self.send_response(200); self.send_header('content-type', 'text/html'); self.end_headers(); self.wfile.write(body)
src = http.server.ThreadingHTTPServer(('127.0.0.1', 4296), H); threading.Thread(target=src.serve_forever, daemon=True).start()
tf = '/tmp/facts-test.json'
json.dump({'facts': [
  {'id': 'fee', 'topic': 'Fees', 'kind': 'fee', 'claim': 'Fee 585', 'checked': '2026-10-01', 'review_days': 90,
   'sources': [{'label': 'Fees page', 'url': 'http://127.0.0.1:4296/fees', 'official': True, 'expect': ['585']}]},
  {'id': 'vat', 'topic': 'Tax', 'kind': 'law', 'claim': 'VAT 15%', 'checked': '2026-10-01', 'review_days': 90,
   'sources': [{'label': 'VAT page', 'url': 'http://127.0.0.1:4296/vat', 'official': True, 'expect': ['16%']}]},
  {'id': 'old', 'topic': 'Prices', 'kind': 'price', 'claim': 'Our price', 'checked': '2025-01-01', 'review_days': 90, 'sources': [], 'owner': 'Us'}]}, open(tf, 'w'))
os.environ['FACTS_FILE'] = tf
# Keep this fixture check offline: the real dist/source-links.json now contains
# dozens of public research links, whose network delays are not a unit test.
import tempfile, shutil, atexit
site_fixture = tempfile.TemporaryDirectory(prefix='gotham-facts-site-')
atexit.register(site_fixture.cleanup)
json.dump([], open(os.path.join(site_fixture.name, 'source-links.json'), 'w'))
shutil.copyfile(os.path.join(ROOT, 'apps/site/dist/sources.html'), os.path.join(site_fixture.name, 'sources.html'))
bootstrap = open(os.path.join(os.path.dirname(__file__), '07_family_desk.py')).read().split("ok=lambda m: print('  ok',m)")[0]
exec(bootstrap.replace("ROOT+'/apps/site/dist'", repr(site_fixture.name)))
ok = lambda m: print('  ok', m)
import subprocess as _sp
st, d, h = call('/api/facts', cookie=None); assert st == 401
_sp.run(['psql', DB, '-qc', 'update users set must_change=false'], check=True)
st, d, h = call('/api/login', {'email': 'admin', 'password': 'ownerpass123'}); ck = h['set-cookie'].split(';')[0]
assert call('/api/safety', {'alert_emails': 'team@example.com'}, cookie=ck)[0] == 200
st, r, _ = call('/api/facts/check', {'wait': True}, cookie=ck); assert st == 200, (st, r)
by = {f['id']: f for f in r['facts']}
assert by['fee']['status'] == 'ok' and by['vat']['status'] == 'review' and by['old']['status'] == 'review', {k: v['status'] for k, v in by.items()}
assert '"16%" no longer appears on VAT page' in by['vat']['problems'][0]['text'] and r['checked'] and r['counts']['review'] == 2
ok('admin check: a source that no longer says what we rely on and an overdue price are flagged')
mail = _sp.run(['psql', DB, '-tAc', "select count(*) from outbox where to_email='team@example.com' and subject like 'Gotham facts:%'"], capture_output=True, text=True).stdout.strip()
assert mail == '1', mail
call('/api/facts/check', {'wait': True}, cookie=ck)
mail = _sp.run(['psql', DB, '-tAc', "select count(*) from outbox where subject like 'Gotham facts:%'"], capture_output=True, text=True).stdout.strip()
assert mail == '1', 'the same problems are not reported twice'
ok('one warning email to the safety-net contact, not repeated for the same problems')
st, r, _ = call('/api/facts/review', {'id': 'vat', 'note': 'GRA page checked'}, cookie=ck); assert st == 200
assert [f for f in r['facts'] if f['id'] == 'vat'][0]['review']['by'] == 'admin'
assert call('/api/facts/review', {'id': 'nope'}, cookie=ck)[0] == 404
log = _sp.run(['psql', DB, '-tAc', "select detail from jobs_log where job='facts_review'"], capture_output=True, text=True).stdout
assert 'vat confirmed by admin: GRA page checked' in log
ok('"Still correct" is recorded with who and why')
st, p, _ = call('/api/facts/public'); assert st == 200 and len(p['facts']) == 3 and 'problems' not in json.dumps(p)
assert {f['id']: f['status'] for f in p['facts']} == {'fee': 'ok', 'vat': 'review', 'old': 'review'}
ok('public status without internals')
st, b, _ = call('/api/facts/check', {}, cookie=None); assert st == 401
ok('only admins can run checks or confirm facts')
st, b, _ = call('/sources', raw=True)
if st == 200: assert b'data-fact="vat-rate"' in b and b'Sources and fact checks' in b; ok('/sources is served')
print('PASSED')
