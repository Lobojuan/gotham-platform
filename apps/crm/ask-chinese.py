"""Mainland Mandarin worker, using the Chinese model's phonemes and native speaker."""
import contextlib, io, json, os, sys
from pathlib import Path
import soundfile as sf
from kokoro_onnx import Kokoro
from misaki import zh

settings = json.loads(Path(__file__).with_name('ask-voices.json').read_text())['zh']
# Both Latin acronyms/brand names and Han text must be spoken, never silently dropped.
with contextlib.redirect_stdout(sys.stderr):
    kokoro = Kokoro(sys.argv[1], os.environ['KOKORO_ZH_VOICES'], vocab_config=os.environ['KOKORO_ZH_CONFIG'])
    g2p = zh.ZHG2P(version='1.1', en_callable=lambda text: kokoro.tokenizer.phonemize(text, lang='en-us'))
out = sys.stdout.buffer
out.write(b'READY\n'); out.flush()
for line in sys.stdin:
    try:
        b = json.loads(line)
        if b.get('language') != 'zh': raise ValueError('language mismatch')
        text = str(b.get('text', '')).strip()[:2000]
        with contextlib.redirect_stdout(sys.stderr):
            phonemes, _ = g2p(text)
            samples, rate = kokoro.create(phonemes, voice=settings['voice'], speed=1.0, is_phonemes=True)
        buf = io.BytesIO(); sf.write(buf, samples, rate, format='WAV', subtype='PCM_16'); data = buf.getvalue()
    except Exception:
        data = b''
    out.write(len(data).to_bytes(4, 'big')); out.write(data); out.flush()
