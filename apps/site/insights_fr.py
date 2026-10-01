"""Insights articles (content/insights/*.json) and the French site (/fr/...).

Articles are written once as data (English + French) and rendered here into page bodies that build.py wraps
like any other page. French pages for the main site are made at build time from the same dictionary the
language switch uses (public/assets/v2/i18n-fr.js), so Google gets real /fr pages with lang="fr", French
titles and hreflang links, and there is still only one place to edit a translation.
"""
import html as H, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(HERE, 'content', 'insights')

L = {
 'en': dict(home='Home', insights='Insights', read='min read', short='In short', faq='Questions', sources='Sources', desk='Talk to our investor desk',
            desk_p='Gotham Consult replies on WhatsApp, usually the same day.', wa='WhatsApp +233 55 041 6627', more='More guides', all='All guides',
            idx_h1='Insights: <span class="serif">doing business in Ghana.</span>', idx_eyebrow='Guides · checked and dated',
            idx_lead='Practical guides for investors and companies: company registration, the GIPA Act 2026, Ghana VAT and getting paid from abroad. Each one lists its sources.',
            idx_title='Insights: Guides to Doing Business in Ghana | Gotham Consult',
            idx_desc='Practical, sourced guides for investors and companies: registering a company in Ghana, the GIPA Act 2026, Ghana VAT and foreign-currency invoicing.',
            locale='en_GB', updated='Updated'),
 'fr': dict(home='Accueil', insights='Analyses', read='min de lecture', short='En bref', faq='Questions', sources='Sources', desk='Parlez à notre bureau investisseurs',
            desk_p='Gotham Consult répond sur WhatsApp, généralement le jour même.', wa='WhatsApp +233 55 041 6627', more='Autres guides', all='Tous les guides',
            idx_h1='Analyses : <span class="serif">faire des affaires au Ghana.</span>', idx_eyebrow='Guides · vérifiés et datés',
            idx_lead='Des guides pratiques pour investisseurs et entreprises : immatriculer une société, la loi GIPA de 2026, la TVA au Ghana et se faire payer depuis l’étranger. Chaque guide cite ses sources.',
            idx_title='Analyses : faire des affaires au Ghana | Gotham Consult',
            idx_desc='Guides pratiques et sourcés : immatriculer une société au Ghana, la loi GIPA de 2026, la TVA ghanéenne et la facturation en devises.',
            locale='fr_FR', updated='Mis à jour'),
}
MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

def day(iso, lang):
    y, m, d = iso.split('-')
    return f'{int(d)} {(MONTHS_FR if lang == "fr" else MONTHS_EN)[int(m) - 1]} {y}'

def articles():
    order = json.load(open(os.path.join(CONTENT, 'index.json')))
    return [json.load(open(os.path.join(CONTENT, s + '.json'), encoding='utf-8')) for s in order]

def view(a, lang):
    """the fields of an article in one language"""
    if lang == 'en': return a
    f = a['fr']; return {**a, **{k: f[k] for k in f}}

