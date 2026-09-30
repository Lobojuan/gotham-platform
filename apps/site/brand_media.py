"""Put the logo on every photo, share image and video of the website, at build time.

The files in public/img stay as they are (clean originals, easy to replace); the copies in dist/ get a small white
logo in the bottom-right corner. Anything added to public/img later is branded on the next build without extra
work. Results are cached by content (default ~/.cache/gotham-brand), so a video is only re-encoded when it or
the logo changes. Needs ffmpeg; without it the build warns and publishes the files unbranded.
"""
import hashlib, os, shutil, subprocess, json

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, 'public', 'img', 'brand', 'mark-white-256.png')
VERSION = 'v2'   # v2: soft shadow under the logo, same look as uploads in the back office   # change to re-brand everything (e.g. new size or position)
IMG = ('.webp', '.jpg', '.jpeg', '.png')
VID = ('.mp4', '.webm')
SKIP_DIRS = {'brand', 'earth'}   # the logo itself; the globe's map textures
SKIP_LIST = os.path.join(HERE, 'public', 'img', 'already-branded.txt')   # pictures that already show the logo

def already_branded():
    try: return {l.strip() for l in open(SKIP_LIST) if l.strip() and not l.startswith('#')}
    except FileNotFoundError: return set()

def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', path],
                         capture_output=True, text=True, check=True).stdout
    s = json.loads(out)['streams'][0]; return int(s['width']), int(s['height'])

_ENC = {}
def has_encoder(ffmpeg, name):
    if ffmpeg not in _ENC:
        _ENC[ffmpeg] = subprocess.run([ffmpeg, '-hide_banner', '-encoders'], capture_output=True, text=True).stdout
    return f' {name} ' in _ENC[ffmpeg]

def brand_file(src, dst, ffmpeg):
    w, h = probe(src)
    lw = max(22, round(min(w, h * 1.4) * 0.06)); lw += lw % 2
    m = max(10, round(min(w, h) * 0.035))
    sh = max(1, round(lw / 30))   # white logo with a soft shadow: readable on white walls and dark stages
    fc = (f'[1]scale={lw}:-1,format=rgba,split[a][b];[a]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.42,boxblur={sh}:1[s];'
          f'[b]colorchannelmixer=aa=0.9[l];[0][s]overlay=W-w-{m - 1}:H-h-{m - 1}[t];[t][l]overlay=W-w-{m}:H-h-{m}:format=auto')
    ext = os.path.splitext(src)[1].lower()
    base = [ffmpeg, '-v', 'error', '-y', '-i', src, '-i', LOGO, '-filter_complex', fc]
    if ext == '.webp' and not has_encoder(ffmpeg, 'libwebp'):
        # some ffmpeg builds (Homebrew's) cannot write WebP: make a PNG, then let cwebp encode it
        cwebp = shutil.which('cwebp')
        if not cwebp: raise subprocess.CalledProcessError(1, 'cwebp', stderr=b'ffmpeg has no WebP encoder and cwebp is not installed (brew install webp)')
        tmp = dst + '.png'
        subprocess.run(base + ['-frames:v', '1', '-c:v', 'png', tmp], check=True, capture_output=True)
        try: subprocess.run([cwebp, '-quiet', '-q', '84', '-mt', tmp, '-o', dst], check=True, capture_output=True)
        finally:
            try: os.remove(tmp)
            except FileNotFoundError: pass
        return
    if ext in IMG:
        enc = {'.webp': ['-c:v', 'libwebp', '-quality', '84'], '.png': ['-c:v', 'png'], '.jpg': ['-q:v', '3'], '.jpeg': ['-q:v', '3']}[ext]
        cmd = base + ['-frames:v', '1'] + enc + [dst]
    elif ext == '.mp4':
        cmd = base + ['-map', '0:a?', '-c:v', 'libx264', '-crf', '21', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'copy', dst]
    else:
        cmd = base + ['-map', '0:a?', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-crf', '33', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-c:a', 'copy', dst]
    subprocess.run(cmd, check=True, capture_output=True)

def run(dist):
    # a Mac shell started from an app has a short PATH: also look where Homebrew puts ffmpeg
    extra = os.pathsep.join(['/opt/homebrew/bin', '/usr/local/bin'])
    os.environ['PATH'] = os.environ.get('PATH', '') + os.pathsep + extra
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg or not shutil.which('ffprobe'):
        print('  !! ffmpeg not found: photos and videos are published WITHOUT the logo (install ffmpeg and build again)')
        return
    cache = os.environ.get('BRAND_CACHE', os.path.join(os.path.expanduser('~'), '.cache', 'gotham-brand'))
    os.makedirs(cache, exist_ok=True)
    logo_h = hashlib.sha256(open(LOGO, 'rb').read()).hexdigest()
    done = hit = skipped = 0
    root = os.path.join(dist, 'img'); skip = already_branded()
    try: os.remove(os.path.join(root, 'already-branded.txt'))
    except FileNotFoundError: pass
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in sorted(files):
            ext = os.path.splitext(fn)[1].lower()
            if ext not in IMG + VID or 'logo' in fn.lower(): continue
            path = os.path.join(dirpath, fn)
            if os.path.relpath(path, root) in skip or '.branded.' in fn.lower(): skipped += 1; continue
            key = hashlib.sha256(open(path, 'rb').read() + logo_h.encode() + VERSION.encode()).hexdigest()[:32]
            cached = os.path.join(cache, key + ext)
            if not os.path.exists(cached):
                tmp = cached + '.part' + ext
                try: brand_file(path, tmp, ffmpeg); os.replace(tmp, cached)
                except subprocess.CalledProcessError as e:
                    print(f'  !! could not brand {fn}: {e.stderr[-300:] if e.stderr else e}'); continue
                done += 1
            else: hit += 1
            shutil.copyfile(cached, path)
    print(f'  logo on photos and videos: {done} made, {hit} from cache, {skipped} already had it')
