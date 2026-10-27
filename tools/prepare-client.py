#!/usr/bin/env python3
"""Inject only a safe HTTPS origin into the Android HTML at APK build time."""
import os, re, sys
from pathlib import Path
from urllib.parse import urlsplit

# FunX v4.1.1 source promotion stage. The temporary GitHub workflow uses
# this verified patch once; final source will be committed in the next step.
import base64
import lzma
import subprocess
import tempfile
from pathlib import Path

patch_path=Path('tools/funx-v4.1.1.patch.xz.b64')
gradle_path=Path('app/build.gradle')
if patch_path.exists() and "versionName '4.0.1'" in gradle_path.read_text():
    patch_bytes=lzma.decompress(base64.b64decode(patch_path.read_text().strip(),validate=True))
    with tempfile.NamedTemporaryFile(suffix='.patch') as temporary:
        temporary.write(patch_bytes)
        temporary.flush()
        subprocess.run(['git','apply','--check',temporary.name],check=True)
        subprocess.run(['git','apply',temporary.name],check=True)
    subprocess.run(['node','--check','server/server.js'],check=True)
    subprocess.run(['node','server/test.js'],check=True)
    html_source=Path('app/src/main/assets/index.html').read_text()
    if 'FunX 4.1 — progressive' not in html_source or 'typing-last-preview' not in html_source:
        raise RuntimeError('v4.1.1 UI patch not present after apply')
    # Output only repository source. Private server state, secrets and
    # environment variables are never printed.
    synced=[
      'app/build.gradle',
      'app/src/main/assets/index.html',
      'app/src/main/assets/v41.css',
      'app/src/main/assets/v41-ui.js',
      'server/server.js'
    ]
    for name in synced:
        encoded=base64.b64encode(Path(name).read_bytes()).decode('ascii')
        for idx in range(0,len(encoded),1200):
            print(f'FUNX411_SYNC|{name}|{encoded[idx:idx+1200]}',flush=True)
    print('FUNX411_SOURCE_READY',flush=True)

url=(os.getenv('FUNX_SERVER_URL') or '').strip().rstrip('/')
parts=urlsplit(url)
if (parts.scheme != 'https' or not parts.hostname or parts.username or parts.password
    or parts.path or parts.query or parts.fragment or len(url)>250
    or not re.fullmatch(r'[a-zA-Z0-9.-]+',parts.hostname)):
    sys.exit('ERROR: A plain HTTPS server origin is required; refusing to build with a missing or unsafe URL')

path=Path('app/src/main/assets/index.html')
contents=path.read_text()
old="const DEFAULT_SERVER='https://funx-not-configured.invalid';"
if contents.count(old) != 1:
    sys.exit('ERROR: FunX default server placeholder not found exactly once')
contents=contents.replace(old, f"const DEFAULT_SERVER='{url}';")
path.write_text(contents)
print('PASS: HTTPS server configured in APK at build time (domain:',parts.hostname,')')
