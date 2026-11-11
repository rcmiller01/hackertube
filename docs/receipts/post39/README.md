# Post-#39 receipts: the compact Watch ring in the real host, and a ring test that cannot be fooled

Branch `hermes/post39-ring-clip`, base `main` at
`2e09ae47abb69803473f12d0911d5d5c5b498eeb`. **No production file changes**: the
only edits are `tests/browser_net_harness.js` (fixture fidelity + a dark host
token block), `tests/test_privacy_browser.js` (the two ring tests and
`assertPaintedRing`), and this directory. `hackertube/dashboard/dist/style.css`
and `index.js` are untouched — the real host does not clip the ring, so there was
nothing to fix.

## The real-host answer: the ring is NOT clipped

Measured in the real Hermes dashboard on this Mac — a fresh `HERMES_HOME`, the
plugin enabled by the real `hermes plugins enable`, the real dashboard server,
the plugin page opened in Chromium, the compact row's Watch link reached with a
real `Tab` press from the row title (`activeElement === link` asserted), and the
focused screenshot compared pixel-by-pixel with the unfocused one:

| Width | Scheme | Link left | Ring left | Nearest clipping ancestor | Left stroke painted | Min contrast |
|---|---|---|---|---|---|---|
| 320px | light | 42.25 | 38.25 | inner `.hackertube` at 26.25 | 163/163 | 14.67:1 |
| 390px | light | 42.25 | 38.25 | inner `.hackertube` at 26.25 | 163/163 | 14.67:1 |
| 320px | dark | 42.25 | 38.25 | inner `.hackertube` at 26.25 | 163/163 | 14.67:1 |
| 390px | dark | 42.25 | 38.25 | inner `.hackertube` at 26.25 | 163/163 | 14.67:1 |

No side is cut at any of the four measurements. The reason is the host's own
`CardContent`: it renders `<div class="p-4">`, measured at **11.25px 15px** at
both widths, so the link sits 15px inside the card's content box and its 4px
ring (2px outline + 2px offset) clears the inner `.hackertube` clip by 12px.

The clip reported on #39 was a **fixture** artifact: the harness stubbed
`CardContent` as a bare `Pass` div, so the link sat flush at the inner
`.hackertube`'s content edge (x=24) and the ring's left stroke fell outside its
`overflow-x: hidden`. The dashboard never had that geometry.

Screenshots: `host-ring-320-focused.png` / `host-ring-320-unfocused.png` (and the
390 and `-dark` pairs) are the same clip region focused and unfocused;
`host-320.png` / `host-390.png` are the full page. The focused capture shows the
complete rectangle; the unfocused one shows no ring at all. The `-dark` captures
are byte-identical to their light counterparts (`md5` equal), which is the
dark-theme finding recorded at the end of this note rather than a failed capture.

## What changed in the tests

