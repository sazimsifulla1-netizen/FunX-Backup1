#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
url="http://127.0.0.1:${PORT:-8787}/health"
if command -v curl >/dev/null 2>&1; then
  if curl --fail --silent --show-error --max-time 6 "$url"; then
    echo
    echo 'PASS: FunX server is responding.'
  else
    echo 'FAIL: No FunX server response. Run bash run-termux.sh in another Termux session.' >&2
    exit 1
  fi
else
  node - "$url" <<'NODE'
fetch(process.argv[2]).then(async r=>{let j=await r.json();if(!r.ok||j.service!=='FunX')process.exitCode=1;console.log(JSON.stringify(j));}).catch(e=>{console.error('Server unavailable:',e.message);process.exitCode=1;});
NODE
fi
