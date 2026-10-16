"""Ghana Investment Report (apps/crm/report.json) on the website: /ghana-investment-report and its five twins
(/fr, /es, /de, /ar, /zh).

render(lang): the public report: economy snapshot (kept current from /api/ghana-data), key takeaways, charts drawn as
          inline SVG, the outlook, five sector chapters with every figure's source, dates to watch, the PDF download,
          partner packages, authors and the publisher block. Text comes from the English master (report.json) and the
          translation files apps/crm/report-i18n/<lang>.json (keyed by the exact English text, like the site dictionaries).
          Numbers, dates and money follow each language's own conventions; Chinese money in 亿; Arabic right to left.
check():  every figure has a source link, a period and a phrase to look for; the charts agree with the figures;
          every translation file covers every visible English string (missing() lists the gaps).
"""
import os, json, html, re
from decimal import Decimal

HERE = os.path.dirname(os.path.abspath(__file__))
FILE = os.path.join(HERE, '..', 'crm', 'report.json')
I18N = os.path.join(HERE, '..', 'crm', 'report-i18n')
LANGS = ('en', 'fr', 'es', 'de', 'ar', 'zh')
esc = lambda s: html.escape(str(s), quote=True)
IMG = {'macro': ('/img/real-bog.webp', 'The Bank of Ghana building in Accra'), 'energy': ('/img/solar.webp', 'Solar panels in Ghana'),
       'agri': ('/img/cocoa.webp', 'Cocoa pods and beans'), 'industry': ('/img/real-tema.webp', 'Container cranes at Tema port')}
HELP = {'macro': ('/services/market-entry', 'Market entry and company set-up'), 'mining': ('/mining', 'Mining: our approach'),
        'energy': ('/services/energy-mining', 'Energy, mining and infrastructure'), 'agri': ('/services/market-entry', 'Market entry for agro-processors'),
        'industry': ('/services/investment-readiness', 'GIPA registration and investor readiness')}
MONTHS = {
    'en': ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    'fr': ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    'es': ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    'de': ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
    'ar': ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
    'zh': [f'{i}月' for i in range(1, 13)]}
NBSP, NNBSP = ' ', ' '


def load():
    return json.load(open(FILE, encoding='utf-8'))


def load_tr(lang):
    if lang == 'en': return {}
    fp = os.path.join(I18N, f'{lang}.json')
    return json.load(open(fp, encoding='utf-8'))['strings'] if os.path.exists(fp) else {}


class Loc:
    """Everything a reader sees passes through here: words (t), numbers (n, ns), dates (date) and money."""
    def __init__(self, lang='en'):
        self.lang = lang if lang in LANGS else 'en'; self.d = load_tr(self.lang); self.miss = {}

    def t(self, s):
        if self.lang == 'en' or not s or not re.search(r'[A-Za-z]', str(s)): return self.ns(s) if s else s
        v = self.d.get(s)
        if v is None: self.miss[s] = None; return s
        return v

    def _num(self, intpart, dec):
        if self.lang in ('fr', 'de', 'es'):
            sep = NNBSP if self.lang == 'fr' else '.'
            grouped = intpart if ',' not in intpart else intpart.replace(',', sep)
            return grouped + (',' + dec if dec else '')
        return intpart + ('.' + dec if dec else '')

    def ns(self, s):
        """re-punctuate the numbers inside a string written in English style (14,863.2 → 14 863,2 in French)"""
        if self.lang in ('en', 'ar', 'zh'): return str(s)
        return re.sub(r'(?<![\w.,])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?![\w])', lambda m: self._num(m.group(1), m.group(2)), str(s))

    def n(self, x, dec=1):
        s = f'{x:,.{dec}f}'; i, _, d = s.partition('.')
        return self._num(i, d)

    def pct(self, x, dec=0):
        v = self.n(x, dec) if dec else self.ns(str(x))
        return v + (NBSP + '%' if self.lang in ('fr', 'de', 'es') else '%')

    def date(self, iso):
        y, m, d = map(int, iso.split('-')); mo = MONTHS[self.lang][m - 1]
        return {'fr': f'{"1er" if d == 1 else d} {mo} {y}', 'es': f'{d} de {mo} de {y}', 'de': f'{d}. {mo} {y}',
                'zh': f'{y}年{m}月{d}日'}.get(self.lang, f'{d} {mo} {y}')

    def usd_bn(self, v):
        """chart legends: US dollars in billions, written the local way"""
        if self.lang == 'zh': return f'{self.zh10(str(v))}亿美元'
        x = self.n(v, len(str(v).partition('.')[2]))
        return {'fr': f'{x}{NBSP}Md{NBSP}USD', 'de': f'{x}{NBSP}Mrd.{NBSP}USD', 'es': f'{x}{NBSP}miles de millones de USD',
                'ar': f'{x} مليار دولار'}.get(self.lang, f'USD {x}bn')

    @staticmethod
    def zh10(v):
        """billions → 亿: the same value, ten times the number (14.86 → 148.6)"""
        d = Decimal(v.replace(',', '')) * 10; dec = max(0, len(v.partition('.')[2]) - 1)
        return f'{d:,.{dec}f}'

    ZH_UNITS = {'US$ billion': '亿美元', 'USD billion': '亿美元', 'USD bn': '亿美元', 'GH¢ billion': '亿塞地', 'GH¢ billion per month': '亿塞地/月'}

    def value_unit(self, value, unit):
        """a figure's number and unit: number re-punctuated, Chinese billions shown as 亿"""
        v = str(value)
        if self.lang == 'zh' and unit in self.ZH_UNITS and re.fullmatch(r'[\d,]+(\.\d+)?', v):
            return self.zh10(v), self.ZH_UNITS[unit]
        return (self.t(v) if re.search(r'[A-Za-z]', v) else self.ns(v)), self.t(unit)


def nice(d, L=None):
    return (L or Loc()).date(d)


def check():
    """[(id, problem)]: the report must stay sourced and internally consistent."""
    r, out, ids = load(), [], set()
    for c in r['chapters']:
        for f in c['figures']:
            if f['id'] in ids: out.append((f['id'], 'duplicate id'))
            ids.add(f['id'])
            if not f['source_url'].startswith('https://'): out.append((f['id'], 'source without https link'))
            if not f.get('period'): out.append((f['id'], 'no period'))
            if not f.get('quote'): out.append((f['id'], 'no phrase for the six-hour source check'))
        for sec in ('rules', 'opportunities', 'risks'):
            for x in c[sec]:
                if not x['source_url'].startswith('http'): out.append((c['id'], f'{sec}: unsourced line'))
    o = r.get('outlook')
    if o:
        if sum(x['prob'] for x in o['scenarios']) != 100: out.append(('outlook', 'scenario probabilities do not add up to 100'))
        for i in o['indicators']:
            for y in ('2026', '2027', '2028'):
                b, u, d = i['f'][y]
                if not (min(u, d) <= b <= max(u, d)): out.append((i['id'], f'{y}: base case outside the scenario range'))
            if not i['anchors'] or any(not a['url'].startswith('https://') for a in i['anchors']): out.append((i['id'], 'forecast without sourced anchors'))
            if i['history'] not in r.get('history', {}): out.append((i['id'], 'no history series'))
    ex = dict(r['charts']['exports']['rows'])
    if abs(sum(ex.values()) - 22.44) > 0.02: out.append(('charts', 'export parts do not add up to the total'))
    for a in r.get('authors', []):
        if not ('@' in a.get('email', '') and a.get('phone') and a.get('whatsapp', '').isdigit()): out.append(('authors', f'{a.get("name")}: email, phone or WhatsApp missing'))
    if not r.get('authors'): out.append(('authors', 'no authors or contacts'))
    if not str(r.get('edition', {}).get('file', '')).endswith('.pdf'): out.append(('edition', 'no PDF edition named'))
    for lang in LANGS[1:]:
        m = missing(lang)
        if m: out.append((f'i18n-{lang}', f'{len(m)} untranslated: {m[:3]}'))
    return out


# text used outside the page: the emails the server sends, the page title and description, the PDF cover, header and contents
EXTRA = ['Ghana Investment Report 2026: Economy and Key Sectors | Gotham Consult',
 'Independent investor guide to Ghana in 2026: growth, inflation, rates and reserves, plus mining, energy, cocoa and agribusiness, ICT, manufacturing, real estate and logistics. Every figure sourced and checked at least every six hours.',
 'Your Ghana Investment Report 2026', 'Your Ghana Investment Report, {name}', 'Thank you for your interest. Your copy of the Ghana Investment Report 2026 is ready.',
 'The link works for 30 days. The web version at {link} is checked against its sources every six hours.', 'Questions about Ghana, or about investing here? Write or call us directly:',
 'Thank you for contacting Gotham Consult', 'Thank you, {name}', 'We have your message about the Ghana Investment Report and will reply within one working day.',
 'Investor country guide', 'The economy and its five key sectors: the figures, the rules, the opportunities and the risks, with an outlook to 2028. Every number linked to its official source and checked at least every six hours.',
 'sourced figures', 'sector chapters', 'scenarios to 2028', 'data as of', 'Prepared by', 'Independent research · not investment advice', 'Contents', 'Accra · Ghana',
 'Economy and investment climate', 'Gold, mining and critical minerals', 'Oil, gas and power', 'Cocoa and agribusiness', 'ICT, industry and real estate',
 'Prepared by Uffe Carlson and Joy Preston', 'Ghana Investment Report 2026', 'Partner, Gotham Consult', 'Managing Partner, Gotham Consult', 'page']


