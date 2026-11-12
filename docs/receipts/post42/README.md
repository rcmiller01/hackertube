# Post-#42 receipts: the ring must be painted on every pixel

Branch `hermes/post42-followups`, base `main` at
`3376a7a6c647531e7a2d3e249b247832c34d2a52` (the post-#41 merge, PR #42).

Tests, fixture comments and receipts only: `hackertube/dashboard/dist/style.css`
does not change in this PR, and neither does any other file under `hackertube/`.
This is the follow-up to the non-blocking notes Picasso (comment 6809453929) and
Cracked (comment 6809347322) left on #42.

## The statements, plainly

1. **Coverage is 100%, and that is the owner's decision of record.** Robert,
   2026-11-11, answering on the card: *"Queue the #42 leftovers as one card now,
   require 100% painted"*. A side passes only when EVERY sampled pixel of it is
   painted; any unpainted or partly-painted pixel fails as a **COVERAGE** defect
   with the count ("162/163 painted"). The 95% allowance is gone, so the old
   97% control ring is now a FAILING coverage case and the full ring (163/163) is
   the passing control. The contrast rule for fully painted rings is unchanged.
2. **Why the allowance had to go: it only worked for a gap aligned to the pixel
   grid.** That is Picasso's finding, and the probe measures it: a 1px slit at a
   .25px offset leaves two boundary pixels at 25.1% and 75.3%, reads 161/163
   painted (98.8%) — over the old fraction — and was caught only by the
   partly-painted half of the rule. The fraction was never the rule doing the
   work.
3. **The painted band moved with the rule, and that is a deliberate departure
   from the card's item-2 wording.** "At least 50% of the side's strongest paint"
   cannot deliver 100% coverage: a 1px slit offset half a pixel leaves BOTH of its
   boundary pixels at 50.2%, so under a 50% band both count as painted and the
   side reads 163/163 — a half-pixel gap passing a 100% rule (measured, and pinned
   by the "the painted band is 50% again" mutation). The band is therefore **at
   least 95%**, and the residue is the same 5% band the rule already used for
   "cleanly unpainted".
4. **The receipts carry no absolute home path, and a check enforces it.**
   `docs/receipts/**` writes the checkout as `<repo>/`, the Hermes install and its
   data root as `<hermes-home>/` and anything else under a home directory as
   `<home>/`. `tests/test_receipt_paths.py` fails if the slash-terminated `Users`
   or `home` prefix appears in any file under `docs/receipts/`, and proves its own
   scanner against a planted sample first, so a scan that finds nothing cannot
   pass because it is looking in the wrong place.
5. **Receipt wording that stated 95% now points at 100%.** See "Item 4" below:
   the three earlier receipts that stated the threshold are corrected in place,
   and their verbatim failure messages are left exactly as their revision
   produced them.

## Item 1 — the ring check requires 100% of each side painted

`assertPaintedRing`'s coverage rule was `painted / total >= 0.95`. It is now
`painted === total`, with one message carrying both readings:

```
every sampled pixel of the left ring is painted (162/163 painted, 99.4%) —
a side passes only when 100% of its pixels carry the ring, so an unpainted
or partly-painted pixel is a COVERAGE defect, not a contrast reading
```

The controls in the coverage test were re-derived from the measurement
(`gap-probe.log`, `gap_probe.js`), one pair of screenshots per case, the ring's
pixels removed by a `clip-path` slit through the middle of the focused compact
Watch link:

| slit | painted | this card (>= 95% band) | the previous 50% band |
|---|---|---|---|
| none (the full ring) | 163/163 (100.0%) | **PASSES** — the passing control | PASSES |
| 1px, integer offset | 162/163 (99.4%) | FAILS coverage | FAILS coverage |
| 1px, .25px offset | 161/163 (98.8%) | FAILS coverage | FAILS coverage |
| 1px, .5px offset | 161/163 (98.8%) | FAILS coverage | **PASSES** — the measured reason for the 95% band |
| 1px, .75px offset | 161/163 (98.8%) | FAILS coverage | FAILS coverage |
| 5px (the old 97% control) | 158/163 (96.9%) | FAILS coverage | FAILS coverage |
| 12px (the 94% case) | 151/163 (92.6%) | FAILS coverage | FAILS coverage |

Every row is a `clip-path` slit, i.e. a synthetic way to lose ring pixels that
avoids a clipping ANCESTOR (an ancestor clip is caught first, from geometry, by
the cut check). The four 1px rows are the case the card names: all four clear the
old 95% fraction on their own (161–162 of 163), so what speaks is the 100% rule —
and their painted pixels still clear 3:1, so nothing here is a contrast reading.

## Item 2 — the header comment says what the code does

Picasso's nit was that the comment above `assertPaintedRing` did not match the
code. It now states the vocabulary and the rule in the code's own terms: painted
is **at least 95% of the side's strongest paint** (see statement 3 for why the
band is 95% and not the 50% the note proposed), clean is at most 5%, partly
painted is anything between, and every pixel on every side must be painted. The
`measurePaintedRing` docstring carries the same three states, and the comment on
`RING_RUNS` no longer says "at least 95% of each side painted".

