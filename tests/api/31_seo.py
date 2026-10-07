"""Static SEO contract: real locale pages, reciprocal links and matching structured data."""
import importlib.util
import json
import re
import sys
from html import unescape
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'apps/site'))
import build
import insights_fr as IF

DIST = ROOT / 'apps/site/dist'
assert DIST.exists(), 'Build the site before SEO tests'
SITE = build.SITE
count = 0

def ok(condition, message):
    global count
    assert condition, message
    count += 1

def read(path):
    return (DIST / (path.strip('/') + '.html' if path.strip('/') not in ('', 'fr', 'es', 'de', 'ar', 'zh') else (path.strip('/') + '/' if path.strip('/') else '') + 'index.html')).read_text()

def graphs(doc):
    for raw in re.findall(r'<script type="application/ld\+json">(.*?)</script>', doc, re.S):
        data = json.loads(raw)
        yield from data.get('@graph', [data])

urls = [n.text for n in ET.parse(DIST / 'sitemap.xml').findall('.//{*}loc')]
ok(len(urls) == len(set(urls)), 'Sitemap has no duplicate URLs')
for lang in ('fr', 'es', 'de', 'ar', 'zh'):
    localized = [u for u in urls if u == SITE + '/' + lang or u.startswith(SITE + '/' + lang + '/')]
    ok(len(localized) == 24, lang + ': all 24 translated pages in sitemap')
    for url in localized:
        path = url.removeprefix(SITE); name = path.removeprefix('/' + lang).strip('/')
        doc = read(path)
        ok(f'<html lang="{lang}" data-page-lang="{lang}"' in doc, path + ': language')
        title = unescape(re.search(r'<title>(.*?)</title>', doc, re.S)[1])
        desc = unescape(re.search(r'<meta name="description" content="([^"]+)"', doc)[1])
        ok(f'rel="canonical" href="{url}"' in doc and f'property="og:url" content="{url}"' in doc, path + ': canonical and sharing address')
        ok(len(re.findall(r'<h1[\s>]', doc)) == 1, path + ': one H1')
        ok(not re.search(r'ensemble ensemble|juntos juntos', doc), path + ': no duplicate CTA')
        nodes = list(graphs(doc))
        page = next((n for n in nodes if n.get('@type') == 'WebPage'), None)
        if page:
            ok(page['url'] == url and page['@id'] == url + '#page' and page['inLanguage'] == lang, path + ': WebPage URL/language')
            ok(page['name'] == title and page['description'] == desc, path + ': schema matches visible metadata')
        article = next((n for n in nodes if n.get('@type') == 'Article'), None)
        if article:
            ok(article['mainEntityOfPage'] == url and article['inLanguage'] == lang, path + ': article URL/language')
        for node in nodes:
            if node.get('@type') == 'Service':
                ok(node['url'] == url and node['description'] == desc, path + ': localized service')
            if node.get('@type') == 'BreadcrumbList':
                ok(node['itemListElement'][0]['item'] == SITE + '/' + lang and node['itemListElement'][-1]['item'] == url, path + ': localized breadcrumbs')
            if node.get('@type') == 'FAQPage':
                visible = build.faqs_in(doc)
                # Article summaries include SVG icons; build.faqs_in strips them the same way.
                ok(node['mainEntity'] == visible, path + ': FAQ agrees with visible translated questions')
        for code in ('en', 'fr', 'es', 'de', 'ar', 'zh', 'x-default'):
            target = SITE + ('/' + name if name else '/') if code in ('en', 'x-default') else SITE + '/' + code + ('/' + name if name else '')
            ok(f'hreflang="{code}" href="{target}"' in doc, path + ': alternate ' + code)
            ok(f'hreflang="{lang}" href="{url}"' in read(target.removeprefix(SITE)), path + ': reciprocal ' + code)
        ok(len(re.findall(r'<a data-lang="(?:en|fr|es|de|ar|zh)"[^>]* href="/', doc)) == 12, path + ': crawlable desktop/phone language anchors')
        nav = re.sub(r'<a data-lang=".*?</a>', '', doc)
        twin_paths = {u.removeprefix(SITE + '/fr') or '/' for u in urls if u == SITE + '/fr' or u.startswith(SITE + '/fr/')}
        ok(not any(h.split('#')[0].split('?')[0] in twin_paths for h in re.findall(r'href="(/[^"]*)"', nav)), path + ': translated navigation stays in selected language')

spec = importlib.util.spec_from_file_location('bridge_host', ROOT / 'scripts/bridge-host.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
original = '{$OTHER_HOST} {\n reverse_proxy other:4100\n}\n{$GOTHAM_HOST} {\n reverse_proxy gotham-crm:4100 {\n  header_up X-Real-IP {remote_host}\n }\n}\n'
patched = module.patched(original)
ok(module.DIRECTIVE in patched and module.patched(patched) == patched, 'Proxy patch is idempotent')
ok(patched.split('{$GOTHAM_HOST}')[0] == original.split('{$GOTHAM_HOST}')[0], 'Proxy patch leaves other sites unchanged')
try:
    module.patched(original.replace('gotham-crm:4100', 'unknown:4100'))
except ValueError:
    ok(True, 'Proxy patch refuses unexpected configuration')
else:
    raise AssertionError('Unexpected Caddy shape was accepted')
print('  ok SEO:', count, 'checks across 120 localized pages')
print('PASSED')
