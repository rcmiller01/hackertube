#!/bin/bash
# Recompute docs/receipts/post32/geometry-base.json (#32) and geometry-head.json
# (this branch) plus the 390/1280 PNGs.
set -euo pipefail
source "$HOME/.hermes/cache/scratch/ht32-env.sh"
REPO="$HOME/Developer/hackertube-post32"
BASE_SHA="72370070ed9406a62c8e8d6f755d4f0ad0f7568f"
SCRATCH="$HOME/.hermes/cache/scratch/p32-base"
mkdir -p "$SCRATCH" "$REPO/docs/receipts/post32"
cd "$REPO"

git show "$BASE_SHA:hackertube/dashboard/dist/index.js" > "$SCRATCH/index.js"
git show "$BASE_SHA:hackertube/dashboard/dist/style.css" > "$SCRATCH/style.css"

echo "== base (#32) row heights =="
HACKERTUBE_PAGE_PATH="$SCRATCH/index.js" HACKERTUBE_STYLE_PATH="$SCRATCH/style.css" \
  node docs/receipts/post32/capture.js --label base > /dev/null

echo "== head (this branch) + screenshots =="
node docs/receipts/post32/capture.js --label head --shots > /dev/null

echo "== comparison =="
node -e '
const fs = require("fs");
const dir = process.argv[1];
const base = JSON.parse(fs.readFileSync(dir + "/geometry-base.json"));
const head = JSON.parse(fs.readFileSync(dir + "/geometry-head.json"));
const rows = base.viewports.map((b) => {
  const h = head.viewports.find((x) => x.width === b.width);
  return {
    width: b.width,
    base_rowHeight: b.layout.rowHeight,
    head_rowHeight: h.layout.rowHeight,
    delta: Math.round((h.layout.rowHeight - b.layout.rowHeight) * 10) / 10,
    base_markFileHeight: b.mark.fileHeight,
    head_markFileHeight: h.mark.fileHeight,
    base_visibleMarkHeight: b.mark.visibleMarkHeight,
    head_visibleMarkHeight: h.mark.visibleMarkHeight,
    base_sideWidth: b.layout.sideWidth || null,
    head_sideWidth: h.layout.sideWidth || null,
    base_flexDirection: b.layout.flexDirection || null,
    head_flexDirection: h.layout.flexDirection,
    base_fullCardHeight: b.fullHeight,
    head_fullCardHeight: h.fullHeight,
  };
});
fs.writeFileSync(dir + "/row-heights.json", JSON.stringify({ rows }, null, 2) + "\n");
console.log(JSON.stringify({ rows }, null, 2));
' "$REPO/docs/receipts/post32"
