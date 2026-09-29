// Email designer in a browser: template, picture upload, blocks, live preview, save, laptop and phone. Needs seed_demo.py + seed_crm.py on :4199 and /tmp/qa/pic.jpg.
const { chromium, devices } = require(process.env.PLAYWRIGHT);
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM});
for (const [n,opt] of [['desk',{viewport:{width:1440,height:960}}],['phone',devices['iPhone 14']]]){
 const p=await b.newPage({...opt,extraHTTPHeaders:{'x-real-ip':'10.88.'+Math.floor(Math.random()*250)+'.5'}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept(n==='desk'?'Monthly promotion':'Phone design'));
 await p.goto('http://127.0.0.1:4199/admin'); await p.fill('#e','admin'); await p.fill('#pw','Admin2025-qa!'); await p.click('#lform button'); await p.waitForSelector('#app',{state:'visible'});
 await p.goto('http://127.0.0.1:4199/admin#out'); await p.waitForSelector('#c-new'); await p.click('#c-new'); await p.waitForSelector('#c-tpl');
 await p.selectOption('#c-tpl','designer'); await p.waitForSelector('#dz-blocks .dz-b'); await p.waitForTimeout(900);
 console.log(n,'default blocks',await p.$$eval('.dz-b .dz-tag',a=>a.map(x=>x.textContent).join(',')));
 await p.selectOption('#dz-tpl',{label:'Newsletter'}); await p.click('#dz-use'); await p.waitForTimeout(900);
 console.log(n,'after template',await p.$$eval('.dz-b .dz-tag',a=>a.map(x=>x.textContent).join(',')),'| subject',await p.inputValue('#c-subj'));
 await p.fill('#c-name','Designer test '+n);
 // upload a picture into the first picture+text block
 await p.setInputFiles('.dz-b:nth-child(3) input[type=file]','/tmp/qa/pic.jpg'); await p.waitForSelector('.dz-b:nth-child(3) .dz-pic img',{timeout:15000});
 // add a button block and type
 await p.click('.dz-ab[data-add=button]'); await p.waitForTimeout(300);
 const last=p.locator('.dz-b').last(); await last.locator('[data-k=label]').fill('Book a call'); await last.locator('[data-k=url]').fill('https://wa.me/233550416627');
 await p.waitForTimeout(1200);
 const f=p.frameLocator('#dz-if');
 console.log(n,'preview has picture',await f.locator('img[src*="-email.jpg"]').count(),'button',await f.locator('a:has-text("Book a call")').count(),'heading',await f.locator('h1').first().textContent());
 // move last block up, delete divider
 await last.locator('[data-mv="-1"]').click(); await p.waitForTimeout(200);
 await p.locator('.dz-b:has(.dz-tag:has-text("Line")) [data-del]').click(); await p.waitForTimeout(300);
 console.log(n,'after move/delete',await p.$$eval('.dz-b .dz-tag',a=>a.map(x=>x.textContent).join(',')));
 if(n==='desk'){await p.click('#dz-dev [data-d="1"]'); await p.waitForTimeout(400); await p.screenshot({path:'/tmp/qa/dz-desk.png'}); await p.click('#dz-dev [data-d="0"]');
  await p.click('#dz-savet'); await p.waitForTimeout(800); console.log(n,'saved template in list',await p.$$eval('#dz-tpl option',a=>a.some(o=>o.textContent==='Monthly promotion')));}
 else { await p.locator('#dz-fw').scrollIntoViewIfNeeded(); await p.screenshot({path:'/tmp/qa/dz-phone.png'}); }
 await p.click('#c-save'); await p.waitForTimeout(900);
 console.log(n,'saved, designer still there',await p.$$eval('.dz-b',a=>a.length),'tpl',await p.inputValue('#c-tpl'));
 await p.click('#c-prev'); await p.waitForSelector('#c-if'); await p.waitForTimeout(600);
 console.log(n,'server preview picture',await p.frameLocator('#c-if').locator('img[src*="-email.jpg"]').count());
 console.log(n,'sideways',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errors',errs);
 await p.close();}
await b.close();})().catch(e=>{console.error(e);process.exit(1)});
