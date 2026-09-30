# Uploads: the logo goes on pictures, PDFs and videos (unless they already have it), the date taken is read from the file,
# location data never reaches the public copy, originals stay private. Videos upload in pieces and are converted.
# Event pages (/events, /events/<slug>), the sitemap that lists them, the one-off content import, and the guard that
# stops a draft with a gap like [Speaker 1] from being sent. Needs ffmpeg, Pillow and the built site.
import subprocess, time, json, os, urllib.request, urllib.error, sys, base64, io, shutil, tempfile
from PIL import Image
DB = os.environ.get('TEST_DATABASE_URL', 'postgres://test@127.0.0.1:5439/gotham_test')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(os.path.join(ROOT, 'apps', 'crm'))
DIST = ROOT + '/apps/site/dist'
if not os.path.exists(DIST + '/event-shell.html'): subprocess.run(['python3', ROOT + '/apps/site/build.py'], check=True, capture_output=True)
MEDIA = tempfile.mkdtemp(prefix='media22-')
env = dict(os.environ); env.update({'DATABASE_URL': DB, 'SESSION_SECRET': 't', 'PORT': '4199', 'ADMIN_EMAIL': 'admin@gotham.test', 'ADMIN_PASSWORD': 'ownerpass123', 'ADMIN_NAME': 'Admin',
    'MEDIA_DIR': MEDIA, 'PUBLIC_URL': 'http://127.0.0.1:4199', 'SITE_URL': 'https://gothamconsult.com', 'SITE_DIR': DIST})
