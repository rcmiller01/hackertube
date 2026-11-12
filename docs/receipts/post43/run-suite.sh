#!/bin/bash
# Every suite and check this card reports, each into its own log beside this
# file, then the placeholder rewrite, then the path check LAST.
#
#   bash docs/receipts/post43/run-suite.sh
#
# Order matters and is the point of this script. pytest writes a home path into
# its own log (its warning summary names the venv's site-packages file) and the
# node stack traces carry the checkout's, so the check in
# tests/test_receipt_paths.py cannot pass until `redact_paths.py` has run over
# the tree — and the check writes its own log, so it must be the LAST step, after
# the rewrite, or it certifies a tree it is standing in.
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
export PYTHONDONTWRITEBYTECODE=1
cd "$REPO" || exit 1

echo "== pytest =="
"$VENV/bin/python" -B -m pytest -q > "$OUT/pytest.log" 2>&1
echo "pytest exit=$?"
tail -3 "$OUT/pytest.log"

export PATH="$NODE_BIN:$PATH"
export NODE_PATH="$NODE_MODULES"
export HACKERTUBE_NODE_MODULES="$NODE_MODULES"
export PLAYWRIGHT_BROWSERS_PATH="$HOME/.hermes/tools"

echo "== node full suite =="
node --test tests/*.js > "$OUT/node-full-suite.log" 2>&1
echo "node exit=$?"
grep -E "tests |pass |fail " "$OUT/node-full-suite.log" | tail -5 || tail -5 "$OUT/node-full-suite.log"

echo "== FEED12 (10 runs) =="
: > "$OUT/feed12.log"
for run in $(seq 1 10); do
  node --test --test-name-pattern '^FEED12 ' tests/test_browser_requests.js \
    > "$OUT/feed12-run-$run.log" 2>&1
  status=$?
  fail=$(grep -E "fail " "$OUT/feed12-run-$run.log" | tail -1 | awk '{print $3}')
  echo "run $run exit=$status fail $fail" >> "$OUT/feed12.log"
done
cat "$OUT/feed12.log"

echo "== plugin checks =="
( cd "$REPO/hackertube" && hermes plugins validate . ) > "$OUT/plugin-validate.log" 2>&1
echo "validate exit=$?"
( cd "$REPO/hackertube" && hermes plugins doctor . --ci ) > "$OUT/plugin-doctor.log" 2>&1
echo "doctor exit=$?"

echo "== receipts: home paths rewritten to placeholders =="
python3 -B "$OUT/redact_paths.py"

echo "== path check LAST (it scans the tree the logs above were just written into) =="
"$VENV/bin/python" -B -m pytest tests/test_receipt_paths.py -q > "$OUT/path-check.log" 2>&1
echo "path check exit=$?"
tail -2 "$OUT/path-check.log"