def article_body(a, lang, others):
    t, v = L[lang], view(a, lang)
    pre = '/fr' if lang == 'fr' else ''
    faq = ''.join(f'<details class="faq"><summary>{H.escape(q["q"])}<svg class="icon"><use href="#i-chev"/></svg></summary><p>{H.escape(q["a"])}</p></details>' for q in v['faq'])
    src = ''.join(f'<li><a href="{H.escape(s["url"])}" target="_blank" rel="noopener nofollow">{H.escape(s["title"])}</a></li>' for s in a['sources'])
    rel = ''.join(f'<a class="ins-rel" href="{pre}/insights/{o["slug"]}">{H.escape(view(o, lang)["h1"])}<span class="arrow">→</span></a>' for o in others)
    wa = 'https://wa.me/233550416627?text=' + ('Bonjour%20Gotham%20Consult%2C%20j%27ai%20lu%20votre%20guide%20et%20j%27ai%20une%20question.' if lang == 'fr' else 'Hello%20Gotham%20Consult%2C%20I%20read%20your%20guide%20and%20have%20a%20question.')
    return f'''<!--#top-->
<main id="main">
  <section class="phero ins-hero" aria-labelledby="h1">
    <div class="wrap">
      <nav class="crumb" aria-label="Breadcrumb"><a href="{pre or '/'}">{t['home']}</a><span aria-hidden="true">/</span><a href="{pre}/insights">{t['insights']}</a></nav>
      <p class="eyebrow">{t['insights']} · <time datetime="{a['date']}">{day(a['date'], lang)}</time> · {a['read_minutes']} {t['read']}</p>
      <h1 id="h1">{H.escape(v['h1'])}</h1>
      <p class="lead">{H.escape(v['description'])}</p>
    </div>
  </section>
  <section class="sec ins-sec">
    <div class="wrap ins-wrap">
      <article class="prose">
        <div class="ins-sum"><b>{t['short']}</b><ul>{''.join(f'<li>{H.escape(x)}</li>' for x in v['summary'])}</ul></div>
        {v['body_html']}
        <h2>{t['faq']}</h2>
        <div class="faqs">{faq}</div>
        <h2>{t['sources']}</h2>
        <ol class="ins-src">{src}</ol>
        <p class="ins-note">{H.escape(v.get('last_reviewed', ''))}</p>
      </article>
      <aside class="ins-side">
        <div class="ins-cta"><b>{t['desk']}</b><p>{t['desk_p']}</p><a class="btn btn-wa" href="{wa}" target="_blank" rel="noopener"><svg class="icon"><use href="#i-wa"/></svg>{t['wa']}</a></div>
        <div class="ins-more"><p class="eyebrow">{t['more']}</p>{rel}<a class="ins-rel all" href="{pre}/insights">{t['all']}<span class="arrow">→</span></a></div>
      </aside>
    </div>
  </section>
</main>
<!--#bottom-->
'''

def index_body(arts, lang):
    t, pre = L[lang], ('/fr' if lang == 'fr' else '')
    cards = ''.join(f'''<a class="ins-card" href="{pre}/insights/{a["slug"]}"><span class="ins-meta">{day(a["date"], lang)} · {a["read_minutes"]} {t["read"]}</span>
      <b>{H.escape(view(a, lang)["h1"])}</b><span>{H.escape(view(a, lang)["description"])}</span><span class="arrow">→</span></a>''' for a in arts)
    return f'''<!--#top-->
<main id="main">
  <section class="phero ins-hero" aria-labelledby="h1">
    <div class="wrap">
      <nav class="crumb" aria-label="Breadcrumb"><a href="{pre or '/'}">{t['home']}</a><span aria-hidden="true">/</span><span>{t['insights']}</span></nav>
      <p class="eyebrow">{t['idx_eyebrow']}</p>
      <h1 id="h1">{t['idx_h1']}</h1>
      <p class="lead">{t['idx_lead']}</p>
    </div>
  </section>
  <section class="sec"><div class="wrap"><div class="ins-grid">{cards}</div></div></section>
</main>
<!--#bottom-->
'''

def article_ld(a, lang, site):
    v, pre = view(a, lang), ('/fr' if lang == 'fr' else '')
    url = f'{site}{pre}/insights/{a["slug"]}'
    g = [{'@type': 'Article', '@id': url + '#article', 'headline': v['title'][:110], 'description': v['description'], 'datePublished': a['date'], 'dateModified': a['date'],
          'inLanguage': lang, 'mainEntityOfPage': url, 'image': site + '/img/og/real-bog.jpg',
          'author': {'@type': 'Organization', 'name': 'Gotham Consult', 'url': site + '/'}, 'publisher': {'@type': 'Organization', 'name': 'Gotham Consult', 'url': site + '/', 'logo': {'@type': 'ImageObject', 'url': site + '/img/og/boot2.jpg'}}},
         {'@type': 'BreadcrumbList', 'itemListElement': [{'@type': 'ListItem', 'position': 1, 'name': L[lang]['home'], 'item': site + (pre or '/')},
           {'@type': 'ListItem', 'position': 2, 'name': L[lang]['insights'], 'item': f'{site}{pre}/insights'}, {'@type': 'ListItem', 'position': 3, 'name': v['h1'], 'item': url}]},
         {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q['q'], 'acceptedAnswer': {'@type': 'Answer', 'text': q['a']}} for q in v['faq']]}]
    return '<script type="application/ld+json">' + json.dumps({'@context': 'https://schema.org', '@graph': g}, ensure_ascii=False).replace('</', '<\\/') + '</script>'

