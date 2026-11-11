# Post-#33 follow-ups receipt (compact-row accessibility/layout, expiry, test gaps)

Head: this branch, `hermes/post33-followups`, based on `main` at
`093d0785e57852f6995ecbcb57f0e82208ab598a` (PR #33 merged).

Scope of every measurement below: the production bundle and stylesheet in a React
fixture with stub SDK components, a stub local API, and fixture images served
locally for the `i.ytimg.com` paths — plus, in the clean-profile run, the assets
installed in a fresh `HERMES_HOME`. This is **not** an installed dashboard, not a
live-provider receipt, and not a real YouTube image.

## What each artifact shows

| Artifact | Shows |
|---|---|
| `geometry-head.json` | The head's measured compact-row layout, DOM order, icon mark/aspect, tap target and row height at 390 / 767 / 768 / 1280. |
| `geometry-base.json` | The same measurements taken from the **#33** production files (`093d078`), run with this card's own capture script. |
| `row-heights.json` | The head-vs-#33 comparison derived from the two geometry files. |
| `videos-*.png`, `search-*.png`, `discover-*.png` | Screenshots of Videos, Search and Discover at 390 / 767 / 768 / 1280. |
| `pytest.log`, `pytest-collect.log`, `node.log`, `feed12.log` | The suite runs quoted above, at this head. |
| `red-check-browser.log`, `red-check-python.log` | The mutation red-checks: each production change reverted one at a time, the matching test red, the file restored and sha256-verified. |
| `plugin-validate.log`, `plugin-doctor.log` | `hermes plugins validate .` and `hermes plugins doctor . --ci` from `hackertube/` (both exit 0). |
| `clean-enable.log`, `clean-profile.json`, `clean-profile-render.json` | The clean-profile run (fresh `HERMES_HOME`, plugin enabled by `hermes plugins enable`): backend probe and browser render, including the two named failure paths. |
| `capture.js`, `run-capture.sh` | Regenerate the geometry files, the comparison and the screenshots. |
| `clean_profile_probe.py`, `clean_profile_render.js`, `run-clean.sh` | Regenerate the clean-profile run. |

## Measured claims (head, from `geometry-head.json`)

| Claim | 390 | 767 | 768 | 1280 |
|---|---|---|---|---|
| Compact row flex direction | `column` | `column` | `row-reverse` | `row-reverse` |
| Row-text child index (DOM) | 0 | 0 | 0 | 0 |
| Art child index (DOM) | 1 | 1 | 1 | 1 |
| Title precedes the Watch link in the DOM | yes | yes | yes | yes |
| Side column width | 325.9 (shrink-to-fit) | 325.9 | 345 | 345 |
| Row text left x, row with / without a thumbnail | 15 / 15 | 15 / 15 | 375 / 375 | 482.5 / 482.5 |
| Icon file box | 186 × 217.1 | 186 × 217.1 | 186 × 217.1 | 186 × 217.1 |
| Icon box aspect (asset 1255:1075 = 1.1674) | 1.1674 | 1.1674 | 1.1674 | 1.1674 |
| Visible mark height | 100.18 | 100.18 | 100.18 | 100.18 |
| Compact tap target | 217 × 186 | 217 × 186 | 217 × 186 | 217 × 186 |
| Link padding | `0px 0px` | `0px 0px` | `0px 0px` | `0px 0px` |
| Thumbnail and Icon on one line | yes | yes | yes | yes |
| One-line gap | 11.3 | 11.3 | 11.3 | 11.3 |
| Full-card icon box aspect / visible mark | 1.1674 / 100.18 | 1.1674 / 100.18 | 1.1674 / 100.18 | 1.1674 / 100.18 |
| Full-card horizontal overflow | 0 | 0 | 0 | 0 |

The thumbnail stays unaltered on every measured surface: computed
`border-radius: 0px`, `clip-path: none`, `filter: none`, no ancestor clip, no
overlay, and a rendered box matching the image's own aspect.

## Row heights compared with #33 (`row-heights.json`)

| Width | #33 row height | Head row height | Delta | Why |
|---|---|---|---|---|
| 390 | 471.0 | 456.0 | −15.0 | The link no longer pads the Icon box (202 → 186 px tall). |
| 767 | 255.0 | 415.3 | +160.3 | The side-column switch moved to 768, so 640–767 now stacks: the art sits under the text. |
| 768 | 255.0 | 255.0 | 0.0 | First side-column width in both. |
| 1280 | 234.0 | 219.0 | −15.0 | Same −15px as at 390. |

The 767 delta is the direct, intended consequence of moving the switch from 640
to 768 (the owner decision recorded in `docs/PRD.md` §3). It is reported here
rather than smoothed over. The full feed card is unchanged in height at every
width: 858.8 at 390, 860.3 at 767, 860.7 at 768 and 841 at 1280.

## Red-then-green evidence

Each fix was made to fail first:

* **Items 1, 2, 3 (production behaviour)** — the new/updated browser tests run
  against the **#33** production files in a detached worktree at `093d078`:
  `a compact YouTube row keeps the official linked Icon with a 44px tap target`,
  `a compact YouTube row leads with its text…` and `a compact YouTube row with no
  thumbnail starts its text at the same x as one with` all FAIL there, and pass at
  head.
* **Items 4 and 7 (test gaps, no production defect)** — the behaviour was already
  correct at `093d078`, so a plain rerun cannot be red. The red evidence is the
  mutation: with the **#33 tests**, a squashed compact icon (`width: 150px`) and a
  prefix/suffix host match are both MISSED (exit 0); with the new tests the same
  two mutations are CAUGHT. The icon-aspect test pins the box ratio the old
  height-multiplying mark test could not, and the look-alike host test pins the
  exact match the old `images.example.com` case could not.
* **Items 5, 6 (production behaviour)** — the new tests run against `093d078`
  fail: `test_expired_youtube_data_is_purged_at_startup_not_only_when_opened`,
  `test_a_youtube_evidence_row_without_a_refresh_deadline_is_expired` and
  `test_a_youtube_row_without_a_deadline_drops_its_item_at_the_read_boundary`.
  Reverting the startup `purge()` and reverting the missing-deadline rule (one at
  a time, restored and sha256-verified) fails exactly those tests.

A failing browser test in this file used to leave the fixture server open and
hang the runner instead of reporting; the updated breakpoint test now closes its
page and fixture through `t.after`, so a regression fails.

## Commands and results

```sh
# Python
.venv/bin/python -m pytest --collect-only -q       # 322 tests collected
.venv/bin/python -m pytest -q                      # 322 passed
# Node (same files as #33)
node --test tests/browser_net_harness.js tests/test_dashboard_page.js \
  tests/test_browser_requests.js tests/test_privacy_browser.js   # 170 pass, 0 fail
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

* **Backend (`clean_profile_probe.py`, exit 0)** — routes answer (privacy,
  status, catalog); an expired YouTube row **and** a YouTube row with no deadline
  are both present on disk before startup and both gone after
  `start_housekeeping(interval=3600)`; `active_evidence` keeps an undated
  community row while dropping the undated YouTube row; a look-alike thumbnail
  host (`i.ytimg.com.evil.example`) and an unrelated host are never stored as
  artwork while the official host still is; a one-source outage still returns with
  zero free/metered/paid calls; a display check is one FREE image read.
* **Browser (`clean_profile_render.js`, exit 0)** — from the **installed** assets:
  the look-alike host and an unrelated host each render no thumbnail and make
  **zero** requests to that host, a failed official image leaves no broken hole,
  the linked Icon and the short note remain in both the compact row and the full
  card, and the installed layout puts the text first in the DOM with the side
  column at 768 (`column` at 390/767, `row-reverse` with a 345px side column at
  768).
