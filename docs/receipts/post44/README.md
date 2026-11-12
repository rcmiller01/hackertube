# Post-#44: ring-test and receipt follow-ups

Branch: `hermes/post44-followups`. Base: `main` at
`d1e066dc60d558a4a04308032b794404e4b78fb7` (PR #44).
Review notes: Picasso, issue comment 6812927569; Cracked, issue comment 6813323401.

Only tests, test comments and these receipts change. Nothing under `hackertube/`
changes, including `style.css`. No product decision changes: the card's
100%-painted rule remains `sample.painted === sample.total`, and every painted
pixel must reach 3:1. The exact final PR head belongs in the PR/card handoff;
`summary.json` records hashes of the tested input files, and `mutations.json`
records the restored input hashes from the mutation run.

## Changes and evidence

1. **Computed per-pixel reference.** All **five** `measurePaintedRing` callers
   supply `geometry.outlineColor`. Chromium's canvas composites that colour over
   black and white; the sampler derives its expected full-paint colour over each
   pixel's own unfocused surface. Element/ancestor opacity is included, so a
   fully drawn dim ring still fails **contrast**, not coverage. Screenshot pixels
   remain the evidence for both coverage and contrast. The strongest measured
   pixel is diagnostic only; there is no measured-colour fallback.

   The new two-tone fixture uses one semi-transparent outline over two surfaces.
   It asserts that both horizontal strokes actually contain two ring tones, that
   the old strongest-pixel classifier misreads them, and that all four full
   strokes pass the unchanged coverage/contrast gates. A 1px gap fails coverage.
   `two-tone.json` captures the measured geometry, surfaces, tones and both old
   classifiers; `strongest-pixel-red.log` is the actual old-classifier failure.
   This is a two-tone **composite** fixture, not an arbitrary opaque overlay with
   a colour unrelated to the element's computed outline.
2. **DPR assertions.** Both existing `RING_RUNS` loops assert the page's actual DPR
   against the requested one. `ignored-dpr-red.log` shows both tests fail when
   context creation ignores the request.
3. **Device-grid slit edges.** The coverage fixture returns the absolute slit
   edges in device pixels, including the link's viewport origin; integrality of
   those edges determines whether a boundary row is split. `MEASURED_DPRS` now
   includes 2 alongside 1 and 1.25. Every DPR exercises full rings, 1/2/5px gaps
   and the 3% notch at offsets 0/.25/.5/.75 CSS px. The gap assertions require a
   coverage diagnosis, while the remaining painted pixels still clear 3:1.
   `old-slit-red.log` demonstrates the old predicate's DPR-2/.5px failure.
4. **Gradient preconditions.** Opacity comes from computed outline alpha, not a
   channel-difference magnitude. Contrast uses the actual 3:1 gate rather than
   today's dark token's incidental 12:1 value. `lighter-gradient-green.log`
   proves a `#767676` outline passes the gradient test, including its 1px-gap
   control. The existing gradient fixture still proves it would fool the older
   strongest-difference classifier.
5. **Published-path input set.** The receipt scanner uses NUL-delimited
   `git ls-files --cached --others --exclude-standard`, retaining new nonignored
   documents while excluding ignored local files. It also explicitly excludes
   bytecode. A new regression plants forbidden bytes in an ignored bytecode file;
   `bytecode-walk-red.log` shows the old filesystem collector fails it. The
   existing planted-path positive and clean-placeholder negative controls remain.
6. **Node reporter formats.** `post43/mutate_ring.py` reads both spec-reporter
   check/cross lines and TAP `ok`/`not ok` lines, ignoring skipped cases. Actual
   Node **22.23.5** and **26.12.1** runs are captured in `node22-green.tap`,
   `node22-mutation.tap` and `node26-green.spec`. `verdict-formats.log` compares
   the pre-fix empty TAP map with the corrected green and red maps.

## Results

[Generated results and mutation diagnoses](summary-table.md) come from
`summary.json`, `mutations.json` and `focused-checks.json`; regenerate them with
`summarize.py`. Individual suite output, plugin output and mutation failures are
published beside the summaries, not inferred from a successful wrapper command.
Historical `post43/` result logs are unchanged; only its executable mutation
runner is maintained for the new sampler and reporter formats.

Plugin validation's isolation text is informational: dashboard API buffering and
CLI registration being skipped in the plugin host. It is reported, not fixed.
The clean-profile receipt enables the plugin through the real CLI and reads the
new profile configuration back. Its failure path injects a first-source
`OSError("connection refused")`; it is not a claim that an external source was
actually down. The probe uses the real host storage module, returns no items,
and reports zero free/paid/metered outbound counters. See `clean-profile.log` and
`clean-profile-enable.log`. No production plugin code/import/ctx changes occur.

## Reproduce

Use a Python environment containing pytest, FastAPI and httpx; make Playwright,
React, React DOM and esbuild discoverable as described in the repository's prior
receipts. Put the desired Node on PATH and set the browser root as needed.

```sh
python -B docs/receipts/post44/focused-checks.py
HACKERTUBE_NODE22_BIN=<node22-bin-directory> \
  python -B docs/receipts/post44/verdict-formats.py
HACKERTUBE_MUTATION_OUT="$PWD/docs/receipts/post44" \
  python -B docs/receipts/post43/mutate_ring.py
python -B docs/receipts/post44/run-verification.py
python -B docs/receipts/post44/summarize.py
python -B docs/receipts/post44/normalize-logs.py
```

Published logs are home-path-redacted and have trailing line whitespace trimmed;
verdicts, assertion text and counts are unchanged. Receipt capture initially
echoed the path test's planted sample into its own red log; capture sanitation
now covers that synthetic prefix as well as the actual home directory. The
clean-profile configuration check reads the enabled-plugin list (not an assumed
per-plugin boolean). Both receipt-harness corrections were exercised before the
final green run.

Do not run any source-editing mutation/probe concurrently against this worktree.
Each mutation runner restores its startup source snapshot and verifies the
restore hash; concurrent edits would be overwritten and concurrent measurements
could sample the wrong variant. Mutation logs are redacted by the existing
redactor before the documentation-path check is run.

Limits: Chromium screenshots and keyboard navigation, not assistive-technology
utterances; an injected source failure, not a live external outage. No merge or
main push is part of this work.
