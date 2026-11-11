# Post-#34 follow-ups receipt (bigger compact thumbnail, small fixes)

Head the measurements were captured at: **`44592fdc904496c39b8e640de2b8174324f215a2`**
(branch `hermes/post34-followups`, based on `main` at
`3788fe6a0bebc6d3b03463ff29a0fd57cb66dc40`, PR #34 merged). This README lands in
the commit after it and changes nothing that was measured. PR #35's earlier head,
`e44b825`, is the **pre-fix** head this receipt compares against (`before/`).

The round-2 review correction (`1a7d440e5f8fe1c30bb65132ef6d1a09ab904534`, the
`route_harness` monkeypatch-teardown fix, plus its own teardown-probe receipts and
a refreshed `pytest.log` / `node.log` / `probe-*.log`) touches **only** test files
and this receipt directory: the production bundle, the stylesheet and every
screenshot were byte-identical between `44592fd` and `1a7d440`, which is why the
geometry tables below still quote the `44592fd` capture.

Scope of every measurement below: the production bundle and stylesheet in a React
fixture with stub SDK components, a stub local API, and fixture images served
locally for the `i.ytimg.com` paths — plus, in the clean-profile run, the assets
installed in a fresh `HERMES_HOME`. This is **not** an installed dashboard, not a
live-provider receipt, and not a real YouTube image.

## What each artifact shows

| Artifact | Shows |
|---|---|
| `geometry-head.json` | The head's measured compact-row layout, DOM order, title-before-media, thumbnail-vs-mark boxes for both frame shapes, media/Icon line behaviour, overflow and Tab order (paint order and title→Tab) at 320 / 390 / 767 / 768 / 1280. |
| `geometry-base.json` | The same measurements taken from the **pre-fix** head (`e44b825`), run with this card's own capture script. |
| `before/*.png` | The pre-fix head's screenshots of Videos, Search and Discover at 320 / 390 / 767 / 768 / 1280. |
| `videos-*.png`, `search-*.png`, `discover-*.png` | The same screenshots at this head. |
| `pytest.log`, `pytest-collect.log`, `node.log`, `feed12.log` | The suite runs quoted below, at this head. |
| `probe-*.log` | `docs/receipts/requests/{probe,bypass_probe,red_against_main}.py` from the repository root (all exit 0). |
| `red-check-browser-base.log`, `red-check-python-base.log`, `red-check-mutations.log` | The red evidence: the new tests failing against `e44b825`, the 16:9-crop mutation the old 4:3 test misses, and the loop-stop mutation the old purge test misses. |
| `plugin-validate.log`, `plugin-doctor.log` | `hermes plugins validate .` and `hermes plugins doctor . --ci` from `hackertube/` (both exit 0). |
| `teardown_probe.py`, `run-teardown-probe.sh`, `teardown-probe-base.log`, `teardown-probe-head.log`, `teardown-probe-suite.log` | The round-2 isolation evidence: the same teardown probe (which host stubs survive a test in `sys.modules`) at the reviewed head `ee2a613` (all six leak), at this head over `test_installed_search.py` + `test_privacy.py` (none leak), and over the whole suite (first leak site named — a caller that passes no `monkeypatch`). |
| `clean-profile.log`, `probe.json`, `render.json`, `enable.log`, `clean-plugin-list.log` | The clean-profile run (fresh `HERMES_HOME`, plugin enabled by `hermes plugins enable`): backend probe and browser render, including the named failure paths. |
| `openspec.log`, `spec-coverage.log` | OpenSpec strict validate and `scripts/check_spec_coverage.py`. |
| `capture.js`, `run-capture.sh` | Regenerate the geometry files, the comparison and the screenshots. |
| `clean_profile_probe.py`, `clean_profile_render.js`, `run-clean.sh` | Regenerate the clean-profile run. |

## What this fix changes (head vs pre-fix head `e44b825`)

| # | Surface | Before (`e44b825`) | After |
|---|---|---|---|
| 1 | Compact-row DOM order | media column, then the text column | **header (badge, title, creator), then the media column, then the rest** (drives reading and Tab order) |
| 2 | Heading navigation to a title, then Tab | Save, Dismiss, then the **next row's** Watch link | **this row's** Watch link, then Save, then Dismiss (`geometry-head.json` → `viewport[1280].tabOrder.fromTitle`) |
| 3 | Compact row at 768px+ | `flex-direction: row` | `display: grid` with areas `"media head" "media rest"` — the media column is still painted left, so the focusable order still matches the paint order |
| 4 | Compact row below 768px | media stacked **above** the text | header, then media, then the rest, in DOM order |
| 5 | Everything else | — | unchanged: thumbnail 192×144 (4:3) / 192×108 (16:9), visible mark 143.09×100.18, 430px media column, no overflow, same row heights, same full-card heights |

## Measured claims (head, from `geometry-head.json`)

| Claim | 320 | 390 | 767 | 768 | 1280 |
|---|---|---|---|---|---|
| Compact row display | `flex` | `flex` | `flex` | `grid` | `grid` |
| Header child index (DOM) | 0 | 0 | 0 | 0 | 0 |
| Media child index (DOM) | 1 | 1 | 1 | 1 | 1 |
| Rest-of-text child index (DOM) | 2 | 2 | 2 | 2 | 2 |
| Title precedes the media in the DOM | yes | yes | yes | yes | yes |
| Media column width | 290 (shrink-to-fit) | 360 | 420.4 | 430 | 430 |
| Thumbnail box, 4:3 | 192 × 144 | 192 × 144 | 192 × 144 | 192 × 144 | 192 × 144 |
| Thumbnail box, 16:9 | 192 × 108 | 192 × 108 | 192 × 108 | 192 × 108 | 192 × 108 |
| Visible mark (unchanged) | 143.09 × 100.18 | … | … | … | 143.09 × 100.18 |
| Thumbnail wider/taller than the mark | yes | yes | yes | yes | yes |
| Thumbnail on its own line (Icon after) | yes | yes | no | no | no |
| Thumbnail beside the Icon on one line | no | no | yes | yes | yes |
| Horizontal overflow (owning boxes) | none | none | none | none | none |
| Tab order matches the painted order | — | — | — | — | yes |
| Tab from the title | — | — | — | — | Watch, Save, Dismiss |
| Full-card height (unchanged) | 806.3 | 858.8 | 860.3 | 860.7 | 841 |

The thumbnail stays unaltered on every measured surface: computed
`border-radius: 0px`, `clip-path: none`, `filter: none`, no ancestor clip, no
overlay, and a rendered box matching the image's own aspect — 4:3 → 192×144,
16:9 → 192×108.

## Row heights compared with the pre-fix head (`geometry-base.json`)

| Width | `e44b825` row height | Head row height | Delta |
|---|---|---|---|
| 320 | 611.2 | 611.2 | 0.0 |
| 390 | 611.2 | 611.2 | 0.0 |
| 767 | 415.3 | 415.3 | 0.0 |
| 768 | 255.0 | 255.0 | 0.0 |
| 1280 | 219.0 | 219.0 | 0.0 |

Reordering the three parts of a stacked column does not change its total height,
and the grid at 768px and up is the same one-line row as before, so every row
height is identical. The only visual difference is the vertical order below
768px (header, then media, then rest), which the fix's card permits ("below
768px, visual order may follow the DOM"); sizes, colour, copy and the attribution
mark are unchanged.

## Red-then-green evidence

Each fix was made to fail first:

* **Item 1 (DOM order, production behaviour)** — the new browser tests
  `a compact YouTube row leads with its header, then its media, then its text…`
  and `a compact YouTube row's Tab order reaches its own Watch, Save and
  Dismiss after its title at 1280` run against the **pre-fix** production files
  at `e44b825` both FAIL (`red-check-browser-base.log`).
* **Item 2 (16:9 fixture, test gap)** — production is already correct
  (`height:auto`), so the red evidence is a mutation the OLD 4:3-only test misses:
  with `.ht-thumb-compact` given `height: 144px; object-fit: cover`, the old test
  still PASSES (a 4:3 source fills a 4:3 box exactly) while the new 16:9 assertion
  FAILS (`the rendered aspect ratio matches the image within 1%`,
  `1.7778 natural vs 1.3333 rendered`) (`red-check-mutations.log`).
* **Item 3 (test isolation, production behaviour unchanged)** — the two privacy
  tests depend, at `e44b825`, on a `plugins.plugin_storage` stub leaked into
  `sys.modules` by `route_harness.install_host`. With the stub leaked with a data
  root that has no `profile.db` (the state Picasso's run left behind), both tests
  FAIL at `e44b825` and PASS at head, which patches `_profile_db_path` in each
  test and registers the host stubs through `monkeypatch.setitem`
  (`red-check-python-base.log`). Run alone or in any order they pass at head.
  **Round-2 correction:** the first cut of that registration was inert — the six
  stubs were still assigned into `sys.modules` directly *before* the `setitem`
  loop, so `setitem` recorded the stub as the value to restore and teardown put
  the stub back. The six direct assignments are gone (the direct update survives
  only for the `monkeypatch is None` path), the docstring now says which path
  leaks, and the claim is measured at both revisions by `run-teardown-probe.sh`:
  `teardown-probe-base.log` (`before_session=[]` →
  `leaked_after_session=[all six]` at `ee2a613`) vs `teardown-probe-head.log`
  (`leaked_after_session=[]`). Callers that pass no `monkeypatch` still install
  the stubs directly, which is the documented behaviour of that path;
  `teardown-probe-suite.log` names the first whole-suite site that depends on it.
* **Item 4 (second purge attempt, test gap)** — with the interval loop removed
  from `start_housekeeping.clean()` (a single startup pass, then return), the OLD
  `test_startup_purge_logs_a_warning_and_continues_on_failure` still PASSES while
  the new assertion (`a second attempt actually runs`) FAILS
  (`red-check-mutations.log`).

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
  stylesheet carry this branch (header-first DOM, grid areas at 768, 430px media
  column, 192px thumbnail, exact host check, thread startup purge that logs); a
  **fresh profile has no `profile.db`, and `start_housekeeping` does not create
  one** (`exists_before: false`, `exists_after_start_housekeeping: false`); routes
  answer (privacy, status, catalog); an expired YouTube row **and** a YouTube row
  with no deadline are both present on disk before startup and both gone after
  `start_housekeeping(interval=3600)`; a look-alike thumbnail host
  (`i.ytimg.com.evil.example`), a **suffix** look-alike (`xi.ytimg.com`), a
  **prefix** look-alike (`evil-i.ytimg.com`) and an unrelated host are never
  stored as artwork while the official host still is; a one-source outage still
  returns with zero free/metered/paid calls; a display check is one FREE image
  read.
* **Browser (`clean_profile_render.js`, exit 0)** — from the **installed** assets:
  the look-alike, suffix and unrelated hosts each render no thumbnail and make
  **zero** requests to that host, a failed official image leaves no broken hole,
  the linked Icon and the short note remain in both the compact row and the full
  card, the installed layout puts the **header first, then the media, then the
  rest** in the DOM (`display: flex` at 320/390/767, `display: grid` with a 430px
  media column at 768/1280), and no owning box overflows at 320/390/767.
