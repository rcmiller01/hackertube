# Post-#43 receipts: the ring sampler in device pixels, and a pixel classified against the ring's own colour

Branch `hermes/post43-followups`, base `main` at
`84af1b843e6a25ccafce651eeb2d6df2ea84bf9c` (the post-#42 merge, PR #43).

Tests, fixtures and documents only: `hackertube/dashboard/dist/style.css` does not
change in this PR, and neither does any other file under `hackertube/`. This is the
follow-up to the non-blocking notes Cracked (comment 6811923364) and Picasso
(comment 6811923335) left on #43.

## The statements, plainly

1. **The ring sampler now works in DEVICE pixels.** A screenshot is captured at
   device resolution, and the sampler was indexing the PNG with CSS-pixel
   coordinates. At `devicePixelRatio` 1.25 that put the sample column a quarter of
   a stroke away from the stroke's centre, on bare surface: the **real** ring read
   `0/301` and `0/163` painted. Every sampled coordinate is now scaled by the
   `devicePixelRatio` the page reports, and ring runs exist above DPR 1 (1.25 and
   2) that pass with the real ring and fail with a 1px gap.
2. **A pixel is classified against the RING'S OWN COLOUR, per pixel:**
   `|focused - unfocused| / |ringColour - unfocused|`. The rule it replaces
   measured each pixel against the side's STRONGEST difference, so a fully painted
   opaque ring (`#18181b`, >= 12:1) over a `#fff` to `#e8e8e8` gradient surface was
   reported as a coverage defect. The measured shape of the finding is reproduced
   in the fixture and pinned by a mutation: **132/194 painted, 62 partly painted**
   on the top stroke, where the shipped rule reads 194/194. On a FLAT surface the
   two classifications agree exactly, which is why every other test and the whole
   mutation matrix is unchanged.
3. **`docs/` and `openspec/` carry no absolute home path, and the check says so.**
   The three files the note named — `docs/demo-readiness-2026-11-08.md`,
   `docs/pr18-review.md` and `openspec/changes/hackertube-v1/verification.md` — are
   written with placeholders (`<home>/`, `<hermes-home>/`), and
   `tests/test_receipt_paths.py` now scans `docs/` and `openspec/`, not only
   `docs/receipts/`. Only paths changed: 14 occurrences on 10 lines, and the check
   is red at the base revision and green here.
4. **The three historical READMEs carry a dated correction note.** `post39`,
   `post40` and `post41` each say, dated 2026-11-11, what #43 changed in them.
   `post41` already had one; this card adds the same to `post39` and `post40` and a
   sentence to `post41` naming its own three edits.
5. **The receipt-path check needed two corrections of its own**, both found while
   running it rather than by reading it — see "Item 3" below. They are part of the
   change, not incidental.

## Item 1 — the sampler works in device pixels (Cracked P3)

`measurePaintedRing` indexes the screenshot's pixels with the link's
`getBoundingClientRect()` values, which are CSS pixels. At DPR 1 CSS pixels and
device pixels coincide, which is why the tests were green at every width and why
the defect survived review. At DPR 1.25 the stroke's centre sits at
`1.25 * (box.left - spread)`, and the CSS value lands on bare surface to its left.

The fix is one scale factor, applied to the sample lines and nothing else:

```js
const at = (value) => value * dpr;
const lines = {
  left: [at(box.left - spread), at(box.top + 12), at(box.left - spread), at(box.bottom - 12)],
  ...
};
```

The ratio is the page's own (`window.devicePixelRatio`, read into `geometry`), and
each run asserts the page reported the DPR it asked for. Sampling at the stroke's
CENTRE means the sampled device pixel is fully inside a 2px stroke at any ratio
(`w = 1.25` device px >= the 0.5px a pixel can need), which is why the full ring
reads 100% at DPR 1.25.

`RING_RUNS` gains two entries (`390px light host-padding dpr 2`, `320px light
host-padding-0 dpr 1.25`) and the coverage control runs its whole gap set at DPR 1
AND at DPR 1.25 (`MEASURED_DPRS`).

Red/green, from the mutation "the sampler uses CSS coordinates as PNG indexes
again" (restores `at = (value) => value`):

```
at 390px light dpr-2 the full card's Watch link: every sampled pixel of the left
ring is painted (0/301 painted, 0.0%) — a side passes only when 100% of its pixels
carry the ring, so an unpainted or partly-painted pixel is a COVERAGE defect, not
a contrast reading
```

`0/301` is the finding's own number. Caught by both ring tests and the coverage
control; the gradient test stays green (it runs at DPR 1).

## Item 2 — a pixel is classified against the ring's own colour (Picasso)

The old classification was `fraction = held / full`, where `full` is the strongest
`held` on that side and `held = max|surface - ring|` at the pixel. That is exactly
equivalent to the shipped rule **while the surface is flat** — and wrong the moment
it is not: on a `#fff` to `#e8e8e8` surface a pixel over the lighter end holds less
paint than the side's strongest pixel does, so a fully painted ring is reported as
partly painted. The shipped rule normalises per pixel:

```js
const denom = ringColour ? Math.max(|ringColour[c] - surface[c]|) : 0;
const fraction = denom > 0 ? Math.min(1, held / denom) : 0;
```

`ringColour` is the pixel carrying the most paint on that side — the ring's own
colour, whatever alpha or colour syntax the rule used. Both terms use the SAME
surface pixel, so the surface cancels: `fraction` is 1 wherever the ring is fully
painted, 0 where the surface is untouched, and the alpha in between.

**The fixture.** `startFixture(..., {gradientSurface: true})` appends
`GRADIENT_SURFACE_CSS` to the fixture's host block, painting the card content the
compact Watch link's ring is drawn over with `linear-gradient(90deg, #ffffff,
#e8e8e8)`. Two measurements decided that, and both are in `gap-probe.json`:

* the ring's surface at this width is the **card content** (measured: the left
  stroke sits in the card's 15px inline padding, left of `.ht-compact-side`, over
  the plain card background) — so painting the media column would have changed
  nothing;
