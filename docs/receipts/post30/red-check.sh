#!/bin/sh
# RED check for the compact-badge tests: run them against the BASE stylesheet (the
# unscoped hide rule), then restore this branch's file and prove the bytes came back.
# Requires node on PATH (`~/.hermes/tools/node-26.7.0-darwin-arm64/bin`).
set -eu
cd "$(dirname "$0")/../../.."
css=hackertube/dashboard/dist/style.css
backup=$(mktemp)
cp "$css" "$backup"
before=$(shasum -a 256 "$css" | awk '{print $1}')
restore() {
  cp "$backup" "$css"
  after=$(shasum -a 256 "$css" | awk '{print $1}')
  rm -f "$backup"
  if [ "$before" = "$after" ]; then echo "RESTORE_OK $after"; else echo "RESTORE_FAILED $before != $after"; exit 1; fi
}
trap restore EXIT
git show HEAD:"$css" > "$css"
echo "--- base stylesheet ---"
grep -n "ht-compact .ht-format" "$css"
echo "--- base run (non-zero fail count is the expected RED) ---"
status=0
node --test --test-name-pattern 'token layout contract|F21b|F21c' tests/test_dashboard_page.js 2>&1 || status=$?
echo "--- base exit: $status ---"
if [ "$status" -eq 0 ]; then echo "UNEXPECTED_GREEN: the new tests do not pin the change"; exit 2; fi
echo "EXPECTED_RED"