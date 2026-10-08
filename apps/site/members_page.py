"""Membership on the website: /membership (plans and prices, six languages, indexed) and /account (sign-in and the
member's own page, six languages, not indexed). The server side is apps/crm/members.js.
Text: English here, translations in apps/crm/site-i18n/<lang>.json (keyed by the English text), numbers and dates via
report_page.Loc so they follow each language's conventions."""
import os, json, re
import report_page as RP

HERE = os.path.dirname(os.path.abspath(__file__))
CRM = os.path.join(HERE, '..', 'crm')
PRODUCTS = json.load(open(os.path.join(CRM, 'member-products.json'), encoding='utf-8'))['products']
PERMITS = json.load(open(os.path.join(CRM, 'compliance-rules.json'), encoding='utf-8')).get('permit_suggestions', [])
RULES = json.load(open(os.path.join(CRM, 'compliance-rules.json'), encoding='utf-8'))['rules']
esc = RP.esc
SECTORS = [('macro', 'Economy and investment climate'), ('mining', 'Gold, mining and critical minerals'), ('energy', 'Oil, gas and power'),
           ('agri', 'Cocoa and agribusiness'), ('industry', 'ICT, industry and real estate')]


class Loc(RP.Loc):
    def __init__(self, lang='en'):
        super().__init__(lang)
        fp = os.path.join(CRM, 'site-i18n', f'{self.lang}.json')
        self.d = json.load(open(fp, encoding='utf-8'))['strings'] if self.lang != 'en' and os.path.exists(fp) else {}


def ghs(L, n):
    x = L.n(n, 0)
    return {'fr': f'{x}\u00a0GHS', 'de': f'{x}\u00a0GHS', 'es': f'{x}\u00a0GHS', 'ar': f'{x} سيدي', 'zh': f'{x}塞地'}.get(L.lang, f'GHS {x}')


CSS = '''<style>
.nw{white-space:nowrap;unicode-bidi:isolate}
.mb-hero .lead{max-width:62ch}
.mb-plans{display:grid;gap:16px}
@media(min-width:960px){.mb-plans{grid-template-columns:repeat(3,minmax(0,1fr))}}
.mb-plan{padding:24px;display:flex;flex-direction:column;gap:10px}
.mb-plan h3{margin:0;font-size:20px}.mb-plan .amt{font:800 30px/1.1 var(--font);color:var(--ink)}.mb-plan .amt small{font-size:14px;font-weight:600;color:var(--mute)}
.mb-plan .alt{margin:0;color:var(--mute);font-size:14px}
.mb-plan ul{margin:6px 0 10px;padding-inline-start:18px;display:grid;gap:7px;font-size:15px;line-height:1.5}
.mb-plan .btn{margin-top:auto;align-self:flex-start}
.mb-plan.hot{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold)}
.mb-tag{display:inline-block;font-size:11.5px;font-weight:700;padding:2px 10px;border-radius:999px;background:#FBF1DC;color:#8A5A0B;align-self:flex-start}
.mb-svcs{display:grid;gap:14px}
@media(min-width:860px){.mb-svcs{grid-template-columns:repeat(3,minmax(0,1fr))}}
.mb-svc{padding:22px;display:flex;flex-direction:column;gap:8px}.mb-svc h3{margin:0;font-size:18px}.mb-svc p{margin:0;color:var(--mute);font-size:14.5px;line-height:1.55}
.mb-svc .amt{font:700 22px var(--font);color:var(--ink)}
.mb-faq details{border-bottom:1px solid var(--line);padding:6px 0}.mb-faq summary{cursor:pointer;min-height:48px;display:flex;align-items:center;font-weight:600}
.mb-faq p{margin:0 0 14px;color:var(--mute);line-height:1.6}
.mb-note{color:var(--mute);font-size:14px;margin-top:14px}
.ac-wrap{max-width:980px}
.ac-card{padding:22px;margin-bottom:16px}
.ac-card h2{font-size:22px;margin:0 0 12px}.ac-card h3{font-size:17px;margin:18px 0 8px}
.ac-form{display:grid;gap:12px;grid-template-columns:minmax(0,1fr)}
@media(min-width:760px){.ac-form .two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}}
.ac-form label{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:600}
.ac-form input,.ac-form select,.ac-form textarea{font:inherit;font-weight:400;min-height:46px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:#fff;color:var(--ink)}
.ac-form .chk{flex-direction:row;align-items:flex-start;font-weight:400;color:var(--mute)}.ac-form .chk input{min-height:0;width:20px;height:20px;margin-top:2px;flex:none}
.ac-secs{display:flex;flex-wrap:wrap;gap:8px;border:0;padding:0;margin:0;min-width:0}.ac-secs legend{font-size:14px;font-weight:600;margin-bottom:6px;width:100%}
.ac-secs label{flex-direction:row;align-items:center;gap:8px;min-height:44px;padding:0 14px;border:1px solid var(--line);border-radius:999px;background:#fff;font-weight:600}
.ac-secs input{min-height:0;width:18px;height:18px;margin:0}
.ac-tabs{display:flex;gap:6px;overflow-x:auto;margin:0 0 16px;padding:0;list-style:none;scrollbar-width:none}
.ac-tabs button{min-height:44px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:#fff;font:600 14px var(--font);color:var(--ink);cursor:pointer;white-space:nowrap}
.ac-tabs button[aria-selected=true]{background:#0F1B2D;color:#fff;border-color:#0F1B2D}
.ac-msg{font-weight:600;margin:6px 0 0;min-height:1.2em}
.ac-list{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.ac-list li{border:1px solid var(--line);border-radius:14px;background:#fff;padding:14px 16px;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;justify-content:space-between}
.ac-list b{color:var(--ink)}.ac-list .m{color:var(--mute);font-size:14px}
.ac-due{font:700 15px var(--font);color:#9A6A12;min-width:96px}
.ac-pill{display:inline-block;font-size:12px;font-weight:700;padding:2px 10px;border-radius:999px;background:#EEF0F3;color:#4B5563}
.ac-pill.ok{background:#E3F1E7;color:#1E6B3A}.ac-pill.wait{background:#FBF1DC;color:#8A5A0B}
.ac-lock{border:1px dashed var(--gold);background:#FFFBF2;border-radius:14px;padding:14px 16px;margin-top:10px}
.ac-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.ac-hp{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);opacity:0}
html[dir="rtl"] .ac-form input[type=email]{direction:ltr;text-align:right}
</style>'''


