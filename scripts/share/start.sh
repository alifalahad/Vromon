#!/usr/bin/env bash
# Share Vromon with friends from this Mac, over free Cloudflare quick tunnels.
#
#   scripts/share/start.sh            (Ctrl+C stops everything)
#
# - Starts a second backend on 127.0.0.1:8002 in production mode (sign-in required, no dev
#   shortcuts), next to the usual development one on 8001. Both use the same database.
# - Opens a tunnel to it and publishes the tunnel's address to the config file the shared
#   app reads at start, so the APK never needs rebuilding when the address changes.
# - If scripts/share/apk/ holds the APK, opens a second tunnel that serves it, and prints
#   the download link.
# - Keeps the Mac awake while it runs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SHARE="$ROOT/scripts/share"
LOGS="$SHARE/logs"
API_PORT=8002
APK_PORT=8003
mkdir -p "$LOGS"

command -v cloudflared >/dev/null || { echo "Install the tunnel first: brew install cloudflared"; exit 1; }
for port in $API_PORT $APK_PORT; do
  if lsof -nP -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is in use (is the share already running?)"; exit 1
  fi
done

pids=()
cleanup() {
  echo; echo "Stopping the share…"
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM HUP   # HUP: the Terminal window was closed

# Wait for a quick tunnel to print its https address in its log
tunnel_url() {
  local log="$1"
  for _ in $(seq 1 60); do
    local url
    url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -1 || true)"
    if [ -n "$url" ]; then echo "$url"; return 0; fi
    sleep 1
  done
  echo "The tunnel didn't start; see $log" >&2; return 1
}

echo "Starting the backend (production mode) on port $API_PORT…"
(
  cd "$ROOT/backend"
  APP_ENV=production DEV_AUTH_BYPASS=false exec venv/bin/uvicorn app.main:app \
    --host 127.0.0.1 --port $API_PORT --proxy-headers --forwarded-allow-ips 127.0.0.1
) >"$LOGS/backend.log" 2>&1 &
pids+=($!)
for _ in $(seq 1 60); do
  curl -fs "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fs "http://127.0.0.1:$API_PORT/health" >/dev/null || { echo "The backend didn't start; see $LOGS/backend.log"; exit 1; }

echo "Opening the tunnel…"
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$API_PORT" >"$LOGS/tunnel-api.log" 2>&1 &
pids+=($!)
API_URL="$(tunnel_url "$LOGS/tunnel-api.log")"

# A new quick tunnel can take a few seconds before its address answers
for _ in $(seq 1 30); do
  curl -fs "$API_URL/health" >/dev/null 2>&1 && break
  sleep 2
done
"$ROOT/backend/venv/bin/python" "$SHARE/publish_config.py" "$API_URL" >/dev/null
echo "Backend address published: $API_URL"

APK="$(ls "$SHARE"/apk/*.apk 2>/dev/null | head -1 || true)"
if [ -n "$APK" ]; then
  python3 -m http.server $APK_PORT --bind 127.0.0.1 --directory "$SHARE/apk" >"$LOGS/apk-server.log" 2>&1 &
  pids+=($!)
  cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$APK_PORT" >"$LOGS/tunnel-apk.log" 2>&1 &
  pids+=($!)
  APK_LINK="$(tunnel_url "$LOGS/tunnel-apk.log")/$(basename "$APK")"
fi

caffeinate -dims -w $$ &
pids+=($!)

echo
echo "Vromon is shared. Keep this window open and the Mac on."
[ -n "${APK_LINK:-}" ] && echo "APK download link (works while this runs): $APK_LINK"
echo "Logs: $LOGS"
echo "Press Ctrl+C to stop."
wait "${pids[0]}"
