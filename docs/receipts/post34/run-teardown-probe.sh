#!/bin/bash
# Round-2 correction receipt: the route_harness monkeypatch teardown probe.
#
# Runs the SAME probe (docs/receipts/post34/teardown_probe.py) over the same
# scope at two revisions:
#   - the reviewed head ee2a613 (the red: monkeypatch.setitem was registered
#     AFTER six direct sys.modules[...] assignments, so teardown restored the
#     stubs and the leak survived);
#   - the fixed working tree (the six direct assignments removed).
# Then, at the fixed tree, over the whole suite.
set -u
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
HT_PY="$HOME/.hermes/cache/scratch/p34-venv/bin/python"
OUT="$REPO/docs/receipts/post34"
SCOPE="tests/test_installed_search.py tests/test_privacy.py"
export PYTHONPATH="$OUT"

echo "== base ee2a613: $SCOPE =="
git -C "$REPO" worktree add --detach /tmp/ht-probe-base ee2a613 > /dev/null 2>&1 || true
cd /tmp/ht-probe-base
"$HT_PY" -m pytest -p teardown_probe -q $SCOPE 2>&1 | tee "$OUT/teardown-probe-base.log"
cd "$REPO"
git worktree remove --force /tmp/ht-probe-base > /dev/null 2>&1 || true

echo
echo "== fixed working tree: $SCOPE =="
"$HT_PY" -m pytest -p teardown_probe -q $SCOPE 2>&1 | tee "$OUT/teardown-probe-head.log"

echo
echo "== fixed working tree: whole suite (first leak site named) =="
"$HT_PY" -m pytest -p teardown_probe -q -s 2>&1 \
  | grep -E "teardown_probe|passed|failed" | head -4 | tee "$OUT/teardown-probe-suite.log"