def plans(L, pre):
    t = L.t; P = PRODUCTS
    def card(cls, tag, title, price, alt, items, href, cta):
        return (f'<div class="box mb-plan{cls}">{f"<span class=mb-tag>{esc(t(tag))}</span>" if tag else ""}<h3>{esc(t(title))}</h3><div class="amt">{price}</div>'
                + (f'<p class="alt">{alt}</p>' if alt else '') + '<ul>' + ''.join(f'<li>{esc(t(i))}</li>' for i in items) + f'</ul><a class="btn {"btn-gold" if cls else "btn-line"}" href="{pre}/account{href}">{esc(t(cta))} <span class="arrow">→</span></a></div>')
    per = lambda k, unit: f'<span data-price="{k}">{esc(ghs(L, P[k]["price"]))}</span> <small>{esc(t(unit))}</small>'
    return ('<div class="mb-plans">'
        + card('', 'Start here', 'Free account', f'{esc(ghs(L, 0))}', '', ['Sector alerts every Monday, in your language', 'The Ghana Investment Report and its PDF in six languages',
               'A preview of your company’s next filing deadlines', 'Event invitations and recordings'], '#signup', 'Create a free account')
        + card(' hot', 'For international investors', 'Pro membership', per('pro_month', 'per month'), t('or {price} per year').format(price=f'<span data-price="pro_year">{esc(ghs(L, P["pro_year"]["price"]))}</span>'),
               ['Everything in the free account', 'A monthly briefing per sector from our team', 'The Excel data pack: every figure with its source, our forecasts and 10 years of history', 'One question to our team every month'],
               '?buy=pro_year#signup', 'Become a Pro member')
        + card(' hot', 'For Ghana businesses', 'Compliance calendar', per('compliance_month', 'per company, per month'), t('or {price} per year').format(price=f'<span data-price="compliance_year">{esc(ghs(L, P["compliance_year"]["price"]))}</span>'),
               ['Every filing and payment date for your company: PAYE, SSNIT, VAT, income tax, the Registrar and permits', 'Reminders 7 days and 1 day before each deadline',
                '“We file it for you” in one click', 'Your own page with case updates, documents and invoices'], '?buy=compliance_year#signup', 'Protect my company')
        + '</div>')


def nb(x):
    """Escaped text with the brand kept on one line and isolated, so Arabic lines never split or reorder it."""
    return esc(x).replace('Gotham Consult', '<bdi class="nw">Gotham Consult</bdi>')


def services(L, pre):
    t = L.t; P = PRODUCTS
    def s(k, who, title, text, frm=False):
        price = f'{esc(t("from") + " ") if frm else ""}<span data-price="{k}">{esc(ghs(L, P[k]["price"]))}</span>'
        return f'<div class="box mb-svc"><span class="mb-tag">{esc(t(who))}</span><h3>{esc(t(title))}</h3><div class="amt">{price}</div><p>{esc(t(text))}</p><p><a href="{pre}/account?buy={k}#signup">{esc(t("Book now"))} <span class="arrow">→</span></a></p></div>'
    return ('<div class="mb-svcs">'
        + s('call', 'For international investors', 'Expert call, 30 minutes', 'Talk to Uffe Carlson or Joy Preston about entering Ghana, a sector, a deal or a problem. You choose the times; we confirm within one working day.')
        + s('check', 'For international investors', 'Counterparty check', 'Before you sign: who owns the company, is it registered and filing, and is it in court. From the official registers, in a short written report.', True)
        + s('filing', 'For Ghana businesses', 'We file it for you', 'One return or payment prepared and filed for your company: PAYE, SSNIT, VAT or the annual return, by qualified professionals we work with.')
        + '</div>')


