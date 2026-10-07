"""Public chatbot prompts stay bounded and retain whole verified material."""
import os,subprocess
from pathlib import Path
os.chdir(Path(__file__).resolve().parents[2]/'apps/crm')
subprocess.run(['node','--input-type=module','-e',r'''
import assert from 'node:assert/strict';
import {publicAskMessages} from './ask-context.js';
const rules='Never invent a fee. Answer in the selected language.';
const small=publicAskMessages({rules,knowledge:'## Prices\nFee GHS 350.\n\n## Forums\nQA Roundtable.',history:[{role:'user',content:'hi'},{role:'assistant',content:'Hello'}],question:'Next forum?'});
assert.deepEqual(small.map(m=>m.role),['system','user','assistant','user']);assert.ok(small[0].content.includes('Fee GHS 350.'));console.log('  ok small contexts retain facts, current question and complete recent turns');
const knowledge='## Packages and prices\nGHS 350; excluding VAT. Do not guarantee approval.\n'+Array.from({length:30},(_,i)=>'\n## Other section '+i+'\n'+('Other source material. '.repeat(100))).join('');
for(const language of ['English','French','Spanish','German','Modern Standard Arabic','Simplified Chinese']){
 const messages=publicAskMessages({rules:rules+' Selected language: '+language,knowledge,sources:'SOURCE: https://gothamconsult.com/services\nOfficial costs remain at cost.',history:Array.from({length:6},(_,i)=>({role:i%2?'assistant':'user',content:'投资费用السيدي'.repeat(200)})),question:'What are the prices?'});
 assert.ok(messages.reduce((n,m)=>n+Buffer.byteLength(m.content)+64,0)<=22000);
 assert.ok(messages[0].content.startsWith(rules));assert.ok(messages[0].content.includes('GHS 350; excluding VAT. Do not guarantee approval.'));
 assert.ok(messages[0].content.includes('https://gothamconsult.com/services'));assert.equal(messages.at(-1).content,'What are the prices?');
 console.log('  ok byte budget, rules, whole price qualifier, source link and question:',language);
}
const full='## Economic publications\n'+('Complete data. '.repeat(1000));
const trimmed=publicAskMessages({rules,knowledge:full,question:'GDP?',maxBytes:1000});assert.ok(!trimmed[0].content.includes('Complete data.'));
assert.throws(()=>publicAskMessages({rules:'x'.repeat(2000),knowledge:'',question:'q',maxBytes:1000}));
console.log('  ok oversized fact sections omitted intact and rules never truncated');
console.log('PASSED');
'''],check=True)