* the ramp must run **across** the box, not down it. The compact row's parts stack
  in DOM order below 768px (head, media, rest), so the link sits several hundred
  pixels below the content box's top edge: a full-box VERTICAL ramp varied only
  `rgb(247,247,247) -> rgb(240,240,240)` across the stroke — a strongest-difference
  fraction of 0.973, ABOVE the 0.95 band, so it does **not** reproduce the finding.
  Measured, not assumed; the first fixture this card wrote was that vertical ramp
  and the mutation below stayed green on it. Across the box the top and bottom
  strokes see `rgb(253,253,253) -> rgb(236,236,236)` and the finding appears.

The test asserts the fixture really is the finding's case, from its own pixels: on
its worst side the strongest-difference fraction is below 0.95. The measurement it
derives that from is printed in the failure message.

| run (left stroke unless named) | DPR | this card | strongest-difference | fixed delta (> 20) |
|---|---|---|---|---|
| gradient, full ring, **top** stroke | 1 | 194/194 painted, 0 partly -> **PASSES** | 132/194 painted, **62 partly** | 194/194 |
| gradient, full ring, **bottom** stroke | 1 | 194/194 painted, 0 partly -> **PASSES** | 133/194 painted, **61 partly** | 194/194 |
| gradient, full ring | 1 | 163/163 -> PASSES | 163/163 | 163/163 |
| gradient, 1px slit | 1 | 162/163 -> FAILS as coverage | 162/163 | 162/163 |
| gradient, full ring, top stroke | 1.25 | 243/243 -> PASSES | 166/243, 77 partly | 243/243 |

The left stroke is uniform on this surface (it is a vertical stroke on a
horizontal gradient), which is why the finding appears on the horizontal ones; the
fixture's controls — full ring passes, 1px slit fails as coverage — are the same
pair as everywhere else, so the fix cannot have made the rule blind to a real gap.

Red/green, from "a pixel is classified against the side's strongest difference
again" (restores `held / full`):

```
the full ring over the gradient paints every pixel of its top side
(133/194 painted; 61 partly painted {"0.95":12,"0.94":24,"0.93":25})
```

and from "the gradient-surface option is inert" (the harness stops appending the
gradient block), which fails on the fixture's own gradient assertion: every stroke
reads `rgb(255,255,255) -> rgb(255,255,255)`.

## Item 3 — the paths, the widened check, and two corrections it forced

14 occurrences of an absolute home path on 10 lines were rewritten to
placeholders in the three named files (plus the one in
`docs/receipts/post40/README.md`'s clean-profile JSON, which #43 had already
carried):

```
$ rg -n "Users/|home/" docs openspec        # nothing: neither prefix occurs
```

(The two prefixes are written above WITHOUT their leading slash. A file under
`docs/` cannot quote the spelling the check looks for without matching itself —
which is the same trap the failure message above fell into.)

