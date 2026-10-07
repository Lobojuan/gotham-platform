"""Ghana Investment Report (apps/crm/report.json) on the website: /ghana-investment-report.

render(): the public report: economy snapshot (kept current from /api/ghana-data), charts drawn as inline SVG,
          five sector chapters with every figure's source, dates to watch, partner packages and the enquiry form.
          The weekly watch on the server (apps/crm/report-watch.js) re-opens every source; its status and the
          published change log are loaded into the page from /api/report/public.
check():  every figure has a source link, a period and a phrase to look for; the charts agree with the figures.
"""
import os, json, html
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
FILE = os.path.join(HERE, '..', 'crm', 'report.json')
esc = lambda s: html.escape(str(s), quote=True)
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
IMG = {'macro': ('/img/real-bog.webp', 'The Bank of Ghana building in Accra'), 'energy': ('/img/solar.webp', 'Solar panels in Ghana'),
       'agri': ('/img/cocoa.webp', 'Cocoa pods and beans'), 'industry': ('/img/real-tema.webp', 'Container cranes at Tema port')}
HELP = {'macro': ('/services/market-entry', 'Market entry and company set-up'), 'mining': ('/mining', 'Mining: our approach'),
        'energy': ('/services/energy-mining', 'Energy, mining and infrastructure'), 'agri': ('/services/market-entry', 'Market entry for agro-processors'),
        'industry': ('/services/investment-readiness', 'GIPA registration and investor readiness')}


def load():
    return json.load(open(FILE, encoding='utf-8'))


def nice(d):
    y, m, dd = map(int, d.split('-'))
    return f'{dd} {MONTHS[m - 1]} {y}'


def check():
    """[(id, problem)]: the report must stay sourced and internally consistent."""
    r, out, ids = load(), [], set()
    for c in r['chapters']:
        for f in c['figures']:
            if f['id'] in ids: out.append((f['id'], 'duplicate id'))
            ids.add(f['id'])
            if not f['source_url'].startswith('https://'): out.append((f['id'], 'source without https link'))
            if not f.get('period'): out.append((f['id'], 'no period'))
            if not f.get('quote'): out.append((f['id'], 'no phrase for the weekly check'))
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
    for a in r.get('authors', []):
        if not ('@' in a.get('email', '') and a.get('phone') and a.get('whatsapp', '').isdigit()): out.append(('authors', f'{a.get("name")}: email, phone or WhatsApp missing'))
    if not r.get('authors'): out.append(('authors', 'no authors or contacts'))
    if not str(r.get('edition', {}).get('file', '')).endswith('.pdf'): out.append(('edition', 'no PDF edition named'))
    ex = dict(r['charts']['exports']['rows'])
    if abs(sum(ex.values()) - 22.44) > 0.02: out.append(('charts', 'export parts do not add up to the total'))
    return out


# ---------- charts (inline SVG: crisp, no library, readable without JavaScript) ----------
NAVY, GOLD, GOLD2, TEAL, GREY = '#0F1B2D', '#B8862F', '#F0BE5A', '#2FB594', '#C9CED6'


def bars(rows, unit='', highlight=None, **_):
    """HTML bars: text stays readable at any width (an SVG would shrink its labels on a phone)."""
    mx = max(v for _, v in rows)
    li = ''.join(f'<li{" class=hl" if k == highlight else ""}><span class="bl">{esc(k)}</span><span class="bt"><i style="width:{100 * v / mx:.1f}%"></i></span><b>{v:g}{esc(unit)}</b></li>'
                 for k, v in rows)
    return f'<ul class="rp-bars">{li}</ul>'


def stack(rows, w=560):
    total, x, out = sum(v for _, v in rows), 0.0, []
    cols = [GOLD, '#7A4E2D', NAVY, GREY]
    out.append(f'<svg viewBox="0 0 {w} 64" class="rp-svg" role="img" aria-hidden="true" focusable="false">')
    for (k, v), c in zip(rows, cols):
        bw = w * v / total
        out.append(f'<rect x="{x:.1f}" y="4" width="{bw - 2:.1f}" height="40" rx="6" fill="{c}"/>')
        if bw > 46: out.append(f'<text x="{x + 10:.1f}" y="30" class="rp-in">{round(100 * v / total)}%</text>')
        x += bw
    out.append('</svg>')
    legend = ''.join(f'<li><i style="background:{c}"></i>{esc(k)} <b>USD {v:g}bn</b></li>' for (k, v), c in zip(rows, cols))
    return ''.join(out) + f'<ul class="rp-leg">{legend}</ul>'


