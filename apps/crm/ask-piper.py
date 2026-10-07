"""Regional France/Spain speech worker; the same framed WAV protocol as ask-voice.py."""
import io, json, os, sys, wave
from pathlib import Path
from piper import PiperVoice, SynthesisConfig

language = os.environ['ASK_PIPER_LANGUAGE']
settings = json.loads(Path(__file__).with_name('ask-voices.json').read_text())[language]
voice = PiperVoice.load(sys.argv[1])
config = SynthesisConfig(speaker_id=settings['speaker'])
out = sys.stdout.buffer
out.write(b'READY\n'); out.flush()
for line in sys.stdin:
    try:
        request = json.loads(line)
        if request.get('language') != language:
            raise ValueError('language mismatch')
        text = str(request.get('text', '')).strip()[:2000]
        buf = io.BytesIO()
        with wave.open(buf, 'wb') as wav:
            voice.synthesize_wav(text, wav, config)
        data = buf.getvalue()
    except Exception:
        data = b''
    out.write(len(data).to_bytes(4, 'big')); out.write(data); out.flush()