`tests/test_receipt_paths.py` keeps its `docs/receipts/` scan and adds
`test_no_doc_or_spec_carries_an_absolute_home_path`, which walks `docs/` and
`openspec/` with a per-tree file floor so a mis-rooted scan cannot pass. Red at the
base revision and green here — same test file, a detached worktree at the base SHA
(`docs/receipts/post43/path-check-base.log`):

```
E  AssertionError: 3 file(s) under docs/ or openspec/ carry an absolute home path
   (docs/demo-readiness-2026-11-08.md {'Users-prefix': 2} ;
    docs/pr18-review.md {'Users-prefix': 1} ;
    openspec/changes/hackertube-v1/verification.md {'Users-prefix': 11})
1 failed, 2 passed
```

Two corrections the run forced, both of which the previous card's version of this
idea had already paid for in a different form:

* **A check whose failure message carries the bytes it looks for can never
  clear.** The offender list was built from ABSOLUTE paths, so the moment the check
  failed, pytest wrote a home path into `docs/receipts/post43/path-check.log` —
  a file under the scanned tree. Offenders are now reported as repo-relative paths
  (`_offenders`), and the matched prefixes are still named, never quoted.
* **The check must run LAST, after the rewrite, or it certifies a tree it is
  standing in.** `run-suite.sh` used to run it straight after pytest, whose own
  warning summary names the venv's site-packages file; the check then reported the
  log it had just caused. `redact_paths.py` is now the last step but one, and the
  check is the true last step, so its green run is the proof.

`redact_paths.py` also walks the whole of `docs/` and `openspec/` now (it was
`docs/receipts/` only) and drops `__pycache__` under those roots. That last part is
not tidiness: `b"/" + b"Users" + b"/robert"` is **constant-folded by the compiler**
into the very token this script rewrites, so importing the script from inside the
tree left a `.pyc` carrying it. The prefixes are assembled from pieces at runtime
now, `mutate_ring.py` sets `sys.dont_write_bytecode`, and any stray bytecode is
removed by the same script that keeps the paths clean.

## Item 4 — the dated correction notes

Each of the three historical READMEs now says, dated **2026-11-11**, what #43
changed in it:

* `docs/receipts/post39/README.md` — statement 2's parenthetical (the shipped
  100% rule beside this receipt's own 95%);
* `docs/receipts/post40/README.md` — the statement-3 parenthetical, the section-3
  heading, both coverage bullets, and the clean-profile JSON's path;
* `docs/receipts/post41/README.md` — the existing `Correction of record (post-#42,
  2026-11-11)` section, plus a sentence naming its own three edits (statement 1,
  the Item-3 paragraph, and the note itself).

No number, verdict or verbatim message in any of them moves, and the notes say so.

## Measured numbers (generated by `summarize.py`)

<!-- summary-table.md -->
| Check | Result |
|---|---|
| Python (pytest -q) | 337 passed / 0 failed |
| Node full suite (`node --test tests/*.js`) | 180 tests, 180 passed / 0 failed |
| FEED12 (10 runs) | 10/10 |
| `tests/test_receipt_paths.py` (the widened scan) | 3 passed / 0 failed |
| An absolute home path under `docs/openspec` (`Users`/`home` prefix) | 0 matches over 1261 files |
| Ring mutations caught by these tests (red) | 16/16 |
| Green control after every revert | exit 0, all four tests pass: True |
| gradient surface, full ring, the varying top stroke | this card: 194/194 painted, 0 partly -> PASSES; strongest-difference: 132/194 painted, 62 partly -> the finding reproduced |
| gradient surface, full ring, the varying bottom stroke | this card: 194/194 painted, 0 partly -> PASSES; strongest-difference: 133/194 painted, 61 partly -> the finding reproduced |
| gradient surface, full ring at DPR 1.25, the varying top stroke | this card: 243/243 painted, 0 partly -> PASSES; strongest-difference: 166/243 painted, 77 partly -> the finding reproduced |
| gradient surface, full ring at DPR 1.25, the varying bottom stroke | this card: 243/243 painted, 0 partly -> PASSES; strongest-difference: 167/243 painted, 76 partly -> the finding reproduced |
| Clean profile, source-down failure path | return with 7 sources accounted, 0 items, outbound {'free': 0, 'paid': 0, 'metered': 0} (down source: hn) |
| `hermes plugins validate .` | exit 0 (Validation passed.) |
| `hermes plugins doctor . --ci` | exit 0 (OK: runtime discovery) |

