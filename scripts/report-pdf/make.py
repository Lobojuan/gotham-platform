"""PDF edition of the Ghana Investment Report, in any of the six languages.

    python3 scripts/report-pdf/make.py http://127.0.0.1:4100 fr apps/crm/report-files/ghana-investment-report-2026-10-fr.pdf

1. The report page for that language is printed (A4) with a branded header and footer on every page.
2. No heading may start in the bottom part of a page: every heading carries an invisible marker, the PDF is read back
   (pdftotext -bbox), and any heading that landed in the bottom 24% of a page is moved to the next page; repeat.
3. A branded cover and a contents page (with the real page numbers) are put in front; images are compressed.
Needs: python3 + playwright (+ Pillow), poppler (pdftotext), qpdf, ghostscript. CHROMIUM may point to a Chromium binary.
"""
import asyncio, sys, os, re, json, base64, io, subprocess, tempfile
from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'apps', 'site'))
import report_page as RP

BASE, LANG, OUT = sys.argv[1].rstrip('/'), sys.argv[2], sys.argv[3]
L = RP.Loc(LANG); t = L.t; R = RP.load()
RTL = LANG == 'ar'
FONT = {'ar': '"Noto Sans Arabic","Noto Naskh Arabic",sans-serif', 'zh': '"Noto Sans CJK SC","Noto Sans SC",sans-serif'}.get(LANG, 'Helvetica,Arial,sans-serif')
URL = f'{BASE}/{"" if LANG == "en" else LANG + "/"}ghana-investment-report'
PUB = f'gothamconsult.com/{"" if LANG == "en" else LANG + "/"}ghana-investment-report'
SCALE = 0.66
CSS = '''
header, .gh, .phero, footer, .gf, .gf-made, .rp-toc, .rp-form, .rp-help, .dock, .skip, #download, #partner, .hero-cta, .crumb {display:none!important}
[class*="ask-"], [id*="ask"], .fab, .mdock, .v2c-dock {display:none!important}
.rp-ch, .rp-out, #snapshot, #contact {break-before:page}
.rp-fig,.rp-col,.rp-chart,.rp-kpi,.box,.rp-cal li,.rp-ind,.rp-sc,.rp-table tr,.rp-keep,.rp-tk li,.sec-head,.rp-chhead{break-inside:avoid}
h2,h3,.eyebrow,.rp-tn,.rp-fn{break-after:avoid}
.sec{padding-top:26px!important;padding-bottom:26px!important}
a{text-decoration:none}
.rp-chhead{grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr)!important;gap:28px!important}
.rp-ph{aspect-ratio:4/3}
.rp-three,.rp-scs,.rp-inds,.rp-cal,.rp-how{grid-template-columns:repeat(3,minmax(0,1fr))!important}
.rp-kpis{grid-template-columns:repeat(4,minmax(0,1fr))!important}
.rp-charts{grid-template-columns:1.1fr 1fr 1fr!important}
.rp-players ul,.rp-people,.rp-tk{grid-template-columns:repeat(2,minmax(0,1fr))!important}
.rp-pb{break-before:page!important}
.rp-col,.rp-three,.rp-players,.rp-players ul,.rp-figs{break-inside:auto!important}.rp-list li,.rp-players li,.rp-anc li{break-inside:avoid}
.pdfm{font:1px/1px monospace!important;color:#fefefe!important;display:inline!important;letter-spacing:0!important}
'''
MARKS_JS = '''() => {
  const sel = '.eyebrow, h2, .rp-tn, h3.rp-h3, .rp-col h3, .rp-ind figcaption, .rp-chart figcaption, .rp-imp h3, .rp-players';
  const out = []; let i = 0;
  document.querySelectorAll('main ' + sel).forEach(el => {
    if (el.offsetParent === null) return;
    if (el.matches('h2') && el.previousElementSibling && el.previousElementSibling.matches('.eyebrow')) return;   // the eyebrow above it carries the mark
    if (el.matches('h3.rp-h3') && el.previousElementSibling && el.previousElementSibling.matches('.rp-tn')) return;
    const id = 'QX' + (100 + i++) + 'Q'; const s = document.createElement('span'); s.className = 'pdfm'; s.textContent = id + ' ';
    el.insertBefore(s, el.firstChild); el.setAttribute('data-pdfm', id);
    const sec = el.closest('section'); out.push({id, h2: el.matches('.eyebrow') || el.matches('h2'), sec: sec ? sec.id : '', text: (sec && sec.querySelector('h2') ? sec.querySelector('h2').innerText : el.innerText).replace(/^QX\\d+Q\\s*/, '')});
  });
  return out;
}'''
MARK_IMG = 'data:image/png;base64,' + base64.b64encode(open(os.path.join(ROOT, 'apps/site/public/img/brand/icon-64.png'), 'rb').read()).decode()
names = t(' and ').join(a['name'] for a in R['authors'])
HEAD = (f'<div dir="{"rtl" if RTL else "ltr"}" style="width:100%;padding:0 10mm;font-family:{FONT};font-size:8px;color:#0F1B2D;-webkit-print-color-adjust:exact">'
        '<div style="display:flex;align-items:center;gap:6px;padding-bottom:5px;border-bottom:1.2px solid #B8862F">'
        f'<img src="{MARK_IMG}" style="width:16px;height:16px;border-radius:4px">'
        f'<b style="font-size:9px">Gotham Consult</b><span style="color:#B8862F">|</span><span>{RP.esc(t("Ghana Investment Report 2026"))}</span>'
        f'<span style="margin-inline-start:auto;color:#5A6472">{RP.esc(t("Prepared by Uffe Carlson and Joy Preston"))}</span></div></div>')
