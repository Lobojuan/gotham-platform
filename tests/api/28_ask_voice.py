"""Native-language answer tickets: binding, expiry, voice routing, bounded work and failures."""
import io, json, os, subprocess, sys, time, types, urllib.request, urllib.error
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(ROOT + '/apps/crm')
# Exercise both real Python entry points with a tiny synthesis double. This catches
# a worker/build mapping mismatch without downloading models in the API suite.
voices = json.load(open('ask-voices.json'))
expected = {'en': ('bm_fable', 'en-gb'), 'fr': ('pierre_fr_FR', 'fr-FR'), 'es': ('sharvard_es_ES', 'es-ES'), 'de': ('thorsten_de_DE','de-DE'), 'ar':('M1','ar'), 'zh':('zf_001','zh-CN')}
assert {lang: (s['voice'], s['lang']) for lang, s in voices.items()} == expected
calls, piper_calls, encoded = [], [], []
class Kokoro:
    def __init__(self, *args): pass
    def create(self, text, **kwargs):
        calls.append((kwargs['voice'], kwargs['lang']))
        return [0.1, -0.1], 24000
def write_wav(buf, *args, **kwargs): buf.write(b'RIFF-test-wave')
class SynthesisConfig:
    def __init__(self, speaker_id): self.speaker_id = speaker_id
class PiperVoice:
    @classmethod
    def load(cls, model):
        instance = cls(); instance.model = model; return instance
    def synthesize_wav(self, text, output, config):
        piper_calls.append((os.path.basename(self.model), config.speaker_id))
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(22050)
        output.writeframes(b'\x01\x00'*10)
saved_modules = {name: sys.modules.get(name) for name in ['kokoro_onnx', 'soundfile', 'numpy', 'piper']}
sys.modules.update(kokoro_onnx=types.SimpleNamespace(Kokoro=Kokoro),
    soundfile=types.SimpleNamespace(write=write_wav), numpy=types.SimpleNamespace(asarray=lambda x:x),
    piper=types.SimpleNamespace(PiperVoice=PiperVoice,SynthesisConfig=SynthesisConfig))
saved_in, saved_out, saved_argv = sys.stdin, sys.stdout, sys.argv
saved_run = subprocess.run
try:
    os.environ['KOKORO_VOICES'] = '/tmp/test-voices'
    sys.argv = ['ask-voice.py', '/tmp/test-model']
    sys.stdin = io.StringIO(''.join(json.dumps({'text':'Native language test.', 'language':lang})+'\n' for lang in ['en','fr','es','invalid']))
    output = io.BytesIO(); sys.stdout = types.SimpleNamespace(buffer=output)
    exec(compile(open('ask-voice.py').read(), 'ask-voice.py', 'exec'), {'__file__':os.path.abspath('ask-voice.py')})
    assert calls == [expected['en']]*2
    assert output.getvalue().startswith(b'READY\n') and output.getvalue().count(b'RIFF-test-wave') == 2
    for language in ['fr','es','de']:
        piper_calls.clear()
        os.environ['ASK_PIPER_LANGUAGE'] = language
        sys.argv = ['ask-piper.py', voices[language]['model']+'.onnx']
        sys.stdin = io.StringIO(''.join(json.dumps({'text':'Regional speech test.', 'language':l})+'\n' for l in [language,'en']))
        output = io.BytesIO(); sys.stdout = types.SimpleNamespace(buffer=output)
        exec(compile(open('ask-piper.py').read(), 'ask-piper.py', 'exec'), {'__file__':os.path.abspath('ask-piper.py')})
        assert piper_calls == [(voices[language]['model']+'.onnx', voices[language]['speaker'])]
        assert output.getvalue().startswith(b'READY\n') and output.getvalue().count(b'RIFF') == 1
        assert output.getvalue().endswith(b'\0\0\0\0'), 'must reject a different language'
    sys.stdout = saved_out
    for copy in ['ask-welcome.json','ask-payment.json']:
        calls.clear(); piper_calls.clear(); encoded.clear()
        for selected in ['en','fr,es,de']:
            sys.argv = ['make-intros.py','model','voices',copy,'/tmp/gotham-native-voice-fixture',selected]
            subprocess.run = lambda args, **kwargs: encoded.append(args[-1])
            exec(compile(open('make-intros.py').read(), 'make-intros.py', 'exec'), {'__file__':os.path.abspath('make-intros.py')})
        assert calls == [expected['en']]
        assert piper_calls == [(voices[l]['model']+'.onnx',voices[l]['speaker']) for l in ['fr','es','de']]
        assert [os.path.basename(f) for f in encoded] == [s[0]+'-'+l+'.mp3' for l,s in expected.items() if l in ['en','fr','es','de']]
