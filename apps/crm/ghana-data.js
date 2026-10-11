/* Public economic data: official publications, dated values, retained verified snapshots.
   Network refreshes run in the background; visitors never wait for a PDF download. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {checkResearch,researchSeed} from './research-checks.js';
const here=path.dirname(fileURLToPath(import.meta.url));
export const SOURCES={gss:'https://www.statsghana.gov.gh/',bog:'https://www.bog.gov.gh/monetary-policy/summary-of-economic-and-financial-data/',gse:'https://gse.com.gh/'};
export const REFRESH_MS=6*3600e3;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function objectAt(text,start) {
  let depth=0,quote=false,escape=false;
  for(let i=start;i<text.length;i++) { const c=text[i];
    if(quote) {if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quote=false;continue;}
    if(c==='"')quote=true;else if(c==='{')depth++;else if(c==='}' && --depth===0)return JSON.parse(text.slice(start,i+1));
  } throw new Error('incomplete data');
}
export function parseGSS(html) {
  const chunks=[html];
  for(const m of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)) {
    try {for(const v of JSON.parse(m[1]))if(typeof v==='string')chunks.push(v);}catch{}
  }
  let data;
  for(const s of chunks){const m=/"data":\s*(\{\s*"CPI")/.exec(s);if(m){data=objectAt(s,m.index+s.slice(m.index).indexOf('{'));break;}}
  if(!data?.GDP)throw new Error('GSS format changed');
  const latest=(rows,pattern)=>{
    const candidates=(rows||[]).filter(r=>r.key?.some(k=>pattern.test(k)) && Number.isFinite(Number(r.values?.[0])) && r.values[0]!=='' && r.values[0]!=='..')
      .map(r=>({value:Number(r.values[0]),period:r.key.find(k=>/^20\d\d/.test(k))?.replace(/\*+/g,''),unit:'%'})).filter(r=>r.period);
    candidates.sort((a,b)=>b.period.localeCompare(a.period));const v=candidates[0];
    if(!v || Math.abs(v.value)>100)throw new Error('GSS values invalid');return v;
  };
  return {gdp:latest(data.GDP.quarterlyProduction,/year-on-year/),gdpAnnual:latest(data.GDP.annualProduction,/year-on-year/),
    inflation:latest(data.CPI.rows,/Year-on-year inflation/),ppi:latest(data.PPI.rows,/Year-on-year/),industrial:latest(data.IIP.rows,/Year-on-year/)};
}
const clean=s=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
export function parseGSE(html) {
  const rows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(v=>clean(v[1])));
  const row=rows.find(r=>r.some(v=>/^CURRENT \(\d{2}\/\d{2}\/20\d{2}\)/.test(v)));
  const year=rows.find(r=>r.some(v=>/^CHANGE-YEAR TO DATE/.test(v)));
  if(!row || !year)throw new Error('GSE format changed');
  const pos=row.findIndex(v=>v.startsWith('CURRENT')), yp=year.findIndex(v=>v.startsWith('CHANGE-YEAR'));
  const [,d,m,y]=row[pos].match(/\((\d{2})\/(\d{2})\/(\d{4})\)/);
  const value=Number(row[pos+1].replace(/,/g,'')),ytd=Number(year[yp+1].replace('%',''));
  const period=`${y}-${m}-${d}`;
  if(!(value>0 && value<1e6) || !Number.isFinite(ytd) || Date.parse(period)>Date.now()+864e5)throw new Error('GSE values invalid');
  return {index:{value,period,unit:'points'},ytd:{value:ytd,period,unit:'%'}};
}
export function latestBoGPdf(html) {
  const urls=[...html.matchAll(/https:\/\/www\.bog\.gov\.gh\/wp-content\/uploads\/(20\d{2})\/(\d{2})\/Summary-of-Economic-and-Financial-Data-[^"'<>\s]+\.pdf/gi)]
    .map(m=>({url:m[0],date:m[1]+'-'+m[2]})).sort((a,b)=>b.date.localeCompare(a.date));
  if(!urls[0])throw new Error('BoG publication missing');return urls[0].url;
}
async function download(url,limit=3e6){
  const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('source unavailable');
  const chunks=[];let size=0;for await(const c of r.body){size+=c.length;if(size>limit)throw new Error('source too large');chunks.push(c);}return Buffer.concat(chunks);
}
export function parseBoGPdf(raw) {
  return new Promise((resolve,reject)=>{
    const p=spawn(process.env.GHANA_PYTHON || '/opt/kokoro-venv/bin/python',[path.join(here,'ghana-pdf.py')],{stdio:['pipe','pipe','ignore']});
    let out='',settled=false;const timer=setTimeout(()=>{p.kill();finish(new Error('PDF timeout'));},20000);
    const finish=(err,v)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve(v);};
    p.on('error',e=>finish(e));p.stdin.on('error',()=>{});p.stdout.on('data',c=>{out+=c;if(out.length>100000){p.kill();finish(new Error('PDF output too large'));}});
    p.on('close',code=>{try{if(code!==0)throw new Error('PDF invalid');finish(null,JSON.parse(out));}catch(e){finish(e);}});p.stdin.end(raw);
  });
}
export function makeGhanaData({load=async()=>null,save=async()=>{},get=download,pdf=parseBoGPdf,now=Date.now,seed=JSON.parse(fs.readFileSync(path.join(here,'ghana-snapshot.json'),'utf8'))}={}) {
  let state=structuredClone(seed),loaded=false,busy=null,next=0;
  const read=async()=>{if(!loaded){loaded=true;try{const saved=await load();if(saved?.sources)state=saved;}catch{}}return publicData();};
  const publicData=()=>({...state,research:state.research || researchSeed(),sources:Object.fromEntries(Object.entries(state.sources).map(([k,v])=>[k,{...v,stale:!v.checked || now()-Date.parse(v.checked)>48*3600e3,
    status:v.error?'retained':v.checked?'verified':'snapshot'}]))});
  async function refresh(force=false) {
    await read();if(busy)return busy;if(!force && now()<next)return publicData();next=now()+REFRESH_MS;
    busy=(async()=>{
      for(const name of ['gss','bog','gse']){
        try{
          let raw=await get(SOURCES[name]),url=SOURCES[name],metrics;
          if(name==='gss')metrics=parseGSS(raw.toString());
          if(name==='gse')metrics=parseGSE(raw.toString());
          if(name==='bog'){url=latestBoGPdf(raw.toString());raw=await get(url,12e6);metrics=await pdf(raw);}
          // A changed layout or regressed publication must not overwrite verified numbers.
          const anchor=name==='gss'?'gdp':name==='gse'?'index':'exports';
          if(metrics[anchor].period < (state.sources[name]?.metrics?.[anchor]?.period || ''))throw new Error('older publication');
          state.sources[name]={url,checked:new Date(now()).toISOString(),sha256:hash(raw),metrics};
        }catch{state.sources[name]={...state.sources[name],error:true};}
      }
      state.research=await checkResearch(state.research,{get,now:now()});
      state.checked=new Date(now()).toISOString();await save(state).catch(()=>{});return publicData();
    })().finally(()=>{busy=null;});return busy;
  }
  return {read,refresh};
}
