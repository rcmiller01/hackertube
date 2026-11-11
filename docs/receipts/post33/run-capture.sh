#!/bin/bash
# Recompute docs/receipts/post33/geometry-base.json (#33) and geometry-head.json
# (this branch) plus the 390/767/768/1280 PNGs and the row-height comparison.
set -euo pipefail
source "$HOME/.hermes/cache/scratch/p33-env.sh"
REPO="$HT_REPO"
BASE_SHA="093d0785e57852f6995ecbcb57f0e82208ab598a"
SCRATCH="$HOME/.hermes/cache/scratch/p33-base"
mkdir -p "$SCRATCH" "$REPO/docs/receipts/post33"
cd "$REPO"

git show "$BASE_SHA:hackertube/dashboard/dist/index.js" > "$SCRATCH/index.js"
git show "$BASE_SHA:hackertube/dashboard/dist/style.css" > "$SCRATCH/style.css"

echo "== base (#33) row heights =="
HACKERTUBE_PAGE_PATH="$SCRATCH/index.js" HACKERTUBE_STYLE_PATH="$SCRATCH/style.css" \
  node docs/receipts/post33/capture.js --label base > /dev/null

echo "== head (this branch) + screenshots =="
node docs/receipts/post33/capture.js --label head --shots > /dev/null

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
    base_flexDirection: b.layout.flexDirection || null,
    head_flexDirection: h.layout.flexDirection,
    base_sideWidth: b.layout.sideWidth || null,
    head_sideWidth: h.layout.sideWidth || null,
    base_mainChildIndex: b.layout.mainChildIndex,
    head_mainChildIndex: h.layout.mainChildIndex,
    base_markFileHeight: b.mark.fileHeight,
    head_markFileHeight: h.mark.fileHeight,
    base_visibleMarkHeight: b.mark.visibleMarkHeight,
    head_visibleMarkHeight: h.mark.visibleMarkHeight,
    base_iconAspect: b.mark.aspect,
    head_iconAspect: h.mark.aspect,
    base_fullCardHeight: b.fullHeight,
    head_fullCardHeight: h.fullHeight,
  };
});
fs.writeFileSync(dir + "/row-heights.json", JSON.stringify({ base: "093d078 #33", rows }, null, 2) + "\n");
console.log(JSON.stringify({ rows }, null, 2));
' "$REPO/docs/receipts/post33"
