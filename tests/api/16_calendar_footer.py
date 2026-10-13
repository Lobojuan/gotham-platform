# The calendar: one place for everything with a date (events, tasks, next steps, deals won/lost, campaigns scheduled and
# sent, calls and meetings, registrations and payments per day, sponsor dates), what staff may see, moving things by date,
# scheduled campaigns starting on time, each person's private calendar feed, the public events feed.
# Also: campaign emails name Carlson Capital Ltd (with Uffe's number) only when marked renewable energy / AI.
import subprocess, time, json, os, urllib.request, urllib.error, sys, atexit, datetime as dt
DB = os.environ.get('TEST_DATABASE_URL', 'postgres://test@127.0.0.1:5439/gotham_test')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(os.path.join(ROOT, 'apps', 'crm'))
env = dict(os.environ); env.update({'DATABASE_URL': DB, 'SESSION_SECRET': 't', 'PORT': '4199', 'ADMIN_EMAIL': 'admin', 'ADMIN_PASSWORD': 'ownerpass123',
    'ADMIN_NAME': 'Admin', 'MEDIA_DIR': '/tmp/mediatest', 'PUBLIC_URL': 'http://127.0.0.1:4199', 'SITE_URL': 'http://example.org'})
os.makedirs('/tmp/mediatest', exist_ok=True)
srv = subprocess.Popen(['node', 'server.js'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
atexit.register(lambda: srv.poll() is None and srv.terminate())
B = 'http://127.0.0.1:4199'
def call(path, data=None, method=None, cookie=None, raw=False):
    req = urllib.request.Request(B + path, data=json.dumps(data).encode() if data is not None else None, method=method or ('POST' if data is not None else 'GET'))
    req.add_header('content-type', 'application/json')
    if cookie: req.add_header('cookie', cookie)
    try:
        r = urllib.request.urlopen(req, timeout=60); b = r.read()
        return r.status, (b.decode() if raw else json.loads(b or b'{}')), r.headers
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, (b.decode() if raw else json.loads(b or b'{}')), e.headers
        except Exception: return e.code, b[:300], e.headers
for _ in range(60):
    try:
        if call('/api/health')[0] == 200: break
    except Exception: pass
    time.sleep(0.4)
else: print('NO START'); print(srv.stdout.read()[:3000]); sys.exit(1)
def psql(sql): return subprocess.run(['psql', DB, '-qAtc', sql], capture_output=True, text=True, check=True).stdout.strip()
ok = lambda m: print('  ok', m)
psql('update users set must_change=false')
def login(e, p): return call('/api/login', {'email': e, 'password': p})[2]['set-cookie'].split(';')[0]
ck = login('admin', 'ownerpass123')
today = dt.date.today(); D = lambda n: (today + dt.timedelta(days=n)).isoformat()

# ---------- footer: Carlson only on renewable energy / AI campaigns ----------
st, c, _ = call('/api/contacts', {'company': 'Volta Foods', 'full_name': 'Adwoa Boateng', 'email': 'adwoa@volta.example', 'phone': '0244123456'}, cookie=ck)
cid = c['id']
for tpl in ('invitation', 'plain'):
    st, d, _ = call('/api/campaigns', {'name': 'News ' + tpl, 'subject': 'News', 'intro': 'Hello', 'template': tpl, 'daily_limit': 40}, cookie=ck)
    pv = call('/api/campaigns/%d/preview' % d['id'], cookie=ck)[1]['html']
    assert 'Carlson' not in pv and '239 5548' not in pv and '041 6627' in pv, pv[-900:]
    st, d2, _ = call('/api/campaigns', {'id': d['id'], 'name': 'Solar ' + tpl, 'subject': 'Solar', 'intro': 'Hello', 'template': tpl, 'daily_limit': 40, 'carlson': True}, cookie=ck)
    pv = call('/api/campaigns/%d/preview' % d['id'], cookie=ck)[1]['html']
    assert 'Carlson Capital Ltd' in pv and '239 5548' in pv, pv[-900:]
ok('campaign emails carry Gotham and its own number; Carlson and +233 55 239 5548 only when marked renewable energy / AI')
src = open('server.js').read()
assert 'strategic partnership with Carlson' not in src and 'in partnership with Carlson Capital Ltd</span>' not in src
ok('system emails and QR posters no longer name Carlson')

# ---------- one of everything ----------
st, d, _ = call('/api/items', {'code': 'F9', 'kind': 'event', 'title': 'Investor Breakfast', 'venue': 'Kempinski Accra', 'starts_at': D(5) + 'T08:00:00Z',
    'ends_at': D(5) + 'T11:00:00Z', 'price': 100, 'currency': 'GHS', 'capacity': 40, 'published': True, 'phase': 'open'}, cookie=ck); assert st == 200, d
st, d, _ = call('/api/items', {'code': 'D1', 'kind': 'event', 'title': 'Secret Draft', 'starts_at': D(6) + 'T08:00:00Z', 'price': 0, 'currency': 'GHS', 'published': False}, cookie=ck); assert st == 200, d
st, d, _ = call('/api/items', {'code': 'F10', 'kind': 'event', 'title': 'Maker Showcase', 'starts_at': D(9) + 'T08:00:00Z', 'ends_at': D(9) + 'T12:00:00Z',
    'price': 0, 'currency': 'GHS', 'published': True, 'event_plan': {'purpose': 'Show local makers', 'owner': 'Joy', 'client_name': 'Private client',
    'checklist': [{'task': 'Confirm venue', 'owner': 'Joy', 'due': D(4), 'status': 'doing'}, {'task': 'Print badges', 'owner': 'Team', 'due': D(7), 'status': 'done'}]}}, cookie=ck); assert st == 200, d
st, t1, _ = call('/api/tasks', {'title': 'Call Adwoa about the breakfast', 'due_at': D(1) + 'T09:30:00Z', 'contact_id': cid}, cookie=ck); assert st == 200, t1
st, dl, _ = call('/api/deals', {'title': 'Volta sponsorship', 'contact_id': cid, 'kind': 'sponsorship', 'value': 25000, 'stage': 'proposal', 'next_step': 'Send the proposal', 'next_date': D(2)}, cookie=ck); assert st == 200, dl
st, n1, _ = call('/api/notes', {'contact_id': cid, 'kind': 'meeting', 'body': 'Met at the office, keen on headline tier'}, cookie=ck); assert st == 200, n1
st, sp, _ = call('/api/sponsors', {'name': 'Stanbic', 'tier': 'headline', 'starts_on': D(3), 'ends_on': D(20), 'published': True}, cookie=ck); assert st == 200, sp
st, r, _ = call('/api/register', {'item_code': 'F9', 'seats': 2, 'company': 'Adwoa Farms', 'full_name': 'Kofi Mensah', 'email': 'kofi@farms.example', 'phone': '0244000111',
    'country': 'Ghana', 'sector': 'Agriculture', 'consent': True, 'payment_method': 'momo'}); assert st == 200, r
psql("update registrations set paid=true, paid_at=now() where email='kofi@farms.example'")
psql("update deals set closed_at=now(), stage='won' where id=%d" % dl['id']); st, dl2, _ = call('/api/deals', {'title': 'Open deal', 'contact_id': cid, 'kind': 'consulting', 'value': 5000, 'stage': 'lead', 'next_step': 'Book a call', 'next_date': D(2)}, cookie=ck)
cam = call('/api/campaigns', cookie=ck)[1]['rows'][0]
st, sc, _ = call('/api/campaigns/%d/start' % cam['id'], {'at': D(4) + 'T07:00:00Z'}, cookie=ck); assert st == 200 and sc['audience'] == 1, sc
st, bad, _ = call('/api/campaigns/%d/start' % cam['id'], {'at': '2020-01-01T00:00:00Z'}, cookie=ck); assert st == 400 and bad['error'] == 'bad_time', bad
ok('campaign scheduled for a future time; a past time is refused')

st, cal, _ = call('/api/calendar?from=%s&to=%s' % (D(-3), D(30)), cookie=ck); assert st == 200, cal
types = {}; [types.setdefault(e['type'], []).append(e) for e in cal['rows']]
need = {'event', 'eventtask', 'task', 'deal', 'closed', 'campaign', 'activity', 'registration', 'payment', 'sponsor'}
assert need <= set(types), sorted(types)
ev = [e for e in types['event'] if e['id'] == 'F9'][0]; assert ev['sub'].startswith('Kempinski') and '2/40 registered' in ev['sub'], ev
assert any(e['id'] == 'D1' and 'draft' in e['sub'] for e in types['event'])
plan_tasks = [e for e in types['eventtask'] if e['link'] == {'kind': 'event', 'id': 'F10'}]
assert len(plan_tasks) == 2 and any(e['title'] == 'Confirm venue' and e['start'] == D(4) and not e['done'] for e in plan_tasks), plan_tasks
assert any(e['title'] == 'Print badges' and e['done'] for e in plan_tasks), plan_tasks
st, deadline_only, _ = call('/api/calendar?from=%s&to=%s' % (D(3), D(5)), cookie=ck)
assert not any(e['id'] == 'F10' and e['type'] == 'event' for e in deadline_only['rows'])
assert any(e['title'] == 'Confirm venue' and e['type'] == 'eventtask' for e in deadline_only['rows']), deadline_only['rows']
assert types['task'][0]['link'] == {'kind': 'task', 'id': t1['id']} and types['task'][0]['movable'] and 'Volta Foods' in types['task'][0]['sub']
assert types['deal'][0]['title'] == 'Book a call' and types['deal'][0]['start'] == D(2)
assert types['closed'][0]['title'] == 'Won: Volta sponsorship'
assert any(e['title'].startswith('Starts:') and e['movable'] for e in types['campaign'])
assert types['activity'][0]['title'] == 'Meeting: Volta Foods' and types['activity'][0]['link'] == {'kind': 'rec', 'id': cid}
assert types['registration'][0]['title'] == '1 registration' and '2 seats' in types['registration'][0]['sub']
assert types['payment'][0]['title'].startswith('1 payment · GHS'), types['payment']
assert {e['title'] for e in types['sponsor']} == {'Sponsor starts: Stanbic', 'Sponsor ends: Stanbic'}
ok('calendar holds events (seats, drafts), tasks, next steps, won deals, scheduled campaigns, meetings, registrations, payments, sponsor dates')
st, one, _ = call('/api/calendar?from=%s&to=%s&types=event,task' % (D(-3), D(30)), cookie=ck)
assert {e['type'] for e in one['rows']} == {'event', 'task'}
st, e400, _ = call('/api/calendar?from=%s&to=%s' % (D(0), D(200)), cookie=ck); assert st == 400
st, e401, _ = call('/api/calendar?from=%s&to=%s' % (D(0), D(5))); assert st == 401
ok('type filter works; ranges over four months and signed-out calls are refused')

# ---------- moving things by date ----------
call('/api/tasks/%d' % t1['id'], {'due_at': D(3) + 'T09:30:00Z'}, method='PATCH', cookie=ck)
call('/api/deals/%d' % dl2['id'], {'next_date': D(7)}, method='PATCH', cookie=ck)
call('/api/campaigns/%d/start' % cam['id'], {'at': D(8) + 'T07:00:00Z'}, cookie=ck)
cal = call('/api/calendar?from=%s&to=%s' % (D(-3), D(30)), cookie=ck)[1]['rows']
assert [e for e in cal if e['key'] == 'task-%d' % t1['id']][0]['start'].startswith(D(3))
assert [e for e in cal if e['key'] == 'deal-%d' % dl2['id']][0]['start'] == D(7)
assert [e for e in cal if e['key'] == 'camp-%d' % cam['id']][0]['start'].startswith(D(8))
ok('a task, a next step and a scheduled campaign move to another day')

# ---------- staff see only what they should ----------
st, u, _ = call('/api/users', {'name': 'Door Staff', 'email': 'door', 'role': 'staff'}, cookie=ck)
psql("update users set must_change=false where email='door'")
sck = login('door', u['password'])
call('/api/tasks', {'title': 'Print badges', 'due_at': D(1) + 'T10:00:00Z', 'assignee': 'door'}, cookie=ck)
st, sc2, _ = call('/api/calendar?from=%s&to=%s' % (D(-3), D(30)), cookie=sck)
st_types = {e['type'] for e in sc2['rows']}
assert st_types <= {'event', 'task', 'registration', 'payment'} and 'event' in st_types, st_types
assert [e['title'] for e in sc2['rows'] if e['type'] == 'task'] == ['Print badges'] and not any(e['id'] == 'D1' for e in sc2['rows'] if e['type'] == 'event')
assert not any(e['type'] == 'eventtask' or 'Private client' in e.get('sub', '') for e in sc2['rows']), sc2['rows']
assert not any('GHS' in e['title'] for e in sc2['rows'])
ok('staff see events, their own tasks and registration counts only: no deals, clients, campaigns, drafts or money')

# ---------- scheduled campaign starts by itself ----------
psql("update campaigns set starts_at=now() - interval '1 minute' where id=%d" % cam['id'])
srv.terminate(); srv.wait(5)   # the job loop runs at start-up and every 15 minutes
srv = subprocess.Popen(['node', 'server.js'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
atexit.register(lambda: srv.poll() is None and srv.terminate())
for _ in range(40):
    if psql('select status from campaigns where id=%d' % cam['id']) == 'sending': break
    time.sleep(0.5)
for _ in range(40):
    try:
        if call('/api/health')[0] == 200: break
    except Exception: time.sleep(0.4)
ck = login('admin', 'ownerpass123'); sck = login('door', u['password'])
assert psql('select status from campaigns where id=%d' % cam['id']) == 'sending', psql('select status from campaigns where id=%d' % cam['id'])
assert psql('select count(*) from campaign_sends where campaign_id=%d' % cam['id']) == psql("select count(*) from contacts where email is not null") == '2'   # the registrant joined the list before the start
ok('a scheduled campaign starts on its own when its time comes, queue built then')

# ---------- private phone feed ----------
st, f, _ = call('/api/calendar/feed', cookie=ck); assert st == 200 and f['url'].endswith('.ics') and f['webcal'].startswith('webcal:'), f
path = f['url'].replace(B, '')
st, ics, h = call(path, raw=True)
assert st == 200 and h['content-type'].startswith('text/calendar') and ics.startswith('BEGIN:VCALENDAR') and '\r\n' in ics, (st, ics[:200])
assert 'SUMMARY:Investor Breakfast' in ics and 'LOCATION:Kempinski Accra' in ics and 'Call Adwoa about the breakfast' in ics and 'SUMMARY:Book a call' in ics, ics
assert all(len(l.encode()) <= 75 for l in ics.split('\r\n')), 'lines not folded'
assert 'Meeting: Volta' not in ics and 'registration' not in ics.lower().split('x-wr-calname')[0]
ok('private feed: events, my tasks and next steps, in valid iCalendar (CRLF, folded lines)')
st, f2, _ = call('/api/calendar/feed', {}, cookie=ck); assert f2['url'] != f['url']
assert call(path, raw=True)[0] == 404 and call(f2['url'].replace(B, ''), raw=True)[0] == 200
ok('resetting the link kills the old one at once')
st, sf, _ = call('/api/calendar/feed', cookie=sck); sics = call(sf['url'].replace(B, ''), raw=True)[1]
assert 'Print badges' in sics and 'Book a call' not in sics and 'Call Adwoa' not in sics
psql("update users set active=false where email='door'"); assert call(sf['url'].replace(B, ''), raw=True)[0] == 404
ok("staff feed holds only their own tasks; turning a person's access off stops their feed")

# ---------- public events feed ----------
st, pub, h = call('/cal/events.ics', raw=True)
assert st == 200 and 'SUMMARY:Investor Breakfast' in pub and 'Secret Draft' not in pub and 'Adwoa' not in pub and 'register?e=F9' in pub, pub
st, one, h = call('/cal/event/f9.ics', raw=True)
assert st == 200 and 'attachment' in h['content-disposition'] and one.count('BEGIN:VEVENT') == 1 and 'DTSTART:' + D(5).replace('-', '') + 'T080000Z' in one, one
assert call('/cal/event/D1.ics', raw=True)[0] == 404 and call('/cal/event/NOPE.ics', raw=True)[0] == 404
ok('public feed and single-event file: published events only, no drafts, no client data')
print('\nALL CALENDAR AND FOOTER TESTS PASSED')