def missing(lang):
    L = Loc(lang)
    if not L.d: return ['(no translation file)']
    render(lang, L); [L.t(x) for x in EXTRA]; return list(L.miss)


# ---------- charts (inline SVG: crisp, no library, readable without JavaScript) ----------
NAVY, GOLD, GOLD2, TEAL, GREY = '#0F1B2D', '#B8862F', '#F0BE5A', '#2FB594', '#C9CED6'


def bars(rows, L, unit='', highlight=None, **_):
    """HTML bars: text stays readable at any width (an SVG would shrink its labels on a phone)."""
    mx = max(v for _, v in rows)
    def val(v):
        if unit == '%': return L.pct(v, 1)
        return L.ns(f'{v:g}')
    li = ''.join(f'<li{" class=hl" if k == highlight else ""}><span class="bl">{esc(L.t(k))}</span><span class="bt"><i style="width:{100 * v / mx:.1f}%"></i></span><b>{esc(val(v))}</b></li>'
                 for k, v in rows)
    return f'<ul class="rp-bars">{li}</ul>'


def stack(rows, L, w=560):
    total, x, out = sum(v for _, v in rows), 0.0, []
    cols = [GOLD, '#7A4E2D', NAVY, GREY]
    out.append(f'<svg viewBox="0 0 {w} 64" class="rp-svg" role="img" aria-hidden="true" focusable="false">')
    for (k, v), c in zip(rows, cols):
        bw = w * v / total
        out.append(f'<rect x="{x:.1f}" y="4" width="{bw - 2:.1f}" height="40" rx="6" fill="{c}"/>')
        if bw > 46: out.append(f'<text x="{x + 10:.1f}" y="30" class="rp-in">{esc(L.pct(round(100 * v / total)))}</text>')
        x += bw
    out.append('</svg>')
    legend = ''.join(f'<li><i style="background:{c}"></i>{esc(L.t(k))} <b>{esc(L.usd_bn(v))}</b></li>' for (k, v), c in zip(rows, cols))
    return '<div class="rp-ltr">' + ''.join(out) + f'</div><ul class="rp-leg">{legend}</ul>'


def donut(share, label, L, w=180):
    import math
    r, c = 70, 2 * math.pi * 70
    return (f'<svg viewBox="0 0 {w} {w}" class="rp-donut" role="img" aria-label="{esc(label)}">'
            f'<circle cx="90" cy="90" r="{r}" fill="none" stroke="#E7E1D3" stroke-width="22"/>'
            f'<circle cx="90" cy="90" r="{r}" fill="none" stroke="{GOLD}" stroke-width="22" stroke-dasharray="{c * share:.1f} {c:.1f}" transform="rotate(-90 90 90)"/>'
            f'<text x="90" y="88" text-anchor="middle" class="rp-dn">{esc(L.pct(round(share * 100)))}</text>'
            f'<text x="90" y="112" text-anchor="middle" class="rp-dl">{esc(L.t("of exports"))}</text></svg>')


def chart_box(ch, svg, L, num):
    note = L.t(ch['note']) + ' ' if ch.get('note') else ''
    return (f'<figure class="box rp-chart"><figcaption><span class="rp-fn">{esc(L.t("Figure {n}").format(n=num))}</span><b>{esc(L.t(ch["title"]))}</b><span>{esc(L.t(ch["period"]))}</span></figcaption>{svg}'
            f'<p class="rp-src">{esc(note)}{esc(L.t("Source:"))} <a href="{esc(ch["source_url"])}" target="_blank" rel="noopener">{esc(ch["source_label"])}</a></p></figure>')


# ---------- page ----------
def figure_row(f, L):
    badge = f'<span class="rp-off">{esc(L.t("Official"))}</span>' if f['official'] else f'<span class="rp-press">{esc(L.t("Reported"))}</span>'
    v = str(f['value']); main, _, more = v.partition(' (')     # ratings: "B (upgraded from B-, outlook positive)"
    more = more[:-1] if more.endswith(')') else more
    val, unit = L.value_unit(main, f['unit'])
    notes = [L.t(more)] if more else []
    if f.get('note'): notes.append(L.t(f['note']))
    return (f'<div class="rp-fig" data-fig="{esc(f["id"])}"><p class="fl">{esc(L.t(f["label"]))}</p>'
            f'<p class="fv"><bdi>{esc(val)}</bdi> <small>{esc(unit)}</small></p>'
            + ''.join(f'<p class="fx">{esc(x)}</p>' for x in notes) +
            f'<p class="fp">{esc(L.t(f["period"]))}</p>'
            f'<p class="fs">{badge} <a href="{esc(f["source_url"])}" target="_blank" rel="noopener">{esc(f["source_label"])}</a></p></div>')


def srcs(x, L):
    out = f' <a class="rp-s" href="{esc(x.get("source_url") or x.get("url"))}" target="_blank" rel="noopener">{esc(L.t("source"))}</a>'
    if isinstance(x.get('source2'), dict): out += f' · <a class="rp-s" href="{esc(x["source2"]["url"])}" target="_blank" rel="noopener">{esc(L.t("source"))} 2</a>'
    return out


def items(xs, cls, L):
    return '<ul class="rp-list ' + cls + '">' + ''.join(f'<li>{esc(L.t(x["text"]))}{srcs(x, L)}</li>' for x in xs) + '</ul>'


def chapter(i, c, r, L):
    if c['id'] in IMG:
        src, alt = IMG[c['id']]
        hero = f'<div class="rp-ph"><img src="{src}" alt="{esc(L.t(alt))}" loading="lazy" decoding="async"></div>'
    else:  # mining: the picture is the number
        gold = dict(r['charts']['exports']['rows'])['Gold'] / 22.44
        lbl = L.t('Gold is {p} of export earnings').format(p=L.pct(round(gold * 100)))
        hero = (f'<div class="rp-ph rp-ph-gold">{donut(gold, lbl, L)}<p>{esc(L.t("Gold, January–August 2026"))}<br>'
                f'<b>{esc(L.usd_bn(14.86))}</b></p></div>')
    link, name = HELP[c['id']]
    players = ''.join(f'<li><b>{esc(L.t(p["name"]))}</b> <span>{esc(L.t(p["what"]))}</span>{srcs(p, L)}</li>' for p in c['players'])
    watch = {'ar': '، ', 'zh': '、'}.get(L.lang, ', ').join(f'<a href="{esc(w["url"])}" target="_blank" rel="noopener">{esc(L.t(w["label"]))}</a>' for w in c['watch'])
    pre = '' if L.lang == 'en' else '/' + L.lang
    return f'''<section class="sec rp-ch" id="{esc(c["id"])}" aria-labelledby="{esc(c["id"])}-h"><div class="wrap">
<div class="rp-chhead">{hero}<div><p class="eyebrow">{esc(L.t("Chapter {n}").format(n=i))}</p><h2 id="{esc(c["id"])}-h">{esc(L.t(c["title"]))}</h2>
<p class="rp-headline">{esc(L.t(c["headline"]))}</p><p class="rp-sum">{esc(L.t(c["summary"]))}</p>
<p class="rp-partner-slot" data-chapter="{esc(c["id"])}"></p></div></div>
<h3 class="rp-h3">{esc(L.t("Key figures"))}</h3>
<div class="rp-figs">{"".join(figure_row(f, L) for f in c["figures"])}</div>
<div class="rp-three">
<div class="box rp-col"><h3>{esc(L.t("Rules that matter"))}</h3>{items(c["rules"], "rules", L)}</div>
<div class="box rp-col"><h3>{esc(L.t("Opportunities"))}</h3>{items(c["opportunities"], "opps", L)}</div>
<div class="box rp-col"><h3>{esc(L.t("Risks to price in"))}</h3>{items(c["risks"], "risks", L)}</div>
</div>
<details class="rp-players"><summary>{esc(L.t("Who is who in this sector ({n})").format(n=len(c["players"])))}</summary><ul>{players}</ul></details>
<p class="rp-watch">{esc(L.t("Source monitoring, every six hours:"))} {watch}.</p>
<p class="rp-help"><a class="btn btn-line" href="{pre}{link}">{esc(L.t(name))} <span class="arrow">→</span></a></p>
</div></section>'''


