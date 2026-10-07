// The PDF is available on screen; queueing an email never proves delivery.
const {chromium}=require(process.env.PLAYWRIGHT||'playwright');
const base=process.env.BASE||'http://127.0.0.1:4199';
const notes={en:'This link is valid for 30 days.',fr:'Ce lien est valable pendant 30 jours.',es:'Este enlace es válido durante 30 días.',de:'Dieser Link ist 30 Tage gültig.',ar:'هذا الرابط صالح لمدة 30 يوماً.',zh:'此链接有效期为30天。'};
let checks=0;const ok=(v,m)=>{if(!v)throw Error(m);checks++;console.log('  ok',m)};
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM});try{
 for(const lang of Object.keys(notes)){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();let body=null,missing=false;
  await page.route('**/api/report/enquiry',async route=>{body=route.request().postDataJSON();await route.fulfill({json:missing?{ok:true}:{ok:true,url:'#download-check'}})});
  await page.goto(base+(lang==='en'?'':'/'+lang)+'/ghana-investment-report');
  const form=page.locator('#rp-dl');await form.locator('[name=full_name]').fill('QA Report Reader');await form.locator('[name=email]').fill('reader@example.test');await form.locator('[name=consent]').check();
  await form.locator('button[type=submit]').click();await page.locator('.rp-ready').waitFor();
  ok(body.lang===lang&&body.consent===true,'Selected language and consent: '+lang);
  ok(body.updates===false,'No automatic marketing opt-in: '+lang);
  ok((await page.locator('.rp-ready').textContent()).includes(notes[lang]),'Honest native download confirmation: '+lang);
  ok(await page.locator('.rp-ready a').getAttribute('href')==='#download-check','On-screen download link: '+lang);
  await page.goto(base+(lang==='en'?'':'/'+lang)+'/ghana-investment-report');missing=true;
  await form.locator('[name=full_name]').fill('QA Report Reader');await form.locator('[name=email]').fill('reader@example.test');await form.locator('[name=consent]').check();await form.locator('button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#rp-dl button').disabled===false);
  ok(await page.locator('.rp-ready').count()===0,'Missing PDF link is retryable, never a delivery claim: '+lang);
  await context.close();
 }
 console.log('PASSED: '+checks+' six-language report download checks');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
