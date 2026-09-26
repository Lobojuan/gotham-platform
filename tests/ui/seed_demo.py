import json, base64, urllib.request, urllib.error, subprocess, itertools, os
QA=os.environ.get('QA_DIR','/tmp/qa'); os.makedirs(QA,exist_ok=True)
CRM=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','apps','crm')
B='http://127.0.0.1:4199'; _ip=itertools.count(30)
def call(path,data=None,method=None,cookie=None):
    req=urllib.request.Request(B+path,data=json.dumps(data).encode() if data is not None else None,method=method or ('POST' if data is not None else 'GET'))
    req.add_header('content-type','application/json'); req.add_header('x-real-ip','10.5.%d.%d'%divmod(next(_ip),250))
    if cookie: req.add_header('cookie',cookie)
    try: r=urllib.request.urlopen(req,timeout=60); return r.status,json.loads(r.read() or b'{}'),r.headers
    except urllib.error.HTTPError as e: return e.code,json.loads(e.read() or b'{}'),e.headers
st,d,h=call('/api/login',{'email':'admin','password':'Admin2025'}); assert st==200,(st,d); ck=h['set-cookie'].split(';')[0]
# the first login must change password; do it so the seed can continue
st,d,_=call('/api/password',{'current':'Admin2025','password':'Admin2025-qa!'},cookie=ck)
st,d,h=call('/api/login',{'email':'admin','password':'Admin2025-qa!'}); ck=h['set-cookie'].split(';')[0]
call('/api/settings',{'max_seats':'40','whatsapp':'+233 55 041 6627'},cookie=ck)
subprocess.run(['node','-e','''const s=require("sharp");Promise.all([
s({create:{width:2400,height:1350,channels:3,background:{r:24,g:40,b:62}}}).composite([{input:Buffer.from('<svg width="2400" height="1350"><rect x="200" y="300" width="2000" height="700" fill="#A9761F"/><text x="1200" y="720" font-size="160" text-anchor="middle" fill="#fff" font-family="sans-serif">SMEs at the Centre</text></svg>')}]).jpeg().toFile(process.env.QA_DIR+"/cover.jpg"),
s({create:{width:900,height:300,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:Buffer.from('<svg width="900" height="300"><text x="20" y="200" font-size="150" fill="#1F6B4E" font-family="sans-serif" font-weight="bold">ACME GOLD</text></svg>')}]).png().toFile(process.env.QA_DIR+"/logo.png")]).then(()=>0)'''],cwd=CRM,env={**os.environ,'QA_DIR':QA},check=True)
st,cov,_=call('/api/media',{'kind':'image','name':'cover.jpg','data':base64.b64encode(open(QA+'/cover.jpg','rb').read()).decode(),'alt':'Forum stage'},cookie=ck); assert st==200,cov
st,logo,_=call('/api/media',{'kind':'logo','name':'logo.png','data':base64.b64encode(open(QA+'/logo.png','rb').read()).decode()},cookie=ck); assert st==200,logo
pdf=b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'
st,doc,_=call('/api/media',{'kind':'doc','name':'Forum programme.pdf','data':base64.b64encode(pdf).decode(),'label':'Forum programme'},cookie=ck); assert st==200,doc
items=[
 {'code':'F1','kind':'event','title':'SMEs at the Centre: Financing, Growth & Formalisation','starts_at':'2026-10-24T14:00:00Z','venue':'Tang Palace Hotel, Accra','price':0,'currency':'GHS','capacity':40,'published':True,'approval':True,'phase':'open','audiences':'SME / business owner,Investor,Government / institution,Partner or sponsor,Media,Other',
  'summary':'A half-day forum for owners of small and growing businesses in Ghana.','description':'Bankers, regulators and founders on getting finance, formalising and growing.\n\nFree to attend, seats are limited.',
  'cover':cov['id'],'docs':[{'media':doc['id'],'label':'Forum programme'}],'agenda':[{'time':'14:00','what':'Welcome and opening'},{'time':'14:30','what':'Panel: access to finance'}],'speakers':[{'name':'Speaker to be announced','role':'Banking panel'}]},
 {'code':'F2','kind':'event','title':'Mining & Supply Chain Breakfast','starts_at':'2026-11-20T08:00:00Z','venue':'Accra','price':1500,'currency':'GHS','capacity':40,'published':True,'approval':True,'phase':'open','summary':'For suppliers to Ghana mines.'},
 {'code':'C1','kind':'service','title':'Business registration & compliance review','price':2500,'currency':'GHS','published':True,'summary':'We check your registration, tax and permits.'},
]
for it in items:
    st,d,_=call('/api/items',it,cookie=ck); assert st==200,(it['code'],st,d)
st,d,_=call('/api/sponsors',{'name':'Acme Gold Ghana','tier':'headline','category':'Mining','blurb':'Responsible gold mining in the Eastern Region','url':'https://example.com','logo':logo['id'],'item_code':'F1','amount':25000,'currency':'GHS','paid':True,'published':True},cookie=ck); assert st==200,d
call('/api/sponsors',{'name':'Tang Palace Hotel','tier':'partner','category':'Hospitality','published':True},cookie=ck)
people=[('Adwoa Boateng','Adwoa Farms','adwoa@farms.example','0244123456'),('Kwame Mensah','Mensah Logistics Limited Liability Company of Greater Accra','kwame.mensah.with.a.very.long.email.address@logistics-company-ghana.example','0201112222'),('Esi Owusu','Esi Beauty','esi@beauty.example','0550001111')]
for n,c,e,p in people:
    st,d,_=call('/api/register',{'item_code':'F1','seats':1,'company':c,'full_name':n,'email':e,'phone':p,'country':'Ghana','sector':'Agriculture','consent':True,'payment_method':'free','company_about':'We sell things','company_size':'6–20','challenge':'Getting a loan','heard_via':'WhatsApp','follow_up':'yes'}); assert st==200,d
st,d,_=call('/api/register',{'item_code':'F2','seats':2,'company':'Kojo Supplies','full_name':'Kojo Asare','email':'kojo@x.example','phone':'0244999888','country':'Ghana','sector':'Mining','consent':True,'payment_method':'momo'}); assert st==200,d
call('/api/family-interest',{'full_name':'Akua Mensah','email':'akua@example.co.uk','country':'United Kingdom','dial':'+44','phone_local':'07700 900123','relationship':'Daughter','parent_region':'Greater Accra','parent_town':'Dansoman','languages':['Twi'],'needs':['Regular visits'],'heard':'Church','message':'','website':'','consent':True})
paste="Company;Name;Title;Email;Phone\nGold Fields Ghana;Kofi Asare;Country Manager;kofi@gf.example;+233 20 111 2222\nNewmont Africa;Yaa Boateng;Head of Sustainability;yaa@newmont.example;\n"
st,d,_=call('/api/contacts/import',{'text':paste,'source':'QA seed list','tags':'mining'},cookie=ck); print('import',st,d if st!=200 else '')
st,d,_=call('/api/campaigns',{'name':'Forum invitation — mining','subject':'You are invited: SMEs at the Centre','item_code':'F1','segment':{'tags':'mining'},'body':'Dear {{first_name}},\n\nWe would like to invite you.','daily_limit':50},cookie=ck); print('campaign',st)
st,d,_=call('/api/users',{'name':'Door Staff','email':'door','role':'staff'},cookie=ck); print('staff user',st,d)
json.dump({'staff_pw':d.get('password')},open(QA+'/seed.json','w'))
print('seeded')
