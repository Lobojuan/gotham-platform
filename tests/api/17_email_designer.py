# The email designer: blocks with pictures, event cards, sponsor logos and buttons; pictures prepared for email;
# every link tracked and limited to what the email contains; saved designs; the live preview.
import subprocess, time, json, os, urllib.request, urllib.error, sys, atexit, datetime as dt
DB = os.environ.get('TEST_DATABASE_URL', 'postgres://test@127.0.0.1:5439/gotham_test')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(os.path.join(ROOT, 'apps', 'crm'))
env = dict(os.environ); env.update({'DATABASE_URL': DB, 'SESSION_SECRET': 't', 'PORT': '4199', 'ADMIN_EMAIL': 'admin', 'ADMIN_PASSWORD': 'ownerpass123',
    'ADMIN_NAME': 'Admin', 'MEDIA_DIR': '/tmp/mediatest', 'PUBLIC_URL': 'http://127.0.0.1:4199', 'SITE_URL': 'http://example.org'})
os.makedirs('/tmp/mediatest', exist_ok=True)
srv = subprocess.Popen(['node', 'server.js'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
atexit.register(lambda: srv.poll() is None and srv.terminate())
B = 'http://127.0.0.1:4199'
def call(path, data=None, method=None, cookie=None, raw=False):
    req = urllib.request.Request(B + path, data=json.dumps(data).encode() if data is not None else None, method=method or ('POST' if data is not None else 'GET'))
    req.add_header('content-type', 'application/json')
    if cookie: req.add_header('cookie', cookie)
    try:
        r = urllib.request.urlopen(req, timeout=60); b = r.read()
        return r.status, (b.decode() if raw else json.loads(b or b'{}')), r.headers
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, (b.decode() if raw else json.loads(b or b'{}')), e.headers
        except Exception: return e.code, b[:300], e.headers
for _ in range(60):
    try:
        if call('/api/health')[0] == 200: break
    except Exception: pass
    time.sleep(0.4)
else: print('NO START'); print(srv.stdout.read()[:3000]); sys.exit(1)
def psql(sql): return subprocess.run(['psql', DB, '-qAtc', sql], capture_output=True, text=True, check=True).stdout.strip()
ok = lambda m: print('  ok', m)
psql('update users set must_change=false')
def login(e, p): return call('/api/login', {'email': e, 'password': p})[2]['set-cookie'].split(';')[0]
ck = login('admin', 'ownerpass123')

import base64, io, re
from PIL import Image
def picture(w, h, alpha=False):
    im = Image.new('RGBA' if alpha else 'RGB', (w, h), (200, 150, 60, 128) if alpha else (200, 150, 60)); b = io.BytesIO()
    im.save(b, 'PNG' if alpha else 'JPEG'); return base64.b64encode(b.getvalue()).decode()

# ---------- pictures for email ----------
st, m, _ = call('/api/media', {'kind': 'email', 'name': 'forum.jpg', 'data': picture(2400, 1600), 'alt': 'Forum'}, cookie=ck); assert st == 200, m
e = m['sizes']['email']; assert e['w'] == 1200 and e['h'] == 800 and e['jpg'].endswith('-email.jpg'), e
rimg = urllib.request.urlopen(e['jpg']); assert rimg.status == 200 and rimg.headers['content-type'] == 'image/jpeg' and rimg.read(3) == b'\xff\xd8\xff'
st, m2, _ = call('/api/media', {'kind': 'email', 'name': 'logo.png', 'data': picture(300, 120, alpha=True)}, cookie=ck)
assert m2['sizes']['email']['jpg'].endswith('.png') and m2['sizes']['email']['w'] == 300, m2
ok('email pictures: large ones shrink to 1200 px JPEG, never cropped; small transparent ones stay PNG at their size')

# ---------- a designed campaign ----------
call('/api/items', {'code': 'F7', 'kind': 'event', 'title': 'Mining Leaders Breakfast', 'venue': 'Kempinski Accra', 'starts_at': '2026-12-02T08:00:00Z',
    'price': 250, 'currency': 'GHS', 'capacity': 40, 'published': True, 'phase': 'open'}, cookie=ck)
st, c, _ = call('/api/contacts', {'company': 'Volta Foods', 'full_name': 'Adwoa Boateng', 'email': 'adwoa@volta.example', 'consent_email': 'yes', 'consent_source': 'asked for news'}, cookie=ck)
blocks = [
    {'type': 'heading', 'text': 'Hello {{first_name}}, a seat for you', 'size': 'l'},
    {'type': 'image', 'media': m['id'], 'alt': 'Forum', 'url': 'https://gothamconsult.com/forums'},
    {'type': 'text', 'text': 'We are hosting **mining leaders**. See [the programme](https://gothamconsult.com/programme?a=1&b=2).'},
    {'type': 'image_text', 'media': m['id'], 'title': 'Why come', 'text': 'Deals are made here.', 'side': 'right', 'url': 'https://gothamconsult.com/why', 'label': 'Read more'},
    {'type': 'event', 'code': 'f7'},
    {'type': 'button', 'label': 'Talk to us', 'style': 'gold', 'url': 'javascript:alert(1)'},
    {'type': 'button', 'label': 'WhatsApp us', 'url': 'https://wa.me/233550416627'},
    {'type': 'sponsors', 'tier': 'all'}, {'type': 'divider'}, {'type': 'script', 'text': '<script>'}]
st, d, _ = call('/api/campaigns', {'name': 'Designed', 'subject': 'A seat for you, {{first_name}}', 'template': 'designer', 'blocks': blocks, 'daily_limit': 40}, cookie=ck); assert st == 200, d
cam = [x for x in call('/api/campaigns', cookie=ck)[1]['rows'] if x['id'] == d['id']][0]
assert cam['template'] == 'designer' and len(cam['blocks']) == 9 and 'url' not in cam['blocks'][5] and cam['blocks'][4]['code'] == 'F7', cam['blocks']
ok('blocks saved; unknown block types and javascript: links are dropped')
pv = call('/api/campaigns/%d/preview' % d['id'], cookie=ck)[1]
html = pv['html']
assert 'Hello Adwoa, a seat for you' in html and '<b>mining leaders</b>' in html and e['jpg'] in html and 'Mining Leaders Breakfast' in html and 'Kempinski Accra · GHS 250' in html, html[:3000]
hrefs = re.findall(r'href="([^"]+)"', html)
ext = [x for x in hrefs if not x.startswith(B + '/c/sample') and not x.startswith(B + '/u/sample')]
assert ext == [], ext
assert {x.split('l=')[1] for x in hrefs if '/c/sample' in x} == {'0', '1', '2', '3', '4', '5'}, hrefs
assert 'Carlson' not in html and '041 6627' in html and 'Tell us to stop' in html
ok('preview: merge fields, bold, pictures, event card; every link tracked (6 links, numbered), unsubscribe present, Gotham footer')

# ---------- tracked links go to the right place ----------
st, r, _ = call('/api/campaigns/%d/start' % d['id'], {}, cookie=ck); assert st == 200 and r['queued'] == 1, r
tokn = psql('select token from campaign_sends where campaign_id=%d' % d['id'])
def goes(q):
    req = urllib.request.Request(B + '/c/' + tokn + q)
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k): return None
    try: urllib.request.build_opener(NoRedirect).open(req)
    except urllib.error.HTTPError as ex: return ex.headers['location']
assert goes('?l=0') == 'https://gothamconsult.com/forums'
assert goes('?l=1') == 'https://gothamconsult.com/programme?a=1&b=2'
assert goes('?l=2') == 'https://gothamconsult.com/why'
assert goes('?l=3') == 'http://example.org/register?e=F7'
assert goes('?l=4') == 'http://example.org' and goes('?l=5') == 'https://wa.me/233550416627'
assert goes('?l=99') == 'http://example.org' and goes('?l=-1') == 'http://example.org'
assert psql("select clicked_at is not null from campaign_sends where campaign_id=%d" % d['id']) == 't'
sent = psql("select body from outbox where kind='campaign' order by id desc limit 1")
assert '/c/' + tokn + '?l=3' in sent and 'Add a picture' not in sent
ok('each link in the sent email opens its own page and counts the click; made-up link numbers go to the website, not elsewhere')

# ---------- saved designs ----------
st, t, _ = call('/api/email-templates', cookie=ck)
assert {x['name'] for x in t['rows'] if x.get('builtin')} == {'Promotion', 'Event invitation', 'Newsletter'}
st, s1, _ = call('/api/email-templates', {'name': 'Monthly promotion', 'subject': 'This month, {{first_name}}', 'blocks': blocks}, cookie=ck); assert st == 200, s1
st, s2, _ = call('/api/email-templates', {'id': s1['id'], 'name': 'Monthly promotion', 'subject': 'Updated', 'blocks': blocks[:2]}, cookie=ck)
mine = [x for x in call('/api/email-templates', cookie=ck)[1]['rows'] if x['id'] == s1['id']][0]
assert mine['subject'] == 'Updated' and len(mine['blocks']) == 2
call('/api/email-templates/' + s1['id'], method='DELETE', cookie=ck)
assert not [x for x in call('/api/email-templates', cookie=ck)[1]['rows'] if x['id'] == s1['id']]
ok('designs are saved, updated and removed; three starting points are always there')
st, rr, _ = call('/api/campaigns/render', {'subject': 'Hi {{first_name}}', 'blocks': [{'type': 'image'}, {'type': 'event'}], 'carlson': True}, cookie=ck)
assert 'Add a picture' in rr['html'] and 'Pick an event' in rr['html'] and rr['subject'] == 'Hi Ama' and 'Carlson Capital Ltd' in rr['html']
assert call('/api/campaigns/render', {'blocks': []})[0] == 401
ok('live preview shows empty pictures and events as placeholders; signed-out calls refused')
print('\nALL EMAIL DESIGNER TESTS PASSED')
