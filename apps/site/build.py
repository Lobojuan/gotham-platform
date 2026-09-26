#!/usr/bin/env python3
"""Build the public site into dist/.

The pages in pages/ are written as page bodies so they can also be published
as artifacts. This wraps each one in a complete HTML document with the meta
tags a real website needs, and copies public/ over the top.
"""
import os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, 'dist')
SITE = os.environ.get('SITE_URL', 'https://gothamconsult.com').rstrip('/')

META = {
 'index.html': dict(
   title='Gotham Consult · business, investment and compliance in Ghana',
   desc='Gotham Consult with Carlson Capital Ltd: free tools, a weekly brief, forums and advisory services for SMEs and investors in Ghana.',
   og='img/boot2.webp'),
 'register.html': dict(
   title='Register · Gotham Consult',
   desc='Register for a Gotham Consult forum, membership or investor briefing. Mobile money, card or invoice.',
   og='img/forum.webp'),
 'family.html': dict(
   title='Family Desk · care and paperwork for your parents in Ghana · Gotham Consult',
   desc='Renewals, visits, property watch and appointments for older parents in Ghana, with a written report after every visit. For families abroad.',
   og='img/forum.webp'),
 'teaser.html': dict(
   title='SMEs at the Centre · 24 October 2026 · Gotham Consult',
   desc='A working forum at Tang Palace Hotel, Accra. By invitation, free for SMEs, stakeholders and investors.',
   og='img/boot2.webp'),
}

HEAD = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#0F1B2D">
<link rel="canonical" href="{site}/{path}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Gotham Consult">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{site}/{path}">
<meta property="og:image" content="{site}/{og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{site}/{og}">
<script>/* shown inside gothamconsult.com (WordPress page embed): the back office opens in the whole window */
if(window.top!==window.self){{addEventListener('click',function(e){{var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;var u=new URL(a.getAttribute('href'),location.href);if(u.origin===location.origin&&/^\/admin/.test(u.pathname)){{e.preventDefault();window.top.location.href=u.href}}}},true)}}</script>
</head>
<body>
'''

def main():
    if os.path.isdir(DIST): shutil.rmtree(DIST)
    os.makedirs(DIST)

    # static assets first (images, headers, prebuilt legal pages)
    pub = os.path.join(HERE, 'public')
    for name in os.listdir(pub):
        src = os.path.join(pub, name); dst = os.path.join(DIST, name)
        shutil.copytree(src, dst) if os.path.isdir(src) else shutil.copy2(src, dst)

    # page bodies -> complete documents
    for name, m in META.items():
        body = open(os.path.join(HERE, 'pages', name), encoding='utf-8').read()
        out = body if body.lstrip().lower().startswith('<!doctype') else \
              HEAD.format(site=SITE, path=name, **m) + body + '\n</body>\n</html>'
        open(os.path.join(DIST, name), 'w', encoding='utf-8').write(out)
        print(f'  {name}')

    open(os.path.join(DIST, 'robots.txt'), 'w').write(
        f'User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n')
    pages = ['', 'family.html', 'register.html', 'teaser.html', 'privacy.html', 'terms.html']
    urls = ''.join(f'  <url><loc>{SITE}/{p}</loc></url>\n' for p in pages)
    open(os.path.join(DIST, 'sitemap.xml'), 'w').write(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '</urlset>\n')
    print('  robots.txt, sitemap.xml')
    print(f'\nBuilt into {DIST}')

if __name__ == '__main__':
    main()
