#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js missing. First run bash setup-termux.sh' >&2
  exit 1
fi
if [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo 'Node.js 20+ required. Run: pkg upgrade nodejs-lts' >&2
  exit 1
fi
printf 'Node version: '; node --version
printf 'Checking server JavaScript syntax...\n'; node --check server.js
printf 'Checking test JavaScript syntax...\n'; node --check test.js
printf 'Running isolated FunX integration tests (does not change actual accounts)...\n'
node test.js
printf '\nPASS: FunX backend test suite completed.\n'
