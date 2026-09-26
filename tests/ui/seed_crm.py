# demo pipeline, tasks and notes on top of seed_demo.py
import json, urllib.request, urllib.error, itertools, datetime as dt, os
B='http://127.0.0.1:4199'; _ip=itertools.count(60)
PW=os.environ.get('ADMIN_PW','Admin2025-qa!')
def call(path,data=None,method=None,cookie=None):
    req=urllib.request.Request(B+path,data=json.dumps(data).encode() if data is not None else None,method=method or ('POST' if data is not None else 'GET'))
    req.add_header('content-type','application/json'); req.add_header('x-real-ip','10.4.%d.%d'%divmod(next(_ip),250))
    if cookie: req.add_header('cookie',cookie)
    try: r=urllib.request.urlopen(req,timeout=60); return r.status,json.loads(r.read() or b'{}'),r.headers
    except urllib.error.HTTPError as e: return e.code,json.loads(e.read() or b'{}'),e.headers
st,d,h=call('/api/login',{'email':'admin','password':PW}); assert st==200,d; ck=h['set-cookie'].split(';')[0]
call('/api/users',{'name':'Joy Anthony Preston','email':'joy@gothamconsult.com','role':'owner'},cookie=ck)
today=dt.date.today()
D=lambda n:(today+dt.timedelta(days=n)).isoformat()
deals=[('Headline sponsorship · SMEs at the Centre','sponsorship','proposal',25000,{'company':'Newmont Africa','full_name':'Yaa Boateng','phone':'0244555001','email':'yaa@newmont.example'},'Send revised package',D(2)),
 ('Market entry & company setup','consulting','meeting',28500,{'company':'Nordic Solar ApS','full_name':'Lars Holm','phone':'+4520123456','email':'lars@nordicsolar.example'},'Meeting at the Mövenpick',D(5)),
 ('Partner table','sponsorship','contacted',8000,{'company':'Tang Palace Hotel','full_name':'Kwame Osei','phone':'0302999888'},'Call back about venue swap',D(-1)),
 ('Business registration & compliance','consulting','lead',2500,{'company':'Esi Beauty','full_name':'Esi Owusu','phone':'0550001111'},'',None),
 ('Concession screening · Eastern Region','consulting','proposal',85000,{'company':'Gold Fields Ghana','full_name':'Kofi Asare','phone':'0201112222','email':'kofi@gf.example'},'Board approval expected',D(9)),
 ('Business Pro membership','membership','won',14400,{'company':'Adwoa Farms','full_name':'Adwoa Boateng','phone':'0244123456'},'',None)]
ids=[]
for t,k,s,v,nc,ns,nd in deals:
    st,d,_=call('/api/deals',{'title':t,'kind':k,'stage':'lead','value':v,'new_contact':nc,'next_step':ns,'next_date':nd},cookie=ck); assert st==200,d; ids.append(d)
    if s!='lead':
        for s2 in ['contacted','meeting','proposal','won']:
            call('/api/deals/%d'%d['id'],{'stage':s2},method='PATCH',cookie=ck)
            if s2==s: break
st,d,_=call('/api/deals',{'title':'Website rebuild','kind':'consulting','value':12000,'new_contact':{'company':'Kojo Supplies','full_name':'Kojo Asare','phone':'0244999888'}},cookie=ck)
call('/api/deals/%d'%d['id'],{'stage':'lost','lost_reason':'Went with a cheaper local agency'},method='PATCH',cookie=ck)
c=ids[0]['contact_id']
for kind,body in [('call','Called Yaa. Board likes the headline package but wants the speaking slot confirmed.'),('whatsapp','Sent the revised sponsorship pack PDF on WhatsApp.'),('meeting','Met at Newmont office, Airport City. Budget approved in principle, GHS 25,000.')]:
    call('/api/notes',{'contact_id':c,'deal_id':ids[0]['id'],'kind':kind,'body':body},cookie=ck)
for t,due,a,cid,pr in [('Confirm Yaa\'s speaking slot with Joy',D(0)+'T10:00:00','admin',c,'high'),('Send Lars the GIPA registration checklist',D(1)+'T09:00:00','admin',ids[1]['contact_id'],'normal'),
    ('Call Kwame back about the venue swap',D(-1)+'T15:00:00','admin',ids[2]['contact_id'],'high'),('Print name badges for F1',D(20)+'T09:00:00','door',None,'normal'),
    ('Chase Gold Fields board decision',D(9)+'T09:00:00','joy@gothamconsult.com',ids[4]['contact_id'],'normal')]:
    call('/api/tasks',{'title':t,'due_at':due,'assignee':a,'contact_id':cid,'priority':pr},cookie=ck)
call('/api/sponsor-enquiry',{'company':'Ecobank Ghana','contact_name':'Ama Mensah','email':'ama@ecobank.example','phone':'0302111222','tier':'partner','budget':'GHS 15,000'})
print('crm seeded')
