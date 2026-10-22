#!/usr/bin/env bash
# Stops a share left running (start.sh normally stops everything itself on Ctrl+C or when
# its Terminal window closes).
#
#   scripts/share/stop.sh
API_PORT=8002
APK_PORT=8003

stopped=0
for port in $API_PORT $APK_PORT; do
  for pid in $(lsof -nP -t -iTCP:$port -sTCP:LISTEN 2>/dev/null); do
    kill "$pid" && stopped=$((stopped + 1))
  done
  for pid in $(pgrep -f "cloudflared tunnel .*127.0.0.1:$port"); do
    kill "$pid" && stopped=$((stopped + 1))
  done
done
for pid in $(pgrep -f "share/start.sh"); do
  kill "$pid" && stopped=$((stopped + 1))
done

if [ "$stopped" -eq 0 ]; then
  echo "Nothing was running."
else
  echo "Stopped the share ($stopped processes)."
fi
