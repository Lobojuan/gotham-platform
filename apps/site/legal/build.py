css=open('common.css').read()
SITE='https://gotham-consult-gh.netlify.app/'
def page(title,desc,body,active):
    items=[('Website','','site'),('Register','register.html','reg'),('Privacy','privacy.html','privacy'),('Terms','terms.html','terms')]
    nav=''
    for t,h,a in items:
        cls=' class="here"' if a==active else ''
        nav+='<a href="'+SITE+h+'"'+cls+'>'+t+'</a>'
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><meta name="description" content="{desc}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@1,6..72,400&display=swap">
<style>{css}</style></head><body>
<div class="kente" aria-hidden="true"></div>
<header><div class="wrap bar">
  <a class="brand" href="{SITE}"><span class="mark">G</span><span>Gotham Consult<small>in partnership with Carlson Capital Ltd</small></span></a>
  <nav aria-label="Main">{nav}</nav>
</div></header>
<main class="wrap">{body}</main>
<footer><div class="wrap">
  <b style="color:var(--ink)">Gotham Consult</b> · Accra, Ghana · in strategic partnership with <b style="color:var(--ink)">Carlson Capital Ltd</b>, a company registered in Ghana<br>
  Registered in Ghana · Company registration number, registered office and TIN available on request and published here shortly<br>
  WhatsApp +233 55 041 6627 · Investor, mining &amp; international desk: Uffe Carlson, +233 55 239 5548 · <a href="mailto:info@gothamconsult.com">info@gothamconsult.com</a><br>
  <a href="{SITE}privacy.html">Privacy &amp; data protection</a> · <a href="{SITE}terms.html">Terms of service</a>
</div></footer></body></html>'''
open('privacy.html','w').write(page('Privacy & data protection · Gotham Consult',
  "How Gotham Consult and Carlson Capital Ltd handle personal data under Ghana's Data Protection Act 2012 (Act 843) and the GDPR.",
  open('privacy_body.html').read(),'privacy'))
open('terms.html','w').write(page('Terms of service · Gotham Consult',
  'Terms for Gotham Consult and Carlson Capital Ltd services, forums, payments and refunds in Ghana.',
  open('terms_body.html').read(),'terms'))
print('built')
