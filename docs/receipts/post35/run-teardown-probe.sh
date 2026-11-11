#!/bin/bash
# The route_harness teardown receipt for post-#35.
#
# Runs the SAME probe over the WHOLE suite at two revisions:
#   - the pre-fix head 6ba4e4f (the red: start() installed the host stubs
#     directly, so plugins.plugin_storage survived the session);
#   - this branch (start() takes monkeypatch and every route test passes it).
set -u
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
HT_PY="$HOME/.hermes/cache/scratch/p35-venv/bin/python"
OUT="$REPO/docs/receipts/post35"
BASE_SHA=6ba4e4fd33efbe6273a138ad12c5e376178fca2a
PROBE_WT="$HOME/.hermes/cache/scratch/p35-probe-base"
export PYTHONPATH="$OUT"

echo "== base $BASE_SHA: whole suite =="
rm -rf "$PROBE_WT"
git -C "$REPO" worktree add --detach "$PROBE_WT" "$BASE_SHA" > /dev/null 2>&1
cd "$PROBE_WT"
"$HT_PY" -m pytest -p teardown_probe -q -s 2>&1 \
  | grep -E "teardown_probe|passed|failed" | tail -5 > "$OUT/teardown-probe-base.log"
cat "$OUT/teardown-probe-base.log"
cd "$REPO"
git worktree remove --force "$PROBE_WT" > /dev/null 2>&1

echo
echo "== this branch: whole suite =="
"$HT_PY" -m pytest -p teardown_probe -q -s 2>&1 \
  | grep -E "teardown_probe|passed|failed" | tail -5 > "$OUT/teardown-probe-head.log"
cat "$OUT/teardown-probe-head.log"
