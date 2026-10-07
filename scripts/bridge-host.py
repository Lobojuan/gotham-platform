#!/usr/bin/env python3
"""Preserve the bridge hostname only in Gotham's Caddy block, during guarded CRM deploys.

Caddy normally replaces X-Forwarded-Host. Copy it into a dedicated header before
proxying; the CRM trusts this value only with the WordPress bridge's secret key.
Other sites and the normal X-Forwarded-* trust policy are unchanged.
"""
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

DIRECTIVE = 'header_up X-GC-Forwarded-Host {http.request.header.X-Forwarded-Host}'


def patched(text):
    pattern = r'(reverse_proxy gotham-crm:4100 \{\n)([^\n]*header_up X-Real-IP \{remote_host\}\n)(\s*\})'
    if text.count(DIRECTIVE) == 1 and re.search(r'reverse_proxy gotham-crm:4100 \{\s*header_up X-Real-IP \{remote_host\}\s*' + re.escape(DIRECTIVE), text):
        return text
    if text.count('reverse_proxy gotham-crm:4100 {') != 1 or len(re.findall(pattern, text)) != 1:
        raise ValueError('Unexpected Gotham Caddy block; refusing to change the shared proxy')
    return re.sub(pattern, lambda m: m[1] + m[2] + re.match(r'\s*', m[2])[0] + DIRECTIVE + '\n' + m[3], text)


def deploy():
    path = Path('/srv/nururoute/repo/deploy/oracle/Caddyfile')
    original = path.read_text(); updated = patched(original)
    if original == updated:
        print('  bridge hostname forwarding already installed'); return
    backup = path.with_name('Caddyfile.gotham-backup-' + datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S'))
    shutil.copy2(path, backup)
    # In-place write preserves the inode mounted into the running Caddy container.
    def caddy(command):
        subprocess.run(['docker', 'exec', 'oracle-caddy-1', 'caddy', command, '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'], check=True, stdout=subprocess.DEVNULL)
    try:
        path.write_text(updated)
        caddy('validate'); caddy('reload')
    except BaseException:
        path.write_text(original)
        caddy('reload')
        raise
    print('  bridge hostname forwarding validated and reloaded; backup ' + str(backup))


if __name__ == '__main__':
    deploy()
