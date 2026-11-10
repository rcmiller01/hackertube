# Post-#32 YouTube branding follow-ups — t_7428d308

Branch `hermes/post32-followups`, base main `72370070ed9406a62c8e8d6f755d4f0ad0f7568f`
(#32 merged). This receipt records implementation and self-verification. It is not
independent review and not permission to merge.

## What changed

| Item | Change |
|---|---|
| 1. Logo size | The brand site's 100px digital minimum applies to the **visible red mark**, not to the PNG file box, and the official asset ships with built-in clear space: alpha coverage spans 578/1075 of the image height. The compact row's icon rule (`.ht-youtube-compact a img`) is therefore drawn at `height: 186px` instead of `100px`, which renders the visible mark at **100.18px**. The icon stays inside its single `<a>` to the watch URL and is not recoloured. Full cards keep their 100px image box and are unchanged. |
| 2. Compact side column | `renderCard` now wraps a compact YouTube row's two parts in `.ht-compact-row` → `.ht-compact-side` (the logo + thumbnail block) and `.ht-compact-main` (the row text). Below 640px the row is a column, so the art stacks above the text exactly as before. At `@media (min-width: 640px)` it becomes `flex-direction: row`, so the logo and thumbnail share a side column beside the text. The wrappers set layout only: no `overflow`, `clip-path`, `filter` or radius. Full cards never use these wrappers. |
| 3. Render-time host check | `renderThumbnail` now uses a new `thumbnailDecision(url)` that first applies the existing `destinationDecision` (https, no credentials, not private) and then requires the hostname to be exactly `i.ytimg.com` or `img.youtube.com`. Any other host returns `ok: false`, so no `<img>` is created and the linked Icon remains. Same vocabulary as the Python adapter's `THUMBNAIL_HOSTS`. |
| 4. Test hardening | `assertUnalteredThumbnail` in `tests/test_privacy_browser.js` now walks every ancestor up to the card through a new `assertNoAncestorClips`: any `clip-path`, `filter`, or `border-radius` combined with `overflow: hidden`/`clip` fails the check. `tests/test_privacy_browser.js` (the compact-badge test, formerly line 178) uses `waitFor({state:"attached"})` so a badge that is in the DOM but hidden is still measurable. |
| 5. 30-day refresh | No behaviour change was needed: it already complies. The adapter sets `refresh_after = retrieved_at + 30 days` on YouTube catalog evidence (`adapters/youtube.py:_evidence` via `plus_days`), and `catalog_store.without_expired` — which `profile.py` runs on every catalog and stored-search read — drops the item (and with it the stored `art_url`) once `refresh_after <= now`. The thumbnail URL is never served past its metadata's deadline and is never refreshed in place. New test: `test_stored_youtube_thumbnail_url_is_dropped_at_the_30_day_read_boundary`. |
| Docs | Both owner decisions are quoted verbatim in `docs/PRD.md` §3 (November 10, 2026). `docs/PROVENANCE.md` now records that the published minimum is measured on the visible mark (578/1075 clear space; compact 186px, full card 100px). |

Owner decisions, quoted exactly (Robert, Nov 10 2026 5:58 PM ET):

- "Make the visible mark 100px, drawn at 186px like full cards"
- "Compact rows: side column with logo and thumbnail at 640px and up"

No other owner decision is claimed.

## Measured checks

- `pytest-collect.log`: `python -m pytest tests --collect-only -q` — **319 tests
  collected** (318 at the base).
- `pytest.log`: `python -m pytest tests -q` — **319 passed**, 1 pre-existing
  Starlette/httpx deprecation warning.
- `node.log`: `node --test tests/test_dashboard_page.js tests/test_browser_requests.js
  tests/test_privacy_browser.js` — **165 tests, 165 passed, 0 failed, 0 skipped**
  (161 at the base; +4 new).
- `red-check.log` (red → green, both signals):
  - **host check red** — `renderThumbnail` reverted to `destinationDecision(item.art_url)`
    in `index.js`: `✖ a thumbnail from a non-YouTube host falls back to the linked Icon
    at render time`, `AssertionError: #ranked-feed: a non-YouTube host is never rendered
    as a thumbnail`. Restored → green.
  - **ancestor walk red** — `border-radius: 12px; overflow: hidden` added to
    `.ht-youtube-compact` in `style.css`: `✖ a compact YouTube row keeps the official
    linked Icon with a 44px tap target`, `AssertionError: compact YouTube row: no
    ancestor clips the thumbnail up to the card`. Restored → green.
  - Both files verified byte-identical by SHA-256 after each revert
    (`restored sha256: True True`).
- The ancestor walk also has a self-contained in-suite red/green case:
  `the unaltered check fails when an ancestor clips the thumbnail, and passes once it is
  removed` applies a clip to the live ancestor, asserts the check rejects it, removes the
  clip, and asserts it passes.
- `row-heights.json` (base = the #32 assets at `7237007`, head = this branch; same
  fixture, same fixture images):

  | viewport | compact row height #32 | compact row height head | delta | visible mark #32 | visible mark head | full card #32 | full card head |
  |---|---|---|---|---|---|---|---|
  | 390 | 358.7px | 471.0px | +112.3px | 53.86px | 100.18px | 772.8px | 772.8px |
  | 1280 | 318.0px | 234.0px | −84.0px | 53.86px | 100.18px | 755.0px | 755.0px |

  The 390px row grows because the mark is 186px tall in a stacked block; the 1280px
  row shrinks because the art moves beside the text instead of above it, so the text
  no longer starts below a 186px-tall block. Full cards are unchanged at both widths.
  `geometry-head.json` also records `flexDirection: column` at 390 and `row` at 1280,
  `sideRight 467.1 <= mainLeft 482.1` at 1280, and `sideBottom 2100 <= mainTop 2104.5`
  at 390.
- FEED12 (`two consecutive searches announce the feed update once each, only after the
  refresh is accepted`): **10/10 consecutive runs passed**, exit 0 each time.
- `plugin-validate.log`: `hermes plugins validate .` — `Validation passed.`
- `plugin-doctor.log`: `hermes plugins doctor . --ci` —
  `OK: runtime discovery, manifest parsing, import, and registration passed`.
- `openspec.log`: `openspec validate --all --strict --no-interactive` — 1 passed, 0
  failed. No scenario text changed.
- `spec-coverage.log`: `scripts/check_spec_coverage.py` — PASS (32 PRD IDs, 8
  capabilities, 100 scenarios).

## Plugin checks (pasted)

`hermes plugins validate .` from `hackertube/`:

```
✓ manifest — plugin.yaml parses
✓ manifest fields — name, version, description present
✓ requires_hermes — spec '>=0.23.0' parses
✓ config schema — shape valid
✓ requires_env — all entries UPPER_SNAKE
✓ oauth — not declared
✓ loadable — entry: __init__.py
✓ python dependencies — none declared
✓ capability probe — register() ran in isolation
✓ declared tools — matches registrations
✓ declared hooks — matches registrations
✓ declared middleware — matches registrations
✓ built-in tool collisions — no tools to check
✓ security scan — safe
✓ no core override — no runtime rebinds of Hermes core
◆ Isolation — runs in the plugin host (plugins.isolation: host)
  · dashboard backend API is served through the plugin host (buffered responses)
  · ctx.register_cli_command() is skipped in the host (`hermes <command>` subcommands are wired into the local CLI parser)

Validation passed.
```

`hermes plugins doctor . --ci`:

```
Plugin Doctor: /Users/robert/Developer/hackertube-post32/hackertube
  manifest: hackertube 0.2.2 (standalone)
  OK: runtime discovery, manifest parsing, import, and registration passed
  registrations: 0 tool(s), 0 hook(s)
```

## Clean profile (fresh `HERMES_HOME`, plugin enabled by the real CLI)

`run-clean.sh` makes a new `HERMES_HOME` each run (nothing is deleted), symlinks the
plugin, and runs `hermes plugins enable hackertube` (exit 0; see `clean-enable.log`,
`clean-plugin-list.log`). Then:

- `clean-profile.json` — the enabled profile's own shipped `index.js`/`style.css` carry
  the side-column wrapper, the 186px icon rule, the `@media (min-width: 640px)`
  breakpoint and the render-time `YOUTUBE_THUMBNAIL_HOSTS` allowlist; privacy accepted;
  `/status` and `/catalog` 200 with 12 items and 3 unavailable videos,
  `ytimg_in_seed: false`; a source-outage pass returns with **free 0 / metered 0 / paid
  0**; the thumbnail display check counts as **free 1 / metered 0 / paid 0**.
- `clean-profile-render.json` — both failure paths, rendered from the **installed
  profile's** assets:
  - *thumbnail from a non-YouTube host* (`https://images.example.com/...`): the full
    card and the compact row both render **0** `img.ht-thumb`, keep the linked Icon
    (202×238 box), keep the short note, and make **0 requests** to the foreign host.
  - *official-host thumbnail that fails to load* (`i.ytimg.com` aborted): the full card
    and the compact row both drop the image, keep the linked Icon (202×238 box) and the
    short note.

## Recapture

```sh
export PATH=$HOME/.hermes/tools/node-<ver>-darwin-arm64/bin:$PATH
export NODE_PATH=$HOME/.hermes/cache/scratch/node-modules/node_modules
export PLAYWRIGHT_BROWSERS_PATH=$HOME/.hermes/tools
bash docs/receipts/post32/run-capture.sh   # geometry-base.json, geometry-head.json, row-heights.json, PNGs
bash docs/receipts/post32/run-clean.sh     # clean-profile probe + render
```

Screenshots in this directory: `videos-390.png`, `videos-1280.png`,
`discover-390.png`, `discover-1280.png`, `search-390.png`, `search-1280.png`.

The capture serves a synthetic 480×360 SVG for the `i.ytimg.com` paths, so the
thumbnails in the PNGs are **fixture images, not real YouTube images**. The page
hotlinks the stored URL either way; what the capture proves is the presentation,
the attribution, the fallback and the geometry.

## Limits of this receipt

- No live keyed Data API call was made, so no real `snippet.thumbnails` payload was
  fetched here. The adapter path is covered by the doc-shaped fixture plus tests.
- The thumbnail in the capture is the SVG fixture; "no crop" is proven by the
  rendered-vs-natural aspect check, not by a real letterboxed `hqdefault` frame.
- The compact row is taller at 390px and shorter at 1280px than at #32. That is the
  direct consequence of drawing the mark at 186px and putting it beside the text at
  ≥640px; the numbers are in `row-heights.json`.
