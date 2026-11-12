# Post-#41 receipts: the ring tests that were blind to the fix, to the OS scheme, and to a 1px gap

Branch `hermes/post41-followups`, base `main` at
`e5278dc78daddf1d55266b9f146b198be7e49d9f` (the post-#40 merge, PR #41).

Tests, fixture comments and receipts only: `hackertube/dashboard/dist/style.css`
does not change in this PR, and neither does any other production file. This is
the follow-up to the non-blocking findings Cracked (P3, plus the "97%" nit) and
Picasso (1, 2, 3, 4) left on #41.

## The three statements, plainly

1. **The painted-fraction threshold was 95% here; the rule that ships is 100%
   coverage.** As this card left it, "97%" was the CONTROL ring that had to clear
   a 95% fraction — it was not the threshold — and the control was a `clip-path`
   slit that removes 5 whole pixel rows of a 163-pixel stroke (158/163 = 96.9%),
   with the same slit widened to 12 rows (92.6%) failing, so the fraction bit in
   both directions. Post-#42 removed the allowance
   (`docs/receipts/post42/README.md`): a side passes only when EVERY sampled pixel
   carries the ring, so the 97% control is now a FAILING coverage case and the
   full ring is the passing control. Everything else in this file is this card's
   own record at `e5278dc`'s follow-up head.
2. **The dark runs enter the scheme through the host's `.dark` ancestor class**,
   with the OS scheme asserted to be light in the same run, and post-#41 adds two
   `emulateMedia({colorScheme: "dark"})` entries beside it — one with no `.dark`
   class, one with it — so a plugin rule under `@media (prefers-color-scheme:
   dark)` is exercised too.
3. **The real-host before/after captures are light-only and cannot show the ring
   fix.** `host-ring-fix.json` and `host-ring-base.json` both record
   `"dark": false`; the host's own 15px CardContent padding never clipped the
   ring, so those captures are byte-identical by design. **Only the padding-0
   runs prove the fix**, because only there does the plugin's own wrapper decide
   whether the ring survives its own `overflow-x: hidden` clip.

## Item 1 — a run where the HOST PADDING is 0 (Cracked P3)

The harness drew the host's measured `padding: 11.25px 15px` on the fixture's
CardContent, and that padding alone holds the compact Watch link's ring 12px
clear of the plugin's inner `.hackertube` clip. So at the host's padding,
reverting the #41 wrapper rule (`.hackertube .hackertube { padding: 0 4px;
margin: 0 -4px }`) left every ring run green, and only the stylesheet-TEXT
contract in `tests/test_dashboard_page.js` noticed.

`startFixture` now takes a third argument, `renderOptions.cardPadding`, and
`RING_RUNS` carries a padding-0 entry beside light and dark at every width, so
the ring is measured where the plugin's own box is the only thing that can keep
it. The evidence is the pair of runs in the mutation matrix:

| Mutation | These tests | Base tests (main) |
|---|---|---|
| the #41 wrapper rule reverted (both copies) | **red** — `at 320px light host-padding-0 the compact row's Watch link: no ancestor clips the left ring (cut by hackertube; 0/163 of the side is painted)` | **green** — missed, which is the closed gap |
| a `@media (prefers-color-scheme: dark)` rule that kills the ring | **red** — `at 320px os-dark the full card's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 1.07:1 …)` | **green** — missed, which is the closed gap |

The base-tests column is the same mutation run against
`git show <base>:tests/test_privacy_browser.js`, so the difference between the
two columns is the statement of the gap rather than an assertion about it.

The harness's `HOST_TOKENS_CSS` now interpolates the CardContent padding line
from `CARD_CONTENT_PADDING` so the zero variant is a swap rather than a rewrite;
the measured literal still appears in that file exactly once, which is the anchor
post-#40's own `mutate_ring.py` uses (kept intact, not re-run here).

## Item 2 — an OS-dark run with `emulateMedia` (Picasso 1)

The post-#40 dark run put `.dark` on `body` and never emulated a media query, so
a plugin rule that fires only under `@media (prefers-color-scheme: dark)` passed.
`enterScheme` now drives four entries and each run asserts WHICH one darkened it:

| `scheme` | enters how | asserted in the run |
|---|---|---|
| `light` | OS light, no `.dark` | surface luminance > 0.5, `matchMedia` false, no class |
| `dark` | `.dark` on `body`, **OS left light** | surface luminance < 0.2, `matchMedia` false, class present |
| `os-dark` | `emulateMedia({colorScheme:"dark"})`, **no class** | surface luminance < 0.2, `matchMedia` true, no class |
| `os-dark-ancestor` | both | surface luminance < 0.2, `matchMedia` true, class present |

