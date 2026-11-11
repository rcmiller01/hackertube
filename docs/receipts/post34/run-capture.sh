#!/bin/bash
# Recompute docs/receipts/post34/geometry-base.json (the pre-fix PR #35 head
# e44b825) and geometry-head.json (this branch) plus the 320/390/767/768/1280
# PNGs (before/ for the pre-fix head, the receipt root for this head) and the
# row-height comparison.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
BASE_SHA=e44b825d23eb1b10fec6114bb8060b31a4ac9ad7
SCRATCH="$HOME/.hermes/cache/scratch/p34-base"
mkdir -p "$SCRATCH" "$REPO/docs/receipts/post34/before"
cd "$REPO"
export PATH="$HOME/.hermes/tools/node-26.12.1-darwin-arm64/bin:$PATH"
export NODE_PATH="$HOME/.hermes/cache/scratch/node-modules/node_modules"
export HACKERTUBE_NODE_MODULES="$HOME/.hermes/cache/scratch/node-modules/node_modules"
export PLAYWRIGHT_BROWSERS_PATH="$HOME/.hermes/tools"

git show "$BASE_SHA:hackertube/dashboard/dist/index.js" > "$SCRATCH/index.js"
git show "$BASE_SHA:hackertube/dashboard/dist/style.css" > "$SCRATCH/style.css"

echo "== base (pre-fix head $BASE_SHA) geometry + before/ screenshots =="
HACKERTUBE_PAGE_PATH="$SCRATCH/index.js" HACKERTUBE_STYLE_PATH="$SCRATCH/style.css" \
  node docs/receipts/post34/capture.js --label base --shots > /dev/null
cp docs/receipts/post34/videos-*.png docs/receipts/post34/discover-*.png \
   docs/receipts/post34/search-*.png docs/receipts/post34/before/

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
    base_display: b.layout.display || null,
    head_display: h.layout.display,
    base_headChildIndex: b.layout.headChildIndex,
    head_headChildIndex: h.layout.headChildIndex,
    base_sideChildIndex: b.layout.sideChildIndex,
    head_sideChildIndex: h.layout.sideChildIndex,
    base_titlePrecedesMedia: b.layout.titlePrecedesMedia,
    head_titlePrecedesMedia: h.layout.titlePrecedesMedia,
    base_tabFromTitle: b.tabOrder ? b.tabOrder.fromTitle : null,
    head_tabFromTitle: h.tabOrder ? h.tabOrder.fromTitle : null,
    base_sideWidth: b.layout.sideWidth || null,
    head_sideWidth: h.layout.sideWidth || null,
    base_thumbnail43: [b.compactThumb.boxWidth, b.compactThumb.boxHeight],
    head_thumbnail43: [h.compactThumb.boxWidth, h.compactThumb.boxHeight],
    base_thumbnail169: [b.compactThumb169.boxWidth, b.compactThumb169.boxHeight],
    head_thumbnail169: [h.compactThumb169.boxWidth, h.compactThumb169.boxHeight],
    base_visibleMark: [b.mark.visibleMarkWidth, b.mark.visibleMarkHeight],
    head_visibleMark: [h.mark.visibleMarkWidth, h.mark.visibleMarkHeight],
    base_fullCardHeight: b.fullHeight,
    head_fullCardHeight: h.fullHeight,
  };
});
fs.writeFileSync(dir + "/row-heights.json", JSON.stringify({ base: "e44b825 pre-fix head", rows }, null, 2) + "\n");
console.log(JSON.stringify({ rows }, null, 2));
' "$REPO/docs/receipts/post34"
