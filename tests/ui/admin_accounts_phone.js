const QA = process.env.QA_DIR || '/tmp/qa';
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright-core');
const B='http://127.0.0.1:4199', fs=require('fs');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM||undefined,args:['--no-sandbox']});
 const ok=m=>console.log('  ok',m);
 const ctx=()=>b.newContext({viewport:{width:375,height:667},isMobile:true,hasTouch:true,deviceScaleFactor:2,extraHTTPHeaders:{'x-real-ip':'10.99.'+Math.floor(Math.random()*250)+'.3'}});
 // staff member on a first password
 let c=await ctx(), p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto(B+'/admin'); await p.fill('#e','door'); await p.fill('#pw',fs.readFileSync(QA+'/staffpw','utf8').trim()); await p.tap('#lform button');
 await p.waitForSelector('#pwform'); ok('first sign-in shows "Choose your own password", nothing else');
 await p.screenshot({path:QA+'/first_pw.png'});
 await p.fill('#fp-cur',fs.readFileSync(QA+'/staffpw','utf8').trim()); await p.fill('#fp-new','door-staff-2026'); await p.fill('#fp-new2','door-staff-2027');
 await p.tap('#pwform button.btn-dark'); await p.waitForTimeout(500); if(!/match/.test(await p.textContent('#fp-err'))) throw new Error('mismatch not caught'); ok('mismatched new passwords caught');
 await p.tap('[data-eye="fp-new"]'); if(await p.getAttribute('#fp-new','type')!=='text') throw new Error('show toggle'); ok('Show/Hide works');
 await p.fill('#fp-new2','door-staff-2026'); await p.tap('#pwform button.btn-dark'); await p.waitForSelector('#app',{state:'visible'}); ok('password saved, back office opens');
 await c.close();
 // owner: menu, settings, add a person
 c=await ctx(); p=await c.newPage(); p.on('pageerror',e=>errs.push(e.message));
 await p.goto(B+'/admin'); await p.fill('#e','admin'); await p.fill('#pw','Admin2025-qa!'); await p.tap('#lform button'); await p.waitForSelector('#app',{state:'visible'});
 if(!await p.isVisible('#bnav')) throw new Error('no bottom bar on phone'); if(!await p.isVisible('#hamb')) throw new Error('no menu button'); ok('phone shows the bottom bar and a menu button');
 await p.tap('#hamb'); await p.waitForTimeout(300); await p.tap('#nav a[data-v="settings"]'); await p.waitForSelector('#u-new'); ok('Menu → Settings');
 await p.tap('#u-new'); await p.fill('#u-name','Operations Lead'); await p.fill('#u-email','ops'+Date.now()%100000+'@gothamconsult.com'); await p.selectOption('#u-role','owner'); await p.tap('#u-add');
 await p.waitForSelector('#u-pw'); const pw=await p.textContent('#u-pw'); ok('owner added a new owner (super admin); first password shown once: '+pw.length+' chars');
 await p.screenshot({path:QA+'/team.png',fullPage:true});
 await p.tap('#u-new'); await p.fill('#u-name','Dup'); await p.fill('#u-email','JOY@GOTHAMCONSULT.COM'); await p.tap('#u-add'); await p.waitForTimeout(500);
 if(!/already/.test(await p.textContent('#u-err'))) throw new Error('dup not reported'); ok('adding the same email twice is explained');
 // own password
 await p.fill('#cp-cur','wrong'); await p.fill('#cp-new','Admin2026-qa!!'); await p.fill('#cp-new2','Admin2026-qa!!'); await p.tap('#sp'); await p.waitForTimeout(600);
 if(!/current password/.test(await p.textContent('#cp-err'))) throw new Error('wrong current not shown'); ok('wrong current password explained');
 await p.fill('#cp-cur','Admin2025-qa!'); await p.tap('#sp'); await p.waitForTimeout(800); if(await p.textContent('#cp-err')) throw new Error(await p.textContent('#cp-err')); ok('own password changed from Settings');
 await p.tap('#bnav a[data-b="more"]'); await p.waitForTimeout(300); await p.tap('#nav a[data-v="regs"]'); await p.waitForTimeout(800); ok('still signed in after the change (this device keeps working)');
 await p.screenshot({path:QA+'/regs_cards.png'});
 if(errs.length) throw new Error(errs.join('; '));
 await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
