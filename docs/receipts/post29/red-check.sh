#!/bin/sh
# Prove the new assertions fail on the base production bytes, then restore them.
set -e
cd "$(dirname "$0")/../../.."
SCRATCH="$HOME/.hermes/cache/scratch/post29-red"
rm -rf "$SCRATCH"; mkdir -p "$SCRATCH"
PROD="hackertube/dashboard/dist/index.js hackertube/dashboard/dist/style.css"
for f in $PROD; do cp "$f" "$SCRATCH/$(basename "$f")"; done
sha_before=$(shasum -a 256 $PROD | awk '{print $1}' | tr '\n' ' ')
git checkout HEAD -- $PROD
set +e
node --test --test-name-pattern "YouTube card opens the source|visual CSS F1|visual atomic F21" tests/test_dashboard_page.js > docs/receipts/post29/red-base.log 2>&1
red_exit=$?
set -e
cp "$SCRATCH/index.js" hackertube/dashboard/dist/index.js
cp "$SCRATCH/style.css" hackertube/dashboard/dist/style.css
sha_after=$(shasum -a 256 $PROD | awk '{print $1}' | tr '\n' ' ')
echo "red_exit=$red_exit"
echo "sha_before=$sha_before"
echo "sha_after=$sha_after"
[ "$sha_before" = "$sha_after" ] && echo "RESTORE_OK" || echo "RESTORE_MISMATCH"
