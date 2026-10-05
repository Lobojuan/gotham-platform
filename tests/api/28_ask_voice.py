"""Fable answer tickets: binding, expiry, bounded work, failures, and the public route without a voice installation."""
import json, os, subprocess, time, urllib.request, urllib.error
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(ROOT + '/apps/crm')
code = r'''
import assert from 'node:assert/strict';
import {makeAskVoice} from './ask-voice.js';
let clock=Date.now(), calls=[];
const v=makeAskVoice({enabled:()=>true, now:()=>clock, dailyCap:3,
 render:async(text,language)=>{calls.push({text,language});return Buffer.from('mp3');}});
const a=v.issue('Bonjour.','one','fr');
assert.equal(a.voice,'bm_fable');
assert.equal((await v.speak(a.token,'two')).status,403);
assert.equal((await v.speak('forged','one')).status,403);
assert.equal((await v.speak(a.token,'one')).status,200);
assert.deepEqual(calls,[{text:'Bonjour.',language:'fr'}]);
assert.equal((await v.speak(a.token,'one')).status,403);
console.log('  ok visitor binding, language, forged and reused tokens');
const old=v.issue('Expired','one'); clock+=601000;
assert.equal((await v.speak(old.token,'one')).status,403);
console.log('  ok tokens expire after ten minutes');
for (const l of ['es','en']) { const t=v.issue('Reply','one',l);assert.equal((await v.speak(t.token,'one')).status,200); }
const limited=v.issue('No more','one'); assert.equal((await v.speak(limited.token,'one')).status,429);
clock+=86400000; assert.equal((await v.speak(v.issue('New day','one').token,'one')).status,200);
console.log('  ok daily cap and next-day reset');
const down=makeAskVoice({enabled:()=>false}); assert.equal(down.issue('x','one'),null);
assert.equal((await down.speak('x','one')).status,503);
const fail=makeAskVoice({enabled:()=>true,render:async()=>{throw new Error('private detail');}});
const f=await fail.speak(fail.issue('x','one').token,'one');
assert.deepEqual(f,{status:503,error:'voice_unavailable'});
console.log('  ok unavailable installation and worker errors are safe');
let finish; const slow=makeAskVoice({enabled:()=>true,render:()=>new Promise(r=>{finish=r;})});
const t=slow.issue('x','one'); const pending=slow.speak(t.token,'one');
assert.equal((await slow.speak(t.token,'one')).status,403);finish(Buffer.from('x'));await pending;
console.log('  ok simultaneous replay cannot start a second worker job');
let complete;
const bg=makeAskVoice({enabled:()=>true,render:()=>new Promise(r=>{complete=r;})});
const ticket=bg.issue('An answer that takes longer than the proxy timeout.','one');const job=bg.start(ticket.token,'one');
assert.equal(job.status,202);assert.equal(bg.start(ticket.token,'one').status,403);
assert.equal(bg.result(job.job,'two').status,403);assert.equal(bg.result(job.job,'one').status,202);
await new Promise(setImmediate);complete(Buffer.from('actual mp3'));await new Promise(setImmediate);
const ready=bg.result(job.job,'one');assert.equal(ready.status,200);assert.equal(ready.audio.toString(),'actual mp3');
assert.equal(bg.result(job.job,'one').status,403);
const broken=makeAskVoice({enabled:()=>true,render:async()=>{throw new Error('private details');}});
const bad=broken.start(broken.issue('x','one').token,'one');await new Promise(setImmediate);
assert.deepEqual(broken.result(bad.job,'one'),{status:503,error:'voice_unavailable'});
console.log('  ok background jobs: pending, visitor binding, one-time result, sanitized failures');
const waiters=[],spoken=[];const streaming=makeAskVoice({enabled:()=>true,render:(text,language,signal)=>new Promise((resolve,reject)=>{spoken.push(text);waiters.push(resolve);signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});})});
const full='A short opening phrase starts promptly. '+('More words follow with all the original meaning. '.repeat(5));
const stream=streaming.start(streaming.issue(full,'one').token,'one',true);await new Promise(setImmediate);
assert.ok(spoken[0].length<=65);waiters.shift()(Buffer.from('first'));await new Promise(setImmediate);
const first=streaming.result(stream.job,'one');assert.equal(first.audio.toString(),'first');assert.equal(first.more,true);
assert.equal(streaming.cancel(stream.job,'two').status,403);assert.equal(streaming.cancel(stream.job,'one').status,200);await new Promise(setImmediate);
assert.equal(streaming.result(stream.job,'one').status,403);console.log('  ok early audio chunks and visitor-bound cancellation');
let joined=[];const completeStream=makeAskVoice({enabled:()=>true,render:async text=>{joined.push(text);return Buffer.from(text);}});
const stream2=completeStream.start(completeStream.issue(full,'one').token,'one',true);await new Promise(setImmediate);
let chunks=[];while(true){const part=completeStream.result(stream2.job,'one');assert.equal(part.status,200);chunks.push(part.audio.toString());if(!part.more)break;}
assert.equal(chunks.join(' '),full.trim());console.log('  ok streaming retains every word and finishes with a replayable answer');

'''
subprocess.run(['node', '--input-type=module', '-e', code], check=True)
env = dict(os.environ, DATABASE_URL=os.environ.get('TEST_DATABASE_URL','postgres://test@127.0.0.1:5439/gotham_test'),
    SESSION_SECRET='test', PORT='4199', ADMIN_EMAIL='admin', ADMIN_PASSWORD='ownerpass123', ADMIN_NAME='Admin',
    MEDIA_DIR='/tmp/mediatest', KOKORO_MODEL='/tmp/definitely-missing-kokoro', OPENAI_API_KEY='')
srv = subprocess.Popen(['node','server.js'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try:
            if urllib.request.urlopen('http://127.0.0.1:4199/api/health',timeout=2).status==200: break
        except Exception: time.sleep(.4)
    req=urllib.request.Request('http://127.0.0.1:4199/api/ask/voice',data=json.dumps({'text':'arbitrary text','token':'fake'}).encode(),headers={'content-type':'application/json'})
    try: urllib.request.urlopen(req); raise AssertionError('should refuse')
    except urllib.error.HTTPError as e: assert e.code==503 and json.loads(e.read())=={'error':'voice_unavailable'}
    print('  ok public voice route refuses arbitrary text and degrades without a model')
    for lang, phrase in [('en','consulting services'),('fr','services de conseil'),('es','servicios de consultoría')]:
        req=urllib.request.Request('http://127.0.0.1:4199/api/ask',data=json.dumps({'intro':True,'language':lang,'speech':True}).encode(),headers={'content-type':'application/json'})
        answer=json.load(urllib.request.urlopen(req)); assert phrase in answer['answer'] and answer['speech'] is None
    print('  ok broad site introduction in three languages without a model-provider call')
    print('PASSED')
finally:
    srv.terminate(); srv.wait(timeout=5)
