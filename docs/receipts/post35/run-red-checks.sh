#!/bin/bash
# Red-then-green evidence for the four post-#35 items that carry a test.
#
# Runs against a detached worktree at the pre-fix head 6ba4e4f (the strongest
# form of "the new test is red at head": the production files are that SHA's,
# only the test files are this branch's).
#
#   item 1 (grid gap)        new browser test at 6ba4e4f -> FAIL
#   item 2 (320 Watch link)  new browser test at 6ba4e4f -> FAIL
#   item 3 (header contents) the reported mutations slice(0,2) / slice(0,4):
#                            the OLD test file passes both, the new one fails both
#   item 4 (purge loop)      the reported mutation "purge at startup, once after
#                            the first interval, then stop": the OLD test passes,
#                            the new one fails
#
# Item 5's red evidence is docs/receipts/post35/run-teardown-probe.sh; item 6 is
# a comment with no test.
set -u
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$REPO/docs/receipts/post35"
BASE_SHA=6ba4e4fd33efbe6273a138ad12c5e376178fca2a
WT="$HOME/.hermes/cache/scratch/p35-red-base"
PY=/usr/bin/python3
HT_PY="$HOME/.hermes/cache/scratch/p35-venv/bin/python"
export PATH="$HOME/.hermes/tools/node-26.12.1-darwin-arm64/bin:$PATH"
export NODE_PATH="$HOME/.hermes/cache/scratch/node-modules/node_modules"
export PLAYWRIGHT_BROWSERS_PATH="$HOME/.hermes/tools"

rm -rf "$WT"
git -C "$REPO" worktree add --detach "$WT" "$BASE_SHA" > /dev/null 2>&1
cp "$REPO/tests/test_privacy_browser.js" "$REPO/tests/test_dashboard_page.js" "$WT/tests/"
cd "$WT"

{
  echo "# new browser tests against the pre-fix head $BASE_SHA (production files at that SHA)"
  echo "## a compact row's header sits one row gap above the rest of its text"
  timeout 300 node --test --test-name-pattern "one row gap" tests/test_privacy_browser.js 2>&1 | grep -E "^(✔|✖)|AssertionError" | head -4
  echo "## the full card's Watch link and its focus ring stay inside the card, at 320 through 1280"
  timeout 300 node --test --test-name-pattern "focus ring stay inside" tests/test_privacy_browser.js 2>&1 | grep -E "^(✔|✖)|AssertionError" | head -4
  echo "## the compact-row header contents test (production is not wrong here, so this PASSES:"
  echo "##   its red evidence is the mutation below, not this run)"
  timeout 120 node --test --test-name-pattern "header holds exactly" tests/test_dashboard_page.js 2>&1 | grep -E "^(✔|✖)" | head -2
} > "$OUT/red-check-browser-base.log" 2>&1
cat "$OUT/red-check-browser-base.log"

{
  echo "# item 3: the reported mutations of text.slice(0, 3) on the pre-fix bundle"
  for slice in "text.slice(0, 2)" "text.slice(0, 4)"; do
    echo
    echo "## mutation: text.slice(0, 3) -> $slice"
    git checkout -- tests/test_dashboard_page.js
    "$PY" "$OUT/mutate.py" hackertube/dashboard/dist/index.js "text.slice(0, 3)" "$slice"
    echo "-- OLD test file (the pre-fix head's own tests):"
    timeout 200 node --test tests/test_dashboard_page.js 2>&1 | grep -E "^ℹ (tests|pass|fail)" | tr '\n' ' '
    echo
    cp "$REPO/tests/test_dashboard_page.js" tests/test_dashboard_page.js
    echo "-- NEW test file:"
    timeout 200 node --test --test-name-pattern "header holds exactly" tests/test_dashboard_page.js 2>&1 | grep -E "^(✔|✖)|AssertionError" | head -3
    git checkout -- tests/test_dashboard_page.js
    git checkout -- hackertube/dashboard/dist/index.js
  done
} > "$OUT/red-check-mutations.log" 2>&1
cat "$OUT/red-check-mutations.log"

{
  echo "# item 4: the purge loop stops after the first interval (startup pass + one pass, then return)"
  echo "# on the pre-fix head $BASE_SHA, with the OLD test file, then with the NEW one"
  "$PY" "$OUT/mutate.py" hackertube/hackertube_core/privacy.py \
    "        while not stop.wait(interval):
            purge()" "        while not stop.wait(interval):
            purge()
            break"
  echo "-- OLD test file:"
  "$HT_PY" -m pytest -q tests/test_privacy.py -k "logs_a_warning" 2>&1 | tail -2
  cp "$REPO/tests/test_privacy.py" tests/test_privacy.py
  echo "-- NEW test file:"
  "$HT_PY" -m pytest -q tests/test_privacy.py -k "logs_a_warning" 2>&1 | tail -3
  git checkout -- hackertube/hackertube_core/privacy.py
  git checkout -- tests/test_privacy.py
} > "$OUT/red-check-python-base.log" 2>&1
cat "$OUT/red-check-python-base.log"

cd "$REPO"
git worktree remove --force "$WT" > /dev/null 2>&1
echo
echo "worktree removed: $(git worktree list | grep -c p35-red-base) lease(s) left"