# ---------- outlook: scenarios, small-multiple charts, forecast table, scorecard ----------
YEARS = list(range(2016, 2029))


def spark(ind, hist, L):
    """History 2016-2025 (solid), base case 2026-2028 (dashed) and the upside-downside range (shaded)."""
    pts = {int(k): v for k, v in hist['points'].items() if v is not None}
    f = {int(y): v for y, v in ind['f'].items()}
    vals = list(pts.values()) + [x for v in f.values() for x in v]
    lo, hi = min(vals), max(vals); pad = (hi - lo) * .12 or 1; lo, hi = lo - pad, hi + pad
    W, H, Lm, R, T, B = 360, 190, 34, 46, 14, 26
    x = lambda y: Lm + (y - YEARS[0]) * (W - Lm - R) / (YEARS[-1] - YEARS[0])
    yv = lambda v: T + (hi - v) * (H - T - B) / (hi - lo)
    last = max(pts); out = [f'<svg viewBox="0 0 {W} {H}" class="rp-spark" role="img" aria-label="{esc(L.t(ind["label"]))}: {esc(L.t("history and forecast"))}">']
    for g in (lo + pad, (lo + hi) / 2, hi - pad):
        out.append(f'<line x1="{Lm}" x2="{W - R}" y1="{yv(g):.1f}" y2="{yv(g):.1f}" stroke="#E3E5E8"/><text x="{Lm - 6}" y="{yv(g) + 4:.1f}" text-anchor="end" class="rp-ax">{g:.0f}</text>')
    out.append(f'<rect x="{x(2025.5):.1f}" y="{T}" width="{x(2028) - x(2025.5) + 8:.1f}" height="{H - T - B}" fill="#FBF6EC"/>')
    band = [(last, pts[last], pts[last])] + [(y, f[y][1], f[y][2]) for y in (2026, 2027, 2028)]
    top = ' '.join(f'{x(y):.1f},{yv(max(a, b)):.1f}' for y, a, b in band)
    bot = ' '.join(f'{x(y):.1f},{yv(min(a, b)):.1f}' for y, a, b in reversed(band))
    out.append(f'<polygon points="{top} {bot}" fill="#F0BE5A" opacity=".35"/>')
    out.append('<polyline fill="none" stroke="#0F1B2D" stroke-width="2.4" points="' + ' '.join(f'{x(y):.1f},{yv(v):.1f}' for y, v in sorted(pts.items())) + '"/>')
    out.append('<polyline fill="none" stroke="#B8862F" stroke-width="2.6" stroke-dasharray="6 5" points="' +
               ' '.join(f'{x(y):.1f},{yv(v):.1f}' for y, v in [(last, pts[last])] + [(y, f[y][0]) for y in (2026, 2027, 2028)]) + '"/>')
    out.append(f'<circle cx="{x(last):.1f}" cy="{yv(pts[last]):.1f}" r="3.5" fill="#0F1B2D"/><circle cx="{x(2028):.1f}" cy="{yv(f[2028][0]):.1f}" r="3.5" fill="#B8862F"/>')
    out.append(f'<text x="{x(2028) + 7:.1f}" y="{yv(f[2028][0]) + 4:.1f}" class="rp-axv">{esc(L.n(f[2028][0], 1))}</text>')
    for y in (2016, 2020, 2025, 2028):
        out.append(f'<text x="{x(y):.1f}" y="{H - 6}" text-anchor="middle" class="rp-ax">{y}</text>')
    out.append('</svg>')
    return '<div class="rp-ltr">' + ''.join(out) + '</div>'


def outlook(r, L, fig0):
    o, hist = r.get('outlook'), r.get('history', {})
    if not o: return '', fig0
    t = L.t
    sc = ''.join(f'<div class="box rp-sc rp-sc-{s["id"]}"><p class="eyebrow" style="margin:0">{esc(t(s["name"]))}</p>'
                 f'<p class="rp-prob"><b>{esc(L.pct(s["prob"]))}</b> {esc(t("likely"))}</p><span class="rp-pbar"><i style="width:{s["prob"]}%"></i></span>'
                 f'<p>{esc(t(s["story"]))}</p><ul>{"".join("<li>" + esc(t(a)) + "</li>" for a in s["assumptions"])}</ul></div>' for s in o['scenarios'])
    cards, n = [], fig0
    for ind in o['indicators']:
        h = hist.get(ind['history'])
        if not h: continue
        n += 1
        anchors = ''.join(f'<li>{"" if re.match(r"^[^:]{2,40}:", a["what"]) else esc(t(a["publisher"])) + ": "}{esc(t(a["what"]))} <a class="rp-s" href="{esc(a["url"])}" target="_blank" rel="noopener">{esc(t("source"))}</a></li>' for a in ind['anchors'])
        cards.append(f'<figure class="box rp-ind"><figcaption><span class="rp-fn">{esc(t("Figure {n}").format(n=n))}</span><b>{esc(t(ind["label"]))}</b>'
                     f'<span>{esc(t(ind["unit"]))} · {esc(t("latest:"))} {esc(t(ind["actual_2026"]))}</span></figcaption>'
                     f'{spark(ind, h, L)}<p class="rp-why">{esc(t(ind["why"]))}</p>'
                     f'<details><summary>{esc(t("Official forecasts we start from"))}</summary><ul class="rp-anc">{anchors}</ul></details>'
                     f'<p class="rp-src">{esc(t("History:"))} <a href="{esc(h["source_url"])}" target="_blank" rel="noopener">{esc(h["source_label"])}</a></p></figure>')
    rng = lambda a, b: f'{L.n(min(a, b), 1)}–{L.n(max(a, b), 1)}'
    rows = ''.join(f'<tr><th scope="row">{esc(t(i["label"]))} <small>({esc(t(i["unit"]))})</small></th>' +
                   ''.join(f'<td><b>{esc(L.n(i["f"][y][0], 1))}</b><small>{esc(rng(i["f"][y][1], i["f"][y][2]))}</small></td>' for y in ('2026', '2027', '2028')) + '</tr>'
                   for i in o['indicators'])
    sec = ''.join(f'<tr><th scope="row">{esc(t(x["sector"]))}</th><td>{esc(t(x["base"]))}</td><td>{esc(t(x["up"]))}</td><td>{esc(t(x["down"]))}</td></tr>' for x in o['sectors'])
    ev = ''.join(f'<li class="box"><b>{esc(t(e["when"]))}</b><span>{esc(t(e["what"]))}</span></li>' for e in o['events'])
    due = {'gdp': t('Due December 2026')}
    score = ''.join(f'<tr><th scope="row">{esc(t(i["label"]))}</th><td>{esc(L.n(i["f"]["2026"][0], 1))} {esc(t(i["unit"]))}</td><td class="rp-pend">{esc(due.get(i["id"], t("Due January 2027")))}</td></tr>' for i in o['indicators'])
    tab = lambda k, title: f'<p class="rp-tn">{esc(t("Table {n}").format(n=k))}</p><h3 class="rp-h3">{esc(t(title))}</h3>'
    html_ = f'''<section class="sec rp-out" id="outlook" aria-labelledby="out-h"><div class="wrap">
<div class="sec-head split"><div><p class="eyebrow">{esc(t("Gotham view · as of {d}").format(d=L.date(o["as_of"])))}</p><h2 id="out-h">{esc(t("Outlook 2026–2028: three scenarios"))}</h2></div><p class="lead">{esc(t(o["lead"]))}</p></div>
<div class="rp-scs">{sc}</div>
<div class="rp-keep">{tab(1, "Our forecasts at a glance")}
<div class="rp-tablewrap"><table class="rp-table rp-ft"><thead><tr><th scope="col">{esc(t("Indicator"))}</th><th scope="col">2026</th><th scope="col">2027</th><th scope="col">2028</th></tr></thead><tbody>{rows}</tbody></table></div>
<p class="rp-src">{esc(t("Bold: base case. Small: range from downside to upside scenario."))}</p></div>
<div class="rp-keep"><h3 class="rp-h3">{esc(t("History and outlook"))}</h3><p class="rp-src" style="margin:-4px 0 12px"><span class="rp-k k1"></span> {esc(t("Actual"))}   <span class="rp-k k2"></span> {esc(t("Base case"))}   <span class="rp-k k3"></span> {esc(t("Upside–downside range"))}</p></div>
<div class="rp-inds">{"".join(cards)}</div>
<div class="rp-keep">{tab(2, "What it means by sector")}
<div class="rp-tablewrap"><table class="rp-table rp-st"><thead><tr><th scope="col">{esc(t("Sector"))}</th><th scope="col">{esc(t("Base case"))}</th><th scope="col">{esc(t("Upside"))}</th><th scope="col">{esc(t("Downside"))}</th></tr></thead><tbody>{sec}</tbody></table></div></div>
<div class="rp-keep"><h3 class="rp-h3">{esc(t("Events that could move the forecast"))}</h3><ul class="rp-cal">{ev}</ul></div>
<div class="rp-keep">{tab(3, "Scorecard")}<p class="rp-src" style="margin:-4px 0 12px">{esc(t("We publish how our base-case forecasts compare with the outcomes, every quarter."))}</p>
<div class="rp-tablewrap"><table class="rp-table rp-score"><thead><tr><th scope="col">{esc(t("2026 forecast"))}</th><th scope="col">{esc(t("Base case"))}</th><th scope="col">{esc(t("Outcome"))}</th></tr></thead><tbody>{score}</tbody></table></div></div>
<p class="rp-src" style="margin-top:14px">{esc(t(o["method"]))}</p>
</div></section>'''
    return html_, n