# ---------------- French pages from the translation dictionary ----------------
FR_META = {
 'index.html': ('Conseil aux entreprises au Ghana | Gotham Consult, Accra', 'Cabinet de conseil à Accra pour investisseurs et entreprises : immatriculation, GIPA, entrée sur le marché, conformité et forums d’affaires au Ghana.'),
 'services.html': ('Services de conseil au Ghana, prix fixes | Gotham Consult', 'Services de conseil au Ghana à prix fixes en cedis : préparation à l’investissement et GIPA, entrée sur le marché, mines, conformité, IA et éducation.'),
 'invest.html': ('Investir au Ghana : guide de la loi GIPA 2026 | Gotham Consult', 'Investir au Ghana avec un bureau local : chiffres clés, secteurs porteurs, immatriculation et ce que change la loi GIPA de 2026 pour les investisseurs.'),
 'mining.html': ('Mines au Ghana : due diligence et permis | Gotham Consult', 'Sélection de concessions guidée par la géologie, due diligence et permis miniers au Ghana, avec des données de terrain vérifiables par les banques.'),
 'forums.html': ('Forums d’affaires et événements à Accra | Gotham Consult', 'Forums d’affaires, tables rondes investisseurs et séminaires à Accra, et le Ghana Business Brief gratuit. Inscription en une minute, paiement mobile.'),
 'about.html': ('À propos de Gotham Consult | Cabinet de conseil à Accra', 'Cabinet de conseil basé à Accra qui relie entreprises, investisseurs et institutions publiques au Ghana. Horaires, WhatsApp et coordonnées.'),
 'services/investment-readiness.html': ('Immatriculation GIPA et préparation à l’investissement', 'Immatriculez votre société auprès de la GIPA et préparez-vous aux investisseurs au Ghana : dossiers, documents financiers et un récit clair pour les banques.'),
 'services/market-entry.html': ('Entrer sur le marché ghanéen et créer sa société', 'Entrez sur le marché ghanéen avec une société immatriculée, des partenaires vérifiés et un bureau local à Accra. Immatriculation, GIPA, fiscalité et licences.'),
 'services/ai.html': ('Conseil en IA pour les entreprises au Ghana', 'Utilisez l’IA pour la comptabilité à partir des relevés mobile money et bancaires, les rapports mensuels et l’administratif, avec une équipe formée.'),
 'services/digital.html': ('Sites web, boutiques en ligne et hébergement au Ghana', 'Un site ou une boutique en ligne qui accepte mobile money et carte, avec hébergement, e-mail professionnel et sauvegardes quotidiennes au Ghana.'),
 'services/creative-studio.html': ('Publicités, jingles et vidéos IA au Ghana', 'Jingles, spots radio, affiches et vidéos publicitaires réalisés rapidement avec l’IA, avec des voix en twi et en anglais pour vos clients au Ghana.'),
 'services/energy-mining.html': ('Énergie, mines et infrastructures au Ghana', 'Due diligence, parcours de permis clair et dossiers finançables pour projets solaires, miniers et d’infrastructure au Ghana, prêts pour banques et DFI.'),
 'services/compliance-esg.html': ('Conformité, LBC, données personnelles et ESG au Ghana', 'Lutte anti-blanchiment, protection des données et pratiques ESG reconnues par les banques, investisseurs et acheteurs internationaux, plus un programme RSE.'),
 'services/education.html': ('Immatriculation et agrément d’écoles au Ghana', 'Immatriculez et faites agréer une école ou un centre de formation au Ghana, renforcez l’enseignement et préparez l’équipe au numérique.'),
 'services/family-support.html': ('Aide aux parents au Ghana pour les familles à l’étranger', 'Renouvellements, visites régulières, suivi de biens et succession pour les aînés au Ghana, avec rapports écrits et photos pour les familles à l’étranger.'),
 'services/media-forums.html': ('Médias d’affaires, forums et missions commerciales au Ghana', 'Articles, tables rondes, missions commerciales et vitrines pour présenter votre entreprise aux investisseurs et acheteurs au Ghana, de façon inclusive.'),
}
SKIP_TAGS = {'script', 'style', 'svg', 'noscript', 'textarea', 'code', 'pre'}
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}
ATTR_RE = re.compile(r'\b(placeholder|aria-label|alt|title)="([^"]*)"')

