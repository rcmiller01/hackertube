#!/bin/bash
# Clean-profile run for this branch: a fresh HERMES_HOME, the plugin enabled by
# the real `hermes plugins enable`, then the backend probe and the browser
# render, both against the INSTALLED assets.
set -u
source "$HOME/.hermes/cache/scratch/p33-env.sh"
REPO="$HT_REPO"
HERMES_VENV_PY="$HOME/.hermes/hermes-agent/venv/bin/python3"
STAMP="$(date +%s)"
CP="$HOME/.hermes/cache/scratch/p33-cp-$STAMP"
mkdir -p "$CP/plugins"
ln -sfn "$REPO/hackertube" "$CP/plugins/hackertube"
echo "HERMES_HOME=$CP"

echo "== enable =="
HERMES_HOME="$CP" hermes plugins enable hackertube > "$CP/enable.log" 2>&1
echo "enable exit=$?"; cat "$CP/enable.log"

echo "== installed assets in the enabled profile =="
ls -la "$CP/plugins/" > "$CP/plugin-list.log" 2>&1
head -3 "$CP/plugin-list.log"

cd "$REPO"

echo "== backend probe (clean profile) =="
HERMES_HOME="$CP" "$HERMES_VENV_PY" docs/receipts/post33/clean_profile_probe.py > "$CP/probe.json" 2> "$CP/probe.err"
echo "probe exit=$?"
tail -5 "$CP/probe.err"
"$HT_PY" -c "import json,sys; d=json.load(open(sys.argv[1])); print(json.dumps({k:d[k] for k in ('policy_accepted','catalog','startup_purge','undated_rule','lookalike_host','source_outage','thumbnail_display_check')}, indent=2))" "$CP/probe.json"

echo "== browser render (clean profile) =="
HERMES_HOME="$CP" \
HACKERTUBE_PAGE_PATH="$CP/plugins/hackertube/dashboard/dist/index.js" \
HACKERTUBE_STYLE_PATH="$CP/plugins/hackertube/dashboard/dist/style.css" \
  node docs/receipts/post33/clean_profile_render.js > "$CP/render.json" 2> "$CP/render.err"
echo "render exit=$?"
tail -5 "$CP/render.err"
"$HT_PY" -c "import json,sys; d=json.load(open(sys.argv[1])); print(json.dumps({k:d[k] for k in ('lookalikeHost','foreignHost','failedLoad','layout')}, indent=2))" "$CP/render.json"

echo "CLEAN_PROFILE_DIR=$CP"
