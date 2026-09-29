// Invoices & quotes in the back office: settings card, new invoice with live Ghana tax, BoG currency rule, issue, payment with WHT,
// quotation from a deal, client page. Needs seed_demo.py + seed_crm.py on :4199. Screenshots to /tmp/qa/inv-*.png
const { chromium, devices } = require(process.env.PLAYWRIGHT);
const B='http://127.0.0.1:4199';
const assert=(c,m)=>{if(!c)throw new Error('FAIL '+m);console.log('  ok',m)};
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM});
for (const [n,opt] of [['desk',{viewport:{width:1440,height:900}}],['phone',devices['iPhone 14']]]){
 const p=await b.newPage({...opt,extraHTTPHeaders:{'x-real-ip':'10.94.'+Math.floor(Math.random()*250)+'.7'}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto(B+'/admin'); await p.fill('#e','admin'); await p.fill('#pw','Admin2025-qa!'); await p.click('#lform button'); await p.waitForSelector('#app',{state:'visible'});
 // settings: company & invoicing
 await p.goto(B+'/admin#settings'); await p.waitForSelector('#is-sv');
 await p.fill('#is-tin','C0099887766'); await p.selectOption('#is-vr','yes'); await p.fill('#is-vn','C0099887766'); await p.fill('#bk-bn','TEST BANK GHANA LIMITED'); await p.fill('#bk-sw','TSTBGHAC'); await p.fill('#bk-br','Osu'); await p.fill('#bk-bc','200116'); await p.fill('#bk-an','GOTHAM CONSULT'); await p.fill('#bk-ag','0202090000999');
 await p.fill('#bk-ad','Oxford Street, Osu, Accra, Ghana');
 const cr=p.locator('#bk-corr .bk-c'); await cr.nth(0).locator('[data-k=currency]').selectOption('EUR'); await cr.nth(0).locator('[data-k=bank]').fill('Test Correspondent AG'); await cr.nth(0).locator('[data-k=swift]').fill('TSTCDEFF'); await cr.nth(0).locator('[data-k=city]').fill('Frankfurt, Germany'); await cr.nth(0).locator('[data-k=account]').fill('111122223333');
 await cr.nth(1).locator('[data-k=currency]').selectOption('USD'); await cr.nth(1).locator('[data-k=bank]').fill('Test Trust Americas'); await cr.nth(1).locator('[data-k=swift]').fill('TSTAUS33'); await cr.nth(1).locator('[data-k=city]').fill('New York, USA'); await cr.nth(1).locator('[data-k=account]').fill('44445555');
 await cr.nth(2).locator('[data-k=swift]').fill('bad'); await cr.nth(2).locator('[data-k=currency]').selectOption('GBP'); await cr.nth(2).locator('[data-k=bank]').fill('Test London');
 await p.click('#is-sv'); await p.waitForTimeout(500); assert(await p.$eval('#bk-corr .bk-c[data-i="2"] [data-k=swift]',e=>e.classList.contains('bad')), n+' a wrong SWIFT code is refused and marked');
 await cr.nth(2).locator('[data-k=swift]').fill('TSTLGB2L');
 await p.click('#is-sv'); await p.waitForTimeout(600);
 assert(await p.inputValue('#is-tin')==='C0099887766', n+' settings saved (TIN, VAT registered, bank)');
 assert(await p.inputValue('#bk-ag')==='0202090000999', n+' bank details saved');
 const pv=await b.newPage(opt); await p.context().cookies().then(c=>pv.context().addCookies(c)); await pv.goto(B+'/api/invoices/preview?c=USD');
 assert((await pv.textContent('body')).includes('TSTAUS33'), n+' sample preview shows the dollar intermediary bank'); await pv.screenshot({path:'/tmp/qa/inv-preview-usd-'+n+'.png',fullPage:true}); await pv.goto(B+'/api/invoices/preview?c=GHS'); await pv.screenshot({path:'/tmp/qa/inv-preview-ghs-'+n+'.png',fullPage:true}); await pv.close();
 if(n==='desk') await p.screenshot({path:'/tmp/qa/inv-settings.png',fullPage:false,clip:{x:0,y:0,width:1440,height:900}});
 // list
 await p.goto(B+'/admin#inv'); await p.waitForSelector('#if-tb');
 assert(await p.isVisible('text=Tax this month'), n+' invoices view with KPIs');
 await p.click('[data-new=invoice]'); await p.waitForSelector('#iv-ls .inv-l');
 await p.fill('#iv-co','Akosombo Logistics Ltd'); await p.fill('#iv-nm','Efua Asante'); await p.fill('#iv-em','efua@akosombo.test');
 const l=p.locator('#iv-ls .inv-l').first(); await l.locator('[data-f=description]').fill('Market entry advisory'); await l.locator('[data-f=qty]').fill('2'); await l.locator('[data-f=unit]').fill('1500');
 await p.click('#iv-add'); const l2=p.locator('#iv-ls .inv-l').nth(1); await l2.locator('[data-f=description]').fill('GIPA registration'); await l2.locator('[data-f=unit]').fill('1000'); await l2.locator('[data-f=discount]').fill('10');
 const sum=await p.textContent('#iv-sum');
 assert(sum.includes('GHS 3,900.00')&&sum.includes('VAT 15%')&&sum.includes('GHS 585.00')&&sum.includes('NHIL 2.5%')&&sum.includes('GHS 97.50')&&sum.includes('GHS 4,680.00'), n+' live totals: 3,900 + VAT 585 + NHIL 97.50 + GETFund 97.50 = 4,680');
 assert(await p.$eval('#iv-cur option[value=EUR]',o=>o.disabled), n+' euro locked for a resident client (Bank of Ghana)');
 await p.selectOption('#iv-wht','7.5'); assert((await p.textContent('#iv-sum')).includes('GHS 4,387.50'), n+' WHT 7.5%: you receive 4,387.50');
 if(n==='phone') await p.screenshot({path:'/tmp/qa/inv-edit-phone.png',fullPage:false});
 else await p.screenshot({path:'/tmp/qa/inv-edit.png'});
 await p.click('#iv-iss'); await p.waitForSelector('#is-cp'); const h=await p.textContent('#drb h2');
 assert(/INV-\d{4}-\d{4}/.test(h), n+' issued: '+h.trim());
 // payment
 assert(await p.inputValue('#ip-w')==='292.5', n+' payment form pre-fills WHT 292.50');
 await p.fill('#ip-a','4387.5'); await p.check('#ip-c'); await p.click('#ip-s'); await p.waitForTimeout(700);
 assert((await p.textContent('#drb h2')).includes('Paid'), n+' paid in full with WHT');
 if(n==='desk') await p.screenshot({path:'/tmp/qa/inv-paid.png'});
 // client page
 const link=await p.getAttribute('#drb a[target=_blank]','href');
 const c=await b.newPage(opt); await c.goto(link); const t=await c.textContent('body');
 assert(t.includes('TAX INVOICE')&&t.includes('C0099887766')&&t.includes('PAID')&&t.includes('GETFund'), n+' client page: tax invoice, TIN, PAID');
 await c.screenshot({path:'/tmp/qa/inv-client-'+n+'.png',fullPage:true}); await c.close();
 await p.keyboard.press('Escape');
 // foreign currency quotation
 await p.click('[data-new=quote]'); await p.waitForSelector('#iv-ls .inv-l');
 await p.fill('#iv-co','Nordic Sun ApS'); await p.fill('#iv-nm','Lars Holm'); await p.fill('#iv-cty','Denmark'); await p.selectOption('#iv-res','non_resident');
 assert(!(await p.$eval('#iv-cur option[value=EUR]',o=>o.disabled)), n+' euro unlocked for non-resident');
 await p.selectOption('#iv-cur','EUR'); await p.fill('#iv-fx','17.25'); await p.selectOption('#iv-tm','zero');
 assert(await p.inputValue('#iv-tn')==='Export of services to a non-resident', n+' zero-rating reason suggested');
 await p.locator('#iv-ls .inv-l [data-f=description]').first().fill('Ghana market study'); await p.locator('#iv-ls .inv-l [data-f=unit]').first().fill('2000');
 assert((await p.textContent('#iv-sum')).includes('GHS 34,500.00'), n+' cedi value shown (EUR 2,000 × 17.25)');
 await p.click('#iv-iss'); await p.waitForSelector('#is-conv'); assert(/QUO-/.test(await p.textContent('#drb h2')), n+' quotation issued');
 await p.click('#is-conv'); await p.waitForTimeout(800); assert(await p.isVisible('#iv-iss'), n+' turned into a draft invoice');
 await p.keyboard.press('Escape');
 // list shows them
 await p.goto(B+'/admin#inv'); await p.waitForSelector('#if-tb tr'); const rows=await p.$$eval('#if-tb tr',r=>r.length); assert(rows>=3, n+' list has '+rows+' rows');
 if(n==='phone') await p.screenshot({path:'/tmp/qa/inv-list-phone.png',fullPage:true}); else await p.screenshot({path:'/tmp/qa/inv-list.png'});
 // from a deal
 await p.goto(B+'/admin#pipe'); await p.waitForTimeout(900); const card=p.locator('[data-deal]').first();
 if(await card.count()){await card.click(); await p.waitForSelector('#df-quo'); await p.click('#df-quo'); await p.waitForSelector('#iv-ls .inv-l');
  assert((await p.inputValue('#iv-ls .inv-l [data-f=description]')).length>0, n+' quotation from a deal pre-fills the line'); await p.keyboard.press('Escape');}
 // no page errors, no sideways scroll on phones
 const over=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth); assert(over<=1, n+' no sideways scroll ('+over+')');
 assert(!errs.length, n+' no page errors '+errs.join(' | '));
 await p.close();}
await b.close();console.log('PASSED')})().catch(e=>{console.error(e);process.exit(1)});
