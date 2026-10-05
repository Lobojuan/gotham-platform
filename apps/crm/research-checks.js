/* Daily verification of cited research. Changed documents require editorial review:
   never replace a historical price or forecast with guessed numbers. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const RESEARCH_SOURCES=JSON.parse(fs.readFileSync(fileURLToPath(new URL('./research-sources.json',import.meta.url)),'utf8'));
export function researchHash(raw,url) {
  let data=raw;
  if(url.endsWith('.pdf')) {if(!raw.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error('invalid PDF');}
  else {
    const text=raw.toString().replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ')
      .replace(/&(?:#[xX]?[0-9a-fA-F]+|[A-Za-z]+);/g,' ')
      .replace(/\s+/g,' ').trim();
    if(text.length<100 || /checking your browser|just a moment|verify you are human/i.test(text.slice(0,1000)))throw new Error('source blocked');
    data=Buffer.from(text);
  }
  return crypto.createHash('sha256').update(data).digest('hex');
}
export function researchSeed(registry=RESEARCH_SOURCES) {
  const items=Object.fromEntries(Object.entries(registry).map(([key,r])=>[key,{url:r.url,label:r.label,checked:r.verified||null,verified:r.verified||null,sha256:r.baseline||null,status:r.baseline?'verified':'pending'}]));
  return {checked:null,items};
}
export async function checkResearch(previous,{get,now=Date.now(),registry=RESEARCH_SOURCES}={}) {
  const date=new Date(now).toISOString(),sameDay=previous?.checked?.slice(0,10)===date.slice(0,10);
  if(sameDay && Object.keys(registry).every(k=>previous.items?.[k]))return previous;
  const items={};
  for(const [key,r]of Object.entries(registry)) {
    const old=previous?.items?.[key] || researchSeed({[key]:r}).items[key];
    try {
      const raw=await get(r.url,r.maxBytes || 26e6),sha256=researchHash(raw,r.url),changed=!r.baseline || sha256!==r.baseline;
      items[key]={url:r.url,label:r.label,checked:date,verified:changed?old.verified:date,sha256,status:changed?'review':'verified'};
    } catch {items[key]={...old,url:r.url,label:r.label,checked:date,status:'unavailable'};}
  }
  return {checked:date,items};
}
