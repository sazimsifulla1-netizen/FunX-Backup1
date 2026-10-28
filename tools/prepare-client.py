#!/usr/bin/env python3
"""Verify FunX source and inject the configured HTTPS API origin at APK build time."""
import os, re, sys, subprocess
from pathlib import Path
from urllib.parse import urlsplit

# Refuse to publish an APK if its new UI or Node server code is inconsistent.
for command in (['node','--check','server/server.js'],
                ['node','server/test.js'],
                ['node','tools/test-v41.js'],
                ['node','tools/test-v42.js']):
    subprocess.run(command,check=True)

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
print('PASS: FunX 4.2.0 tests and HTTPS server configuration; domain:',parts.hostname)