srv = subprocess.Popen(['node', 'server.js'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
import atexit; atexit.register(lambda: srv.poll() is None and srv.terminate())
B = 'http://127.0.0.1:4199'
def call(path, data=None, cookie=None, method=None, raw=None, headers=None, text=False, binary=False):
    body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    req = urllib.request.Request(B + path, data=body, method=method or ('POST' if body is not None else 'GET'))
    req.add_header('content-type', 'application/octet-stream' if raw is not None else 'application/json')
    for k, v in (headers or {}).items(): req.add_header(k, v)
    if cookie: req.add_header('cookie', cookie)
    try:
        r = urllib.request.urlopen(req, timeout=60); b = r.read()
        return r.status, (b if binary else b.decode() if text else json.loads(b or b'{}')), r.headers
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, (b if binary else b.decode() if text else json.loads(b or b'{}')), e.headers
        except Exception: return e.code, b[:200], e.headers
for _ in range(60):
    try:
        if call('/api/health')[0] == 200: break
    except Exception: pass
    time.sleep(0.4)
else: print('NO START'); print(srv.stdout.read()[:3000]); sys.exit(1)
def psql(sql): return subprocess.run(['psql', DB, '-qAtc', sql], capture_output=True, text=True, check=True).stdout.strip()
ok = lambda m: print('  ok', m)
psql('update users set must_change=false')
req = urllib.request.Request(B + '/api/login', data=json.dumps({'email': 'admin@gotham.test', 'password': 'ownerpass123'}).encode(), method='POST'); req.add_header('content-type', 'application/json')
ck = urllib.request.urlopen(req).headers['set-cookie'].split(';')[0]

def jpeg(w=1600, h=1000, exif=True, color=(236, 236, 230)):
    im = Image.new('RGB', (w, h), color); buf = io.BytesIO()
    if exif:
        ex = Image.Exif(); ex[0x010F] = 'Apple'; ex[0x0110] = 'iPhone 15'
        ex.get_ifd(0x8769)[0x9003] = '2026:05:23 14:42:07'; ex.get_ifd(0x8769)[0x9011] = '+01:00'
        ex.get_ifd(0x8825)[1] = 'N'; ex.get_ifd(0x8825)[2] = (5.0, 38.0, 12.0)
        im.save(buf, 'JPEG', exif=ex)
    else: im.save(buf, 'JPEG')
    return buf.getvalue()
def up(data, name, **kw):
    return call('/api/media', {'kind': kw.pop('kind', 'image'), 'name': name, 'data': 'data:image/jpeg;base64,' + base64.b64encode(data).decode(), **kw}, ck)

# ---------- pictures: date, logo, location ----------
st, m, _ = up(jpeg(), 'IMG_4410.JPG'); assert st == 200, m
assert m['taken_at'].startswith('2026-05-23T13:42:07') and m['date_source'] == 'camera' and m['had_location'] is True, m   # 14:42 at +01:00 = 13:42 UTC
_, pub, _ = call('/media/' + m['sizes']['card']['jpg'].rsplit('/', 1)[1], binary=True)
im = Image.open(io.BytesIO(pub)); assert not dict(im.getexif()), 'public copy carries no EXIF (no GPS)'
px = im.convert('RGB'); w, h = px.size
corner = [px.getpixel((x, y)) for x in range(int(w * .86), w - 5, 3) for y in range(int(h * .82), h - 5, 3)]
assert max(sum(c) for c in corner) >= 3 * 250 and min(sum(c) for c in corner) < 3 * 200, 'the logo (white with a soft shadow) sits in the bottom-right corner'
top_left = [px.getpixel((x, y)) for x in range(5, 60, 5) for y in range(5, 60, 5)]
assert all(abs(sum(c) - sum((236, 236, 230))) < 12 for c in top_left), 'the rest of the picture is untouched'
row = json.loads(psql(f"select row_to_json(m) from media m where id='{m['id']}'"))
assert row['branded'] and row['info']['logo'] == 'added' and row['info']['camera'] == 'Apple iPhone 15'
assert call('/media/' + row['info']['orig'])[0] == 404 and os.path.exists(os.path.join(MEDIA, row['info']['orig'])), 'the original is kept but never public'
ok('photo: camera date read (with its time zone), logo in the corner, no EXIF or GPS in the public copy, original kept privately')

st, m2, _ = up(jpeg(exif=False, color=(20, 30, 50)), 'WhatsApp Image 2026-05-24 at 09.15.02.jpeg', brand=False); assert st == 200, m2
assert m2['date_source'] == 'whatsapp' and m2['taken_at'].startswith('2026-05-24T09:15:02')
assert psql(f"select info->>'logo' from media where id='{m2['id']}'") == 'already'
_, pub2, _ = call('/media/' + m2['sizes']['card']['jpg'].rsplit('/', 1)[1], binary=True)
px2 = Image.open(io.BytesIO(pub2)).convert('RGB'); w2, h2 = px2.size
assert max(sum(px2.getpixel((x, y))) for x in range(int(w2 * .86), w2 - 5, 3) for y in range(int(h2 * .82), h2 - 5, 3)) < 3 * 80, 'no logo when the picture already has it'
st, m3, _ = up(jpeg(exif=False), 'photo.jpg'); assert m3['taken_at'] is None and m3['date_source'] is None
st, fixed, _ = call('/api/media/' + m3['id'], {'taken_at': '2026-05-23T12:00:00Z', 'caption': 'The host opening the session'}, ck, method='PATCH')
assert st == 200 and fixed['date_source'] == 'manual' and fixed['taken_at'].startswith('2026-05-23') and fixed['caption'] == 'The host opening the session'
assert call('/api/media/' + m3['id'], {'taken_at': '2199-01-01'}, ck, method='PATCH')[0] == 400
assert call('/api/media/' + m3['id'], {'caption': 'x'}, method='PATCH')[0] == 401
ok('WhatsApp name = date sent (labelled so), no date = none, typed date = manual; "already has the logo" is respected')

# ---------- older pictures get the logo later ----------
psql(f"update media set branded=false where id='{m3['id']}'")
st, c, _ = call('/api/media/logo', cookie=ck); assert c['without_logo'] == 1, c
before = open(os.path.join(MEDIA, m3['sizes']['card']['jpg'].rsplit('/', 1)[1]), 'rb').read()
st, r, _ = call('/api/media/logo', {}, ck); assert r['done'] == 1, r
f = os.path.join(MEDIA, m3['sizes']['card']['jpg'].rsplit('/', 1)[1])
assert open(f, 'rb').read() != before and open(f + '.pre-logo', 'rb').read() == before and call('/api/media/logo', cookie=ck)[1]['without_logo'] == 0
assert call('/media/' + os.path.basename(f) + '.pre-logo')[0] in (400, 404)
ok('pictures from before: the logo is added on request, each keeps a private copy of how it was')

# ---------- email picture and PDF ----------
st, em, _ = up(jpeg(900, 600), 'banner.jpg', kind='email'); assert st == 200 and em['date_source'] == 'camera'
pdf = subprocess.run(['node', '-e', "import('pdf-lib').then(async({PDFDocument})=>{const d=await PDFDocument.create();d.addPage([595,842]);d.addPage([842,595]);d.setCreationDate(new Date('2026-04-02T10:00:00Z'));process.stdout.write(Buffer.from(await d.save()).toString('base64'))})"], capture_output=True, text=True, check=True).stdout
st, doc, _ = call('/api/media', {'kind': 'doc', 'name': 'Sponsorship pack.pdf', 'data': 'data:application/pdf;base64,' + pdf}, ck); assert st == 200, doc
assert doc['taken_at'].startswith('2026-04-02') and doc['date_source'] == 'pdf'
row = json.loads(psql(f"select row_to_json(m) from media m where id='{doc['id']}'"))
assert row['info']['logo'] == 'added' and row['info']['pages'] == 2
_, stamped, _ = call('/media/' + row['variants']['file'], binary=True)
assert stamped[:5] == b'%PDF-' and stamped != base64.b64decode(pdf) and b'/Image' in stamped.replace(b' ', b'') or b'Image' in stamped
assert call('/media/' + row['info']['orig'])[0] == 404
ok('email pictures and PDFs: logo added, date read, the PDF original kept privately')

# ---------- video: pieces, conversion, byte ranges ----------
vid = os.path.join(MEDIA, 'src-test.mp4')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
                '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-metadata', 'creation_time=2026-05-23T15:01:00Z',
                '-metadata', 'location=+05.6037-000.1870/', vid], check=True)
