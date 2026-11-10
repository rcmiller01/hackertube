# Approved visual pass — t_59a26348

Candidate branch: `hermes/visual-pass`. Base: `1de0e625a8d31cb0e664bb4fbd7db49ce522586d` (polish merged). The PR/card handoff pins the final head; `summary.json` pins measured production bytes with SHA-256. This receipt covers implementation/self-verification, not independent review or permission to merge.

## Changes and scope

| Findings | Implementation / evidence |
|---|---|
| F1, F2, F19 | Remove YouTube's narrow-screen aspect-ratio conflict; bind form width and shrink both form/select sizing owners, with a field gap. `before-geometry.json` / `after-geometry.json` measure individual boxes with a long selected option. Root scrollWidth alone is not accepted as evidence. |
| F3, F14, F17 | Saved interests start with collapsed controls, empty-profile setup opens; ranking notes move into a native closed disclosure; heading is Discover with unchanged focus target; empty live status no longer reserves a band; Privacy is quiet/right-aligned. Browser journeys reopen controls by keyboard. |
| F4, F8, F18, F20 | No empty art placeholders, shorter honest metadata/date/duration, full timestamp in time/title, no book length placeholder, unknown creator parts omitted, merged Library state. Evidence distinctions and HN line remain. |
| F5-F7, F9-F13, F15-F16, F23 | Theme-token type hierarchy/leading, muted secondary tier, plain link underlines, primary source/outlined Save/quiet Dismiss, nested padding eliminated, shared 44px targets, portrait cover container, adaptive grid, muted counts/badges, no empty browse group, weight 600. |
| F21 | Compact art-free rows in format sections; full cards remain in ranked feed, Library and retrieved Search results. Matches precede the rest and only matches have why-lines. |
| F22, approved T copy | Search details disclosure, approved helper/section/Library/cost/acknowledgement copy, no repeated static provider paragraph; form ARIA references the merged disclosure. Backend disclosure is synchronized, not silently left behind. |
| PR #28 additions | YouTube accessible name uses `Watch "<title>" on YouTube`; both usage lines share one finite/non-negative validator; repeat announcements schedule from a committed-blank effect. |

**T28 conservative option:** retain the established YouTube attribution sentence, demoted into the secondary tier. Picasso expressly permits only demoting it when the compliance check is uncertain. No new compliance research or changed policy claim is implied.

Caller enumeration: four production `renderCard(...)` sites — `renderSectionBlock`, `cardGrid`, `renderRanked`, `resultRow`. They cover unpersonalized format lists, Library, personalized section matches/browse, ranked feed and Search. Card metadata/art/actions change at that common boundary; compactness is selected at the section callers, not a second renderer. Two production request-count readers (`limitsLine`, `searchStatusLine`) share `usageCount`. Two production disclosure declarations (JS/Python) remain equality-tested. No provider bindings, credential ownership, jobs, catalog seed or backend request policy changed.

## Measured checks

[Generated summary table](summary-table.md), [machine summary and source hashes](summary.json). Regenerate with `python docs/receipts/visual-pass/summarize.py`; it derives the table from raw logs and JSON instead of transcribing rounded figures.

