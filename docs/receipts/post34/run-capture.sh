#!/bin/bash
# Recompute docs/receipts/post34/geometry-base.json (#34) and geometry-head.json
# (this branch) plus the 320/390/767/768/1280 PNGs and the row-height comparison.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
BASE_SHA=3788fe6a0bebc6d3b03463ff29a0fd57cb66dc40
SCRATCH="$HOME/.hermes/cache/scratch/p34-base"
mkdir -p "$SCRATCH" "$REPO/docs/receipts/post34"
cd "$REPO"

git show "$BASE_SHA:hackertube/dashboard/dist/index.js" > "$SCRATCH/index.js"
git show "$BASE_SHA:hackertube/dashboard/dist/style.css" > "$SCRATCH/style.css"

echo "== base (#34) geometry =="
HACKERTUBE_PAGE_PATH="$SCRATCH/index.js" HACKERTUBE_STYLE_PATH="$SCRATCH/style.css" \
  node docs/receipts/post34/capture.js --label base > /dev/null

echo "== head (this branch) geometry + screenshots =="
node docs/receipts/post34/capture.js --label head --shots > /dev/null

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
    base_thumbnail: b.layout.thumbBox ? [b.layout.thumbBox.w, b.layout.thumbBox.h] : null,
    head_thumbnail: h.layout.thumbBox ? [h.layout.thumbBox.w, h.layout.thumbBox.h] : null,
    base_visibleMark: [b.mark.visibleMarkWidth, b.mark.visibleMarkHeight],
    head_visibleMark: [h.mark.visibleMarkWidth, h.mark.visibleMarkHeight],
    base_fullCardHeight: b.fullHeight,
    head_fullCardHeight: h.fullHeight,
  };
});
fs.writeFileSync(dir + "/row-heights.json", JSON.stringify({ base: "3788fe6 #34", rows }, null, 2) + "\n");
console.log(JSON.stringify({ rows }, null, 2));
' "$REPO/docs/receipts/post34"
