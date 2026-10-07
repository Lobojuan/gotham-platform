import asyncio, sys, base64
from playwright.async_api import async_playwright

CSS = '''
header, .gh, .phero, footer, .gf, .gf-made, .rp-toc, .rp-form, .rp-help, .dock, .skip, #download, #partner {display:none!important}
[class*="ask-"], [id*="ask"], .fab, .mdock, .v2c-dock {display:none!important}
.rp-ch{break-before:page} .rp-fig,.rp-col,.rp-chart,.rp-kpi,.box,.rp-pk>div,.rp-cal li{break-inside:avoid}
.sec{padding-top:26px!important;padding-bottom:26px!important}
a{text-decoration:none}
.hero-cta,.crumb{display:none!important}
.rp-chhead{grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr)!important;gap:28px!important}
.rp-ph{aspect-ratio:4/3}
.rp-three{grid-template-columns:repeat(3,minmax(0,1fr))!important}
.rp-kpis{grid-template-columns:repeat(4,minmax(0,1fr))!important}
.rp-charts{grid-template-columns:1.1fr 1fr 1fr!important}
.rp-players ul{grid-template-columns:repeat(2,minmax(0,1fr))!important}
.rp-cal{grid-template-columns:repeat(3,minmax(0,1fr))!important}
.rp-pk{grid-template-columns:repeat(3,minmax(0,1fr))!important}
.rp-how{grid-template-columns:repeat(3,minmax(0,1fr))!important}
.rp-scs{grid-template-columns:repeat(3,minmax(0,1fr))!important}
.rp-inds{grid-template-columns:repeat(3,minmax(0,1fr))!important}
.rp-out{break-before:page}
.rp-people{grid-template-columns:repeat(2,minmax(0,1fr))!important}
#contact{break-inside:avoid;break-before:page}
.rp-ind,.rp-sc,.rp-table tr{break-inside:avoid}
'''
MARK = 'data:image/png;base64,' + base64.b64encode(open(sys.argv[3], 'rb').read()).decode()
HEAD = ('<div style="width:100%;padding:0 10mm;font-family:Helvetica,Arial,sans-serif;font-size:8px;color:#0F1B2D;-webkit-print-color-adjust:exact">'
        '<div style="display:flex;align-items:center;gap:6px;padding-bottom:5px;border-bottom:1.2px solid #B8862F">'
        f'<img src="{MARK}" style="width:16px;height:16px;border-radius:4px">'
        '<b style="font-size:9px;letter-spacing:.02em">Gotham Consult</b><span style="color:#B8862F">|</span><span>Ghana Investment Report 2026</span>'
        '<span style="margin-left:auto;color:#5A6472">Prepared by Uffe Carlson and Joy Preston</span></div></div>')
FOOT = ('<div style="font-size:7.5px;color:#5A6472;width:100%;padding:0 10mm;font-family:sans-serif;line-height:1.5">'
        '<div style="display:flex;justify-content:space-between"><span>Ghana Investment Report 2026 · October 2026 edition · Gotham Consult · gothamconsult.com/ghana-investment-report</span>'
        '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'
        '<div>Uffe Carlson, uffe.carlson@gmail.com, +233 55 239 5548 · Joy Preston, joy@gothamconsult.com, +233 55 041 6627</div></div>')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=__import__('os').environ.get('CHROMIUM') or None)
        pg = await b.new_page(viewport={'width': 1200, 'height': 900})
        await pg.goto(sys.argv[1], wait_until='networkidle')
        await pg.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i=>i.loading='eager')")
        for y in range(0, 30000, 800):
            await pg.evaluate(f'window.scrollTo(0,{y})'); await pg.wait_for_timeout(40)
        await pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
        await pg.add_style_tag(content=CSS)
        await pg.emulate_media(media='screen')
        await pg.wait_for_timeout(500)
        await pg.pdf(path=sys.argv[2], format='A4', print_background=True,
                     margin={'top': '17mm', 'bottom': '16mm', 'left': '10mm', 'right': '10mm'},
                     display_header_footer=True, scale=0.66, header_template=HEAD, footer_template=FOOT)
        await b.close()

asyncio.run(main())