1. **The fixture draws the host's box.** `CardContent` now renders
   `.ht-card-content` with the measured `11.25px 15px` padding (declared in the
   fixture's host token block), so the fixture and the dashboard agree about
   where the link sits.
2. **No side is exempt.** `assertPaintedRing` fails on any side that a clipping
   ancestor cuts, on any side painted less than 95%, and on any side below 3:1.
   The old "a cut side may be reported instead of measured" branch and the
   overall ">= 50% painted" allowance are gone: a side that paints nothing is
   either clipped or not drawn, and both are defects.
3. **Both schemes.** Each ring test now runs every width twice, with
   `emulateMedia({colorScheme: "dark"})` and a dark host token block, and asserts
   the surface behind the ring really is dark (luminance < 0.2) in the dark run
   and light (> 0.5) in the light run, so neither run can pass for the wrong
   reason.

## Where each mutation lands (this is the part that is easy to get wrong)

* The ring **colour** is declared exactly once, in `HOST_TOKENS_CSS` in
  `tests/browser_net_harness.js` (`--color-ring`). The plugin stylesheet only
  consumes `var(--color-ring)` and declares no colour literal, so a
  `--color-ring` edit to `style.css` matches nothing and proves nothing.
* The ring **rule** (`outline: 2px solid var(--color-ring)`, `outline-offset:
  2px`) and the compact row's own boxes live in
  `hackertube/dashboard/dist/style.css`.
* The dark ring colour lives in the dark block of the same harness token block.

## Artifacts

| Artifact | Shows |
|---|---|
| `real_host_ring.js`, `host-ring.json`, `host-ring-*.png`, `host-*.png` | The real-host measurement above, with the focused/unfocused captures. |
| `run-host.sh`, `seed_video_item.py` | How the real host was driven: fresh profile, plugin enabled, one YouTube video item written through the plugin's own `remember_catalog` path (the frozen seed has no video, so a fresh dashboard would never render a compact YouTube row), dashboard server, probe. |
| `mutate_ring.py`, `mutations.json`, `mutations.log` | The mutation matrix: one change at a time, the ring tests RED, the file restored from memory and verified by sha256, then a green control run. |
| `pytest.log` | Full Python suite. |
| `node-full-suite.log` | Full Node suite (`node --test tests/*.js`). |
| `feed12.log` | FEED12 ten times. |
| `plugin-validate.log`, `plugin-doctor.log` | `hermes plugins validate .` and `hermes plugins doctor . --ci`, complete outputs, both exit 0. |
| `run-clean.sh`, `clean_profile_probe.py` | A fresh disposable `HERMES_HOME`, the plugin enabled by the real CLI, then the source-down failure path. |
| `summarize.py`, `summary.json`, `summary-table.md`, `mutation-table.md` | The tables below, GENERATED from the raw logs above. |

## Measured numbers (generated by `summarize.py`)

<!-- summary-table.md -->
| Check | Result |
|---|---|
| Python (pytest -q) | 334 passed / 0 failed |
| Node full suite (`node --test tests/*.js`) | 178 tests, 178 passed / 0 failed |
| FEED12 (10 runs) | 10/10 |
| Ring mutations caught (red) | 7/7 |
| Green control after every revert | exit 0, both tests pass: True |
| Real host, compact Watch ring clipped | no (4 measurements: 320/390 x light/dark) |
| `hermes plugins validate .` | exit 0 (Validation passed.) |
| `hermes plugins doctor . --ci` | exit 0 (OK: runtime discovery, manifest parsing, import, and registration passed) |

## Mutation matrix (generated by `summarize.py`)

<!-- mutation-table.md -->
| Mutation | File | Wanted | Full card | Compact row | First assertion |
|---|---|---|---|---|---|
| compact-side clips its own overflow | `hackertube/dashboard/dist/style.css` | compact only | green | red | at 320px light the compact row's Watch link: no ancestor clips the left ring (cut by ht-compact-side; 0/163 of the side is painted) |
| youtube-compact wrapper clips | `hackertube/dashboard/dist/style.css` | compact only | green | red | at 320px light the compact row's Watch link: no ancestor clips the left ring (cut by ht-youtube-compact; 0/163 of the side is painted) |
| ring colour dim but fully painted (rgba .25) | `hackertube/dashboard/dist/style.css` | both | red | red | at 320px light the full card's Watch link: the painted focus ring reaches >= 3:1 on the left (measured 1.71:1, ring rgb(189,189,190) on surface rgb(244,244,245) at 43,768) |
| compact Watch link at opacity .3 (applies with or without focus) | `hackertube/dashboard/dist/style.css` | compact only | green | red | at 320px light the compact row's Watch link: the painted focus ring reaches >= 3:1 on the left (measured 1.98:1, ring rgb(184,184,185) on surface rgb(255,255,255) at 36,719) |
| ring colour color(srgb .6 .6 .6) | `hackertube/dashboard/dist/style.css` | both | red | red | at 320px light the full card's Watch link: the painted focus ring reaches >= 3:1 on the left (measured 2.59:1, ring rgb(153,153,153) on surface rgb(244,244,245) at 43,768) |
| ring colour = the surface it paints on | `tests/browser_net_harness.js` | both | red | red | at 320px light the full card's Watch link: the focus ring is painted on the left (0/301 pixels) |
| dark-only dim ring (harness dark token block) | `tests/browser_net_harness.js` | dark only | red | red | at 320px dark the full card's Watch link: the painted focus ring reaches >= 3:1 on the left (measured 1.43:1, ring rgb(63,63,70) on surface rgb(39,39,42) at 43,768) |

The dark-only mutation fails at `320px dark`; the light run of the same width
precedes it in `RING_RUNS` and passes, which is what makes it dark-only rather
than a general dim ring.

**Correction of record (post-#40 follow-up).** Two labels in the table above were
wrong and are corrected here: the `rgba(.25)` ring is fully PAINTED (it is the
contrast rule that catches it, not a painted fraction), and the `opacity: .3`
rule matches the compact Watch link whether or not it is focused. The table,
`mutations.json`, `mutations.log` and `summary.json` were then re-derived at this
receipt's own head (`ee6b7c4`) by re-running `mutate_ring.py` and `summarize.py`,
so the corrected labels and the verdicts are generated, not hand-edited; every
verdict is unchanged (7/7 red, green control exit 0). Separately, the painted
fraction in `assertPaintedRing` was only *documented* as a 95% rule here — the
3:1 minimum was still taken over every sampled pixel, so that rule could never
fire. That is fixed in the follow-up change, with the measured aggregation and a
97%-painted control: `docs/receipts/post40`.

## Clean-profile failure path

`run-clean.sh` on a fresh `HERMES_HOME`: `hermes plugins enable hackertube` exit
0, then an `ingest` pass whose first source (`hn`) raises
`OSError("connection refused")`:

```json
{"sources": 7, "items": 0, "counts": {"free": 0, "paid": 0, "metered": 0}, "down_source": "hn"}
```

The pass returns, accounts for all seven sources, yields no items, and makes no
outbound call. The probe also re-reads the INSTALLED stylesheet and asserts the
ring rule still takes its colour from `var(--color-ring)` and that the plugin
stylesheet declares no ring colour of its own.

## What this receipt does not show

* No live provider call and no real YouTube image: the thumbnail request is
  fulfilled offline in the fixture, and the real-host run renders the linked Icon
  with the hotlinked thumbnail URL (the image itself is not fetched by the probe).
* The real host on this Mac is dark-themed in both `prefers-color-scheme`
  settings (its page background measured `color(srgb 0.0156863 0.109804
  0.109804)` in both), so the real-host "dark" row is the same rendering as the
  "light" row. The light-surface case is covered by the fixture, not by the host.
* The fixture mirrors the host's CardContent padding (15px) but not the host
  card's 1px border, so the fixture's clearance is 11px where the host's is 12px.
  Both are clear of the 4px ring; the assertion is "no ancestor clips", not a
  fixed clearance.
* The contrast surface is the pixel under the ring in the unfocused capture of
  the same page, not a survey of the whole page.