def donut(share, label, w=180):
    import math
    r, c = 70, 2 * math.pi * 70
    return (f'<svg viewBox="0 0 {w} {w}" class="rp-donut" role="img" aria-label="{esc(label)}">'
            f'<circle cx="90" cy="90" r="{r}" fill="none" stroke="#E7E1D3" stroke-width="22"/>'
            f'<circle cx="90" cy="90" r="{r}" fill="none" stroke="{GOLD}" stroke-width="22" stroke-dasharray="{c * share:.1f} {c:.1f}" transform="rotate(-90 90 90)"/>'
            f'<text x="90" y="88" text-anchor="middle" class="rp-dn">{round(share * 100)}%</text>'
            f'<text x="90" y="112" text-anchor="middle" class="rp-dl">of exports</text></svg>')


def chart_box(ch, svg, extra=''):
    return (f'<figure class="box rp-chart"><figcaption><b>{esc(ch["title"])}</b><span>{esc(ch["period"])}</span></figcaption>{svg}'
            f'<p class="rp-src">{esc(ch.get("note", ""))} Source: <a href="{esc(ch["source_url"])}" target="_blank" rel="noopener">{esc(ch["source_label"])}</a></p>{extra}</figure>')


# ---------- page ----------
def figure_row(f):
    badge = '<span class="rp-off">Official</span>' if f['official'] else '<span class="rp-press">Reported</span>'
    v = str(f['value']); main, _, more = v.partition(' (')
    more = more[:-1] if more.endswith(')') else more
    return (f'<div class="rp-fig" data-fig="{esc(f["id"])}"><p class="fl">{esc(f["label"])}</p>'
            f'<p class="fv">{esc(main)} <small>{esc(f["unit"])}</small></p>'
            + (f'<p class="fx">{esc(more)}</p>' if more else '') +
            f'<p class="fp">{esc(f["period"])}</p>'
            f'<p class="fs">{badge} <a href="{esc(f["source_url"])}" target="_blank" rel="noopener">{esc(f["source_label"])}</a></p></div>')


def items(xs, cls):
    return '<ul class="rp-list ' + cls + '">' + ''.join(
        f'<li>{esc(x["text"])} <a class="rp-s" href="{esc(x["source_url"])}" target="_blank" rel="noopener" aria-label="Source">source</a></li>' for x in xs) + '</ul>'


def chapter(i, c, r):
    hero = ''
    if c['id'] in IMG:
        src, alt = IMG[c['id']]
        hero = f'<div class="rp-ph"><img src="{src}" alt="{esc(alt)}" loading="lazy" decoding="async"></div>'
    else:  # mining: the picture is the number
        gold = dict(r['charts']['exports']['rows'])['Gold'] / 22.44
        hero = f'<div class="rp-ph rp-ph-gold">{donut(gold, "Gold is " + str(round(gold * 100)) + "% of export earnings")}<p>Gold, January–August 2026<br><b>USD 14.86bn</b></p></div>'
    link, name = HELP[c['id']]
    players = ''.join(f'<li><b>{esc(p["name"])}</b> <span>{esc(p["what"])}</span> <a class="rp-s" href="{esc(p["source_url"])}" target="_blank" rel="noopener" aria-label="Source">source</a></li>' for p in c['players'])
    watch = ', '.join(f'<a href="{esc(w["url"])}" target="_blank" rel="noopener">{esc(w["label"])}</a>' for w in c['watch'])
    return f'''<section class="sec rp-ch" id="{esc(c["id"])}" aria-labelledby="{esc(c["id"])}-h"><div class="wrap">
<div class="rp-chhead">{hero}<div><p class="eyebrow">Chapter {i}</p><h2 id="{esc(c["id"])}-h">{esc(c["title"])}</h2>
<p class="rp-headline">{esc(c["headline"])}</p><p class="rp-sum">{esc(c["summary"])}</p>
<p class="rp-partner-slot" data-chapter="{esc(c["id"])}"></p></div></div>
<h3 class="rp-h3">Key figures</h3>
<div class="rp-figs">{"".join(figure_row(f) for f in c["figures"])}</div>
<div class="rp-three">
<div class="box rp-col"><h3>Rules that matter</h3>{items(c["rules"], "rules")}</div>
<div class="box rp-col"><h3>Opportunities</h3>{items(c["opportunities"], "opps")}</div>
<div class="box rp-col"><h3>Risks to price in</h3>{items(c["risks"], "risks")}</div>
</div>
<details class="rp-players"><summary>Who is who in this sector ({len(c["players"])})</summary><ul>{players}</ul></details>
<p class="rp-watch">Watched every week: {watch}.</p>
<p class="rp-help"><a class="btn btn-line" href="{link}">{esc(name)} <span class="arrow">→</span></a></p>
</div></section>'''