def faq(L):
    t = L.t
    qs = [('How do I pay?', 'Every order is an invoice in cedis with VAT and levies (20%) added. You pay on the invoice page by mobile money, card or bank transfer. Your plan starts as soon as the payment arrives.'),
          ('Do you charge my card automatically?', 'No. Seven days before a plan ends we send a renewal invoice. If you do not pay it, the plan simply ends.'),
          ('Is this legal, tax or investment advice?', 'The alerts, the report and the calendar are information. Filings we do for you are prepared by qualified professionals. We do not give investment advice.'),
          ('Where do the deadlines come from?', 'From the Ghana Revenue Authority, SSNIT, the Office of the Registrar of Companies and Ghana Immigration Service. Each deadline links to its official source.'),
          ('What happens to my data?', 'We keep your details to run your account and send what you asked for, under Ghana’s Data Protection Act, 2012 (Act 843). You can stop the emails with one click and close the account at any time.')]
    return '<div class="mb-faq">' + ''.join(f'<details><summary>{esc(t(q))}</summary><p>{esc(t(a))}</p></details>' for q, a in qs) + '</div>'


def render_membership(lang='en', L=None):
    L = L or Loc(lang); t = L.t; pre = '' if L.lang == 'en' else '/' + L.lang
    return (CSS + '\n<!--#top-->\n<main id="main" data-no-tr>\n'
        '<section class="phero mb-hero" aria-labelledby="h1"><img class="bgimg" src="/img/real-airportcity.webp" alt="" fetchpriority="high"><div class="wrap">'
        f'<p class="eyebrow">{nb(t("Gotham Consult membership"))}</p>'
        f'<h1 id="h1">{esc(t("Ghana, handled."))} <span class="serif">{nb(t("Join Gotham Consult."))}</span></h1>'
        f'<p class="lead">{esc(t("A free account for the news that matters to your sector. Paid services when you need us: the compliance calendar for your company, expert calls and checks on partners."))}</p>'
        f'<div class="hero-cta" style="margin-top:22px"><a class="btn btn-gold" href="{pre}/account#signup">{esc(t("Create a free account"))} <span class="arrow">→</span></a> '
        f'<a class="btn btn-line" href="#plans">{esc(t("See plans and prices"))}</a></div></div></section>\n'
        f'<section class="sec" id="plans" aria-labelledby="pl-h"><div class="wrap"><div class="sec-head split"><div><p class="eyebrow">{esc(t("Plans"))}</p><h2 id="pl-h">{esc(t("Start free. Pay when it saves you time."))}</h2></div>'
        f'<p class="lead">{esc(t("Prices in cedis, before VAT and levies. No contract and no automatic card charges."))}</p></div>{plans(L, pre)}</div></section>\n'
        f'<section class="sec" id="services" aria-labelledby="sv-h"><div class="wrap"><div class="sec-head"><p class="eyebrow">{esc(t("On demand"))}</p><h2 id="sv-h">{esc(t("Book us for one job"))}</h2></div>{services(L, pre)}</div></section>\n'
        f'<section class="sec" id="faq" aria-labelledby="fq-h"><div class="wrap"><div class="sec-head"><p class="eyebrow">{esc(t("Questions"))}</p><h2 id="fq-h">{esc(t("Good to know"))}</h2></div>{faq(L)}'
        f'<p class="mb-note">{esc(t("Gotham Consult, Accra. Prepared and run by Uffe Carlson and Joy Preston."))} <a href="mailto:info@gothamconsult.com">info@gothamconsult.com</a></p></div></section>\n'
        '</main>\n<!--#bottom-->\n' + PRICE_JS)


PRICE_JS = '''<script>(function(){fetch("/api/member/prices").then(function(r){return r.ok?r.json():null}).then(function(j){if(!j||!j.prices)return;
document.querySelectorAll("[data-price]").forEach(function(el){var v=j.prices[el.getAttribute("data-price")];if(!(v>0))return;var t=el.textContent,n=Math.round(v);
el.textContent=t.replace(/[\\d][\\d.,\\u202f\\u00a0]*/,function(m){var sep=/\\d\\.\\d{3}\\b/.test(m)?".":/\\u202f/.test(m)?"\\u202f":/,\\d{3}/.test(m)?",":"";return sep?n.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g,sep):String(n)})})}).catch(function(){})})();</script>
'''


# ---------- /account: the member's page (JavaScript app over /api/member/*) ----------
UI = ['Your Gotham account', 'Create your free account', 'Already a member? We email you a sign-in link.', 'Email', 'Your name', 'Company', 'Country', 'Your sectors',
      'Email me useful news and offers from Gotham Consult. I can unsubscribe at any time.', 'I agree that Gotham Consult keeps my details to run my account, under Ghana’s Data Protection Act, 2012 (Act 843).',
      'Create my account', 'Send me a sign-in link', 'Check your email: we sent you a sign-in link (valid 45 minutes).', 'Please add a valid email and tick the box.',
      'That sign-in link has expired or was already used. Ask for a new one below.', 'Your alerts are stopped. You can turn them back on here at any time.', 'Something went wrong. Please try again.',
      'Overview', 'My companies', 'Services', 'Orders and invoices', 'Updates', 'Pro', 'Sign out', 'Your plans', 'No paid plan yet.', 'until', 'Alerts', 'Sector alerts every Monday',
      'Save', 'Saved.', 'Language', 'Add a company', 'Company name', 'Tax ID (TIN)', 'Registration number', 'Date of incorporation', 'Financial year ends in month', 'Registered for VAT',
      'Has employees on payroll', 'Employs foreign staff (immigrant quota)', 'Permits and certificates with an expiry date', 'Name', 'Expires', 'Remind me (days before)', 'Add a row',
      'Next deadlines', 'Official source', 'Full calendar for 120 days and reminders by email: get the compliance calendar for this company.', 'more deadlines hidden', 'Get the calendar',
      'Let us file it for you', 'No deadlines in the coming weeks.', 'Order', 'What do you need?', 'Preferred days and times (Accra time)', 'Which company?', 'Continue to payment',
      'Opening the invoice…', 'Product', 'Status', 'Invoice', 'Pay now', 'Paid', 'Waiting for payment', 'Active', 'Ended', 'In progress', 'Done', 'Nothing here yet.',
      'Your monthly briefings and the data pack are here.', 'Download the Excel data pack', 'Pro gives you a monthly briefing per sector, the Excel data pack and one question to our team each month.',
      'Start renewal', 'Become a Pro member', 'Messages from our team about your cases appear here.', 'Edit', 'Delete row', 'per month', 'per year', 'Plans and prices', 'Choose', 'Updates on your cases', 'Edit company', 'Cancel']
