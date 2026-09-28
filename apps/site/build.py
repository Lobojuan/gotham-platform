#!/usr/bin/env python3
"""Build the public site into dist/.

The pages in pages/ are written as page bodies so they can also be published
as artifacts. This wraps each one in a complete HTML document with the meta
tags a real website needs, and copies public/ over the top.
"""
import os, re, shutil, sys
import chrome_css

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, 'dist')
SITE = os.environ.get('SITE_URL', 'https://gothamconsult.com').rstrip('/')

META = {
 'classic.html': dict(   # the previous one-page site, kept for the free tools until they move
   extra='<meta name="robots" content="noindex">',
   title='Gotham Consult · business, investment and compliance in Ghana',
   desc='Gotham Consult with Carlson Capital Ltd builds partnerships among businesses, investors, public institutions and international partners in Ghana.',
   og='img/boot2.webp'),
 'register.html': dict(
   title='Register · Gotham Consult',
   desc='Register for a Gotham Consult forum, membership or investor briefing. Mobile money, card or invoice.',
   og='img/forum.webp'),
 'family.html': dict(
   title='Family Desk · care and paperwork for your parents in Ghana · Gotham Consult',
   desc='Renewals, visits, property watch and appointments for older parents in Ghana, with a written report after every visit. For families abroad.',
   og='img/forum.webp'),
}

V2_EXTRA = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=Newsreader:ital,opsz,wght@1,6..72,400&display=swap" media="print" onload="this.media=\'all\'">\n'
  '<link rel="stylesheet" href="/assets/v2/v2.css?v=10">\n'
  '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2216%22 fill=%22%23E0AE55%22/%3E%3Ctext x=%2232%22 y=%2244%22 font-family=%22Arial%22 font-weight=%22800%22 font-size=%2234%22 text-anchor=%22middle%22 fill=%22%231a1205%22%3EG%3C/text%3E%3C/svg%3E">\n'
  '<meta name="theme-color" content="#070D18">')
# The new design (live since 28 September 2026). Shared header/footer come from pages/_partials/_top.html and _bottom.html.
V2 = {
 'index.html': ('Gotham Consult · build partnerships in Ghana', 'Business development, investment and compliance in Ghana, with Carlson Capital Ltd.', 'img/boot2.webp'),
 'services.html': ('Services and prices · Gotham Consult', 'Ten practices with fixed prices in Ghana cedis: investment readiness, market entry, mining, AI, compliance, education and family support.', 'img/real-airportcity.webp'),
 'invest.html': ('Invest in Ghana · Gotham Consult', 'Ghana in numbers, sectors to watch and what the GIPA Act 2026 means for investors from Germany, the Nordics, the UK and beyond.', 'img/real-bog.webp'),
 'mining.html': ('Mining and critical minerals · Gotham Consult', 'Geology-led concession screening, due diligence and licensing in Ghana, with TERRA field data and the Afri-MINEX platform.', 'img/solar.webp'),
 'forums.html': ('Forums and seminars · Gotham Consult', 'Forums, roundtables and the free weekly Ghana Business Brief. Register in a minute, pay by mobile money.', 'img/forum.webp'),
 'about.html': ('About and contact · Gotham Consult', 'An Accra-based business development and international projects consultancy, with strategic partner Carlson Capital Ltd.', 'img/joy.webp'),
}
for _n, (_t, _d, _o) in V2.items():
    META[_n] = dict(title=_t, desc=_d, og=_o, extra=V2_EXTRA)