# ---------- outlook: scenarios, small-multiple charts, forecast table, scorecard ----------
YEARS = list(range(2016, 2029))


def spark(ind, hist):
    """History 2016-2025 (solid), base case 2026-2028 (dashed) and the upside-downside range (shaded)."""
    pts = {int(k): v for k, v in hist['points'].items() if v is not None}
    f = {int(y): v for y, v in ind['f'].items()}
    vals = list(pts.values()) + [x for v in f.values() for x in v]
    lo, hi = min(vals), max(vals); pad = (hi - lo) * .12 or 1; lo, hi = lo - pad, hi + pad
    W, H, L, R, T, B = 360, 190, 34, 46, 14, 26
    x = lambda y: L + (y - YEARS[0]) * (W - L - R) / (YEARS[-1] - YEARS[0])
    yv = lambda v: T + (hi - v) * (H - T - B) / (hi - lo)
    last = max(pts); out = [f'<svg viewBox="0 0 {W} {H}" class="rp-spark" role="img" aria-label="{esc(ind["label"])}: history and forecast">']
    for g in (lo + pad, (lo + hi) / 2, hi - pad):
        out.append(f'<line x1="{L}" x2="{W - R}" y1="{yv(g):.1f}" y2="{yv(g):.1f}" stroke="#E3E5E8"/><text x="{L - 6}" y="{yv(g) + 4:.1f}" text-anchor="end" class="rp-ax">{g:.0f}</text>')
    out.append(f'<rect x="{x(2025.5):.1f}" y="{T}" width="{x(2028) - x(2025.5) + 8:.1f}" height="{H - T - B}" fill="#FBF6EC"/>')
    band = [(last, pts[last], pts[last])] + [(y, f[y][1], f[y][2]) for y in (2026, 2027, 2028)]
    top = ' '.join(f'{x(y):.1f},{yv(max(a, b)):.1f}' for y, a, b in band)
    bot = ' '.join(f'{x(y):.1f},{yv(min(a, b)):.1f}' for y, a, b in reversed(band))
    out.append(f'<polygon points="{top} {bot}" fill="#F0BE5A" opacity=".35"/>')
    out.append('<polyline fill="none" stroke="#0F1B2D" stroke-width="2.4" points="' + ' '.join(f'{x(y):.1f},{yv(v):.1f}' for y, v in sorted(pts.items())) + '"/>')
    out.append('<polyline fill="none" stroke="#B8862F" stroke-width="2.6" stroke-dasharray="6 5" points="' +
               ' '.join(f'{x(y):.1f},{yv(v):.1f}' for y, v in [(last, pts[last])] + [(y, f[y][0]) for y in (2026, 2027, 2028)]) + '"/>')
    out.append(f'<circle cx="{x(last):.1f}" cy="{yv(pts[last]):.1f}" r="3.5" fill="#0F1B2D"/><circle cx="{x(2028):.1f}" cy="{yv(f[2028][0]):.1f}" r="3.5" fill="#B8862F"/>')
    out.append(f'<text x="{x(2028) + 7:.1f}" y="{yv(f[2028][0]) + 4:.1f}" class="rp-axv">{f[2028][0]:.1f}</text>')
    for y in (2016, 2020, 2025, 2028):
        out.append(f'<text x="{x(y):.1f}" y="{H - 6}" text-anchor="middle" class="rp-ax">{y}</text>')
    out.append('</svg>')
    return ''.join(out)


