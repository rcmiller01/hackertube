# Model picker 390px reflow fix (t_0544b6fb)

Follow-up to the capture-only evidence in `README.md` / `model-picker-390.*`.
Parent branch `hermes/polish-followups` at `7a14fce4cf6b35e84c01104cc1c1f5cf8ffed0b5`;
this work lives on its own branch `hermes/model-picker-reflow` in a separate
worktree. No parent worktree or file was modified: the historical
`model-picker-390.json` / `.png` / `.log` keep their failing 727px measurement.

## Observed defect

At a 390px viewport with the real compiled Hermes dashboard stylesheet, a
selected long synthetic model id pushed the model picker and its `<select>` to
**727px** while document/root `scrollWidth` stayed **390px**, because
`.hackertube { overflow-x: hidden }` clips the overflow. The clipped controls are
visible in the parent `model-picker-390.png`.

## Root cause (enumerated, not guessed)

`probe-chain.js` walks the select's ancestor chain at 390px and reports each
box's measured and intrinsic widths. The sizing owner is the `<select>` itself: a
form control's intrinsic **min-content** width equals its widest option, so
`#hackertube-search-model` had `min-content == max-content == 727px` and could not
shrink. Every ancestor inherited that floor:

| Box | composed role | baseline width | min-content |
|---|---|---|---|
| `select#hackertube-search-model` | rigid atom (`min-width:auto` = its content) | 727 | 727 |
| `div.ht-model-picker` | `width:100%` of the form | 727 | 727 |
| `form#hackertube-search-panel` | shrink-to-fit **flex item** in a column flex | 727 | 727 |
| `div.ht-search` | column flex, `align-items: flex-start` | 330 (client) | 727 |

The `form` is a shrink-to-fit flex item in `.ht-search` (a column flex container
with `align-items: flex-start`), so its used width is
`min(max-content, max(min-content, available)) = 727` while the column offers only
330. `max-width:100%` on the select did not help: `100%` resolved against the same
727px form, a circular bound. Two sizing owners therefore needed the boundary
fix — the containing width (the form / picker row) and the min-content floor (the
select).

## Fix (`hackertube/dashboard/dist/style.css`)

CSS only; no copy, markup, route or bundle change.

```css
.hackertube .ht-search > form { min-width: 0; width: 100%; max-width: 100%; }
.hackertube .ht-model-picker { /* …existing… */ min-width: 0; }
.hackertube .ht-model-picker select { width: 100%; min-width: 0; max-width: 100%; }
```

`min-width: 0` removes the min-content floor on the form and the select so the
picker row can shrink into its container instead of widening every ancestor;
`width: 100%` binds the form to the search column. 390px is unchanged; the
shrink-to-fit boundary is fixed, not a short-option fixture.

## Evidence

| Check | Result | Artifact |
|---|---|---|
| Baseline styled 390px reflow gate | **exit 1**, picker/select 727px | `model-picker-390-reflow.log` (parent) |
| Fixed styled 390px reflow gate | **exit 0**, picker/select 330px | `model-picker-390-check-reflow-after.log` |
| Fixed child widths / clipping | all owning boxes 330px, none clipped, `overflowing_elements: []` | `model-picker-reflow-fix.json`, `model-picker-reflow-fix.png` |
| Ancestor sizing chain | names the select as the min-content owner | `probe-chain.json` |
| Behavioral regression RED (baseline CSS) | **1 fail**: `.ht-search clips its own content: scrollWidth 727 > clientWidth 330` | red check below |
| Behavioral regression GREEN (fixed CSS) | **1 pass** | `tests/test_model_picker_reflow.js` |

Real host stylesheet: `~/.hermes/hermes-agent/hermes_cli/web_dist/assets/index-CXKdN8QE.css`,
sha256 `b108549924729a099113081f9f8883c8c7cb9913964750027af07ca1e4c8f0ac` (recorded in
`model-picker-reflow-fix.json`). The
capture attempts no Search, aborts every non-fixture origin, and keeps zero paid
or live calls.

The regression asserts each owning box's own measured width and internal
clipping — not only root `scrollWidth`, which the host's `overflow-x: hidden`
masks. It self-skips with a clear message when the host stylesheet path is absent
(set `HACKERTUBE_HOST_CSS`), and is wired into `npm test`.

## Red-against-baseline method

Save the fixed CSS aside, restore the tracked baseline with
`git checkout HEAD -- hackertube/dashboard/dist/style.css` (on this branch HEAD is
the parent baseline because the fix is uncommitted), run
`node --test tests/test_model_picker_reflow.js` → 1 failing test, then restore the
fixed CSS from the saved copy (never `git checkout` — the branch work is
uncommitted) and assert its sha256 is unchanged.

## Executed checks

| Command | Result |
|---|---|
| `.venv/bin/python -m pytest tests -q` | **314 passed**, 1 Starlette/httpx warning |
| `node --test tests/test_dashboard_page.js tests/test_browser_requests.js tests/test_privacy_browser.js tests/test_model_picker_reflow.js` | **128 passed, 0 failed, 0 skipped** |
| `python docs/receipts/requests/{bypass_probe,red_against_main,probe}.py` | exit 0 each |
| request-boundary tests | 28 passed |
| `hermes plugins validate .` | exit 0 |
| `hermes plugins doctor . --ci` | exit 0 |
| clean-profile probe | exit 0, keyless 503 `provider_unavailable`, stub 200 `succeeded` 4 results, zero outbound |
| `python scripts/check_spec_coverage.py` | PASS, 100 scenarios |
| strict OpenSpec 1.16.0 | 1 passed, 0 failed |
| `git diff --check` | clean |

## Scope and limits

Narrow sizing defect only. Fixture render with the real host stylesheet, not an
installed gateway/browser render; no authenticated inference, deployment,
assistive-technology utterance, or CI pass is claimed. The new test skips when the
host stylesheet is unavailable, so on a host without it the regression is not a
gate.
