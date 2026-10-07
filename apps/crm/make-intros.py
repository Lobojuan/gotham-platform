"""Build fixed recordings with the same regional speakers as dynamic answers.

Run in the matching Kokoro/Piper/native Mandarin/Arabic runtime for each locale.
"""
import io, json, sys, subprocess, wave
from pathlib import Path

model, voices, copy, destination, *requested = sys.argv[1:]
settings = json.loads(Path(__file__).with_name('ask-voices.json').read_text())
languages = requested[0].split(',') if requested else list(settings)
folder = Path(destination); folder.mkdir(parents=True, exist_ok=True)
engine = None
for language, text in json.load(open(copy)).items():
    if language not in languages:
        continue
    selected = settings[language]
    wav = io.BytesIO()
    if selected['engine'] == 'kokoro-zh':
        import contextlib, os
        import soundfile as sf
        from kokoro_onnx import Kokoro
        from misaki import zh
        if engine is None:
            engine = Kokoro(model, voices, vocab_config=str(Path(model).with_name('config.json')))
            g2p = zh.ZHG2P(version='1.1', en_callable=lambda text: engine.tokenizer.phonemize(text, lang='en-us'))
        phonemes, _ = g2p(text)
        samples, rate = engine.create(phonemes, voice=selected['voice'], speed=1.0, is_phonemes=True)
        sf.write(wav, samples, rate, format='WAV', subtype='PCM_16')
    elif selected['engine'] == 'supertonic':
        import soundfile as sf
        sys.path.insert(0, str(Path(__file__).parent / 'vendor' / 'supertonic'))
        from helper import load_text_to_speech, load_voice_style
        if engine is None:
            engine = load_text_to_speech(str(Path(model).parent))
            style = load_voice_style([voices])
        samples, duration = engine(text, language, style, 8, 1.0)
        sf.write(wav, samples[0, :int(engine.sample_rate * duration[0].item())], engine.sample_rate, format='WAV', subtype='PCM_16')
    elif selected['engine'] == 'kokoro':
        import soundfile as sf
        from kokoro_onnx import Kokoro
        if engine is None:
            engine = Kokoro(model, voices)
        samples, rate = engine.create(text, voice=selected['voice'], speed=1.0, lang=selected['lang'])
        sf.write(wav, samples, rate, format='WAV', subtype='PCM_16')
    else:
        from piper import PiperVoice, SynthesisConfig
        speaker = PiperVoice.load(str(Path(model)/(selected['model']+'.onnx')))
        with wave.open(wav, 'wb') as output:
            speaker.synthesize_wav(text, output, SynthesisConfig(speaker_id=selected['speaker']))
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'wav', '-i', 'pipe:0', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '96k', '-y', str(folder/(selected['voice']+'-'+language+'.mp3'))], input=wav.getvalue(), check=True)
    print('Built recording:', language, selected['voice'], flush=True)
