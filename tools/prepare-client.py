#!/usr/bin/env python3
"""Inject only a safe HTTPS origin into the Android HTML at APK build time."""
import os, re, sys
from pathlib import Path
from urllib.parse import urlsplit

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