def takeaways(r, L):
    """the one-page summary investors read first: each chapter's headline and the base-case outlook"""
    t = L.t; o = r['outlook']; base = next(s for s in o['scenarios'] if s['id'] == 'base')
    li = ''.join(f'<li><a href="#{esc(c["id"])}"><b>{esc(t(c["title"]))}</b></a><span>{esc(t(c["headline"]))}</span></li>' for c in r['chapters'])
    li += (f'<li><a href="#outlook"><b>{esc(t("Outlook 2026–2028"))}</b></a><span>{esc(t("Base case ({p}):").format(p=L.pct(base["prob"])))} {esc(t(base["story"]))}</span></li>')
    return (f'<section class="sec rp-take" id="summary" aria-labelledby="sum-h"><div class="wrap"><p class="eyebrow">{esc(t("Executive summary"))}</p>'
            f'<h2 id="sum-h">{esc(t("Key takeaways"))}</h2><ol class="rp-tk">{li}</ol></div></section>\n')


CSS = '''<style>
.rp-meta{display:flex;flex-wrap:wrap;gap:8px 18px;margin:18px 0 0;padding:0;list-style:none;font-size:14px;color:rgba(255,255,255,.82)}
.rp-meta b{color:#fff}
.rp-kpis{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
@media(min-width:720px){.rp-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}}
.rp-kpi{padding:18px 18px 16px;display:flex;flex-direction:column;gap:4px;min-height:132px}
.rp-kpi .k{font-size:13px;color:var(--mute);margin:0}
.rp-kpi .v{font:600 clamp(26px,3.2vw,36px)/1.1 var(--font);color:var(--ink);margin:2px 0 0;letter-spacing:-.01em}
.rp-kpi .v small{font-size:14px;font-weight:600;color:var(--mute);margin-left:4px}
.rp-kpi .p{font-size:12.5px;color:var(--mute);margin:auto 0 0}
.rp-kpi .p a{color:inherit}
.rp-live{display:inline-block;font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px;background:#E3F1E7;color:#1E6B3A;margin-left:6px}
.rp-charts{display:grid;gap:14px;margin-top:14px}
@media(min-width:960px){.rp-charts{grid-template-columns:1.1fr 1fr 1fr}}
.rp-chart{margin:0;padding:20px 22px;display:flex;flex-direction:column;gap:10px}
.rp-chart figcaption{display:flex;flex-direction:column;gap:2px}
.rp-chart figcaption span{font-size:13px;color:var(--mute)}
.rp-svg{width:100%;height:auto;display:block}
.rp-tl{font:500 13px var(--font);fill:#334155}.rp-tv{font:700 13px var(--font);fill:#0F1B2D}.rp-in{font:700 14px var(--font);fill:#fff}
.rp-leg{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 14px;font-size:13.5px}
.rp-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:7px;vertical-align:0}
.rp-bars{list-style:none;margin:0;padding:0;display:grid;gap:8px}\n.rp-bars li{display:grid;grid-template-columns:minmax(90px,34%) 1fr auto;align-items:center;gap:10px;font-size:13.5px}\n.rp-bars .bl{color:#334155}\n.rp-bars .bt{height:14px;background:#EEF0F3;border-radius:999px;overflow:hidden}\n.rp-bars .bt i{display:block;height:100%;border-radius:999px;background:#3B4A63}\n.rp-bars li:first-child .bt i{background:#B8862F}\n.rp-bars li.hl .bt i{background:#0F1B2D}\n.rp-bars li.hl .bl,.rp-bars li.hl b{font-weight:800}\n.rp-bars b{font-size:13.5px;min-width:44px;text-align:right}\n.rp-src{margin:auto 0 0;font-size:12.5px;color:var(--mute)}
.rp-src a{color:inherit;overflow-wrap:anywhere}
.rp-toc{position:sticky;top:68px;z-index:5;background:rgba(250,250,248,.94);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.rp-toc ol{display:flex;gap:6px;overflow-x:auto;margin:0;padding:10px 0;list-style:none;scrollbar-width:none}
.rp-toc a{display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--ink);text-decoration:none;font-size:14px;font-weight:600;white-space:nowrap}
.rp-toc a:hover{border-color:var(--gold)}
.rp-ch{border-top:1px solid var(--line)}
.rp-chhead{display:grid;gap:22px;align-items:start}
@media(min-width:900px){.rp-chhead{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:40px}}
.rp-ph{border-radius:20px;overflow:hidden;aspect-ratio:4/3;background:var(--sunk)}
.rp-ph img{width:100%;height:100%;object-fit:cover;display:block}
.rp-ph-gold{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:linear-gradient(160deg,#0F1B2D,#1d2c47);color:#fff;text-align:center}
.rp-ph-gold p{margin:0;font-size:14px;color:rgba(255,255,255,.8)}.rp-ph-gold b{font-size:22px;color:#F0BE5A}
.rp-donut{width:min(200px,60%);height:auto}.rp-dn{font:700 34px var(--font);fill:#fff}.rp-dl{font:500 13px var(--font);fill:rgba(255,255,255,.75)}
.rp-ch h2{font-size:clamp(26px,3.2vw,38px);margin:4px 0 12px;letter-spacing:-.015em}
.rp-headline{font:italic 400 clamp(19px,2vw,23px)/1.4 Newsreader,Georgia,serif;color:var(--ink);margin:0 0 14px}
.rp-sum{color:var(--mute);margin:0;max-width:68ch}
.rp-h3{font-size:18px;margin:34px 0 12px}
.rp-figs{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.rp-fig{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;gap:4px}
.rp-fig p{margin:0}
.rp-fig .fl{font-size:13.5px;font-weight:600;color:var(--mute);line-height:1.4}
.rp-fig .fv{font:700 24px/1.2 var(--font);color:var(--ink);margin-top:2px;letter-spacing:-.01em;overflow-wrap:anywhere}
.rp-fig .fv small{font-size:13px;font-weight:600;color:var(--mute)}
.rp-fig .fx{font-size:13px;color:var(--ink)}
.rp-fig .fp{font-size:12.5px;color:var(--mute)}
.rp-fig .fs{font-size:12px;color:var(--mute);margin-top:auto;padding-top:8px;line-height:1.45}
.rp-fig .fs a{color:inherit;overflow-wrap:anywhere}
.rp-fig.review{border-color:#E9B872}.rp-fig.review .fp::after{content:" \\2022 being re-checked";font-weight:700;color:#9A5B00}
.rp-out{background:linear-gradient(180deg,#F6F3EC,#FAFAF8)}
.rp-scs{display:grid;gap:14px}
@media(min-width:900px){.rp-scs{grid-template-columns:repeat(3,minmax(0,1fr))}}
.rp-sc{padding:20px 22px;display:flex;flex-direction:column;gap:8px}
.rp-sc p{margin:0;font-size:14.5px;color:var(--mute)}.rp-sc ul{margin:0;padding-left:18px;font-size:13.5px;color:var(--ink);display:grid;gap:4px}
.rp-prob{color:var(--ink)!important}.rp-prob b{font-size:26px}
.rp-pbar{display:block;height:6px;border-radius:99px;background:#EEF0F3;overflow:hidden}.rp-pbar i{display:block;height:100%;background:#0F1B2D}
.rp-sc-up .rp-pbar i{background:#1E6B3A}.rp-sc-down .rp-pbar i{background:#B45309}.rp-sc-base{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold)}
.rp-ft{min-width:0}.rp-ft td{white-space:nowrap}.rp-ft td b{font-size:17px;display:block}.rp-ft td small{color:var(--mute);font-size:12px}
.rp-ft th small{color:var(--mute);font-weight:500}
.rp-inds{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
.rp-ind{margin:0;padding:18px 20px;display:flex;flex-direction:column;gap:8px}
.rp-ind figcaption{display:flex;flex-direction:column;gap:2px}.rp-ind figcaption span{font-size:12.5px;color:var(--mute)}
.rp-spark{width:100%;height:auto;display:block}.rp-ax{font:500 12px var(--font);fill:#6B7280}.rp-axv{font:700 13px var(--font);fill:#9A6A12}
.rp-why{margin:0;font-size:13.5px;color:var(--ink);line-height:1.5}
.rp-ind details summary{cursor:pointer;font-size:13px;font-weight:600;min-height:32px;display:flex;align-items:center}
.rp-anc{margin:0;padding-left:18px;font-size:13px;display:grid;gap:4px;color:var(--mute)}
.rp-k{display:inline-block;width:18px;height:0;border-top:2.5px solid #0F1B2D;vertical-align:4px}.rp-k.k2{border-top:2.5px dashed #B8862F}.rp-k.k3{height:10px;border:0;background:#F0BE5A;opacity:.5;vertical-align:-1px}
.rp-st{min-width:760px}.rp-st td{font-size:13.5px;color:var(--mute)}.rp-st tbody th{width:18%}
.rp-pend{color:var(--mute);font-style:italic}
.rp-tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:16px;background:#fff}
.rp-table{width:100%;border-collapse:collapse;font-size:14.5px;min-width:640px}
.rp-table th,.rp-table td{padding:12px 16px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}
.rp-table thead th{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);background:var(--sunk)}
.rp-table tbody tr:last-child th,.rp-table tbody tr:last-child td{border-bottom:0}
.rp-table tbody th{font-weight:600;color:var(--ink);width:34%}
.rp-val{font-weight:700;white-space:nowrap}.rp-val small{font-weight:600;color:var(--mute)}
.rp-table a{color:var(--ink);overflow-wrap:anywhere}
.rp-off,.rp-press{display:inline-block;font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px;vertical-align:1px;white-space:nowrap}
.rp-off{background:#E3F1E7;color:#1E6B3A}.rp-press{background:#EEF0F3;color:#4B5563}
tr.review .rp-val::after{content:" \\2022 being re-checked";font-size:11px;font-weight:700;color:#9A5B00}
.rp-three{display:grid;gap:14px;margin-top:22px}
@media(min-width:960px){.rp-three{grid-template-columns:repeat(3,minmax(0,1fr))}}
.rp-col{padding:20px 22px}.rp-col h3{margin:0 0 10px;font-size:17px}
.rp-list{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:10px;font-size:14.5px;line-height:1.55}
.rp-list.risks li::marker{color:#B45309}.rp-list.opps li::marker{color:#1E6B3A}.rp-list.rules li::marker{color:var(--gold)}
.rp-s{font-size:12px;color:var(--mute);white-space:nowrap}
.rp-players{margin-top:18px;border:1px solid var(--line);border-radius:16px;background:#fff;padding:0 20px}
.rp-players summary{cursor:pointer;min-height:48px;display:flex;align-items:center;font-weight:600}
.rp-players ul{list-style:none;margin:0 0 16px;padding:0;display:grid;gap:10px;font-size:14.5px}
@media(min-width:860px){.rp-players ul{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 28px}}
.rp-players span{color:var(--mute)}
.rp-watch{font-size:13px;color:var(--mute);margin:16px 0 0}.rp-watch a{color:inherit}
.rp-help{margin:18px 0 0}
.rp-cal{list-style:none;margin:0;padding:0;display:grid;gap:10px}
@media(min-width:860px){.rp-cal{grid-template-columns:repeat(3,minmax(0,1fr))}}
.rp-cal li{padding:16px 18px;display:flex;flex-direction:column;gap:2px}.rp-cal b{color:var(--gold)}
.rp-pk{display:grid;gap:14px}
@media(min-width:900px){.rp-pk{grid-template-columns:repeat(3,minmax(0,1fr))}}
.rp-pk .box{padding:22px;display:flex;flex-direction:column;gap:8px}
.rp-pk .amt{font:700 28px var(--font);color:var(--ink)}
.rp-pk p{margin:0;color:var(--mute);font-size:14.5px}
.rp-pk .hot{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold)}
.rp-form{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;padding:24px}
.rp-kinds legend{width:100%}
@media(min-width:760px){.rp-form .two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}}
.rp-form label{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:600}
.rp-form input,.rp-form select,.rp-form textarea{font:inherit;font-weight:400;min-height:46px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:#fff;color:var(--ink)}
.rp-form textarea{min-height:110px}
.rp-kinds{display:flex;flex-wrap:wrap;gap:8px;border:0;margin:0;padding:0;min-width:0}
.rp-kinds legend{font-size:14px;font-weight:600;margin-bottom:6px}
.rp-kinds label{flex-direction:row;align-items:center;gap:8px;min-height:44px;padding:0 14px;border:1px solid var(--line);border-radius:999px;background:#fff;font-weight:600;cursor:pointer}
.rp-kinds input{min-height:0;width:18px;height:18px;margin:0}
.rp-form .chk{flex-direction:row;align-items:flex-start;font-weight:400;font-size:14px;color:var(--mute)}
.rp-form .chk input{min-height:0;width:20px;height:20px;margin-top:2px;flex:none}
.rp-form .hp{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;opacity:0}
.rp-msg{margin:0;font-weight:600}
.rp-log{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.rp-log li{padding:14px 18px;font-size:14.5px}.rp-log time{font-size:12.5px;color:var(--mute);display:block}
.rp-how{display:grid;gap:14px}
@media(min-width:860px){.rp-how{grid-template-columns:repeat(3,minmax(0,1fr))}}
.rp-how .box{padding:20px 22px}.rp-how h3{margin:0 0 6px;font-size:17px}.rp-how p{margin:0;color:var(--mute);font-size:14.5px}
.rp-by{margin:14px 0 0;font-size:15px;color:rgba(255,255,255,.86)}.rp-by b{color:#fff}
.rp-dl{display:grid;gap:22px;align-items:start}
@media(min-width:960px){.rp-dl{grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:40px}}
.rp-dl h2{font-size:clamp(28px,3.2vw,40px)}
.rp-cover{position:relative;border-radius:18px;overflow:hidden;background:linear-gradient(160deg,#0F1B2D,#1d2c47);color:#fff;padding:26px 24px;display:flex;flex-direction:column;gap:10px;box-shadow:0 18px 40px rgba(15,27,45,.18)}
.rp-cover p{margin:0}.rp-cover .t{font:600 13px var(--font);letter-spacing:.08em;text-transform:uppercase;color:#F0BE5A}
.rp-cover .h{font:700 26px/1.2 var(--font);letter-spacing:-.01em}.rp-cover .s{color:rgba(255,255,255,.78);font-size:14.5px}
.rp-cover ul{margin:6px 0 0;padding-left:18px;font-size:14px;color:rgba(255,255,255,.88);display:grid;gap:4px}
.rp-ready{display:flex;flex-direction:column;gap:10px;padding:22px;border:1px solid var(--gold);border-radius:16px;background:#FFFBF2}
.rp-ready p{margin:0}
.rp-people{display:grid;gap:14px}
@media(min-width:760px){.rp-people{grid-template-columns:repeat(2,minmax(0,1fr))}}
.rp-person{padding:22px;display:flex;flex-direction:column;gap:6px}
.rp-person h3{margin:0;font-size:19px}.rp-person .r{margin:0;color:var(--mute);font-size:14px}
.rp-person ul{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px;font-size:15px}
.rp-person a{color:var(--ink);display:inline-flex;align-items:center;min-height:44px;overflow-wrap:anywhere}
.rp-take{background:linear-gradient(180deg,#FAFAF8,#F6F3EC)}
.rp-tk{margin:8px 0 0;padding:0;list-style:none;counter-reset:tk;display:grid;gap:12px}
@media(min-width:900px){.rp-tk{grid-template-columns:repeat(2,minmax(0,1fr))}}
.rp-tk li{counter-increment:tk;background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px 18px 16px 54px;position:relative;display:flex;flex-direction:column;gap:4px;font-size:15px;line-height:1.5}
.rp-tk li::before{content:counter(tk);position:absolute;inset-inline-start:18px;top:16px;width:24px;height:24px;border-radius:50%;background:#0F1B2D;color:#F0BE5A;font:700 13px/24px var(--font);text-align:center}
.rp-tk a{color:var(--ink);text-decoration:none}.rp-tk span{color:var(--mute)}
html[dir="rtl"] .rp-tk li{padding:16px 54px 16px 18px}
.rp-fn,.rp-tn{display:block;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9A6A12;margin:0}
.rp-tn{margin-top:34px}.rp-tn+.rp-h3{margin-top:4px}
.rp-ltr{direction:ltr}
.rp-imp{margin-top:22px;padding-top:16px;border-top:1px solid var(--line);font-size:13.5px;color:var(--mute)}
.rp-imp h3{font-size:14px;margin:0 0 6px;color:var(--ink)}.rp-imp p{margin:0 0 4px}.rp-imp a{color:inherit}
html[dir="rtl"] .eyebrow,html[lang="ar"] .rp-fn,html[lang="ar"] .rp-tn,html[lang="zh"] .eyebrow,html[lang="zh"] .rp-fn,html[lang="zh"] .rp-tn{letter-spacing:0;text-transform:none}
html[lang="ar"] .rp-headline,html[lang="zh"] .rp-headline{font-style:normal;font-family:var(--sans);font-weight:500}
html[dir="rtl"] .rp-list,html[dir="rtl"] .rp-anc,html[dir="rtl"] .rp-sc ul,html[dir="rtl"] .rp-cover ul{padding-left:0;padding-right:18px}
html[dir="rtl"] .rp-table th,html[dir="rtl"] .rp-table td{text-align:right}
.rp-fv bdi,.fv bdi{unicode-bidi:isolate}
h2,h3,.rp-h3,.eyebrow,.rp-fn,.rp-tn,figcaption{break-after:avoid;page-break-after:avoid}
.rp-keep,.rp-fig,.rp-ind,.rp-sc,.rp-col,.rp-chart,.rp-tk li,.rp-person,.rp-imp{break-inside:avoid;page-break-inside:avoid}
@media print{.gh,.gf,.rp-toc,.rp-form,.rp-help,#partner,#download,.gf-made{display:none!important}.rp-ch{break-before:page}}
</style>'''



