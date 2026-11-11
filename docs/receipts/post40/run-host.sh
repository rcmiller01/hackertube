#!/bin/bash
# Real-Hermes-host run for the post-#40 follow-up card.
#
#   docs/receipts/post40/run-host.sh fix     (default) — the working tree's CSS
#   docs/receipts/post40/run-host.sh base             — the same CSS with the
#                                                       inner-wrapper rule
#                                                       reverted to `padding: 0`
#
# A FRESH HERMES_HOME per run, the plugin enabled by the real `hermes plugins
# enable`, one YouTube video item written through the plugin's own catalog write
# path (the frozen seed has no video, so a fresh dashboard would never render a
# compact YouTube row), then the REAL dashboard server on a loopback port. The
# plugin directory is COPIED, not symlinked, so the base run never touches the
# working tree: the copy's stylesheet is edited instead, and the sha256 of both
# the copy and the working tree are printed so the swap is checkable.
set -u
MODE="${1:-fix}"
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
HERMES_VENV_PY="$HOME/.hermes/hermes-agent/venv/bin/python3"
PORT="${HACKERTUBE_HOST_PORT:-9232}"
TOKEN="p40-host-token"
STAMP="$(date +%s)"
CP="$HOME/.hermes/cache/scratch/p40-$MODE-$STAMP"
mkdir -p "$CP/plugins"

echo "MODE=$MODE"
echo "HERMES_HOME=$CP"
echo "port=$PORT"
echo "working-tree css sha256: $(shasum -a 256 "$REPO/hackertube/dashboard/dist/style.css" | cut -d' ' -f1)"

cp -R "$REPO/hackertube" "$CP/plugins/hackertube"
if [ "$MODE" = "base" ]; then
  "$HERMES_VENV_PY" "$REPO/docs/receipts/post40/to_base.py" "$CP/plugins/hackertube/dashboard/dist/style.css"
  echo "base css sha256: $(shasum -a 256 "$CP/plugins/hackertube/dashboard/dist/style.css" | cut -d' ' -f1)"
fi
cp "$CP/plugins/hackertube/dashboard/dist/style.css" "$CP/served-style.css"

echo "== enable =="
HERMES_HOME="$CP" hermes plugins enable hackertube > "$CP/enable.log" 2>&1
echo "enable exit=$?"
tail -3 "$CP/enable.log"

echo "== one YouTube video item through the plugin's own catalog write path =="
HERMES_HOME="$CP" "$HERMES_VENV_PY" "$REPO/docs/receipts/post40/seed_video_item.py" > "$CP/seed.json" 2> "$CP/seed.err"
echo "seed exit=$?"
cat "$CP/seed.json"
tail -3 "$CP/seed.err"

echo "== dashboard server =="
cd "$REPO"
HERMES_HOME="$CP" HERMES_DASHBOARD_SESSION_TOKEN="$TOKEN" \
  hermes dashboard --isolated --port "$PORT" --host 127.0.0.1 --no-open --skip-build \
  > "$CP/dashboard.log" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT
for _ in $(seq 1 90); do
  grep -q "HERMES_DASHBOARD_READY" "$CP/dashboard.log" 2>/dev/null && break
  sleep 1
done
grep "HERMES_DASHBOARD_READY" "$CP/dashboard.log" || { echo "server did not start"; tail -30 "$CP/dashboard.log"; exit 1; }

echo "== ring probe against the real host =="
export PATH="$HOME/.hermes/tools/node-26.12.1-darwin-arm64/bin:$PATH"
export NODE_PATH="$HOME/.hermes/cache/scratch/node-modules/node_modules"
export HACKERTUBE_NODE_MODULES="$NODE_PATH"
export PLAYWRIGHT_BROWSERS_PATH="$HOME/.hermes/tools"
HACKERTUBE_HOST_BASE="http://127.0.0.1:$PORT" HACKERTUBE_MODE="$MODE" \
  node docs/receipts/post40/host_probe.js > "$CP/host-probe.out" 2> "$CP/host-probe.err"
echo "probe exit=$?"
tail -5 "$CP/host-probe.err"
cat "$CP/host-probe.out"

echo "working-tree css sha256 after: $(shasum -a 256 "$REPO/hackertube/dashboard/dist/style.css" | cut -d' ' -f1)"
echo "PROFILE_DIR=$CP"
