#!/usr/bin/env python3
"""Build the public site into dist/.

The pages in pages/ are written as page bodies so they can also be published
as artifacts. This wraps each one in a complete HTML document with the meta
tags a real website needs, and copies public/ over the top.
"""
import os, re, shutil, sys, json, html as htmlmod
from datetime import date
import chrome_css
import insights_fr as IF

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, 'dist')
SITE = os.environ.get('SITE_URL', 'https://gothamconsult.com').rstrip('/')

META = {
 'classic.html': dict(   # the previous one-page site, kept for the free tools until they move
   extra='<meta name="robots" content="noindex">',
   title='Gotham Consult · business, investment and compliance in Ghana',
   desc='Gotham Consult builds partnerships among businesses, investors, public institutions and international partners in Ghana.',
   og='img/boot2.webp'),
 'register.html': dict(
   title='Register · Gotham Consult',
   desc='Register for a Gotham Consult forum, membership or investor briefing. Mobile money, card or invoice.',
   og='img/forum.webp'),
 'family.html': dict(
   title='Family Desk: Care for Your Parents in Ghana | Gotham Consult',
   desc='Renewals, visits, property watch and appointments for older parents in Ghana, with a written report after every visit. For families abroad.',
   og='img/forum.webp'),
}

V2_EXTRA = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=Newsreader:ital,opsz,wght@1,6..72,400&display=swap" media="print" onload="this.media=\'all\'">\n'
  '<link rel="stylesheet" href="/assets/v2/v2.css?v=21">\n'
  '<meta name="theme-color" content="#070D18">')