ROLES = [('investor', 'Investor or fund'), ('company', 'Company or entrepreneur'), ('adviser', 'Bank, adviser or lawyer'),
         ('government', 'Government or development agency'), ('media', 'Media or research'), ('other', 'Other')]


def download(r, figs, L):
    """The PDF edition, given in exchange for an email: the server answers with a signed link (and emails it)."""
    t = L.t; ed = r.get('edition', {})
    roles = ''.join(f'<option value="{k}">{esc(t(v))}</option>' for k, v in ROLES)
    by = t(' and ').join(esc(a['name']) for a in r.get('authors', []))
    return (f'''<section class="sec rp-dlsec" id="download" aria-labelledby="dl-h"><div class="wrap"><div class="rp-dl">
<div><p class="eyebrow">{esc(t("Free PDF edition"))}</p><h2 id="dl-h">{esc(t("Take the full report with you"))}</h2>
<p class="lead">{esc(t("All {c} chapters, the Outlook 2026–2028 and {f} sourced figures in one PDF to read offline or share with your board.").format(c=len(r["chapters"]), f=figs))}</p>
<div class="rp-cover" aria-hidden="true"><p class="t">{esc(t(ed.get("label", "")))}</p><p class="h">{esc(t(r["title"]))}</p><p class="s">{esc(t("By {names}, {publisher}").format(names=by, publisher=r["publisher"]))}</p>
<ul><li>{esc(t("Economy snapshot and outlook to 2028"))}</li><li>{esc(t("Mining, energy, agribusiness and industry"))}</li><li>{esc(t("Rules, opportunities, risks and key players"))}</li></ul></div></div>
<form class="box rp-form" id="rp-dl" novalidate>
<div class="two"><label>{esc(t("Your name"))}<input name="full_name" autocomplete="name" required maxlength="120"></label>
<label>{esc(t("Email"))}<input name="email" type="email" autocomplete="email" inputmode="email" required maxlength="160"></label></div>
<div class="two"><label>{esc(t("Company or organisation"))}<input name="company" autocomplete="organization" maxlength="160"></label>
<label>{esc(t("I am"))}<select name="role"><option value="">{esc(t("Choose"))}</option>{roles}</select></label></div>
<div class="two"><label>{esc(t("Country"))}<input name="country" autocomplete="country-name" maxlength="80"></label>
<label>{esc(t("WhatsApp or phone (optional)"))}<input name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="40"></label></div>
<label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
<label class="chk"><input type="checkbox" name="updates"> {esc(t("Email me the quarterly update of this report. I can unsubscribe at any time."))}</label>
<label class="chk"><input type="checkbox" name="consent" required> {esc(t("I agree that Gotham Consult may send me the report and contact me about it. My details are handled under Ghana’s Data Protection Act, 2012 (Act 843)."))}</label>
<div><button class="btn btn-gold" type="submit">{esc(t("Get the PDF"))} <span class="arrow">→</span></button></div>
<p class="rp-msg" id="rp-dl-msg" role="status" aria-live="polite"></p></form>
</div></div></section>
''')