finally:
    sys.stdin, sys.stdout, sys.argv = saved_in, saved_out, saved_argv
    subprocess.run = saved_run
    os.environ.pop('KOKORO_VOICES', None)
    os.environ.pop('ASK_PIPER_LANGUAGE', None)
    for name, old in saved_modules.items():
        if old is None: sys.modules.pop(name, None)
        else: sys.modules[name] = old
print('  ok native EN/FR/ES voices in dynamic worker, both fixed builds and versioned recordings')
code = r'''
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {makeAskVoice} from './ask-voice.js';
let clock=Date.now(), calls=[];
const v=makeAskVoice({enabled:()=>true, now:()=>clock, dailyCap:3,
 render:async(text,language)=>{calls.push({text,language});return Buffer.from('mp3');}});
const a=v.issue('Bonjour.','one','fr');
assert.equal(a.voice,'pierre_fr_FR');
const mapping=makeAskVoice({enabled:()=>true});
for(const [language,voice] of Object.entries({en:'bm_fable',fr:'pierre_fr_FR',es:'sharvard_es_ES',de:'thorsten_de_DE',ar:'M1',zh:'zf_001',invalid:'bm_fable'}))
  assert.equal(mapping.issue('Voice test','one',language).voice,voice);
console.log('  ok native voice metadata and unsupported-language English fallback');
const fixed=fs.mkdtempSync(path.join(os.tmpdir(),'gotham-native-cache-'));
const copy=JSON.parse(fs.readFileSync('./ask-payment.json','utf8'));
const oldPayments=process.env.KOKORO_PAYMENTS;process.env.KOKORO_PAYMENTS=fixed;
try {
 const cache=makeAskVoice({enabled:()=>true,render:async()=>Buffer.from('fresh synthesis')});
 for(const [language,speaker] of Object.entries({en:'bm_fable',fr:'pierre_fr_FR',es:'sharvard_es_ES',de:'thorsten_de_DE',ar:'M1',zh:'zf_001'})) {
  fs.writeFileSync(path.join(fixed,language+'.mp3'),'stale English voice');
  const text=copy[language];
  const stale=cache.start(cache.issue(text,'one',language).token,'one');
  assert.equal(stale.status,202);await new Promise(setImmediate);
  assert.equal(cache.result(stale.job,'one').audio.toString(),'fresh synthesis');
  fs.writeFileSync(path.join(fixed,speaker+'-'+language+'.mp3'),speaker);
  const hit=cache.start(cache.issue(text,'one',language).token,'one');
  assert.equal(hit.status,200);assert.equal(hit.audio.toString(),speaker);
 }
} finally {if(oldPayments===undefined)delete process.env.KOKORO_PAYMENTS;else process.env.KOKORO_PAYMENTS=oldPayments;fs.rmSync(fixed,{recursive:true});}
console.log('  ok fixed recordings select native speaker and reject stale English audio');
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
assert.ok(spoken[0].length<=45);waiters.shift()(Buffer.from('first'));await new Promise(setImmediate);
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
    SESSION_SECRET='test', PORT='4214', ADMIN_EMAIL='admin', ADMIN_PASSWORD='ownerpass123', ADMIN_NAME='Admin',
    MEDIA_DIR='/tmp/mediatest', KOKORO_MODEL='/tmp/definitely-missing-kokoro', OPENAI_API_KEY='')
srv = subprocess.Popen(['node','server.js'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try:
            if urllib.request.urlopen('http://127.0.0.1:4214/api/health',timeout=2).status==200: break
        except Exception: time.sleep(.4)
    req=urllib.request.Request('http://127.0.0.1:4214/api/ask/voice',data=json.dumps({'text':'arbitrary text','token':'fake'}).encode(),headers={'content-type':'application/json'})
    try: urllib.request.urlopen(req); raise AssertionError('should refuse')
    except urllib.error.HTTPError as e: assert e.code==503 and json.loads(e.read())=={'error':'voice_unavailable'}
    print('  ok public voice route refuses arbitrary text and degrades without a model')
    for lang, phrase in [('en','consulting services'),('fr','services de conseil'),('es','servicios de consultoría'),('de','Beratungsleistungen'),('ar','خدماتنا'),('zh','服务')]:
        req=urllib.request.Request('http://127.0.0.1:4214/api/ask',data=json.dumps({'intro':True,'language':lang,'speech':True}).encode(),headers={'content-type':'application/json'})
        answer=json.load(urllib.request.urlopen(req)); assert phrase in answer['answer'] and answer['speech'] is None
    print('  ok broad site introduction in six languages without a model-provider call')
    print('PASSED')
finally:
    srv.terminate(); srv.wait(timeout=5)
