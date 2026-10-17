"""Verified source parsing, last-good persistence, direct currency replies and honest scenarios."""
import os, subprocess, json, urllib.request, time
from pathlib import Path
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
TEST_PORT = int(os.environ.get('TEST_PORT', '4199'))
landing=Path(ROOT,'apps/site/pages/index.html').read_text()
invest=Path(ROOT,'apps/site/pages/invest.html').read_text()
market=Path(ROOT,'apps/site/public/assets/v2/ghana-market.js').read_text()
assert 'data-ghana-status' in landing and 'loading official data' in landing
assert '6.0%' not in landing and '5.0%' not in landing and '$31.25bn' not in landing
assert 'data-ghana-sector-period' in invest and 'loading official data' in invest
assert all(value not in invest for value in ['6.0%</b>','5.0%</b>','$13.80bn</b>','$11.07bn</b>','2026-06</span>'])
assert 'Q2 2026' not in landing and "zone:'Accra time'" in market and 't.zone' in market and 'Reporting periods are shown with each figure.' in market
assert all(s in market for s in ['Official sources last checked','Retained official figures','No current figures are displayed',"zh:checked?", "ar:checked?"])
assert 'Rate publication is over 48 hours old' in market and 'rates.stale' in market and 'FX_STALE_MS' in Path(ROOT,'apps/crm/server.js').read_text()
print('  ok landing and investor figures wait for official data; reporting and check timestamps stay source-derived')
code=r'''
import assert from 'node:assert/strict';import fs from 'node:fs';
import {parseGSS,parseGSE,latestBoGPdf,makeGhanaData,REFRESH_MS} from './apps/crm/ghana-data.js';
import {ratesAnswer,websiteKnowledge,timeAnswer} from './apps/crm/chat-knowledge.js';
import {checkResearch,researchHash} from './apps/crm/research-checks.js';
const gss=fs.readFileSync('./tests/fixtures/ghana/gss-flight.txt','utf8'),gse=fs.readFileSync('./tests/fixtures/ghana/gse-home.html','utf8');
assert.equal(REFRESH_MS,6*3600e3,'official investor data refresh is scheduled every six hours');
assert.equal(parseGSS(gss).gdp.value,6);assert.equal(parseGSS(gss).inflation.period,'2026M08');
assert.equal(parseGSE(gse).index.value,14071.44);assert.equal(parseGSE(gse).ytd.value,60.45);
assert.throws(()=>parseGSS('<script>bad</script>'));assert.throws(()=>parseGSE('old weekly report'));
assert.equal(latestBoGPdf('https://www.bog.gov.gh/wp-content/uploads/2026/07/Summary-of-Economic-and-Financial-Data-July-2026.pdf https://www.bog.gov.gh/wp-content/uploads/2026/09/Summary-of-Economic-and-Financial-Data-September-2026.pdf').includes('/09/'),true);
assert.throws(()=>latestBoGPdf('https://bad.test/evil.pdf'));console.log('  ok official source layouts and publication selection');
let clock=Date.parse('2026-10-05T15:00:00Z'),saved,fail=false,n=0,officialN=0;
const seed=JSON.parse(fs.readFileSync('./apps/crm/ghana-snapshot.json','utf8'));
const get=async url=>{n++;if(url.includes('statsghana')||url==='https://gse.com.gh/'||url.includes('bog.gov.gh'))officialN++;if(fail)throw new Error('down');return Buffer.from(url.includes('statsghana')?gss:url==='https://gse.com.gh/'?gse:url.endsWith('.pdf')?'mock pdf':seed.sources.bog.url);};
const feed=makeGhanaData({seed,get,pdf:async()=>seed.sources.bog.metrics,now:()=>clock,save:async s=>{saved=structuredClone(s);}});
await Promise.all([feed.refresh(),feed.refresh()]);assert.equal(n,4);assert.equal(saved.sources.bog.metrics.exportsAnnual.value,31.248);
await feed.refresh();assert.equal(officialN,4);clock+=5*3600e3;await feed.refresh();assert.equal(officialN,4,'repeated visitors do not trigger extra source downloads within six hours');
clock+=2*3600e3;await feed.refresh();assert.ok(officialN>=8,'official figures refresh after six hours');fail=true;clock+=49*3600e3;const retained=await feed.refresh();
assert.equal(retained.sources.gss.metrics.gdp.value,6);assert.equal(retained.sources.gss.status,'retained');assert.equal(retained.sources.gss.stale,true);
const restart=makeGhanaData({load:async()=>saved,get,pdf:async()=>({}),now:()=>clock});assert.equal((await restart.read()).sources.gse.metrics.ytd.value,60.45);
console.log('  ok coalesced cache, outage retention, stale flags and persistence');
const rawPDF=Buffer.from('%PDF-1.4 original research'),rawHTML=Buffer.from('<h1>Official research</h1><p>'+('Published evidence. '.repeat(12))+'</p>');
const registry={a:{url:'https://example.test/report.pdf',label:'Original report',baseline:researchHash(rawPDF,'report.pdf')},b:{url:'https://example.test/outlook',label:'Outlook',baseline:researchHash(rawHTML,'outlook')}};
let checks=0,changed=false;
const getResearch=async url=>{checks++;if(changed && url.endsWith('outlook'))throw new Error('down');return url.endsWith('.pdf')?(changed?Buffer.from('%PDF-1.4 amended research'):rawPDF):rawHTML;};
let r=await checkResearch(null,{registry,get:getResearch,now:clock});assert.equal(checks,2);assert.equal(r.items.a.status,'verified');
r=await checkResearch(r,{registry,get:getResearch,now:clock+5*3600e3});assert.equal(checks,2,'source checks are throttled within six hours');
r=await checkResearch(r,{registry,get:getResearch,now:clock+7*3600e3});assert.equal(checks,4,'source changes are checked again after six hours');
const verified=r.items.a.verified;changed=true;r=await checkResearch(r,{registry,get:getResearch,now:clock+24*3600e3});
assert.equal(r.items.a.status,'review');assert.equal(r.items.a.verified,verified);assert.equal(r.items.b.status,'unavailable');assert.equal(r.items.b.sha256,registry.b.baseline);
assert.throws(()=>researchHash(Buffer.from('<html>not a pdf</html>'),'report.pdf'));
console.log('  ok six-hour research checks flag changes/outages and preserve last verification');
const fx={rates:{USD:11.6173,EUR:13.0695},more:{AED:3.1633},updated:'2026-10-05T00:02:31Z'};
for(const [l,q]of [['en','cedi to USD today'],['fr','taux dollar cedi aujourd’hui'],['es','cambio cedi dolar hoy']]){const a=ratesAnswer(q,l,fx,Date.parse('2026-10-05'));assert.match(a,/1 USD = GHS/);assert.match(a,/1 GHS = USD/);assert.match(a,/exchangerate-api\.com/);}
assert.match(ratesAnswer('cedi to AED','en',fx,clock),/1 AED/);assert.match(ratesAnswer('cedi USD','en',fx,clock+49*3600e3),/older than 48 hours/);
assert.match(ratesAnswer('cedi USD','en',null),/cannot verify/);assert.equal(ratesAnswer('register for a forum','en',fx),null);
assert.match(timeAnswer('what time is it in Dubai?','en',Date.parse('2026-10-05T12:30:00Z')),/16:30/);
assert.match(timeAnswer('what time is it?','en',Date.parse('2026-10-05T12:30:00Z')),/Accra: 12:30\. 5 October 2026/);
assert.match(timeAnswer('quelle heure est-il?','fr',Date.parse('2026-10-05T12:30:00Z')),/12:30/);
assert.match(timeAnswer('que hora es en Londres?','es',Date.parse('2026-10-05T12:30:00Z')),/13:30/);
assert.equal(timeAnswer('How much time is needed for registration?'),null);
console.log('  ok direct dated rates and current city clocks in three languages');
await import('./apps/site/public/assets/v2/ghana-market.js');const {stats,scenario}=globalThis.GothamFinance;
assert.equal(stats([2,6.65,7.65,22,25.26,55.82]).gain,2691);assert.equal(scenario(100,10,10,5).foreignReturn,0);
assert.ok(scenario(100,10,20,5).foreignReturn<0);assert.equal(scenario(100,0,0,10).local,100);assert.throws(()=>scenario(100,-100,0,5));
console.log('  ok price-only returns and FX-sensitive five/ten-year scenarios');
const dir=fs.mkdtempSync('/tmp/gotham-knowledge-');fs.writeFileSync(dir+'/site-knowledge.json',JSON.stringify([{url:'https://gothamconsult.com/invest#research',title:'Ghana stock research',text:'BOPP price history and currency risk'}]));
assert.match(websiteKnowledge('BOPP stock return',dir),/BOPP price history/);fs.rmSync(dir,{recursive:true});
console.log('  ok retrieval from public website material');
'''
subprocess.run(['node','--input-type=module','-e',code],cwd=ROOT,check=True)
env=dict(os.environ,PORT=str(TEST_PORT),DATABASE_URL=os.environ['TEST_DATABASE_URL'],SESSION_SECRET='test',ADMIN_EMAIL='admin',ADMIN_PASSWORD='ownerpass123',ADMIN_NAME='Admin',MEDIA_DIR='/tmp/mediatest',OPENAI_API_KEY='')
p=subprocess.Popen(['node','server.js'],cwd=ROOT+'/apps/crm',env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 for _ in range(80):
  try:
   data=json.load(urllib.request.urlopen(f'http://127.0.0.1:{TEST_PORT}/api/ghana-data',timeout=3));break
  except Exception:time.sleep(.15)
 else:raise AssertionError('server not ready')
 assert set(data['sources'])=={'bog','gss','gse'}
 assert data['sources']['bog']['metrics']['exportsAnnual']['value']==31.248
 assert 'sha256' in data['sources']['bog'];print('  ok public dated economic API')
finally:p.terminate();p.wait(timeout=5)
print('PASSED')
