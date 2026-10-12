// Calendar: clicking an item inside a day opens the day pop-up (not the item's page). Needs seed_demo.py + seed_crm.py on :4199.
const { chromium, devices } = require(process.env.PLAYWRIGHT);
const B='http://127.0.0.1:4199';
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM});
for (const [n,opt] of [['desk',{viewport:{width:1440,height:900}}],['phone',devices['iPhone 14']]]){
 const p=await b.newPage({...opt,extraHTTPHeaders:{'x-real-ip':'10.93.'+Math.floor(Math.random()*250)+'.7'}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto(B+'/admin'); await p.fill('#e','admin'); await p.fill('#pw','Admin2025-qa!'); await p.click('#lbtn'); await p.waitForSelector('#app',{state:'visible'});
 await p.goto(B+'/admin#cal'); await p.waitForSelector('#calw'); await p.click('#cal-mode [data-m=month]'); await p.waitForTimeout(700);
 const chip=p.locator('.cal-d .cal-e.t-registration').first();
 if(n==='desk'){ await chip.click(); } else { await p.locator('.cal-d:has(.cal-dots i.t-registration)').first().tap(); }
 await p.waitForTimeout(500);
 console.log(n,'hash',await p.evaluate(()=>location.hash),'popup',!!(await p.$('#cal-pop')),'highlighted',await p.$$eval('#cal-pop .cal-row.hl b',a=>a.map(x=>x.textContent)));
 // week view chip too
 await p.keyboard.press('Escape'); await p.click('#cal-mode [data-m=week]'); await p.waitForTimeout(600);
 const wk=p.locator('.cal-col .cal-e').first(); if(await wk.count()){await wk.click(); await p.waitForTimeout(400); console.log(n,'week chip -> popup',!!(await p.$('#cal-pop')),'hash',await p.evaluate(()=>location.hash));}
 // a row inside the pop-up opens the item
 await p.locator('#cal-pop .cal-row').first().click(); await p.waitForTimeout(700); console.log(n,'row in pop-up opens item: hash',await p.evaluate(()=>location.hash),'drawer',await p.isVisible('#dr.on').catch(()=>false));
 console.log(n,'errors',errs); await p.close();}
await b.close();})().catch(e=>{console.error(e);process.exit(1)});