PUBLISHER = {'name': 'Gotham Consult', 'city': 'Accra, Ghana', 'email': 'info@gothamconsult.com', 'phone': '+233 55 041 6627', 'site': 'gothamconsult.com'}


def contact(r, L):
    """Who wrote the report, how to reach them, and the publisher block each market expects (imprint, mentions légales …)."""
    t = L.t
    people = ''.join(
        f'<div class="box rp-person"><h3>{esc(a["name"])}</h3><p class="r">{esc(t(a["role"]))}</p><ul>'
        f'<li><a href="mailto:{esc(a["email"])}">{esc(a["email"])}</a></li>'
        f'<li><a href="tel:+{esc(a["whatsapp"])}" dir="ltr">{esc(a["phone"])}</a> · <a href="https://wa.me/{esc(a["whatsapp"])}" target="_blank" rel="noopener">WhatsApp</a></li></ul></div>'
        for a in r.get('authors', []))
    P = PUBLISHER; names = t(' and ').join(a['name'] for a in r.get('authors', []))
    imprint = (f'<div class="rp-imp"><h3>{esc(t("Publisher"))}</h3><p>{esc(P["name"])}, {esc(t(P["city"]))} · '
               f'<a href="mailto:{P["email"]}">{P["email"]}</a> · <bdi dir="ltr">{P["phone"]}</bdi> · <a href="{"/" if L.lang == "en" else "/" + L.lang}">{P["site"]}</a></p>'
               f'<p>{esc(t("Responsible for the content: {names}").format(names=names))}</p>'
               f'<p>{esc(t("© 2026 Gotham Consult. All rights reserved. Quoting with attribution is welcome."))}</p>'
               + (f'<p>{esc(t("This is a translation of the English original. Sources are cited in their original language. If the versions differ, the English version prevails."))}</p>' if L.lang != 'en' else '')
               + '</div>')
    return (f'<section class="sec" id="contact" aria-labelledby="ct-h"><div class="wrap">'
            f'<div class="sec-head split"><div><p class="eyebrow">{esc(t("Authors and contact"))}</p><h2 id="ct-h">{esc(t("Talk to the people behind this report"))}</h2></div>'
            f'<p class="lead">{esc(t("Questions about a figure, a sector or investing in Ghana? Write or call us directly."))}</p></div>'
            f'<div class="rp-people">{people}</div>{imprint}</div></section>\n')


