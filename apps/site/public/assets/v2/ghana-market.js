/* Dated Ghana publications, investor research and transparent currency scenarios. */
(() => {
 const stats=prices=>({gain:(prices.at(-1)/prices[0]-1)*100,cagr:((prices.at(-1)/prices[0])**(1/(prices.length-1))-1)*100});
 const scenario=(amount,annual,fx,years)=>{
  if(!Number.isFinite(amount)||amount<=0||amount>1e12||![annual,fx].every(x=>Number.isFinite(x)&&x>=-99&&x<=100)||![5,10].includes(years))throw new Error('invalid assumptions');
  const local=amount*(1+annual/100)**years, factor=(1+fx/100)**years;
  return {local,foreignReturn:(local/amount/factor-1)*100,factor};
 };
 globalThis.GothamFinance={stats,scenario};
 if(typeof document==='undefined')return;
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const parse=id=>{try{return JSON.parse($('#'+id)?.textContent||'null');}catch{return null;}};
 let economy=parse('ghana-snapshot'), content=parse('investor-content'), rates=null;
 let lang=()=>['fr','es'].includes(document.documentElement.lang)?document.documentElement.lang:'en';
 const basic={en:{source:'Source',period:'Period',rate:'Rate publication',mid:'Market mid-rate',gdp:'GDP growth',inflation:'Inflation',exportsAnnual:'Exports',tradeBalanceAnnual:'Trade surplus',reserves:'Reserves',services:'Services growth',fxdown:'Current rates unavailable'},fr:{source:'Source',period:'Période',rate:'Publication du taux',mid:'Taux moyen de marché',gdp:'Croissance du PIB',inflation:'Inflation',exportsAnnual:'Exportations',tradeBalanceAnnual:'Excédent commercial',reserves:'Réserves',services:'Croissance des services',fxdown:'Taux actuels indisponibles'},es:{source:'Fuente',period:'Periodo',rate:'Publicación del tipo',mid:'Tipo medio de mercado',gdp:'Crecimiento del PIB',inflation:'Inflación',exportsAnnual:'Exportaciones',tradeBalanceAnnual:'Superávit comercial',reserves:'Reservas',services:'Crecimiento de servicios',fxdown:'Tipos actuales no disponibles'}};
 Object.assign(basic.en,{"goldAnnual": "Gold exports", "cocoaAnnual": "Cocoa exports", "oilAnnual": "Oil exports", "otherAnnual": "Other exports", "industry": "Industry growth", "agriculture": "Agriculture growth"});
 Object.assign(basic.fr,{"goldAnnual": "Exportations d’or", "cocoaAnnual": "Exportations de cacao", "oilAnnual": "Exportations de pétrole", "otherAnnual": "Autres exportations", "industry": "Croissance industrielle", "agriculture": "Croissance agricole"});
 Object.assign(basic.es,{"goldAnnual": "Exportaciones de oro", "cocoaAnnual": "Exportaciones de cacao", "oilAnnual": "Exportaciones de petróleo", "otherAnnual": "Otras exportaciones", "industry": "Crecimiento industrial", "agriculture": "Crecimiento agrícola"});
 Object.assign(basic.en,{daily:'Research sources checked daily',lastCheck:'Last check',historic:'Historical figures retain their stated reporting periods.',review:'Source checks requiring review',pending:'Daily source verification pending'});
 Object.assign(basic.fr,{daily:'Sources de recherche vérifiées chaque jour',lastCheck:'Dernière vérification',historic:'Les chiffres historiques conservent leurs périodes de référence.',review:'Vérifications nécessitant une révision',pending:'Vérification quotidienne des sources en attente'});
 Object.assign(basic.es,{daily:'Fuentes de investigación comprobadas diariamente',lastCheck:'Última comprobación',historic:'Las cifras históricas conservan sus periodos de referencia.',review:'Comprobaciones que requieren revisión',pending:'Verificación diaria de fuentes pendiente'});
 const number=(n,d=2)=>Number(n).toLocaleString(({en:'en-GB',fr:'fr-FR',es:'es-ES'})[lang()],{minimumFractionDigits:d,maximumFractionDigits:d});
 const value=v=>v.unit==='USD bn'?'$'+number(v.value)+'bn':number(v.value,2)+(v.unit==='%'?'%':'');
 const metric=k=>{for(const [name,s]of Object.entries(economy?.sources||{}))if(s.metrics?.[k])return {name,s,v:s.metrics[k]};return null;};
 const link=(url,label)=>`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
 function drawNumbers(){
  const t=basic[lang()];
  $$('[data-ghana-key]').forEach(el=>{const m=metric(el.dataset.ghanaKey);if(!m)return;
   const b=el.querySelector('b'),label=el.querySelector('span');if(b)b.textContent=value(m.v);
   if(label)label.textContent=(t[el.dataset.ghanaKey]||el.dataset.ghanaKey)+' · '+m.v.period;
  });
  $$('[data-ghana-value]').forEach(el=>{const m=metric(el.dataset.ghanaValue);if(m){el.textContent=value(m.v);el.title=t.period+': '+m.v.period;}});
  $$('[data-ghana-sources]').forEach(el=>{el.innerHTML=[...new Set(Object.values(economy?.sources||{}).map(s=>s.url))].map(u=>link(u,t.source)).join(' · ');});
 }
 function drawFX(){
  const t=basic[lang()], box=$('#fx-live'),all={...rates?.rates,...rates?.more};
  const codes=['USD','EUR','GBP','AED','CHF','CAD','CNY','XOF'].filter(c=>Number.isFinite(all[c])&&all[c]>0);
  const stamp=rates?.updated?new Date(rates.updated).toLocaleString(({en:'en-GB',fr:'fr-FR',es:'es-ES'})[lang()],{timeZone:'UTC'}):'';
  if(box){box.hidden=false;box.dataset.noTr='';box.innerHTML=codes.length?`<b>${esc(t.mid)}</b> · ${codes.map(c=>`1 ${c} = GHS ${number(all[c],4)}`).join(' · ')}<br>${esc(t.rate)}: ${esc(stamp)} UTC · ${link('https://open.er-api.com/v6/latest/USD',t.source)}`:esc(t.fxdown);}
  const tick=$('.ticker ul');if(tick&&codes.length){$$('.ticker [data-fx]').forEach(e=>e.remove());
   for(const hide of [false,true]){const list=codes.slice(0,4).map(c=>`<li data-fx data-no-tr${hide?' aria-hidden="true"':''}>1 ${c} <b>GHS ${number(all[c],2)}</b> · ${esc(rates.updated.slice(0,10))}</li>`).join('');tick.insertAdjacentHTML(hide?'beforeend':'afterbegin',list);}}
 }
 function chart(c){
  const max=Math.max(...c.prices)*1.1,points=c.prices.map((v,i)=>`${30+i*62},${155-v/max*130}`).join(' ');
  return `<svg class="price-chart" viewBox="0 0 380 190" role="img" aria-label="${esc(c.name+' '+c.prices.map((p,i)=>`${2020+i}: GHS ${p}`).join('; '))}"><path d="M30 20V155H340" fill="none" stroke="#bcc7cf"/><polyline points="${points}" fill="none" stroke="#A9761F" stroke-width="3"/>${c.prices.map((v,i)=>`<circle cx="${30+i*62}" cy="${155-v/max*130}" r="4" fill="#A9761F"/><text x="${30+i*62}" y="180" text-anchor="middle">${2020+i}</text>`).join('')}</svg>`;
 }
 function drawResearch(){
  const root=$('#investor-research');if(!root||!content)return;
  const l=lang(),t=content.labels[l],s=content.sources;
  const checks=economy?.research,bt=basic[l],due=!checks?.checked || Date.now()-Date.parse(checks.checked)>48*3600e3;
  const flags=Object.values(checks?.items||{}).filter(r=>r.status!=='verified');
  const checked=`<p class="src" id="research-check-status">${esc(bt.daily)} · ${esc(bt.lastCheck)}: ${esc(checks?.checked?.slice(0,10)||'—')}. ${esc(bt.historic)}${due?'<br>'+esc(bt.pending):''}${flags.length?'<br>'+esc(bt.review)+': '+flags.map(r=>link(r.url,r.label)).join(' · '):''}</p>`;
  const form=root.querySelector('form'),old=form?Object.fromEntries(new FormData(form)):{};
  let chosen=root.querySelector('#company-chart')?.value||'BOPP';
  const cards=content.cases.map(c=>{const st=stats(c.prices);return `<article class="box"><p class="eyebrow">${esc(c.ticker)}</p><h3>${esc(c.name)}</h3><p class="case-gain">+${number(st.gain)}%</p><p>${esc(t.pricegain)} · ${number(st.cagr,1)}% ${esc(t.cagr)}</p><p>${esc(t.prices)}: ${number(c.prices[0])} → ${number(c.prices.at(-1))}</p><p>${esc(c.notes[l])}</p><p class="src">${link(s.factbook+'#page='+({BOPP:50,MTNGH:131,GCB:92,EGH:77})[c.ticker],'2020–24')} · ${link(s.gse2025+'#page=16','2025')}</p></article>`;}).join('');
  const panels=Object.entries(economy?.sources||{}).map(([name,d])=>{
   const keys=({gss:['gdp','gdpAnnual','inflation','ppi','industrial'],bog:['exports','tradeBalance','reserves','policy','treasury91'],gse:['index','ytd']})[name];
   return `<article class="box"><h3>${({gss:'Ghana Statistical Service',bog:'Bank of Ghana',gse:'Ghana Stock Exchange'})[name]}</h3><dl class="market-metrics">${keys.filter(k=>d.metrics[k]).map(k=>`<div><dt>${esc(t[k])}</dt><dd><b>${value(d.metrics[k])}</b><small>${esc(t.period)}: ${esc(d.metrics[k].period)}</small></dd></div>`).join('')}</dl><p class="src">${link(d.url,t.source)}<br>${esc(t.checked)}: ${esc(d.checked?.slice(0,10)||'—')}${d.stale||d.error?'<br>'+esc(t.retained):''}</p></article>`;}).join('');
  const fx={...rates?.rates,...rates?.more};const currencies=['USD','EUR','GBP','AED','CHF','CAD','CNY','XOF'].filter(c=>fx[c]>0);
  root.innerHTML=`<div class="sec-head"><p class="eyebrow">Gotham Consult · 2026</p><h2 id="research-h">${esc(t.heading)}</h2><p class="lead">${esc(t.intro)}</p>${checked}</div>
   <h3>${esc(t.facts)}</h3><div class="grid3">${panels}</div>
   <div class="research-block"><h3>${esc(t.currencies)}</h3><p>${esc(t.fxnote)}</p><div class="currency-grid">${currencies.map(c=>`<div class="box"><b>1 ${c}</b><strong>GHS ${number(fx[c],4)}</strong><small>1 GHS = ${number(1/fx[c],4)} ${c}</small></div>`).join('')||esc(t.fxdown)}</div>${rates?`<p class="src">${esc(t.fxdate)}: ${esc(rates.updated)} · ${link('https://open.er-api.com/v6/latest/USD',t.source)}</p>`:''}</div>
   <div class="research-block"><h3>${esc(t.companies)}</h3><p>${esc(t.caseintro)}</p><div class="grid2">${cards}</div><p class="src">${link(s.factbook,t.caseSource)} · ${link(s.gse2025,'GSE December 2025')} · ${link(s.mtn,'MTN FY2025')}</p><div class="box"><label for="company-chart">${esc(t.history)}</label><select id="company-chart">${content.cases.map(c=>`<option value="${c.ticker}">${esc(c.name)}</option>`).join('')}</select><div id="company-series"></div></div></div>
   <div class="research-block"><h3>${esc(t.outlook)}</h3><p>${esc(t.outlooknote)}</p><p class="src">${link(s.wb,'World Bank · 26 Aug 2026')} · ${link(s.imf,'IMF · 4 Aug 2026')} · ${link(s.gipa,'GIPA sector roadmap · 2024')}</p><div class="grid2">${content.sectors.map(c=>`<article class="box"><h4>${esc(c.title[l])}</h4><p>${esc(c.text[l])}</p></article>`).join('')}</div></div>
   <div class="research-block box"><h3>${esc(t.assumptions)}</h3><p>${esc(t.calcintro)}</p><form id="investment-scenario"><div class="grid2"><label>${esc(t.amount)}<input name="amount" type="number" min="0.01" max="1000000000000" step="any" required></label><label>${esc(t.annual)}<input name="annual" type="number" min="-99" max="100" step="any" required></label><label>${esc(t.fx)}<input name="fx" type="number" min="-99" max="100" step="any" required></label><label>${esc(t.years)}<select name="years"><option value="5">5</option><option value="10">10</option></select></label></div><button class="btn btn-dark" type="submit">${esc(t.calculate)}</button><p id="scenario-result" role="status"></p></form><p class="src">${esc(t.resultnote)}</p></div>
   <div class="research-block box"><h3>${esc(t.verify)}</h3><p>${esc(t.checklist)}</p><div class="cta-row">${link(s.brokers,t.brokers)} <a class="btn btn-dark" href="/invest/join">${esc(t.join)}</a></div></div>`;
  const select=root.querySelector('#company-chart');select.value=chosen;
  const series=()=>{const c=content.cases.find(c=>c.ticker===select.value);root.querySelector('#company-series').innerHTML=chart(c)+`<p>${c.prices.map((v,i)=>`${2020+i}: GHS ${number(v)}`).join(' · ')}</p>`;};select.addEventListener('change',series);series();
  const f=root.querySelector('form');for(const [k,v]of Object.entries(old))if(f.elements[k])f.elements[k].value=v;
  f.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(f),out=$('#scenario-result');
   try{if(['amount','annual','fx'].some(k=>d.get(k)===''))throw new Error('empty');const r=scenario(+d.get('amount'),+d.get('annual'),+d.get('fx'),+d.get('years'));out.textContent=`${t.local}: GHS ${number(r.local)} · ${t.foreign}: ${number(r.foreignReturn)}%`;}
   catch{out.textContent=t.invalid;}
  });
 }
 function draw(){drawNumbers();drawFX();drawResearch();}
 draw();
 async function refresh(){
  await Promise.allSettled([
   fetch('/api/ghana-data',{signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():null).then(d=>{if(d?.sources)economy=d;}),
   fetch('/api/rates',{signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():null).then(d=>{if(d?.rates && !Number.isNaN(Date.parse(d.updated)))rates=d;})
  ]);draw();
 }
 refresh().catch(()=>{});setInterval(()=>{if(!document.hidden)refresh().catch(()=>{});},600000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh().catch(()=>{});});
 new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
})();
