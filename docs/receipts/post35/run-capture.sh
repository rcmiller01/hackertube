#!/bin/bash
# Recompute docs/receipts/post35/geometry-base.json (main 6ba4e4f, the pre-fix
# head this card corrects) and geometry-head.json (this branch), the
# 320/390/767/768/1280 PNGs (before/ for the pre-fix head, the receipt root for
# this head), the row comparison, and the focus-ring pixel check.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
BASE_SHA=6ba4e4fd33efbe6273a138ad12c5e376178fca2a
SCRATCH="$HOME/.hermes/cache/scratch/p35-base-assets"
OUT="$REPO/docs/receipts/post35"
mkdir -p "$SCRATCH" "$OUT/before"
cd "$REPO"
export PATH="$HOME/.hermes/tools/node-26.12.1-darwin-arm64/bin:$PATH"
export NODE_PATH="$HOME/.hermes/cache/scratch/node-modules/node_modules"
export HACKERTUBE_NODE_MODULES="$HOME/.hermes/cache/scratch/node-modules/node_modules"
export PLAYWRIGHT_BROWSERS_PATH="$HOME/.hermes/tools"
HT_PY="$HOME/.hermes/cache/scratch/p35-venv/bin/python"

git show "$BASE_SHA:hackertube/dashboard/dist/index.js" > "$SCRATCH/index.js"
git show "$BASE_SHA:hackertube/dashboard/dist/style.css" > "$SCRATCH/style.css"

echo "== base (pre-fix head $BASE_SHA) geometry + before/ screenshots =="
HACKERTUBE_PAGE_PATH="$SCRATCH/index.js" HACKERTUBE_STYLE_PATH="$SCRATCH/style.css" \
  node docs/receipts/post35/capture.js --label base --shots > /dev/null
cp docs/receipts/post35/discover-*.png docs/receipts/post35/search-*.png \
   docs/receipts/post35/videos-*.png docs/receipts/post35/feed-card-*.png \
   docs/receipts/post35/before/

echo "== head (this branch) geometry + screenshots =="
node docs/receipts/post35/capture.js --label head --shots > /dev/null

echo "== comparison =="
"$HT_PY" "$OUT/compare.py" "$OUT"

echo "== focus ring pixels (320, head) =="
/usr/bin/python3 docs/receipts/post35/ring_check.py "$OUT" --label head
echo "== focus ring pixels (320, base) =="
/usr/bin/python3 docs/receipts/post35/ring_check.py "$OUT" --label base || true