# practice detail pages: /services/<slug>
PRACTICES = {
 'investment-readiness': ('Investment readiness and GIPA registration', "Get your company registered, your numbers in order and your story clear, so you can apply to programmes, banks and investors with documents that hold up to scrutiny.", 'img/real-airportcity.webp'),
 'market-entry': ('Market entry and international projects', "Enter Ghana, or take your Ghanaian business abroad, with a registered company, checked partners and people on the ground who report back to you in writing.", 'img/port.webp'),
 'ai': ('AI in your business', "Use AI for the jobs that eat your week: bookkeeping from mobile-money and bank statements, monthly reports, research and everyday admin, with staff trained to use it well.", 'img/tech.webp'),
 'digital': ('Digital and managed hosting', "A website or online shop where customers can pay by mobile money or card, with hosting, business email and daily backups looked after, so you can focus on your customers.", 'img/real-tema.webp'),
 'creative-studio': ('AI creative studio', "Jingles, radio spots, posters and video adverts made quickly with AI, with voice-overs in Twi and English, so your marketing sounds local and reaches people where they listen.", 'img/boot2.webp'),
 'energy-mining': ('Energy, mining and infrastructure', "Geology-led due diligence, a clear licensing path and project documents that development finance institutions and banks can assess, for solar power, mining and infrastructure in Ghana.", 'img/solar.webp'),
 'compliance-esg': ('Compliance and ESG', "Put anti-money-laundering, data protection and ESG practices in place that international banks, investors and buyers recognise, and give back to your community through a CSR programme that is well designed.", 'img/real-bog.webp'),
 'education': ('Education and schools', "Register and licence a school or training centre, strengthen your teaching and prepare staff for digital learning, with the paperwork handled so you can focus on students.", 'img/boot3.webp'),
 'family-support': ('Senior citizens and family support', "Practical help for older people in Ghana and peace of mind for families abroad: renewals handled, regular visits, property looked after and estate paperwork in order, with written reports and photos.", 'img/accra.webp'),
 'media-forums': ('Media, forums and inclusive enterprise', "Get your business in front of investors and buyers through features, roundtables, trade missions and showcases, and grow in a way that includes persons with disabilities.", 'img/forum.webp'),
}
for _s, (_t, _d, _o) in PRACTICES.items():
    META[f'services/{_s}.html'] = dict(title=f'{_t} · Gotham Consult', desc=_d, og=_o, extra=V2_EXTRA)
