# Quotes and invoices (GHS, and EUR/USD for non-residents), Ghana VAT 15% + NHIL 2.5% + GETFund 2.5%,
# numbering, lock after issue, payments with withholding tax, void, quote to invoice, VAT CSV,
# the client's page, Paystack (stand-in API + signed webhook) and Sign in with Google (stand-in token endpoint).
import subprocess, time, json, os, urllib.request, urllib.error, sys, atexit, threading, hmac, hashlib, base64, http.client
from urllib.parse import urlparse, parse_qs
from http.server import BaseHTTPRequestHandler, HTTPServer
DB = os.environ.get('TEST_DATABASE_URL', 'postgres://test@127.0.0.1:5439/gotham_test')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(os.path.join(ROOT, 'apps', 'crm'))
PSK = 'sk_test_mock'
TX = {}          # reference -> transaction the stand-in Paystack knows
GOOGLE = {'claims': None, 'seen': None}
class Mock(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def out(self, code, o):
        b = json.dumps(o).encode(); self.send_response(code); self.send_header('content-type', 'application/json'); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path.startswith('/transaction/verify/'):
            ref = self.path.rsplit('/', 1)[1]
            assert self.headers['authorization'] == 'Bearer ' + PSK
            t = TX.get(ref); return self.out(200 if t else 404, {'status': bool(t), 'data': t or {}})
        if self.path.startswith('/fx/'):
            return self.out(200, {'rates': {'GHS': 16.2345678}})
        self.out(404, {})
    def do_POST(self):
        raw = self.rfile.read(int(self.headers['content-length'] or 0))
        if self.path == '/transaction/initialize':
            b = json.loads(raw); ref = b['reference']
            TX[ref] = {'status': 'success', 'reference': ref, 'amount': b['amount'], 'currency': b['currency'], 'channel': 'mobile_money', 'metadata': b['metadata']}
            return self.out(200, {'status': True, 'data': {'authorization_url': 'https://checkout.example/' + ref, 'reference': ref}})
        if self.path == '/token':
            GOOGLE['seen'] = parse_qs(raw.decode())
            c = GOOGLE['claims']
            if c is None: return self.out(400, {'error': 'invalid_grant'})
            enc = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip('=')
            return self.out(200, {'id_token': enc({'alg': 'RS256'}) + '.' + enc(c) + '.sig', 'access_token': 'x'})
        self.out(404, {})
api = HTTPServer(('127.0.0.1', 4295), Mock); threading.Thread(target=api.serve_forever, daemon=True).start()
env = dict(os.environ); env.update({'DATABASE_URL': DB, 'SESSION_SECRET': 't', 'PORT': '4199', 'ADMIN_EMAIL': 'admin@gotham.test', 'ADMIN_PASSWORD': 'ownerpass123', 'ADMIN_NAME': 'Admin',
    'MEDIA_DIR': '/tmp/mediatest', 'PUBLIC_URL': 'http://127.0.0.1:4199', 'SITE_URL': 'http://example.org',
    'PAYSTACK_SECRET_KEY': PSK, 'PAYSTACK_API_BASE': 'http://127.0.0.1:4295', 'FX_API': 'http://127.0.0.1:4295/fx',
    'GOOGLE_CLIENT_ID': 'cid.apps.googleusercontent.com', 'GOOGLE_CLIENT_SECRET': 'gsecret', 'GOOGLE_TOKEN_URL': 'http://127.0.0.1:4295/token'})
os.makedirs('/tmp/mediatest', exist_ok=True)
srv = subprocess.Popen(['node', 'server.js'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
atexit.register(lambda: srv.poll() is None and srv.terminate())
B = B_URL = 'http://127.0.0.1:4199'
def call(path, data=None, method=None, cookie=None, headers=None, raw=None, text=False):
    req = urllib.request.Request(B + path, data=raw if raw is not None else (json.dumps(data).encode() if data is not None else None), method=method or ('POST' if (data is not None or raw is not None) else 'GET'))
    req.add_header('content-type', 'application/json')
    for k, v in (headers or {}).items(): req.add_header(k, v)
    if cookie: req.add_header('cookie', cookie)
    try:
        r = urllib.request.urlopen(req, timeout=60); b = r.read()
        return r.status, (b.decode() if text else json.loads(b or b'{}'))
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, (b.decode() if text else json.loads(b or b'{}'))
        except Exception: return e.code, b[:300]
def raw_req(method, path, body=None, headers=None):
    c = http.client.HTTPConnection('127.0.0.1', 4199, timeout=30); c.request(method, path, body=body, headers=headers or {})
    r = c.getresponse(); d = r.read(); return r.status, r.getheader('location'), r.getheader('set-cookie'), r.headers.get_all('set-cookie') or [], d
for _ in range(60):
    try:
        if call('/api/health')[0] == 200: break
    except Exception: pass
    time.sleep(0.4)
else: print('NO START'); print(srv.stdout.read()[:3000]); sys.exit(1)
def psql(sql): return subprocess.run(['psql', DB, '-qAtc', sql], capture_output=True, text=True, check=True).stdout.strip()
ok = lambda m: print('  ok', m)
psql('update users set must_change=false')
req = urllib.request.Request(B + '/api/login', data=json.dumps({'email': 'admin@gotham.test', 'password': 'ownerpass123'}).encode(), method='POST'); req.add_header('content-type', 'application/json')
ck = urllib.request.urlopen(req).headers['set-cookie'].split(';')[0]
Y = time.strftime('%Y')

# ---------- settings ----------
st, s = call('/api/invoice-settings', cookie=ck)
assert st == 200 and s['rates'] == {'vat': 15, 'nhil': 2.5, 'getfund': 2.5} and s['inv_vat_registered'] == '' and s['paystack'] is True, s
st, e = call('/api/invoice-settings', {'inv_tax_vat': '99'}, cookie=ck); assert st == 400 and e['error'] == 'bad_rate', e
st, e = call('/api/invoice-settings', {'inv_terms_days': '500'}, cookie=ck); assert st == 400 and e['error'] == 'bad_terms', e
# not VAT-registered yet: tax 'standard' is refused, default is no tax
LINES = [{'description': 'Market entry advisory', 'qty': 2, 'unit': 1500}, {'description': 'GIPA registration', 'qty': 1, 'unit': 1000, 'discount': 10}]
st, e = call('/api/invoices', {'bill_to': {'name': 'Ama Mensah', 'company': 'Mensah Foods'}, 'tax_mode': 'standard', 'lines': LINES}, cookie=ck)
assert st == 400 and e['error'] == 'not_vat_registered', e
st, d = call('/api/invoices', {'bill_to': {'name': 'Ama Mensah'}, 'lines': LINES}, cookie=ck)
assert st == 200 and d['totals']['vat'] == 0 and d['totals']['total'] == 3900, d
assert psql("select tax_mode from invoices where id=%d" % d['id']) == 'none'
call('/api/invoices/%d' % d['id'], method='DELETE', cookie=ck)
st, s = call('/api/invoice-settings', {'inv_vat_registered': 'yes', 'inv_tin': 'C0012345678', 'inv_vat_number': 'C0012345678', 'inv_co_name': 'Gotham Consult Ltd',
    'inv_bank_ghs': 'GCB Bank, Accra\nAcc 1234567890', 'inv_bank_usd': 'GCB Bank FEA USD 999', 'inv_terms_days': '14'}, cookie=ck)
assert st == 200 and s['inv_vat_registered'] == 'yes', s
call('/api/settings', {'momo_number': '0550416627', 'momo_name': 'Gotham Consult'}, cookie=ck)
ok('company & invoicing settings: rates 15/2.5/2.5 by default, bad values refused; no VAT charged until VAT-registered')

# ---------- totals ----------
cid = int(psql("insert into contacts(full_name, email, company) values ('Ama Mensah','ama@mensah.test','Mensah Foods') returning id"))
st, e = call('/api/invoices', {'lines': LINES}, cookie=ck); assert st == 400 and e['error'] == 'bill_to_required', e
st, d = call('/api/invoices', {'contact_id': cid, 'bill_to': {'name': 'Ama Mensah', 'company': 'Mensah Foods', 'email': 'AMA@mensah.test', 'tax_id': 'P0001'}, 'lines': LINES, 'wht_rate': 7.5}, cookie=ck)
t = d['totals']; assert st == 200, d
assert (t['subtotal'], t['discount'], t['taxable'], t['vat'], t['nhil'], t['getfund'], t['total'], t['tax_ghs']) == (4000, 100, 3900, 585, 97.5, 97.5, 4680, 780), t
inv1 = d['id']
st, e = call('/api/invoices', {'bill_to': {'name': 'X'}, 'tax_mode': 'zero', 'lines': LINES}, cookie=ck); assert st == 400 and e['error'] == 'zero_needs_reason', e
st, e = call('/api/invoices', {'bill_to': {'name': 'X'}, 'tax_mode': 'exempt', 'lines': LINES}, cookie=ck); assert st == 400 and e['error'] == 'exempt_needs_reason', e
ok('VAT 15% + NHIL 2.5% + GETFund 2.5% on the same taxable value (20% together), line discounts first; zero/exempt need a reason')

# ---------- foreign currency: Bank of Ghana rule ----------
st, e = call('/api/invoices', {'bill_to': {'name': 'Lars Holm', 'company': 'Nordic Sun ApS', 'country': 'Denmark'}, 'currency': 'EUR', 'fx_rate': 17.5, 'lines': LINES}, cookie=ck)
assert st == 400 and e['error'] == 'fx_needs_nonresident', e
st, e = call('/api/invoices', {'bill_to': {'name': 'Lars Holm', 'residency': 'non_resident'}, 'currency': 'EUR', 'lines': LINES}, cookie=ck)
assert st == 400 and e['error'] == 'fx_rate_required', e
st, d = call('/api/invoices', {'bill_to': {'name': 'Lars Holm', 'company': 'Nordic Sun ApS', 'country': 'Denmark', 'email': 'lars@nordic.test', 'residency': 'non_resident'},
    'currency': 'EUR', 'fx_rate': 17.5, 'fx_date': '2026-09-01', 'tax_mode': 'zero', 'tax_note': 'Export of services to a non-resident', 'lines': [{'description': 'Ghana market study', 'qty': 1, 'unit': 2000}]}, cookie=ck)
assert st == 200 and d['totals']['total'] == 2000 and d['totals']['total_ghs'] == 35000 and d['totals']['tax_ghs'] == 0, d
inv_eur = d['id']
st, d = call('/api/invoices', {'bill_to': {'name': 'John Carter', 'residency': 'expatriate', 'email': 'john@carter.test'}, 'currency': 'USD', 'fx_rate': 15, 'lines': [{'description': 'Advisory', 'qty': 1, 'unit': 1000}]}, cookie=ck)
assert st == 200 and d['totals']['total'] == 1200 and d['totals']['total_ghs'] == 18000 and d['totals']['tax_ghs'] == 3000, d
inv_usd = d['id']
st, fx = call('/api/fx?c=EUR', cookie=ck); assert st == 200 and fx['rate'] == 16.2346 and 'Bank of Ghana' in fx['source'], fx
st, e = call('/api/fx?c=JPY', cookie=ck); assert st == 400, e
ok('EUR/USD only for non-residents or expatriates and only with an exchange rate; cedi value and cedi tax recorded; rate suggestion works')

# ---------- issue, numbering, lock ----------
st, e = call('/api/invoices/%d/issue' % inv1, {}, cookie=ck); assert st == 200 and e['number'] == 'INV-%s-0001' % Y, e
st, e2 = call('/api/invoices/%d/issue' % inv_eur, {}, cookie=ck); assert e2['number'] == 'INV-%s-0002' % Y, e2
row = json.loads(psql("select row_to_json(i) from invoices i where id=%d" % inv1))
assert row['status'] == 'sent' and row['due_date'] and row['issue_date'], row
import datetime
assert (datetime.date.fromisoformat(row['due_date']) - datetime.date.fromisoformat(row['issue_date'])).days == 14
st, d = call('/api/invoices/%d' % inv1, {'bill_to': {'name': 'Changed'}, 'lines': [{'description': 'x', 'qty': 1, 'unit': 1}], 'evat_ref': 'EVAT-778899', 'notes': 'Thank you'}, cookie=ck)
assert st == 200 and d['locked'] is True, d
row = json.loads(psql("select row_to_json(i) from invoices i where id=%d" % inv1))
assert row['bill_to']['name'] == 'Ama Mensah' and float(row['total']) == 4680 and row['evat_ref'] == 'EVAT-778899' and row['notes'] == 'Thank you', row
st, e = call('/api/invoices/%d' % inv1, method='DELETE', cookie=ck); assert st == 400 and e['error'] == 'issued_cannot_delete', e
st, e = call('/api/invoices/%d/void' % inv_usd, {'reason': 'x'}, cookie=ck); assert st == 400 and e['error'] == 'delete_draft_instead', e
ok('issuing gives INV-YYYY-0001, 0002…, due date from the terms; an issued invoice is locked (only E-VAT ref, dates and notes change) and cannot be deleted')

# ---------- send + client page ----------
st, d = call('/api/invoices/%d/send' % inv1, {}, cookie=ck); assert st == 200, d
assert psql("select count(*) from outbox where to_email='ama@mensah.test' and subject like 'Invoice INV-%s-0001 from Gotham Consult Ltd'" % Y) == '1', psql("select to_email, subject from outbox")
link = d['link']; tok = link.rsplit('/', 1)[1]
st, html = call('/i/' + tok, text=True)
for want in ['TAX INVOICE', 'INV-%s-0001' % Y, 'C0012345678', 'VAT', 'NHIL', 'GETFund', 'GHS 4,680.00', '+233550416627', 'GCB Bank', '7.5% withholding tax', 'EVAT-778899', '/i/%s/pay' % tok]:
    assert want in html, want
st, x = call('/i/' + 'A' * 24, text=True); assert st == 404
draft_tok = psql("select token from invoices where id=%d" % inv_usd); st, x = call('/i/' + draft_tok, text=True); assert st == 404, 'drafts are not public'
st, html = call('/i/' + psql("select token from invoices where id=%d" % inv_eur), text=True)
for want in ['EUR 2,000.00', '17.5', 'GHS 35,000.00', 'Export of services', 'non-residents or expatriates']:
    assert want in html, want
assert '/pay' not in html.split('</style>')[1] or 'Pay online' not in html, 'no Paystack for EUR'
ok('send emails the link; the client page shows TIN/VAT no., each tax line, how to pay (MoMo, bank), WHT note, E-VAT ref; EUR shows the cedi value and rate; drafts are not public')

# ---------- payments, withholding tax, status ----------
st, e = call('/api/invoices/%d/payment' % inv1, {'amount': 0}, cookie=ck); assert st == 400 and e['error'] == 'amount_required', e
st, d = call('/api/invoices/%d/payment' % inv1, {'amount': 2000, 'method': 'momo', 'reference': 'MP123'}, cookie=ck); assert d['status'] == 'part_paid', d
st, L = call('/api/invoices', cookie=ck)
r1 = [r for r in L['rows'] if r['id'] == inv1][0]; assert r1['balance'] == 2680, r1
assert L['summary']['owed']['GHS'] == 2680 and L['summary']['owed']['EUR'] == 2000 and L['summary']['tax_this_month_ghs'] == 780, L['summary']
# client pays the rest less 7.5% WHT on the taxable value (3900 × 7.5% = 292.50), with the certificate
st, d = call('/api/invoices/%d/payment' % inv1, {'amount': 2387.5, 'wht': 292.5, 'wht_cert': True, 'method': 'bank'}, cookie=ck); assert d['status'] == 'paid', d
pid = psql("select id from invoice_payments where invoice_id=%d and wht>0" % inv1)
st, d = call('/api/invoices/%d/payment/%s' % (inv1, pid), {}, cookie=ck); assert d['status'] == 'part_paid', d
st, d = call('/api/invoices/%d/payment' % inv1, {'amount': 2387.5, 'wht': 292.5, 'wht_cert': True}, cookie=ck); assert d['status'] == 'paid', d
st, html = call('/i/' + tok, text=True); assert 'PAID' in html
ok('payments with withholding tax count towards the total; part paid → paid; removing a payment reopens it; the client page says PAID')

# ---------- overdue ----------
psql("update invoices set due_date=current_date - 3 where id=%d" % inv_eur)
st, L = call('/api/invoices', cookie=ck); assert L['summary']['overdue'] == 1 and [r for r in L['rows'] if r['id'] == inv_eur][0]['overdue'] is True
st, d = call('/api/invoices/%d/remind' % inv_eur, {}, cookie=ck); assert st == 200
assert psql("select count(*) from outbox where to_email='lars@nordic.test' and subject like 'Reminder:%'") == '1'
ok('overdue invoices are counted and a reminder can be sent')

# ---------- quotes ----------
st, d = call('/api/invoices', {'kind': 'quote', 'contact_id': cid, 'bill_to': {'name': 'Ama Mensah', 'email': 'ama@mensah.test'}, 'lines': [{'description': 'Compliance review', 'qty': 1, 'unit': 5000}]}, cookie=ck)
q1 = d['id']; st, d = call('/api/invoices/%d/issue' % q1, {}, cookie=ck); assert d['number'] == 'QUO-%s-0001' % Y, d
qtok = d['link'].rsplit('/', 1)[1]
st, html = call('/i/' + qtok, text=True); assert 'QUOTATION' in html and 'Accept' in html and 'How to pay' not in html
s_, loc, *_ = raw_req('POST', '/i/%s/accept' % qtok); assert s_ == 303 and loc.endswith('?accepted=1'), (s_, loc)
assert psql("select status from invoices where id=%d" % q1) == 'accepted'
assert psql("select count(*) from tasks where title like 'Quotation QUO-%s-0001 accepted%%' and priority='high'" % Y) == '1'
st, d = call('/api/invoices/%d/convert' % q1, {}, cookie=ck); assert st == 200
nv = json.loads(psql("select row_to_json(i) from invoices i where id=%d" % d['id']))
assert nv['kind'] == 'invoice' and nv['quote_id'] == q1 and nv['number'] is None and float(nv['total']) == 6000, nv
st, e = call('/api/invoices/%d/convert' % inv1, {}, cookie=ck); assert e['error'] == 'not_a_quote'
ok('quotations QUO-YYYY-0001: the client accepts online (task for the team), then one click turns it into a draft invoice')

# ---------- void ----------
st, d = call('/api/invoices/%d/issue' % inv_usd, {}, cookie=ck)
st, e = call('/api/invoices/%d/void' % inv_usd, {}, cookie=ck); assert e['error'] == 'reason_required'
st, d = call('/api/invoices/%d/void' % inv_usd, {'reason': 'Wrong client'}, cookie=ck); assert st == 200
st, e = call('/api/invoices/%d/payment' % inv_usd, {'amount': 5}, cookie=ck); assert e['error'] == 'void'
st, html = call('/i/' + psql("select token from invoices where id=%d" % inv_usd), text=True); assert 'VOID' in html
ok('void needs a reason, keeps the number (no gaps), blocks payments and shows VOID')

# ---------- VAT CSV ----------
req = urllib.request.Request(B + '/api/invoices/vat.csv?month=' + time.strftime('%Y-%m')); req.add_header('cookie', ck)
csv = urllib.request.urlopen(req).read().decode('utf-8-sig').splitlines()
assert csv[0].startswith('number,issue_date,client') and len(csv) == 3, csv
assert csv[1].startswith('INV-%s-0001' % Y) and ',585.00,' in csv[1] or ',585,' in csv[1], csv[1]
assert 'INV-%s-0002' % Y in csv[2] and '35000' in csv[2], csv[2]
ok('VAT return CSV per month in cedis (void invoices and quotes left out)')

# ---------- Paystack ----------
st, d = call('/api/invoices', {'bill_to': {'name': 'Kofi Boateng', 'email': 'kofi@b.test'}, 'lines': [{'description': 'Workshop seat', 'qty': 1, 'unit': 500}]}, cookie=ck)
pinv = d['id']; st, d = call('/api/invoices/%d/issue' % pinv, {}, cookie=ck); ptok = d['link'].rsplit('/', 1)[1]
s_, loc, *_ = raw_req('POST', '/i/%s/pay' % ptok)
assert s_ == 303 and loc.startswith('https://checkout.example/INV-'), (s_, loc)
ref = loc.rsplit('/', 1)[1]; assert TX[ref]['amount'] == 60000 and TX[ref]['currency'] == 'GHS', TX[ref]
st, html = call('/i/%s?reference=%s' % (ptok, ref), text=True); assert 'Your payment is received' in html and 'PAID' in html
assert psql("select status from invoices where id=%d" % pinv) == 'paid'
# the webhook for the same payment must not double-count
body = json.dumps({'event': 'charge.success', 'data': {'reference': ref}}).encode()
sig = hmac.new(PSK.encode(), body, hashlib.sha512).hexdigest()
s_, *_ = raw_req('POST', '/api/hooks/paystack', body, {'content-type': 'application/json', 'x-paystack-signature': 'bad'}); assert s_ == 401
s_, *_ = raw_req('POST', '/api/hooks/paystack', body, {'content-type': 'application/json', 'x-paystack-signature': sig}); assert s_ == 200
time.sleep(0.5)
assert psql("select count(*) from invoice_payments where invoice_id=%d" % pinv) == '1'
# a webhook alone also records (client closed the browser)
st, d = call('/api/invoices', {'bill_to': {'name': 'Esi', 'email': 'esi@b.test', 'residency': 'expatriate'}, 'currency': 'USD', 'fx_rate': 15, 'lines': [{'description': 'Seat', 'qty': 1, 'unit': 100}]}, cookie=ck)
uinv = d['id']; st, d = call('/api/invoices/%d/issue' % uinv, {}, cookie=ck); utok = d['link'].rsplit('/', 1)[1]
s_, loc, *_ = raw_req('POST', '/i/%s/pay' % utok); ref2 = loc.rsplit('/', 1)[1]; assert TX[ref2]['currency'] == 'USD' and TX[ref2]['amount'] == 12000
body = json.dumps({'event': 'charge.success', 'data': {'reference': ref2}}).encode()
s_, *_ = raw_req('POST', '/api/hooks/paystack', body, {'x-paystack-signature': hmac.new(PSK.encode(), body, hashlib.sha512).hexdigest()}); assert s_ == 200
for _ in range(20):
    if psql("select status from invoices where id=%d" % uinv) == 'paid': break
    time.sleep(0.2)
else: raise AssertionError('webhook did not mark paid')
# a paid invoice does not start another payment
s_, loc, *_ = raw_req('POST', '/i/%s/pay' % ptok); assert s_ == 303 and loc == '/i/%s' % ptok
ok('Paystack: pay online in GHS or USD (amount in pesewas/cents), verified on return and by signed webhook, never counted twice; bad signatures refused')

# ---------- bank details: in Ghana and from abroad (made-up numbers) ----------
BANK = {'bank_name': 'TEST BANK GHANA LIMITED', 'swift': 'tstbghac', 'branch': 'Osu', 'branch_code': '200116', 'account_name': 'GOTHAM CONSULT', 'account_ghs': '0202 0900 0099 9',
        'bank_address': 'Oxford Street, Osu, Accra, Ghana', 'charges': 'OUR', 'fx': {'USD': '', 'EUR': '', 'GBP': ''},
        'corr': [{'currency': 'EUR', 'bank': 'Test Correspondent AG', 'swift': 'TSTCDEFF', 'city': 'Frankfurt, Germany', 'account': '111122223333'},
                 {'currency': 'USD', 'bank': 'Test Trust Americas', 'swift': 'TSTAUS33', 'city': 'New York, USA', 'account': '44445555'},
                 {'currency': 'USD', 'bank': 'Other US Bank', 'swift': 'OTHRUS33', 'city': 'New York, USA', 'account': '66667777'},
                 {'currency': 'GBP', 'bank': 'Test London Bank', 'swift': 'TSTLGB2L', 'city': 'London, UK', 'account': '88889999'},
                 {'currency': '', 'bank': '', 'swift': '', 'city': '', 'account': ''}]}
st, e = call('/api/invoice-settings', {'inv_bank': {**BANK, 'swift': 'NOTASWIFT!'}}, cookie=ck); assert st == 400 and e['error'] == 'bad_bank' and 'swift' in e['fields'], e
st, e = call('/api/invoice-settings', {'inv_bank': {**BANK, 'corr': [{**BANK['corr'][0], 'swift': 'x'}]}}, cookie=ck); assert st == 400 and e['fields'] == ['corr_0_swift'], e
st, s = call('/api/invoice-settings', {'inv_bank': BANK}, cookie=ck); assert st == 200, s
BK = s['inv_bank']; assert BK['swift'] == 'TSTBGHAC' and BK['account_ghs'] == '0202090000999' and len(BK['corr']) == 4 and BK['fx'] == {}, BK
tokof = lambda i: psql("select token from invoices where id=%d" % i)
st, html = call('/i/' + tokof(pinv) + '?x', text=True)   # paid: no payment block
assert 'How to pay' not in html
st, d = call('/api/invoices', {'bill_to': {'name': 'Kojo', 'email': 'kojo@t.test'}, 'lines': [{'description': 'Advisory', 'qty': 1, 'unit': 100}]}, cookie=ck)
gid = d['id']; call('/api/invoices/%d/issue' % gid, {}, cookie=ck)
st, html = call('/i/' + tokof(gid), text=True)
for want in ['Mobile Money', 'Bank transfer in Ghana', '0202090000999', 'TEST BANK GHANA LIMITED', 'code 200116', 'Paying from abroad (SWIFT)', 'TSTBGHAC', 'TSTAUS33', 'OTHRUS33', 'TSTCDEFF', 'TSTLGB2L',
             'Ghana has no IBAN', 'OUR: please pay all bank charges', 'never change by email', 'data-c="0202090000999"']:
    assert want in html, want
st, d = call('/api/invoices', {'bill_to': {'name': 'Anna Schmidt', 'company': 'Solar GmbH', 'country': 'Germany', 'residency': 'non_resident', 'email': 'anna@solar.test'}, 'currency': 'EUR', 'fx_rate': 17,
    'tax_mode': 'zero', 'tax_note': 'Export of services', 'lines': [{'description': 'Market study', 'qty': 1, 'unit': 1000}]}, cookie=ck)
eid = d['id']; call('/api/invoices/%d/issue' % eid, {}, cookie=ck)
st, html = call('/i/' + tokof(eid), text=True)
assert 'International bank transfer in EUR' in html and 'TSTCDEFF' in html and '111122223333' in html and 'TSTAUS33' not in html and 'converted by the bank' in html and 'payable into our foreign exchange account' not in html, 'EUR without FEA'
call('/api/invoice-settings', {'inv_bank': {**BANK, 'fx': {'EUR': 'EUR-0099-1'}}}, cookie=ck)
st, html = call('/i/' + tokof(eid), text=True)
assert 'EUR-0099-1' in html and 'converted by the bank' not in html and 'payable into our foreign exchange account' in html, 'EUR with FEA'
st, d = call('/api/invoices', {'bill_to': {'name': 'Tom Brown', 'country': 'United Kingdom', 'residency': 'non_resident'}, 'currency': 'GBP', 'fx_rate': 20, 'lines': [{'description': 'Briefing', 'qty': 1, 'unit': 500}]}, cookie=ck)
assert st == 200 and d['totals']['total_ghs'] == 12000, d
gbp = d['id']; call('/api/invoices/%d/issue' % gbp, {}, cookie=ck); st, html = call('/i/' + tokof(gbp), text=True); assert 'TSTLGB2L' in html and 'Pay GBP' not in html
st, fx = call('/api/fx?c=GBP', cookie=ck); assert st == 200, fx
req = urllib.request.Request(B_URL + '/api/invoices/preview?c=USD'); req.add_header('cookie', ck); prev = urllib.request.urlopen(req).read().decode()
assert 'SAMPLE' in prev and 'TSTAUS33' in prev and 'Sample only' in prev
st, x = call('/api/invoices/preview?c=USD'); assert st == 401
ok('bank details from the bank letter: SWIFT and account checks; the client page shows MoMo, bank transfer in Ghana and SWIFT from abroad with the right intermediary bank per currency, copy buttons, OUR charges, no-IBAN note and a fraud warning; FEA used when opened; pounds supported; sample preview for the team')

# ---------- registration paid by invoice: a draft invoice is waiting ----------
item = {'code': 'INV1', 'kind': 'event', 'title': 'Investor roundtable', 'starts_at': '2026-12-01T10:00:00Z', 'currency': 'GHS', 'price': 750, 'published': True, 'capacity': 50, 'phase': 'open'}
st, d = call('/api/items', item, cookie=ck); assert st == 200, d
st, r = call('/api/register', {'item_code': 'INV1', 'full_name': 'Ingrid Berg', 'company': 'Nordic Wind AS', 'email': 'ingrid@nw.test', 'phone': '+4791234567', 'country': 'Norway', 'seats': 2,
    'consent': True, 'payment_method': 'invoice'}, headers={'x-real-ip': '10.77.1.1'})
assert st == 200, r
dr = json.loads(psql("select row_to_json(i) from invoices i where notes='Registration %s'" % r['reference']))
assert dr['number'] is None and dr['status'] == 'draft' and dr['bill_to']['residency'] == 'non_resident' and dr['bill_to']['company'] == 'Nordic Wind AS' and float(dr['taxable']) == 1500, dr
assert psql("select count(*) from tasks where title like 'Send the invoice to Nordic Wind AS%%'") == '1'
ok('a registration paid by invoice arrives as a draft invoice (client abroad marked non-resident) plus a task to send it')

# ---------- public settings stay private ----------
st, it = call('/api/items')
leak = json.dumps(it)
assert 'C0012345678' not in leak and 'GCB Bank' not in leak and '0202090000999' not in leak and 'TSTBGHAC' not in leak, 'tax and bank details must not be public'
ok('bank details and TIN never appear in the public items feed')

# ---------- Sign in with Google ----------
st, o = call('/api/auth/options'); assert o == {'google': True}, o
s_, loc, _, cks, _ = raw_req('GET', '/auth/google')
u = urlparse(loc); qs = parse_qs(u.query)
assert s_ == 302 and u.netloc == 'accounts.google.com' and qs['client_id'] == ['cid.apps.googleusercontent.com'] and qs['code_challenge_method'] == ['S256'], loc
assert qs['redirect_uri'] == ['http://127.0.0.1:4199/auth/google/callback'] and 'openid' in qs['scope'][0]
gc = [c for c in cks if c.startswith('gc_g=')][0].split(';')[0]; state = qs['state'][0]
assert 'HttpOnly' in cks[0] and 'Path=/auth/google' in cks[0]
def cb(st_, cookie, code='abc'):
    return raw_req('GET', '/auth/google/callback?code=%s&state=%s' % (code, st_), headers={'cookie': cookie})
now = int(time.time())
good = {'iss': 'https://accounts.google.com', 'aud': 'cid.apps.googleusercontent.com', 'exp': now + 600, 'email': 'Admin@gotham.test', 'email_verified': True}
# wrong state
s_, loc, *_ = cb('nope', gc); assert loc == '/admin?google=expired', loc
# tampered cookie
s_, loc, *_ = cb(state, gc[:-3] + 'xxx'); assert loc == '/admin?google=expired', loc
# user cancelled at Google
s_, loc, *_ = raw_req('GET', '/auth/google/callback?error=access_denied&state=' + state, headers={'cookie': gc}); assert loc == '/admin?google=cancelled', loc
# token for another app
GOOGLE['claims'] = {**good, 'aud': 'someone-else'}; s_, loc, *_ = cb(state, gc); assert loc == '/admin?google=failed', loc
GOOGLE['claims'] = {**good, 'email_verified': False}; s_, loc, *_ = cb(state, gc); assert loc == '/admin?google=failed', loc
GOOGLE['claims'] = {**good, 'exp': now - 10}; s_, loc, *_ = cb(state, gc); assert loc == '/admin?google=failed', loc
# a Google account that is not on the team
GOOGLE['claims'] = {**good, 'email': 'stranger@gmail.com'}; s_, loc, *_ = cb(state, gc); assert loc == '/admin?google=not_in_team', loc
assert psql("select count(*) from users where email='stranger@gmail.com'") == '0'
assert psql("select count(*) from audit_log where action='google_refused'") == '1'
# the team member: signed in
GOOGLE['claims'] = good; s_, loc, _, cks2, _ = cb(state, gc)
assert s_ == 302 and loc == '/admin', loc
assert GOOGLE['seen']['code_verifier'][0] and GOOGLE['seen']['client_secret'] == ['gsecret'] and GOOGLE['seen']['code'] == ['abc']
sess = [c for c in cks2 if c.startswith('gc_session=')][0].split(';')[0]
st, me = call('/api/me', cookie=sess); assert st == 200 and me['email'] == 'admin@gotham.test', me
# deactivated users cannot sign in with Google either
psql("insert into users(email, name, role, pw_hash, pw_salt, active) values ('gone@gotham.test','Gone','staff','x','x', false)")
GOOGLE['claims'] = {**good, 'email': 'gone@gotham.test'}; s_, loc, *_ = cb(state, gc); assert loc == '/admin?google=not_in_team', loc
assert psql("select count(*) from audit_log where action='login_google'") == '1'
# through the WordPress bridge only gc_session is passed on, so the state cookie is missing: the server's own copy is used, once
s_, loc, *_ = raw_req('GET', '/auth/google'); st2 = parse_qs(urlparse(loc).query)['state'][0]
GOOGLE['claims'] = good; s_, loc, *_ = raw_req('GET', '/auth/google/callback?code=abc&state=' + st2); assert loc == '/admin', loc
s_, loc, *_ = raw_req('GET', '/auth/google/callback?code=abc&state=' + st2); assert loc == '/admin?google=expired', 'state is single use'
s_, loc, *_ = raw_req('GET', '/auth/google/callback?code=abc&state=madeup'); assert loc == '/admin?google=expired', loc
ok('Sign in with Google (also through the WordPress bridge, state single-use): PKCE + signed state, checks audience, issuer, expiry and verified email; only existing active team members get in; nobody is auto-created')

print('PASSED')
