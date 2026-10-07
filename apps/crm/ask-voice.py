"""Warm Kokoro worker with a native voice per language; framed WAV protocol shared with tts.js."""
import io, json, os, sys
from pathlib import Path
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

kokoro = Kokoro(sys.argv[1], os.environ['KOKORO_VOICES'])
voices = json.loads(Path(__file__).with_name('ask-voices.json').read_text())
out = sys.stdout.buffer
out.write(b'READY\n'); out.flush()
for line in sys.stdin:
    try:
        b = json.loads(line)
        text = str(b.get('text', '')).strip()[:2000]
        settings = voices.get(b.get('language'), voices['en'])
        if settings['engine'] != 'kokoro':
            raise ValueError('language requires regional Piper voice')
        samples, rate = kokoro.create(text, voice=settings['voice'], speed=1.0, lang=settings['lang'])
        buf = io.BytesIO(); sf.write(buf, np.asarray(samples), rate, format='WAV', subtype='PCM_16')
        data = buf.getvalue()
    except Exception:
        data = b''
    out.write(len(data).to_bytes(4, 'big')); out.write(data); out.flush()
