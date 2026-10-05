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