Python is 337 (336 at the previous head, plus the one added receipt-path test);
node is 180 (179, plus the gradient test). The node figure is from
`node --test tests/*.js`, which also runs `browser_net_harness.js`, so it is one
higher than a `tests/test_*.js` run by construction. The gap rows are the probe's
own numbers, and the green control is a full run of the four ring tests with every
mutation restored.

Every gap the coverage control raises, measured on identical pixels under all
three classifications (`gap-probe.json`, table in `gap-table.md`); the last column
is the rule before post-#42, printed so the defect it mislabeled is visible:

<!-- gap-table.md -->
| run | DPR | ring-relative (this card) | strongest-difference | fixed delta (> 20) |
|---|---|---|---|---|
| flat surface, full ring | 1 | 163/163 painted, 0 partly -> PASSES | 163/163 painted, 0 partly | 163/163 painted |
| flat surface, 1px slit, integer offset | 1 | 162/163 painted, 0 partly -> FAILS as coverage | 162/163 painted, 0 partly | 162/163 painted |
| flat surface, 1px slit, .25px offset | 1 | 161/163 painted, 2 partly -> FAILS as coverage | 161/163 painted, 2 partly | 163/163 painted |
| flat surface, 1px slit, .5px offset | 1 | 161/163 painted, 2 partly -> FAILS as coverage | 161/163 painted, 2 partly | 163/163 painted |
| flat surface, 1px slit, .75px offset | 1 | 161/163 painted, 2 partly -> FAILS as coverage | 161/163 painted, 2 partly | 163/163 painted |
| flat surface, 2px slit | 1 | 161/163 painted, 0 partly -> FAILS as coverage | 161/163 painted, 0 partly | 161/163 painted |
| flat surface, 5px slit (the old 97% control) | 1 | 158/163 painted, 0 partly -> FAILS as coverage | 158/163 painted, 0 partly | 158/163 painted |
| flat surface, 3% notch | 1 | 158/163 painted, 0 partly -> FAILS as coverage | 158/163 painted, 0 partly | 158/163 painted |
| flat surface, full ring at DPR 1.25 | 1.25 | 203/203 painted, 0 partly -> PASSES | 203/203 painted, 0 partly | 203/203 painted |
| flat surface, 1px slit at DPR 1.25, integer offset | 1.25 | 201/203 painted, 1 partly -> FAILS as coverage | 201/203 painted, 1 partly | 202/203 painted |
| flat surface, 1px slit at DPR 1.25, .5px offset | 1.25 | 201/203 painted, 2 partly -> FAILS as coverage | 201/203 painted, 2 partly | 203/203 painted |
| flat surface, 3% notch at DPR 1.25 | 1.25 | 196/203 painted, 2 partly -> FAILS as coverage | 196/203 painted, 2 partly | 198/203 painted |
| gradient surface, full ring | 1 | 163/163 painted, 0 partly -> PASSES | 163/163 painted, 0 partly | 163/163 painted |
| gradient surface, 1px slit | 1 | 162/163 painted, 0 partly -> FAILS as coverage | 162/163 painted, 0 partly | 162/163 painted |
| gradient surface, full ring at DPR 1.25 | 1.25 | 203/203 painted, 0 partly -> PASSES | 203/203 painted, 0 partly | 203/203 painted |

Note the `.5px` row under the fixed-delta column: 163/163 painted. That is the
acknowledgement that a 1px gap at a half-pixel offset was invisible to the rule
before post-#42, and why the partly-painted branch exists at all.

## Mutation matrix (generated by `summarize.py`)

