// Crawlable locale pages work without JS; selecting a twin keeps query/section and direct URLs win.
const {chromium}=require(process.env.PLAYWRIGHT||'playwright');
const base=process.env.BASE||'http://127.0.0.1:4199';
let checks=0;
const ok=(c,m)=>{if(!c)throw Error(m);checks++;console.log('  ok',m);};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM});
 try {
  const offline=await browser.newContext({javaScriptEnabled:false});
  for (const [lang,h1] of [['fr',/Nouez des partenariats/],['es',/Construya alianzas/]]) {
   const p=await offline.newPage();await p.goto(base+'/'+lang);
   ok((await p.locator('html').getAttribute('lang'))===lang,'Without JS: language '+lang);
   ok(h1.test(await p.locator('h1').textContent()),'Without JS: translated headline '+lang);
   ok(await p.locator('#langp a[data-lang="es"]').getAttribute('href')==='/es','Without JS: crawlable Spanish language link');
   await p.goto(base+'/'+lang+'/services/ai');
   ok((await p.locator('link[rel=canonical]').getAttribute('href')).endsWith('/'+lang+'/services/ai'),'Without JS: canonical AI service '+lang);
   await p.close();
  }
  await offline.close();
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});
  await ctx.addInitScript(()=>localStorage.setItem('gc-language','en'));
  const p=await ctx.newPage();await p.goto(base+'/es/invest?source=seo#research');
  await p.waitForFunction(()=>document.querySelector('[data-lang-code]')?.textContent==='ES');
  ok(await p.locator('html').getAttribute('lang')==='es','Explicit Spanish URL wins over stored English preference');
  ok((await p.locator('[data-nav=invest]').first().getAttribute('aria-current'))==='page','Investor navigation is active on Spanish URL');
  for(const lang of ['fr','en','es']){
   await p.locator('.langb').click();await p.locator('#langp [data-lang='+lang+']').click();
   await p.waitForURL(base+(lang==='en'?'':'/'+lang)+'/invest?source=seo#research');
   await p.waitForFunction(l=>document.documentElement.lang===l,lang);
   ok(true,'Language switch keeps query and research section: '+lang);
   ok((await p.locator('link[rel=canonical]').getAttribute('href')).endsWith((lang==='en'?'':'/'+lang)+'/invest'),'Localized canonical after language switch: '+lang);
  }
  await ctx.close();console.log('PASSED: '+checks+' locale browser checks');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