def outlook(r):
    o, hist = r.get('outlook'), r.get('history', {})
    if not o: return ''
    sc = ''.join(f'<div class="box rp-sc rp-sc-{s["id"]}"><p class="eyebrow" style="margin:0">{esc(s["name"])}</p>'
                 f'<p class="rp-prob"><b>{s["prob"]}%</b> likely</p><span class="rp-pbar"><i style="width:{s["prob"]}%"></i></span>'
                 f'<p>{esc(s["story"])}</p><ul>{"".join("<li>" + esc(a) + "</li>" for a in s["assumptions"])}</ul></div>' for s in o['scenarios'])
    cards = []
    for ind in o['indicators']:
        h = hist.get(ind['history'])
        if not h: continue
        anchors = ''.join(f'<li>{esc(a["publisher"])}: {esc(a["what"])} <a class="rp-s" href="{esc(a["url"])}" target="_blank" rel="noopener">source</a></li>' for a in ind['anchors'])
        cards.append(f'<figure class="box rp-ind"><figcaption><b>{esc(ind["label"])}</b><span>{esc(ind["unit"])} · latest: {esc(ind["actual_2026"])}</span></figcaption>'
                     f'{spark(ind, h)}<p class="rp-why">{esc(ind["why"])}</p>'
                     f'<details><summary>Official forecasts we start from</summary><ul class="rp-anc">{anchors}</ul></details>'
                     f'<p class="rp-src">History: <a href="{esc(h["source_url"])}" target="_blank" rel="noopener">{esc(h["source_label"])}</a></p></figure>')
    rows = ''.join(f'<tr><th scope="row">{esc(i["label"])} <small>({esc(i["unit"])})</small></th>' +
                   ''.join(f'<td><b>{i["f"][y][0]:.1f}</b><small>{min(i["f"][y][1], i["f"][y][2]):.1f}–{max(i["f"][y][1], i["f"][y][2]):.1f}</small></td>' for y in ('2026', '2027', '2028')) + '</tr>'
                   for i in o['indicators'])
    sec = ''.join(f'<tr><th scope="row">{esc(x["sector"])}</th><td>{esc(x["base"])}</td><td>{esc(x["up"])}</td><td>{esc(x["down"])}</td></tr>' for x in o['sectors'])
    ev = ''.join(f'<li class="box"><b>{esc(e["when"])}</b><span>{esc(e["what"])}</span></li>' for e in o['events'])
    score = ''.join(f'<tr><th scope="row">{esc(i["label"])}</th><td>{i["f"]["2026"][0]:.1f} {esc(i["unit"])}</td><td class="rp-pend">Due {"Dec 2026" if i["id"] == "gdp" else "Jan 2027"}</td></tr>' for i in o['indicators'])
    return f'''<section class="sec rp-out" id="outlook" aria-labelledby="out-h"><div class="wrap">
<div class="sec-head split"><div><p class="eyebrow">Gotham view · as of {nice(o["as_of"])}</p><h2 id="out-h">{esc(o["title"])}: three scenarios</h2></div><p class="lead">{esc(o["lead"])}</p></div>
<div class="rp-scs">{sc}</div>
<h3 class="rp-h3">Our forecasts at a glance</h3>
<div class="rp-tablewrap"><table class="rp-table rp-ft"><thead><tr><th scope="col">Indicator</th><th scope="col">2026</th><th scope="col">2027</th><th scope="col">2028</th></tr></thead><tbody>{rows}</tbody></table></div>
<p class="rp-src">Bold: base case. Small: range from downside to upside scenario.</p>
<h3 class="rp-h3">History and outlook</h3><p class="rp-src" style="margin:-4px 0 12px"><span class="rp-k k1"></span> Actual   <span class="rp-k k2"></span> Base case   <span class="rp-k k3"></span> Upside–downside range</p>
<div class="rp-inds">{"".join(cards)}</div>
<h3 class="rp-h3">What it means by sector</h3>
<div class="rp-tablewrap"><table class="rp-table rp-st"><thead><tr><th scope="col">Sector</th><th scope="col">Base case</th><th scope="col">Upside</th><th scope="col">Downside</th></tr></thead><tbody>{sec}</tbody></table></div>
<h3 class="rp-h3">Events that could move the forecast</h3><ul class="rp-cal">{ev}</ul>
<h3 class="rp-h3">Scorecard</h3><p class="rp-src" style="margin:-4px 0 12px">We publish how our base-case forecasts compare with the outcomes, every quarter.</p>
<div class="rp-tablewrap"><table class="rp-table rp-score"><thead><tr><th scope="col">2026 forecast</th><th scope="col">Base case</th><th scope="col">Outcome</th></tr></thead><tbody>{score}</tbody></table></div>
<p class="rp-src" style="margin-top:14px">{esc(o["method"])}</p>
</div></section>'''


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
.rp-form .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
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
@media print{.gh,.gf,.rp-toc,.rp-form,.rp-help,#partner,#download,.gf-made{display:none!important}.rp-ch{break-before:page}}
</style>'''


ROLES = [('investor', 'Investor or fund'), ('company', 'Company or entrepreneur'), ('adviser', 'Bank, adviser or lawyer'),
         ('government', 'Government or development agency'), ('media', 'Media or research'), ('other', 'Other')]


def download(r, figs):
    """The PDF edition, given in exchange for an email: the server answers with a signed link (and emails it)."""
    ed = r.get('edition', {})
    roles = ''.join(f'<option value="{k}">{esc(v)}</option>' for k, v in ROLES)
    by = ' and '.join(esc(a['name']) for a in r.get('authors', []))
    return (f'''<section class="sec rp-dlsec" id="download" aria-labelledby="dl-h"><div class="wrap"><div class="rp-dl">
<div><p class="eyebrow">Free PDF edition</p><h2 id="dl-h">Take the full report with you</h2>
<p class="lead">All {len(r["chapters"])} chapters, the Outlook 2026–2028 and {figs} sourced figures in one PDF to read offline or share with your board.</p>
<div class="rp-cover" aria-hidden="true"><p class="t">{esc(ed.get("label", ""))}</p><p class="h">{esc(r["title"])}</p><p class="s">By {by}, {esc(r["publisher"])}</p>
<ul><li>Economy snapshot and outlook to 2028</li><li>Mining, energy, agribusiness and industry</li><li>Rules, opportunities, risks and key players</li></ul></div></div>
<form class="box rp-form" id="rp-dl" novalidate>
<div class="two"><label>Your name<input name="full_name" autocomplete="name" required maxlength="120"></label>
<label>Email<input name="email" type="email" autocomplete="email" inputmode="email" required maxlength="160"></label></div>
<div class="two"><label>Company or organisation<input name="company" autocomplete="organization" maxlength="160"></label>
<label>I am<select name="role"><option value="">Choose</option>{roles}</select></label></div>
<div class="two"><label>Country<input name="country" autocomplete="country-name" maxlength="80"></label>
<label>WhatsApp or phone (optional)<input name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="40"></label></div>
<label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
<label class="chk"><input type="checkbox" name="updates"> Email me the quarterly update of this report. I can unsubscribe at any time.</label>
<label class="chk"><input type="checkbox" name="consent" required> I agree that Gotham Consult may send me the report and contact me about it. My details are handled under Ghana’s Data Protection Act, 2012 (Act 843).</label>
<div><button class="btn btn-gold" type="submit">Get the PDF <span class="arrow">→</span></button></div>
<p class="rp-msg" id="rp-dl-msg" role="status" aria-live="polite"></p></form>
</div></div></section>
''')


def contact(r):
    """Who wrote the report and how to reach them; shown on the page and in the PDF."""
    people = ''.join(
        f'<div class="box rp-person"><h3>{esc(a["name"])}</h3><p class="r">{esc(a["role"])}</p><ul>'
        f'<li><a href="mailto:{esc(a["email"])}">{esc(a["email"])}</a></li>'
        f'<li><a href="tel:+{esc(a["whatsapp"])}">{esc(a["phone"])}</a> · <a href="https://wa.me/{esc(a["whatsapp"])}" target="_blank" rel="noopener">WhatsApp</a></li></ul></div>'
        for a in r.get('authors', []))
    return ('<section class="sec" id="contact" aria-labelledby="ct-h"><div class="wrap">'
            '<div class="sec-head split"><div><p class="eyebrow">Authors and contact</p><h2 id="ct-h">Talk to the people behind this report</h2></div>'
            '<p class="lead">Questions about a figure, a sector or investing in Ghana? Write or call us directly. Gotham Consult, Accra, '
            '<a href="mailto:info@gothamconsult.com">info@gothamconsult.com</a>.</p></div>'
            f'<div class="rp-people">{people}</div></div></section>\n')


def render():
    r = load()
    names = ' and '.join(f'<b>{esc(a["name"])}</b>' for a in r.get('authors', []))
    byline = f'<p class="rp-by">Prepared by {names}, Gotham Consult</p>' if names else ''
    figs = sum(len(c['figures']) for c in r['chapters'])
    kpis = ''.join(
        f'<div class="box rp-kpi" data-kpi="{esc(k["id"])}"{" data-live=" + chr(34) + esc(":".join(k["live"])) + chr(34) if k.get("live") else ""}>'
        f'<p class="k">{esc(k["label"])}</p><p class="v"><span>{esc(k["value"])}</span><small>{esc(k["unit"])}</small></p>'
        f'<p class="p"><span class="per">{esc(k["period"])}</span> · <a href="{esc(k["source_url"])}" target="_blank" rel="noopener">source</a></p></div>'
        for k in r['snapshot'])
    ch = r['charts']
    charts = (chart_box(ch['exports'], stack(ch['exports']['rows'])) +
              chart_box(ch['growth'], bars(ch['growth']['rows'], '%', 'Whole economy')) +
              chart_box(ch['fdi'], bars(ch['fdi']['rows'], '', None, label_w=130)))
    toc = ''.join(f'<li><a href="#{esc(c["id"])}">{i}. {esc(c["title"].split(",")[0])}</a></li>' for i, c in enumerate(r['chapters'], 1))
    chapters = '\n'.join(chapter(i, c, r) for i, c in enumerate(r['chapters'], 1))
    cal = ''.join(f'<li class="box"><b>{esc(x["when"])}</b><span>{esc(x["what"])}</span></li>' for x in r['calendar'])
    pk = ''.join(f'<div class="box{" hot" if p["id"] == "sector" else ""}"><p class="eyebrow" style="margin:0">{esc(p["name"])}</p>'
                 f'<div class="amt">{esc(p["price"])}</div><p><b>{esc(p["per"])}</b></p><p>{esc(p["what"])}</p></div>' for p in r['partners'])
    ch_opts = ''.join(f'<option value="{esc(c["id"])}">{esc(c["title"])}</option>' for c in r['chapters'])
    pk_opts = ''.join(f'<option value="{esc(p["id"])}">{esc(p["name"])} ({esc(p["price"])})</option>' for p in r['partners'])
    return (CSS + '\n<!--#top-->\n<main id="main">\n'
        '<section class="phero" aria-labelledby="h1"><img class="bgimg" src="/img/real-airportcity.webp" alt="" fetchpriority="high"><div class="wrap">'
        '<nav class="crumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/invest">Invest in Ghana</a><span aria-hidden="true">/</span><span>Ghana Investment Report</span></nav>'
        f'<p class="eyebrow">{esc(r["title"])} · {esc(r["publisher"])}</p>'
        '<h1 id="h1">Ghana, sector by sector. <span class="serif">Every number sourced.</span></h1>'
        '<p class="lead">An independent investor guide to Ghana’s economy and its five key sectors: the figures, the rules, the opportunities and the risks, each linked to its official source and checked again every week.</p>'
        + byline +
        f'<ul class="rp-meta"><li>Updated <b id="rp-updated">{nice(r["updated"])}</b></li><li><b>{figs}</b> sourced figures</li><li><b>{len(r["chapters"])}</b> chapters</li><li>Sources re-checked <b>every week</b></li></ul>'
        '<div class="hero-cta" style="margin-top:22px"><a class="btn btn-gold" href="#download">Download the PDF <span class="arrow">→</span></a> '
        '<a class="btn btn-line" href="#macro">Read online</a> <a class="btn btn-line" href="#partner">Feature your company</a></div>'
        '</div></section>\n'
        f'<nav class="rp-toc" aria-label="Chapters"><div class="wrap"><ol><li><a href="#snapshot">Snapshot</a></li><li><a href="#outlook">Outlook 2026–2028</a></li>{toc}<li><a href="#dates">Dates to watch</a></li><li><a href="#download">Download PDF</a></li><li><a href="#partner">Partners</a></li><li><a href="#contact">Contact</a></li></ol></div></nav>\n'
        '<section class="sec" id="snapshot" aria-labelledby="snap-h"><div class="wrap">'
        '<div class="sec-head split"><div><p class="eyebrow">Economy snapshot</p><h2 id="snap-h">Ghana in eight numbers</h2></div>'
        '<p class="lead">Growth, prices, rates and reserves. Figures marked <span class="rp-live" style="margin:0">Live</span> refresh automatically from the Bank of Ghana and the Ghana Statistical Service.</p></div>'
        f'<div class="rp-kpis">{kpis}</div><div class="rp-charts">{charts}</div></div></section>\n'
        + download(r, figs) + outlook(r) + chapters +
        '\n<section class="sec" id="dates" aria-labelledby="dates-h"><div class="wrap"><p class="eyebrow">Dates to watch</p><h2 id="dates-h">What could move the numbers next</h2>'
        f'<ul class="rp-cal">{cal}</ul></div></section>\n'
        '<section class="sec" aria-labelledby="how-h"><div class="wrap"><p class="eyebrow">How this report stays current</p><h2 id="how-h">Checked every week, confirmed by a person</h2><div class="rp-how">'
        '<div class="box"><h3>Live economic data</h3><p>Growth, inflation, the policy rate and exports update by themselves when the Bank of Ghana and the Ghana Statistical Service publish new figures.</p></div>'
        '<div class="box"><h3>Every source re-opened weekly</h3><p>Each week our system opens every source behind every figure and the regulators’ newsrooms. If a source changes or something new is published, our team is told.</p></div>'
        '<div class="box"><h3>A person approves changes</h3><p>Nothing in the text changes by itself. An analyst reads the new information and updates the report, and every update is listed below with its date.</p></div>'
        '</div><p class="rp-src" id="rp-checked" style="margin-top:14px"></p>'
        '<h3 class="rp-h3">Latest updates</h3><ul class="rp-log" id="rp-log"><li class="box">The first edition was published on ' + nice(r['updated']) + '.</li></ul></div></section>\n'
        '<section class="sec" id="partner" aria-labelledby="pk-h"><div class="wrap">'
        '<div class="sec-head split"><div><p class="eyebrow">Partners</p><h2 id="pk-h">Put your company in front of investors</h2></div>'
        '<p class="lead">Partner content is always marked “Partner” and never changes our figures or our analysis. Prices exclude VAT.</p></div>'
        f'<div class="rp-pk">{pk}</div>'
        '<form class="box rp-form" id="rp-form" style="margin-top:18px" novalidate>'
        '<fieldset class="rp-kinds"><legend>I would like to</legend>'
        '<label><input type="radio" name="kind" value="partner" checked> Feature my company</label>'
        '<label><input type="radio" name="kind" value="investor"> Talk about investing in Ghana</label>'
        '<label><input type="radio" name="kind" value="news"> Send news for the report</label></fieldset>'
        f'<div class="two"><label>Package<select name="package">{pk_opts}<option value="">Not sure yet</option></select></label>'
        f'<label>Chapter<select name="chapter">{ch_opts}</select></label></div>'
        '<div class="two"><label>Your name<input name="full_name" autocomplete="name" required maxlength="120"></label>'
        '<label>Company<input name="company" autocomplete="organization" maxlength="160"></label></div>'
        '<div class="two"><label>Email<input name="email" type="email" autocomplete="email" inputmode="email" required maxlength="160"></label>'
        '<label>WhatsApp or phone (optional)<input name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="40"></label></div>'
        '<label>Message<textarea name="message" maxlength="1500" placeholder="What would you like to feature, discuss or share? For news, please include a link to the official source."></textarea></label>'
        '<label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>'
        '<label class="chk"><input type="checkbox" name="consent" required> I agree that Gotham Consult may contact me about this request. My details are handled under Ghana’s Data Protection Act, 2012 (Act 843).</label>'
        '<div><button class="btn btn-gold" type="submit">Send <span class="arrow">→</span></button></div><p class="rp-msg" id="rp-msg" role="status" aria-live="polite"></p></form>'
        '</div></section>\n'
        + contact(r) +
        '<section class="sec" style="padding-top:0"><div class="wrap"><p class="rp-src">This report is general information compiled from public sources, not investment, legal or tax advice. '
        'Figures marked “Official” come from a government or regulator’s own publication; “Reported” figures are official data or statements as reported by named media. '
        'See also <a href="/sources">Sources &amp; fact checks</a>.</p></div></section>\n'
        '</main>\n<!--#bottom-->\n' + SCRIPT)


SCRIPT = '''<script>(function(){var M=["January","February","March","April","May","June","July","August","September","October","November","December"];
function d(s){var x=new Date(s);return x.getUTCDate()+" "+M[x.getUTCMonth()]+" "+x.getUTCFullYear()}
function per(p){if(!p)return"";var m=/^(\\d{4})-(\\d{2})$/.exec(p);if(m)return M[+m[2]-1]+" "+m[1];m=/^(\\d{4})-Q(\\d)$/i.exec(p);if(m)return"Q"+m[2]+" "+m[1];return p}
var T=AbortSignal.timeout?AbortSignal.timeout(10000):undefined;
fetch("/api/ghana-data",{signal:T}).then(function(r){return r.ok?r.json():null}).then(function(j){if(!j||!j.sources)return;
 document.querySelectorAll("[data-live]").forEach(function(el){var a=el.getAttribute("data-live").split(":"),s=j.sources[a[0]],m=s&&s.metrics&&s.metrics[a[1]];
  if(!m||!isFinite(m.value)||s.status==="snapshot")return;var v=el.querySelector(".v span"),p=el.querySelector(".per");
  v.textContent=(Math.round(m.value*100)/100).toString();p.textContent=per(m.period);
  if(!el.querySelector(".rp-live")){var b=document.createElement("span");b.className="rp-live";b.textContent="Live";el.querySelector(".k").appendChild(b)}});}).catch(function(){});
fetch("/api/report/public",{signal:T}).then(function(r){return r.ok?r.json():null}).then(function(j){if(!j)return;
 if(j.checked){var c=document.getElementById("rp-checked");c.textContent="Sources last checked automatically on "+d(j.checked)+(j.next?"; next check "+d(j.next)+".":".")}
 (j.figures||[]).forEach(function(f){if(f.status==="review"){var tr=document.querySelector("[data-fig=\\""+f.id+"\\"]");if(tr)tr.classList.add("review")}});
 if(j.updates&&j.updates.length){var ul=document.getElementById("rp-log");ul.innerHTML="";j.updates.forEach(function(u){var li=document.createElement("li");li.className="box";
  var t=document.createElement("time");t.textContent=d(u.at);li.appendChild(t);var b=document.createElement("b");b.textContent=u.title;li.appendChild(b);
  if(u.text){li.appendChild(document.createTextNode(" "+u.text))}
  if(u.url){var a=document.createElement("a");a.href=u.url;a.target="_blank";a.rel="noopener";a.textContent=" Source";li.appendChild(a)}ul.appendChild(li)})}
 (j.partners||[]).forEach(function(p){var s=document.querySelector(".rp-partner-slot[data-chapter=\\""+p.chapter+"\\"]");if(!s)return;var a=document.createElement("a");a.className="rp-press";a.href=p.url;a.target="_blank";a.rel="noopener sponsored";a.textContent="Partner: "+p.name;s.appendChild(a)});
}).catch(function(){});
var g=document.getElementById("rp-dl"),gm=document.getElementById("rp-dl-msg");
if(/[?&]link=expired/.test(location.search))gm.textContent="That download link has expired. Fill in the form again for a new one.";
function ready(u){var w=document.createElement("div");w.className="rp-ready";w.setAttribute("tabindex","-1");
 var p=document.createElement("p");p.innerHTML="<b>Your PDF is ready.</b> We have also emailed you the link (valid 30 days).";w.appendChild(p);
 var a=document.createElement("a");a.className="btn btn-gold";a.href=u;a.textContent="Download the PDF";a.style.alignSelf="flex-start";w.appendChild(a);
 g.replaceWith(w);w.focus();location.href=u}
g.addEventListener("submit",function(e){e.preventDefault();var b={kind:"download",full_name:g.full_name.value,email:g.email.value,company:g.company.value,role:g.role.value,
 country:g.country.value,phone:g.phone.value,website:g.website.value,updates:g.updates.checked,consent:g.consent.checked};
 if(!b.full_name||!/^\\S+@\\S+\\.\\S+$/.test(b.email)||!b.consent){gm.textContent="Please add your name, a valid email and tick the box.";return}
 var btn=g.querySelector("button");btn.disabled=true;gm.textContent="Preparing your copy\\u2026";
 fetch("/api/report/enquiry",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})})
 .then(function(x){if(x.ok&&x.j.url){ready(x.j.url)}else if(x.ok){gm.textContent="Thank you. Check your email for the link."}else{gm.textContent=x.j&&x.j.error==="too_many"?"Too many tries. Please wait a few minutes.":"Please check the form and try again.";btn.disabled=false}})
 .catch(function(){gm.textContent="Could not send. Please email info@gothamconsult.com.";btn.disabled=false})});
