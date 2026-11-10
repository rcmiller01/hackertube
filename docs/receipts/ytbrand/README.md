# YouTube branding follow-ups — t_73ae1f7b

Branch `hermes/youtube-branding`, exact base `f28e519b56cfc4db435891b867b4f178ee651e96`
(#31 squash merge). This receipt records implementation and self-verification. It is
not independent review and not permission to merge.

## Review fix 1 (t_e10fbe4a): the thumbnail is never clipped

Picasso's blocking finding on PR #32: `.hackertube .ht-thumb` carried
`border-radius: var(--radius)`, which clips the official thumbnail's corners and so
alters it (Developer Policies III.C.5 / the policies guide's "The video thumbnail must
not be altered"; our own About copy says "never cropped or covered"). The declaration
is removed from `.hackertube .ht-thumb`. No compact or thumb variant clipped the
`<img>` or its wrapper: grepping the stylesheet for `border-radius|clip-path|overflow|
filter` returns nine declarations — `.hackertube`'s `overflow-x: hidden`, two
`overflow-wrap` rules (`.ht-card p` area, `.ht-title`), the `.ht-disclosure`,
`a.ht-open` and `.ht-alert` radii, the `.ht-art` radius + `overflow: hidden` pair, and
`.ht-art img.ht-contain`'s radius — and the only one that applied to the thumbnail or a
wrapper of it was the removed line. `.ht-thumb-compact` sets width only; `.ht-youtube-media`
and `.ht-youtube-compact` carry no `overflow`, `clip-path`, `filter` or radius; and the
`.ht-art` clipping pair never contains a YouTube thumbnail (that branch renders
`img.ht-cover`/`img.ht-contain` for non-YouTube artwork). The rule's comment now
records the no-clip rule.

The regression is measured, not read: `assertUnalteredThumbnail` in
`tests/test_privacy_browser.js` asserts the thumbnail's computed `border-radius` is
`"0px"`, its computed `clip-path` is `"none"`, its computed `filter` is `"none"`, and
its rendered box keeps the image's own aspect ratio within 1%. It runs on the
ranked-feed card and on the compact row. The stylesheet contract test
(`the YouTube thumbnail presentation never crops the image`) also asserts the
`.ht-thumb` and `.ht-thumb-compact` rules declare no `border-radius`.

One test-infrastructure defect had to be fixed for that assertion to mean anything:
the browser fixture served the plugin stylesheet with **no host token block**, so
`var(--radius)` was invalid at computed-value time and every radius read back `0px` —
the assertion would have passed whatever the plugin declared. `tests/browser_net_harness.js`
now serves the host's token block (`--radius: .5rem` and the `--color-*`/`--theme-*`
tokens the stylesheet consumes) ahead of the plugin stylesheet, as the real dashboard
does. The fixture image for these tests is a 480×360 PNG (`THUMB_PNG`, the shape of the
official `hqdefault` frame) rather than the previous 1×1 pixel, so the aspect check has
something to measure.

## What changed

| Item | Change |
|---|---|
| 1. Compact-row official icon | `renderCard` no longer skips attribution for compact rows. A compact `youtube:` row renders `renderYouTubeBrand(item, true)`: the official, unmodified YouTube Icon inside a link to that item's watch URL, beside its thumbnail. The Icon keeps the brand site's published digital minimum height (**100px**; <https://brand.youtube/youtube-icon> — "Digital: 100px"), so it is not shrunk for the row. The link is the tap target (`min-height`/`min-width: 44px`, `display:inline-flex`, `padding: 0.5rem`); measured 44px+ in the browser. The accessible name stays `Watch "<title>" on YouTube`. The row is compact because the full-card 180px brand box, the 40px clear-space padding and the visible action label are not repeated. `renderActions` now omits the duplicate "Watch on YouTube" text control on compact YouTube rows too, so each card still has exactly one source-opening link (post-#31 finding 6). |
| 2. Unaltered thumbnails | `adapters/youtube.py` reads the largest official `https` URL from `snippet.thumbnails` on the **existing** keyed `videos.list` payload (no new Data API, `search.list` or oEmbed call), accepts it only from `i.ytimg.com`/`img.youtube.com`, and stores it only after a display check (`thumbnail_is_display_clear`) — one `free` GET of the public host that reads status + `Content-Type` and never reads the image body (`http.read_image_status`). `art_cache` stays `false`; no bytes are downloaded or stored. `renderArt`/`renderYouTubeBrand` hotlink the URL as `img.ht-thumb`: no `object-fit` at all (the image's own aspect ratio, so `hqdefault`'s letterboxing survives), no overlay, no play control, and the image is not wrapped in a link. The linked Icon stays beside it. Compact rows get the same image at `6.5rem` wide. If the record has no display-cleared URL, or the image fires `error`, the thumbnail is removed and the linked Icon remains — no broken image hole. |
| 3. Real computed-style badge check | The stylesheet-text-only `visual atomic F21c` gate is deleted from `tests/test_dashboard_page.js`. Its behaviour is now measured in Chromium by `compact format badges are measured in the browser, not read from the stylesheet` (`tests/test_privacy_browser.js`): `getComputedStyle` on `#podcasts .ht-compact .ht-format` is not `none` (and the badge is laid out), while `#videos`, `#books` and `#audiobooks` compact badges are `none`. The F21b markup assertion (Podcasts rows still render `Show` and `Episode`) is kept. |
| Copy + docs | About copy now says YouTube thumbnails are hotlinked from the official host, unaltered and uncached. `docs/real-search.md` and `docs/PROVENANCE.md` record the Data API thumbnail path, the free display check and the III.E.1 no-download rule. The short T28 note is unchanged: `Metadata from YouTube. Explanations and library actions are HackerTube’s.` |

Not changed: the frozen seed (`test_seed.py`'s "no ytimg in the seed" asserts still
hold — the catalog route reports `ytimg_in_seed: false`), oEmbed (still disabled), the
Podcasts compact-badge rule, and the "keep compact rows for everyone" callers.

## Measured checks

- `pytest-collect.log`: `python -m pytest tests --collect-only -q` — **318 tests
  collected** (314 at the base).
- `pytest.log`: `python -m pytest tests -q` — **318 passed**, 1 pre-existing
  Starlette/httpx deprecation warning.
- `node.log`: `node --test tests/test_dashboard_page.js tests/test_browser_requests.js
  tests/test_privacy_browser.js` — **161 tests, 161 passed, 0 failed, 0 skipped**
  (153 at the base; +9 new, −1 removed F21c).
- `red-check-clip.log` (review fix 1): the new tests run in a detached worktree at the
  reviewed head `1c67561` with only the three test files copied in — **161 tests, 158
  passed, 3 failed**, the three failures being exactly the thumbnail assertions, with
  the computed `border-radius` on the thumbnail reported as `8px` against the expected
  `0px`. The same three files at the fix: **161 passed**. A mutation that restores the
  `border-radius` in the real-dashboard receipt capture (which loads the compiled host
  stylesheet, so `--radius` resolves) also fails, reporting `7.5px` — the effective
  value the host's own `html` font-size chain produces at 390px. The mutation was
  restored from a copy and verified by sha256.
- FEED12 (`two consecutive searches announce the feed update once each`), five
  consecutive runs on the fixed head: **5/5 passed**, exit 0 each time.
- `plugin-validate.log`: `hermes plugins validate .` — `Validation passed.`
- `plugin-doctor.log`: `hermes plugins doctor . --ci` — `OK: runtime discovery,
  manifest parsing, import, and registration passed`.
- `check_spec_coverage.py` — PASS (32 PRD IDs, 8 capabilities, 100 scenarios) and
  `openspec validate --all --strict` — 1 passed, 0 failed. No scenario text changed.
- `red-check.log`: six mutations, each reverted and verified by SHA-256, all red:
  compact attribution removed → both compact tests fail; `renderThumbnail` returns
  `null` → thumbnail tests fail; `onError` removed → fallback tests fail; badge rule
  unscoped → the computed-style check fails; `parse_data_api` called without
  `art_check` → the retrieval test fails; thumbnail branch disabled in the adapter →
  the adapter test fails.
- `geometry.json` + PNGs: 390px and 1280px captures of Discover, the Videos section,
  Podcasts, Search results and Library. Measured per viewport: compact tap target
  (≥44px), compact mark height (100px), thumbnail `object-fit` (`fill`, never `cover`),
  rendered-vs-natural aspect within 0.02, thumbnail not inside a link and carrying no
  child overlay, compact badge display (`videos/books/audiobooks: none`,
  `podcasts: block`), Podcasts labels `Show`/`Episode`. Review fix 1 adds
  `borderRadius` (`0px` on all four thumbnail scopes at both viewports), `clipPath`
  (`none`) and `filter` (`none`) to the same record, and the capture asserts them.
- `clean_profile_probe.py` (fresh `HERMES_HOME`, plugin enabled by the real
  `hermes plugins enable`): the enabled profile's own `index.js`/`style.css` carry the
  compact attribution block, the uncropped thumbnail rule and the scoped badge rule
  (the rule is also asserted to declare no `border-radius` in review fix 1);
  privacy accepted; `/status` and `/catalog` 200 with 12 items, 3 unavailable videos,
  `ytimg_in_seed: false`; a source-outage pass returns with **free 0 / metered 0 /
  paid 0**; the thumbnail display check counts as **free 1 / metered 0 / paid 0**.
- `clean_profile_render.js` (same profile's assets, Playwright): a YouTube item whose
  thumbnail URL is aborted loses the thumbnail, keeps the linked Icon laid out
  (202×238 box), keeps the 238px brand block, keeps the exact note, and the compact
  row also falls back to the Icon with no broken image.
- Zero paid calls and zero metered calls were made at any point: no Data API key is
  configured here and no live provider was contacted. Every image read in the receipts
  is served offline for the `i.ytimg.com` paths.

## Recapture

```sh
export PATH=$HOME/.hermes/tools/node-<ver>-darwin-arm64/bin:$PATH
export NODE_PATH=$HOME/.hermes/cache/scratch/node-modules/node_modules
export PLAYWRIGHT_BROWSERS_PATH=$HOME/.hermes/tools
node docs/receipts/ytbrand/capture.js          # PNGs + geometry.json
```

The capture serves a synthetic 480×360 SVG for the `i.ytimg.com` paths, so the
thumbnails in the PNGs are **fixture images, not real YouTube images**. The page hotlinks
the stored URL either way; what the capture proves is the presentation, the attribution,
the fallback and the computed badge state.

## Limits of this receipt

- No live keyed Data API call was made, so no real `snippet.thumbnails` payload was
  fetched here. The adapter path is proven by the doc-shaped fixture in
  `tests/fixtures/doc/youtube_video_list.json` plus tests, and the Search/Library
  rendering by fixtures.
- The `hqdefault` letterboxing is part of the official image; the fixture does not
  reproduce it, so "no crop" is proven by the rendered-vs-natural aspect check rather
  than by a real letterboxed frame.
- `capture.js` closes its browser only on the success path, so a capture that fails an
  assertion prints the failure and then hangs until it is killed. The mutation
  red-check in `red-check-clip.log` hit that: the assertion is real, and the run had to
  be terminated after it was recorded.
- The Icon is 100px in compact rows because that is the brand site's published digital
  minimum. The row is compact relative to the full card, not icon-free; if the intent
  was a smaller mark, that is a policy question for Eve, not a styling choice here.
