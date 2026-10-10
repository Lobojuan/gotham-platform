"""New locales reuse public English source and one reviewed phrase dictionary each.

No financial numbers, prices or source links are generated here. The dictionary
is validated before build, and source data remains shared by every locale.
"""
import html, json, os, re
import insights_fr as IF
import investor_content as INVESTOR
NEW_LANGUAGES = ('de', 'ar', 'zh')
REGIONS = {'de':'de_DE', 'ar':'ar_AR', 'zh':'zh_CN'}

def gipa_dictionary(lang):
    """Share reviewed legal translations between generated locale pages and the live switcher."""
    path = os.path.join(IF.HERE, 'public', 'assets', 'v2', 'gipa-i18n.js')
    source = open(path, encoding='utf-8').read()
    source = re.sub(r'(?m)^(\s*)(fr|es|de|ar|zh):', r'\1"\2":', source)
    object_source = source[source.index('{', source.index('=')):source.rindex('};') + 1]
    return json.loads(object_source).get(lang, {})

def translate(value, dictionary):
    return dictionary.get(re.sub(r'\s+', ' ', html.unescape(value)).strip(), value)

def prepare_locale(lang, metadata, articles):
    d = IF.load_dict(lang)
    d.update(gipa_dictionary(lang))
    # Missing search metadata must fail the build instead of publishing English metadata under a new locale.
    missing = [v[k] for v in metadata.values() for k in ('title','desc') if v.get(k) and v[k] not in d]
    if missing: raise ValueError(f'{lang}: untranslated search metadata ({len(missing)})')
    IF.L[lang] = {k: translate(v, d) for k,v in IF.L['en'].items()}
    IF.L[lang]['locale'] = REGIONS[lang]
    # HTML heading fragments are translated using the same parser as page bodies.
    heading, _ = IF.translate_html('<body>'+IF.L['en']['idx_h1']+'</body>', d)
    IF.L[lang]['idx_h1'] = heading.removeprefix('<body>').removesuffix('</body>')
    for a in articles:
        a[lang] = {k:translate(a[k],d) for k in ('title','h1','description','last_reviewed') if k in a}
        a[lang]['summary'] = [translate(x,d) for x in a['summary']]
        a[lang]['faq'] = [{k:translate(v,d) for k,v in row.items()} for row in a['faq']]
        body, _ = IF.translate_html('<body>'+a['body_html']+'</body>', d)
        a[lang]['body_html'] = body.removeprefix('<body>').removesuffix('</body>')
    INVESTOR.LABELS[lang] = {k:translate(v,d) for k,v in INVESTOR.LABELS['en'].items()}
    for c in INVESTOR.CASES: c['notes'][lang] = translate(c['notes']['en'],d)
    for c in INVESTOR.SECTORS:
        for key in ('title','text'): c[key][lang] = translate(c[key]['en'],d)

def localize_investor_data(doc, lang, dictionary):
    # The research section deliberately skips the DOM translator; its data must be localized explicitly.
    start, end = '<section class="sec" id="research"', '</section>'
    i = doc.find(start)
    if i >= 0:
        j = doc.index(end,i)+len(end)
        section = doc[i:j].replace(' data-no-tr','')
        section, _ = IF.translate_html('<body>'+section+'</body>', dictionary)
        section = section.removeprefix('<body>').removesuffix('</body>').replace('id="research"','id="research" data-no-tr',1)
        doc = doc[:i]+section+doc[j:]
    return doc