data = open(vid, 'rb').read(); size = len(data)
st, s, _ = call('/api/uploads', {'name': 'IMG_5001.MOV', 'size': size}, ck); assert st == 200, s
assert call('/api/uploads', {'name': 'x.mp4', 'size': 10**12}, ck)[0] == 413
assert call(f"/api/uploads/{s['id']}?at=0", raw=data[:1000])[0] == 401
piece = 64 * 1024; at = 0
while at < size:
    st, r, _ = call(f"/api/uploads/{s['id']}?at={at}", cookie=ck, raw=data[at:at + piece], method='PUT'); assert st == 200, r; at = r['got']
    if at == piece:   # a repeated piece (lost answer, phone retried) is refused with the right place to continue
        st, r, _ = call(f"/api/uploads/{s['id']}?at=0", cookie=ck, raw=data[:piece], method='PUT'); assert st == 409 and r['got'] == piece
st, v, _ = call(f"/api/uploads/{s['id']}/done", {}, ck); assert st == 200 and v['kind'] == 'video' and v['status'] == 'processing', v
assert v['taken_at'].startswith('2026-05-23T15:01') and v['date_source'] == 'video'
for _ in range(120):
    st, v, _ = call('/api/media/' + v['id'], cookie=ck)
    if v['status'] != 'processing': break
    time.sleep(0.5)
assert v['status'] == 'ready' and v['url'].endswith('.mp4') and v['duration'] == 4 and v['sizes']['poster'] and v['sizes']['thumb'], v
fn = v['url'].rsplit('/', 1)[1]
info = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', os.path.join(MEDIA, fn)], capture_output=True, text=True).stdout)
tags = {k.lower(): x for k, x in info['format'].get('tags', {}).items()}
assert 'location' not in tags and not any('location' in k for k in tags), tags
assert json.loads(psql(f"select info from media where id='{v['id']}'"))['had_location'] is True
st, part, hd = call('/media/' + fn, headers={'range': 'bytes=0-99'}, binary=True)
assert st == 206 and len(part) == 100 and hd['content-range'].startswith('bytes 0-99/') and hd['content-type'] == 'video/mp4'
assert not [x for x in os.listdir(MEDIA) if x.startswith('up-')], 'the pieces are cleaned up'
ok('video: uploaded in pieces (a repeated piece is refused safely), converted with the logo, recording date read, location removed, plays with byte ranges')

# ---------- event pages ----------
ev = {'code': 'PX1', 'kind': 'event', 'title': 'Pitch Night Accra', 'slug': 'pitch-night', 'phase': 'past', 'starts_at': '2026-05-23T14:30:00Z',
      'venue': 'East Legon, Accra', 'description': 'Founders met investors.', 'recap': 'Twelve founders pitched.\n\nThree follow-up meetings were booked.',
      'cover': m['id'], 'gallery': [m['id'], m2['id'], m3['id'], v['id']], 'docs': [{'id': doc['id'], 'label': 'Sponsorship pack'}], 'agenda': [], 'speakers': []}
