// Screen presentation: all slides, languages, downloads and stored language on six screen sizes.
const {chromium} = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const B = process.env.BASE || 'http://127.0.0.1:4187';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM||undefined,headless:true});
 let checks=0;
 try{
  for(const [width,height] of [[320,640],[390,844],[360,800],[412,915],[768,1024],[1440,900]]){
   const page=await browser.newPage({viewport:{width,height}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   for(const lang of ['en','fr','es']){
    await page.goto(B+'/downloads/gotham-services.html?lang='+lang);
    assert.equal(await page.locator('#language').inputValue(),lang);checks++;
    assert.equal(await page.locator('html').getAttribute('lang'),lang);checks++;
    assert(await page.locator('#intro').isVisible());checks++;
    assert.equal(await page.locator('#pdf').getAttribute('href'),`gotham-services-${lang}.pdf`);checks++;
    for(const ext of ['pdf','pptx']){
     const r=await page.request.get(B+`/downloads/gotham-services-${lang}.${ext}`);
     assert.equal(r.status(),200);assert((await r.body()).length>100000);checks+=2;
    }
    await page.locator('#start').click();assert(await page.locator('#viewer').isVisible());checks++;
    for(let n=1;n<=5;n++){
     await page.locator('#slide').evaluate(i=>i.decode());
     assert.equal(await page.locator('#count').textContent(),`${n} / 5`);checks++;
     assert((await page.locator('#slide').getAttribute('src')).includes(`${lang}/slide-${n}.webp`));checks++;
     assert((await page.locator('#slide').getAttribute('alt')).length>10);checks++;
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks++;
     if(n<5)await page.locator('#next').click();
    }
    assert(await page.locator('#next').isDisabled());checks++;
    await page.locator('#prev').click();assert.equal(await page.locator('#count').textContent(),'4 / 5');checks++;
    await page.locator('#present-language').selectOption(lang==='en'?'fr':'en');
    assert((await page.locator('#slide').getAttribute('src')).includes(lang==='en'?'/fr/':'/en/'));checks++;
   }
   await page.goto(B+'/downloads/gotham-services.html?lang=es');
   await page.goto(B+'/downloads/gotham-services.html');
   assert.equal(await page.locator('#language').inputValue(),'es');checks++;
   assert.equal(errors.length,0,errors.join('\n'));checks++;
   if(width===1440){
    await page.locator('#start').click();await page.locator('#full').click();
    assert(await page.evaluate(()=>!!document.fullscreenElement));checks++;
    await page.locator('#next').press('End');assert.equal(await page.locator('#count').textContent(),'5 / 5');checks++;
    await page.locator('#next').press('Home');assert.equal(await page.locator('#count').textContent(),'1 / 5');checks++;
   }
   await page.close();
  }
  console.log(`PASSED presentation (${checks} checks; English/French/Spanish on six screens)`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
