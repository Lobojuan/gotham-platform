#!/usr/bin/env python3
"""One-off generator for the v2 inner pages from the content of the current site (index.html data).
The generated HTML is committed and edited by hand from then on."""
import json, html, re, urllib.parse, os
D = json.load(open('/tmp/qa/sitedata.json'))
OUT = os.environ['OUT']
E = lambda s: html.escape(str(s), quote=True)
WA_JOY, WA_UFFE = '233550416627', '233552395548'
wa = lambda n, t: f'https://wa.me/{n}?text=' + urllib.parse.quote(t)

def phero(crumb, eyebrow, h1, lead, jumps=(), img=None):
    j = ''.join(f'<a href="#{a}">{E(b)}</a>' for a, b in jumps)
    im = f'<img class="bgimg" src="/img/{img}" alt="" fetchpriority="high">' if img else ''
    return f'''<section class="phero" aria-labelledby="h1">{im}
    <div class="wrap">
      <nav class="crumb" aria-label="Breadcrumb"><a href="/v2">Home</a><span aria-hidden="true">/</span><span>{E(crumb)}</span></nav>
      <p class="eyebrow">{E(eyebrow)}</p>
      <h1 id="h1">{h1}</h1>
      <p class="lead">{lead}</p>
      {f'<nav class="jump" aria-label="On this page">{j}</nav>' if j else ''}
    </div>
  </section>'''

def head(eyebrow, h2, lead='', id_=''):
    return f'''<div class="sec-head split">
        <div><p class="eyebrow">{E(eyebrow)}</p><h2{f' id="{id_}"' if id_ else ''}>{h2}</h2></div>
        {f'<p class="lead">{lead}</p>' if lead else ''}
      </div>'''

def ticks(items): return '<ul class="ticks">' + ''.join(f'<li>{i}</li>' for i in items) + '</ul>'

def prices(pk, number, who):
    out = []
    for p in pk:
        msg = f"Hello, I am interested in: {p['t']} ({p['pr']})."
        out.append(f'''<div class="box price rv{' hot' if p.get('hot') else ''}">
          {f'<span class="pill">{E(p["l"])}</span>' if p.get('l') else ''}
          <h3>{E(p['t'])}</h3><p>{E(p['d'])}</p>
          <div><div class="amt">{E(p['pr'])}</div><div class="ps">{E(p['ps'])}</div></div>
          <a class="btn {'btn-gold' if p.get('hot') else 'btn-line'}" href="{E(wa(number, msg))}" target="_blank" rel="noopener">Ask about this <span class="arrow">→</span></a>
        </div>''')
    return '<div class="prices">' + ''.join(out) + '</div>'

def flow(steps):
    return '<div class="steps" style="margin-top:18px">' + ''.join(
        f'<div class="step"><h3>{E(a.split("·",1)[-1].strip())}</h3><p style="margin:6px 0 0">{E(b)}</p></div>' for a, b in steps) + '</div>'

def cta(title, lead, buttons):
    return f'''<section class="sec cta" aria-label="Contact">
    <div class="wrap"><div class="cta-box rv">
      <h2>{title}</h2><p class="lead">{lead}</p><div class="cta-row">{buttons}</div>
    </div></div>
  </section>'''

WA_ICON = '<svg class="icon"><use href="#i-wa"/></svg>'
def page(body, scripts=''):
    return f'<!--#top-->\n<main id="main">\n  {body}\n</main>\n<!--#bottom-->\n{scripts}'

# ---------------------------------------------------------------- services
ICONS = ['i-rocket', 'i-plane', 'i-chip', 'i-chip', 'i-bolt', 'i-pick', 'i-shield', 'i-users', 'i-home', 'i-cal']
prac = []
for i, s in enumerate(D['services']):
    link = f'<a class="go" href="{E(s["href"].replace(".html",""))}" style="font-weight:600;text-decoration:none;display:inline-flex;min-height:44px;align-items:center">{E(s.get("cta","More"))} <span class="arrow">→</span></a>' if s.get('href') else ''
    prac.append(f'''<div class="box rv"><span class="ic"><svg class="icon"><use href="#{ICONS[i]}"/></svg></span>
        <div><h3>{E(s['t'])}{'<span class="pill teal new">New</span>' if s.get('new') else ''}</h3><p>{E(s['p'])}</p>{ticks(E(x) for x in s['l'])}{link}</div></div>''')
