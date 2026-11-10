#!/bin/bash
# Clean-profile run: a FRESH HERMES_HOME (new directory each run, so nothing is
# deleted), the plugin enabled by the real CLI, the backend probe run with the
# Hermes venv python, and the browser render with both thumbnail failure paths.
set -euo pipefail
source "$HOME/.hermes/cache/scratch/ht32-env.sh"
REPO="$HOME/Developer/hackertube-post32"
CP="$HOME/.hermes/cache/scratch/p32-cp-$(date +%s)"
mkdir -p "$CP/plugins"
ln -sfn "$REPO/hackertube" "$CP/plugins/hackertube"
export HERMES_HOME="$CP"
echo "clean profile: $CP"

hermes plugins enable hackertube > "$REPO/docs/receipts/post32/clean-enable.log" 2>&1
echo "enable exit=$?"
hermes plugins list > "$REPO/docs/receipts/post32/clean-plugin-list.log" 2>&1 || true

cd "$REPO/docs/receipts/post32"
"$HOME/.hermes/hermes-agent/venv/bin/python3" clean_profile_probe.py \
  > clean-profile.json 2> clean-profile.err
echo "probe exit=$?"

export HACKERTUBE_PAGE_PATH="$CP/plugins/hackertube/dashboard/dist/index.js"
export HACKERTUBE_STYLE_PATH="$CP/plugins/hackertube/dashboard/dist/style.css"
node clean_profile_render.js > clean-profile-render.json 2> clean-profile-render.err
echo "render exit=$?"