<!-- mutation-table.md -->
| Mutation | Files | Wanted | Caught | Full card | Compact row | Coverage control | Gradient | First assertion |
|---|---|---|---|---|---|---|---|---|
| compact-side clips its own overflow | `hackertube/dashboard/dist/style.css` | the compact row's measurements — the compact ring test and the coverage control (both measure the compact row) | yes | green | red | red | red | at 320px light the compact row's Watch link: no ancestor clips the left ring (cut by ht-compact-side; 0/163 of the side is painted) |
| youtube-compact wrapper clips | `hackertube/dashboard/dist/style.css` | the compact row's measurements — the compact ring test and the coverage control (both measure the compact row) | yes | green | red | red | red | at 320px light the compact row's Watch link: no ancestor clips the left ring (cut by ht-youtube-compact; 0/163 of the side is painted) |
| ring colour dim but fully painted (rgba .25) | `hackertube/dashboard/dist/style.css` | every measurement of a painted ring — all four tests (contrast, not coverage) | yes | red | red | red | red | at 320px light the full card's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 1.71:1, ring rgb(189,189,190) on surface rgb(244,244,245) at 43,768; min over every sampled pixel 1.71:1) |
| compact Watch link at opacity .3 (with or without focus) | `hackertube/dashboard/dist/style.css` | the compact row's measurements — the compact ring test and the coverage control | yes | green | red | red | red | at 320px light the compact row's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 1.98:1, ring rgb(184,184,185) on surface rgb(255,255,255) at 36,719; min over every sampled pixel 1.98:1) |
| ring colour color(srgb .6 .6 .6) | `hackertube/dashboard/dist/style.css` | every measurement of a painted ring — all four tests | yes | red | red | red | red | at 320px light the full card's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 2.59:1, ring rgb(153,153,153) on surface rgb(244,244,245) at 43,768; min over every sampled pixel 2.59:1) |
| ring colour = the surface it paints on | `tests/browser_net_harness.js` | every measurement of a painted ring — a coverage or contrast defect on all four tests | yes | red | red | red | red | at 320px light the full card's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 1.10:1, ring rgb(255,255,255) on surface rgb(244,244,245) at 43,768; min over every sampled pixel 1.10:1) |
| dark-only dim ring (.dark token block) | `tests/browser_net_harness.js` | the dark runs only (the coverage and gradient controls are light-only) | yes | red | red | green | green | at 320px dark the full card's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 1.02:1, ring rgb(11,46,46) on surface rgb(7,48,48) at 43,768; min over every sampled pixel 1.02:1) |
| the dark tokens exist only for the media query, not for an ancestor class | `tests/browser_net_harness.js` | the `.dark`-ancestor runs only (no ancestor match, so the light token stays; the coverage and gradient controls are light-only) | yes | red | red | green | green | at 320px dark the full card's Watch link: every painted pixel of the top ring reaches >= 3:1 (min over painted pixels 1.00:1, ring rgb(24,24,27) on surface rgb(4,28,28) at 58,753; min over every sampled pixel 1.00:1) |
| the #41 wrapper rule reverted (both copies) | `hackertube/dashboard/dist/style.css` | the padding-0 runs only — the host's own 15px padding holds the ring clear of the plugin's clip whatever the wrapper declares | yes | green | red | red | green | at 320px light host-padding-0 the compact row's Watch link: no ancestor clips the left ring (cut by hackertube; 0/163 of the side is painted) |
| a plugin rule under @media (prefers-color-scheme: dark) kills the ring | `hackertube/dashboard/dist/style.css` | the os-dark runs only (the coverage and gradient controls are light-only) | yes | red | red | green | green | at 320px os-dark the full card's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 1.07:1, ring rgb(11,42,43) on surface rgb(7,48,48) at 43,768; min over every sampled pixel 1.07:1) |
| the coverage rule is a 95% painted fraction again | `tests/test_privacy_browser.js` | the coverage control only | yes | green | green | red | green | Missing expected exception: the old 97% control now fails the 100% coverage rule |
| the painted band is 50% again | `tests/test_privacy_browser.js` | the coverage control only (the .5px gap offset) | yes | green | green | red | green | the 1px-gap ring control at a 0.5px offset at DPR 1: the PAINTED fraction alone clears the old 95% threshold on the left (203/203 = 100.0%), so only the 100% rule can catch it |
| the ring's painted test is a fixed channel delta again | `tests/test_privacy_browser.js` | the coverage control only | yes | green | green | red | green | the 1px-gap ring control at a 0.25px offset at DPR 1: the PAINTED fraction alone clears the old 95% threshold on the left (163/163 = 100.0%), so only the 100% rule can catch it |
| the sampler uses CSS coordinates as PNG indexes again | `tests/test_privacy_browser.js` | the DPR runs only — the two RING_RUNS entries above DPR 1, the DPR 1.25 half of the coverage control, and the DPR-1 runs stay green | yes | red | red | red | green | at 390px light dpr-2 the full card's Watch link: every sampled pixel of the left ring is painted (0/301 painted, 0.0%) — a side passes only when 100% of its pixels carry the ring, so an unpainted or partly-painted pixel is a COVERAGE defect, not a contrast reading |
| a pixel is classified against the side's strongest difference again | `tests/test_privacy_browser.js` | the gradient test only — on a flat surface the two classifications give the same fractions | yes | green | green | green | red | the full ring over the gradient paints every pixel of its top side (133/194 painted; 61 partly painted {"0.95":12,"0.94":24,"0.93":25}) |
| the gradient-surface option is inert | `tests/browser_net_harness.js` | the gradient test only — the ring paints over a flat surface and no stroke varies | yes | green | green | green | red | the fixture paints a GRADIENT under the ring: at least one stroke's first and last sampled surfaces must differ (they are left rgb(255,255,255)->rgb(255,255,255), right rgb(255,255,255)->rgb(255,255,255), top rgb(255,255,255)->rgb(255,255,255), bottom rgb(255,255,255)->rgb(255,255,255)) |