P = D['PATHS']
TABS = [('biz', 'Business owners', WA_JOY), ('inv', 'Investors', WA_UFFE), ('min', 'Mining investors', WA_UFFE), ('ind', 'Individuals & diaspora', WA_JOY)]
tabbtns = ''.join(f'<button type="button" role="tab" id="t-{k}" aria-controls="p-{k}" aria-selected="{str(i==0).lower()}" tabindex="{0 if i==0 else -1}">{E(n)}</button>' for i, (k, n, _) in enumerate(TABS))
panels = []
for i, (k, n, num) in enumerate(TABS):
    x = P[k]
    more = {'inv': '<a class="btn btn-line" href="/v2/invest">Invest in Ghana: numbers, sectors, GIPA Act <span class="arrow">→</span></a>',
            'min': '<a class="btn btn-line" href="/v2/mining">Mining: our approach and regulatory watch <span class="arrow">→</span></a>',
            'ind': '<a class="btn btn-line" href="/family">Family Desk for parents in Ghana <span class="arrow">→</span></a>'}.get(k, '')
    panels.append(f'''<div class="tabpanel" role="tabpanel" id="p-{k}" aria-labelledby="t-{k}"{'' if i==0 else ' hidden'}>
        <h3 style="font-size:clamp(22px,2.6vw,30px);margin-bottom:8px">{E(x['h'])}</h3>
        <p class="lead" style="margin:0 0 14px">{E(x['p'])}</p>
        <div class="chips" style="margin-bottom:20px">{''.join(f'<span>{E(c)}</span>' for c in x['pains'])}</div>
        {prices(x['pk'], num, n)}
        {flow(x['flow'])}
        {f'<div style="margin-top:18px">{more}</div>' if more else ''}
      </div>''')
tiers = []
for t in D['TIERS']:
    m = t['m'].replace('(USD 1,000/month)', '(GHS 11,500/month)')
    hot = t.get('hot')
    tiers.append(f'''<div class="box tier rv{' hot' if hot else ''}">
        {'<span class="pill">Most chosen</span>' if hot else ''}
        <h3>{E(t['t'])}</h3><div class="amt">{E(t['p'])} <small>{E(t['s'])}</small></div>
        {ticks(E(f) for f in t['f'])}
        <a class="btn {'btn-gold' if hot else 'btn-line'}" href="{E(wa(WA_JOY, 'Hello Gotham Consult. ' + m))}" target="_blank" rel="noopener">{E(t['c'])} <span class="arrow">→</span></a>
      </div>''')
services = page(f'''{phero('Services', 'What we do', 'Ten practices, <span class="serif">one partner.</span>',
    'From your first registration to a mining lease, with partner lawyers, geologists and engineers where the job needs them. Fixed prices in Ghana cedis, paid by mobile money.',
    [('practices', 'Practices'), ('packages', 'Packages & prices'), ('membership', 'Membership')], 'real-airportcity.webp')}

  <section class="sec" id="practices" aria-labelledby="pr-h">
    <div class="wrap">
      {head('Practices', 'Everything a business needs <span class="serif">in Ghana.</span>', 'Pick a practice, or tell us your goal on WhatsApp and we put the right team on it.', 'pr-h')}
      <div class="prac">{''.join(prac)}</div>
    </div>
  </section>

  <section class="sec" id="packages" style="padding-top:0" aria-labelledby="pk-h">
    <div class="wrap">
      {head('Packages & prices', 'Fixed scope, <span class="serif">fixed fee.</span>', 'Prices exclude government and regulator fees, and VAT where it applies. The first call is always free.', 'pk-h')}
      <div class="tabs" role="tablist" aria-label="Who are you?">{tabbtns}</div>
      {''.join(panels)}
    </div>
  </section>

  <section class="sec" id="membership" style="padding-top:0" aria-labelledby="mb-h">
    <div class="wrap">
      {head('Membership', 'Stay ahead, <span class="serif">every month.</span>', 'Most clients start free, join a forum, then move to a plan. Pay monthly with MTN MoMo, Telecel Cash or AirtelTigo Money. Cancel any time.', 'mb-h')}
      <div class="tiers">{''.join(tiers)}</div>
    </div>
  </section>

  {cta('Not sure where to start? <span class="serif" style="color:var(--gold-2)">Ask us.</span>', 'A 30-minute call on WhatsApp is free. We tell you what you need, what it costs and how long it takes.',
       f'<a class="btn btn-wa" href="{E(wa(WA_JOY, "Hello Gotham Consult, I would like a free 30-minute call."))}" target="_blank" rel="noopener">{WA_ICON}Book a free call</a><a class="btn btn-ghost" href="/v2/about#contact">Send a message</a>')}''')