The fixture's host token block already carried a `@media (prefers-color-scheme:
dark)` copy of the dark values, so the OS-dark run measures the same dark surface
the `.dark` run does. Both ring tests iterate one `RING_RUNS`, so a width or an
entry cannot be added to one and forgotten in the other: 4 widths × 6 entries =
24 runs per test.

## Item 3 — a 1px gap fails as COVERAGE, not as contrast (Picasso 2)

The painted test was a fixed channel delta (`> 20`), which counts an
anti-aliased edge pixel as painted. A 1px gap in a 2px stroke therefore never
reached the coverage rule, and the side failed on the partly-painted pixel's own
ratio instead — a contrast number for a coverage defect. Measured on one pair of
screenshots (`gap-probe.log`, `gap_probe.js`; a 1-pixel slit offset a quarter
pixel so both of its boundary rows are split):

| painted rule | painted | partly painted | min over painted | what the suite says |
|---|---|---|---|---|
| this card: at least 50% of the ring | 162/163 (99.4%) | 1 pixel at 25.1% | 7.919:1 | **coverage** — a partly-painted pixel is neither the ring nor the clean surface |
| the rule it replaces: any channel delta > 20 | 163/163 (100%) | 0 | **1.726:1** at a 25.1%-painted pixel | **contrast** — the coverage defect wearing a contrast number |

That 1.726:1 is Picasso's reported "1.73:1", reproduced from the same
measurement that now reports coverage. The painted count alone could never carry
this: one pixel of a 163-pixel side is 0.6%, so the coverage rule's second half —
**every pixel must be painted or cleanly unpainted** (at most 5% of the ring's
own strength) — is what catches it, and that is why the rule has both halves.
`assertPaintedRing`'s coverage finding names the partly-painted pixel's colour,
position and fraction, and says in as many words that it is a coverage defect and
not a contrast reading.

The 97% control still passes **under this card's 95% fraction** (its slit is
aligned to whole pixel rows, so it has no partly-painted pixel), the 94% case
still fails the fraction, and two test mutations pin the new rule: reverting the
painted test to the fixed delta, and removing the partly-painted half, each turn
ONLY the 1px-gap control red. Post-#42 removes the fraction entirely, which is
why that same 97% control is a failing coverage case there — see the correction
of record below.

## Correction of record (post-#42, 2026-11-11)

The owner raised the rule from a 95% painted fraction to **100% coverage**: every
sampled pixel of every side must be painted, and an unpainted or partly-painted
pixel fails as a COVERAGE defect with the count ("162/163 painted"). Two files in
this receipt state the old threshold as the shipped rule and are corrected here
rather than rewritten: statement 1 above (now marked) and the paragraph in "Item
3" (now marked) that says the 97% control still passes. Their measured numbers
are unchanged and still correct for this card's revision; only the rule they are
measured against has moved. The mutation table's failure messages in
`mutation-table.md`, `mutations.json` and `mutations.log` are verbatim output of
`e5278dc`'s test file and are left exactly as they were produced.
`docs/receipts/post42/README.md` carries the rule as it now ships, with the
measurement that shows why the fraction could not be kept.

**What #43 changed in this file (dated 2026-11-11).** #43's edits here are this
note itself, statement 1 (rewritten to state the 95% fraction as this card's own,
with the shipped 100% rule beside it), and the paragraph in "Item 3" that says the
97% control still passes under this card's fraction. Every number in those three
places is unchanged, and the mutation table's verbatim messages are untouched;
only the rule each is measured against is named, which is what this note is for.

## Item 4 — the 11.25px is the PLUGIN's own rule (Picasso 4)

`tests/browser_net_harness.js` credited the block-axis padding to "something in
the host's own cascade". It is the plugin's own
`.hackertube .ht-compact > div { padding-block: .75rem }` (`style.css`), which
matches the CardContent element — a DIRECT child of the compact row's card — and
at the host's 15px root `0.75rem` is exactly 11.25px; the plugin rule
out-specifies `.p-4` and sets only the block axis, so the inline 15px stays the
host's. The comment is corrected in place, and so is the paragraph in
`docs/receipts/post40/README.md` that says the same thing (see "Correction of
record" there).

## Item 5 — the receipts say it plainly (Cracked nit, Picasso 3)

The three statements at the top of this file are the ones the reviewers asked
for. `docs/receipts/post40/README.md` carried two claims that were simply wrong
and are corrected in place there: that the block-axis padding's rule "was not
identified" (it is the plugin's own rule), and that the real-host captures "are
the dark rendering only" (they are light-only — `"dark": false` — and cannot show
the fix at all, because the host's 15px padding never clipped the ring).

## Measured numbers (generated by `summarize.py`)

<!-- summary-table.md -->
| Check | Result |
|---|---|
| Python (pytest -q) | 334 passed / 0 failed |
| Node full suite (`node --test tests/*.js`) | 179 tests, 179 passed / 0 failed |
| FEED12 (10 runs) | 10/10 |
| Ring mutations caught by these tests (red) | 6/6 |
| The same mutations against the BASE tests | 0/2 caught — 2 MISSED (that is the closed gap) |
| Green control after every revert | exit 0, all three tests pass: True |
| 1px gap, the rule this card ships | painted 162/163 (99.4%), 1 partly-painted pixel at 25.1% ring -> the coverage rule fires; min over painted 7.919:1 (contrast passes) |
| 1px gap, the rule it replaces | painted 163/163 (100.0%), 0 partly painted -> coverage passes; min over painted 1.726:1 at a pixel 25.1% ring, i.e. the coverage defect reported as a contrast reading |
| Clean profile, source-down failure path | return with 7 sources accounted, 0 items, outbound {'free': 0, 'paid': 0, 'metered': 0} (down source: hn) |
| Clean profile, installed assets | ring rule `.hackertube :focus,`; wrapper `.hackertube .hackertube {   padding: 0 4px;   margin: 0 -4px;   max-width: none; }` |
| `hermes plugins validate .` | exit 0 (Validation passed.) |
| `hermes plugins doctor . --ci` | exit 0 (OK: runtime discovery) |

The two test definitions per width (24 runs each) cost about 11s more than the
post-#40 set: the two ring tests went from 3.8s + 3.1s to 9.4s + 8.6s, which is
inside the node suite's 179-test total above.

## Mutation matrix (generated by `summarize.py`)

<!-- mutation-table.md -->
See `mutation-table.md`; the raw `node --test` output for every mutation is in
`raw/`, and each mutation is restored from memory and verified by sha256 before
the next one runs, with a green control at the end (exit 0, all three tests
pass). Six mutations are caught, and the two that are run against the base test
file are the ones that are missed there — which is what closes items 1 and 2.

## Plugin checks and the clean-profile failure path

`hermes plugins validate .` and `hermes plugins doctor . --ci` were run from the
plugin folder; both exit 0, complete outputs in `plugin-validate.log` and
`plugin-doctor.log` (0 tools, 0 hooks, standalone, no core override, security scan
safe). Nothing outside this job was flagged.

`run-clean.sh` on a fresh `HERMES_HOME` (the real `hermes plugins enable
hackertube`, the plugin symlinked into it), then `clean_profile_probe.py` with the
Hermes venv python so `plugin_db` is the real one — the source-down failure path:

```json
{"sources": 7, "items": 0, "counts": {"free": 0, "paid": 0, "metered": 0}, "down_source": "hn"}
```

The first source raises `OSError("connection refused")`; the pass still returns,
accounts for all seven sources, yields no items and makes no outbound call. The
probe also re-read the INSTALLED assets: the focus rule still takes its colour
from `var(--color-ring)` and declares no ring colour of its own, and the installed
wrapper carries `padding: 0 4px; margin: 0 -4px`.

## Artifacts

| Artifact | Shows |
|---|---|
| `raw/*.log` | The full `node --test` output for each mutation, this card's tests and the base tests. |
| `mutate_ring.py`, `mutations.json`, `mutations.log`, `mutation-table.md` | The matrix above; restore verified by sha256, green control at the end. |
| `gap_probe.js`, `gap-probe.log` | The 1px-gap measurement under both painted rules, from one pair of screenshots. |
| `pytest.log`, `node-full-suite.log`, `feed12.log`, `feed12-run-*.log` | The three suites; `feed12.log` summarises the ten FEED12 runs, whose raw output is in the per-run logs. |
| `plugin-validate.log`, `plugin-doctor.log` | Both plugin CLI checks, complete outputs, exit 0. |
| `run-clean.sh`, `clean_profile_probe.py`, `clean-profile.log` | The fresh-profile source-down path and the installed assets. |
| `run-suite.sh`, `summarize.py`, `summary.json`, `summary-table.md` | How the numbers were produced — the tables are generated from the logs, never transcribed. |
| `../post40/README.md` | The two corrected claims (item 4 and item 5), corrected in place with a "Correction of record" note. |

## What this receipt does not show

* No texture beyond the browser: the ring is measured from Chromium screenshots
  in the fixture, not from a screen reader, an OS-level high-contrast mode, or a
  forced-colors render.
* The 1px gap is a `clip-path` slit, and the 97%/94% band is a slit too — a
  synthetic way to remove ring pixels. What is new is only that a slit whose
  edges fall off the pixel grid is reported as coverage rather than as a contrast
  number.
* The base-tests column runs the base test FILE against this head's harness and
  stylesheet; it is the test-side gap being measured, not a run of the base
  branch.
* The emulateMedia run measures the fixture's own `@media (prefers-color-scheme:
  dark)` token block. The fixture's block is not the host's stylesheet, so this
  is evidence about the plugin's rules under an OS scheme, not about the host's
  own dark rendering.
