"""Formal Arabic worker. Local Supertonic 3; no external API or cloned voice."""
import contextlib, io, json, os, sys
from pathlib import Path
import soundfile as sf
sys.path.insert(0, str(Path(__file__).parent / 'vendor' / 'supertonic'))
from helper import load_text_to_speech, load_voice_style

settings = json.loads(Path(__file__).with_name('ask-voices.json').read_text())['ar']
with contextlib.redirect_stdout(sys.stderr):
    voice = load_text_to_speech(str(Path(sys.argv[1]).parent))
    style = load_voice_style([os.environ['SUPERTONIC_STYLE']])
out = sys.stdout.buffer
out.write(b'READY\n'); out.flush()
for line in sys.stdin:
    try:
        b = json.loads(line)
        if b.get('language') != 'ar': raise ValueError('language mismatch')
        text = str(b.get('text', '')).strip()[:2000]
        with contextlib.redirect_stdout(sys.stderr):
            samples, duration = voice(text, 'ar', style, 8, 1.0)
        buf = io.BytesIO(); sf.write(buf, samples[0, :int(voice.sample_rate * duration[0].item())], voice.sample_rate, format='WAV', subtype='PCM_16'); data = buf.getvalue()
    except Exception:
        data = b''
    out.write(len(data).to_bytes(4, 'big')); out.write(data); out.flush()