# ---------------------------------------------------------------- invest
growth = [('ICT', 30.9), ('Oil & gas', 21.4), ('Services', 8.0), ('Whole economy', 6.0), ('Industry', 4.3), ('Agriculture', 3.9)]
bars = ''.join(f'<div class="bar"><span>{E(n)}</span><i style="width:{v/30.9*100:.1f}%"></i><b>+{v:.1f}%</b></div>' for n, v in growth)
exp = [('Gold', 20.0, '#A9761F'), ('Cocoa', 3.8, '#6B4B2A'), ('Oil', 2.6, '#0F1B2D'), ('Other', 4.7, '#7C8795')]
stack = ''.join(f'<div style="flex:{v};background:{c}">{round(v/31.1*100)}%</div>' if v >= 3 else f'<div style="flex:{v};background:{c}"></div>' for n, v, c in exp)
legend = ''.join(f'<span><i style="background:{c}"></i>{n} <b>${v:.1f}bn</b></span>' for n, v, c in exp)
RL = {'strong': ('Strong', 'teal'), 'sel': ('Selective', ''), 'watch': ('Watch', 'gray')}
IMG = {'tech': 'tech.webp', 'cocoa': 'cocoa.webp', 'solar': 'solar.webp', 'port': 'port.webp'}
sect = []
for s in D['sectors']:
    lbl, cls = RL[s['r']]
    sect.append(f'''<div class="box sector rv"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3>{E(s['t'])}</h3><span class="pill {cls}">{lbl}</span></div>
        <div class="m">{E(s['m'])}</div><div class="ms">{E(s['ms'])}</div><p style="margin:0">{E(s['p'])}</p><div class="risk"><b>Risk:</b> {E(s['risk'])}</div></div>''')
L = D['lenses']; LK = [('global', 'Global'), ('de', 'Germany'), ('dk', 'Denmark & Nordics'), ('uk', 'United Kingdom')]
lbtn = ''.join(f'<button type="button" role="tab" id="t-l{k}" aria-controls="p-l{k}" aria-selected="{str(i==0).lower()}" tabindex="{0 if i==0 else -1}">{E(n)}</button>' for i, (k, n) in enumerate(LK))
lpan = ''.join(f'''<div class="tabpanel box lens-panel" role="tabpanel" id="p-l{k}" aria-labelledby="t-l{k}"{'' if i==0 else ' hidden'}>
        <h3>{E(L[k]['h'])}</h3><p style="font-size:16px">{E(L[k]['p'])}</p><div class="chips">{''.join(f'<span>{E(c)}</span>' for c in L[k]['i'])}</div></div>''' for i, (k, n) in enumerate(LK))
