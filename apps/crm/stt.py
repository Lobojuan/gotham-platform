# The receptionist demo's ears: Whisper speech-to-text, run on our own server (free, nothing sent elsewhere).
# Started once by stt.js and kept running, so the model loads only once.
# Protocol: in, one JSON line {"lang": "en", "n": <bytes>} followed by n bytes of raw 16 kHz mono signed 16-bit audio;
#           out, one JSON line {"text": "...", "ms": <milliseconds>} (text is "" when nothing was understood).
import sys, json, time, os
import numpy as np
from faster_whisper import WhisperModel

# English is heard by the small English-only model (fast on our one CPU); French and Spanish by the larger multilingual one, loaded on first use
EN_DIR = sys.argv[1] if len(sys.argv) > 1 else ''
MULTI_DIR = sys.argv[2] if len(sys.argv) > 2 else ''
THREADS = int(os.environ.get('WHISPER_THREADS', '1'))
_models = {}
def get_model(lang):
    key = 'en' if (lang == 'en' and EN_DIR) or not MULTI_DIR else 'multi'
    path = EN_DIR if key == 'en' and EN_DIR else MULTI_DIR
    if not path:
        return None
    if path not in _models:
        _models[path] = WhisperModel(path, device='cpu', compute_type='int8', cpu_threads=THREADS, num_workers=1)
    return _models[path]
get_model('en')   # load the English model now, so the first caller does not wait
# a few words of context steer the spelling of names and the clinic's vocabulary
PROMPT = {
    'en': 'A caller phones Kasa Family Clinic in Accra, Ghana to book an appointment, ask about prices in cedis, or pay by mobile money.',
    'fr': 'Un appelant téléphone à la clinique familiale Kasa à Accra, au Ghana, pour prendre rendez-vous ou demander les prix en cédis.',
    'es': 'Una persona llama a la clínica familiar Kasa en Accra, Ghana, para pedir una cita o preguntar los precios en cedis.',
}
# what Whisper tends to invent from silence or noise
JUNK = ('thanks for watching', 'thank you for watching', 'subtitles by', 'subtitles', 'sous-titres', 'sous-titrage', 'subtítulos', 'amara.org', 'please subscribe')

out = sys.stdout
out.write('READY\n'); out.flush()
inp = sys.stdin.buffer
while True:
    line = inp.readline()
    if not line:
        break
    t0 = time.time(); text = ''
    try:
        req = json.loads(line)
        n = int(req.get('n', 0))
        raw = b''
        while len(raw) < n:
            chunk = inp.read(n - len(raw))
            if not chunk:
                break
            raw += chunk
        lang = req.get('lang') if req.get('lang') in ('en', 'fr', 'es') else None
        audio = np.frombuffer(raw[: len(raw) // 2 * 2], dtype=np.int16).astype(np.float32) / 32768.0
        # a recording with almost no sound in it is not worth listening to (and Whisper invents words from silence)
        if len(audio) >= 16000 * 0.3 and float(np.sqrt(np.mean(audio ** 2))) > 0.002:
            model = get_model(lang)
            if model is None:
                raise RuntimeError('no model')
            segs, _info = model.transcribe(audio, language=lang, beam_size=1, best_of=1, temperature=0.0, condition_on_previous_text=False,
                                           without_timestamps=True, vad_filter=False, initial_prompt=PROMPT.get(lang or 'en'), no_speech_threshold=0.6)
            keep = []
            for s in segs:
                if s.avg_logprob < -1.3 or (s.no_speech_prob > 0.45 and s.avg_logprob < -0.7):
                    continue
                keep.append(s.text.strip())
            text = ' '.join(x for x in keep if x).strip()
            if any(j in text.lower() for j in JUNK):
                text = ''
    except Exception as e:
        sys.stderr.write('stt failed: %s\n' % str(e)[:200]); sys.stderr.flush()
        text = ''
    out.write(json.dumps({'text': text[:500], 'ms': int((time.time() - t0) * 1000)}) + '\n'); out.flush()
