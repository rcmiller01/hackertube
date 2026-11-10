# Post-#30 follow-up — t_ba9ed0aa

Branch `hermes/post30-followups`. Exact base `1c96be12e4f6030f2be30d5bf09d8cc6d0202077`
(#30 squash merge). This receipt covers implementation and self-verification, not
independent review and not permission to merge.

## Change

| Follow-up | Change |
|---|---|
| Podcasts keeps the compact format badge | `hackertube/dashboard/dist/style.css`: the compact-badge rule is now `.hackertube :is(#videos,#books,#audiobooks) .ht-compact .ht-format { display: none; }`. Videos, Books and Audiobooks compact rows still hide the badge (it only repeats the section heading there). Podcasts mixes `podcast_show` and `podcast_episode`, so its compact rows keep the "Show" vs "Episode" badge, including in the accessibility tree. Full cards everywhere, and the compact-row callers, are unchanged. |

`tests/test_dashboard_page.js`:

- the layout contract now pins the `:is(#videos,#books,#audiobooks)` selector and
  asserts the old unscoped `.hackertube .ht-compact .ht-format` rule is gone;
- `visual atomic F21b` renders a Podcasts section with one show and one episode and
  asserts both compact rows carry the badge, with text `Show` and `Episode`;
- `visual atomic F21c` asserts exactly one rule hides the compact badge, that it is
  the scoped one, that it does not scope in `#podcasts`, and that the unscoped rule
  is absent.

`openspec/changes/hackertube-v1/verification.md` records the decision and the
measured checks below. No scenario, task or spec text changed.

## Measured checks

- `pytest-collect.log`: `python -m pytest tests --collect-only -q` — **314 tests
  collected**.
- `pytest.log`: `python -m pytest tests -q` — **314 passed**, 1 pre-existing
  Starlette/httpx deprecation warning.
- `node.log`: `node --test tests/test_dashboard_page.js
  tests/test_browser_requests.js tests/test_privacy_browser.js` — **153 tests,
  153 passed, 0 failed, 0 skipped** (151 before this card; the two new tests are
  F21b and F21c).
- `red-base.log` (`red-check.sh`): the same three tests run against the exact base
  stylesheet from `git show HEAD:hackertube/dashboard/dist/style.css` —
  **2 failed** (the layout contract and F21c), 1 passed (F21b, a markup assertion
  that is true on both sides), then `RESTORE_OK` with the branch file's SHA-256
  `7e478de24945bc4e68eb09c412a03adbf6fac5061d69dfe888bfa63953eba2f5`.
- `geometry.json`, `capture.log`, `discover-{390,1280}.png`,
  `podcasts-{390,1280}.png`, `videos-{390,1280}.png`: the production bundle and
  plugin stylesheet with the compiled Hermes host stylesheet loaded first.
  Computed `display` for the compact format badge:

  | Selector | 390px | 1280px |
  |---|---|---|
  | `#podcasts .ht-compact .ht-format` (2 nodes, "Show"/"Episode") | `block` | `block` |
  | `#videos .ht-compact .ht-format` (1 node, "Video") | `none` | `none` |
  | `#ranked-feed .ht-card:not(.ht-compact) .ht-format` (3 full cards) | `block` | `block` |

- `plugin-validate.log`, `plugin-doctor.log`: `hermes plugins validate .` and
  `hermes plugins doctor . --ci` both exit 0 from the plugin folder.
- `clean-enable.log`, `clean-plugin-list.log`, `clean-profile.log`: a fresh
  disposable `HERMES_HOME` (`~/.hermes/cache/scratch/post30-profile`) enables the
  plugin and reads back `enabled user 0.2.2 hackertube`. The probe asserts the
  enabled profile ships the scoped CSS rule and no longer ships the unscoped one,
  accepts privacy, then exercises two failure paths: the unconfigured provider
  returns **503 `provider_unavailable`** with zero outbound requests, and an
  injected source outage records `request failed` for Open Library while the
  healthy Hacker News source still succeeds in the same pass. The explicit `stub`
  provider then succeeds (10 results, no outbound requests).

## Limits

The screenshots are the fixture harness: real production bundle and plugin
stylesheet, compiled host stylesheet, React, but stub SDK components and a stubbed
local API, with external artwork blocked. Not an installed-gateway render and no
live source, model or paid retrieval. `display` is computed style, not an
assistive-technology run: it establishes that the badge is not removed from the
accessibility tree, not how a screen reader announces it.

## Reproduction

```sh
python -m pytest tests --collect-only -q
python -m pytest tests -q
node --test tests/test_dashboard_page.js tests/test_browser_requests.js tests/test_privacy_browser.js
sh docs/receipts/post30/red-check.sh
node docs/receipts/post30/capture.js
(cd hackertube && hermes plugins validate . && hermes plugins doctor . --ci)
HERMES_HOME=<fresh> hermes plugins enable hackertube
HERMES_HOME=<fresh> <hermes-venv>/bin/python3 docs/receipts/post30/clean_profile_probe.py
```

Environment: Python 3.14 venv (`.venv`, `uv venv --python 3.14` + `pytest==9.2.0
fastapi==0.162.0 httpx==0.28.1`) or the Hermes venv for the clean-profile probe;
Node 26 with `node_modules` installed from `package-lock.json` and
`PLAYWRIGHT_BROWSERS_PATH` at the installed browser directory. `capture.js`
accepts `HACKERTUBE_HOST_CSS` for a different compiled host stylesheet.