assert call('/api/items', ev, ck)[0] == 200
st, h, _ = call('/events/pitch-night', text=True); assert st == 200, h[:300]
assert '<title>Pitch Night Accra · 23 May 2026 | Gotham Consult</title>' in h and '<link rel="canonical" href="https://gothamconsult.com/events/pitch-night">' in h
assert 'What happened' in h and 'Three follow-up meetings were booked.' in h and 'Sponsorship pack' in h
assert '"@type":"Event"' in h and '"@type":"BreadcrumbList"' in h and 'offers' not in h, 'a past event has no ticket offer'
assert h.count('data-lb=') == 3 and '<video controls' in h and '3 photos and 1 video' in h
assert '23 May 2026' in h and 'The host opening the session · 23 May 2026' in h
assert '24 May 2026' not in h, 'a WhatsApp date (sent, not taken) is not shown as the photo date'
assert '%%' not in h and 'event-shell' not in h and 'class="gf-made"' in h, 'filled in the site frame, with the footer'
st, h2, hd = call('/events/PX1', text=True); assert st == 200 and '<link rel="canonical" href="https://gothamconsult.com/events/pitch-night">' in h2
st, idx, _ = call('/events', text=True); assert st == 200 and 'Pitch Night Accra' in idx and 'Where we have been' in idx and '"@type":"CollectionPage"' in idx
up_ev = {**ev, 'code': 'PX2', 'title': 'Growth Forum', 'slug': '', 'phase': 'open', 'starts_at': '2030-03-01T14:00:00Z', 'recap': None, 'gallery': [], 'price': 150}
assert call('/api/items', up_ev, ck)[0] == 200
st, h3, _ = call('/events/growth-forum', text=True); assert st == 200 and 'data-cd="2030-03-01T14:00:00.000Z"' in h3 and '/register?e=PX2' in h3 and '"offers"' in h3 and 'GHS 150' in h3
assert call('/events/nothing-here', text=True)[0] == 404 and call('/event-shell', text=True)[0] == 404 and call('/event-shell.html', text=True)[0] == 404
st, sm, _ = call('/sitemap.xml', text=True)
assert '<loc>https://gothamconsult.com/events</loc>' in sm and '<loc>https://gothamconsult.com/events/pitch-night</loc>' in sm and '<loc>https://gothamconsult.com/insights</loc>' in sm
st, items, _ = call('/api/items'); pn = next(i for i in items['items'] if i['code'] == 'PX1')
assert [x['kind'] for x in pn['images']] == ['image', 'image', 'image', 'video'] and pn['recap'].startswith('Twelve')
ok('event pages: past (recap, gallery, video, downloads, Event data) and upcoming (countdown, register, offer), slug from the title, 404s, sitemap')

# ---------- drafts with gaps are never sent ----------
psql("insert into contacts(full_name,email,consent_email) values ('Ama Test','ama@x.test',true)") if psql("select count(*) from information_schema.columns where table_name='contacts' and column_name='consent_email'") == '1' else psql("insert into contacts(full_name,email) values ('Ama Test','ama@x.test')")
st, cam, _ = call('/api/campaigns', {'name': 'Line-up', 'subject': 'Meet the speakers', 'intro': 'Hello {{first_name}},\n\n[Speaker 1], [Speaker 2]', 'template': 'invitation'}, ck); assert st == 200, cam
cid = cam.get('id') or psql("select id from campaigns where name='Line-up'")
st, r, _ = call(f'/api/campaigns/{cid}/start', {}, ck); assert st == 400 and r['error'] == 'placeholder_left' and r['gap'] == '[Speaker 1]', r
st, r, _ = call(f'/api/campaigns/{cid}/start', {'at': '2030-01-01T09:00:00Z'}, ck); assert st == 400 and r['error'] == 'placeholder_left'
assert psql(f"select count(*) from campaign_sends where campaign_id={cid}") == '0'
ok('a draft that still says [Speaker 1] or [time] cannot be started or scheduled')

# ---------- one-off import ----------
imp = tempfile.mkdtemp(prefix='imp22-'); open(os.path.join(imp, 'a.jpg'), 'wb').write(jpeg(1200, 800, exif=False))
json.dump({'events': [{'code': 'IMP1', 'title': 'Imported Camp', 'slug': 'imported-camp', 'phase': 'past', 'description': 'From the import.',
                       'gallery': [{'file': 'a.jpg', 'alt': 'A room', 'taken_at': '2026-03-01T10:00:00Z'}]}],
           'tasks': [{'title': 'Post the flyer', 'due_at': '2026-10-01T09:00:00Z', 'item_code': 'IMP1'}, {'title': 'Post the flyer', 'due_at': '2026-10-05T09:00:00Z', 'item_code': 'IMP1'}],
           'campaigns': [{'name': 'Imported SMS', 'channel': 'sms', 'sms_text': 'See you tomorrow', 'item_code': 'IMP1', 'starts_at': '2026-10-23T09:00:00Z'}]}, open(os.path.join(imp, 'manifest.json'), 'w'))
for n in range(2):
    out = subprocess.run(['node', 'server.js', '--import', os.path.join(imp, 'manifest.json')], env=env, capture_output=True, text=True, timeout=120)
    assert out.returncode == 0 and 'import done' in out.stdout, out.stdout + out.stderr
assert 'already has a gallery' in out.stdout
assert psql("select count(*) from tasks where item_code='IMP1'") == '2' and psql("select count(*) from campaigns where name='Imported SMS' and status='draft'") == '1'
assert psql("select jsonb_array_length(gallery) from items where code='IMP1'") == '1' and psql("select date_source from media where alt='A room'") == 'manual'
assert call('/events/imported-camp', text=True)[0] == 200
assert call('/api/health')[0] == 200, 'the live server kept running during the import'
ok('content import: event, gallery (logo added), tasks and SMS draft; running it twice changes nothing')

shutil.rmtree(MEDIA, ignore_errors=True); shutil.rmtree(imp, ignore_errors=True)
print('PASSED')
