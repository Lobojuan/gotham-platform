const {chromium}=require(process.env.PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path');
const base=process.env.BASE||'http://127.0.0.1:4199';
const extension=process.env.STATIC_SITE==='1'?'.html':'';
const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'../../apps/crm/ghana-snapshot.json')));
const ok=(c,m)=>{if(!c)throw new Error(m);console.log('  ok',m);};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM});
 try{for(const [lang,width]of [['en',1440],['fr',768],['es',360]]){
  const ctx=await browser.newContext({viewport:{width,height:900}});await ctx.addInitScript(l=>localStorage.setItem('gc-language',l),lang);
  const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/api/ghana-data',r=>r.fulfill({json:seed}));
  await p.route('**/api/rates',r=>r.fulfill({json:{rates:{USD:11.6173,EUR:13.0695,GBP:15.3724},more:{AED:3.1633,CHF:14.0236,CAD:8.1535,CNY:1.7313,XOF:.0199},updated:'2026-10-05T00:02:31Z'}}));
  await p.goto(base+(lang==='fr'?'/fr/invest':'/invest')+extension);await p.waitForSelector('#company-chart');await p.waitForFunction(()=>document.querySelector('.currency-grid')?.textContent.includes('AED'));
  const text=await p.textContent('#investor-research');ok(text.includes(seed.sources.gse.metrics.index.period),'publication date visible');
  ok(text.includes(({en:'Five-year price change',fr:'Variation du cours sur cinq ans',es:'Variación del precio en cinco años'})[lang]),'case studies translated: '+lang);
  ok((await p.textContent('#research-check-status')).includes(({en:'Research sources checked daily',fr:'Sources de recherche vérifiées chaque jour',es:'Fuentes de investigación comprobadas diariamente'})[lang]),'daily source checks visible in '+lang);
  ok(await p.locator('#research a[href*="gse.com.gh"]').count()>=8,'company examples link original GSE records');
  await p.selectOption('#company-chart','MTNGH');ok((await p.textContent('#company-series')).includes('0.64')||(await p.textContent('#company-series')).includes('0,64'),'interactive company history');
  await p.fill('[name=amount]','1000');await p.fill('[name=annual]','10');await p.fill('[name=fx]','20');await p.selectOption('[name=years]','10');
  await p.locator('#investment-scenario button').click();ok((await p.textContent('#scenario-result')).includes('-'),'currency depreciation can produce a foreign-currency loss');
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page overflow: '+width);
  ok(errors.length===0,'no JavaScript errors');await ctx.close();
 }
 const ctx=await browser.newContext({viewport:{width:360,height:800}});const p=await ctx.newPage();
 await p.route('**/api/ghana-data',r=>r.abort());await p.route('**/api/rates',r=>r.abort());await p.goto(base+'/invest'+extension);await p.waitForSelector('#company-chart');
 ok((await p.textContent('#research')).includes('2026-10-02'),'offline page keeps dated verified snapshot');
 ok((await p.textContent('#research')).includes('Rates unavailable'),'offline page does not invent current rates');await ctx.close();
 const reviewCtx=await browser.newContext();const reviewPage=await reviewCtx.newPage();const changed=structuredClone(seed);changed.research.items.wb.status='review';
 await reviewPage.route('**/api/ghana-data',r=>r.fulfill({json:changed}));await reviewPage.route('**/api/rates',r=>r.abort());await reviewPage.goto(base+'/invest'+extension);
 await reviewPage.waitForFunction(()=>document.querySelector('#research-check-status')?.textContent.includes('Source checks requiring review'));
 ok((await reviewPage.textContent('#research-check-status')).includes('World Bank'),'changed research source is flagged instead of silently claimed current');await reviewCtx.close();
 console.log('PASSED');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
