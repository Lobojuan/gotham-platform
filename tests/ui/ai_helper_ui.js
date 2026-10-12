// Back-office AI buttons in a browser (laptop, phone). Server on :4199 with OPENAI_BASE_URL at tests/e2e/mock_ai.js (MOCK_PORT=4297), seed_demo.py + seed_crm.py.
const { chromium, devices } = require(process.env.PLAYWRIGHT);
const B='http://127.0.0.1:4199';
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM});
for (const [n,opt] of [['desk',{viewport:{width:1440,height:960}}],['phone',devices['iPhone 14']]]){
 const p=await b.newPage({...opt,extraHTTPHeaders:{'x-real-ip':'10.91.'+Math.floor(Math.random()*250)+'.7'}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
 await p.goto(B+'/admin'); await p.fill('#e','admin'); await p.fill('#pw','Admin2025-qa!'); await p.click('#lbtn'); await p.waitForSelector('#app',{state:'visible'});
 // campaign: classic email
 await p.goto(B+'/admin#out'); await p.waitForSelector('#c-new'); await p.click('#c-new'); await p.waitForSelector('#c-ai');
 await p.click('#c-ai'); await p.fill('.ai-brief textarea','Invite mining MDs to the October forum'); await p.click('.ai-brief .btn-dark'); await p.waitForFunction(()=>document.querySelector('#c-intro').value.length>5);
 console.log(n,'email:',await p.inputValue('#c-subj'),'|',(await p.inputValue('#c-intro')).slice(0,40).replace(/\n/g,' '));
 // designer
 await p.selectOption('#c-tpl','designer'); await p.waitForSelector('#dz-ai'); await p.click('#dz-ai'); await p.fill('.ai-brief textarea','Newsletter'); await p.click('.ai-brief .btn-dark');
 await p.waitForTimeout(1500); console.log(n,'designer blocks:',await p.$$eval('.dz-b .dz-tag',a=>a.map(x=>x.textContent).join(',')));
 // sms
 await p.click('#c-ch [data-ch=sms]'); await p.click('#c-ai2'); await p.fill('.ai-brief textarea','Remind guests'); await p.click('.ai-brief .btn-dark'); await p.waitForFunction(()=>document.querySelector('#c-sms').value.length>5);
 console.log(n,'sms:',await p.inputValue('#c-sms'));
 // record summary
 const cid=await p.evaluate(async()=>(await (await fetch('/api/contacts')).json()).rows[0].id);
 await p.goto(B+'/admin#rec/'+cid); await p.waitForSelector('#rc-ai'); await p.click('#rc-ai'); await p.waitForSelector('.ai-out'); console.log(n,'summary:',(await p.textContent('.ai-out')).slice(0,70));
 await p.click('#rc-ait'); await p.waitForTimeout(400); console.log(n,'task prefilled:',await p.inputValue('#tf-t').catch(()=>'-')); await p.keyboard.press('Escape');
 // deal next step
 await p.goto(B+'/admin#pipe'); await p.waitForTimeout(800); await p.locator('.kcard, [data-deal]').first().click().catch(()=>{}); await p.waitForTimeout(800);
 if(await p.$('#df-ai')){await p.click('#df-ai'); await p.waitForFunction(()=>document.querySelector('#df-n').value==='Send the sponsorship proposal',null,{timeout:8000}).catch(()=>{}); console.log(n,'deal next:',await p.inputValue('#df-n'),await p.inputValue('#df-nd'),'|',await p.textContent('#df-aiw'));}
 else console.log(n,'deal drawer not opened');
 await p.keyboard.press('Escape');
 // settings
 await p.goto(B+'/admin#settings'); await p.waitForSelector('#wa-ai'); await p.waitForTimeout(600); console.log(n,'wa card:',(await p.textContent('#wa-st')).trim());
 if(n==='desk') await p.screenshot({path:'/tmp/qa/ai-settings.png',fullPage:false});
 console.log(n,'sideways',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errors',errs);
 await p.close();}
await b.close();})().catch(e=>{console.error(e);process.exit(1)});
