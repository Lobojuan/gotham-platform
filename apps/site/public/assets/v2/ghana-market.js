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
 let lang=()=>['fr','es','de','ar','zh'].includes(document.documentElement.lang)?document.documentElement.lang:'en';
 const basic={en:{source:'Source',period:'Period',rate:'Rate publication',mid:'Market mid-rate',gdp:'GDP growth',inflation:'Inflation',exportsAnnual:'Exports',tradeBalance:'Trade balance',tradeBalanceAnnual:'Trade surplus',reserves:'Reserves',services:'Services growth',fxdown:'Current rates unavailable'},fr:{source:'Source',period:'Période',rate:'Publication du taux',mid:'Taux moyen de marché',gdp:'Croissance du PIB',inflation:'Inflation',exportsAnnual:'Exportations',tradeBalance:'Balance commerciale',tradeBalanceAnnual:'Excédent commercial',reserves:'Réserves',services:'Croissance des services',fxdown:'Taux actuels indisponibles'},es:{source:'Fuente',period:'Periodo',rate:'Publicación del tipo',mid:'Tipo medio de mercado',gdp:'Crecimiento del PIB',inflation:'Inflación',exportsAnnual:'Exportaciones',tradeBalance:'Balanza comercial',tradeBalanceAnnual:'Superávit comercial',reserves:'Reservas',services:'Crecimiento de servicios',fxdown:'Tipos actuales no disponibles'}};
 Object.assign(basic.en,{"goldAnnual": "Gold exports", "cocoaAnnual": "Cocoa exports", "oilAnnual": "Oil exports", "otherAnnual": "Other exports", "industry": "Industry growth", "agriculture": "Agriculture growth"});
 Object.assign(basic.fr,{"goldAnnual": "Exportations d’or", "cocoaAnnual": "Exportations de cacao", "oilAnnual": "Exportations de pétrole", "otherAnnual": "Autres exportations", "industry": "Croissance industrielle", "agriculture": "Croissance agricole"});
 Object.assign(basic.es,{"goldAnnual": "Exportaciones de oro", "cocoaAnnual": "Exportaciones de cacao", "oilAnnual": "Exportaciones de petróleo", "otherAnnual": "Otras exportaciones", "industry": "Crecimiento industrial", "agriculture": "Crecimiento agrícola"});
 Object.assign(basic.en,{daily:'Research sources checked daily',lastCheck:'Last check',historic:'Historical figures retain their stated reporting periods.',review:'Source checks requiring review',pending:'Daily source verification pending'});
 Object.assign(basic.fr,{daily:'Sources de recherche vérifiées chaque jour',lastCheck:'Dernière vérification',historic:'Les chiffres historiques conservent leurs périodes de référence.',review:'Vérifications nécessitant une révision',pending:'Vérification quotidienne des sources en attente'});
 Object.assign(basic.es,{daily:'Fuentes de investigación comprobadas diariamente',lastCheck:'Última comprobación',historic:'Las cifras históricas conservan sus periodos de referencia.',review:'Comprobaciones que requieren revisión',pending:'Verificación diaria de fuentes pendiente'});
 Object.assign(basic,{
 de:{source:'Quelle',period:'Berichtszeitraum',rate:'Kursveröffentlichung',mid:'Marktmittelkurs',gdp:'BIP-Wachstum',inflation:'Inflation',exportsAnnual:'Exporte',tradeBalance:'Handelsbilanz',tradeBalanceAnnual:'Handelsüberschuss',reserves:'Reserven',services:'Wachstum im Dienstleistungssektor',fxdown:'Aktuelle Kurse nicht verfügbar',goldAnnual:'Goldexporte',cocoaAnnual:'Kakaoexporte',oilAnnual:'Ölexporte',otherAnnual:'Sonstige Exporte',industry:'Industriewachstum',agriculture:'Wachstum in der Landwirtschaft',daily:'Quellen werden täglich geprüft',lastCheck:'Letzte Prüfung',historic:'Historische Zahlen behalten ihre angegebenen Berichtszeiträume.',review:'Quellenprüfungen mit Klärungsbedarf',pending:'Tägliche Quellenprüfung ausstehend'},
 ar:{source:'المصدر',period:'الفترة المرجعية',rate:'نشرة سعر الصرف',mid:'متوسط سعر الصرف في السوق',gdp:'نمو الناتج المحلي الإجمالي',inflation:'التضخم',exportsAnnual:'الصادرات',tradeBalance:'الميزان التجاري',tradeBalanceAnnual:'الفائض التجاري',reserves:'الاحتياطيات',services:'نمو قطاع الخدمات',fxdown:'أسعار الصرف الحالية غير متاحة',goldAnnual:'صادرات الذهب',cocoaAnnual:'صادرات الكاكاو',oilAnnual:'صادرات النفط',otherAnnual:'صادرات أخرى',industry:'نمو الصناعة',agriculture:'نمو الزراعة',daily:'تُفحص مصادر البحث يومياً',lastCheck:'آخر فحص',historic:'تحتفظ الأرقام التاريخية بفتراتها المرجعية المحددة.',review:'مصادر تتطلب مراجعة',pending:'الفحص اليومي للمصادر قيد الانتظار'},
 zh:{source:'来源',period:'报告期',rate:'汇率发布日期',mid:'市场中间价',gdp:'国内生产总值增长率',inflation:'通胀率',exportsAnnual:'出口额',tradeBalance:'贸易差额',tradeBalanceAnnual:'贸易顺差',reserves:'储备',services:'服务业增长率',fxdown:'当前汇率暂不可用',goldAnnual:'黄金出口额',cocoaAnnual:'可可出口额',oilAnnual:'石油出口额',otherAnnual:'其他出口额',industry:'工业增长率',agriculture:'农业增长率',daily:'研究来源每日核查',lastCheck:'最近核查',historic:'历史数据保留其注明的报告期。',review:'需要复核的来源',pending:'每日来源核查待完成'}
 });
 const number=(n,d=2)=>Number(n).toLocaleString(({en:'en-GB',fr:'fr-FR',es:'es-ES',de:'de-DE',ar:'ar-u-nu-latn',zh:'zh-CN'})[lang()],{minimumFractionDigits:d,maximumFractionDigits:d});
 const value=v=>v.unit==='USD bn'?'$'+number(v.value)+'bn':number(v.value,2)+(v.unit==='%'?'%':'');
 const metric=k=>{for(const [name,s]of Object.entries(economy?.sources||{}))if(s.metrics?.[k])return {name,s,v:s.metrics[k]};return null;};
 const link=(url,label)=>`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
 function drawNumbers(){
  const l=lang(),t=basic[l]||basic.en;
  $$('[data-ghana-key]').forEach(el=>{const m=metric(el.dataset.ghanaKey);if(!m)return;
   const b=el.querySelector('b'),label=el.querySelector('span');if(b)b.textContent=value(m.v);
   if(label)label.textContent=(t[el.dataset.ghanaKey]||el.dataset.ghanaKey)+' · '+m.v.period;
  });
  $$('[data-ghana-value]').forEach(el=>{const m=metric(el.dataset.ghanaValue);if(m){el.textContent=value(m.v);el.title=t.period+': '+m.v.period;}});
  $$('[data-ghana-sources]').forEach(el=>{el.innerHTML=[...new Set(Object.values(economy?.sources||{}).map(s=>s.url))].map(u=>link(u,t.source)).join(' · ');});
  $$('[data-ghana-status]').forEach(el=>{
   const sources=Object.values(economy?.sources||{}),checked=sources.map(s=>s.checked).filter(Boolean).sort().at(-1);
   const stale=!checked||Date.now()-Date.parse(checked)>48*3600e3||sources.some(s=>s.stale||s.error||s.status==='retained'||s.status==='snapshot'||!s.status),date=checked?new Date(checked).toLocaleDateString(({en:'en-GB',fr:'fr-FR',es:'es-ES',de:'de-DE',ar:'ar-u-nu-latn',zh:'zh-CN'})[l],{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}):'';
   const copy={
    en:checked?(stale?`Retained official figures · last source check ${date}; periods are shown.`:`Official source check · ${date}; periods are shown.`):'Official data could not be reached. No current figures are displayed.',
    fr:checked?(stale?`Données officielles conservées · dernière vérification ${date} ; les périodes sont indiquées.`:`Sources officielles vérifiées le ${date} ; les périodes sont indiquées.`):'Sources officielles inaccessibles. Aucun chiffre actuel n’est affiché.',
    es:checked?(stale?`Se conservan los datos oficiales · última comprobación ${date}; se indican los periodos.`:`Fuentes oficiales comprobadas el ${date}; se indican los periodos.`):'No se pudo acceder a las fuentes oficiales. No se muestran cifras actuales.',
    de:checked?(stale?`Gespeicherte amtliche Daten · zuletzt geprüft am ${date}; Berichtszeiträume sind angegeben.`:`Amtliche Quellen geprüft am ${date}; Berichtszeiträume sind angegeben.`):'Amtliche Datenquellen nicht erreichbar. Es werden keine aktuellen Zahlen angezeigt.',
    ar:checked?(stale?`بيانات رسمية محفوظة · آخر تحقق ${date}؛ الفترات المرجعية موضحة.`:`تم التحقق من المصادر الرسمية في ${date}؛ الفترات المرجعية موضحة.`):'تعذر الوصول إلى المصادر الرسمية. لا تُعرض أرقام حالية.',
    zh:checked?(stale?`保留已发布的官方数据 · 最近核查：${date}；各项均注明报告期。`:`官方来源核查日期：${date}；各项均注明报告期。`):'暂时无法访问官方数据源，因此不显示当前数据。'
   };
   el.textContent=copy[l]||copy.en;
  });
 }
 function drawFX(){
  const t=basic[lang()], box=$('#fx-live'),all={...rates?.rates,...rates?.more};
  const codes=['USD','EUR','GBP','AED','CHF','CAD','CNY','XOF'].filter(c=>Number.isFinite(all[c])&&all[c]>0);
  const stamp=rates?.updated?new Date(rates.updated).toLocaleString(({en:'en-GB',fr:'fr-FR',es:'es-ES',de:'de-DE',ar:'ar-u-nu-latn',zh:'zh-CN'})[lang()],{timeZone:'UTC'}):'';
  if(box){box.hidden=false;box.dataset.noTr='';box.innerHTML=codes.length?`<b>${esc(t.mid)}</b> · ${codes.map(c=>`1 ${c} = GHS ${number(all[c],4)}`).join(' · ')}<br>${esc(t.rate)}: ${esc(stamp)} UTC · ${link('https://open.er-api.com/v6/latest/USD',t.source)}`:esc(t.fxdown);}
  const tick=$('.ticker ul');if(tick&&codes.length){$$('.ticker [data-fx]').forEach(e=>e.remove());
   for(const hide of [false,true]){const list=codes.slice(0,4).map(c=>`<li data-fx data-no-tr${hide?' aria-hidden="true"':''}>1 ${c} <b>GHS ${number(all[c],2)}</b> · ${esc(rates.updated.slice(0,10))}</li>`).join('');tick.insertAdjacentHTML(hide?'beforeend':'afterbegin',list);}}
 }
 const chartCopy={en:{select:'Choose a company',hint:'Tap a year or explore the points',price:'Year-end share price',gain:'Five-year price change',note:'Nominal GHS prices · excludes dividends, fees, tax and FX'},fr:{select:'Choisir une société',hint:'Touchez une année ou explorez les points',price:'Cours de clôture annuel',gain:'Variation du cours sur cinq ans',note:'Cours nominaux en GHS · hors dividendes, frais, impôts et change'},es:{select:'Elegir una empresa',hint:'Toca un año o explora los puntos',price:'Precio al cierre del año',gain:'Variación del precio en cinco años',note:'Precios nominales en GHS · excluyen dividendos, costes, impuestos y cambio'}};
 Object.assign(chartCopy,{
 de:{select:'Unternehmen auswählen',hint:'Wählen Sie ein Jahr oder einen Datenpunkt',price:'Aktienkurs zum Jahresende',gain:'Kursveränderung über fünf Jahre',note:'Nominale GHS-Kurse · ohne Dividenden, Gebühren, Steuern und Wechselkurseffekte'},
 ar:{select:'اختاروا شركة',hint:'اختاروا سنة أو استعرضوا نقاط البيانات',price:'سعر السهم في نهاية السنة',gain:'تغير سعر السهم خلال خمس سنوات',note:'أسعار اسمية بالسيدي الغاني · لا تشمل توزيعات الأرباح والرسوم والضرائب وأثر الصرف'},
 zh:{select:'选择公司',hint:'选择年份或查看数据点',price:'年末股价',gain:'五年股价变动',note:'加纳塞地名义价格 · 不含股息、手续费、税费及汇率影响'}
 });
 function chart(c){
  const top=Math.ceil(Math.max(...c.prices)/5)*5,points=c.prices.map((v,i)=>[56+i*137.6,230-v/top*204]);
  const line=points.map(([x,y],i)=>`${i?'L':'M'}${x} ${y}`).join(' '),t=chartCopy[lang()];
  return `<div class="chart-summary"><div><span class="chart-ticker">${esc(c.ticker)}</span><h3>${esc(c.name)}</h3><small>${esc(t.hint)}</small></div><div><small>${esc(t.gain)}</small><strong>+${number(stats(c.prices).gain)}%</strong><span>2020 → 2025</span></div></div>
   <div class="chart-readout" role="status"><span id="chart-year">2025</span><b id="chart-price">GHS ${number(c.prices.at(-1))}</b><small>${esc(t.price)}</small></div>
   <svg class="price-chart" viewBox="0 0 800 282" role="img" aria-label="${esc(c.name+' '+c.prices.map((p,i)=>`${2020+i}: GHS ${p}`).join('; '))}">
    <defs><linearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e5bd6c" stop-opacity=".38"/><stop offset="1" stop-color="#e5bd6c" stop-opacity="0"/></linearGradient></defs>
    ${[0,1,2,3,4].map(i=>`<line x1="56" x2="744" y1="${230-i*51}" y2="${230-i*51}" stroke="#ffffff18"/><text x="46" y="${234-i*51}" text-anchor="end">${number(top*i/4,1)}</text>`).join('')}
    <path class="chart-area" d="${line} L744 230 L56 230 Z" fill="url(#price-fill)"/>
    <path class="chart-line" d="${line}" fill="none" stroke="#e5bd6c" stroke-width="3" pathLength="1000"/>
    ${points.map(([x,y],i)=>`<g class="chart-point" data-year="${i}"><circle cx="${x}" cy="${y}" r="22" fill="transparent"/><circle class="chart-dot" cx="${x}" cy="${y}" r="5"/><text x="${x}" y="263" text-anchor="middle">${2020+i}</text></g>`).join('')}
   </svg><div class="chart-years" aria-label="${esc(t.hint)}">${c.prices.map((v,i)=>`<button type="button" data-year="${i}" aria-pressed="${i===5}" aria-label="${2020+i}: GHS ${number(v)}">${2020+i}</button>`).join('')}</div><p class="chart-note">${esc(t.note)}</p>`;
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
   <div class="research-block"><h3>${esc(t.companies)}</h3><p>${esc(t.caseintro)}</p><div class="grid2">${cards}</div><p class="src">${link(s.factbook,t.caseSource)} · ${link(s.gse2025,'GSE December 2025')} · ${link(s.mtn,'MTN FY2025')}</p><div class="market-visual" id="market-visual"><div class="chart-toolbar"><label for="company-chart">${esc(chartCopy[l].select)}</label><select id="company-chart">${content.cases.map(c=>`<option value="${c.ticker}">${esc(c.name)}</option>`).join('')}</select></div><div id="company-series"></div></div></div>
   <div class="research-block"><h3>${esc(t.outlook)}</h3><p>${esc(t.outlooknote)}</p><p class="src">${link(s.wb,'World Bank · 26 Aug 2026')} · ${link(s.imf,'IMF · 4 Aug 2026')} · ${link(s.gipa,'GIPA sector roadmap · 2024')}</p><div class="grid2">${content.sectors.map(c=>`<article class="box"><h4>${esc(c.title[l])}</h4><p>${esc(c.text[l])}</p></article>`).join('')}</div></div>
   <div class="research-block box"><h3>${esc(t.assumptions)}</h3><p>${esc(t.calcintro)}</p><form id="investment-scenario"><div class="grid2"><label>${esc(t.amount)}<input name="amount" type="number" min="0.01" max="1000000000000" step="any" required></label><label>${esc(t.annual)}<input name="annual" type="number" min="-99" max="100" step="any" required></label><label>${esc(t.fx)}<input name="fx" type="number" min="-99" max="100" step="any" required></label><label>${esc(t.years)}<select name="years"><option value="5">5</option><option value="10">10</option></select></label></div><button class="btn btn-dark" type="submit">${esc(t.calculate)}</button><p id="scenario-result" role="status"></p></form><p class="src">${esc(t.resultnote)}</p></div>
   <div class="research-block box"><h3>${esc(t.verify)}</h3><p>${esc(t.checklist)}</p><div class="cta-row">${link(s.brokers,t.brokers)} <a class="btn btn-dark" href="/invest/join">${esc(t.join)}</a></div></div>`;
  const select=root.querySelector('#company-chart');select.value=chosen;
  const series=()=>{const c=content.cases.find(c=>c.ticker===select.value),box=root.querySelector('#company-series');box.innerHTML=chart(c)+`<p class="chart-values">${c.prices.map((v,i)=>`${2020+i}: GHS ${number(v)}`).join(' · ')}</p>`;
   const highlight=i=>{box.querySelector('#chart-year').textContent=2020+i;box.querySelector('#chart-price').textContent='GHS '+number(c.prices[i]);box.querySelectorAll('.chart-years button').forEach((b,n)=>b.setAttribute('aria-pressed',String(n===i)));box.querySelectorAll('.chart-point').forEach((p,n)=>p.classList.toggle('selected',n===i));};
   box.querySelectorAll('[data-year]').forEach(point=>{const i=+point.dataset.year;point.addEventListener('pointerenter',()=>highlight(i));point.addEventListener('click',()=>highlight(i));point.addEventListener('focus',()=>highlight(i));});highlight(5);
  };select.addEventListener('change',series);series();
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