PRODUCT_NAMES = [p['name'] for p in PRODUCTS.values()]
EXTRA = ['Gotham Consult membership: sector alerts, compliance calendar, expert calls | Gotham Consult',
         'A free account for Ghana sector alerts, and paid services when you need them: the compliance calendar for your company, expert calls, counterparty checks and filings. Prices in cedis.',
         'Your account | Gotham Consult', 'Your sign-in link for Gotham Consult', 'Sign in to your Gotham account',
         'Click the button to sign in. The link works once, for 45 minutes. If you did not ask for it, you can ignore this email.', 'Sign in', 'Your plan is active', 'Thank you, your plan is active',
         'Open your account', 'New in the Ghana Investment Report', 'Your next deadlines', 'source', 'You get this because you chose sector alerts in your Gotham account.', 'Stop these emails',
         'Ghana this week: your Gotham alerts', 'Ghana this week', 'Deadline', 'due', 'Membership', 'Get Monday alerts when Ghana changes in your sectors.', 'Create a free account'] \
    + [r['name'] for r in RULES] + [r['how'] for r in RULES] + [p['name'] for p in PERMITS] + [p['note'] for p in PERMITS if p['note']] + [s for _, s in SECTORS] + ['Update on your case']


def render_account(lang='en', L=None):
    L = L or Loc(lang); t = L.t; pre = '' if L.lang == 'en' else '/' + L.lang
    I = {s: t(s) for s in UI + PRODUCT_NAMES}
    I['_lang'] = L.lang; I['_pre'] = pre; I['_sectors'] = [[k, t(v)] for k, v in SECTORS]; I['_permits'] = [[t(p['name']), p['lead_days']] for p in PERMITS]
    I['_rules'] = {r['name']: t(r['name']) for r in RULES}; I['_months'] = RP.MONTHS[L.lang]
    I['_products'] = {k: {'name': t(p['name']), 'months': p.get('months', 0), 'company': bool(p.get('company')), 'booking': p.get('booking', '')} for k, p in PRODUCTS.items()}
    secs = ''.join(f'<label><input type="checkbox" name="sectors" value="{k}" checked> {esc(t(v))}</label>' for k, v in SECTORS)
    return (CSS + '\n<!--#top-->\n<main id="main" data-no-tr>\n<section class="sec"><div class="wrap ac-wrap">'
        f'<p class="eyebrow">{esc(t("Membership"))}</p><h1 id="h1">{esc(t("Your Gotham account"))}</h1>'
        f'<p class="ac-msg" id="ac-top" role="status" aria-live="polite"></p>'
        '<div id="ac-out" hidden>'
        f'<div class="box ac-card" id="signup"><h2>{esc(t("Create your free account"))}</h2><form class="ac-form" id="ac-signup" novalidate>'
        f'<div class="two"><label>{esc(t("Email"))}<input name="email" type="email" autocomplete="email" inputmode="email" required maxlength="160"></label>'
        f'<label>{esc(t("Your name"))}<input name="name" autocomplete="name" maxlength="120"></label></div>'
        f'<div class="two"><label>{esc(t("Company"))}<input name="company" autocomplete="organization" maxlength="160"></label>'
        f'<label>{esc(t("Country"))}<input name="country" autocomplete="country-name" maxlength="80"></label></div>'
        f'<fieldset class="ac-secs"><legend>{esc(t("Your sectors"))}</legend>{secs}</fieldset>'
        '<label class="ac-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>'
        f'<label class="chk"><input type="checkbox" name="marketing"> {esc(t("Email me useful news and offers from Gotham Consult. I can unsubscribe at any time."))}</label>'
        f'<label class="chk"><input type="checkbox" name="consent" required> {esc(t("I agree that Gotham Consult keeps my details to run my account, under Ghana’s Data Protection Act, 2012 (Act 843)."))}</label>'
        f'<div class="ac-row"><button class="btn btn-gold" type="submit">{esc(t("Create my account"))} <span class="arrow">→</span></button></div><p class="ac-msg" id="ac-su-msg" role="status" aria-live="polite"></p></form></div>'
        f'<div class="box ac-card"><h2>{esc(t("Send me a sign-in link"))}</h2><p class="mb-note" style="margin-top:0">{esc(t("Already a member? We email you a sign-in link."))}</p>'
        f'<form class="ac-form" id="ac-link" novalidate><div class="two"><label>{esc(t("Email"))}<input name="email" type="email" autocomplete="email" inputmode="email" required maxlength="160"></label>'
        f'<div style="display:flex;align-items:flex-end"><button class="btn btn-line" type="submit">{esc(t("Send me a sign-in link"))}</button></div></div><p class="ac-msg" id="ac-ln-msg" role="status" aria-live="polite"></p></form></div>'
        f'<p class="mb-note"><a href="{pre}/membership">{esc(t("Plans and prices"))} →</a></p>'
        '</div><div id="ac-in" hidden></div></div></section></main>\n<!--#bottom-->\n'
        + ACCOUNT_JS.replace('/*I18N*/', json.dumps(I, ensure_ascii=False)))


