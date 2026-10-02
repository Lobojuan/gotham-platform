# The receptionist demo's voice: Piper text-to-speech, run on our own server (free, nothing sent elsewhere).
# Started once by tts.js and kept running, so the voice model loads only once.
# Protocol: one JSON line in ({"text": "..."}); out: 4-byte big-endian length, then a WAV file (length 0 = failed).
import sys, json, io, wave
from piper import PiperVoice

voice = PiperVoice.load(sys.argv[1])
out = sys.stdout.buffer
out.write(b'READY\n'); out.flush()
for line in sys.stdin:
    try:
        text = str(json.loads(line).get('text', ''))[:800].strip()
        buf = io.BytesIO()
        with wave.open(buf, 'wb') as w:
            voice.synthesize_wav(text, w)
        data = buf.getvalue()
    except Exception as e:
        sys.stderr.write('tts failed: %s\n' % str(e)[:200]); sys.stderr.flush()
        data = b''
    out.write(len(data).to_bytes(4, 'big')); out.write(data); out.flush()