- `pytest-collect.log`, `pytest.log`: full Python collection and run, including FastAPI/httpx route tests; the existing Starlette/httpx deprecation warning remains.
- `node.log`: the complete three requested Node/browser files, with no skips.
- `red-base-visual.log`, `red-manifest.json`: new visual regressions fail against the exact base's production JS/CSS. Valid non-negative count cases are positive controls and continue passing. `red_base.py` restores implementation bytes in `finally` and asserts their hashes. Atomic tests isolate disclosure, absent art, metadata, heading, empty group, unknown creators and compact rows rather than relying solely on a combined test's first failure.
- `red-FEED12-initial-*.log` / `red-FEED12-initial-rate.json` and `red-FEED12-base-*.log` / `red-FEED12-rate.json`: separate baseline trials establish the intermittent blank-mutation failure. A passing baseline trial is not proof the race is absent. `FEED12-1.log` through `FEED12-5.log` are consecutive fixed runs. The browser test observes live-region DOM mutations, not actual screen-reader speech.
- `bypass-probe.log`, `requests-red-against-main.log`, `requests-probe.log`: each required request probe exits zero; historical `red_against_main.py` now reports fixed/refused behavior on the candidate.
- `plugin-validate.log`, `plugin-doctor.log`: both requested native CLI checks pass. Host-isolation/CLI-registration information in validate is retained, not suppressed. No private host API was added.
- `clean-enable.log`, `clean-plugin-list.log`, `clean-profile.log`: a fresh disposable HERMES_HOME links this plugin and enables it; enabled state is read back. Real Hermes `plugin_db`/config reader and FastAPI routes are used. Accept the privacy policy **before** the failure path: the unavailable unconfigured service returns `503 provider_unavailable` without an outbound call; explicitly selecting stub returns a succeeded job with unknown cost and no outbound call. No model key is read/set. This is an in-process enabled-plugin route probe, not an installed gateway/browser lifecycle rehearsal.
- `openspec.log`, `spec-coverage.log`: strict structural validation and scenario mapping pass. UI04, UI07 and FEED10 wording is synchronized with the behavior. Review remains pending in tasks.md.

## Screenshots and limits

`capture.js` renders the actual production bundle and plugin stylesheet with the installed compiled Hermes stylesheet loaded first (`hostStylesheet` in the geometry JSON). React is real; SDK components and local API data are **stubs**, not a live host session. Fixtures are synthetic and explicitly named; external artwork is blocked. No live source, model, web-search, paid or metered provider work is performed. The public embedded official YouTube icon remains unmodified. A native select may truncate its selected long label inside the control; the control, management link, Question and disclosure fit the viewport and their own owning boxes.

- `before-discover-1280.png`, `after-discover-1280.png`
- `before-discover-390.png`, `after-discover-390.png`
- `before-search-1280.png`, `after-search-1280.png`
- `before-search-390.png`, `after-search-390.png`
- `before-geometry.json`, `after-geometry.json`: exact first feed-card top offsets, collapse state, search element dimensions and YouTube art/parent widths.

Before is the exact main base, not Picasso's older d874ed2. The fixture lacks host header/sidebar chrome and uses stub SDK components; its offsets cannot be equated to Picasso's host-approximation screenshots or an installed dashboard. Full-page screenshots were inspected, including a detailed crop of the selected long model at 390px. Final capture assertions also exercise the keyboard escape from collapsed controls and computed underline with the real host stylesheet loaded. Not claimed: an assistive-technology run, complete host lifecycle, live provider/source availability or fresh image-content verification.

## Reproduction environment

Use an isolated Python 3.13 venv with pytest, FastAPI and httpx. Clear inherited `PYTHONPATH` for that interpreter. Set `NODE_PATH` to a directory containing esbuild/react/react-dom/playwright, put Node 26 on PATH and point `PLAYWRIGHT_BROWSERS_PATH` at the installed browser directory. `capture.js` accepts `HACKERTUBE_HOST_CSS` for a different compiled host stylesheet. Raw artifacts retain the measured local paths. Run from repository root:

```sh
python -m pytest tests --collect-only -q
python -m pytest tests -q
node --test tests/test_dashboard_page.js tests/test_browser_requests.js tests/test_privacy_browser.js
python docs/receipts/visual-pass/red_base.py
node docs/receipts/visual-pass/capture.js after
python docs/receipts/requests/bypass_probe.py
python docs/receipts/requests/red_against_main.py
python docs/receipts/requests/probe.py
(cd hackertube && hermes plugins validate . && hermes plugins doctor . --ci)
python docs/receipts/visual-pass/summarize.py
```

The baseline script deliberately swaps only this worktree's production JS/CSS temporarily; do not run other checks or editors concurrently. The clean profile must be fresh for each run, otherwise its persisted stub setting would skip the unavailable-service failure case. No merges are authorized by this receipt.
