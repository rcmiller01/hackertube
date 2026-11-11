# Post-#34 follow-ups receipt (bigger compact thumbnail, small fixes)

Head the measurements were captured at: **`0d99c72a6649cda56843b70613bd5e2f366c4904`**
(branch `hermes/post34-followups`, based on `main` at
`3788fe6a0bebc6d3b03463ff29a0fd57cb66dc40`, PR #34 merged). This README lands in
the commit after it and changes nothing that was measured.

Scope of every measurement below: the production bundle and stylesheet in a React
fixture with stub SDK components, a stub local API, and fixture images served
locally for the `i.ytimg.com` paths — plus, in the clean-profile run, the assets
installed in a fresh `HERMES_HOME`. This is **not** an installed dashboard, not a
live-provider receipt, and not a real YouTube image.

## What each artifact shows

| Artifact | Shows |
|---|---|
| `geometry-head.json` | The head's measured compact-row layout, DOM order, thumbnail-vs-mark boxes, media/Icon line behaviour, overflow and Tab order at 320 / 390 / 767 / 768 / 1280. |
| `geometry-base.json` | The same measurements taken from the **#34** production files (`3788fe6`), run with this card's own capture script. |
| `row-heights.json` | The head-vs-#34 comparison derived from the two geometry files. |
| `videos-*.png`, `search-*.png`, `discover-*.png` | Screenshots of Videos, Search and Discover at 320 / 390 / 767 / 768 / 1280. |
| `pytest.log`, `pytest-collect.log`, `node.log`, `feed12.log` | The suite runs quoted below, at this head. |
| `probe-*.log` | `docs/receipts/requests/{probe,bypass_probe,red_against_main}.py` from the repository root (all exit 0). |
| `red-check-browser-base.log`, `red-check-python-base.log`, `red-check-mutations.log` | The red evidence: the new tests failing against `3788fe6`, and the two host/`_active` mutations. |
| `plugin-validate.log`, `plugin-doctor.log` | `hermes plugins validate .` and `hermes plugins doctor . --ci` from `hackertube/` (both exit 0). |
| `clean-profile.log`, `probe.json`, `render.json`, `enable.log`, `clean-plugin-list.log` | The clean-profile run (fresh `HERMES_HOME`, plugin enabled by `hermes plugins enable`): backend probe and browser render, including the named failure paths. |
| `openspec.log`, `spec-coverage.log` | OpenSpec strict validate and `scripts/check_spec_coverage.py`. |
| `capture.js`, `run-capture.sh` | Regenerate the geometry files, the comparison and the screenshots. |
| `clean_profile_probe.py`, `clean_profile_render.js`, `run-clean.sh` | Regenerate the clean-profile run. |

## Measured claims (head, from `geometry-head.json` / `row-heights.json`)

| Claim | 320 | 390 | 767 | 768 | 1280 |
|---|---|---|---|---|---|
| Compact row flex direction | `column` | `column` | `column` | `row` | `row` |
| Media child index (DOM) | 0 | 0 | 0 | 0 | 0 |
| Row-text child index (DOM) | 1 | 1 | 1 | 1 | 1 |
| Media precedes the text in the DOM | yes | yes | yes | yes | yes |
| Media column width | 290 (shrink-to-fit) | 360 | 420.4 | 430 | 430 |
| Thumbnail box | 192 × 144 | 192 × 144 | 192 × 144 | 192 × 144 | 192 × 144 |
| Visible mark (unchanged from #34) | 143.09 × 100.18 | 143.09 × 100.18 | 143.09 × 100.18 | 143.09 × 100.18 | 143.09 × 100.18 |
| Thumbnail wider/taller than the mark | yes | yes | yes | yes | yes |
| Thumbnail on its own line (Icon after) | yes | yes | no | no | no |
| Thumbnail beside the Icon on one line | no | no | yes | yes | yes |
| Icon file box / tap target | 217.1 × 186 | 217.1 × 186 | 217.1 × 186 | 217.1 × 186 | 217.1 × 186 |
| Horizontal overflow (owning boxes) | none | none | none | none | none |
| Tab order matches the painted order | — | — | — | — | yes |
| Full-card height (unchanged from #34) | 806.3 | 858.8 | 860.3 | 860.7 | 841 |

The thumbnail stays unaltered on every measured surface: computed
`border-radius: 0px`, `clip-path: none`, `filter: none`, no ancestor clip, no
overlay, and a rendered box matching the image's own 4:3 aspect.

## Row heights compared with #34 (`row-heights.json`)

| Width | #34 row height | Head row height | Delta | Why |
|---|---|---|---|---|
| 320 | 540.4 | 611.2 | +70.8 | The 192px thumbnail takes its own line above a 217px Icon and sits above the text now. |
| 390 | 456.0 | 611.2 | +155.2 | Same as 320: the two media parts stack, and the media is above the text. |
| 767 | 415.3 | 415.3 | 0.0 | The media already sat above the text here in #34 (stacked below 768), and the thumbnail and Icon share one line at this width. |
| 768 | 255.0 | 255.0 | 0.0 | The media column is one line (192 + 12 + 217.1 = 421.1 within 430), so the row height is the Icon's, exactly as #34. |
| 1280 | 219.0 | 219.0 | 0.0 | Same as 768. |

The 320/390 deltas are the direct consequence of the bigger thumbnail plus the
media-first DOM order, which is what puts Tab order on the painted order. They
are reported here rather than smoothed over. The full feed card is unchanged in
height at every width.

## Red-then-green evidence

Each fix was made to fail first:

* **Items 1, 2, 3 (production behaviour)** — the new/updated browser tests run
  against the **#34** production files in a detached worktree at `3788fe6`:
  `the compact thumbnail is larger than the official mark in both dimensions…`,
  `a compact YouTube row leads with its thumbnail and Watch link, then its text…`,
  `a compact YouTube row's Tab order matches its visual order at 1280` and
  `a compact YouTube row keeps the official linked Icon with a 44px tap target`
  all FAIL there (`red-check-browser-base.log`, 4 failed / 15 passed) and pass at
  head.
* **Item 5 (production behaviour)** — the new privacy tests run against
  `3788fe6` fail: `test_startup_purge_does_not_block_plugin_registration`,
  `test_startup_purge_logs_a_warning_and_continues_on_failure` and
  `test_startup_purge_does_not_create_a_missing_profile_database`
  (`red-check-python-base.log`, 3 failed / 18 passed).
* **Item 4a (host check, no production defect)** — the behaviour was already an
  exact match, so the red evidence is the mutation: with a suffix-match mutation
  applied to the bundle, the **#34** host tests still pass (2 passed, the
  mutation is missed) while the new `endsWith-style` test FAILS (caught)
  (`red-check-mutations.log`).
* **Item 4b (`ranking._active`, no production defect)** — same shape: with
  `_active` reverted to pass every row through, the **#34** `test_ranking.py`
  already FAILS (1 failed) and the new
  `test_ranking_ignores_expired_community_evidence` also FAILS (2 failed). Note
  that this corrects the #34 review's premise that reverting `_active` survives:
  it does not — `test_feed09_why_line_omits_endorsement_without_established_community_evidence`
  already catches it. The new test additionally pins the ordering effect.

A failing browser test in this file used to leave the fixture server open and
hang the runner instead of reporting; every loop in the new tests closes its page
and fixture through `t.after`, so a regression FAILS.

## Commands and results

```sh
# Python
.venv/bin/python -m pytest --collect-only -q       # 326 tests collected
.venv/bin/python -m pytest -q                      # 326 passed
# Node (same files as #34)
node --test tests/browser_net_harness.js tests/test_dashboard_page.js \
  tests/test_browser_requests.js tests/test_privacy_browser.js   # 174 pass, 0 fail
# Probes (from the repository root, PYTHONPATH=hackertube:tests)
python docs/receipts/requests/probe.py             # exit 0
python docs/receipts/requests/bypass_probe.py      # exit 0
python docs/receipts/requests/red_against_main.py  # exit 0
# FEED12 x10
for i in $(seq 10); do node --test --test-name-pattern FEED12 tests/test_browser_requests.js; done  # 10/10 pass
# OpenSpec
openspec validate --all --strict --no-interactive  # 1 passed, 0 failed
python scripts/check_spec_coverage.py              # PASS
# Plugin checks (from hackertube/)
hermes plugins validate .                          # Validation passed. exit 0
hermes plugins doctor . --ci                       # OK. exit 0
```

## Clean-profile failure paths

`run-clean.sh` builds a fresh `HERMES_HOME`, links the repo's `hackertube`
directory into it, runs the real `hermes plugins enable hackertube`, and then:

* **Backend (`clean_profile_probe.py`, exit 0)** — the installed bundle and
  stylesheet carry this branch (media-first DOM, plain `row` at 768, 430px media
  column, 192px thumbnail, exact host check, thread startup purge that logs); a
  **fresh profile has no `profile.db`, and `start_housekeeping` does not create
  one** (`exists_before: false`, `exists_after_start_housekeeping: false`); routes
  answer (privacy, status, catalog); an expired YouTube row **and** a YouTube row
  with no deadline are both present on disk before startup and both gone after
  `start_housekeeping(interval=3600)`; `active_evidence` keeps an undated
  community row while dropping the undated YouTube row; a look-alike thumbnail
  host (`i.ytimg.com.evil.example`), a **suffix** look-alike (`xi.ytimg.com`), a
  **prefix** look-alike (`evil-i.ytimg.com`) and an unrelated host are never
  stored as artwork while the official host still is; a one-source outage still
  returns with zero free/metered/paid calls; a display check is one FREE image
  read.
* **Browser (`clean_profile_render.js`, exit 0)** — from the **installed**
  assets: the look-alike, suffix and unrelated hosts each render no thumbnail and
  make **zero** requests to that host, a failed official image leaves no broken
  hole, the linked Icon and the short note remain in both the compact row and the
  full card, the installed layout puts the media first in the DOM (`column` at
  320/390/767, `row` with a 430px media column at 768/1280), the installed
  thumbnail is 192 × 144 and beats the 143.09 × 100.18 visible mark in both
  dimensions at every width, and no owning box overflows at 320/390/767.