contacts = ' · '.join(f'{a["name"]}, {a["email"]}, <span dir="ltr">{a["phone"]}</span>' for a in R['authors'])
FOOT = (f'<div dir="{"rtl" if RTL else "ltr"}" style="font-size:7.5px;color:#5A6472;width:100%;padding:0 10mm;font-family:{FONT};line-height:1.5">'
        f'<div style="display:flex;justify-content:space-between"><span>{RP.esc(t("Ghana Investment Report 2026"))} · {RP.esc(t(R["edition"]["label"]))} · Gotham Consult · {PUB}</span>'
        '<span dir="ltr"><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'
        f'<div>{contacts}</div></div>')


def bbox_marks(pdf):
    """{marker: (page, y_fraction)} from the PDF's words"""
    x = subprocess.run(['pdftotext', '-bbox', pdf, '-'], capture_output=True, text=True).stdout
    out, page, ph = {}, 0, 1
    for line in x.splitlines():
        m = re.search(r'<page width="([\d.]+)" height="([\d.]+)"', line)
        if m: page += 1; ph = float(m.group(2)); continue
        m = re.search(r'<word xMin="[\d.]+" yMin="([\d.]+)"[^>]*>(QX\d+Q)', line)
        if m and m.group(2) not in out: out[m.group(2)] = (page, float(m.group(1)) / ph)
    return out


async def body(b, pushed):
    pg = await b.new_page(viewport={'width': 1088, 'height': 1400})   # = the printable width at this scale, so right-to-left pages are not cut off
    await pg.goto(URL, wait_until='networkidle')
    await pg.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i=>i.loading='eager')")
    for y in range(0, 40000, 800):
        await pg.evaluate(f'window.scrollTo(0,{y})'); await pg.wait_for_timeout(30)
    await pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
    await pg.add_style_tag(content=CSS + (f'html{{zoom:{SCALE}}}' if RTL else ''))   # Chromium shifts right-to-left pages printed with a scale factor; zoom instead
    marks = await pg.evaluate(MARKS_JS)
    if pushed:
        await pg.evaluate('ids => ids.forEach(id => { const el = document.querySelector(`[data-pdfm="${id}"]`); if (!el) return; '
                          '(el.closest(".sec-head, .rp-keep, .rp-chhead") || el).classList.add("rp-pb"); })', list(pushed))
    await pg.emulate_media(media='screen'); await pg.wait_for_timeout(600)
    fd, path = tempfile.mkstemp(suffix='.pdf'); os.close(fd)
    await pg.pdf(path=path, format='A4', print_background=True, scale=1 if RTL else SCALE, display_header_footer=True, header_template=HEAD, footer_template=FOOT,
                 margin={'top': '17mm', 'bottom': '16mm', 'left': '10mm', 'right': '10mm'})
    await pg.close()
    return path, marks