ACCOUNT_JS = r'''<script>(function(){var I=/*I18N*/,lg=I._lang,pre=I._pre,$=function(s,r){return(r||document).querySelector(s)},E=function(t,a,c){var e=document.createElement(t);if(a)for(var k in a){if(k==="text")e.textContent=a[k];else if(k==="html")e.innerHTML=a[k];else e.setAttribute(k,a[k])}(c||[]).forEach(function(x){if(x)e.appendChild(typeof x==="string"?document.createTextNode(x):x)});return e},
T=function(s){return I[s]||s},top=$("#ac-top"),qs=new URLSearchParams(location.search),buy=qs.get("buy")||"",S=null,tab=(location.hash||"").slice(1);
function api(p,b){return fetch("/api/member/"+p,b?{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)}:{}).then(function(r){return r.json().then(function(j){return{ok:r.ok,status:r.status,j:j}})})}
function fmtDate(s){if(!s)return"";var d=new Date(s+(s.length===10?"T00:00:00Z":"")),D=d.getUTCDate(),m=I._months[d.getUTCMonth()],y=d.getUTCFullYear();return lg==="zh"?y+"年"+(d.getUTCMonth()+1)+"月"+D+"日":lg==="de"?D+". "+m+" "+y:lg==="es"?D+" de "+m+" de "+y:lg==="fr"?(D===1?"1er":D)+" "+m+" "+y:D+" "+m+" "+y}
function money(n){var x=Math.round(+n||0).toString(),g=lg==="fr"?"\u202f":(lg==="de"||lg==="es")?".":",";x=x.replace(/\B(?=(\d{3})+(?!\d))/g,g);return lg==="en"?"GHS "+x:lg==="ar"?x+" سيدي":lg==="zh"?x+"塞地":x+"\u00a0GHS"}
if(qs.get("link")==="expired")top.textContent=T("That sign-in link has expired or was already used. Ask for a new one below.");
if(qs.get("alerts")==="stopped")top.textContent=T("Your alerts are stopped. You can turn them back on here at any time.");
function out(){$("#ac-out").hidden=false;$("#ac-in").hidden=true;
 $("#ac-signup").onsubmit=function(e){e.preventDefault();var f=e.target,m=$("#ac-su-msg"),secs=[].slice.call(f.querySelectorAll("[name=sectors]:checked")).map(function(x){return x.value});
  var b={email:f.email.value.trim(),name:f.name.value,company:f.company.value,country:f.country.value,sectors:secs,updates:f.marketing.checked,consent:f.consent.checked,website:f.website.value,lang:lg,next:buy?"buy_"+buy:"",source:document.referrer.indexOf("ghana-investment-report")>-1?"report":"website"};
  if(!/^\S+@\S+\.\S+$/.test(b.email)||!b.consent){m.textContent=T("Please add a valid email and tick the box.");return}
  f.querySelector("button").disabled=true;api("signup",b).then(function(x){m.textContent=x.ok?T("Check your email: we sent you a sign-in link (valid 45 minutes)."):T("Something went wrong. Please try again.");f.querySelector("button").disabled=x.ok})};
 $("#ac-link").onsubmit=function(e){e.preventDefault();var f=e.target,m=$("#ac-ln-msg");if(!/^\S+@\S+\.\S+$/.test(f.email.value.trim())){m.textContent=T("Please add a valid email and tick the box.");return}
  api("link",{email:f.email.value.trim(),lang:lg,next:buy?"buy_"+buy:""}).then(function(x){m.textContent=x.ok?T("Check your email: we sent you a sign-in link (valid 45 minutes)."):T("Something went wrong. Please try again.")})};
 var em=qs.get("email");if(em){$("#ac-signup").email.value=em;$("#ac-link").email.value=em}}
function pname(k){return(I._products[k]||{}).name||k}
var TABS=[["overview","Overview"],["companies","My companies"],["services","Services"],["orders","Orders and invoices"],["updates","Updates"],["pro","Pro"]];
function render(){var root=$("#ac-in");root.innerHTML="";$("#ac-out").hidden=true;root.hidden=false;var m=S.member;
 var bar=E("div",{role:"tablist","class":"ac-tabs","aria-label":T("Your Gotham account")});
 TABS.forEach(function(x){var b=E("button",{type:"button",role:"tab","aria-selected":String(tab===x[0]),text:T(x[1])});b.onclick=function(){tab=x[0];history.replaceState(null,"","#"+tab);render()};bar.appendChild(b)});
 var so=E("button",{type:"button",text:T("Sign out")});so.onclick=function(){api("logout",{}).then(function(){location.href=pre+"/account"})};bar.appendChild(so);root.appendChild(bar);
 if(!TABS.some(function(x){return x[0]===tab}))tab="overview";({overview:ov,companies:cos,services:svc,orders:ord,updates:upd,pro:pro})[tab](root)}
function card(root,title){var c=E("div",{"class":"box ac-card"},[E("h2",{text:title})]);root.appendChild(c);return c}
function ov(root){var c=card(root,T("Your plans")),ul=E("ul",{"class":"ac-list"});
 if(!S.plans.length)c.appendChild(E("p",{"class":"m",text:T("No paid plan yet.")}));
 S.plans.forEach(function(p){ul.appendChild(E("li",{},[E("b",{text:pname(p.product)+(p.company?" · "+p.company:"")}),E("span",{"class":"ac-pill ok",text:T("Active")+" · "+T("until")+" "+fmtDate(p.ends)})]))});c.appendChild(ul);
 c.appendChild(E("p",{},[E("a",{href:pre+"/membership",text:T("Plans and prices")+" →"})]));
 var a=card(root,T("Alerts")),f=E("form",{"class":"ac-form"}),m=S.member;
 f.appendChild(E("label",{"class":"chk"},[E("input",{type:"checkbox",name:"alerts"}),T("Sector alerts every Monday")]));f.alerts.checked=m.alerts;
 var fs=E("fieldset",{"class":"ac-secs"},[E("legend",{text:T("Your sectors")})]);I._sectors.forEach(function(s){var i=E("input",{type:"checkbox",name:"sectors",value:s[0]});i.checked=(m.sectors||[]).indexOf(s[0])>-1;fs.appendChild(E("label",{},[i," "+s[1]]))});f.appendChild(fs);
 var sel=E("select",{name:"lang"});[["en","English"],["fr","Français"],["es","Español"],["de","Deutsch"],["ar","العربية"],["zh","中文"]].forEach(function(o){var op=E("option",{value:o[0],text:o[1]});if(o[0]===m.lang)op.selected=true;sel.appendChild(op)});
 f.appendChild(E("div",{"class":"two"},[E("label",{},[T("Your name"),E("input",{name:"name",value:m.name||""})]),E("label",{},[T("Language"),sel])]));
 f.appendChild(E("div",{"class":"two"},[E("label",{},[T("Company"),E("input",{name:"company",value:m.company||""})]),E("label",{},[T("Country"),E("input",{name:"country",value:m.country||""})])]));
 f.appendChild(E("label",{"class":"chk"},[E("input",{type:"checkbox",name:"marketing"}),T("Email me useful news and offers from Gotham Consult. I can unsubscribe at any time.")]));f.marketing.checked=!!m.marketing;
 var msg=E("p",{"class":"ac-msg",role:"status"});f.appendChild(E("div",{},[E("button",{"class":"btn btn-line",type:"submit",text:T("Save")})]));f.appendChild(msg);
 f.onsubmit=function(e){e.preventDefault();api("prefs",{alerts:f.alerts.checked,marketing:f.marketing.checked,lang:f.lang.value,name:f.name.value,company:f.company.value,country:f.country.value,
  sectors:[].slice.call(f.querySelectorAll("[name=sectors]:checked")).map(function(x){return x.value})}).then(function(x){if(x.ok){S=x.j;msg.textContent=T("Saved.")}else msg.textContent=T("Something went wrong. Please try again.")})};a.appendChild(f)}
function cos(root){S.calendar.forEach(function(k){var c=card(root,k.company.name),ul=E("ul",{"class":"ac-list"});c.appendChild(E("h3",{text:T("Next deadlines")}));
  if(!k.deadlines.length)c.appendChild(E("p",{"class":"m",text:T("No deadlines in the coming weeks.")}));
  k.deadlines.forEach(function(d){var nm=d.key.indexOf("renew:")===0?T("Start renewal")+": "+d.key.slice(6):d.key.indexOf("expires:")===0?T("Expires")+": "+d.key.slice(8):(I._rules[d.name]||d.name),pd=/^\d{4}-\d{2}$/.test(d.period)?I._months[+d.period.slice(5)-1]+" "+d.period.slice(0,4):d.period;var li=E("li",{},[E("span",{"class":"ac-due",text:fmtDate(d.due)}),E("span",{style:"flex:1;min-width:200px"},[E("b",{text:nm}),pd?E("span",{"class":"m",text:" · "+pd}):null]),
   d.source_url?E("a",{href:d.source_url,target:"_blank",rel:"noopener","class":"m",text:T("Official source")}):null]);
   if(d.filing_offer){var b=E("button",{type:"button","class":"btn btn-line",text:T("Let us file it for you")});b.onclick=function(){order("filing",k.company.id,nm+" · "+d.due+(pd?" · "+pd:""))};li.appendChild(b)}ul.appendChild(li)});c.appendChild(ul);
  if(!k.full){var lk=E("div",{"class":"ac-lock"},[E("p",{style:"margin:0 0 10px",text:(k.hidden?k.hidden+" "+T("more deadlines hidden")+". ":"")+T("Full calendar for 120 days and reminders by email: get the compliance calendar for this company.")})]);
   var g=E("button",{type:"button","class":"btn btn-gold",text:T("Get the calendar")+" · "+money(S.prices.compliance_year)+" / "+T("per year")});g.onclick=function(){order("compliance_year",k.company.id)};lk.appendChild(g);c.appendChild(lk)}
  var ed=E("button",{type:"button","class":"btn btn-line",style:"margin-top:12px",text:T("Edit company")});ed.onclick=function(){coForm(root,k.company)};c.appendChild(ed)});
 coForm(root,null)}
function coForm(root,co){var c=card(root,co?T("Edit company"):T("Add a company")),f=E("form",{"class":"ac-form"});co=co||{};
 f.appendChild(E("div",{"class":"two"},[E("label",{},[T("Company name"),E("input",{name:"name",required:"",maxlength:"160",value:co.name||""})]),E("label",{},[T("Tax ID (TIN)"),E("input",{name:"tin",maxlength:"40",value:co.tin||""})])]));
 var ye=E("select",{name:"year_end_month"});I._months.forEach(function(mn,i){var o=E("option",{value:i+1,text:mn});if((co.year_end_month||12)===i+1)o.selected=true;ye.appendChild(o)});
 f.appendChild(E("div",{"class":"two"},[E("label",{},[T("Registration number"),E("input",{name:"reg_no",maxlength:"40",value:co.reg_no||""})]),E("label",{},[T("Date of incorporation"),E("input",{name:"incorporated_on",type:"date",value:co.incorporated_on?String(co.incorporated_on).slice(0,10):""})])]));
 f.appendChild(E("label",{},[T("Financial year ends in month"),ye]));
 [["vat_registered","Registered for VAT"],["has_employees","Has employees on payroll"],["foreign_staff","Employs foreign staff (immigrant quota)"]].forEach(function(x){var i=E("input",{type:"checkbox",name:x[0]});i.checked=!!co[x[0]];f.appendChild(E("label",{"class":"chk"},[i,T(x[1])]))});
 f.appendChild(E("h3",{text:T("Permits and certificates with an expiry date")}));var rows=E("div",{style:"display:grid;gap:8px"});f.appendChild(rows);
 var dl=E("datalist",{id:"ac-perm"});I._permits.forEach(function(p){dl.appendChild(E("option",{value:p[0]}))});f.appendChild(dl);
 function row(p){p=p||{};var r=E("div",{"class":"two",style:"grid-template-columns:2fr 1fr 1fr auto"},[E("input",{list:"ac-perm",placeholder:T("Name"),"aria-label":T("Name"),value:p.name||""}),E("input",{type:"date","aria-label":T("Expires"),value:p.expires||""}),
  E("input",{type:"number",min:"0",max:"365","aria-label":T("Remind me (days before)"),title:T("Remind me (days before)"),value:p.lead_days||60})]);var d=E("button",{type:"button","class":"btn btn-line","aria-label":T("Delete row"),text:"×"});d.onclick=function(){r.remove()};r.appendChild(d);rows.appendChild(r)}
 (co.permits||[]).forEach(row);var ad=E("button",{type:"button","class":"btn btn-line",text:T("Add a row")});ad.onclick=function(){row()};f.appendChild(E("div",{},[ad]));
 var msg=E("p",{"class":"ac-msg",role:"status"});f.appendChild(E("div",{"class":"ac-row"},[E("button",{"class":"btn btn-gold",type:"submit",text:T("Save")})]));f.appendChild(msg);
 f.onsubmit=function(e){e.preventDefault();if(!f.name.value.trim()){f.name.focus();return}var b={id:co.id||null,name:f.name.value,tin:f.tin.value,reg_no:f.reg_no.value,incorporated_on:f.incorporated_on.value,year_end_month:+f.year_end_month.value,
  vat_registered:f.vat_registered.checked,has_employees:f.has_employees.checked,foreign_staff:f.foreign_staff.checked,permits:[].slice.call(rows.children).map(function(r){var i=r.querySelectorAll("input");return{name:i[0].value,expires:i[1].value,lead_days:+i[2].value}}).filter(function(p){return p.name})};
  api("company",b).then(function(x){if(x.ok){S=x.j;tab="companies";render()}else msg.textContent=T("Something went wrong. Please try again.")})};c.appendChild(f)}
function svc(root){[["pro_year",0],["pro_month",0],["compliance_year",1],["compliance_month",1],["call",2],["check",2],["filing",3]].forEach(function(x){var k=x[0],p=I._products[k],c=card(root,p.name);
  c.appendChild(E("p",{"class":"amt",style:"font:700 22px var(--font);margin:0 0 10px",text:money(S.prices[k])}));var b=E("button",{type:"button","class":"btn btn-gold",text:T("Order")});b.onclick=function(){order(k)};c.appendChild(b)})}
function order(k,coId,brief){var p=I._products[k],root=$("#ac-in");tab="services";render();var c=card(root,T("Order")+": "+p.name);root.insertBefore(c,root.children[1]);
 var f=E("form",{"class":"ac-form"}),msg=E("p",{"class":"ac-msg",role:"status"});
 if(p.company){var s=E("select",{name:"company_id"});S.calendar.forEach(function(k2){var o=E("option",{value:k2.company.id,text:k2.company.name});if(k2.company.id===coId)o.selected=true;s.appendChild(o)});
  if(!S.calendar.length){c.appendChild(E("p",{text:T("Add a company")+" →"}));var go=E("button",{type:"button","class":"btn btn-line",text:T("Add a company")});go.onclick=function(){tab="companies";render()};c.appendChild(go);return}f.appendChild(E("label",{},[T("Which company?"),s]))}
 if(p.booking){f.appendChild(E("label",{},[T("What do you need?"),E("textarea",{name:"details",required:"",maxlength:"1500",rows:"4"})]));if(brief)f.details.value=brief;
  if(p.booking==="call")f.appendChild(E("label",{},[T("Preferred days and times (Accra time)"),E("input",{name:"slots",maxlength:"300"})]))}
 f.appendChild(E("p",{"class":"amt",style:"font:700 20px var(--font);margin:0",text:money(S.prices[k])}));
 f.appendChild(E("div",{},[E("button",{"class":"btn btn-gold",type:"submit",text:T("Continue to payment")})]));f.appendChild(msg);
 f.onsubmit=function(e){e.preventDefault();if(p.booking&&!f.details.value.trim()){f.details.focus();return}msg.textContent=T("Opening the invoice…");
  api("buy",{product:k,company_id:f.company_id?+f.company_id.value:null,details:f.details?f.details.value:"",slots:f.slots?f.slots.value:""}).then(function(x){if(x.ok&&x.j.pay_url)location.href=x.j.pay_url;else msg.textContent=T("Something went wrong. Please try again.")})};
 c.appendChild(f);c.scrollIntoView({behavior:"smooth",block:"start"})}
function ord(root){var c=card(root,T("Orders and invoices")),ul=E("ul",{"class":"ac-list"});if(!S.orders.length)c.appendChild(E("p",{"class":"m",text:T("Nothing here yet.")}));
 var st={pending:["wait","Waiting for payment"],active:["ok","Active"],ended:["","Ended"],open:["wait","In progress"],done:["ok","Done"],cancelled:["","Ended"]};
 S.orders.forEach(function(o){var s=st[o.status]||["",o.status],li=E("li",{},[E("span",{style:"flex:1;min-width:200px"},[E("b",{text:pname(o.product)}),E("span",{"class":"m",text:" · "+fmtDate(String(o.at).slice(0,10))+(o.ends?" · "+T("until")+" "+fmtDate(o.ends):"")})]),E("span",{"class":"ac-pill "+s[0],text:T(s[1])})]);
  if(o.pay_url)li.appendChild(E("a",{href:o.pay_url,"class":o.status==="pending"?"btn btn-gold":"m",text:o.status==="pending"?T("Pay now"):T("Invoice")+" "+(o.invoice||"")}));ul.appendChild(li)});c.appendChild(ul)}
function upd(root){var c=card(root,T("Updates on your cases"));if(!S.updates.length)c.appendChild(E("p",{"class":"m",text:T("Messages from our team about your cases appear here.")}));
 var ul=E("ul",{"class":"ac-list"});S.updates.forEach(function(u){ul.appendChild(E("li",{style:"display:block"},[E("p",{style:"margin:0"},[E("b",{text:u.title}),E("span",{"class":"m",text:" · "+fmtDate(String(u.at).slice(0,10))+(u.status?" · "+u.status:"")})]),u.body?E("p",{style:"margin:6px 0 0;white-space:pre-wrap",text:u.body}):null,u.url?E("a",{href:u.url,target:"_blank",rel:"noopener",text:u.url}):null]))});c.appendChild(ul)}
function pro(root){var c=card(root,T("Pro"));if(!S.pro){c.appendChild(E("p",{text:T("Pro gives you a monthly briefing per sector, the Excel data pack and one question to our team each month.")}));
  var b=E("button",{type:"button","class":"btn btn-gold",text:T("Become a Pro member")+" · "+money(S.prices.pro_year)+" / "+T("per year")});b.onclick=function(){order("pro_year")};c.appendChild(b);return}
 c.appendChild(E("p",{text:T("Your monthly briefings and the data pack are here.")}));c.appendChild(E("p",{},[E("a",{"class":"btn btn-gold",href:"/api/member/datapack.xlsx",text:T("Download the Excel data pack")})]));
 S.posts.forEach(function(p){var d=card(root,p.title);d.appendChild(E("p",{"class":"m",text:fmtDate(String(p.published_at).slice(0,10))}));d.appendChild(E("div",{style:"white-space:pre-wrap;line-height:1.6",text:p.body||""}))})}
api("me").then(function(x){if(!x.ok||!x.j||!x.j.member){out();return}S=x.j;if(tab.indexOf("buy_")===0){var k=tab.slice(4);tab="services";render();if(I._products[k])order(k);return}if(buy&&I._products[buy]){render();order(buy);return}render()}).catch(out);
})();</script>
'''


def missing(lang):
    L = Loc(lang)
    render_membership(lang, L); render_account(lang, L)
    for s in EXTRA + UI + PRODUCT_NAMES: L.t(s)
    return list(L.miss)


def strings():
    """every English string the membership pages, the account page and the member emails show"""
    L = Loc('fr'); L.d = {'__': 1}; render_membership('fr', L); render_account('fr', L)
    for s in EXTRA + UI + PRODUCT_NAMES: L.t(s)
    return list(L.miss)