## Item 3 — receipt paths are placeholders, and the check that keeps them so

228 files under `docs/receipts/` carried an absolute home path (456 lines), now
written as `<repo>/`, `<hermes-home>/` or `<home>/`. Only paths changed: the
rewrite is byte-level, and every changed line contains a path token — no other
evidence in those logs, JSON records or READMEs moved. Two consequences are
stated rather than hidden:

* the probe and capture scripts kept as receipts (for example
  `post41/clean_profile_probe.py`, `post32/capture.js`) now carry placeholders, so
  they are records of how a run was made rather than runnable as-is. The scripts
  this card ships resolve their roots from the environment instead:
  `post42/clean_profile_probe.py` takes `HERMES_HOME` and
  `HERMES_AGENT_HOME` (defaulting to `Path.home()`, which contains no home path
  literal), and the harnesses under `post42/` use `$HOME` or `path.join`.
* `plugin-doctor.log`, the one log this card produced that carries the path it was
  run from, is redacted the same way.

The check is `tests/test_receipt_paths.py`:

```
$ /path/to/venv/bin/python -m pytest tests/test_receipt_paths.py -q
2 passed
$ rg -n "Users/|home/" docs/receipts    # nothing: neither prefix occurs in any receipt
```

The card states the same grep with a leading slash on each prefix; a file here
cannot quote that spelling without matching itself, so the prefixes are written
above without it.