def cover_html(toc=None):
    from PIL import Image
    img = Image.open(os.path.join(ROOT, 'apps/site/public/img/real-airportcity.webp')).convert('RGB'); W = 1600
    img = img.resize((W, int(img.height * W / img.width))); H = int(W * 297 * .6 / 210); top = max(0, int((img.height - H) * .4))
    img = img.crop((0, top, W, top + H)) if img.height >= H else img.resize((W, H))
    navy = Image.new('RGB', img.size, (11, 20, 36)); mask = Image.new('L', img.size)
    for y in range(H):
        f = y / H; a = .55 - .2 * (f / .4) if f < .4 else .35 + .65 * ((f - .4) / .6); mask.paste(int(255 * a), (0, y, W, y + 1))
    buf = io.BytesIO(); Image.composite(navy, img, mask).save(buf, 'JPEG', quality=82)
    photo = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()
    mark = 'data:image/png;base64,' + base64.b64encode(open(os.path.join(ROOT, 'apps/site/public/img/brand/mark-white-256.png'), 'rb').read()).decode()
    figs = sum(len(c['figures']) for c in R['chapters'])
    SHORT = {'macro': 'Economy and investment climate', 'mining': 'Gold, mining and critical minerals', 'energy': 'Oil, gas and power',
             'agri': 'Cocoa and agribusiness', 'industry': 'ICT, industry and real estate'}
    chapters = ''.join(f'<li><i>{i:02d}</i>{RP.esc(t(SHORT[c["id"]]))}</li>' for i, c in enumerate(R['chapters'], 1))
    people = ''.join(f'<div class="p"><b>{a["name"]}</b><span>{RP.esc(t(a["role"]))}</span><span>{a["email"]}</span><span dir="ltr">{a["phone"]} · WhatsApp</span></div>' for a in R['authors'])
    title = t('Ghana Investment Report 2026')
    h1 = RP.esc(title).replace('2026', '<em>2026</em>', 1)
    toc_html = ''
    if toc:
        rows = ''.join(f'<li><span class="tt">{RP.esc(x)}</span><span class="dots"></span><span class="pn">{p}</span></li>' for x, p in toc)
        toc_html = (f'<div class="toc"><div class="tin"><div class="top2"><img src="{mark}" alt=""><b>Gotham Consult</b><span>{RP.esc(title)}</span></div>'
                    f'<h2>{RP.esc(t("Contents"))}</h2><ol>{rows}</ol>'
                    f'<p class="note">{RP.esc(t("This report is general information compiled from public sources, not investment, legal or tax advice."))}</p></div></div>')
    return f'''<!doctype html><html lang="{LANG}" dir="{"rtl" if RTL else "ltr"}"><head><meta charset="utf-8"><style>
@page{{size:A4;margin:0}}*{{box-sizing:border-box}}
html,body{{margin:0;font-family:{FONT};-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.c{{position:relative;width:210mm;height:297mm;overflow:hidden;background:#0B1424;color:#fff;break-after:page}}
.ph{{position:absolute;top:0;left:0;width:210mm;height:178.2mm;display:block}}
.in{{position:absolute;inset:0;padding:18mm 18mm 16mm;display:flex;flex-direction:column}}
.top{{display:flex;align-items:center;gap:4mm}}.top img{{width:11mm;height:auto}}
.top .w{{font-weight:800;font-size:15pt}}.top .w small{{display:block;font-weight:500;font-size:8.5pt;letter-spacing:{0 if LANG in ("ar", "zh") else ".18em"};color:#F0BE5A}}
.top .ed{{margin-inline-start:auto;font-size:8.5pt;border:1px solid rgba(240,190,90,.7);color:#F0BE5A;border-radius:99px;padding:2mm 4mm}}
.mid{{margin-top:auto}}
.k{{font-size:9pt;letter-spacing:{0 if LANG in ("ar", "zh") else ".22em"};text-transform:uppercase;color:#F0BE5A;font-weight:700;margin:0 0 4mm}}
h1{{font-size:{40 if LANG in ("de", "fr", "es") else 44}pt;line-height:1.12;margin:0;font-weight:800}}
h1 em{{font-family:{"Georgia,serif" if LANG not in ("ar", "zh") else "inherit"};font-weight:{400 if LANG not in ("ar", "zh") else 800};color:#F0BE5A;font-style:{"italic" if LANG not in ("ar", "zh") else "normal"}}}
.lead{{font-size:12pt;line-height:1.55;color:rgba(255,255,255,.82);max-width:155mm;margin:6mm 0 0}}
.rule{{height:1.2mm;width:28mm;background:#B8862F;border-radius:2mm;margin:8mm 0 7mm}}
.stats{{display:flex;gap:10mm;margin:0 0 8mm}}.stats div{{font-size:8.5pt;color:rgba(255,255,255,.7)}}
.stats b{{display:block;font-size:20pt;color:#fff}}
ul{{list-style:none;margin:0 0 9mm;padding:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(3,auto);grid-auto-flow:column;gap:2.2mm 10mm;font-size:10.5pt;color:rgba(255,255,255,.9)}}
ul i{{font-style:normal;color:#F0BE5A;font-weight:700;margin-inline-end:3mm}}
.by{{border-top:1px solid rgba(255,255,255,.18);padding-top:6mm}}.by .k{{font-size:8pt;margin-bottom:3mm}}
.ps{{display:grid;grid-template-columns:1fr 1fr;gap:8mm}}
.p{{display:flex;flex-direction:column;gap:.8mm;font-size:9.5pt;color:rgba(255,255,255,.78)}}.p b{{font-size:13pt;color:#fff}}
.foot{{display:flex;justify-content:space-between;align-items:flex-end;margin-top:7mm;font-size:8.5pt;color:rgba(255,255,255,.6)}}.foot b{{color:#fff;font-weight:600}}
.toc{{width:210mm;height:297mm;background:#FAFAF8;color:#0F1B2D}}
.tin{{padding:22mm 22mm 18mm}}
.top2{{display:flex;align-items:center;gap:3mm;font-size:9pt;color:#5A6472;border-bottom:1.2px solid #B8862F;padding-bottom:4mm}}.top2 img{{width:8mm;background:#0F1B2D;border-radius:2mm;padding:1mm}}.top2 b{{color:#0F1B2D}}
.toc h2{{font-size:30pt;margin:16mm 0 10mm}}
.toc ol{{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4.2mm;font-size:12.5pt}}
.toc li{{display:flex;align-items:baseline;gap:3mm}}.toc .dots{{flex:1;border-bottom:1px dotted #B9BEC6;transform:translateY(-1mm)}}.toc .pn{{font-weight:700;color:#9A6A12;min-width:8mm;text-align:end}}
.toc .note{{margin-top:16mm;font-size:9pt;color:#5A6472;line-height:1.5}}
</style></head><body><div class="c"><img class="ph" src="{photo}" alt=""><div class="in">
<div class="top"><img src="{mark}" alt=""><div class="w">Gotham Consult<small>{RP.esc(t("Accra · Ghana"))}</small></div><div class="ed">{RP.esc(t(R["edition"]["label"]))}</div></div>
<div class="mid"><p class="k">{RP.esc(t("Investor country guide"))}</p><h1>{h1}</h1>
<p class="lead">{RP.esc(t("The economy and its five key sectors: the figures, the rules, the opportunities and the risks, with an outlook to 2028. Every number linked to its official source and re-checked every week."))}</p>
<div class="rule"></div>
<div class="stats"><div><b>{figs}</b>{RP.esc(t("sourced figures"))}</div><div><b>{len(R["chapters"])}</b>{RP.esc(t("sector chapters"))}</div><div><b>3</b>{RP.esc(t("scenarios to 2028"))}</div><div><b>{RP.esc(L.date(R["updated"]))}</b>{RP.esc(t("data as of"))}</div></div>
<ul>{chapters}<li><i>+</i>{RP.esc(t("Outlook 2026–2028"))}</li></ul>
<div class="by"><p class="k">{RP.esc(t("Prepared by"))}</p><div class="ps">{people}</div></div>
<div class="foot"><span><b>{PUB}</b> · info@gothamconsult.com</span><span>{RP.esc(t("Independent research · not investment advice"))}</span></div>
</div></div></div>{toc_html}</body></html>'''


