#!/bin/bash
# Real-Hermes-host run for the post-#39 ring-clip card.
#
# A FRESH HERMES_HOME, the plugin enabled by the real `hermes plugins enable`, one
# YouTube video item written through the plugin's own catalog write path (the
# frozen seed has no video, so a fresh dashboard would never render a compact
# YouTube row), then the REAL dashboard server on a loopback port. The probe
# opens the plugin page in Chromium, reaches the compact row's Watch link with a
# real Tab press, and measures the painted ring at 320px and 390px in both colour
# schemes.
set -u
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
HERMES_VENV_PY="$HOME/.hermes/hermes-agent/venv/bin/python3"
PORT="${HACKERTUBE_HOST_PORT:-9231}"
TOKEN="p39-host-token"
STAMP="$(date +%s)"
CP="$HOME/.hermes/cache/scratch/p39-host-$STAMP"
mkdir -p "$CP/plugins"
ln -sfn "$REPO/hackertube" "$CP/plugins/hackertube"
echo "HERMES_HOME=$CP"
echo "port=$PORT"

echo "== enable =="
HERMES_HOME="$CP" hermes plugins enable hackertube > "$CP/enable.log" 2>&1
echo "enable exit=$?"

echo "== one YouTube video item through the plugin's own catalog write path =="
HERMES_HOME="$CP" "$HERMES_VENV_PY" "$REPO/docs/receipts/post39/seed_video_item.py" > "$CP/seed.json" 2> "$CP/seed.err"
echo "seed exit=$?"
cat "$CP/seed.json"

echo "== dashboard server =="
cd "$REPO"
HERMES_HOME="$CP" HERMES_DASHBOARD_SESSION_TOKEN="$TOKEN" \
  hermes dashboard --isolated --port "$PORT" --host 127.0.0.1 --no-open --skip-build \
  > "$CP/dashboard.log" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT
for _ in $(seq 1 60); do
  grep -q "HERMES_DASHBOARD_READY" "$CP/dashboard.log" 2>/dev/null && break
  sleep 1
done
grep "HERMES_DASHBOARD_READY" "$CP/dashboard.log" || { echo "server did not start"; tail -20 "$CP/dashboard.log"; exit 1; }

echo "== ring probe against the real host =="
export PATH="$HOME/.hermes/tools/node-26.12.1-darwin-arm64/bin:$PATH"
export NODE_PATH="$HOME/.hermes/cache/scratch/node-modules/node_modules"
export HACKERTUBE_NODE_MODULES="$NODE_PATH"
export PLAYWRIGHT_BROWSERS_PATH="$HOME/.hermes/tools"
HACKERTUBE_HOST_BASE="http://127.0.0.1:$PORT" node docs/receipts/post39/real_host_ring.js > "$CP/host-ring.out" 2> "$CP/host-ring.err"
echo "probe exit=$?"
tail -5 "$CP/host-ring.err"
cat "$CP/host-ring.out"

echo "CLEAN_PROFILE_DIR=$CP"