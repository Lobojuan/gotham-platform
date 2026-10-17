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
  await p.route('**/api/report/public',r=>r.fulfill({json:{updates:[{at:'2026-10-10T10:30:00Z',chapter:'Macro',title:'Verified market update: policy decision',text:'A sourced update approved by Gotham.',url:'https://www.bog.gov.gh/mpc_press_release/mpc-press-release-september-2026/'}]}}));
  await p.route('**/api/rates',r=>r.fulfill({json:{rates:{USD:11.6173,EUR:13.0695,GBP:15.3724},more:{AED:3.1633,CHF:14.0236,CAD:8.1535,CNY:1.7313,XOF:.0199},updated:new Date().toISOString()}}));
  await p.goto(base+(lang==='fr'?'/fr/invest':'/invest')+extension);await p.waitForSelector('#company-chart');await p.waitForFunction(()=>document.querySelector('.currency-grid')?.textContent.includes('AED'));
  const statusText={en:['sources last checked','Retained official figures'],fr:['Sources officielles vérifiées','Données officielles conservées'],es:['Fuentes oficiales comprobadas','Se conservan los datos oficiales']}[lang];
  await p.waitForFunction(parts=>parts.some(x=>document.querySelector('[data-ghana-status]')?.textContent.includes(x)),statusText);
  ok(!!(await p.textContent('[data-ghana-status]')),'official data freshness shown on the investment page');
  ok((await p.textContent('[data-ghana-status]')).includes(({en:'Accra time',fr:'heure d’Accra',es:'hora de Acra'})[lang]),'source check time is explicitly in Accra timezone: '+lang);
  ok((await p.textContent('[data-ghana-sector-period]')).includes(seed.sources.bog.metrics.services.period),'sector summary uses the period from the data payload: '+lang);
  const legalText=(await p.textContent('#gipa')).replace(/\s+/g,' ');
  const legalPhrase={en:'for a foreign-owned trading enterprise',fr:'pour une entreprise commerciale détenue par des étrangers',es:'para una empresa comercial de propiedad extranjera'}[lang];
  ok(legalText.includes(legalPhrase),'Act 1173 workforce rule localized accurately: '+lang);
  const text=await p.textContent('#investor-research');ok(text.includes(seed.sources.gse.metrics.index.period),'publication date visible');
  ok(text.includes(({en:'Five-year price change',fr:'Variation du cours sur cinq ans',es:'Variación del precio en cinco años'})[lang]),'case studies translated: '+lang);
  ok((await p.textContent('#research-check-status')).includes(({en:'Official sources checked at least every six hours',fr:'Sources officielles vérifiées au moins toutes les six heures',es:'Fuentes oficiales comprobadas al menos cada seis horas'})[lang]),'six-hour source checks visible in '+lang);
  const feedCopy={en:'Latest verified market updates',fr:'Dernières informations vérifiées sur le marché',es:'Últimas novedades de mercado verificadas'};
  ok((await p.textContent('#market-updates')).includes(feedCopy[lang]),'verified updates heading localized: '+lang);
  ok((await p.textContent('#market-updates')).includes('Verified market update: policy decision'),'only the approved published update is shown');
  ok(await p.locator('#market-updates a[href^="https://www.bog.gov.gh/"]').count()===1,'published update retains its primary source link');
  ok(await p.locator('#research a[href*="gse.com.gh"]').count()>=8,'company examples link original GSE records');
  await p.selectOption('#company-chart','MTNGH');ok((await p.textContent('#company-series')).includes('0.64')||(await p.textContent('#company-series')).includes('0,64'),'interactive company history');
  await p.locator('.chart-years button[data-year="0"]').click();ok((await p.textContent('#chart-year'))==='2020' && /0[.,]64/.test(await p.textContent('#chart-price')),'tap a year reveals its exact sourced price');
  await p.locator('.chart-years button[data-year="5"]').focus();ok((await p.textContent('#chart-year'))==='2025','keyboard focus updates the chart');
  ok(await p.locator('.chart-line').count()===1,'animated data-driven price chart rendered');
  await p.fill('[name=amount]','1000');await p.fill('[name=annual]','10');await p.fill('[name=fx]','20');await p.selectOption('[name=years]','10');
  await p.locator('#investment-scenario button').click();ok((await p.textContent('#scenario-result')).includes('-'),'currency depreciation can produce a foreign-currency loss');
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page overflow: '+width);
  ok(errors.length===0,'no JavaScript errors');await ctx.close();
 }
 for(const [lang,phrases,legalPhrase,registrationPhrase] of [['de',['Amtliche Quellen geprüft','Gespeicherte amtliche Daten'],'Für ein ausländisches Handelsunternehmen verlangt Abschnitt 31','Nach Abschnitt 34 muss die GIPA ein ausländisch gehaltenes Unternehmen binnen fünf Tagen'],['ar',['تم التحقق من المصادر الرسمية','بيانات رسمية محفوظة'],'بالنسبة إلى المنشأة التجارية المملوكة لأجانب، تشترط المادة 31','بموجب المادة 34، على GIPA تسجيل المنشأة المملوكة لأجانب خلال خمسة أيام'],['zh',['官方来源核查日期','保留已发布的官方数据'],'根据第31条，外资贸易企业的全部员工中','根据第34条，若文件、适用的资本要求和费用符合规定']]){
  const ctx=await browser.newContext({viewport:{width:390,height:844}});await ctx.addInitScript(l=>localStorage.setItem('gc-language',l),lang);
  const p=await ctx.newPage();await p.route('**/api/ghana-data',r=>r.fulfill({json:seed}));await p.route('**/api/report/public',r=>r.fulfill({json:{updates:[]}}));
  await p.goto(base+`/${lang}/invest`+extension);await p.waitForFunction(parts=>parts.some(x=>document.querySelector('[data-ghana-status]')?.textContent.includes(x)),phrases);
  ok(!!(await p.textContent('[data-ghana-status]')),'official data freshness shown in '+lang);
  ok((await p.textContent('[data-ghana-status]')).includes(({de:'Ortszeit Accra',ar:'بتوقيت أكرا',zh:'阿克拉时间'})[lang]),'source check time is explicitly in Accra timezone: '+lang);
  ok((await p.textContent('[data-ghana-sector-period]')).includes(seed.sources.bog.metrics.services.period),'sector summary uses the period from the data payload: '+lang);
  const feedHeading={de:'Neueste geprüfte Marktinformationen',ar:'أحدث مستجدات السوق التي تم التحقق منها',zh:'最新核实的市场动态'}[lang];
  ok((await p.textContent('#market-updates')).includes(feedHeading),'verified updates heading localized in '+lang);
  ok((await p.textContent('#market-updates')).includes(({de:'Derzeit sind keine geprüften Meldungen veröffentlicht',ar:'لا توجد مستجدات تمت مراجعتها ونشرها بعد',zh:'目前尚无经过审核并发布的动态'})[lang]),'empty feed state is transparent: '+lang);
  const translatedLegal=(await p.textContent('#gipa')).replace(/\s+/g,' ');ok(translatedLegal.includes(legalPhrase),'Act 1173 workforce rule localized accurately: '+lang);
  const translatedFAQ=(await p.locator('.faqs').textContent()).replace(/\s+/g,' ');ok(translatedFAQ.includes(registrationPhrase),'Act 1173 registration answer localized accurately: '+lang);await ctx.close();
 }
 const ctx=await browser.newContext({viewport:{width:360,height:800}});const p=await ctx.newPage();
 await p.route('**/api/ghana-data',r=>r.abort());await p.route('**/api/rates',r=>r.abort());await p.route('**/api/report/public',r=>r.abort());await p.goto(base+'/invest'+extension);await p.waitForSelector('#company-chart');
 ok((await p.textContent('#research')).includes('2026-10-02'),'offline page keeps dated verified snapshot');
 ok((await p.textContent('#research')).includes('Rates unavailable'),'offline page does not invent current rates');await ctx.close();
 const reviewCtx=await browser.newContext();const reviewPage=await reviewCtx.newPage();const changed=structuredClone(seed);changed.research.items.wb.status='review';
 await reviewPage.route('**/api/ghana-data',r=>r.fulfill({json:changed}));await reviewPage.route('**/api/rates',r=>r.abort());await reviewPage.goto(base+'/invest'+extension);
 await reviewPage.waitForFunction(()=>document.querySelector('#research-check-status')?.textContent.includes('Source checks requiring review'));
 ok((await reviewPage.textContent('#research-check-status')).includes('World Bank'),'changed research source is flagged instead of silently claimed current');await reviewCtx.close();
 console.log('PASSED');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