gipa = re.findall(r'<li>(.*?)</li>', P['inv']['extra'], re.S)
INV_H1 = "Today's Ghana, <span class='serif'>in numbers.</span>"
WHY_LEAD = "Direct links to Europe's financial centres, the Gulf, Asia and a continental market of 1.3 billion people."
invest = page(f'''{phero('Invest in Ghana', 'Invest in Ghana · September 2026', INV_H1,
    'After the 2022–23 debt crisis, Ghana is growing again: inflation at a multi-year low, record exports and investment flows rising. Here is the picture for investors.',
    [('numbers', 'Numbers'), ('why', 'Why Ghana'), ('sectors', 'Sectors'), ('country', 'Your country'), ('gipa', 'GIPA Act 2026'), ('desk', 'Investor packages')], 'real-bog.webp')}

  <section class="sec nums" id="numbers" aria-labelledby="n-h">
    <div class="wrap">
      <h2 id="n-h" class="sr-only">Key numbers</h2>
      <div class="ngrid">
        <div><b data-count="6.2" data-suffix="%">6.2%</b><span>GDP growth, H1 2026 · Q2: 6.0%</span></div>
        <div><b data-count="5.0" data-suffix="%">5.0%</b><span>Inflation, Aug 2026 · policy rate 14%</span></div>
        <div><b data-count="13.6" data-prefix="$" data-suffix="bn">$13.6bn</b><span>Trade surplus, 2025 · reserves $13.8bn</span></div>
        <div><b data-count="2.6" data-prefix="$" data-suffix="bn">$2.6bn</b><span>New FDI registered, 2025 · 245 projects</span></div>
      </div>
      <p class="src">Ghana Statistical Service (Q2 2026 GDP, Aug 2026 CPI), Bank of Ghana (July 2026 MPC, 2025 trade data), GIPC (2025 FDI report).</p>
    </div>
  </section>

  <section class="sec" id="why" aria-labelledby="w-h">
    <div class="wrap">
      {head('Why Ghana', 'Accra, <span class="serif">connected.</span>', WHY_LEAD, 'w-h')}
      <div class="facts">
        <div class="fact rv"><img src="/img/real-bog.webp" alt="Bank of Ghana, High Street, Accra" loading="lazy"><b>GMT all year</b><span>Same time as London, one hour from Berlin and Copenhagen</span></div>
        <div class="fact rv"><img src="/img/real-airportcity.webp" alt="Airport City, Accra's business district" loading="lazy"><b>English-speaking</b><span>Common-law system, a stable democracy since 1992</span></div>
        <div class="fact rv"><img src="/img/real-blackstar.webp" alt="Black Star Gate, Independence Square, Accra" loading="lazy"><b>AfCFTA HQ</b><span>Accra hosts the secretariat of Africa's single market</span></div>
        <div class="fact rv"><img src="/img/real-tema.webp" alt="Tema Port, Ghana's main container gateway" loading="lazy"><b>Act 1173</b><span>No general minimum capital, except trading companies</span></div>
      </div>
    </div>
  </section>

  <section class="sec" id="sectors" style="padding-top:0" aria-labelledby="s-h">
    <div class="wrap">
      {head('Where the growth is', 'Sectors <span class="serif">to watch.</span>', 'Year-on-year growth by sector, Q2 2026, and what Ghana sells.', 's-h')}
      <div class="grid2" style="margin-bottom:14px">
        <div class="box rv"><h3>Growth by sector, Q2 2026</h3><div class="bars" style="margin-top:14px">{bars}</div></div>
        <div class="box rv"><h3>What Ghana sells</h3><p>Exports 2025: $31.1bn, up from $19.1bn in 2024.</p><div class="stack" role="img" aria-label="Exports 2025: gold 20.0bn, cocoa 3.8bn, oil 2.6bn, other 4.7bn dollars">{stack}</div><div class="legend">{legend}</div>
          <p style="margin-top:16px">New FDI registered with GIPC rose from <b>$0.65bn</b> in 2024 to <b>$2.6bn</b> in 2025.</p></div>
      </div>
      <div class="grid3">{''.join(sect)}</div>
      <p class="fine" style="margin-top:14px">Outlook ratings are Gotham Consult's view for discussion, not investment advice.</p>
    </div>
  </section>

  <section class="sec" id="country" style="padding-top:0" aria-labelledby="c-h">
    <div class="wrap">
      {head('Sector outlook', 'Where to look next, <span class="serif">from where you are.</span>', '', 'c-h')}
      <div class="tabs" role="tablist" aria-label="Your country">{lbtn}</div>
      {lpan}
    </div>
  </section>

  <section class="sec" id="gipa" style="padding-top:0" aria-labelledby="g-h">
    <div class="wrap">
      <div class="box dark rv" style="padding:clamp(24px,4vw,44px)">
        <p class="eyebrow" style="color:var(--gold-2)">GIPA Act 2026 (Act 1173)</p>
        <h2 id="g-h" style="font-size:clamp(28px,4vw,44px);margin-bottom:18px">What actually <span class="serif" style="color:var(--gold-2)">changed.</span></h2>
        {ticks(gipa)}
        <p class="fine" style="margin-top:16px">Summary only, current at 24 September 2026, and not legal advice. We confirm every detail against the Act and with the Authority for your case.</p>
      </div>
    </div>
  </section>

  <section class="sec" id="desk" style="padding-top:0" aria-labelledby="d-h">
    <div class="wrap">
      {head('Investor packages', 'Enter Ghana with <span class="serif">a local desk.</span>', E(P['inv']['p']), 'd-h')}
      {prices(P['inv']['pk'], WA_UFFE, 'inv')}
      {flow(P['inv']['flow'])}
    </div>
  </section>

  {cta('Talk to our <span class="serif" style="color:var(--gold-2)">investor desk.</span>', 'Uffe Carlson, Carlson Capital Ltd. English, Danish and other Nordic languages, German and French.',
       f'<a class="btn btn-wa" href="{E(wa(WA_UFFE, "Hello Uffe, I would like a Ghana briefing."))}" target="_blank" rel="noopener">{WA_ICON}WhatsApp +233 55 239 5548</a><a class="btn btn-ghost" href="tel:+233552395548">Call the investor desk</a>')}''')