def load_dict(lang='fr'):
    s = open(os.path.join(HERE, 'public', 'assets', 'v2', f'i18n-{lang}.js'), encoding='utf-8').read()
    return json.loads(s[s.index('= {') + 2:s.rindex('}') + 1])

def translate_html(doc, d):
    """translate the text of <body> the way the in-page switch does; returns (html, untranslated strings)"""
    head, sep, body = doc.partition('<body')
    parts = re.split(r'(<!--.*?-->|<[^>]+>)', body, flags=re.S)
    stack, miss, out = [], [], []
    def tr(txt):
        k = re.sub(r'\s+', ' ', H.unescape(txt)).strip()
        if not k or not re.search(r'[A-Za-z]', k): return None
        t = d.get(k)
        if t is None: miss.append(k)
        return t
    for i, tok in enumerate(parts):
        if i == 0:   # the rest of the <body ...> tag
            out.append(tok); continue
        if tok.startswith('<!--'): out.append(tok); continue
        if tok.startswith('<'):
            m = re.match(r'<\s*(/?)\s*([a-zA-Z0-9-]+)', tok)
            if m:
                name = m.group(2).lower()
                if m.group(1):
                    while stack:
                        n, _ = stack.pop()
                        if n == name: break
                else:
                    skip = (stack[-1][1] if stack else False) or name in SKIP_TAGS or 'data-no-tr' in tok
                    if not skip:
                        tok = ATTR_RE.sub(lambda a: f'{a.group(1)}="{H.escape(d.get(re.sub(chr(92) + "s+", " ", H.unescape(a.group(2))).strip(), H.unescape(a.group(2))))}"', tok)
                    if name not in VOID and not tok.endswith('/>'): stack.append((name, skip))
            out.append(tok); continue
        if stack and stack[-1][1]: out.append(tok); continue
        t = tr(tok)
        if t is None: out.append(tok)
        else:
            lead = re.match(r'^\s*', tok).group(0); trail = re.search(r'\s*$', tok).group(0)
            out.append(lead + H.escape(t, quote=False) + trail)
    return head + sep + ''.join(out), miss

def localise_links(doc, fr_paths):
    def fix(m):
        url = m.group(2); p, _, rest = url.partition('#'); p, q, query = p.partition('?')
        key = p.rstrip('/') or '/'
        if key in fr_paths: return f'{m.group(1)}"{"/fr" if key == "/" else "/fr" + key}{("?" + query) if q else ""}{("#" + rest) if rest else ""}"'
        return m.group(0)
    return re.sub(r'(href=)"(/[^"]*)"', fix, doc)

def alternates(site, path):
    en = f'{site}/{path}'.rstrip('/') if path else f'{site}/'
    fr = f'{site}/fr' + (f'/{path}' if path else '')
    return (f'<link rel="alternate" hreflang="en" href="{en}">\n<link rel="alternate" hreflang="fr" href="{fr}">\n'
            f'<link rel="alternate" hreflang="x-default" href="{en}">\n')
