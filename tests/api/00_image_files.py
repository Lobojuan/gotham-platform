# The server image copies its files one by one (apps/crm/Dockerfile). A new module imported by server.js but not
# copied makes the live server crash on start (2 Oct 2026: the receptionist module, site down with 502 until fixed).
import os, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
crm = os.path.join(ROOT, 'apps', 'crm')
docker = open(os.path.join(crm, 'Dockerfile')).read()
copied = set()
for line in docker.splitlines():
    if line.startswith('COPY ') and '--from' not in line:
        copied.update(line.split()[1:-1])
needed = set()
for f in [x for x in os.listdir(crm) if x.endswith('.js')]:
    src = open(os.path.join(crm, f)).read()
    needed.update(m for m in re.findall(r"from\s+['\"]\./([\w./-]+)['\"]", src))
    needed.update(m for m in re.findall(r"import\(\s*['\"]\./([\w./-]+)['\"]", src))
needed.add('server.js')
missing = sorted(n for n in needed if n not in copied and not any(n.startswith(c.rstrip('/') + '/') for c in copied))
assert not missing, 'not copied into the server image: %s' % missing
for f in ['schema.sql', 'assistant.md', 'tts.py']: assert f in copied, f
print('  ok every module server.js loads is copied into the server image:', ', '.join(sorted(needed)))
print('PASSED')