def render(lang='en', L=None):
    L = L or Loc(lang); t = L.t; r = load()
    figs = sum(len(c['figures']) for c in r['chapters'])
    def kpi(k):
        val, unit = L.value_unit(k['value'], k['unit'])
        scale = '10' if (L.lang == 'zh' and k['unit'] in L.ZH_UNITS) else '1'
        live = f' data-live="{esc(":".join(k["live"]))}" data-scale="{scale}" data-asof="{esc(k.get("asof", ""))}"' if k.get('live') else ''
        return (f'<div class="box rp-kpi" data-kpi="{esc(k["id"])}"{live}>'
                f'<p class="k">{esc(t(k["label"]))}</p><p class="v"><span>{esc(val)}</span><small>{esc(unit)}</small></p>'
                f'<p class="p"><span class="per">{esc(t(k["period"]))}</span> · <a href="{esc(k["source_url"])}" target="_blank" rel="noopener">{esc(t("source"))}</a></p></div>')
    kpis = ''.join(kpi(k) for k in r['snapshot'])
    ch = r['charts']
    charts = (chart_box(ch['exports'], stack(ch['exports']['rows'], L), L, 1) +
              chart_box(ch['growth'], bars(ch['growth']['rows'], L, '%', 'Whole economy'), L, 2) +
              chart_box(ch['fdi'], bars(ch['fdi']['rows'], L, '', None), L, 3))
    out_html, _ = outlook(r, L, 3)
    toc = ''.join(f'<li><a href="#{esc(c["id"])}">{i}. {esc(t(c["title"]).split(",")[0].split("，")[0].split("،")[0])}</a></li>' for i, c in enumerate(r['chapters'], 1))
    chapters = '\n'.join(chapter(i, c, r, L) for i, c in enumerate(r['chapters'], 1))
    cal = ''.join(f'<li class="box"><b>{esc(t(x["when"]))}</b><span>{esc(t(x["what"]))}</span></li>' for x in r['calendar'])
    pk = ''.join(f'<div class="box{" hot" if p["id"] == "sector" else ""}"><p class="eyebrow" style="margin:0">{esc(t(p["name"]))}</p>'
                 f'<div class="amt">{esc(t(p["price"]))}</div><p><b>{esc(t(p["per"]))}</b></p><p>{esc(t(p["what"]))}</p></div>' for p in r['partners'])
    ch_opts = ''.join(f'<option value="{esc(c["id"])}">{esc(t(c["title"]))}</option>' for c in r['chapters'])
    br = ('（', '）') if L.lang == 'zh' else (' (', ')')
    pk_opts = ''.join(f'<option value="{esc(p["id"])}">{esc(t(p["name"]))}{br[0]}{esc(t(p["price"]))}{br[1]}</option>' for p in r['partners'])
    names = t(' and ').join(f'<b>{esc(a["name"])}</b>' for a in r.get('authors', []))
    byline = f'<p class="rp-by">{t("Prepared by {names}, Gotham Consult").format(names=names)}</p>' if names else ''
    pre = '' if L.lang == 'en' else '/' + L.lang
    I = {k: t(v) for k, v in {'live': 'Live', 'checked': 'Sources last checked automatically on {d}', 'next': '; next check {d}.', 'partner': 'Partner:',
         'source': 'Source', 'fill': 'Please add your name, a valid email and tick the box.', 'sending': 'Sending…', 'thanks': 'Thank you. We reply within one working day.',
         'check': 'Please check the form and try again.', 'fail': 'Could not send. Please email info@gothamconsult.com.', 'preparing': 'Preparing your copy…',
         'ready': 'Your PDF is ready.', 'downloadNote': 'You can download your copy below. This link is valid for 30 days.', 'dl': 'Download the PDF', 'mailcheck': 'Thank you. Check your email for the link.',
         'many': 'Too many tries. Please wait a few minutes.', 'expired': 'That download link has expired. Fill in the form again for a new one.',
         'refreshing': 'PDF downloads are temporarily paused while we refresh this edition. Your request was recorded; please check back soon or read the online report.'}.items()}
    I['months'] = MONTHS[L.lang]; I['lang'] = L.lang
    body = (CSS + '\n<!--#top-->\n<main id="main" data-no-tr>\n'
        '<section class="phero" aria-labelledby="h1"><img class="bgimg" src="/img/real-airportcity.webp" alt="" fetchpriority="high"><div class="wrap">'
        f'<nav class="crumb" aria-label="{esc(t("Breadcrumb"))}"><a href="{pre or "/"}">{esc(t("Home"))}</a><span aria-hidden="true">/</span><a href="{pre}/invest">{esc(t("Invest in Ghana"))}</a><span aria-hidden="true">/</span><span>{esc(t("Ghana Investment Report"))}</span></nav>'
        f'<p class="eyebrow">{esc(t(r["title"]))} · {esc(r["publisher"])}</p>'
        f'<h1 id="h1">{esc(t("Ghana, sector by sector."))} <span class="serif">{esc(t("Every number sourced."))}</span></h1>'
        f'<p class="lead">{esc(t("An independent investor guide to Ghana’s economy and its five key sectors: the figures, the rules, the opportunities and the risks, each linked to its official source and checked at least every six hours."))}</p>'
        + byline +
        f'<ul class="rp-meta"><li>{esc(t("Updated"))} <b id="rp-updated">{esc(L.date(r["updated"]))}</b></li><li>{t("{n} sourced figures").format(n="<b>" + str(figs) + "</b>")}</li>'
        f'<li>{t("{n} chapters").format(n="<b>" + str(len(r["chapters"])) + "</b>")}</li><li>{t("Sources checked {w}").format(w="<b>" + esc(t("every six hours")) + "</b>")}</li></ul>'
        f'<div class="hero-cta" style="margin-top:22px"><a class="btn btn-gold" href="#download">{esc(t("Download the PDF"))} <span class="arrow">→</span></a> '
        f'<a class="btn btn-line" href="#summary">{esc(t("Read online"))}</a> <a class="btn btn-line" href="#partner">{esc(t("Feature your company"))}</a></div>'
        '</div></section>\n'
        f'<nav class="rp-toc" aria-label="{esc(t("Chapters"))}"><div class="wrap"><ol><li><a href="#summary">{esc(t("Summary"))}</a></li><li><a href="#snapshot">{esc(t("Snapshot"))}</a></li><li><a href="#outlook">{esc(t("Outlook 2026–2028"))}</a></li>{toc}'
        f'<li><a href="#dates">{esc(t("Dates to watch"))}</a></li><li><a href="#download">{esc(t("Download PDF"))}</a></li><li><a href="#partner">{esc(t("Partners"))}</a></li><li><a href="#contact">{esc(t("Contact"))}</a></li></ol></div></nav>\n'
        + takeaways(r, L) +
        '<section class="sec" id="snapshot" aria-labelledby="snap-h"><div class="wrap">'
        f'<div class="sec-head split"><div><p class="eyebrow">{esc(t("Economy snapshot"))}</p><h2 id="snap-h">{esc(t("Ghana in eight numbers"))}</h2></div>'
        f'<p class="lead">{t("Growth, prices, rates and reserves. Figures marked {live} refresh automatically from the Bank of Ghana and the Ghana Statistical Service.").format(live=chr(60) + "span class=" + chr(34) + "rp-live" + chr(34) + " style=" + chr(34) + "margin:0" + chr(34) + ">" + esc(t("Live")) + "</span>")}</p></div>'
        f'<div class="rp-kpis">{kpis}</div><div class="rp-charts">{charts}</div></div></section>\n'
        + download(r, figs, L) + out_html + chapters +
        f'\n<section class="sec" id="dates" aria-labelledby="dates-h"><div class="wrap"><p class="eyebrow">{esc(t("Dates to watch"))}</p><h2 id="dates-h">{esc(t("What could move the numbers next"))}</h2>'
        f'<ul class="rp-cal">{cal}</ul></div></section>\n'
        f'<section class="sec" aria-labelledby="how-h"><div class="wrap"><p class="eyebrow">{esc(t("How this report stays current"))}</p><h2 id="how-h">{esc(t("Sources checked every six hours; changes reviewed by a person"))}</h2><div class="rp-how">'
        f'<div class="box"><h3>{esc(t("Live economic data"))}</h3><p>{esc(t("Growth, inflation, the policy rate and exports update by themselves when the Bank of Ghana and the Ghana Statistical Service publish new figures."))}</p></div>'
        f'<div class="box"><h3>{esc(t("Every source re-opened every six hours"))}</h3><p>{esc(t("Every six hours our system checks each source behind the figures and regulators’ newsrooms. Changes are staged for a person to review; no news is published automatically."))}</p></div>'
        f'<div class="box"><h3>{esc(t("A person approves changes"))}</h3><p>{esc(t("Nothing in the text changes by itself. An analyst reads the new information and updates the report, and every update is listed below with its date."))}</p></div>'
        '</div><p class="rp-src" id="rp-checked" style="margin-top:14px"></p>'
        f'<h3 class="rp-h3">{esc(t("Latest updates"))}</h3><ul class="rp-log" id="rp-log"><li class="box">{esc(t("The first edition was published on {d}.").format(d=L.date(r["updated"])))}</li></ul></div></section>\n'
        '<section class="sec" id="partner" aria-labelledby="pk-h"><div class="wrap">'
        f'<div class="sec-head split"><div><p class="eyebrow">{esc(t("Partners"))}</p><h2 id="pk-h">{esc(t("Put your company in front of investors"))}</h2></div>'
        f'<p class="lead">{esc(t("Partner content is always marked “Partner” and never changes our figures or our analysis. Prices exclude VAT."))}</p></div>'
        f'<div class="rp-pk">{pk}</div>'
        '<form class="box rp-form" id="rp-form" style="margin-top:18px" novalidate>'
        f'<fieldset class="rp-kinds"><legend>{esc(t("I would like to"))}</legend>'
        f'<label><input type="radio" name="kind" value="partner" checked> {esc(t("Feature my company"))}</label>'
        f'<label><input type="radio" name="kind" value="investor"> {esc(t("Talk about investing in Ghana"))}</label>'
        f'<label><input type="radio" name="kind" value="news"> {esc(t("Send news for the report"))}</label></fieldset>'
        f'<div class="two"><label>{esc(t("Package"))}<select name="package">{pk_opts}<option value="">{esc(t("Not sure yet"))}</option></select></label>'
        f'<label>{esc(t("Chapter"))}<select name="chapter">{ch_opts}</select></label></div>'
        f'<div class="two"><label>{esc(t("Your name"))}<input name="full_name" autocomplete="name" required maxlength="120"></label>'
        f'<label>{esc(t("Company"))}<input name="company" autocomplete="organization" maxlength="160"></label></div>'
        f'<div class="two"><label>{esc(t("Email"))}<input name="email" type="email" autocomplete="email" inputmode="email" required maxlength="160"></label>'
        f'<label>{esc(t("WhatsApp or phone (optional)"))}<input name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="40"></label></div>'
        f'<label>{esc(t("Message"))}<textarea name="message" maxlength="1500" placeholder="{esc(t("What would you like to feature, discuss or share? For news, please include a link to the official source."))}"></textarea></label>'
        '<label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>'
        f'<label class="chk"><input type="checkbox" name="consent" required> {esc(t("I agree that Gotham Consult may contact me about this request. My details are handled under Ghana’s Data Protection Act, 2012 (Act 843)."))}</label>'
        f'<div><button class="btn btn-gold" type="submit">{esc(t("Send"))} <span class="arrow">→</span></button></div><p class="rp-msg" id="rp-msg" role="status" aria-live="polite"></p></form>'
        '</div></section>\n'
        + contact(r, L) +
        f'<section class="sec" style="padding-top:0"><div class="wrap"><p class="rp-src">{esc(t("This report is general information compiled from public sources, not investment, legal or tax advice."))} '
        f'{esc(t("Figures marked “Official” come from a government or regulator’s own publication; “Reported” figures are official data or statements as reported by named media."))} '
        f'<a href="/sources">{esc(t("Sources & fact checks"))}</a></p></div></section>\n'
        '</main>\n<!--#bottom-->\n' + SCRIPT.replace('/*I18N*/', json.dumps(I, ensure_ascii=False)))
    return body