The rewrite itself is `redact_paths.py`, and `run-suite.sh` runs it as its last
step: pytest writes its own log at the END of the run (its warning summary names
the venv's `site-packages` file), so a check that scans the tree during that run
cannot see the log it is standing in. The script rewrites it a second later, and
the check is what proves the rewrite landed — the first draft of
`summary-table.md` in this receipt recorded exactly that: `1 matches over 1171
files — post42/pytest.log`, before the script ran over it.

**The check also had to stop reporting the bytes it looks for.** Its failure
message and this summary are themselves files under `docs/receipts/`, so echoing
the matched prefix into them put the receipts back into the state the check
exists to detect — the check tripped over its own output (2 offenders:
`summary.json` and `summary-table.md`), and the failing pytest log carried the
token too, which would keep it failing forever. Both now name the prefix
("Users-prefix" / "home-prefix") instead of quoting it. The same trap in the other
direction is why this README writes the two prefixes without their leading slash.

## Item 4 — the receipt wording that said 95%

Three receipts state the threshold as a rule rather than as a quotation, and all
three now point at the shipped rule:

* `docs/receipts/post41/README.md` — statement 1 and the "Item 3" paragraph now
  say the threshold there was 95% and that the shipped rule is 100% coverage,
  with a **Correction of record (post-#42)** section;
* `docs/receipts/post40/README.md` — the section heading, the "coverage" bullet
  and the closing bullet carry the same correction;
* `docs/receipts/post39/README.md` — the "No side is exempt" bullet does too.

What is NOT rewritten: the failure messages those receipts quote, in
`mutation-table.md`, `mutations.json`, `mutations.log` and the README tables.
They are verbatim output of the revision each receipt records (the message those
revisions emitted was literally "at least 95% of the left ring is painted"), and
rewriting them would make the record disagree with the artefacts it exists to
show. They are labelled as that revision's output instead.

## Measured numbers (generated by `summarize.py`)

<!-- summary-table.md -->
| Check | Result |
|---|---|
| Python (pytest -q) | 336 passed / 0 failed |
| Node full suite (`node --test tests/*.js`) | 179 tests, 179 passed / 0 failed |
| FEED12 (10 runs) | 10/10 |
| An absolute home path under `docs/receipts/` (`Users`/`home` prefix) | 0 matches over 1172 files |
| no slit (the full ring) | this card: 163/163 (100.0%) painted, 0 partly painted -> PASSES; the 50% band: 163/163 (100.0%) -> PASSES |
| 1px slit, integer offset | this card: 162/163 (99.4%) painted, 0 partly painted -> FAILS as coverage; the 50% band: 162/163 (99.4%) -> FAILS as coverage |
| 1px slit, .25px offset | this card: 161/163 (98.8%) painted, 2 partly painted -> FAILS as coverage; the 50% band: 162/163 (99.4%) -> FAILS as coverage |
| 1px slit, .5px offset | this card: 161/163 (98.8%) painted, 2 partly painted -> FAILS as coverage; the 50% band: 163/163 (100.0%) -> PASSES |
| 1px slit, .75px offset | this card: 161/163 (98.8%) painted, 2 partly painted -> FAILS as coverage; the 50% band: 162/163 (99.4%) -> FAILS as coverage |
| 5px slit (the old 97% control) | this card: 158/163 (96.9%) painted, 0 partly painted -> FAILS as coverage; the 50% band: 158/163 (96.9%) -> FAILS as coverage |
| 12px slit (94%) | this card: 151/163 (92.6%) painted, 0 partly painted -> FAILS as coverage; the 50% band: 151/163 (92.6%) -> FAILS as coverage |
| Ring mutations caught by these tests (red) | 13/13 |
| Green control after every revert | exit 0, all three tests pass: True |
| Clean profile, source-down failure path | return with 7 sources accounted, 0 items, outbound {'free': 0, 'paid': 0, 'metered': 0} (down source: hn) |
| `hermes plugins validate .` | exit 0 (Validation passed.) |
| `hermes plugins doctor . --ci` | exit 0 (OK: runtime discovery) |

The three suite totals and the mutation count are as recorded above. The
coverage rows are the probe's own numbers, and the green control is a full run
of the three ring tests with every mutation restored.

## Mutation matrix (generated by `summarize.py`)

<!-- mutation-table.md -->
| Mutation | Files | Wanted | Caught | Full card | Compact row | Coverage control | First assertion |
|---|---|---|---|---|---|---|---|
| compact-side clips its own overflow | `hackertube/dashboard/dist/style.css` | the compact row's measurements — the compact ring test and the coverage control (both measure the compact row) | yes | green | red | red | at 320px light the compact row's Watch link: no ancestor clips the left ring (cut by ht-compact-side; 0/163 of the side is painted) |
| youtube-compact wrapper clips | `hackertube/dashboard/dist/style.css` | the compact row's measurements — the compact ring test and the coverage control (both measure the compact row) | yes | green | red | red | at 320px light the compact row's Watch link: no ancestor clips the left ring (cut by ht-youtube-compact; 0/163 of the side is painted) |
| ring colour dim but fully painted (rgba .25) | `hackertube/dashboard/dist/style.css` | every measurement of a painted ring — both ring tests and the coverage control (contrast, not coverage) | yes | red | red | red | at 320px light the full card's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 1.71:1, ring rgb(189,189,190) on surface rgb(244,244,245) at 43,768; min over every sampled pixel 1.71:1) |
| compact Watch link at opacity .3 (with or without focus) | `hackertube/dashboard/dist/style.css` | the compact row's measurements — the compact ring test and the coverage control | yes | green | red | red | at 320px light the compact row's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 1.98:1, ring rgb(184,184,185) on surface rgb(255,255,255) at 36,719; min over every sampled pixel 1.98:1) |
| ring colour color(srgb .6 .6 .6) | `hackertube/dashboard/dist/style.css` | every measurement of a painted ring — both ring tests and the coverage control | yes | red | red | red | at 320px light the full card's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 2.59:1, ring rgb(153,153,153) on surface rgb(244,244,245) at 43,768; min over every sampled pixel 2.59:1) |
| ring colour = the surface it paints on | `tests/browser_net_harness.js` | every measurement, as a coverage defect (0/163 painted) | yes | red | red | red | at 320px light the full card's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 1.10:1, ring rgb(255,255,255) on surface rgb(244,244,245) at 43,768; min over every sampled pixel 1.10:1) |
| dark-only dim ring (.dark token block) | `tests/browser_net_harness.js` | the dark runs only (the coverage control is light-only) | yes | red | red | green | at 320px dark the full card's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 1.02:1, ring rgb(11,46,46) on surface rgb(7,48,48) at 43,768; min over every sampled pixel 1.02:1) |
| the dark tokens exist only for the media query, not for an ancestor class | `tests/browser_net_harness.js` | the `.dark`-ancestor runs only (no ancestor match, so the light token stays; the coverage control is light-only) | yes | red | red | green | at 320px dark the full card's Watch link: every painted pixel of the top ring reaches >= 3:1 (min over painted pixels 1.00:1, ring rgb(24,24,27) on surface rgb(4,28,28) at 58,753; min over every sampled pixel 1.00:1) |
| the #41 wrapper rule reverted (both copies) | `hackertube/dashboard/dist/style.css` | the padding-0 runs only — the host's own 15px padding holds the ring clear of the plugin's clip whatever the wrapper declares | yes | green | red | green | at 320px light host-padding-0 the compact row's Watch link: no ancestor clips the left ring (cut by hackertube; 0/163 of the side is painted) |
| a plugin rule under @media (prefers-color-scheme: dark) kills the ring | `hackertube/dashboard/dist/style.css` | the os-dark runs only (the coverage control is light-only) | yes | red | red | green | at 320px os-dark the full card's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 1.07:1, ring rgb(11,42,43) on surface rgb(7,48,48) at 43,768; min over every sampled pixel 1.07:1) |
| the coverage rule is a 95% painted fraction again | `tests/test_privacy_browser.js` | the coverage control only | yes | green | green | red | Missing expected exception: the old 97% control now fails the 100% coverage rule |
| the painted band is 50% again | `tests/test_privacy_browser.js` | the coverage control only (the .5px gap offset) | yes | green | green | red | the 1px-gap ring control at a 0.5px offset: the PAINTED fraction alone clears the old 95% threshold on the left (163/163 = 100.0%), so only the 100% rule can catch it |
| the ring's painted test is a fixed channel delta again | `tests/test_privacy_browser.js` | the coverage control only | yes | green | green | red | the 1px-gap ring control at a 0.25px offset: the PAINTED fraction alone clears the old 95% threshold on the left (163/163 = 100.0%), so only the 100% rule can catch it |

The raw `node --test` output for every mutation is in `raw/` (its stack traces name
the checkout, so `redact_paths.py` is the harness's last step there too), and each
mutation is restored from memory and verified by sha256 before the next one runs,
with a green control at the end (exit 0, all three tests pass).
## Plugin checks and the clean-profile failure path

`hermes plugins validate .` and `hermes plugins doctor . --ci` were run from the
plugin folder; both exit 0, complete outputs in `plugin-validate.log` and
`plugin-doctor.log`. Nothing outside this job was flagged: the only notes are the
isolation notices validate prints on every run (`runs in the plugin host
(plugins.isolation: host)`, `ctx.register_cli_command() is skipped in the host`),
and doctor's `registrations: 0 tool(s), 0 hook(s)` for a standalone plugin. This
card imports nothing from the host beyond the stable `ctx` surface its tests
already used, and no host path is recorded in the receipts.

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
| `mutate_ring.py`, `mutations.json`, `mutations.log`, `mutation-table.md`, `raw/*.log` | The mutation matrix; every mutation restored from memory and verified by sha256 before the next runs, with a green control at the end. |
| `gap_probe.js`, `gap-probe.log` | The slit measurement, under both the 95% band this card ships and the 50% band it replaced. |
| `plugin-validate.log`, `plugin-doctor.log` | Both plugin CLI checks, complete outputs, exit 0. |
| `run-clean.sh`, `clean_profile_probe.py`, `clean-profile.log` | The fresh-profile source-down path and the installed assets. |
| `run-suite.sh`, `summarize.py`, `summary.json`, `summary-table.md` | How the numbers were produced — both tables are generated from the logs, never transcribed. |
| `redact_paths.py` | The placeholder rewrite, run by `run-suite.sh` after the logs are written. |
| `../post39/README.md`, `../post40/README.md`, `../post41/README.md` | The corrected 95% wording and the correction-of-record notes. |
| `tests/test_receipt_paths.py` | The receipt-path check, with its own positive control. |

## What this receipt does not show

* No texture beyond the browser: the ring is measured from Chromium screenshots
  in the fixture, not from a screen reader, an OS-level high-contrast mode, or a
  forced-colors render.
* The gaps and the 97%/94% band are `clip-path` slits — a synthetic way to remove
  ring pixels. What is new is the rule the measurement is held to.
* The band change (statement 3) departs from the card's item-2 wording, and the
  measurement is why. The wording the card asked for ("painted means at least 50%
  of the side's strongest paint") is reproduced in the code comment's history only
  through the mutation that shows it cannot work.
* The mutation matrix runs this card's test file only; the base-test-file column
  post-#41 used to show its closed gap is not restated here.
* `docs/` outside `docs/receipts/` still carries absolute paths (for example
  `docs/pr18-review.md`, `docs/demo-readiness-2026-11-08.md`, and the historical
  `openspec/changes/hackertube-v1/verification.md`). They are outside this card's
  scope and are left alone; the check therefore scans `docs/receipts/` only.
