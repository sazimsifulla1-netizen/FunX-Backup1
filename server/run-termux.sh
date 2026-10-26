#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo 'Missing .env; first run bash setup-termux.sh' >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js missing; install using pkg install nodejs-lts' >&2
  exit 1
fi
set -a
# The file is created locally by setup-termux.sh and should never be shared.
. ./.env
set +a
if [ "${#FUNX_ADMIN_SECRET}" -lt 20 ]; then
  echo 'FUNX_ADMIN_SECRET missing or too short in .env' >&2
  exit 1
fi
node --check server.js
printf 'Starting FunX server on http://%s:%s\n' "${HOST:-127.0.0.1}" "${PORT:-8787}"
printf 'Use Ctrl+C to stop. Do not close this Termux session.\n'
exec node server.js
