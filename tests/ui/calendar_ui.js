// Back-office calendar in a browser, laptop and phone. Needs seed_demo.py + seed_crm.py on :4199.
const { chromium, devices } = require(process.env.PLAYWRIGHT);
const B='http://127.0.0.1:4199';
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM});
for (const [n,opt] of [['desk',{viewport:{width:1440,height:960}}],['phone',devices['iPhone 14']]]){
 const p=await b.newPage(opt); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto(B+'/admin'); await p.fill('#e','admin'); await p.fill('#pw','Admin2025-qa!'); await p.click('#lform button'); await p.waitForSelector('#app',{state:'visible'});
 await p.evaluate(()=>{try{localStorage.removeItem('gc-cal')}catch(e){}});
 await p.goto(B+'/admin#cal'); await p.waitForSelector('#calw'); await p.waitForTimeout(500);
 console.log(n,'mode',await p.$eval('#cal-mode .on',e=>e.dataset.m),'| sum:',(await p.textContent('.cal-sum')).trim());
 console.log(n,'filters:',(await p.$$eval('.cal-fc',a=>a.map(x=>x.textContent.trim().replace(/\s+/g,' ')))).join(' | '));
 await p.screenshot({path:`/tmp/qa/cal-${n}-1.png`,fullPage:true});
 if(n==='desk'){
  // next month (events on 24 Oct)
  await p.click('#cal-n'); await p.waitForTimeout(700); console.log(n,'title',await p.textContent('.cal-title'), 'chips',await p.$$eval('.cal-e',a=>a.length));
  await p.screenshot({path:'/tmp/qa/cal-desk-oct.png',fullPage:true});
  await p.click('#cal-t'); await p.waitForTimeout(700);
  // drag first movable chip one day later
  const mv=await p.$('.cal-e[draggable="true"]');
  if(mv){const key=await mv.getAttribute('data-ck'); const d0=await mv.evaluate(e=>e.closest('.cal-d').dataset.day);
   const target=await p.evaluate(d=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+1);return x.toISOString().slice(0,10)},d0);
   await p.dragAndDrop(`[data-ck="${key}"]`,`.cal-d[data-day="${target}"]`); await p.waitForTimeout(900);
   const now=await p.evaluate(k=>document.querySelector(`[data-ck="${k}"]`)?.closest('.cal-d')?.dataset.day,key); console.log(n,'drag',key,d0,'->',now, now===target?'OK':'FAIL');}
  // day click + quick add
  const td=new Date().toISOString().slice(0,10);
  await p.click(`.cal-d[data-day="${td}"] .cal-n`); await p.waitForSelector('#cal-q'); await p.fill('#cal-qt','Calendar quick task'); await p.click('#cal-q button'); await p.waitForTimeout(900);
  console.log(n,'quick add', await p.evaluate(()=>[...document.querySelectorAll('.cal-e span')].some(s=>s.textContent==='Calendar quick task')));
  // open a task
  await p.click('.cal-e.t-task'); await p.waitForSelector('#cal-pop'); await p.click('#cal-pop .cal-row.hl'); await p.waitForTimeout(700); console.log(n,'task drawer', await p.isVisible('#tf-t'), await p.inputValue('#tf-t').catch(()=>'')); await p.keyboard.press('Escape');
  // week + agenda
  await p.click('#cal-mode [data-m=week]'); await p.waitForTimeout(600); await p.screenshot({path:'/tmp/qa/cal-desk-week.png',fullPage:true});
  await p.click('#cal-mode [data-m=agenda]'); await p.waitForTimeout(600); console.log(n,'agenda days',await p.$$eval('.cal-ad',a=>a.length)); await p.screenshot({path:'/tmp/qa/cal-desk-agenda.png',fullPage:true});
  // filter off tasks
  await p.click('.cal-fc[data-t=task]'); await p.waitForTimeout(600); console.log(n,'tasks hidden', await p.$$eval('.cal-row.t-task',a=>a.length)===0); await p.click('.cal-fc[data-t=task]'); await p.waitForTimeout(400);
  // open deal from agenda
  const dealRow=await p.$('.cal-row.t-deal'); if(dealRow){await dealRow.click(); await p.waitForTimeout(800); console.log(n,'deal drawer', await p.isVisible('#dr.on'));await p.keyboard.press('Escape');}
  // feed drawer
  await p.click('#cal-feed'); await p.waitForSelector('#cf-url'); console.log(n,'feed', (await p.inputValue('#cf-url')).replace(/[a-f0-9]{40}/,'<token>'));
  await p.screenshot({path:'/tmp/qa/cal-desk-feed.png'}); await p.keyboard.press('Escape');
 } else {
  await p.click('#cal-mode [data-m=month]'); await p.waitForTimeout(600);
  const td=new Date().toISOString().slice(0,10); await p.tap(`.cal-d[data-day="${td}"]`); await p.waitForTimeout(500);
  await p.screenshot({path:'/tmp/qa/cal-phone-month.png',fullPage:true});
  console.log(n,'day panel',await p.isVisible('.cal-dd'));
 }
 console.log(n,'sideways',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errors',errs);
 await p.close();}
await b.close();})().catch(e=>{console.error(e);process.exit(1)});