# ---------------------------------------------------------------- mining
watch = re.findall(r'<li>(.*?)</li>', P['min']['extra'], re.S)
chan = re.findall(r'<span>(.*?)</span>', P['min']['extra'])
mining = page(f'''{phero('Mining', 'Mining & critical minerals', 'Geology first. <span class="serif">Every step on the record.</span>',
    'Gotham Consult and its partner Carlson Capital Ltd support mining investors from first screening to production. Field geology, our own digital platforms and formal licensing work sit in one team, so you get evidence you can check before you commit capital.',
    [('record', 'Track record'), ('tech', 'Our technology'), ('mpk', 'Packages'), ('watch', 'Regulatory watch')], 'solar.webp')}

  <section class="sec nums" id="record" aria-labelledby="r-h">
    <div class="wrap">
      <h2 id="r-h" class="sr-only">Mining in Ghana</h2>
      <div class="bignums">
        <div class="rv"><b>$20.0bn</b><span>Ghana gold exports, 2025: Africa's largest producer</span></div>
        <div class="rv"><b>2026</b><span>First lithium mining lease ratified, March 2026</span></div>
        <div class="rv"><b>3–4 weeks</b><span>From mandate to a written concession screening report</span></div>
      </div>
    </div>
  </section>

  <section class="sec" id="tech" aria-labelledby="t-h">
    <div class="wrap">
      {head('Our technology', 'Evidence you can <span class="serif">check.</span>', 'Two in-house platforms from Carlson Capital Ltd keep field data, licences and documents on one record.', 't-h')}
      <div class="platform">
        <div class="box dark rv"><span class="status">Field intelligence · pilot phase 2026</span><h3 style="font-size:28px;margin:8px 0">TERRA</h3>
          <p>Our voice-first Android app for geological field work. Field teams capture readings by speaking, even offline, and every observation is checked on the spot.</p>
          {ticks(['GPS position with a stated accuracy tier, calibrated photos and a timestamp on every reading', 'Sensor kits from village-scale to geologist-grade, linked by USB-C or Bluetooth', 'Review queue and audit trail, so each data point can be traced', 'Supports JORC Table 1 evidence capture; a Competent Person still signs off'])}</div>
        <div class="box dark rv"><span class="status">Geospatial platform · built, 134 automated tests</span><h3 style="font-size:28px;margin:8px 0">Afri-MINEX</h3>
          <p>Our secure web platform that maps concessions, licence boundaries and field data in one place, so investors, partners and reviewers look at the same record.</p>
          {ticks(['Concession and licence overlays with site data from TERRA', 'Multi-factor sign-in and cryptographically signed documents', 'Structured logs of who viewed or changed what, and when', 'Provenance records for buyers and responsible-sourcing checks'])}</div>
      </div>
    </div>
  </section>

  <section class="sec" id="mpk" style="padding-top:0" aria-labelledby="m-h">
    <div class="wrap">
      {head('Packages', 'From concession <span class="serif">to production.</span>', E(P['min']['p']), 'm-h')}
      {prices(P['min']['pk'], WA_UFFE, 'min')}
      {flow(P['min']['flow'])}
    </div>
  </section>

  <section class="sec" id="watch" style="padding-top:0" aria-labelledby="wt-h">
    <div class="wrap">
      <div class="box rv" style="padding:clamp(24px,4vw,44px)">
        <p class="eyebrow">Regulatory watch · September 2026</p>
        <h2 id="wt-h" style="font-size:clamp(26px,3.6vw,40px);margin-bottom:16px">What investors <span class="serif">need to know.</span></h2>
        {ticks(watch)}
        <div class="chips" style="margin-top:16px">{''.join(f'<span>{E(c)}</span>' for c in chan)}</div>
        <p class="note-strip">We work with these institutions through their formal application and consultation processes. Fees are for preparation and delivery, never for access or approvals. Any personal connection of our team to a public office is disclosed, and that person steps aside from the matter.</p>
      </div>
    </div>
  </section>

  {cta('Talk to a <span class="serif" style="color:var(--gold-2)">geologist.</span>', 'Uffe Carlson, Carlson Capital Ltd: field geology and 25 years of project delivery across Africa and Europe.',
       f'<a class="btn btn-wa" href="{E(wa(WA_UFFE, "Hello Uffe, I would like to discuss a mining project in Ghana."))}" target="_blank" rel="noopener">{WA_ICON}WhatsApp Uffe Carlson</a><a class="btn btn-ghost" href="tel:+233552395548">Call +233 55 239 5548</a>')}''')

