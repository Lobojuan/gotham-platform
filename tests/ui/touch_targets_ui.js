// Phones: every control is finger-sized (44px+ tall, 24px+ wide), fields are 16px (no iPhone zoom), no sideways scroll.
// Covers the public site in six languages, the member account and the back office.
const {chromium,devices}=require(process.env.PLAYWRIGHT||'playwright');
const fs=require('fs'),path=require('path'),ROOT=path.join(__dirname,'..','..');
{const src=fs.readFileSync(path.join(ROOT,'apps/site/public/assets/v2/phone-mode.js'),'utf8').replace(/^\/\*[\s\S]*?\*\/\s*/,'').trim();
 if(!fs.readFileSync(path.join(ROOT,'apps/crm/public/admin.html'),'utf8').includes('<script>'+src+'</script>'))throw Error('back-office phone-mode copy differs from apps/site/public/assets/v2/phone-mode.js');}
// live pages load our CSS from another host (ASSET_URL): phone-mode can only read it in CORS mode
for(const f of ['index.html','membership.html','ghana-investment-report.html','register.html','ar/index.html']){const h=fs.readFileSync(path.join(ROOT,'apps/site/dist',f),'utf8');
 const bad=(h.match(/<link rel="stylesheet"[^>]*>/g)||[]).filter(l=>!/googleapis/.test(l)&&!/crossorigin="anonymous"/.test(l));
 if(bad.length)throw Error(`${f}: style sheets without crossorigin: ${bad.join(' ')}`);}
