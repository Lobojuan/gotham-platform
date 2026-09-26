// Phone E2E: the shortest possible registration, plus what people see when they miss something
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright-core');
const B='http://127.0.0.1:4199';
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM||undefined,args:['--no-sandbox']});
 const ok=m=>console.log('  ok',m);
 for (const dev of [{n:'iphone-se',w:375,h:667},{n:'galaxy-a',w:360,h:800}]) {
 const c=await b.newContext({viewport:{width:dev.w,height:dev.h},isMobile:true,hasTouch:true,deviceScaleFactor:2,extraHTTPHeaders:{'x-real-ip':'10.88.'+Math.floor(Math.random()*250)+'.1'}});
 const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto(B+'/register?e=F1',{waitUntil:'networkidle'});
 const btn=p.locator('#goSend'); console.log(dev.n, 'button says:', await btn.textContent());
 // 1. press with nothing filled in
 await btn.tap(); await p.waitForTimeout(700);
 const e2=await p.textContent('#err2'); if(!/name/i.test(e2)) throw new Error('no visible error by the button: '+e2);
 const inView=await p.evaluate(()=>{const r=document.querySelector('#nm').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight});
 if(!inView) throw new Error('page did not scroll to the missing field'); ok('empty form: message by the button + scrolled to "Your full name"');
 // 2. name only
 await p.fill('#nm','Akosua Mensah'); await btn.tap(); await p.waitForTimeout(700);
 if(!/WhatsApp/.test(await p.textContent('#err2'))) throw new Error('phone message missing'); ok('asks for WhatsApp number next');
 await p.fill('#ph','024 412 3456'); await btn.tap(); await p.waitForTimeout(700);
 if(!/tick/.test(await p.textContent('#err2'))) throw new Error('consent message missing'); ok('asks for the tick box next');
 // consent: tap the checkbox on a phone
 await p.locator('#cons').tap(); if(!await p.isChecked('#cons')) throw new Error('checkbox did not tick on tap'); ok('consent box ticks with one tap');
 const box=await p.locator('#cons').boundingBox(); if(box.width<20) throw new Error('checkbox too small: '+box.width); ok('checkbox is '+Math.round(box.width)+'px, easy to hit');
 // 3. submit: no company, no email, no reg number
 await btn.tap(); await p.waitForSelector('#ok.on',{timeout:8000});
 const t=await p.textContent('#okTitle'); ok(dev.n+': registered with just name + WhatsApp → "'+t+'"');
 if(errs.length) throw new Error('JS errors: '+errs.join('; '));
 await c.close();
 }
 // did it land?
 await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
