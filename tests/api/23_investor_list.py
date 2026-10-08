# Investor list: /invest/join and POST /api/investor-interest
exec(open(__file__.replace('23_investor_list.py','07_family_desk.py')).read().split("ok=lambda m: print('  ok',m)")[0])
ok=lambda m: print('  ok',m)

st,b,_=call('/invest/join',raw=True)
assert st==200 and b'Join the investor list' in b and b'<!doctype html>' in b.lower(); ok('/invest/join served as a full page')
st,b,_=call('/sitemap.xml',raw=True); assert b'/invest/join<' in b; ok('in the sitemap')
for pg in ['/invest','/','/projects/dawa-solar','/carlson-capital']:
    st,b,_=call(pg,raw=True); assert b'href="/invest/join"' in b, pg
ok('linked from Invest, Home, the Dawa case study and Carlson Capital')
st,b,_=call('/privacy.html',raw=True); assert b'Investor list form' in b; ok('privacy notice covers the form')

good={'full_name':'Lars Holm','email':'lars@fund.example.dk','phone':'+45 20 12 34 56','company':'Nordic Frontier Fund',
 'country':'Denmark','investor_type':'Fund (PE / VC)','ticket':'USD 1 – 10 million','timeline':'Within 6 months',
 'sectors':['Energy and solar','Mining'],'message':'Solar with a local partner.','website':'','consent':True}
st,d,_=call('/api/investor-interest',good); assert st==200 and d.get('ok'),(st,d); ok('sign-up accepted')

import subprocess as _sp
_orig=call
def call(path,*a,**k):
    if path=='/api/login': _sp.run(['psql',DB,'-qc','update users set must_change=false'],check=True)
    return _orig(path,*a,**k)
st,d,h=call('/api/login',{'email':'admin','password':'ownerpass123'}); ck=h['set-cookie'].split(';')[0]
st,c,_=call('/api/contacts',cookie=ck)
r=[x for x in c['rows'] if x['email']=='lars@fund.example.dk'][0]
assert r['phone']=='+4520123456' and r['country']=='Denmark' and r['sector']=='Investor' and 'investor-list' in r['tags'], r
assert r['extra']['Ticket size']=='USD 1 – 10 million' and r['extra']['Sectors']=='Energy and solar, Mining' and r['extra']['Invests as']=='Fund (PE / VC)'
ok('contact tagged investor with country, ticket, sectors; Danish number kept as +4520123456')
st,dl,_=call('/api/deals',cookie=ck)
rows=dl.get('rows',dl) if isinstance(dl,dict) else dl
dd=[x for x in rows if x.get('kind')=='investor']
assert dd and 'Nordic Frontier Fund' in dd[0]['title'], dl; ok('investor deal created: %s'%dd[0]['title'])
st,t,_=call('/api/tasks?scope=unassigned',cookie=ck)
trows=t.get('rows',t) if isinstance(t,dict) else t
assert any('investor list' in x['title'] for x in trows), trows; ok('call task for tomorrow created')
st,ob,_=call('/api/outbox',cookie=ck)
ack=[x for x in ob['rows'] if x['kind']=='investor_ack' and x['to_email']=='lars@fund.example.dk']
assert ack and 'investor list' in ack[0]['subject'] and 'commits you to nothing' in ack[0]['body']; ok('thank-you email queued')
al={x['to_email'] for x in ob['rows'] if x['kind']=='staff_alert' and 'Lars Holm' in x['subject']}
assert al=={'info@gothamconsult.com','uffe.carlson@gothamconsult.com'}, al; ok('alert queued to Gotham (info@) with a copy to Uffe')

st,d,_=call('/api/investor-interest',{**good,'email':'bad','consent':False,'sectors':[],'ticket':'a billion','investor_type':'Pirate','phone':'12'})
assert st==400 and {'email','consent','sectors','ticket','investor_type','phone'}<=set(d['fields']),(st,d); ok('bad submission refused with the exact fields')
st,d,_=call('/api/investor-interest',{**good,'email':'gh@example.com','phone':'024 000 0000','country':'Ghana','sectors':['Mining','<script>']})
st,c,_=call('/api/contacts',cookie=ck); g=[x for x in c['rows'] if x['email']=='gh@example.com'][0]
assert g['phone']=='+233240000000' and '<script>' not in json.dumps(g); ok('Ghana number normalised, junk sector dropped')
st,d,_=call('/api/investor-interest',{**good,'email':'nophone@example.com','phone':''}); assert st==200; ok('WhatsApp is optional')
before=len(c['rows'])
st,d,_=call('/api/investor-interest',{**good,'email':'bot@spam.example','website':'http://spam'})
st,c2,_=call('/api/contacts',cookie=ck); assert st==200 and not [x for x in c2['rows'] if x['email']=='bot@spam.example']; ok('honeypot: fake success, nothing stored')
st,d,_=call('/api/investor-interest',{**good,'ticket':'Over USD 10 million'})
st,c3,_=call('/api/contacts',cookie=ck); L=[x for x in c3['rows'] if x['email']=='lars@fund.example.dk']
assert len(L)==1 and L[0]['extra']['Ticket size']=='Over USD 10 million'; ok('same investor twice updates, no duplicate')
st,dl,_=call('/api/deals',cookie=ck); rows=dl.get('rows',dl) if isinstance(dl,dict) else dl
assert len([x for x in rows if x.get('kind')=='investor' and x.get('contact_id')==L[0]['id']])==1; ok('and no second open deal')
codes=[call('/api/investor-interest',{**good,'email':'r%d@example.com'%i},headers={'x-real-ip':'10.7.7.7'})[0] for i in range(6)]
assert codes[:5]==[200]*5 and codes[5]==429, codes; ok('5 tries per visitor per 10 minutes, the 6th refused')
srv.send_signal(signal.SIGTERM); time.sleep(0.5)
print('PASSED')