META_REST = {
 'teaser.html': dict(
   title='SMEs at the Centre · 24 October 2026 · Gotham Consult',
   desc='A working forum at Tang Palace Hotel, Accra. By invitation, free for SMEs, stakeholders and investors.',
   og='img/boot2.webp'),
}
META.update(META_REST)

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
{extra}
<script>/* Keep the public page in place while the same-origin back office fills a modal. */
if(window.top!==window.self){{document.documentElement.classList.add('framed');var s=document.createElement('style');s.textContent='.framed .rise,.framed .reveal,.framed .grow .bfill,.framed .grow .fcol div{{animation:none!important;opacity:1!important;transform:none!important}}';document.head.appendChild(s)}}
document.addEventListener('click',function(e){{if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;var a=e.target.closest&&e.target.closest('a[href]');if(!a||a.target==='_blank')return;var u=new URL(a.getAttribute('href'),location.href);if(u.origin!==location.origin||!(u.pathname==='/admin'||u.pathname==='/admin/'))return;if(!HTMLDialogElement.prototype.showModal)return;e.preventDefault();var d=document.getElementById('gc-backoffice');if(!d){{d=document.createElement('dialog');d.id='gc-backoffice';d.setAttribute('aria-label','Gotham Consult back office');d.style.cssText='position:fixed;inset:0;margin:0;padding:0;border:0;width:100vw;max-width:none;height:100vh;height:100dvh;max-height:none;background:#fff;color:#0f1b2d';var b=document.createElement('div');b.style.cssText='height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;background:#0f1b2d;color:#fff;font:600 15px system-ui,sans-serif';var t=document.createElement('span');t.textContent='Gotham Consult · Back office';var x=document.createElement('button');x.type='button';x.textContent='Close';x.setAttribute('aria-label','Close back office and return to the website');x.style.cssText='border:1px solid #738097;border-radius:8px;background:transparent;color:white;padding:7px 12px;font:inherit;cursor:pointer';b.append(t,x);var f=document.createElement('iframe');f.title='Gotham Consult back office';f.src='/admin';f.style.cssText='display:block;width:100%;height:calc(100vh - 48px);height:calc(100dvh - 48px);border:0;background:white';d.append(b,f);x.addEventListener('click',function(){{d.close()}});d.addEventListener('click',function(ev){{if(ev.target===d)d.close()}});document.body.appendChild(d)}}d.showModal();d.querySelector('iframe').focus()}},true);
</script>
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
        for part in ('top', 'bottom'):   # shared header/footer of the new design
            if f'<!--#{part}-->' in body:
                body = body.replace(f'<!--#{part}-->', open(os.path.join(HERE, 'pages', '_partials', f'_{part}.html'), encoding='utf-8').read())
        os.makedirs(os.path.dirname(os.path.join(DIST, name)), exist_ok=True)
        out = body if body.lstrip().lower().startswith('<!doctype') else \
              HEAD.format(site=SITE, path=('' if name == 'index.html' else name[:-5] if name.endswith('.html') else name), **{'extra': '', **m}) + body + '\n</body>\n</html>'
        open(os.path.join(DIST, name), 'w', encoding='utf-8').write(out)
        print(f'  {name}')


    # the new design's shared chrome (header, menus, dock, chat, footer) on the pages that still use older styles
    chrome_css.build(os.path.join(HERE, 'public', 'assets', 'v2', 'v2.css'), os.path.join(DIST, 'assets', 'v2', 'chrome.css'))
    top = open(os.path.join(HERE, 'pages', '_partials', '_top.html'), encoding='utf-8').read()
    bottom = open(os.path.join(HERE, 'pages', '_partials', '_bottom.html'), encoding='utf-8').read()
    head_add = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
                '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=Newsreader:ital,opsz,wght@1,6..72,400&display=swap" media="print" onload="this.media=\'all\'">\n'
                '<link rel="stylesheet" href="/assets/v2/chrome.css?v=4">\n')
    # older scripts look for nav.main (#nav) to fill or to attach the old language switch: keep one, hidden
    keep = '<nav class="main" id="nav" hidden aria-hidden="true" style="display:none!important"><span class="navlog"></span></nav>\n'
    for name in ('classic.html', 'register.html', 'family.html', 'teaser.html', 'privacy.html', 'terms.html'):
        path = os.path.join(DIST, name)
        if not os.path.exists(path): continue
        h = open(path, encoding='utf-8').read()
        h = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com/css2\?[^"]*">\s*', '', h)   # their own font link blocked the first paint; head_add loads the same fonts without blocking
        h = h.replace('</head>', head_add + '</head>', 1)
        h = re.sub(r'<header(?: id="hdr")?><div class="wrap bar">.*?</header>', '', h, count=1, flags=re.S)   # old top bar
        h = re.sub(r'<footer>.*?</footer>', '', h, count=1, flags=re.S)                                    # old footer
        h = re.sub(r'<body([^>]*)>', lambda m: '<body' + (re.sub(r'class="', 'class="v2-legacy ', m.group(1), 1) if 'class="' in m.group(1) else m.group(1) + ' class="v2-legacy"') + '>\n' + keep + top, h, count=1)
        h = re.sub(r"<script>\s*\(\(\) => \{\s*const script = document.createElement\('script'\);\s*script.src = [^\n]*landing-i18n[^\n]*\n[^\n]*\n\}\)\(\);\s*</script>", '', h)   # i18n.js covers these pages now
        if 'id="main"' not in h:   # target for the shared "Skip to content" link
            h = re.sub(r'<main(?![^>]*\bid=)([^>]*)>', r'<main id="main"\1>', h, count=1) if re.search(r'<main(?![^>]*\bid=)[^>]*>', h) else (h.replace('<main', '<div id="main" tabindex="-1"></div>\n<main', 1) if '<main' in h else h.replace(top, top + '<div id="main" tabindex="-1"></div>\n', 1))
        if 'rel="canonical"' not in h:
            h = h.replace('</head>', f'<link rel="canonical" href="{SITE}/{name[:-5]}">\n</head>', 1)
        h = h.replace('</body>', bottom + '\n</body>', 1) if '</body>' in h else h + bottom
        open(path, 'w', encoding='utf-8').write(h)
        print(f'  {name}: new header and footer')

    # /tools: the free tools on a page of their own (same scripts as /classic, everything else hidden)
    h = open(os.path.join(DIST, 'classic.html'), encoding='utf-8').read()
    h = h.replace('<meta name="robots" content="noindex">', '')
    h = re.sub(r'<title>.*?</title>', '<title>Free business tools · Gotham Consult</title>', h, count=1, flags=re.S)
    tdesc = 'Free tools for every business in Ghana: a business health check, a funding finder and a VAT and E-VAT check. No sign-up.'
    h = re.sub(r'(<meta (?:name="description"|property="og:description"|name="twitter:description") content=")[^"]*"', lambda m: m.group(1) + tdesc + '"', h)
    h = re.sub(r'(<meta (?:property="og:title"|name="twitter:title") content=")[^"]*"', r'\1Free business tools · Gotham Consult"', h)
    h = h.replace(f'{SITE}/classic"', f'{SITE}/tools"')
    h = h.replace('class="v2-legacy', 'class="v2-legacy tools-only', 1)
    # links to sections that are hidden on /tools go to their own pages instead
    for a, b in {'#contact': '/about#contact', '#services': '/services', '#forums': '/forums', '#start': '/services#packages', '#ghana': '/invest',
                 '#mining': '/mining', '#join': '/services#membership', '#brief': '/forums#brief', '#about': '/about', '#partners': '/about#partners',
                 '#platform': '/', '#top': '#main'}.items():
        h = h.replace(f'href="{a}"', f'href="{b}"').replace(f"href='{a}'", f"href='{b}'")
    hero = ('<section class="tools-hero"><div class="wrap"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/services">Services</a> / <span>Free tools</span></nav>'
            '<p class="eyebrow">Free tools · for every business in Ghana</p><h1>Know where your business <em class="serif">stands.</em></h1>'
            '<p class="lead">From chop bar to factory: a business health check, a funding finder and the 2026 VAT check. No sign-up, no cost, and your answers stay on your phone.</p></div></section>\n')
    h = re.sub(r'<h1([^>]*)>(.*?)</h1>', r'<p\1 aria-hidden="true">\2</p>', h, count=1, flags=re.S)   # the hidden one-page hero keeps no second h1
    h = h.replace('<section id="tools"', hero + '<section id="tools"', 1)
    open(os.path.join(DIST, 'tools.html'), 'w', encoding='utf-8').write(h)
    print('  tools.html (from classic)')

    # static files (css, js, images) from ASSET_URL when set: the page itself comes through the WordPress bridge, which is slow per request
    asset = os.environ.get('ASSET_URL', '').rstrip('/')
    if asset:
        for dirpath, _, files in os.walk(DIST):
            for fn in files:
                if not fn.endswith('.html'): continue
                fp = os.path.join(dirpath, fn); h = open(fp, encoding='utf-8').read()
                h2 = re.sub(r'(?<=["\'(])/(assets|img|js)/', asset + r'/\1/', h)
                if h2 != h: open(fp, 'w', encoding='utf-8').write(h2)
        print(f'  static files from {asset}')

    open(os.path.join(DIST, 'robots.txt'), 'w').write(
        f'User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n')
    pages = ['', 'services', *[f'services/{p}' for p in PRACTICES], 'invest', 'mining', 'forums', 'about', 'tools', 'family', 'register', 'teaser', 'privacy', 'terms']
    urls = ''.join(f'  <url><loc>{SITE}/{p}</loc></url>\n' for p in pages)
    open(os.path.join(DIST, 'sitemap.xml'), 'w').write(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '</urlset>\n')
    print('  robots.txt, sitemap.xml')
    print(f'\nBuilt into {DIST}')

if __name__ == '__main__':
    main()
