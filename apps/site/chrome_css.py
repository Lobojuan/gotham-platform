"""Builds assets/v2/chrome.css: the new design's header, menus, dock, chat and footer, scoped to `.v2c`
so pages that still use the older styles (register, Family Desk, the free tools, legal pages) get the same
navigation without their own CSS being touched, and without the new CSS leaking into them."""
import re

def _blocks(css):
    """Yield (prelude, body) for top-level blocks; body is None for @charset-like statements."""
    i, n = 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0: break
        pre = css[i:j].strip()
        d, k = 1, j + 1
        while k < n and d:
            if css[k] == '{': d += 1
            elif css[k] == '}': d -= 1
            k += 1
        yield pre, css[j + 1:k - 1]
        i = k

def _scope_sel(sel):
    sel = sel.strip()
    if not sel: return []
    if sel in (':root',): return ['.v2c']
    if sel in ('html', 'body') or sel.startswith('html') or sel.startswith('body'): return []
    if sel.startswith('::view-transition'): return []
    if sel.startswith('*'): return ['.v2c' + sel[1:] if sel != '*' else '.v2c', '.v2c ' + sel]
    first = re.match(r'^([a-zA-Z0-9]*)([^\s>+~]*)(.*)$', sel)
    tag, rest_of_compound, tail = first.group(1), first.group(2), first.group(3)
    return [f'{tag}.v2c{rest_of_compound}{tail}', f'.v2c {sel}']

def scope(css):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    out = []
    for pre, body in _blocks(css):
        if pre.startswith('@keyframes') or pre.startswith('@font-face'):
            out.append(f'{pre}{{{body}}}')
        elif pre.startswith('@view-transition'):
            continue
        elif pre.startswith('@media') or pre.startswith('@supports'):
            inner = scope(body)
            if inner.strip(): out.append(f'{pre}{{{inner}}}')
        else:
            sels = [s for part in pre.split(',') for s in _scope_sel(part)]
            if sels: out.append(f'{",".join(sels)}{{{body.strip()}}}')
    return '\n'.join(out)

EXTRA = '''
/* Native script fonts and direction on legacy forms and their shared chrome. */
html[lang=ar] body,html[lang=ar] .v2c{font-family:"Noto Sans Arabic","Geeza Pro",Arial,sans-serif}
html[lang=ar] h1,html[lang=ar] h2,html[lang=ar] h3{letter-spacing:0;line-height:1.45}
html[lang=zh] body,html[lang=zh] .v2c{font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei",Arial,sans-serif}
html[dir=rtl] .v2c .panes{direction:ltr}html[dir=rtl] .v2c .p0,html[dir=rtl] .v2c .p1{direction:rtl}
html[dir=rtl] input[type=tel],html[dir=rtl] input[type=email]{direction:ltr;text-align:left}
html[dir=rtl] .v2c .m{unicode-bidi:plaintext;text-align:start}

/* neutralise the older pages' own element rules on the new chrome */
header.v2c, footer.v2c { border: 0; box-shadow: none; text-align: left; margin: 0; }
header.v2c.gh { background: none; position: sticky; top: 0; z-index: 50; -webkit-backdrop-filter: none; backdrop-filter: none; padding: env(safe-area-inset-top) 0 0; }
footer.v2c.gf { font: inherit; font-size: 15px; line-height: 1.6; }
.v2c { font-family: "Hanken Grotesk", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.6; -webkit-font-smoothing: antialiased; }
.v2c a { color: inherit; }
body.v2-legacy .v2c .gh-bar { background: rgba(7,13,24,.97); }
html { scroll-padding-top: 84px; }   /* in-page links land below the sticky header (this file is only on the older pages) */
/* dark hero on the older pages, so every page opens like the new design */
body.v2-legacy .intro, body.v2-legacy section.hero, body.v2-legacy .tools-hero { position: relative; color: #fff;
  background: radial-gradient(60% 90% at 100% 0%, rgba(47,181,148,.22), transparent 60%), radial-gradient(50% 80% at 0% 100%, rgba(240,190,90,.16), transparent 60%), #070D18; }
body.v2-legacy .intro { background: #070D18; isolation: isolate; box-shadow: 0 0 0 100vmax #070D18; clip-path: inset(0 -100vmax); padding: 44px 0 40px; margin-bottom: 32px; }
body.v2-legacy .intro::before { content: ""; position: absolute; top: 0; bottom: 0; left: 50%; width: 100vw; transform: translateX(-50%); z-index: -1;
  background: radial-gradient(60% 90% at 100% 0%, rgba(47,181,148,.22), transparent 60%), radial-gradient(50% 80% at 0% 100%, rgba(240,190,90,.16), transparent 60%); }
body.v2-legacy .demo, .v2c .mark::after { display: none !important; }
body.v2-legacy section.hero { padding: 56px 0 56px; }
body.v2-legacy .tools-hero { padding: 52px 0 44px; }
body.v2-legacy .intro h1, body.v2-legacy section.hero h1, body.v2-legacy .tools-hero h1 { color: #fff; }
body.v2-legacy .intro .serif, body.v2-legacy section.hero .serif, body.v2-legacy .tools-hero .serif { color: #F0BE5A; }
body.v2-legacy .intro .eyebrow, body.v2-legacy section.hero .eyebrow, body.v2-legacy .tools-hero .eyebrow { color: #F0BE5A; }
body.v2-legacy .intro .lead, body.v2-legacy section.hero .lead, body.v2-legacy section.hero .fine, body.v2-legacy .tools-hero .lead { color: rgba(255,255,255,.74); }
body.v2-legacy section.hero .btn-dark { background: linear-gradient(135deg, #F0BE5A, #D9A043); color: #1a1205; }
body.v2-legacy section.hero .btn-line { color: #fff; border-color: rgba(255,255,255,.35); background: transparent; }
body.v2-legacy section.hero .founding { background: rgba(240,190,90,.14); color: #F0BE5A; }
body.v2-legacy section.hero .report { color: #0F1B2D; }
body.v2-legacy .intro .feat { box-shadow: 0 0 0 1px rgba(255,255,255,.1); }
body.v2-legacy .tools-hero h1 { font-size: clamp(34px, 6vw, 60px); letter-spacing: -.035em; line-height: 1.04; max-width: 16ch; margin: 6px 0 0; }
body.v2-legacy .tools-hero .lead { max-width: 40em; margin-top: 16px; font-size: clamp(16.5px, 1.6vw, 19px); }
body.v2-legacy .tools-hero .crumbs { font-size: 13px; color: rgba(255,255,255,.55); margin-bottom: 16px; }
body.v2-legacy .tools-hero .crumbs a { color: rgba(255,255,255,.8); text-decoration: none; }
/* /tools: only the tools section of the old one-page site */
body.tools-only main#top > :not(#tools):not(.tools-hero) { display: none !important; }
body.tools-only #tools .shead { display: none; }
@media (max-width: 899px) { body.v2-legacy { padding-bottom: calc(84px + env(safe-area-inset-bottom)); } }
'''

def build(src_path, dst_path):
    css = open(src_path, encoding='utf-8').read()
    open(dst_path, 'w', encoding='utf-8').write('/* generated from v2.css by apps/site/chrome_css.py — do not edit by hand */\n' + scope(css) + EXTRA)
