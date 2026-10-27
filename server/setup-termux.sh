#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")"

if [ -z "${TERMUX_VERSION:-}" ] && [ "${PREFIX:-}" != "/data/data/com.termux/files/usr" ]; then
  echo 'This setup script is intended for the Termux application on Android.'
  echo 'Use node test.js for local backend verification on a computer.'
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  pkg install -y nodejs-lts
fi

node -e 'if (Number(process.versions.node.split(".")[0]) < 20) { console.error("FunX requires Node.js 20 or newer"); process.exit(1) }'

if [ ! -f .env ]; then
  SECRET="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))')"
  printf 'FUNX_ADMIN_SECRET=%s\nPORT=8787\nHOST=127.0.0.1\n' "$SECRET" > .env
  chmod 600 .env
  echo 'New secure .env was created in Termux private storage.'
else
  echo 'Existing .env retained; your server admin key was not changed.'
fi
mkdir -p data
chmod 700 data 2>/dev/null || true

echo 'Termux setup complete.'
echo 'Run: bash test-termux.sh'
echo 'Then: bash run-termux.sh'
