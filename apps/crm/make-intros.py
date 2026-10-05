"""Build the three fixed Fable introductions once; visitors do not wait for synthesis."""
import io,json,sys,subprocess
from pathlib import Path
import soundfile as sf
from kokoro_onnx import Kokoro
model,voices,copy,destination=sys.argv[1:]
engine=Kokoro(model,voices)
folder=Path(destination);folder.mkdir(parents=True,exist_ok=True)
for lang,text in json.load(open(copy)).items():
    samples,rate=engine.create(text,voice='bm_fable',speed=1.0,lang={'en':'en-gb','fr':'fr-fr','es':'es'}[lang])
    wav=io.BytesIO();sf.write(wav,samples,rate,format='WAV',subtype='PCM_16')
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-f','wav','-i','pipe:0','-ac','1','-codec:a','libmp3lame','-b:a','48k','-y',str(folder/(lang+'.mp3'))],input=wav.getvalue(),check=True)
    print('Built Fable introduction:',lang,flush=True)
