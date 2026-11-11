# Post-#35 follow-ups receipt (compact-row grid gap, 320px Watch link ring)

Head the measurements were captured at: **`98e4c889812e8613f848320241654ac1d441e94e`**
(branch `hermes/post35-followups`, based on `main` at
`6ba4e4fd33efbe6273a138ad12c5e376178fca2a`, PR #35 merged). This README lands in
the commit after it and changes nothing that was measured. The **pre-fix** head
every comparison uses is that same `6ba4e4f`.

Scope of every measurement below: the production bundle and stylesheet in a React
fixture with stub SDK components, a stub local API, and fixture images served
locally for the `i.ytimg.com` paths — plus, in the clean-profile run, the assets
installed in a fresh `HERMES_HOME`. This is **not** an installed dashboard, not a
live-provider receipt, and not a real YouTube image.

## What each artifact shows

| Artifact | Shows |
|---|---|
| `geometry-head.json` | The head's measured compact rows (display, `grid-template-rows`, row gap, gap under the header, whether the media column is taller than the text, media width, DOM child order) and the full card's Watch link (box, ring rect, card box, every clipping ancestor, Icon box and aspect) at 320 / 390 / 767 / 768 / 1280. |
| `geometry-base.json` | The same measurements taken from the **pre-fix** head `6ba4e4f`, with this card's own capture script. |
| `row-heights.json` | The base-vs-head comparison table (labelled `base_*` / `head_*`) that the tables below quote. |
| `before/*.png` | The pre-fix head's screenshots of Videos, the full feed card, Search and Discover at 320 / 390 / 767 / 768 / 1280. |
| `discover-*.png`, `videos-*.png`, `feed-card-*.png`, `search-*.png` | The same screenshots at this head. |
| `watch-ring-{base,head}-320-{off,on}.png`, `ring_check.py` | The focus-ring pixel evidence: the same 320px clip of the full card's Watch link unfocused and focused, and the diff bounding box compared with the link's own box. |
| `pytest.log`, `pytest-collect.log`, `node.log`, `feed12.log` | The suite runs quoted below, at this head. |
| `probe-*.log` | `docs/receipts/requests/{probe,bypass_probe,red_against_main}.py` from the repository root (all exit 0). |
| `red-check-browser-base.log`, `red-check-mutations.log`, `red-check-python-base.log` | The red evidence: the new browser tests failing at `6ba4e4f`, and the two reported mutations (the header slice and the purge loop) passing the OLD tests and failing the new ones. |
| `teardown-probe-base.log`, `teardown-probe-head.log`, `teardown_probe.py`, `run-teardown-probe.sh` | Item 5's evidence: which host stubs survive a whole suite run at each revision. |
| `plugin-validate.log`, `plugin-doctor.log` | `hermes plugins validate .` and `hermes plugins doctor . --ci` from `hackertube/` (both exit 0). |
| `clean-profile.log`, `probe.json`, `render.json`, `enable.log`, `plugin-list.log` | The clean-profile run (fresh `HERMES_HOME`, plugin enabled by `hermes plugins enable`): backend probe and browser render against the installed assets, including the named failure paths. |
| `openspec.log`, `spec-coverage.log` | OpenSpec strict validate and `scripts/check_spec_coverage.py`. |
| `capture.js`, `run-capture.sh`, `compare.py` | Regenerate the geometry files, the comparison, the screenshots and the ring check. |
| `mutate.py`, `run-red-checks.sh` | Regenerate the red evidence. |

## What this fix changes (head vs pre-fix head `6ba4e4f`)

| # | Surface | Before (`6ba4e4f`) | After |
|---|---|---|---|
| 1 | Gap under a compact row's header at 768px+ | the grid grew both tracks to absorb a taller media column, so the header floated: **6.8 / 22.6 / 6.8px** at 1280 against a 4.5px row gap | `grid-template-rows: auto 1fr`: **4.5 / 4.5 / 4.5px**, exactly the row gap, at 768 and 1280 |
| 2 | Full-card Watch link's focus ring | the block was sized to the link and clipped (`overflow: hidden`), so at 320px **no focus ring was drawn at all** (the focused and unfocused captures are pixel-identical) | the block does not clip; the ring is drawn on all four sides (`ring_check.py` diff box matches the link box inflated by the outline on every side) |
| 3 | Full-card Watch link width at 320px | 11.4..308.6 in a card of 15..305 — **3.6px past the card on each side** | 22.9..297.1 in the same card, ~8px clear on each side |
| 4 | Full-card Watch link in a narrow card at a WIDE viewport | at 1280 with a one-item ranked feed (a single `17rem` track, 277.5px) the link was 54.2..351.3 in a card of 64.0..341.5 | the padding shrinks with the card, not the viewport, so the link fits at every measured width; the clean-profile render asserts it at 320 / 390 / 767 / 768 / 1280 |
| 5 | Compact row header mark-up | `text.slice(0, 3)` of the row text list | the named `[badge, title, creator]` list |
| 6 | Startup-purge test | a second attempt was enough, so "startup pass + one interval pass, then stop" passed | a THIRD attempt is required, so that mutation fails |
| 7 | `route_harness` host stubs | `start()` installed them directly; six stubs survived the session | `start()` takes `monkeypatch`; every route test passes it; nothing survives |
| 8 | Everything else | — | unchanged: thumbnail 192×144 (4:3) / 192×108 (16:9), visible mark 143.09×100.18, Icon 186px box, 430px media column, every row height, every full-card height |

## Measured claims (head, from `geometry-head.json` / `row-heights.json`)

| Claim | 320 | 390 | 767 | 768 | 1280 |
|---|---|---|---|---|---|
| Compact row display | `flex` | `flex` | `flex` | `grid` | `grid` |
| Row gap | 4.5 | 4.5 | 4.5 | 4.5 | 4.5 |
| Gap under the header, base → head | 360.8 → 360.8 *(stacked)* | 360.8 → 360.8 *(stacked)* | 205.5 → 205.5 *(stacked)* | 4.5 → 4.5 | **6.8 / 22.6 / 6.8 → 4.5 / 4.5 / 4.5** |
| Media column taller than its text | no | no | no | no | yes |
| Media column width | shrink | shrink | shrink | 430 | 430 |
| Compact row height, base → head | 611.2 → 611.2 | 611.2 → 611.2 | 415.3 → 415.3 | 255.0 → 255.0 | 219.0 → 219.0 |
| Full-card Watch link, base → head | **11.4..308.6 → 22.9..297.1** | 46.4..343.6 → 46.4..343.6 | 47.4..344.5 → 47.4..344.5 | 47.6..344.8 → 47.6..344.8 | 142.0..439.2 → 142.0..439.2 |
| Card box at that width | 15..305 | 15..375 | 15..376.9 | 15..377.4 | 122.5..458.8 |
| Watch link computed padding | `40px` → `40px 28.5px` | `40px` → `40px` | `40px` → `40px` | `40px` → `40px` | `40px` → `40px` |
| Visible mark (compact / full) | 143.09 × 100.18 | … | … | … | 143.09 × 100.18 |
| Full-card height, base → head | 806.3 → 806.3 | 858.8 → 858.8 | 860.3 → 860.3 | 860.7 → 860.7 | 841.0 → 841.0 |
| Tab from the title (1280) | — | — | — | — | Watch, Save, Dismiss |

The Watch link's padding narrows only where the card is narrower than the link
plus its ring: at 320px the card's content box is 290px, so the padding is
`(290 − 233) / 2 = 28.5px`; at 390px and above the card has room and the
computed padding is the original 40px. Nothing else about the link changes —
same height, same 186px Icon box, same visible mark.

## Focus-ring pixel check (`ring_check.py`, 320px)

```
head 320px ring spread measured=3px clip=(297, 352)
  link in clip : {'left': 11.9, 'right': 286.1, 'top': 11.4, 'bottom': 340.7}
  expected ring: {'left': 9, 'top': 8, 'right': 289, 'bottom': 344}
  pixel diff   : {'left': 8, 'top': 7, 'right': 290, 'bottom': 345}
  ring present on all four sides
base 320px: the focused and unfocused captures are identical: no ring was drawn
```

The diff box is the ring and nothing else: it matches the link's box inflated by
the outline on every side, within one pixel of rounding. At `6ba4e4f` the ring is
not merely cut — it is entirely absent, because the clipping box was the link's
own box.

## Red-then-green evidence

* **Item 1 (grid gap)** — the new browser test
  `a compact row's header sits one row gap above the rest of its text at 768 and
  1280` runs against the **pre-fix** production files at `6ba4e4f` and FAILS
  (`at 1280px row 1 the header sits one row gap (4.8px) above the text, not
  8.6px`) — `red-check-browser-base.log`.
* **Item 2 (320px Watch link)** — the new browser test
  `the full card's Watch link and its focus ring stay inside the card, at 320
  through 1280` also runs at `6ba4e4f` and FAILS
  (`at 320px the Watch link fits inside the card (11.4..308.6 in 24.0..296.0)`)
  — same log.
* **Item 3 (header contents)** — production is not wrong at `6ba4e4f` (the slice
  happens to be the right three lines), so the red evidence is the mutation the
  OLD suite misses: with `text.slice(0, 3)` changed to `text.slice(0, 2)` or
  `text.slice(0, 4)`, the pre-fix file's own 148 tests **all pass** while the new
  test **fails** (`the header holds exactly three lines: 2` / `: 4`) —
  `red-check-mutations.log`.
* **Item 4 (purge loop)** — with the loop changed to "purge at startup, purge
  once after the first interval, then stop", the OLD purge test **passes** and
  the new one **fails** (`red-check-python-base.log`). The old docstring claimed
  that mutation was already caught; it was not.
* **Item 5 (route_harness teardown)** — the same probe over the whole suite at
  both revisions: `6ba4e4f` begins with no stubs and ends with all six in
  `sys.modules` (`leaked_after_session=[agent, agent.secret_scope, plugins,
  plugins.plugin_storage, hermes_cli, hermes_cli.config]`, first leaking in
  `test_request_boundary_routes.py`); this head begins and ends with none
  (`teardown-probe-base.log`, `teardown-probe-head.log`).
* **Item 6 (stale comment)** — a comment, with no test. The comment now reads
  header > media > rest and is checked by review, not by a run.

## Commands and results

```sh
# Python
$HOME/.hermes/cache/scratch/p35-venv/bin/python -m pytest --collect-only -q   # 326 collected
$HOME/.hermes/cache/scratch/p35-venv/bin/python -m pytest -q                  # 326 passed
# Node (same three files as #34/#35)
node --test tests/test_dashboard_page.js tests/test_browser_requests.js \
  tests/test_privacy_browser.js                    # 176 pass, 0 fail
# Probes (from the repository root)
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

## Clean-profile run (installed assets, `run-clean.sh`)

A fresh `HERMES_HOME`, the repo's `hackertube` directory linked in, then the real
`hermes plugins enable hackertube` (exit 0), then:

* **Backend (`clean_profile_probe.py`, exit 0)** — the installed bundle carries
  the named `[badge, title, creator]` header and the header > media > rest DOM
  order; the installed stylesheet carries `grid-template-rows: auto 1fr`, the
  `overflow: visible` brand block and the card-width-driven link padding; a
  **fresh profile has no `profile.db`** (`exists_before: false`,
  `exists_after_start_housekeeping: false`); an expired YouTube row and an
  undated YouTube row are both gone after `start_housekeeping(interval=3600)`;
  a look-alike host (`i.ytimg.com.evil.example`), a **suffix** look-alike
  (`xi.ytimg.com`), a **prefix** look-alike (`evil-i.ytimg.com`) and an unrelated
  host are never stored as artwork while the official host still is; a one-source
  outage returns with zero free/metered/paid calls; a display check is one FREE
  image read.
* **Browser (`clean_profile_render.js`, exit 0)** — from the **installed**
  assets: the look-alike, suffix and unrelated hosts each render no thumbnail and
  make **zero** requests to that host; a failed official image leaves no broken
  hole; the linked Icon and the short note remain in both the compact row and the
  full card; the installed layout puts the header first, then the media, then the
  rest (`display: flex` at 320/390/767, `display: grid` with a 430px media column
  at 768/1280, the header one row gap above its text); and the installed full
  card's Watch link, its ring and the Icon are inside the card at every measured
  width, including the narrow one-item card at 1280.

## What this receipt does not show

* No live provider call, no real YouTube image, no real device or browser other
  than headless Chromium.
* The 320px check is a fixture at 320 CSS pixels; it is not an installed device.
* The card's own numbers were measured against this card's fixture content. The
  overhang and the gap delta therefore scale with the fixture's text and media
  heights — the *class* of the defect is what the assertions pin, not the exact
  pixel count for any other content.
