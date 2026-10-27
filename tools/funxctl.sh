#!/usr/bin/env bash
# FunX v3.5 Android/Termux setup and test installer. No remote code downloads beyond Termux packages/GitHub tooling.
set -Eeuo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="$ROOT/server"
WORK="$HOME/.funx-control"
PRIV="$HOME/.funx-private"
REPO="sazimsifulla1-netizen/FunX"
PORT=8787
mkdir -p "$WORK" "$PRIV"
chmod 700 "$WORK" "$PRIV" 2>/dev/null || true

note(){ printf '\n[FunX] %s\n' "$*"; }
fail(){ printf '\n[FunX ERROR] %s\n' "$*" >&2; exit 1; }
termux_check(){ [[ -d /data/data/com.termux/files/home && "$HOME" = /data/data/com.termux/files/home ]] || fail 'Run this script in the Termux app on your Android phone.'; }
has(){ command -v "$1" >/dev/null 2>&1; }

install_dependencies(){
  local packages=()
  has node || packages+=(nodejs-lts)
  has cloudflared || packages+=(cloudflared)
  has curl || packages+=(curl)
  has git || packages+=(git)
  has gh || packages+=(gh)
  has unzip || packages+=(unzip)
  if (( ${#packages[@]} )); then note "Installing: ${packages[*]}"; pkg update -y; pkg install -y "${packages[@]}"; fi
  if [[ ! -d "$HOME/storage/downloads" ]] && has termux-setup-storage; then
    note 'Android storage permission is required to put the final APK in Downloads.'
    termux-setup-storage || true
  fi
}

setup_server(){
  note 'Preparing server; existing accounts, messages and Admin Secret are retained.'
  (cd "$SERVER" && bash setup-termux.sh && bash test-termux.sh)
}
local_health(){ curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/health" 2>/dev/null | grep -q '"service":"FunX"'; }

# Only stop a process after confirming that this port responds as FunX and its process command is a known FunX Node server.
stop_old_funx(){
  if ! local_health; then return 0; fi
  local pids='' pid args
  if has lsof; then
    pids="$(lsof -nP -t -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null | sort -un || true)"
  fi
  if [[ -z "$pids" ]] && has ps; then
    pids="$(ps -ef 2>/dev/null | awk '/[n]ode (.*\/)?server\.js([[:space:]]|$)/ {print $2}' || true)"
  fi
  [[ -n "$pids" ]] || fail 'Old FunX server is active, but its process could not be safely identified. Open its Termux session, press Ctrl+C, and run this installer again.'
  if [[ "$(printf '%s\n' "$pids" | grep -Ec '^[0-9]+$')" -gt 1 ]]; then
    fail 'Multiple Node processes may be active. For safety, stop the old FunX Session using Ctrl+C, then retry.'
  fi
  for pid in $pids; do
    args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    if [[ "$args" == *'node server.js'* || "$args" == *'/FunX/server/server.js'* ]]; then
      note "Stopping old FunX Node instance (PID $pid)."
      kill "$pid" 2>/dev/null || true
    fi
  done
  for i in {1..15}; do
    local_health || return 0
    sleep 1
  done
  fail 'FunX server remains active on port 8787. Press Ctrl+C in the old server session before running again.'
}

start_server(){
  stop_old_funx
  note 'Starting FunX server.'
  (cd "$SERVER" && nohup bash run-termux.sh > "$WORK/server.log" 2>&1 & echo "$!" > "$WORK/server.pid")
  for i in {1..20}; do if local_health; then note 'PASS: http://127.0.0.1:8787/health'; return; fi; sleep 1; done
  tail -n 35 "$WORK/server.log" || true
  fail 'Server failed to start.'
}

url_from_log(){
  [[ -f "$WORK/tunnel.log" ]] || return 0
  grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$WORK/tunnel.log" | head -n 1 || true
}
start_tunnel(){
  [[ -f "$WORK/tunnel.pid" ]] && kill "$(cat "$WORK/tunnel.pid")" 2>/dev/null || true
  note 'Creating new Cloudflare Quick Tunnel. This public URL is TEMPORARY.'
  nohup cloudflared tunnel --url http://127.0.0.1:8787 > "$WORK/tunnel.log" 2>&1 < /dev/null &
  echo "$!" > "$WORK/tunnel.pid"
  local url=''
  for i in {1..35}; do
    url="$(url_from_log)"
    if [[ -n "$url" ]] && curl -fsS --max-time 8 "$url/health" 2>/dev/null | grep -q '"service":"FunX"'; then
       printf '%s\n' "$url" > "$WORK/current-url.txt"
       note "PASS: HTTPS FunX API reachable: $url"
       return
    fi
    sleep 2
  done
  tail -n 30 "$WORK/tunnel.log" || true
  fail 'Tunnel did not become reachable. Check internet connection and retry: bash tools/funxctl.sh start'
}

signing_setup(){
  note 'Setting up the same private Android signing key for future APK updates.'
  if ! has keytool; then
    note 'Installing Java keytool (one time).'
    pkg install -y openjdk-17
  fi
  local keystore="$PRIV/funx-upload.p12" passwd="$PRIV/signing-pass.txt"
  if [[ ! -s "$keystore" ]]; then
    node -e 'process.stdout.write(require("crypto").randomBytes(25).toString("hex"))' > "$passwd"
    keytool -genkeypair -noprompt -storetype PKCS12 -keystore "$keystore" -alias funx-upload \
      -keyalg RSA -keysize 3072 -validity 3650 \
      -storepass "$(cat "$passwd")" -keypass "$(cat "$passwd")" \
      -dname 'CN=FunX,O=Sazim Codex ldt.,C=BD' >/dev/null 2>&1
    chmod 600 "$keystore" "$passwd"
  fi
  [[ -s "$passwd" ]] || fail 'Signing password is missing; restore it from backup before continuing. Do not generate a different key for the same APK.'
  note 'Saving the signing key as private GitHub Actions repository secrets. Never commit the key file.'
  base64 "$keystore" | tr -d '\n' | gh secret set FUNX_SIGNING_KEYSTORE_B64 -R "$REPO"
  gh secret set FUNX_SIGNING_PASSWORD -R "$REPO" < "$passwd"
}

github_login(){
  if ! gh auth status >/dev/null 2>&1; then
    note 'Authorize GitHub CLI in the browser when prompted.'
    gh auth login --hostname github.com --git-protocol https --web
  fi
  gh auth setup-git
  gh repo view "$REPO" >/dev/null || fail 'Could not access the FunX GitHub repository with this account.'
}

safe_push(){
  cd "$ROOT"
  [[ -d .git ]] || fail 'Existing FunX Git repository not found. Extract this ZIP on top of your existing ~/FunX project.'
  git branch --show-current | grep -qx main || fail 'Please switch your local FunX repository to the main branch.'
  git remote get-url origin >/dev/null || fail 'FunX GitHub remote origin is not configured.'
  git config user.name 'sazimsifulla1-netizen'
  git config user.email 'sazimsifulla1-netizen@users.noreply.github.com'
  git add .github/workflows/build-apk.yml app/src/main/assets/index.html app/src/main/java/com/sazimcodex/funx/MainActivity.java app/build.gradle server/setup-termux.sh tools/ START_FUNX.sh INSTALL_FUNX_BN.md FUNX_V3_6_REGISTRATION_LOCATION_BN.md
  if ! git diff --cached --quiet; then
    git commit -m 'FunX v3.6 registration location permission flow'
    git push origin main
  fi
}

build_apk(){
  [[ -s "$WORK/current-url.txt" ]] || fail 'No working tunnel URL yet. Run: bash START_FUNX.sh'
  local url run_id folder
  url="$(cat "$WORK/current-url.txt")"
  curl -fsS --max-time 15 "$url/health" | grep -q '"service":"FunX"' || fail 'Current tunnel URL is no longer reachable. Run setup again.'
  github_login
  signing_setup
  gh variable set FUNX_SERVER_URL -R "$REPO" --body "$url" || note 'WARNING: Could not set repo variable (manual workflow dispatch will still receive this URL).'
  safe_push
  note "Starting APK Build with $url"
  local previous_id=''
  previous_id="$(gh run list -R "$REPO" -w build-apk.yml --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
  gh workflow run build-apk.yml -R "$REPO" --ref main -f "server_url=$url"
  run_id=''
  for i in {1..20}; do
    run_id="$(gh run list -R "$REPO" -w build-apk.yml --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
    [[ "$run_id" =~ ^[0-9]+$ && "$run_id" != "$previous_id" ]] && break
    sleep 3
  done
  [[ "$run_id" =~ ^[0-9]+$ && "$run_id" != "$previous_id" ]] || fail 'Could not find the new GitHub Actions Build ID.'
  note "Watching GitHub Actions build $run_id"
  gh run watch "$run_id" -R "$REPO" --exit-status || fail "APK build failed. See https://github.com/$REPO/actions/runs/$run_id"
  folder="$HOME/storage/downloads/FunX-NEW"
  [[ -d "$HOME/storage/downloads" ]] || fail 'Downloads permission not granted. Run termux-setup-storage and allow access.'
  mkdir -p "$folder"
  gh run download "$run_id" -R "$REPO" -n FunX-debug-apk -D "$folder"
  if [[ ! -f "$folder/app-debug.apk" ]]; then
    fail 'APK artifact downloaded but app-debug.apk not found. Check folder: ~/storage/downloads/FunX-NEW'
  fi
  note "SUCCESS: APK saved to $folder/app-debug.apk"
  note 'Opening Android APK installer (you must tap Install/Update yourself).'
  termux-open "$folder/app-debug.apk" || true
}

status(){
  if local_health; then note 'Local server: ONLINE'; else note 'Local server: OFFLINE'; fi
  if [[ -s "$WORK/current-url.txt" ]]; then
    local url; url="$(cat "$WORK/current-url.txt")"
    if curl -fsS --max-time 10 "$url/health" 2>/dev/null | grep -q '"service":"FunX"'; then
      note "Public HTTPS server: ONLINE ($url)"
    else note 'Public tunnel: OFFLINE or address changed'; fi
  else note 'Public tunnel: not configured'; fi
  [[ -f "$HOME/storage/downloads/FunX-NEW/app-debug.apk" ]] && note 'APK: Downloads/FunX-NEW/app-debug.apk' || true
}

case "${1:-full}" in
  full)
    termux_check; install_dependencies; setup_server; start_server; start_tunnel
    build_apk; note 'DONE. Keep Termux alive for this temporary test server; production needs permanent hosting.'
    ;;
  server)
    termux_check; install_dependencies; setup_server; start_server; start_tunnel
    ;;
  apk)
    termux_check; install_dependencies; build_apk
    ;;
  status) status ;;
  *) printf 'Usage: bash tools/funxctl.sh [full|server|apk|status]\n'; exit 2 ;;
esac
