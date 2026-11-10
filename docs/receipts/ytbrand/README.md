# YouTube branding follow-ups — t_73ae1f7b

Branch `hermes/youtube-branding`, exact base `f28e519b56cfc4db435891b867b4f178ee651e96`
(#31 squash merge). This receipt records implementation and self-verification. It is
not independent review and not permission to merge.

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
  `podcasts: block`), Podcasts labels `Show`/`Episode`.
- `clean_profile_probe.py` (fresh `HERMES_HOME`, plugin enabled by the real
  `hermes plugins enable`): the enabled profile's own `index.js`/`style.css` carry the
  compact attribution block, the uncropped thumbnail rule and the scoped badge rule;
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
- The Icon is 100px in compact rows because that is the brand site's published digital
  minimum. The row is compact relative to the full card, not icon-free; if the intent
  was a smaller mark, that is a policy question for Eve, not a styling choice here.