SCRIPT = '''<script>(function(){var I=/*I18N*/,M=I.months,lg=I.lang;
function d(s){var x=new Date(s),D=x.getUTCDate(),m=M[x.getUTCMonth()],y=x.getUTCFullYear();
 return lg==="zh"?y+"年"+(x.getUTCMonth()+1)+"月"+D+"日":lg==="de"?D+". "+m+" "+y:lg==="es"?D+" de "+m+" de "+y:lg==="fr"?(D===1?"1er":D)+" "+m+" "+y:D+" "+m+" "+y}
function nf(v,dec){var s=v.toFixed(dec),p=s.split("."),i=p[0],dd=p[1];
 if(lg==="fr"||lg==="de"||lg==="es"){if(i.length>3)i=i.replace(/\\B(?=(\\d{3})+(?!\\d))/g,lg==="fr"?"\\u202f":".");return i+(dd?","+dd:"")}return s}
function ym(p){var m=/^(\\d{4})-?M?(\\d{2})/.exec(p||"");if(m)return m[1]+"-"+m[2];m=/^(\\d{4})-?Q(\\d)$/i.exec(p||"");return m?m[1]+"-"+("0"+m[2]*3).slice(-2):""}
function per(p){if(!p)return"";var m=/^(\\d{4})-?M?(\\d{2})$/.exec(p);if(m)return lg==="zh"?m[1]+"年"+(+m[2])+"月":M[+m[2]-1]+" "+m[1];m=/^(\\d{4})-?Q(\\d)$/i.exec(p);
 if(m)return lg==="zh"?m[1]+"年第"+m[2]+"季度":lg==="fr"?"T"+m[2]+" "+m[1]:lg==="ar"?"الربع "+m[2]+" "+m[1]:"Q"+m[2]+" "+m[1];return p}
var T=AbortSignal.timeout?AbortSignal.timeout(10000):undefined;
fetch("/api/ghana-data",{signal:T}).then(function(r){return r.ok?r.json():null}).then(function(j){if(!j||!j.sources)return;
 document.querySelectorAll("[data-live]").forEach(function(el){var a=el.getAttribute("data-live").split(":"),s=j.sources[a[0]],m=s&&s.metrics&&s.metrics[a[1]];
  if(!m||!isFinite(m.value)||s.status==="snapshot")return;var v=el.querySelector(".v span"),p=el.querySelector(".per");
  var a=el.getAttribute("data-asof"),lp=ym(m.period);if(a&&(!lp||lp<a))return;   // never replace a newer printed figure with an older live one
  var dec=(v.textContent.split(/[.,]/)[1]||"").length;v.textContent=nf(m.value*(+el.getAttribute("data-scale")||1),Math.max(dec,1));p.textContent=per(m.period);
  if(!el.querySelector(".rp-live")){var b=document.createElement("span");b.className="rp-live";b.textContent=I.live;el.querySelector(".k").appendChild(b)}});}).catch(function(){});
fetch("/api/report/public",{signal:T}).then(function(r){return r.ok?r.json():null}).then(function(j){if(!j)return;
 if(j.checked){var c=document.getElementById("rp-checked");c.textContent=I.checked.replace("{d}",d(j.checked))+(j.next?I.next.replace("{d}",d(j.next)):".")}
 (j.figures||[]).forEach(function(f){if(f.status==="review"){var tr=document.querySelector("[data-fig=\\""+f.id+"\\"]");if(tr)tr.classList.add("review")}});
 if(j.updates&&j.updates.length){var ul=document.getElementById("rp-log");ul.innerHTML="";j.updates.forEach(function(u){var li=document.createElement("li");li.className="box";if(lg!=="en")li.lang="en";
  var t=document.createElement("time");t.textContent=d(u.at);li.appendChild(t);var b=document.createElement("b");b.textContent=u.title;li.appendChild(b);
  if(u.text){li.appendChild(document.createTextNode(" "+u.text))}
  if(u.url){var a=document.createElement("a");a.href=u.url;a.target="_blank";a.rel="noopener";a.textContent=" "+I.source;li.appendChild(a)}ul.appendChild(li)})}
 (j.partners||[]).forEach(function(p){var s=document.querySelector(".rp-partner-slot[data-chapter=\\""+p.chapter+"\\"]");if(!s)return;var a=document.createElement("a");a.className="rp-press";a.href=p.url;a.target="_blank";a.rel="noopener sponsored";a.textContent=I.partner+" "+p.name;s.appendChild(a)});
}).catch(function(){});
var g=document.getElementById("rp-dl"),gm=document.getElementById("rp-dl-msg");
if(/[?&]link=expired/.test(location.search))gm.textContent=I.expired;
function ready(u){var w=document.createElement("div");w.className="rp-ready";w.setAttribute("tabindex","-1");
 var p=document.createElement("p"),b=document.createElement("b");b.textContent=I.ready;p.appendChild(b);p.appendChild(document.createTextNode(" "+I.downloadNote));w.appendChild(p);
 var a=document.createElement("a");a.className="btn btn-gold";a.href=u;a.textContent=I.dl;a.style.alignSelf="flex-start";w.appendChild(a);
 g.replaceWith(w);w.focus();location.href=u}
g.addEventListener("submit",function(e){e.preventDefault();var b={kind:"download",lang:lg,full_name:g.full_name.value,email:g.email.value,company:g.company.value,role:g.role.value,
 country:g.country.value,phone:g.phone.value,website:g.website.value,updates:g.updates.checked,consent:g.consent.checked};
 if(!b.full_name||!/^\\S+@\\S+\\.\\S+$/.test(b.email)||!b.consent){gm.textContent=I.fill;return}
 var btn=g.querySelector("button");btn.disabled=true;gm.textContent=I.preparing;
 fetch("/api/report/enquiry",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})})
 .then(function(x){if(x.ok&&x.j.url){ready(x.j.url)}else if(x.ok&&x.j.reportRefreshing){gm.textContent=I.refreshing;btn.disabled=false}else if(x.ok){gm.textContent=I.check;btn.disabled=false}else{gm.textContent=x.j&&x.j.error==="too_many"?I.many:I.check;btn.disabled=false}})
 .catch(function(){gm.textContent=I.fail;btn.disabled=false})});
var f=document.getElementById("rp-form"),msg=document.getElementById("rp-msg");
f.addEventListener("change",function(){var k=f.kind.value;f.package.closest("label").hidden=k!=="partner"});
f.addEventListener("submit",function(e){e.preventDefault();var b={kind:f.kind.value,lang:lg,package:f.package.value,chapter:f.chapter.value,full_name:f.full_name.value,company:f.company.value,
 email:f.email.value,phone:f.phone.value,message:f.message.value,website:f.website.value,consent:f.consent.checked};
 if(!b.full_name||!/^\\S+@\\S+\\.\\S+$/.test(b.email)||!b.consent){msg.textContent=I.fill;return}
 var btn=f.querySelector("button");btn.disabled=true;msg.textContent=I.sending;
 fetch("/api/report/enquiry",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})})
 .then(function(x){if(x.ok){f.reset();msg.textContent=I.thanks}else{msg.textContent=I.check}btn.disabled=false})
 .catch(function(){msg.textContent=I.fail;btn.disabled=false})});
})();</script>
'''

if __name__ == '__main__':
    p = check()
    for i, x in p: print(f'  report {i}: {x}')
    print('report ok' if not p else f'{len(p)} report problem(s)')