// a phone with the browser's "Desktop site" switched on: 980px layout on a 360px touch screen
const DESKTOP_SITE={viewport:{width:980,height:2015},screen:{width:360,height:740},hasTouch:true,isMobile:false,deviceScaleFactor:1,userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'};
const B=process.env.BASE||'http://127.0.0.1:4199';
let PW=process.env.ADMIN_PASSWORD||'e2e-owner-pass';   // changes once if the account must set a new password
const PAGES=['/','/membership','/account','/ghana-investment-report','/services','/services/market-entry','/invest','/invest/join','/register','/family','/tools','/insights','/insights/ghana-vat-2026-explained','/about','/mining','/forums','/events','/privacy','/terms','/sources',
 '/fr','/fr/membership','/es/account','/de/ghana-investment-report','/ar','/ar/membership','/ar/account','/zh/membership'];
const VIEWS=['dash','members','chat','cal','tasks','pipe','contacts','imp','inv','web','reports','regs','events','subs','door','mail','out','spon','qr','links','data','settings'];
let checks=0;const ok=(v,m)=>{if(!v)throw Error(m);checks++};
const scan=()=>{const bad=[],small=[],de=document.documentElement,k=Math.min(1,screen.width/de.clientWidth);   // k: size on the actual screen (Desktop site scales the page down)
 const vis=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return r.width>2&&r.height>2&&s.visibility!=='hidden'&&s.display!=='none'&&+s.opacity>.05};
 const sig=e=>{const a=[];let x=e;for(let i=0;i<3&&x&&x!==document.body;i++,x=x.parentElement)a.unshift(x.tagName.toLowerCase()+(typeof x.className==='string'&&x.className.trim()?'.'+x.className.trim().split(/\s+/)[0]:''));return a.join('>')};
 document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=tab]').forEach(e=>{
  if(!vis(e)||e.closest('#login,.hp,.ac-hp,.sr-only,[aria-hidden=true]')||e.name==='website')return;
  const par=e.parentElement;   // a link inside running text is exempt (WCAG 2.5.8)
  if(e.tagName==='A'&&par&&['P','LI','SPAN','TD','SMALL','DD'].includes(par.tagName)&&(par.innerText||'').trim().length>(e.innerText||'').trim().length+15)return;
  const lab=e.closest('label');if(lab&&lab.getBoundingClientRect().height*k>=43.5)return;
  const r=e.getBoundingClientRect();if(r.height*k<43.5||r.width*k<24)bad.push(sig(e)+' '+Math.round(r.width*k)+'x'+Math.round(r.height*k));
  if(['INPUT','SELECT','TEXTAREA'].includes(e.tagName)&&!['checkbox','radio','range','color'].includes(e.type)&&parseFloat(getComputedStyle(e).fontSize)<16)small.push(sig(e));});
 return {bad,small,ov:de.scrollWidth-de.clientWidth}};
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM||undefined});try{
 for(const [name,dev] of [['iPhone 13',devices['iPhone 13']],['Android 360',{...devices['Galaxy S9+'],viewport:{width:360,height:740}}],['Desktop site on a phone',DESKTOP_SITE]]){
  const dsite=dev===DESKTOP_SITE;
  const ctx=await browser.newContext({...dev}),page=await ctx.newPage();
  for(const u of PAGES){await page.goto(B+u,{waitUntil:'networkidle'});await page.waitForTimeout(250);const r=await page.evaluate(scan);
   if(dsite)ok(await page.evaluate(()=>document.documentElement.classList.contains('phone-mode')),`${name} ${u}: switched to the phone layout`);
   ok(r.bad.length===0,`${name} ${u}: small touch targets ${r.bad.slice(0,5).join(', ')}`);ok(r.small.length===0,`${name} ${u}: fields under 16px ${r.small.join(', ')}`);ok(r.ov<=0,`${name} ${u}: sideways scroll ${r.ov}px`);}
  if(dsite){   // the phone layout really fills the screen, survives turning the phone, and covers inline vw/vh too
   const rctx=await browser.newContext({...DESKTOP_SITE}),page=await rctx.newPage();   // own tab: resizing resets the emulated screen
   await page.goto(B+'/',{waitUntil:'networkidle'});
   const fit=await page.evaluate(()=>{const de=document.documentElement,k=screen.width/de.clientWidth,d=document.createElement('div');d.style.cssText='position:fixed;left:0;top:0;width:100vw;height:10px';document.body.appendChild(d);
     return new Promise(r=>setTimeout(()=>r({body:document.body.getBoundingClientRect().width*k,inl:d.getBoundingClientRect().width*k,sw:screen.width}),50))});
   ok(Math.abs(fit.body-fit.sw)<=2,`${name}: page fills the phone screen (${Math.round(fit.body)} of ${fit.sw}px)`);
   ok(Math.abs(fit.inl-fit.sw)<=2,`${name}: inline 100vw is the phone's width (${Math.round(fit.inl)}px)`);
   await page.setViewportSize({width:980,height:450});await page.waitForTimeout(400);
   ok(await page.evaluate(()=>!document.documentElement.classList.contains('phone-mode')&&!document.documentElement.style.zoom),`${name}: turned sideways, the page is no longer shrunk so it goes back to normal`);
   await page.setViewportSize(DESKTOP_SITE.viewport);await page.waitForTimeout(400);
   ok(await page.evaluate(()=>document.documentElement.classList.contains('phone-mode')&&matchMedia('(max-width: 420px)').matches),`${name}: turned upright again, phone layout is back`);
   await rctx.close();
  }
  // the back office
  let lr=await ctx.request.post(B+'/api/login',{data:{email:'admin',password:PW}});ok(lr.status()===200,`${name}: back-office sign-in ${lr.status()}`);
  if((await lr.json()).must_change){const ck=/gc_session=([^;]+)/.exec(lr.headers()['set-cookie'])[1],np=PW+'-touch-2026';
   const cr=await ctx.request.post(B+'/api/password',{data:{current:PW,password:np},headers:{cookie:'gc_session='+ck}});ok(cr.status()===200,`${name}: set first password ${cr.status()}`);
   PW=np;lr=await ctx.request.post(B+'/api/login',{data:{email:'admin',password:PW}});ok(lr.status()===200,`${name}: sign-in after new password ${lr.status()}`);}
  await ctx.addCookies([{name:'gc_session',value:/gc_session=([^;]+)/.exec(lr.headers()['set-cookie'])[1],url:B}]);
  const errs=[];page.on('pageerror',e=>errs.push(e.message));
  for(const v of VIEWS){await page.goto(B+'/admin#'+v);await page.waitForTimeout(600);const r=await page.evaluate(scan);
   if(dsite)ok(await page.evaluate(()=>document.documentElement.classList.contains('phone-mode')),`${name} back office ${v}: switched to the phone layout`);
   ok(r.bad.length===0,`${name} back office ${v}: small touch targets ${r.bad.slice(0,5).join(', ')}`);ok(r.small.length===0,`${name} back office ${v}: fields under 16px ${r.small.join(', ')}`);ok(r.ov<=0,`${name} back office ${v}: sideways scroll ${r.ov}px`);}
  ok(errs.length===0,`${name} back office script errors: ${errs.join(' | ')}`);
  await ctx.close();}
 console.log(`PASSED: ${checks} phone touch-target checks`);
}catch(e){console.error('FAIL',e.message);process.exitCode=1}finally{await browser.close()}})();
