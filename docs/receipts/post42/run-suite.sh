#!/bin/bash
# The three suites this card reports, each into its own log beside this file.
#
#   bash docs/receipts/post42/run-suite.sh
#
# Node runs need the box's own node plus the scratch node_modules (esbuild,
# react, react-dom, playwright) and the Playwright browser root; pytest needs a
# venv with pytest, fastapi and httpx (without the last two the route tests are
# SKIPPED and the count is not the full suite).
set -u
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$(cd "$(dirname "$0")" && pwd)"
VENV="${HACKERTUBE_VENV:-$HOME/.hermes/cache/scratch/ht40-venv}"
NODE_BIN="$HOME/.hermes/tools/node-26.12.1-darwin-arm64/bin"
NODE_MODULES="$HOME/.hermes/cache/scratch/node-modules/node_modules"
cd "$REPO" || exit 1

echo "== pytest =="
"$VENV/bin/python" -m pytest -q > "$OUT/pytest.log" 2>&1
echo "pytest exit=$?"
tail -3 "$OUT/pytest.log"

export PATH="$NODE_BIN:$PATH"
export NODE_PATH="$NODE_MODULES"
export HACKERTUBE_NODE_MODULES="$NODE_MODULES"
export PLAYWRIGHT_BROWSERS_PATH="$HOME/.hermes/tools"

echo "== node full suite =="
node --test tests/*.js > "$OUT/node-full-suite.log" 2>&1
echo "node exit=$?"
grep -E "^. (tests|pass|fail) " "$OUT/node-full-suite.log" || tail -5 "$OUT/node-full-suite.log"

echo "== FEED12 (10 runs) =="
: > "$OUT/feed12.log"
for run in $(seq 1 10); do
  node --test --test-name-pattern '^FEED12 ' tests/test_browser_requests.js \
    > "$OUT/feed12-run-$run.log" 2>&1
  status=$?
  fail=$(grep -E "^. fail " "$OUT/feed12-run-$run.log" | awk '{print $3}')
  echo "run $run exit=$status fail $fail" >> "$OUT/feed12.log"
done
cat "$OUT/feed12.log"

# The logs above were written with whatever home paths the runs carried (pytest's
# warning summary names the venv's own site-packages file, for one), and the check
# in tests/test_receipt_paths.py scans the receipts as they stand on disk. So the
# script's last step is the rewrite, and the check is what proves it happened.
echo "== receipts: home paths rewritten to placeholders =="
python3 "$OUT/redact_paths.py"