# The new design (live since 28 September 2026). Shared header/footer come from pages/_partials/_top.html and _bottom.html.
# Titles lead with what people search for on Google ("business consulting Ghana", "invest in Ghana", "Ghana market entry"),
# 50-60 characters; descriptions 140-160 characters.
V2 = {
 'index.html': ('Business Consulting in Ghana | Gotham Consult, Accra', 'Accra business consultancy for investors and companies: company registration, GIPA, market entry, compliance and business forums in Ghana.', 'img/og/boot2.jpg'),
 'services.html': ('Consulting Services in Ghana, Fixed Fees | Gotham Consult', 'Consulting services in Ghana with fixed fees in cedis: investment readiness and GIPA registration, market entry, mining, compliance, AI and education.', 'img/og/real-airportcity.jpg'),
 'invest.html': ('Invest in Ghana: GIPA Act 2026 Guide | Gotham Consult', 'Invest in Ghana with a local desk: key numbers, sectors to watch, company registration and what the GIPA Act 2026 changes for foreign investors.', 'img/og/real-bog.jpg'),
 'mining.html': ('Mining Due Diligence and Licensing in Ghana | Gotham Consult', 'Geology-led concession screening, due diligence and mining licences in Ghana, with field data investors and banks can check before they commit.', 'img/og/solar.jpg'),
 'forums.html': ('Business Forums and Events in Accra, Ghana | Gotham Consult', 'Business forums, investor roundtables and seminars in Accra, plus the free weekly Ghana Business Brief. Register in a minute and pay by mobile money.', 'img/og/forum.jpg'),
 'about.html': ('About Gotham Consult | Business Consultancy in Accra, Ghana', 'Accra-based business consultancy connecting companies, investors and public institutions in Ghana. Office hours, WhatsApp and contact details.', 'img/og/joy.jpg'),
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
# search titles and descriptions for the practice pages (the visible names above stay as they are)
PRACTICE_SEO = {
 'investment-readiness': ('GIPA Registration and Investor Readiness, Ghana', 'Register your company with GIPA and get investor-ready in Ghana: registration, financial documents and a clear story for banks, programmes and investors.'),
 'market-entry': ('Ghana Market Entry and Company Registration', 'Enter the Ghana market with a registered company, checked partners and a local desk in Accra. Company registration, GIPA, tax and licences handled.'),
 'ai': ('AI Consulting for Businesses in Ghana', 'Use AI for bookkeeping from mobile-money and bank statements, monthly reports, research and admin, with your staff trained to use it well.'),
 'digital': ('Websites, Online Shops and Hosting in Ghana', 'A website or online shop that takes mobile money and card payments, with hosting, business email and daily backups looked after in Ghana.'),
 'creative-studio': ('AI Adverts, Jingles and Video in Ghana', 'Jingles, radio spots, posters and video adverts made quickly with AI, with voice-overs in Twi and English that reach your customers in Ghana.'),
 'energy-mining': ('Energy, Mining & Infrastructure Projects, Ghana', 'Due diligence, a clear licensing path and bankable documents for solar, mining and infrastructure projects in Ghana, ready for banks and DFIs.'),
 'compliance-esg': ('AML, Data Protection and ESG Compliance, Ghana', 'Anti-money-laundering, data protection and ESG practices that international banks, investors and buyers recognise, plus a well-designed CSR programme.'),
 'education': ('School Registration and Licensing in Ghana', 'Register and licence a school or training centre in Ghana, strengthen teaching and prepare staff for digital learning, with the paperwork handled.'),
 'family-support': ('Family Support for Parents in Ghana', 'Renewals, regular visits, property watch and estate paperwork for older people in Ghana, with written reports and photos for families abroad.'),
 'media-forums': ('Business Media, Forums & Trade Missions, Ghana', 'Features, roundtables, trade missions and showcases that put your business in front of investors and buyers in Ghana, including inclusive enterprise.'),
}
for _s, (_t, _d, _o) in PRACTICES.items():
    _st, _sd = PRACTICE_SEO[_s]
    META[f'services/{_s}.html'] = dict(title=f'{_st} | Gotham Consult', desc=_sd, og='img/og/' + os.path.basename(_o).replace('.webp', '.jpg'), extra=V2_EXTRA, crumb=_t)
META_REST = {
 'teaser.html': dict(
   title='SMEs at the Centre Forum, Accra, 24 October 2026 | Gotham Consult',
   desc='A working forum at Tang Palace Hotel, Accra. By invitation, free for SMEs, stakeholders and investors.',
   og='img/og/boot2.jpg'),
}
META.update(META_REST)
# Insights: articles written as data (content/insights), rendered here
ARTS = IF.articles(); GEN = {}
META['insights.html'] = dict(title=IF.L['en']['idx_title'], desc=IF.L['en']['idx_desc'], og='img/og/real-bog.jpg', extra=V2_EXTRA)
GEN['insights.html'] = IF.index_body(ARTS, 'en')
for _a in ARTS:
    _n = f'insights/{_a["slug"]}.html'
    META[_n] = dict(title=_a['title'], desc=_a['description'], og='img/og/real-bog.jpg', extra=V2_EXTRA + '\n' + IF.article_ld(_a, 'en', SITE))
    GEN[_n] = IF.article_body(_a, 'en', [o for o in ARTS if o is not _a][:3])
# the partner's page
META['carlson-capital.html'] = dict(title='Carlson Capital Ltd: Market Entry, AI & Mining | Gotham Consult',
  desc="Carlson Capital Ltd, Gotham Consult's partner for company set-up and market entry for large companies, AI, software, apps and mining. Registered in Ghana.",
  og='img/og/real-tema.jpg', extra=V2_EXTRA)
META['invest/join.html'] = dict(title='Join the Investor List: Invest in Ghana | Gotham Consult',
  desc='Free investor list for Ghana: checked opportunities in your sectors and ticket size, investor round tables in Accra and the right meetings. No obligation.',
  og='img/og/real-airportcity.jpg', extra=V2_EXTRA)
# case studies
META['projects/dawa-solar.html'] = dict(title='Case Study: 130 MW Dawa Solar Project, Ghana | Gotham Consult',
  desc='How a 130 MWp solar project at Dawa, Greater Accra, was taken from an old licence to build-ready: EPC tender, permits, PPA renewal and financing.',
  og='img/og/solar.jpg', extra=V2_EXTRA)
# /events and /events/<slug> are drawn by the server from the back office; this is their frame (header, footer, styles)
META['event-shell.html'] = dict(title='%%TITLE%%', desc='%%DESC%%', og='%%OG%%', extra=V2_EXTRA + '\n%%HEAD%%')
GEN['event-shell.html'] = '<!--#top-->\n<main id="main">%%BODY%%</main>\n<!--#bottom-->\n'
META['404.html'] = dict(title='Page not found | Gotham Consult', desc='This page is not here any more. Find our services, the Ghana investment guide, forums and contact details.', og='img/og/boot2.jpg', extra=V2_EXTRA + '\n<meta name="robots" content="noindex">')
META['register.html']['extra'] = '<meta name="robots" content="noindex, follow">'
META['register.html']['og'] = 'img/og/forum.jpg'
META['family.html']['og'] = 'img/og/forum.jpg'
META['classic.html']['og'] = 'img/og/boot2.jpg'

# ---- structured data for Google (JSON-LD) ----
ORG = {'@type': ['ProfessionalService', 'LocalBusiness'], '@id': SITE + '/#org', 'name': 'Gotham Consult', 'url': SITE + '/',
  'logo': SITE + '/img/brand/icon-512.png', 'image': SITE + '/img/og/boot2.jpg',
  'sameAs': ['https://www.linkedin.com/company/gotham-consult/'],
  'description': 'Accra business consultancy for investment, company registration, GIPA, market entry, compliance and business forums in Ghana.',
  'telephone': '+233550416627', 'email': 'info@gothamconsult.com', 'priceRange': 'GHS',
  'address': {'@type': 'PostalAddress', 'addressLocality': 'Accra', 'addressRegion': 'Greater Accra', 'addressCountry': 'GH'},
  'areaServed': [{'@type': 'Country', 'name': 'Ghana'}, {'@type': 'Place', 'name': 'West Africa'}],
  'knowsLanguage': ['en', 'fr', 'es'],
  'openingHoursSpecification': {'@type': 'OpeningHoursSpecification', 'dayOfWeek': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], 'opens': '09:00', 'closes': '17:00'},
  'knowsAbout': ['Business consulting in Ghana', 'Investing in Ghana', 'GIPA registration', 'Company registration in Ghana', 'Market entry', 'Mining due diligence', 'Compliance and ESG', 'Business forums in Accra']}
