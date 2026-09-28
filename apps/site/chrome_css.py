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
/* neutralise the older pages' own element rules on the new chrome */
header.v2c, footer.v2c { border: 0; box-shadow: none; text-align: left; margin: 0; }
header.v2c.gh { background: none; position: sticky; top: 0; z-index: 50; -webkit-backdrop-filter: none; backdrop-filter: none; padding: env(safe-area-inset-top) 0 0; }
footer.v2c.gf { font: 400 15px/1.6 "Hanken Grotesk", system-ui, sans-serif; }
.v2c { font-family: "Hanken Grotesk", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.6; -webkit-font-smoothing: antialiased; }
.v2c a { color: inherit; }
body.v2-legacy .v2c .gh-bar { background: rgba(7,13,24,.97); }
@media (max-width: 899px) { body.v2-legacy { padding-bottom: calc(84px + env(safe-area-inset-bottom)); } }
'''

def build(src_path, dst_path):
    css = open(src_path, encoding='utf-8').read()
    open(dst_path, 'w', encoding='utf-8').write('/* generated from v2.css by apps/site/chrome_css.py — do not edit by hand */\n' + scope(css) + EXTRA)
