# Privacy-friendly visitor counts (no cookies, daily-salted hash), enquiries attributed to the landing page,
# the Insights guides and the French site (/fr) with hreflang. Needs the built site (bash scripts/build-site.sh).
import subprocess, time, json, os, urllib.request, urllib.error, sys, re
DB = os.environ.get('TEST_DATABASE_URL', 'postgres://test@127.0.0.1:5439/gotham_test')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(os.path.join(ROOT, 'apps', 'crm'))
DIST = ROOT + '/apps/site/dist'
if not os.path.exists(DIST + '/fr/index.html'): subprocess.run(['bash', ROOT + '/scripts/build-site.sh'], check=True, capture_output=True)
env = dict(os.environ); env.update({'DATABASE_URL': DB, 'SESSION_SECRET': 't', 'PORT': '4199', 'ADMIN_EMAIL': 'admin@gotham.test', 'ADMIN_PASSWORD': 'ownerpass123', 'ADMIN_NAME': 'Admin',
    'MEDIA_DIR': '/tmp/mediatest', 'PUBLIC_URL': 'http://127.0.0.1:4199', 'SITE_URL': 'https://gothamconsult.com', 'SITE_DIR': DIST})
os.makedirs('/tmp/mediatest', exist_ok=True)
srv = subprocess.Popen(['node', 'server.js'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
import atexit; atexit.register(lambda: srv.poll() is None and srv.terminate())
B = 'http://127.0.0.1:4199'
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
def call(path, data=None, cookie=None, headers=None, text=False, raw=None):
    req = urllib.request.Request(B + path, data=raw if raw is not None else (json.dumps(data).encode() if data is not None else None), method='POST' if (data is not None or raw is not None) else 'GET')
    req.add_header('content-type', 'application/json'); req.add_header('user-agent', UA)
    for k, v in (headers or {}).items(): req.add_header(k, v)
    if cookie: req.add_header('cookie', cookie)
    try:
        r = urllib.request.urlopen(req, timeout=30); b = r.read(); return r.status, (b.decode() if text else json.loads(b or b'{}'))
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, (b.decode() if text else json.loads(b or b'{}'))
        except Exception: return e.code, b[:200]
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

# ---------- visitors ----------
def hit(ip, path, ref='', ua=UA, w=390, u='', l='en', cookie=None):
    return call('/api/hit', raw=json.dumps({'p': path, 'r': ref, 'u': u, 'l': l, 'w': w}).encode(), headers={'x-real-ip': ip, 'user-agent': ua}, cookie=cookie)[0]
assert hit('10.1.0.1', '/invest', 'https://www.google.com/search?q=invest+ghana') == 204
hit('10.1.0.1', '/services'); hit('10.1.0.1', '/about')
hit('10.1.0.2', '/', 'https://www.linkedin.com/feed', w=1440, l='fr'); hit('10.1.0.3', '/fr/invest', w=1440, l='fr', u='newsletter/october')
hit('10.1.0.4', '/invest', ua='Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')
hit('10.1.0.5', '/admin'); hit('10.1.0.5', '/api/items'); hit('10.1.0.6', '/invest', cookie=ck)
hit('10.1.0.7', 'javascript:alert(1)')
assert psql("select count(*) from page_hits") == '5', psql("select path, visitor from page_hits")
assert psql("select count(distinct visitor) from page_hits") == '3'
assert psql("select ref from page_hits where path='/invest'") == 'google.com' and psql("select utm from page_hits where path='/fr/invest'") == 'newsletter/october'
assert psql("select count(*) from page_hits where visitor like '%10.1.0%' or ref like '%search%'") == '0', 'no IPs, no search terms'
# the visitor from /invest leaves their details in the chat: the enquiry counts for /invest
st, d = call('/api/chat-lead', {'name': 'Ingrid', 'contact': 'ingrid@nw.test', 'need': 'Market entry', 'consent': True}, headers={'x-real-ip': '10.1.0.1', 'user-agent': UA}); assert st == 200, d
time.sleep(0.5)
assert psql("select path||' '||what from page_hits where kind='enquiry'") == '/invest chat'
st, W = call('/api/web-stats?days=30', cookie=ck); assert st == 200, W
assert W['totals'] == {'views': 5, 'enquiries': 1, 'visitors': 3}, W['totals']
top = {p['path']: p for p in W['pages']}; assert top['/invest']['enquiries'] == 1 and top['/invest']['visitors'] == 1, top
assert {s['src'] for s in W['sources']} >= {'google.com', 'linkedin.com', 'newsletter/october'}, W['sources']
assert {d['k'] for d in W['devices']} == {'phone', 'desktop'} and {d['k'] for d in W['langs']} == {'en', 'fr'}
st, x = call('/api/web-stats'); assert st == 401
ok('visitors counted once a day without cookies or IPs; bots, the back office and signed-in team ignored; enquiries credited to the landing page')

# ---------- Insights ----------
st, h = call('/insights', text=True); assert st == 200 and 'How to Register a Company in Ghana' in h or 'register a company in Ghana' in h, h[:300]
for slug in json.load(open(ROOT + '/apps/site/content/insights/index.json')):
    st, h = call('/insights/' + slug, text=True); assert st == 200, slug
    assert '"@type": "Article"' in h and '"@type": "FAQPage"' in h and 'class="ins-src"' in h and 'Last reviewed' in h, slug
    assert f'hreflang="fr" href="https://gothamconsult.com/fr/insights/{slug}"' in h, slug
    st, f = call('/fr/insights/' + slug, text=True); assert st == 200 and '<html lang="fr"' in f and 'En bref' in f and '"inLanguage": "fr"' in f, slug
    assert f'<link rel="canonical" href="https://gothamconsult.com/fr/insights/{slug}">' in f
ok('Insights: an index and four guides with summary, FAQ, sources, Article + FAQ structured data; each has a French twin')

# ---------- French site ----------
st, f = call('/fr', text=True)
assert st == 200 and '<html lang="fr" data-page-lang="fr">' in f and '<title>Conseil aux entreprises au Ghana | Gotham Consult, Accra</title>' in f, f[:400]
assert 'Nouez des partenariats au' in f and 'href="/fr/invest"' in f and 'href="/fr/insights"' in f and '<meta property="og:locale" content="fr_FR">' in f
assert '<link rel="canonical" href="https://gothamconsult.com/fr">' in f and 'hreflang="x-default" href="https://gothamconsult.com/"' in f
st, f = call('/fr/invest', text=True); assert 'Investir au Ghana :' in f and 'Promulguée le 15 juillet 2026,' in f
st, e = call('/invest', text=True); assert 'hreflang="fr" href="https://gothamconsult.com/fr/invest"' in e and '<html lang="en">' in e
st, sm = call('/sitemap.xml', text=True)
for u in ['/insights', '/insights/gipa-act-2026-what-changed', '/fr', '/fr/services/market-entry', '/fr/insights/ghana-vat-2026-explained']:
    assert f'<loc>https://gothamconsult.com{u}</loc>' in sm, u
st, x = call('/fr/', text=True)
ok('French site at /fr: French titles, text, links and canonical, hreflang both ways, in the sitemap')
print('PASSED')
