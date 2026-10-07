// Native-language widget: auto speech, mute, replay/stop, close, errors, and all three languages.
const {chromium}=require(process.env.PLAYWRIGHT || 'playwright');
const B=process.env.BASE || 'http://127.0.0.1:4199';
const ok=(c,m)=>{if(!c)throw new Error(m);console.log('  ok',m);};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM});
 try {
  for(const lang of ['en','fr','es']) {
   const ctx=await browser.newContext({viewport:{width:360,height:800}});
   await ctx.addInitScript(l=>{
    localStorage.setItem('gc-language',l); window.__played=0;window.__stopped=0;
    window.AudioContext=class {
     constructor(){this.state='suspended';this.destination={};}
     resume(){this.state='running';return Promise.resolve();}
     decodeAudioData(){return Promise.resolve({});}
     createBufferSource(){return {connect(){},start(){window.__played++;},stop(){window.__stopped++;}};}
    };
   },lang);
   const p=await ctx.newPage(), errors=[];p.on('pageerror',e=>errors.push(e.message));
   let speechRequests=0, polls=0, cancelled=0, fail=false, delayed=false;
   await p.route('**/api/ask/voice/cancel',r=>{cancelled++;return r.fulfill({json:{ok:true}});});
   await p.route('**/api/ask',r=>{const b=r.request().postDataJSON();ok(b.language===lang,lang+': selected language reaches the answer API');return r.fulfill({json:{answer:b.intro?'Welcome':'Reply in '+b.language, speech:b.speech?{token:'answer-token',voice:({en:'bm_fable',fr:'pierre_fr_FR',es:'sharvard_es_ES'})[b.language]}:null}});});
   await p.route('**/api/ask/voice',async r=>{speechRequests++;if(delayed)await new Promise(resolve=>setTimeout(resolve,600));
    if(lang==='en' && speechRequests===1)return r.fulfill({status:202,json:{job:'queued-voice-123',retry_after:.01}});
    await r.fulfill({status:fail?503:200,contentType:fail?'application/json':'audio/mpeg',body:fail?'{}':'mock audio'}).catch(()=>{});});
   await p.route('**/api/ask/voice/result',r=>{polls++;return polls===1?r.fulfill({status:202,json:{retry_after:.01}}):r.fulfill({contentType:'audio/mpeg',body:'mock audio'});});
   await p.goto(B+({en:'/',fr:'/fr/',es:'/es/'})[lang]); await p.locator('.dock [data-open-chat]').click();
   await p.waitForFunction(()=>window.__played===1);
   ok((await p.textContent('#chatVoiceStatus')).includes(({en:'Fable',fr:'Pierre',es:'castellano'})[lang]),lang+': voice label matches the native speaker');
   if(lang==='en')ok(polls===2,'background preparation polls until the answer audio is ready');
   ok(/services|services de conseil|servicios de consultoría/.test(await p.textContent('#msgs')),lang+': broad site introduction speaks after opening the chatbot');
   const send=async q=>{await p.fill('#chatI',q);await p.press('#chatI','Enter');};
   await p.locator('#chatChips button').filter({hasText:/pay|payer|pago/i}).click(); await p.waitForFunction(()=>window.__played===2);
   ok(await p.locator('#chat a[href*="wa.me"]').count()===0,'quick payment answer speaks here without a WhatsApp handoff');
   ok((await p.textContent('#msgs')).includes('Reply in '+lang),lang+': answer appears inside the chatbot and speaks automatically');
   ok((await p.textContent('#chatVoice')).includes(({en:'Voice on',fr:'Voix activée',es:'Voz activada'})[lang]),lang+': localized controls');
   await p.click('#chatPlay');ok(await p.evaluate(()=>window.__stopped===2),'stop ends speech');
   await p.click('#chatPlay'); await p.waitForFunction(()=>window.__played===3);
   ok(speechRequests===2,'replay uses decoded audio without another server job');
   await p.click('#chatVoice');await send('Another question');await p.waitForTimeout(200);
   ok(speechRequests===2 && await p.getAttribute('#chatVoice','aria-pressed')==='false','mute prevents speech requests');
   await p.click('#chatVoice');fail=true;await send('Worker unavailable');
   await p.waitForFunction(()=>/indisponible|unavailable|no disponible/.test(document.getElementById('chatVoiceStatus').textContent));
   ok((await p.textContent('#msgs')).includes('Reply in '+lang),'voice failure keeps text usable');
   fail=false;delayed=true;await send('Delayed');await p.click('#chatX');await p.waitForTimeout(800);
   ok(await p.isHidden('#chat') && await p.evaluate(()=>window.__played===3),'closing prevents delayed audio playback');
   ok(errors.length===0,'no page errors');await ctx.close();
  }
  const streamCtx=await browser.newContext({viewport:{width:390,height:844}});
  await streamCtx.addInitScript(()=>{localStorage.setItem('gc-chat-voice','off');window.__played=0;window.__stopped=0;window.AudioContext=class{constructor(){this.state='suspended';this.destination={};this.currentTime=0;}resume(){this.state='running';return Promise.resolve();}decodeAudioData(){return Promise.resolve({numberOfChannels:1,length:4,sampleRate:24000,duration:1,getChannelData(){return new Float32Array(4);}});}createBuffer(channels,length,rate){const data=new Float32Array(length);return {numberOfChannels:channels,length,sampleRate:rate,duration:length/rate,getChannelData(){return data;}};}createBufferSource(){return {connect(){},start(){window.__played++;},stop(){window.__stopped++;}};}};});
  const sp=await streamCtx.newPage();let part=0,cancels=0;
  await sp.route('**/api/ask',r=>r.fulfill({json:{answer:'A full answer in two spoken parts.',speech:{token:'answer-token',voice:'bm_fable'}}}));
  await sp.route('**/api/ask/voice',r=>r.fulfill({status:202,json:{job:'streamed-audio-job',retry_after:.01}}));
  await sp.route('**/api/ask/voice/result',async r=>{ok(r.request().postDataJSON().packets===true,'stream requests body metadata through WordPress');part++;if(part%2===0)await new Promise(resolve=>setTimeout(resolve,1000));await r.fulfill({json:{audio:Buffer.from('audio chunk').toString('base64'),more:part%2===1}}).catch(()=>{});});
  await sp.route('**/api/ask/voice/cancel',r=>{cancels++;return r.fulfill({json:{ok:true}});});
  await sp.goto(B+'/');await sp.locator('.dock [data-open-chat]').click();await sp.click('#chatVoice');
  await sp.fill('#chatI','Explain Ghana');await sp.press('#chatI','Enter');await sp.waitForFunction(()=>window.__played===1);
  ok(part===2,'first speech starts while the rest is still being prepared');await sp.waitForFunction(()=>window.__played===2);
  await sp.click('#chatPlay');await sp.click('#chatPlay');await sp.waitForFunction(()=>window.__played===3);ok(part===2,'complete streamed answer replays without new synthesis');
  await sp.fill('#chatI','Another explanation');await sp.press('#chatI','Enter');await sp.waitForFunction(()=>window.__played===4);await sp.click('#chatVoice');await sp.waitForTimeout(1300);
  ok(cancels===1 && await sp.evaluate(()=>window.__played===4),'muting cancels the background job and prevents later chunks');await streamCtx.close();
  console.log('PASSED');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
