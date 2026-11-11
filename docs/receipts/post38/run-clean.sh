#!/bin/bash
# Clean-profile run for the post-#38 branch: a FRESH HERMES_HOME, the plugin
# enabled by the real `hermes plugins enable`, then the backend probe (the
# source-down failure path) against the INSTALLED assets.
set -u
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
HERMES_VENV_PY="$HOME/.hermes/hermes-agent/venv/bin/python3"
STAMP="$(date +%s)"
CP="$HOME/.hermes/cache/scratch/p38-cp-$STAMP"
mkdir -p "$CP/plugins"
ln -sfn "$REPO/hackertube" "$CP/plugins/hackertube"
echo "HERMES_HOME=$CP"
echo "chosen profile dir: $CP (created by this run, so fresh by construction)"

echo "== enable =="
HERMES_HOME="$CP" hermes plugins enable hackertube > "$CP/enable.log" 2>&1
echo "enable exit=$?"
cat "$CP/enable.log"

echo "== installed assets in the enabled profile =="
ls -la "$CP/plugins/" > "$CP/plugin-list.log" 2>&1
head -3 "$CP/plugin-list.log"

cd "$REPO"

echo "== backend probe (fresh profile, source-down failure path) =="
HERMES_HOME="$CP" "$HERMES_VENV_PY" docs/receipts/post38/clean_profile_probe.py > "$CP/probe.json" 2> "$CP/probe.err"
echo "probe exit=$?"
tail -5 "$CP/probe.err"
cat "$CP/probe.json"

echo "CLEAN_PROFILE_DIR=$CP"
