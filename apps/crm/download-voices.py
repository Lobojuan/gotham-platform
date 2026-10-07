"""Download public free voice assets. Fail the build on any checksum change."""
import hashlib, json, sys, urllib.request, shutil
from pathlib import Path
root = Path(sys.argv[1])
for item in json.loads(Path(__file__).with_name('voice-models.json').read_text()):
    relative = Path(item['file'])
    if relative.is_absolute() or '..' in relative.parts: raise ValueError('invalid model path')
    destination = root / relative; destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + '.download')
    request = urllib.request.Request(item['source'], headers={'User-Agent': 'GothamVoiceModels/1.0'})
    with urllib.request.urlopen(request, timeout=180) as response, temporary.open('wb') as output:
        shutil.copyfileobj(response, output)
    digest = hashlib.sha256()
    with temporary.open('rb') as asset:
        for chunk in iter(lambda: asset.read(1024 * 1024), b''): digest.update(chunk)
    if digest.hexdigest() != item['sha256']:
        raise ValueError('model fingerprint changed: ' + item['file'])
    temporary.replace(destination)
    print('Verified voice asset:', item['file'], flush=True)