# ---------------------------------------------------------------- forums
SECT = ['Mining & minerals', 'Energy & power', 'Agriculture & cocoa', 'Finance & fintech', 'Technology & AI', 'Real estate & construction', 'Trade & logistics', 'Manufacturing', 'Health & education', 'Creative & tourism', 'Public sector / NGO', 'Other']
spt = ''.join(f'<div class="box rv"><h3>{E(t)}</h3><p style="margin:0">{E(d)}</p></div>' for k, t, d in D['SPON_TIERS'])
forums = page(f'''{phero('Forums', 'Forums & seminars', 'Meet the people <span class="serif">who move deals.</span>',
    'Regular forums for SME owners, investors and partners. Register in a minute: we send the price and mobile money details to your WhatsApp, and confirm your seat as soon as payment arrives.',
    [('upcoming', 'Upcoming'), ('recap', 'Watch'), ('brief', 'Weekly brief'), ('sponsor', 'Become a partner')], 'forum.webp')}

  <section class="sec" id="upcoming" aria-labelledby="u-h">
    <div class="wrap">
      {head('Upcoming', 'Your next <span class="serif">room.</span>', 'Some forums are open, some by invitation. Invitation-only forums confirm your place after a short review.', 'u-h')}
      <div class="events" id="events">
        <article class="event"><div class="cov" style="background-image:url(/img/forum.webp)"><div class="date"><b>24</b><span>Oct</span></div></div>
          <div class="body"><h3>SMEs at the Centre: inclusive partnerships under the GIPA Act</h3><div class="meta"><span class="pill">By invitation</span><span class="pill teal">Free</span><span class="pill gray">Tang Palace Hotel, Accra</span></div>
          <p>Government, investors and business owners in one room. Seats are limited.</p><a class="btn btn-gold" href="/register?e=F1">Request your invitation <span class="arrow">→</span></a></div></article>
      </div>
      <p class="fine" style="margin-top:16px">Past forum: Business Pitch Deck Round Table 2026 · Saturday 23 May 2026 · East Legon, Accra</p>
    </div>
  </section>

  <section class="sec" id="recap" style="padding-top:0" aria-labelledby="v-h">
    <div class="wrap">
      {head('Watch', 'The Business <span class="serif">Boot Camp.</span>', 'Real footage from our own programme in Accra: founders, advisers and a full room.', 'v-h')}
      <div class="video rv"><video controls playsinline preload="none" poster="/img/recap.webp"><source src="/img/recap.mp4" type="video/mp4"></video></div>
      <p class="fine" style="margin-top:10px">Photos and video: Gotham Consult. If you appear here and would rather not, email us and we remove it.</p>
    </div>
  </section>

  <section class="sec" id="brief" style="padding-top:0" aria-labelledby="b-h">
    <div class="wrap">
      <div class="box dark rv grid2" style="padding:clamp(24px,4vw,44px);gap:28px;align-items:start">
        <div><p class="eyebrow" style="color:var(--gold-2)">Ghana Business Brief</p><h2 id="b-h" style="font-size:clamp(28px,4vw,44px)">Free, weekly, <span class="serif" style="color:var(--gold-2)">written for people who run things.</span></h2>
          <p style="margin-top:14px;font-size:16px">One short message: the rule that changed this week, the grant or facility now open, and the next room worth being in. No sales pitch, unsubscribe any time.</p></div>
        <form class="form" id="briefF" novalidate>
          <div class="row2"><label>Your name<input id="b-name" autocomplete="name" required></label><label>Company<input id="b-co" autocomplete="organization" required></label></div>
          <div class="row2"><label>Email<input id="b-em" type="email" autocomplete="email" inputmode="email" required></label><label>WhatsApp number<input id="b-ph" type="tel" autocomplete="tel" inputmode="tel" required></label></div>
          <label>Your sector<select id="b-sec"><option value="">Choose…</option>{''.join(f'<option>{E(x)}</option>' for x in SECT)}</select></label>
          <button class="btn btn-gold" type="submit">Send me the brief</button>
          <p class="msg" id="b-note" role="status"></p>
          <p class="fine">By subscribing you agree to our <a href="/privacy" style="color:inherit">privacy notice</a>. We never sell your details.</p>
        </form>
      </div>
    </div>
  </section>

  <section class="sec" id="sponsor" style="padding-top:0" aria-labelledby="sp-h">
    <div class="wrap">
      {head('Become a partner', 'Put your business <span class="serif">in front of the room.</span>', 'Every forum fills a room with business owners, investors and institutions who are actively spending. Sponsorship is not a logo on a banner: you get the floor, the introductions and the delegate list, within data protection rules.', 'sp-h')}
      <div class="grid2" style="align-items:start">
        <div class="grid2">{spt}</div>
        <form class="form box" id="sponF" novalidate>
          <h3>Ask for the pack</h3>
          <div class="row2"><label>Company<input name="company" autocomplete="organization" required></label><label>Your name<input name="contact_name" autocomplete="name"></label></div>
          <div class="row2"><label>Email<input name="email" type="email" autocomplete="email" inputmode="email" required></label><label>Phone or WhatsApp<input name="phone" type="tel" autocomplete="tel" inputmode="tel"></label></div>
          <label>Interested in<select name="tier"><option value="">Not sure yet, send me everything</option><option value="headline">Headline sponsor</option><option value="partner">Partner</option><option value="supporting">Supporting</option><option value="listing">Directory listing</option></select></label>
          <label>Anything we should know<textarea name="message" placeholder="Sector, what you want out of it, which forum"></textarea></label>
          <button class="btn btn-dark" type="submit">Send <span class="arrow">→</span></button>
          <p class="msg" id="sponMsg" role="status">We reply within two working days. Or WhatsApp +233 55 239 5548.</p>
        </form>
      </div>
    </div>
  </section>''')

