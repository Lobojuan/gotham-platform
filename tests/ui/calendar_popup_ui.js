// Calendar day pop-up: no scrolling away, lists the day, quick add, Escape. Needs seed_demo.py + seed_crm.py on :4199.
const { chromium, devices } = require(process.env.PLAYWRIGHT);
const B='http://127.0.0.1:4199';
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM});
for (const [n,opt] of [['desk',{viewport:{width:1440,height:900}}],['phone',devices['iPhone 14']]]){
 const p=await b.newPage({...opt,extraHTTPHeaders:{'x-real-ip':'10.92.'+Math.floor(Math.random()*250)+'.7'}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto(B+'/admin'); await p.fill('#e','admin'); await p.fill('#pw','Admin2025-qa!'); await p.click('#lbtn'); await p.waitForSelector('#app',{state:'visible'});
 await p.evaluate(()=>{try{localStorage.setItem('gc-cal',JSON.stringify({mode:'month'}))}catch(e){}});
 await p.goto(B+'/admin#cal'); await p.waitForSelector('#calw'); await p.click('#cal-mode [data-m=month]'); await p.waitForTimeout(700);
 const td=new Date().toISOString().slice(0,10);
 const y0=await p.evaluate(()=>scrollY); await p.click(`.cal-d[data-day="${td}"] .cal-n`); await p.waitForSelector('#cal-pop.in'); await p.waitForTimeout(250);
 const y1=await p.evaluate(()=>scrollY);
 const info=await p.evaluate(()=>{const r=document.querySelector('#cal-pop').getBoundingClientRect();return {rows:document.querySelectorAll('#cal-pop .cal-row').length,inView:r.top>=0&&r.bottom<=innerHeight+1,sheet:document.querySelector('#cal-pop').classList.contains('sheet')}});
 console.log(n,'scroll before/after',y0,y1,'pop',JSON.stringify(info),'head:',(await p.textContent('.cal-pop-h')).replace(/\s+/g,' ').trim());
 await p.screenshot({path:`/tmp/qa/calpop-${n}.png`});
 await p.fill('#cal-qt','Pop-up task'); await p.click('#cal-q button'); await p.waitForTimeout(900);
 console.log(n,'popup closed after add',!(await p.$('#cal-pop')));
 await p.click(`.cal-d[data-day="${td}"] .cal-n`); await p.waitForSelector('#cal-pop'); console.log(n,'task listed',await p.$$eval('#cal-pop .cal-row b',a=>a.some(x=>x.textContent==='Pop-up task')));
 await p.keyboard.press('Escape'); console.log(n,'escape closes',!(await p.$('#cal-pop')));
 console.log(n,'errors',errs); await p.close();}
await b.close();})().catch(e=>{console.error(e);process.exit(1)});