The raw `node --test` output for every mutation is in `raw/` (its stack traces name
the checkout, so `redact_paths.py` is the harness's last step there too), and each
mutation is restored from memory and verified by sha256 before the next one runs,
with a green control at the end (exit 0, all four tests pass). The two mutations
that are NOT re-run, and why, are named in `mutate_ring.py`'s docstring.

One honest note on the DPR mutation's row: the gradient test stays GREEN under it,
because the gradient test runs only at DPR 1 — its own controls are about the
classification, not the ratio. The `Wanted` column says exactly that.

## Plugin checks and the clean-profile failure path

`hermes plugins validate .` and `hermes plugins doctor . --ci` were run from the
plugin folder; both exit 0, complete outputs in `plugin-validate.log` and
`plugin-doctor.log`. Nothing outside this job was flagged: the only lines validate
prints are its isolation notices (`runs in the plugin host (plugins.isolation:
host)`, `ctx.register_cli_command() is skipped in the host`), and doctor reports
`registrations: 0 tool(s), 0 hook(s)` for a standalone plugin. This card imports
nothing from the host beyond the stable `ctx` surface its tests already used, and
no host path is recorded in the receipts.

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
wrapper still carries `padding: 0 4px; margin: 0 -4px`.

## Artifacts

| Artifact | Shows |
|---|---|
| `pytest.log`, `node-full-suite.log`, `feed12.log`, `feed12-run-*.log` | The three suites; `feed12.log` summarises the ten FEED12 runs, whose raw output is in the per-run logs. |
| `mutate_ring.py`, `mutations.json`, `mutations.log`, `mutation-table.md`, `raw/*.log` | The 16-mutation matrix; every mutation restored from memory and verified by sha256 before the next runs, with a green control at the end. |
| `gap_probe.js`, `gap-probe.log`, `gap-probe.json`, `gap-table.md` | Every gap at DPR 1 and 1.25 and on both surfaces, under three classifications on identical pixels. |
| `path-check.log`, `path-check-base.log` | The widened path check green here, and the same test file red at the base revision in a detached worktree. |
| `plugin-validate.log`, `plugin-doctor.log` | Both plugin CLI checks, complete outputs, exit 0. |
| `run-clean.sh`, `clean_profile_probe.py`, `clean-profile.log` | The fresh-profile source-down path and the installed assets. |
| `run-suite.sh`, `summarize.py`, `summary.json`, `summary-table.md` | How the numbers were produced — every table is generated from the logs, never transcribed. |
| `redact_paths.py` | The placeholder rewrite (now over `docs/` and `openspec/`) and the bytecode drop, run by `run-suite.sh` before the path check. |
| `../post39/README.md`, `../post40/README.md`, `../post41/README.md` | The dated 2026-11-11 correction notes. |
| `tests/test_receipt_paths.py` | The receipt-path check, with its own positive control and the widened doc/spec scan. |

## What this receipt does not show

* No texture beyond the browser: the ring is measured from Chromium screenshots
  in the fixture, not from a screen reader, an OS-level high-contrast mode, or a
  forced-colors render.
* The gaps, the 3% notch and the gradient are still fixture constructions: a
  `clip-path` slit removes ring pixels, and `GRADIENT_SURFACE_CSS` paints a
  gradient the dashboard itself does not draw. What is new is the rule the
  measurement is held to, and the fixture is asserted to be the finding's own case.
* DPR 1.25 and 2 are the two ratios pinned; a fractional ratio with a non-integer
  stroke width is not swept.
* The gradient surface varies across the card content, so the finding appears on
  the horizontal strokes; a vertical gradient against a vertical stroke is
  measured in `gap-probe.json` only as far as the ramp-length experiment (the
  0.973 case in "Item 2").
* The clean-profile probe is the backend failure path; the browser half is not
  re-run there, and the probe does not exercise `hermes plugins install`.
* `docs/` and `openspec/` outside the three named files were already clean; this
  card did not audit the rest of the repository (for example `README.md` or
  `scripts/`) for home paths.
