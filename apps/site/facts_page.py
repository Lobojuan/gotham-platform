"""The fact register (apps/crm/facts.json) on the website side.

check():  every claim in the register must still be written on the pages it names ("says" in "where"),
          so the register and the site cannot drift apart unnoticed (tests/api/30_facts.py fails on it).
render(): the public /sources page: every law, fee, figure and price we state, its sources and when a
          person last checked it; the server's weekly automatic check is shown on top by a small script.
links():  every source link used in the articles and the register, for the server's weekly link check.
"""
import os, json, html, glob
from datetime import date, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
FACTS = os.path.join(HERE, '..', 'crm', 'facts.json')
esc = lambda s: html.escape(str(s), quote=True)
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']


def load():
    return json.load(open(FACTS, encoding='utf-8'))['facts']


def nice(d):
    y, m, dd = map(int, d.split('-'))
    return f'{dd} {MONTHS[m - 1]} {y}'


def check(today=None):
    """[(fact id, problem)] where the register no longer matches the site, plus overdue reviews."""
    today = today or date.today()
    out = []
    for f in load():
        texts = []
        for w in f['where']:
            p = os.path.normpath(os.path.join(HERE, w))
            if not os.path.exists(p): out.append((f['id'], f'{w} does not exist')); continue
            texts.append(open(p, encoding='utf-8').read())
        for s in f.get('says', []):
            if not any(s in t for t in texts): out.append((f['id'], f'"{s}" is not on {", ".join(f["where"])}'))
        for s in f['sources']:
            if not s.get('url', '').startswith('https://'): out.append((f['id'], f'source without an https link: {s.get("label")}'))
        age = (today - datetime.strptime(f['checked'], '%Y-%m-%d').date()).days
        if age > f.get('review_days', 90): out.append((f['id'], f'overdue: last checked {f["checked"]}'))
    return out


def links():
    seen, out = set(), []
    for f in load():
        for s in f['sources']:
            if s['url'] not in seen: seen.add(s['url']); out.append({'url': s['url'], 'label': s['label'], 'page': '/sources'})
    for p in sorted(glob.glob(os.path.join(HERE, 'content', 'insights', '*.json'))):
        a = json.load(open(p, encoding='utf-8'))
        if not isinstance(a, dict): continue
        for s in a.get('sources', []):
            if s.get('url', '').startswith('http') and s['url'] not in seen:
                seen.add(s['url']); out.append({'url': s['url'], 'label': s.get('title', s['url']), 'page': '/insights/' + a['slug']})
    return out


KIND = {'law': 'Law', 'fee': 'Government fee', 'rate': 'Rate', 'stat': 'Figure', 'price': 'Our price', 'contact': 'Contact'}


def render():
    facts = load()
    topics = []
    for f in facts:
        if f['topic'] not in topics: topics.append(f['topic'])
    rows = []
    for t in topics:
        items = []
        for f in [x for x in facts if x['topic'] == t]:
            off = ' <span class="fc-off">official</span>'
            src = ''.join(f'<li><a href="{esc(s["url"])}" target="_blank" rel="noopener">{esc(s["label"])}</a>'
                          f'{off if s.get("official") else ""}</li>' for s in f['sources'])
            if not f['sources']: src = f'<li>{esc("Set and approved by " + f.get("owner", "Gotham Consult"))}</li>'
            items.append(
                f'<div class="box fc" data-fact="{esc(f["id"])}"><p class="fc-kind">{esc(KIND.get(f["kind"], "Fact"))}</p>'
                f'<p class="fc-claim">{esc(f["claim"])}</p><ul class="fc-src">{src}</ul>'
                f'<p class="fc-meta"><span>Checked by a person: <b>{nice(f["checked"])}</b></span> '
                f'<span class="fc-auto" data-auto>Next check every {f.get("review_days", 90)} days at the latest</span></p></div>')
        rows.append(f'<section class="sec fc-sec" aria-labelledby="t-{esc(t.lower().replace(" ", "-"))}"><div class="wrap">'
                    f'<h2 class="fc-h" id="t-{esc(t.lower().replace(" ", "-"))}">{esc(t)}</h2><div class="fc-grid">{"".join(items)}</div></div></section>')
    return ('<!--#top-->\n<main id="main">\n'
            '<section class="phero" aria-labelledby="h1"><div class="wrap">'
            '<nav class="crumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span>Sources and fact checks</span></nav>'
            '<p class="eyebrow">Sources and fact checks</p>'
            '<h1 id="h1">Every number on this site, <span class="serif">with its source.</span></h1>'
            '<p class="lead">The laws, government fees, rates, figures and prices we state, where they come from, and when a person last checked them.</p>'
            '</div></section>\n'
            '<section class="sec" aria-labelledby="how-h"><div class="wrap"><h2 id="how-h" class="fc-h">How we keep it right</h2><div class="fc-how">'
            '<div class="box"><h3>Official sources first</h3><p>Each fact names its source: the Ghana Revenue Authority, the Registrar of Companies, GIPA, the Bank of Ghana and other official bodies, or a named publication where no official page exists.</p></div>'
            '<div class="box"><h3>Checked every week</h3><p>Our system opens every source each week. If a source changes, disappears or no longer says what we rely on, or a live figure moves, the team is told the same day.</p></div>'
            '<div class="box"><h3>A person confirms</h3><p>Nothing changes by itself: a person reads the source and confirms the fact or corrects the page. Every fact is re-checked by a person at least every three to six months.</p></div>'
            '</div><p class="fc-auto-all" id="fc-auto" hidden></p></div></section>\n'
            + '\n'.join(rows) +
            '\n<section class="sec" style="padding-top:0"><div class="wrap"><div class="box fc-cta"><h2>Found something out of date?</h2>'
            '<p>Tell us and we check it within one working day. This page is general information, not legal or tax advice.</p>'
            '<p><a class="btn btn-gold" href="https://wa.me/233550416627?text=Hello%2C%20a%20fact%20on%20gothamconsult.com%20looks%20out%20of%20date%3A%20" target="_blank" rel="noopener">Tell us on WhatsApp <span class="arrow">→</span></a> '
            '<a class="btn btn-line" href="mailto:info@gothamconsult.com?subject=Out-of-date%20fact%20on%20gothamconsult.com">info@gothamconsult.com</a></p></div></div></section>\n'
            '</main>\n<!--#bottom-->\n'
            '<script>(function(){var M=["January","February","March","April","May","June","July","August","September","October","November","December"];'
            'function d(s){var x=new Date(s);return x.getUTCDate()+" "+M[x.getUTCMonth()]+" "+x.getUTCFullYear()}'
            'fetch("/api/facts/public",{signal:AbortSignal.timeout(10000)}).then(function(r){return r.ok?r.json():null}).then(function(j){if(!j||!j.checked)return;'
            'var a=document.getElementById("fc-auto");a.hidden=false;a.textContent="Last automatic check of all sources: "+d(j.checked)+".";'
            'j.facts.forEach(function(f){var b=document.querySelector(\'[data-fact="\'+f.id+\'"] [data-auto]\');if(!b)return;'
            'b.className="fc-auto "+f.status;b.textContent=f.status==="ok"?"Sources checked automatically: "+d(j.checked):f.status==="review"?"Being re-checked by our team":"Source temporarily unreachable; last confirmed "+d(f.checked)})}).catch(function(){})})();</script>\n')


if __name__ == '__main__':
    probs = check()
    for i, p in probs: print(f'  fact {i}: {p}')
    print('facts ok' if not probs else f'{len(probs)} fact problem(s)')
