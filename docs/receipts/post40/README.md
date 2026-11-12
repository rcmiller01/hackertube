# Post-#40 receipts: the ring's room inside the plugin's own box, and ring tests that say what they mean

Branch `hermes/post40-followups`, base `main` at
`ee6b7c4a4d27dbaeeaf714e4917902d2a7f1b7d6` (the post-#39 merge, PR #40).

This is the follow-up to Cracked's P3 and Picasso's notes on #40. Five changes,
one text-only correction, and the receipts for all of them:

1. **`hackertube/dashboard/dist/style.css`** — the inner `.hackertube` (the
   plugin's OWN overflow box) now reserves the 4px a focused link's ring needs
   inside its padding box and takes the same 4px back with a negative margin.
2. **`tests/browser_net_harness.js`** — the fixture's host token block: the
   CardContent padding, now measured, and a dark theme keyed on the host's own
   `.dark` ancestor class with the host's measured dark values.
3. **`tests/test_privacy_browser.js`** — the 3:1 minimum is taken over PAINTED
   pixels only, so the `>= 95%` painted rule can actually fire; a 97%-painted
   control pins the difference; the dark runs enter the scheme through the `.dark`
   ancestor class.
4. **`tests/test_dashboard_page.js`** — the stylesheet contract assertion for the
   inner wrapper, which asserted `padding: 0`.
5. **`docs/receipts/post39/`** — two mutation labels that described their
   mutation wrongly, corrected by re-deriving the table at that receipt's own
   head (see "Correction of record" there; every verdict is unchanged).

## 1. The ring no longer depends on host padding

The inner `.hackertube` is the clipper: it carries `overflow-x: hidden`, and a
focused link's ring is drawn OUTSIDE the link's box (2px outline + 2px offset).
With `padding: 0` on that wrapper, a host CardContent that pads by less than 4px
puts the ring outside the plugin's own box and the plugin's own focus indicator
is clipped — the indicator was only visible because the host happened to pad.

```css
.hackertube .hackertube {
  padding: 0 4px;      /* the ring's 4px, inside the plugin's own padding box */
  margin: 0 -4px;      /* taken back, so no child moves */
  max-width: none;
}
```

The padding box grows 4px on each side while the content box does not move, so
the change is invisible except for what it fixes. Measured in the real Hermes
dashboard on this Mac (fresh `HERMES_HOME`, the plugin enabled by the real
`hermes plugins enable`, one YouTube video item written through the plugin's own
`remember_catalog` path, the REAL dashboard server, a real `Tab` press from the
row title):

| Width | Inner clip edge, pre-fix | Inner clip edge, fixed | Link left (both) | Full-page capture |
|---|---|---|---|---|
| 320px | 26.25 | 22.25 | 42.25 | byte-identical |
| 390px | 26.25 | 22.25 | 42.25 | byte-identical |
| 768px | 37.5 | 33.5 | 256.75 | byte-identical |
| 1280px | 285 | 281 | 504.25 | byte-identical |

`host-ring-base.json` / `host-ring-fix.json` hold the measurements;
`host-base-*.png` / `host-fix-*.png` are the full-page and ring-crop captures.
Every full-page capture is byte-identical between the two runs at all four
widths, and every ring measurement is unchanged: 163/163 painted on the left in
all eight runs, minimum 14.67:1, no side cut. The fixture says the same thing:
`fixture_screens.js` renders the working tree's stylesheet and the same file with
the wrapper reverted, and `fixture-fixed-*.png` is byte-identical to
`fixture-prefix-*.png` at 320/390/768/1280.

The acceptance mutation is the one the fix exists for — the fixture's host
CardContent padding set to 0. Against the fixed stylesheet the ring stays whole
and all three tests pass; against the pre-fix stylesheet the compact Watch ring
is cut (`no ancestor clips the left ring (cut by hackertube; 0/163 of the side is
painted)`) and the ring crop shows the left stroke gone:

| Fixture variant | 320px ring crop | Left stroke painted |
|---|---|---|
| host padding 0, pre-fix wrapper | `fixture-prefix-pad0-320-ring.png` | 0 rows |
| host padding 0, fixed wrapper | `fixture-fixed-pad0-320-ring.png` | the whole stroke |

## 2. The CardContent padding: measured, and NOT 15px on every side

The fixture draws the host's CardContent box because that box is what places the
compact Watch link. The value was `11.25px 15px` with no measurement behind it.
It has one now: the compact row's CardContent element is the host SDK's
`<div class="p-4">` (the direct child of the `.ht-card` that contains the row),
and in the real dashboard it computes

```
padding: 11.25px 15px        (at 320 / 390 / 768 / 1280, host root font 15px)
paddingTop 11.25px  paddingRight 15px  paddingBottom 11.25px  paddingLeft 15px
```

`host-ring-fix.json` → `geometry.cardContent` records all four sides, the
element's class list, its parent, and the two rules that matched it
(`.p-4` — `padding: calc(calc(.25rem * var(--theme-spacing-mul,1)) * 4)` — and the
universal reset). The block axis is NOT 1rem even though `.p-4` is a uniform
shorthand and `--theme-spacing-mul` reads `1`.

**Correction of record (post-#41):** the block axis is the plugin's OWN rule, not
a host one. `.hackertube .ht-compact > div { padding-block: .75rem }`
(`style.css`) matches that element — the CardContent is a DIRECT child of the
compact row's card — and at the host's 15px root `0.75rem` is exactly the measured
`11.25px`; the plugin rule out-specifies `.p-4` and sets only the block axis, so
the inline value stays the host's 15px. The probe below missed it because its
stylesheet scan ran over the HOST stylesheet only; the paragraph here that called
it "something in the host's own cascade", and
`tests/browser_net_harness.js`'s copy of that sentence, were both wrong and are
corrected in place (this receipt's generated tables are unchanged — the numbers,
including `11.25px 15px`, do not move). The inline value is independently
confirmed by
`docs/receipts/post39/host-ring.json`: the host's compact Watch link sits 16px
inside the inner `.hackertube`'s left edge at 320/390 — the host card's 1px
border plus this 15px inline padding. **So the card's suggestion to use 15px on
every side is not what the host does, and the fixture keeps the measured
`11.25px 15px`.** Nothing else about the fixture's geometry changed, so no
expectation moves.

## 3. The 95% painted rule, and the 97%-painted control

`assertPaintedRing` documented a `>= 95%` painted rule and a `>= 3:1` rule, but
the 3:1 minimum was taken over EVERY sampled pixel — and an unpainted pixel is
1:1 by construction. Any coverage defect therefore failed as a contrast defect
first, at "1.00:1", and the 95% rule could never fire. The two readings are now
separate:

* **coverage** — `painted / total >= 0.95` on every side;
* **contrast** — the minimum over PAINTED pixels only (`sample.min`), with
  `sample.minAll` (over every sampled pixel) reported in the failure message so
  the two can never be confused again.

The control (`a ring that is 97% painted passes the coverage rule while the old
all-pixel minimum would not`) removes 5 pixel rows through the middle of the
focused link's LEFT stroke with a `clip-path` slit, aligned to integer pixel rows
so no boundary pixel is half-blended, and pins three readings on one measurement:
158/163 = 96.9% painted (coverage passes), the painted pixels at the ring's own
contrast (contrast passes), and `minAll = 1.0` (what the old rule read — it
failed there). Widening the slit to 12 rows (94%) must fail the coverage rule,
and does. Reverting the aggregation to the old all-pixel minimum makes this
control — and only this control — go red, which is the red/green for the choice.

## 4. The dark run: the host's measured dark values, from an ancestor class

The dark block no longer uses a generic zinc palette and no longer hangs off
`prefers-color-scheme`. The dashboard's dark look is its palette (the default
"Hermes Teal" theme is dark teal at every OS scheme) and its dark VARIANTS are
keyed on a `.dark` ancestor class (`is(.dark *)`), so the fixture's tokens hang
off `.dark` and carry the measured values — ring `#ffe6cb`, page `#041c1c`,
read from the real dashboard in `host-ring-fix.json` → `theme`
(`color-mix(in srgb, #ffe6cb 100%, transparent)` on
`color(srgb 0.0156863 0.109804 0.109804)`).

The dark ring runs enter the scheme the same way: the class goes on `body` — an
ANCESTOR of the plugin that is not the root element — with the OS scheme left
light, and `assertPaintedRing` proves both in the run itself (the measured
surface luminance is < 0.2, `document.body` carries `dark`, and
`matchMedia("(prefers-color-scheme: dark)").matches` is false). The ring token is
read where the plugin resolves it, and must be `#ffe6cb` in the dark run and
`#18181b` in the light one.

Red/green: making the dark tokens match only `:root.dark` — i.e. dropping the
ancestor selector — leaves the light tokens in place and fails both dark runs
(`at 320px dark ... at least 95% of the top ring is painted (0/204 pixels)`),
with the light runs green. The earlier fixture, with a media-query-only dark
block, would have failed the same way.

## 5. The two wrong mutation labels

See the correction note in `docs/receipts/post39/README.md`: the `rgba(.25)` ring
is fully PAINTED (it is a contrast defect), and the `opacity: .3` rule matches
the compact Watch link whether or not it is focused. The table,
`mutations.json`, `mutations.log` and `summary.json` were re-derived at
`ee6b7c4` by re-running `mutate_ring.py` and `summarize.py`, so the labels are
generated; every verdict is unchanged (7/7 red, green control exit 0).

## Measured numbers (generated by `summarize.py`)

<!-- summary-table.md -->
| Check | Result |
|---|---|
| Python (pytest -q) | 334 passed / 0 failed |
| Node full suite (`node --test tests/*.js`) | 179 tests, 179 passed / 0 failed |
| FEED12 (10 runs) | 10/10 |
| Ring mutations caught (red) | 10/11 (the one NOT caught is the wanted PASS) |
| Green control after every revert | exit 0, all three tests pass: True |
| Real host, compact Watch ring clipped | no (8 measurements: 320/390/768/1280) |
| Real host, host-content clip edge moved out by | 4.0-4.0px (the link itself does not move; the full-page captures are byte-identical) |
| Real host, measured CardContent padding | 11.25px 15px at every width (block, inline) |
| Fixture, fixed vs pre-fix full-page capture | byte-identical at every width: True |
| Fixture, host CardContent padding 0 at 320px | ring differs between pre-fix and fixed: True |
| `hermes plugins validate .` | exit 0 (Validation passed.) |
| `hermes plugins doctor . --ci` | exit 0 (OK: runtime discovery) |

## Mutation matrix (generated by `summarize.py`)

<!-- mutation-table.md -->
| Mutation | Files | Wanted | Caught | Full card | Compact row | 97% control | First assertion |
|---|---|---|---|---|---|---|---|
| compact-side clips its own overflow | `hackertube/dashboard/dist/style.css` | compact row only | yes | green | red | red | at 320px light the compact row's Watch link: no ancestor clips the left ring (cut by ht-compact-side; 0/163 of the side is painted) |
| youtube-compact wrapper clips | `hackertube/dashboard/dist/style.css` | compact row only | yes | green | red | red | at 320px light the compact row's Watch link: no ancestor clips the left ring (cut by ht-youtube-compact; 0/163 of the side is painted) |
| ring colour dim but fully painted (rgba .25) | `hackertube/dashboard/dist/style.css` | both ring tests | yes | red | red | red | at 320px light the full card's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 1.71:1, ring rgb(189,189,190) on surface rgb(244,244,245) at 43,768; min over every sampled pixel 1.71:1) |
| compact Watch link at opacity .3 (with or without focus) | `hackertube/dashboard/dist/style.css` | compact row only | yes | green | red | red | at 320px light the compact row's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 1.98:1, ring rgb(184,184,185) on surface rgb(255,255,255) at 36,719; min over every sampled pixel 1.98:1) |
| ring colour color(srgb .6 .6 .6) | `hackertube/dashboard/dist/style.css` | both ring tests | yes | red | red | red | at 320px light the full card's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 2.59:1, ring rgb(153,153,153) on surface rgb(244,244,245) at 43,768; min over every sampled pixel 2.59:1) |
| ring colour = the surface it paints on | `tests/browser_net_harness.js` | both ring tests | yes | red | red | red | at 320px light the full card's Watch link: at least 95% of the left ring is painted (0/301 pixels, 0.0%) |
| dark-only dim ring (.dark token block) | `tests/browser_net_harness.js` | the dark runs only | yes | red | red | green | at 320px dark the full card's Watch link: at least 95% of the left ring is painted (0/301 pixels, 0.0%) |
| the dark tokens exist only for the media query, not for an ancestor class | `tests/browser_net_harness.js` | the dark runs only (no .dark ancestor match) | yes | red | red | green | at 320px dark the full card's Watch link: at least 95% of the top ring is painted (0/204 pixels, 0.0%) |
| fixture CardContent padding 0 | `tests/browser_net_harness.js` | not caught (the wrapper reserves the ring's 4px) | no | green | green | green |  |
| fixture CardContent padding 0 [pre-fix stylesheet] | `tests/browser_net_harness.js` | caught (the pre-fix wrapper relies on the host's CardContent padding) | yes | green | red | red | at 320px light the compact row's Watch link: no ancestor clips the left ring (cut by hackertube; 0/163 of the side is painted) |
| the coverage rule's minimum is taken over every sampled pixel again | `tests/test_privacy_browser.js` | the 97%-painted control only | yes | green | green | red | the 97% control's painted pixels still reach 3:1 on the left (min over painted pixels 1) |

The two dark mutations fail in the dark runs only (each width's light run
precedes its dark run in `RING_RUNS` and passes); the aggregation mutation fails
in the 97%-painted control only (the two ring tests have no unpainted pixels, so
they cannot see the aggregation); and the CardContent-padding-0 mutation is the
one mutation that must NOT be caught once the wrapper reserves the ring's room.

## Plugin checks and the clean-profile failure path

`hermes plugins validate .` and `hermes plugins doctor . --ci` were run from the
plugin folder; both exit 0, complete outputs in `plugin-validate.log` and
`plugin-doctor.log`. Nothing outside this job was flagged.

`run-clean.sh` on a fresh `HERMES_HOME` (the real `hermes plugins enable
hackertube`), then `clean_profile_probe.py` — the source-down failure path, run
with the Hermes venv python so `plugin_db` is the real one:

```json
{"storage": "/Users/robert/.hermes/hermes-agent/plugins/plugin_storage.py",
 "installed_ring_rule": ".hackertube :focus,\n.hackertube :focus-visible {\n  outline: 2px solid var(--color-ring);\n  outline-offset: 2px;\n",
 "source_outage": {"sources": 7, "items": 0, "counts": {"free": 0, "paid": 0, "metered": 0}, "down_source": "hn"}}
```

The pass returns, accounts for all seven sources, yields no items and makes no
outbound call; the installed stylesheet still takes the ring colour from the host
token and declares none of its own.

## Artifacts

| Artifact | Shows |
|---|---|
| `run-host.sh`, `host_probe.js`, `to_base.py`, `seed_video_item.py` | How the real host was driven twice — once with the working tree's stylesheet, once with the same copy reverted to `padding: 0` — from one probe: the painted ring, each clipper's padding, the CardContent element's four computed paddings and the rules that matched it, and the full-page/ring captures. |
| `host-ring-base.json`, `host-ring-fix.json`, `host-{base,fix}-*.png` | The before/after measurement and captures above. |
| `fixture_screens.js`, `fixture-*.png`, `fixture-screens.json` | The fixture's own before/after: fixed vs pre-fix stylesheet at four widths, and the ring crop with the host CardContent padding set to 0 in both. |
| `mutate_ring.py`, `mutations.json`, `mutations.log` | The mutation matrix above: one change at a time, restored from memory and verified by sha256, then a green control. |
| `pytest.log`, `node-full-suite.log`, `feed12.log` | The three suites. |
| `plugin-validate.log`, `plugin-doctor.log` | Both plugin CLI checks, complete outputs, exit 0. |
| `run-clean.sh`, `clean_profile_probe.py`, `run-clean.log` | The fresh-profile source-down path. |
| `summarize.py`, `summary.json`, `summary-table.md`, `mutation-table.md` | The two tables above, GENERATED from the logs. |

## What this receipt does not show

* No live provider call and no real YouTube image: the fixture fulfils the
  thumbnail request offline, and the real-host run renders the linked Icon with
  the hotlinked URL (the image itself is not fetched by the probe).
* The real-host captures are LIGHT-ONLY and cannot show the ring fix, and the
  correction is of record: `host-ring-fix.json` and `host-ring-base.json` both
  record `"dark": false`, and the host's own 15px CardContent padding never
  clipped the ring, so the before/after captures are byte-identical BY DESIGN.
  Only the fixture's padding-0 runs show the fix, because only there does the
  plugin's own wrapper decide whether the ring survives (`fixture-prefix-pad0-*`
  vs `fixture-fixed-pad0-*`). The light-surface case and the `.dark`-ancestor
  case are covered by the fixture; the emulateMedia entry is post-#41's.
* The CardContent block-axis padding is reported as the browser's computed value
  (`11.25px`). The correction is of record: the rule that sets it is the
  PLUGIN's own `.hackertube .ht-compact > div { padding-block: .75rem }` at the
  host's 15px root, not a host rule — the stylesheet scan in the probe found only
  `.p-4` and the universal reset because it scanned the HOST stylesheet. The
  inline value (15px) is confirmed independently by the link's position, and the
  block value by the element's own computed style.
* The painted-fraction rule's threshold is `>= 95%`, and "97%" is the CONTROL
  ring that has to clear it — 97% is not the threshold. The dark runs enter the
  scheme through the host's `.dark` ancestor class (post-#41 adds `emulateMedia`
  entries beside it); the three statements above are made plainly in
  `docs/receipts/post41/README.md`.
* The 97%-painted control removes pixel rows with a `clip-path` slit, which is a
  synthetic way to lose a few per-cent of a ring; it is a control for the two
  rules, not a claim that this is how a real ring loses pixels. A half-blended
  boundary pixel fails the contrast rule as well as the coverage rule, which is
  why the slit is aligned to whole pixel rows.
