# Post-#29 follow-ups — t_82f152cb

Branch `hermes/post29-followups`. Exact base `a6a65ecb5d6dd7b7b3eabb7e558cbf0a12ac69c2`
(#29). This receipt covers implementation and self-verification, not independent
review and not permission to merge.

## Changes

| Follow-up | Change |
|---|---|
| T28 YouTube note | `hackertube/dashboard/dist/index.js` renders `Metadata from YouTube. Explanations and library actions are HackerTube’s.` (curly apostrophe) in the unchanged muted `ht-note` tier. `tests/test_dashboard_page.js` now pins that exact string instead of matching `/YouTube metadata/`. |
| Compact rows hide the format badge | `hackertube/dashboard/dist/style.css`: `.hackertube .ht-compact .ht-format { display: none; }`. The badge node stays in the markup, full cards keep it visible, and the compactness decision at the section callers is unchanged (owner: "keep compact rows for everyone"). |
| 44px tap targets | `.hackertube .ht-model-picker a` gets `min-height: 44px; display: inline-flex; align-items: center;` and `.hackertube .ht-model-picker select` gets `min-height: 44px`. The `display` change is required: `min-height` does not apply to an inline box, so `min-height` alone measured 20px. |
| Receipt fix (Cracked P3) | `docs/receipts/visual-pass/summary.json` records the corrected ten-trial FEED12 batch at `ab71d7a` as `feed12_after` (+ `feed12_after_head`) and keeps the original 5/5 batch at `7b839c4` under `feed12_history`, marked superseded by `round1/README.md`. `summarize.py` derives both from the raw logs, so regeneration cannot reintroduce the disproven claim. `summary-table.md` is regenerated from it. |

`openspec/changes/hackertube-v1/verification.md` records the decision and the
measured checks below.

## Measured checks

- `pytest-collect.log`, `pytest.log`: 314 collected, **314 passed** (1 pre-existing
  Starlette/httpx deprecation warning).
- `node.log`: `tests/test_dashboard_page.js tests/test_browser_requests.js
  tests/test_privacy_browser.js` — **151 tests, 151 passed, 0 failed, 0 skipped**.
- `FEED12-1.log` … `FEED12-5.log`: **five consecutive FEED12 passes** on this head.
- `red-base.log` (`red-check.sh`): the two new assertions against the exact base
  production bytes — **2 failed**, plus 1 positive control that asserts the badge
  is still present in the markup. The script restores the implementation from an
  in-memory copy and asserts both file hashes afterwards (`RESTORE_OK`).
- `geometry.json`, `capture.log`, `discover-{390,1280}.png`,
  `search-{390,1280}.png`: the real bundle and plugin stylesheet with the compiled
  Hermes host stylesheet loaded first. Asserted at both widths: the exact T28
  text; compact badges `display: none` (3 rows) while full-card badges stay
  `block` (4 cards); management link and select both **44px** tall; every search
  box's own `scrollWidth <= clientWidth` and `right <= viewport`.
  Measured right edges: link 334.02 / select 375.00 at 390px; 318.94 / 659.92 at
  1280px.
- `plugin-validate.log`, `plugin-doctor.log`: `hermes plugins validate .` and
  `hermes plugins doctor . --ci` both exit 0 from the plugin folder.
- `clean-enable.log`, `clean-plugin-list.log`, `clean-profile.log`: a fresh
  disposable `HERMES_HOME` links and enables the plugin (enabled state read back).
  The probe accepts privacy, then exercises two failure paths: the unconfigured
  provider returns **503 `provider_unavailable`** with zero outbound requests, and
  an injected source outage records `request failed` for Open Library while the
  healthy Hacker News source still succeeds in the same pass. The explicit `stub`
  provider then succeeds with zero outbound requests. It also asserts the enabled
  profile ships the new note and both CSS rules.
- `openspec.log`, `spec-coverage.log`: strict validation passes (1 change, 0
  failed); scenario coverage passes (32 PRD IDs, 8 capabilities, 51 requirements,
  100 scenarios) — unchanged by this card.

## Limits

The screenshots are the fixture harness: real production bundle and plugin
stylesheet, compiled host stylesheet, React, but stub SDK components and stubbed
local API, with external artwork blocked. Not an installed-gateway render and no
live source, model or paid retrieval. A native `select` still truncates a long
selected label inside its own control (unchanged, previously documented); the
control and its neighbours fit the viewport. DOM/geometry observation, not an
assistive-technology run.

## Reproduction

```sh
python -m pytest tests --collect-only -q
python -m pytest tests -q
node --test tests/test_dashboard_page.js tests/test_browser_requests.js tests/test_privacy_browser.js
for i in 1 2 3 4 5; do node --test --test-name-pattern FEED12 tests/test_browser_requests.js; done
sh docs/receipts/post29/red-check.sh
node docs/receipts/post29/capture.js
(cd hackertube && hermes plugins validate . && hermes plugins doctor . --ci)
HERMES_HOME=<fresh> hermes plugins enable hackertube
HERMES_HOME=<fresh> <hermes-venv>/bin/python3 docs/receipts/post29/clean_profile_probe.py
python docs/receipts/visual-pass/summarize.py   # run at the visual-pass head
```

Environment: Python 3.13 venv with pytest/FastAPI/httpx; Node 26 with
`NODE_PATH` pointing at esbuild/react/react-dom/playwright and
`PLAYWRIGHT_BROWSERS_PATH` at the installed browser directory. `capture.js`
accepts `HACKERTUBE_HOST_CSS` for a different compiled host stylesheet.