var f=document.getElementById("rp-form"),msg=document.getElementById("rp-msg");
f.addEventListener("change",function(){var k=f.kind.value;f.package.closest("label").hidden=k!=="partner"});
f.addEventListener("submit",function(e){e.preventDefault();var b={kind:f.kind.value,package:f.package.value,chapter:f.chapter.value,full_name:f.full_name.value,company:f.company.value,
 email:f.email.value,phone:f.phone.value,message:f.message.value,website:f.website.value,consent:f.consent.checked};
 if(!b.full_name||!/^\\S+@\\S+\\.\\S+$/.test(b.email)||!b.consent){msg.textContent="Please add your name, a valid email and tick the box.";return}
 var btn=f.querySelector("button");btn.disabled=true;msg.textContent="Sending\\u2026";
 fetch("/api/report/enquiry",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})})
 .then(function(x){if(x.ok){f.reset();msg.textContent="Thank you. We reply within one working day."}else{msg.textContent="Please check the form and try again."}btn.disabled=false})
 .catch(function(){msg.textContent="Could not send. Please email info@gothamconsult.com.";btn.disabled=false})});
})();</script>
'''

if __name__ == '__main__':
    p = check()
    for i, x in p: print(f'  report {i}: {x}')
    print('report ok' if not p else f'{len(p)} report problem(s)')