# ---------------------------------------------------------------- about + contact
TOPICS = ['General enquiry'] + [s['t'] for s in D['services']] + ['Invest in Ghana briefing', 'Forums & sponsorship']
VALUES = ticks(['We charge for preparation and delivery, never for access or government decisions.', 'No SME left behind: inclusive programmes for women, youth and persons with disabilities.', "Your data is handled under Ghana's Data Protection Act, 2012 (Act 843), and to GDPR standards for clients in the EU and UK."])
about = page(f'''{phero('About', 'About Gotham Consult', 'A bridge between business, government <span class="serif">and global partners.</span>',
    'An Accra-based business development and international projects consultancy, founded in 2018. We facilitate investment between the private sector and governments across Ghana, Nigeria, the UK, the US and Europe.',
    [('founder', 'Founder'), ('carlson', 'Carlson Capital'), ('partners', 'Partners'), ('contact', 'Contact')])}

  <section class="sec" id="founder" aria-labelledby="f-h">
    <div class="wrap">
      <div class="founder rv">
        <img src="/img/joy-gipc.webp" alt="Joy Anthony Preston at the GIPC Ghana Club 100 Awards" loading="lazy">
        <div class="txt">
          <p class="eyebrow">Founder &amp; Development Partner</p>
          <h2 id="f-h" style="font-size:clamp(30px,4vw,46px)">Joy Anthony <span class="serif">Preston.</span></h2>
          <p class="lead" style="margin-top:14px">MSc Strategic Leadership and Governance. A decade of experience facilitating high-value partnerships. She founded the Global Genius Foundation and convenes the Gotham Consult Business Seminar, working with a team of senior consultants in finance, energy, mining and technology.</p>
          <div class="statrow"><div><b>2018</b><span>Founded in Accra</span></div><div><b>Boot Camp</b><span>Flagship SME programme</span></div><div><b>5</b><span>Markets: GH, NG, UK, US, EU</span></div></div>
          {VALUES}
        </div>
      </div>
    </div>
  </section>

  <section class="sec" id="carlson" style="padding-top:0" aria-labelledby="cc-h">
    <div class="wrap">
      <div class="box dark rv" style="padding:clamp(24px,4vw,48px);background:radial-gradient(70% 90% at 100% 0%,rgba(240,190,90,.2),transparent 60%),radial-gradient(60% 80% at 0% 100%,rgba(47,181,148,.2),transparent 60%),var(--navy)">
        <p class="eyebrow" style="color:var(--gold-2)">Strategic partner</p>
        <h2 id="cc-h" style="font-size:clamp(30px,4.4vw,50px)">Carlson Capital <span class="serif" style="color:var(--gold-2)">Ltd.</span></h2>
        <p class="lead" style="color:rgba(255,255,255,.76);margin:14px 0 18px">Gotham Consult delivers mining, technology, fintech and investor services together with Carlson Capital Ltd, a company registered in Ghana. Carlson Capital brings field geology, in-house software platforms and 25 years of project delivery across Africa and Europe.</p>
        <div class="chips"><span>TERRA field app</span><span>Afri-MINEX geospatial platform</span><span>Universal Credit Hub</span><span>Field geology</span></div>
        <div class="cta-row" style="justify-content:flex-start;margin-top:22px"><a class="btn btn-gold" href="/v2/mining">Mining with Carlson Capital <span class="arrow">→</span></a><a class="btn btn-ghost" href="{E(wa(WA_UFFE, 'Hello Uffe, I would like to talk to Carlson Capital.'))}" target="_blank" rel="noopener">WhatsApp Uffe Carlson</a></div>
      </div>
    </div>
  </section>

  <section class="sec" id="partners" style="padding-top:0" aria-labelledby="pt-h">
    <div class="wrap">
      {head('Partners', 'The companies <span class="serif">behind the room.</span>', 'Mining houses, hotels, banks, law firms and logistics operators sit alongside the SMEs they serve.', 'pt-h')}
      <div class="wall" id="wall"><p class="fine">Partner logos appear here as they are confirmed.</p></div>
      <div style="margin-top:22px"><a class="btn btn-line" href="/v2/forums#sponsor">Become a partner <span class="arrow">→</span></a></div>
    </div>
  </section>

  <section class="sec" id="contact" style="padding-top:0" aria-labelledby="ct-h">
    <div class="wrap">
      <div class="contact">
        <div class="box dark rv">
          <p class="eyebrow" style="color:var(--gold-2)">Contact</p>
          <h2 id="ct-h" style="font-size:clamp(30px,4vw,44px);margin-bottom:10px">Let's build <span class="serif" style="color:var(--gold-2)">together.</span></h2>
          <p>We reply within one working day. Office hours Monday–Friday, 9:00–17:00, Accra.</p>
          <a class="cline" href="https://wa.me/{WA_JOY}" target="_blank" rel="noopener"><i>{WA_ICON}</i><span><small>WhatsApp · Gotham Consult</small><b>+233 55 041 6627</b></span></a>
          <a class="cline" href="tel:+233550416627"><i><svg class="icon"><use href="#i-phone"/></svg></i><span><small>Phone</small><b>055 041 6627</b></span></a>
          <a class="cline" href="mailto:info@gothamconsult.com"><i><svg class="icon"><use href="#i-mail"/></svg></i><span><small>Email</small><b>info@gothamconsult.com</b></span></a>
          <a class="cline" href="https://wa.me/{WA_UFFE}" target="_blank" rel="noopener"><i><svg class="icon"><use href="#i-chart"/></svg></i><span><small>Investor, mining &amp; international desk · Uffe Carlson, Carlson Capital Ltd</small><b>+233 55 239 5548</b></span></a>
        </div>
        <form class="form box rv" id="contactF" novalidate>
          <h3>Send us a message</h3>
          <div class="row2"><label>Your name<input id="c-name" autocomplete="name" required></label><label>Company<input id="c-co" autocomplete="organization"></label></div>
          <label>What do you need?<select id="c-topic">{''.join(f'<option>{E(t)}</option>' for t in TOPICS)}</select></label>
          <label>Message<textarea id="c-msg" placeholder="A few lines about your business or project"></textarea></label>
          <div class="cta-row" style="justify-content:flex-start"><button class="btn btn-wa" type="submit">{WA_ICON}Send on WhatsApp</button><button class="btn btn-line" type="button" id="c-mail">Send by email</button></div>
          <p class="fine">We use your details only to reply to you, under Ghana's Data Protection Act, 2012 (Act 843). See our <a href="/privacy" style="color:inherit">privacy notice</a>.</p>
        </form>
      </div>
    </div>
  </section>''')

os.makedirs(OUT, exist_ok=True)
for n, s in [('services', services), ('invest', invest), ('mining', mining), ('forums', forums), ('about', about)]:
    open(f'{OUT}/{n}.html', 'w').write(s + '\n'); print(n, len(s))
