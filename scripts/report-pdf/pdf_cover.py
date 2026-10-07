"""Branded cover page for the report PDF (A4, full bleed). Usage: pdf_cover.py <repo> <out.pdf>"""
import asyncio, sys, json, base64, os
from playwright.async_api import async_playwright
R = sys.argv[1]
rep = json.load(open(f'{R}/apps/crm/report.json'))
b64 = lambda p, t: f'data:{t};base64,' + base64.b64encode(open(p, 'rb').read()).decode()
IMG = f'{R}/apps/site/public/img'
mark = b64(f'{IMG}/brand/mark-white-256.png', 'image/png')
from PIL import Image
import io
def baked(path):   # the photo with the dark fade baked in: no transparency, so the PDF prints the same everywhere
    im = Image.open(path).convert('RGB'); W = 1600; im = im.resize((W, int(im.height * W / im.width)))
    H = int(W * 297 * .6 / 210); top = max(0, int((im.height - H) * .4)); im = im.crop((0, top, W, top + H)) if im.height >= H else im.resize((W, H))
    navy = Image.new('RGB', im.size, (11, 20, 36)); mask = Image.new('L', im.size)
    for y in range(H):
        t = y / H; a = .55 - .2 * (t / .4) if t < .4 else .35 + .65 * ((t - .4) / .6)
        mask.paste(int(255 * a), (0, y, W, y + 1))
    out = Image.composite(navy, im, mask); buf = io.BytesIO(); out.save(buf, 'JPEG', quality=82)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()
photo = baked(f'{IMG}/real-airportcity.webp')
figs = sum(len(c['figures']) for c in rep['chapters'])
M = ['January','February','March','April','May','June','July','August','September','October','November','December']
y, m, d = map(int, rep['updated'].split('-'))
people = ''.join(f'''<div class="p"><b>{a["name"]}</b><span>{a["role"]}</span><span>{a["email"]}</span><span>{a["phone"]} · WhatsApp</span></div>''' for a in rep['authors'])
SHORT = {'macro': 'Economy and investment climate', 'mining': 'Gold, mining and critical minerals', 'energy': 'Oil, gas and power',
         'agri': 'Cocoa and agribusiness', 'industry': 'ICT, industry and real estate'}
chapters = ''.join(f'<li><i>{i:02d}</i>{SHORT.get(c["id"], c["title"])}</li>' for i, c in enumerate(rep['chapters'], 1))
HTML = f'''<!doctype html><html><head><meta charset="utf-8"><style>
@page{{size:A4;margin:0}}*{{box-sizing:border-box}}
html,body{{margin:0;width:210mm;height:297mm;font-family:"Inter","Helvetica Neue",Arial,sans-serif;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.c{{position:relative;width:210mm;height:297mm;overflow:hidden;background:#0B1424}}
.ph{{position:absolute;top:0;left:0;width:210mm;height:178.2mm;display:block}}
.in{{position:absolute;inset:0;padding:18mm 18mm 16mm;display:flex;flex-direction:column}}
.top{{display:flex;align-items:center;gap:4mm}}.top img{{width:11mm;height:auto}}
.top .w{{font-weight:800;font-size:15pt;letter-spacing:.02em}}.top .w small{{display:block;font-weight:500;font-size:8.5pt;letter-spacing:.18em;color:#F0BE5A;text-transform:uppercase}}
.top .ed{{margin-left:auto;font-size:8.5pt;letter-spacing:.16em;text-transform:uppercase;border:1px solid rgba(240,190,90,.7);color:#F0BE5A;border-radius:99px;padding:2mm 4mm}}
.mid{{margin-top:auto}}
.k{{font-size:9pt;letter-spacing:.22em;text-transform:uppercase;color:#F0BE5A;font-weight:700;margin:0 0 4mm}}
h1{{font-size:44pt;line-height:1.02;margin:0;letter-spacing:-.02em;font-weight:800}}
h1 em{{font-family:Georgia,"Times New Roman",serif;font-weight:400;color:#F0BE5A}}
.lead{{font-size:12.5pt;line-height:1.5;color:rgba(255,255,255,.82);max-width:150mm;margin:6mm 0 0}}
.rule{{height:1.2mm;width:28mm;background:#B8862F;border-radius:2mm;margin:8mm 0 7mm}}
.stats{{display:flex;gap:10mm;margin:0 0 8mm}}.stats div{{font-size:8.5pt;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em}}
.stats b{{display:block;font-size:20pt;color:#fff;letter-spacing:0;text-transform:none}}
ul{{list-style:none;margin:0 0 9mm;padding:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(3,auto);grid-auto-flow:column;gap:2.2mm 10mm;font-size:10.5pt;color:rgba(255,255,255,.9)}}
ul i{{font-style:normal;color:#F0BE5A;font-weight:700;margin-right:3mm}}
.by{{border-top:1px solid rgba(255,255,255,.18);padding-top:6mm}}
.by .k{{margin-bottom:3mm;font-size:8pt}}
.ps{{display:grid;grid-template-columns:1fr 1fr;gap:8mm}}
.p{{display:flex;flex-direction:column;gap:.8mm;font-size:9.5pt;color:rgba(255,255,255,.78)}}.p b{{font-size:13pt;color:#fff}}
.foot{{display:flex;justify-content:space-between;align-items:flex-end;margin-top:7mm;font-size:8.5pt;color:rgba(255,255,255,.6)}}
.foot b{{color:#fff;font-weight:600}}
</style></head><body><div class="c"><img class="ph" src="{photo}" alt=""><div class="in">
<div class="top"><img src="{mark}" alt=""><div class="w">Gotham Consult<small>Accra · Ghana</small></div><div class="ed">{rep["edition"]["label"]}</div></div>
<div class="mid"><p class="k">Investor country guide</p>
<h1>Ghana Investment<br>Report <em>2026</em></h1>
<p class="lead">The economy and its five key sectors: the figures, the rules, the opportunities and the risks, with an outlook to 2028. Every number linked to its official source and re-checked every week.</p>
<div class="rule"></div>
<div class="stats"><div><b>{figs}</b>sourced figures</div><div><b>{len(rep["chapters"])}</b>sector chapters</div><div><b>3</b>scenarios to 2028</div><div><b>{d} {M[m-1][:3]} {y}</b>data as of</div></div>
<ul>{chapters}<li><i>+</i>Outlook 2026–2028</li></ul>
<div class="by"><p class="k">Prepared by</p><div class="ps">{people}</div></div>
<div class="foot"><span><b>gothamconsult.com/ghana-investment-report</b> · info@gothamconsult.com</span><span>Independent research · not investment advice</span></div>
</div></div></div></body></html>'''
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=__import__('os').environ.get('CHROMIUM') or None)
        pg = await b.new_page(); await pg.set_content(HTML, wait_until='load'); await pg.wait_for_timeout(300)
        await pg.pdf(path=sys.argv[2], format='A4', print_background=True, margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'})
        await b.close()
asyncio.run(main())