async def main():
    tmp = tempfile.mkdtemp()
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROMIUM') or None)
        pushed, rounds = set(), 0
        while True:
            path, marks = await body(b, pushed); pos = bbox_marks(path); rounds += 1
            late = [m['id'] for m in marks if m['id'] in pos and pos[m['id']][1] > .76 and m['id'] not in pushed]
            missing = [m['id'] for m in marks if m['id'] not in pos]
            print(f'  round {rounds}: {len(marks)} headings, {len(late)} too close to the page bottom, {len(missing)} not found')
            if not late or rounds >= 25: break
            pushed |= set(late[:1])          # one at a time: moving one heading shifts everything after it
        pages = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout).group(1))
        seen, toc = set(), []
        for m in marks:
            if m['sec'] and m['sec'] not in seen and m['id'] in pos and m['h2']:
                seen.add(m['sec']); toc.append((m['text'].strip(), pos[m['id']][0]))
        pg = await b.new_page(); await pg.set_content(cover_html(toc), wait_until='load'); await pg.wait_for_timeout(400)
        front = os.path.join(tmp, 'front.pdf'); await pg.pdf(path=front, format='A4', print_background=True, margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'})
        await b.close()
    full = os.path.join(tmp, 'full.pdf')
    subprocess.run(['qpdf', '--empty', '--pages', front, path, '--', full], check=True)
    subprocess.run(['gs', '-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.6', '-dPDFSETTINGS=/ebook', '-dColorImageResolution=170',
                    '-dDownsampleColorImages=true', f'-sOutputFile={OUT}', full], check=True)
    print(f'{OUT}: {pages + 2} pages ({pages} report pages, cover, contents), {os.path.getsize(OUT) // 1024} KB')

asyncio.run(main())