SITE_LD = {'@type': 'WebSite', '@id': SITE + '/#site', 'url': SITE + '/', 'name': 'Gotham Consult', 'inLanguage': 'en', 'publisher': {'@id': SITE + '/#org'}}
def faqs_in(body):
    out = []
    for q, a in re.findall(r'<details class="faq"><summary>(.*?)</summary>\s*<p>(.*?)</p>', body, flags=re.S):
        t = lambda x: htmlmod.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', x))).strip()
        if t(q) and t(a): out.append({'@type': 'Question', 'name': t(q), 'acceptedAnswer': {'@type': 'Answer', 'text': t(a)}})
    return out
def ld_for(name, m, body):
    path = '' if name == 'index.html' else name[:-5]
    g = [ORG, SITE_LD] if name in ('index.html', 'about.html') else [{'@type': 'ProfessionalService', '@id': SITE + '/#org', 'name': 'Gotham Consult', 'url': SITE + '/'}]
    g.append({'@type': 'WebPage', '@id': f'{SITE}/{path}#page', 'url': f'{SITE}/{path}', 'name': m['title'], 'description': m['desc'], 'isPartOf': {'@id': SITE + '/#site'}, 'about': {'@id': SITE + '/#org'}, 'inLanguage': 'en'})
    if name.startswith('services/'):
        g.append({'@type': 'BreadcrumbList', 'itemListElement': [
          {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': SITE + '/'},
          {'@type': 'ListItem', 'position': 2, 'name': 'Services', 'item': SITE + '/services'},
          {'@type': 'ListItem', 'position': 3, 'name': m.get('crumb', m['title']), 'item': f'{SITE}/{path}'}]})
        g.append({'@type': 'Service', 'name': m.get('crumb', m['title']), 'serviceType': m.get('crumb', m['title']), 'description': m['desc'], 'provider': {'@id': SITE + '/#org'},
          'areaServed': {'@type': 'Country', 'name': 'Ghana'}, 'url': f'{SITE}/{path}'})
    if name == 'teaser.html':
        g.append({'@type': 'BusinessEvent', 'name': 'SMEs at the Centre: inclusive partnerships under the GIPA Act', 'startDate': '2026-10-24',
          'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode', 'eventStatus': 'https://schema.org/EventScheduled',
          'location': {'@type': 'Place', 'name': 'Tang Palace Hotel', 'address': {'@type': 'PostalAddress', 'addressLocality': 'Accra', 'addressCountry': 'GH'}},
          'organizer': {'@type': 'Organization', 'name': 'Gotham Consult', 'url': SITE + '/'}, 'isAccessibleForFree': True,
          'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'GHS', 'availability': 'https://schema.org/InStock', 'url': SITE + '/teaser'},
          'url': SITE + '/teaser', 'image': SITE + '/img/og/boot2.jpg', 'description': m['desc']})
    f = faqs_in(body)
    if f: g.append({'@type': 'FAQPage', '@id': f'{SITE}/{path}#faq', 'mainEntity': f})
    return '<script type="application/ld+json">' + json.dumps({'@context': 'https://schema.org', '@graph': g}, ensure_ascii=False).replace('</', '<\\/') + '</script>'

HEAD = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<link rel="icon" href="/img/brand/icon-64.png" type="image/png"><link rel="apple-touch-icon" href="/img/brand/icon-180.png">
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
{ogsize}<meta name="twitter:card" content="summary_large_image">
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
        body = GEN.get(name) or open(os.path.join(HERE, 'pages', name), encoding='utf-8').read()
        for part in ('top', 'bottom'):   # shared header/footer of the new design
            if f'<!--#{part}-->' in body:
                body = body.replace(f'<!--#{part}-->', open(os.path.join(HERE, 'pages', '_partials', f'_{part}.html'), encoding='utf-8').read())
        os.makedirs(os.path.dirname(os.path.join(DIST, name)), exist_ok=True)
        mm = {'extra': '', **m}; mm.pop('crumb', None)
        mm['extra'] = (mm['extra'] + '\n' + ld_for(name, m, body)) if name not in ('classic.html', 'register.html', '404.html', 'event-shell.html') and not name.startswith('insights/') else mm['extra']
        ogsize = '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta property="og:image:alt" content="' + htmlmod.escape(m['title']) + '">\n' if m['og'].startswith('img/og/') else ''
        out = body if body.lstrip().lower().startswith('<!doctype') else \
              HEAD.format(site=SITE, path=('' if name == 'index.html' else name[:-5] if name.endswith('.html') else name), ogsize=ogsize, **mm) + body + '\n</body>\n</html>'
        open(os.path.join(DIST, name), 'w', encoding='utf-8').write(out)
        print(f'  {name}')


    # the new design's shared chrome (header, menus, dock, chat, footer) on the pages that still use older styles
    chrome_css.build(os.path.join(HERE, 'public', 'assets', 'v2', 'v2.css'), os.path.join(DIST, 'assets', 'v2', 'chrome.css'))
    top = open(os.path.join(HERE, 'pages', '_partials', '_top.html'), encoding='utf-8').read()
    bottom = open(os.path.join(HERE, 'pages', '_partials', '_bottom.html'), encoding='utf-8').read()
    head_add = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
                '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=Newsreader:ital,opsz,wght@1,6..72,400&display=swap" media="print" onload="this.media=\'all\'">\n'
                '<link rel="stylesheet" href="/assets/v2/chrome.css?v=7">\n'
                + ('<link rel="icon" href="/img/brand/icon-64.png" type="image/png"><link rel="apple-touch-icon" href="/img/brand/icon-180.png">\n'))
    # older scripts look for nav.main (#nav) to fill or to attach the old language switch: keep one, hidden
    keep = '<nav class="main" id="nav" hidden aria-hidden="true" style="display:none!important"><span class="navlog"></span></nav>\n'
    for name in ('classic.html', 'register.html', 'family.html', 'teaser.html', 'privacy.html', 'terms.html'):
        path = os.path.join(DIST, name)
        if not os.path.exists(path): continue
        h = open(path, encoding='utf-8').read()
        h = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com/css2\?[^"]*">\s*', '', h)   # their own font link blocked the first paint; head_add loads the same fonts without blocking
        h = re.sub(r'<link rel="(?:icon|shortcut icon|apple-touch-icon)"[^>]*>\s*', '', h)   # one icon everywhere: the logo
        h = h.replace('</head>', head_add + '</head>', 1)
        h = re.sub(r'(<body.*?)<title>.*?</title>', r'\1', h, count=1, flags=re.S)   # their own <title> sat in the body, a second title for Google
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
    tld = {'@context': 'https://schema.org', '@graph': [{'@type': 'ProfessionalService', '@id': SITE + '/#org', 'name': 'Gotham Consult', 'url': SITE + '/'},
           {'@type': 'WebPage', '@id': SITE + '/tools#page', 'url': SITE + '/tools', 'name': 'Free business tools · Gotham Consult', 'description': tdesc, 'isPartOf': {'@id': SITE + '/#site'}}]}
    h = h.replace('</head>', '<script type="application/ld+json">' + json.dumps(tld, ensure_ascii=False) + '</script>\n</head>', 1)
    open(os.path.join(DIST, 'tools.html'), 'w', encoding='utf-8').write(h)
    print('  tools.html (from classic)')

    # French pages: /fr/... made from the English pages and the same dictionary the language switch uses
    d = IF.load_dict('fr')
    fr_pages = ['index.html', 'services.html', *[f'services/{p}.html' for p in PRACTICES], 'invest.html', 'mining.html', 'forums.html', 'about.html']
    def path_of(n): return '' if n == 'index.html' else n[:-5]
    fr_paths = {('/' + path_of(n)).rstrip('/') or '/' for n in fr_pages} | {'/insights'} | {f'/insights/{a["slug"]}' for a in ARTS}
    def set_meta(doc, n, title, desc):
        pth = path_of(n); fr_url = f'{SITE}/fr' + (f'/{pth}' if pth else '')
        doc = doc.replace('<html lang="en">', '<html lang="fr" data-page-lang="fr">', 1)
        doc = re.sub(r'<title>.*?</title>', lambda m: f'<title>{title}</title>', doc, count=1, flags=re.S)
        for k in ('name="description"', 'property="og:description"', 'name="twitter:description"'):
            doc = re.sub(r'(<meta ' + re.escape(k) + r' content=")[^"]*"', lambda m: m.group(1) + desc.replace('"', '&quot;') + '"', doc)
        for k in ('property="og:title"', 'name="twitter:title"'):
            doc = re.sub(r'(<meta ' + re.escape(k) + r' content=")[^"]*"', lambda m: m.group(1) + title.replace('"', '&quot;') + '"', doc)
        doc = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{fr_url}">', doc, count=1)
        doc = re.sub(r'(<meta property="og:url" content=")[^"]*"', lambda m: m.group(1) + fr_url + '"', doc)
        doc = doc.replace('<meta property="og:locale" content="en_GB">', '<meta property="og:locale" content="fr_FR">')
        doc = doc.replace('"inLanguage": "en"', '"inLanguage": "fr"')
        return doc.replace('</head>', IF.alternates(SITE, pth) + '</head>', 1)
    report = {}
    for n in fr_pages + ['insights.html'] + [f'insights/{a["slug"]}.html' for a in ARTS]:
        if n.startswith('insights'):
            a = next((x for x in ARTS if f'insights/{x["slug"]}.html' == n), None)
            body = IF.index_body(ARTS, 'fr') if a is None else IF.article_body(a, 'fr', [o for o in ARTS if o is not a][:3])
            for part in ('top', 'bottom'):
                body = body.replace(f'<!--#{part}-->', open(os.path.join(HERE, 'pages', '_partials', f'_{part}.html'), encoding='utf-8').read())
            m = META[n]
            extra = V2_EXTRA + ('\n' + IF.article_ld(a, 'fr', SITE) if a else '\n<script type="application/ld+json">' + json.dumps({'@context': 'https://schema.org', '@type': 'CollectionPage', 'url': SITE + '/fr/insights', 'name': IF.L['fr']['idx_title'], 'inLanguage': 'fr', 'publisher': {'@id': SITE + '/#org'}}, ensure_ascii=False) + '</script>')
            doc = HEAD.format(site=SITE, path=path_of(n), ogsize='', **{**{k: v for k, v in m.items() if k != 'crumb'}, 'extra': extra}) + body + '\n</body>\n</html>'
            title, desc = (IF.L['fr']['idx_title'], IF.L['fr']['idx_desc']) if a is None else (a['fr']['title'], a['fr']['description'])
        else:
            doc = open(os.path.join(DIST, n), encoding='utf-8').read()
            title, desc = IF.FR_META[n]
        doc, miss = IF.translate_html(doc, d)
        if not n.startswith('insights'): report[n] = miss
        doc = IF.localise_links(set_meta(doc, n, title, desc), fr_paths)
        out = os.path.join(DIST, 'fr', n); os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, 'w', encoding='utf-8').write(doc)
    for n in fr_pages + ['insights.html'] + [f'insights/{a["slug"]}.html' for a in ARTS]:   # English pages point to their French twin
        fp = os.path.join(DIST, n); h = open(fp, encoding='utf-8').read()
        if 'hreflang="fr"' not in h: open(fp, 'w', encoding='utf-8').write(h.replace('</head>', IF.alternates(SITE, path_of(n)) + '</head>', 1))
    left = sorted({x for v in report.values() for x in v})
    print(f'  fr/: {len(fr_pages) + 1 + len(ARTS)} French pages; {len(left)} phrases still in English')
    open(os.path.join(HERE, '.fr-missing.txt'), 'w').write('\n'.join(left))

    # the logo on every photo, share image and video (dist copies only; public/img keeps the clean originals)
    import brand_media; brand_media.run(DIST)

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
        f'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /i/\nSitemap: {SITE}/sitemap.xml\n')
    pages = ['', 'services', *[f'services/{p}' for p in PRACTICES], 'invest', 'invest/join', 'mining', 'forums', 'about', 'insights', *[f'insights/{a["slug"]}' for a in ARTS], 'projects/dawa-solar', 'carlson-capital', 'tools', 'family', 'teaser', 'privacy', 'terms']
    pages += ['fr', *[f'fr/{p}' for p in ['services', *[f'services/{p}' for p in PRACTICES], 'invest', 'mining', 'forums', 'about', 'insights', *[f'insights/{a["slug"]}' for a in ARTS]]]]
    today = date.today().isoformat()
    urls = ''.join(f'  <url><loc>{SITE}/{p}</loc><lastmod>{today}</lastmod></url>\n' for p in pages)
    open(os.path.join(DIST, 'sitemap.xml'), 'w').write(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '</urlset>\n')
    print('  robots.txt, sitemap.xml')
    print(f'\nBuilt into {DIST}')

if __name__ == '__main__':
    main()
