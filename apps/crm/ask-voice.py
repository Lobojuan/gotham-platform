"""Warm local Kokoro worker: Jarvis's bm_fable voice; framed WAV protocol shared with tts.js."""
import io, json, os, sys
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

kokoro = Kokoro(sys.argv[1], os.environ['KOKORO_VOICES'])
out = sys.stdout.buffer
out.write(b'READY\n'); out.flush()
for line in sys.stdin:
    try:
        b = json.loads(line)
        text = str(b.get('text', '')).strip()[:2000]
        lang = {'en': 'en-gb', 'fr': 'fr-fr', 'es': 'es'}.get(b.get('language'), 'en-gb')
        samples, rate = kokoro.create(text, voice='bm_fable', speed=1.0, lang=lang)
        buf = io.BytesIO(); sf.write(buf, np.asarray(samples), rate, format='WAV', subtype='PCM_16')
        data = buf.getvalue()
    except Exception:
        data = b''
    out.write(len(data).to_bytes(4, 'big')); out.write(data); out.flush()
