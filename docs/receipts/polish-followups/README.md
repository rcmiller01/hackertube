# PR #27 polish follow-ups

Branch: `hermes/polish-followups`. Base: `d874ed20e6ef2fcb96778be1cc32b18d2bfdc7ce`.
Scope: Cracked P3 and Picasso non-blocking notes 1-5. No backend/API fields,
provider changes, or other product copy changes. The existing feed notice and
non-YouTube source-opening wording are unchanged.

## Changes and red evidence

| Item | Implementation and evidence |
|---|---|
| P3 | verification.md names the current after-feed-acceptance test. Historical logs have appended annotations, not rewritten test names. `audit.json` verifies that both original log byte sequences remain exact prefixes. |
| YouTube | The existing source link contains the official icon plus visible `Watch on YouTube` text beneath it. The accessible name remains `Open “<title>” on YouTube`. The logo's 100px height, digest, and 40px clear space remain; the art container grows to avoid clipping the new action. `red-youtube.log`: 1 failure without the text. `red-youtube-clearspace.log`: 1 failure with the text but its 40px separation removed. |
| Focus | The hand-off flag is set before mounting the accepted page. The browser harness can flush each acceptance setter separately, so modern automatic batching cannot mask the regression. `red-focus.log`: 1 failure with the original ordering, actual focused id empty instead of `discover`. |
| Policy target | A loaded policy stays mounted with `hidden` when closed after acceptance. The browser test checks the exact controlled id exists, has `hidden`, is absent from visible regions, and reopens. `red-hidden.log`: 1 failure with the original unmounting, target count 0 instead of 1. |
| Search summary | Existing state and usage become plain status, provider-request count and cost. Numeric, confirmed finite costs display dollars; missing, unconfirmed, string, boolean, null, NaN and infinite costs remain unknown. Missing request usage is unknown, not invented zero. `red-status.log`: 19 failures before this fix, including the rendered SEARCH01 summary and 17 new table cases. |

Existing copy-dependent tests were reconciled, not removed. The stale-response
test now distinguishes responses using rendered interpretation topics instead
of the removed provider label; its stale/fresh and refresh-count assertions
remain. Cancel/partial/failed/recovered tests assert the new exact summaries.

## Executed checks

| Command | Result / artifact |
|---|---|
| `.venv/bin/python -m pytest tests -q` | **314 passed**, one Starlette/httpx deprecation warning. `python.log`. The initial ambient `python` lacked pytest, so a worktree-local venv was created using the project's pinned dev versions. |
| `node --test tests/test_dashboard_page.js tests/test_browser_requests.js tests/test_privacy_browser.js` | **127 passed, 0 failed, 0 skipped**. `node.log`. |
| `.venv/bin/python docs/receipts/requests/bypass_probe.py` | exit 0, `bypass-probe.log` |
| `.venv/bin/python docs/receipts/requests/red_against_main.py` | exit 0, `red-against-main.log` |
| `.venv/bin/python docs/receipts/requests/probe.py` | exit 0, `probe.log` |
| From `hackertube/`: `hermes plugins validate .` | exit 0, full `plugin-validate.log` |
| From `hackertube/`: `hermes plugins doctor . --ci` | exit 0, full `plugin-doctor.log` |
| `python docs/receipts/polish-followups/clean_profile_probe.py` | exit 0, `clean-profile.json` |
| `python scripts/check_spec_coverage.py` | PASS, 100 scenarios, `spec-coverage.log` |
| `OPENSPEC_TELEMETRY=0 npx --yes --package @fission-ai/openspec@1.16.0 openspec validate --all --strict --no-interactive` | 1 passed, 0 failed, `openspec.log` |
| `.venv/bin/python docs/receipts/polish-followups/audit_receipts.py` | exit 0, `audit.json` |

Browser dependencies were resolved from `NODE_PATH=<hermes-home>/cache/scratch/node-modules/node_modules`
and `PLAYWRIGHT_BROWSERS_PATH=<hermes-home>/tools`.

One intermediate full browser run hit the existing FEED12 blank-mutation
assertion and an incorrectly page-wide link-count assertion in the new visual
check. `node-initial-visual-check.log` preserves both. The count was corrected
to one link **per article**, then the genuine spacing mutation was recorded.
FEED12 was not modified; the final full run passed it. No claim of flake-free
execution is made.

## 390px capture: real stylesheet reveals clipping

`model-picker-390.png` and `model-picker-390.json` use the real compiled Hermes
dashboard stylesheet before the plugin stylesheet, with a selected long
synthetic model ID. The JSON records the stylesheet's path and SHA-256,
selected value, font, wrap mode, widths and browser attempts. The capture
script refuses external requests, including the artwork attempt, and submits
no Search. This remains a fixture, not an installed-host render.

**This is not passing reflow evidence.** Document/root scrollWidth is 390px,
but picker and select are **727px**, clipped by the root. The actual screenshot
and child measurements supersede the earlier short-option, unstyled claim.
The no-flag capture exits 0 because it records evidence; `--check-reflow`
exits **1**, preserved in `model-picker-390-reflow.log`. Layout repair is held
outside this card's evidence-only item 6 and tracked as **t_0544b6fb**, assigned
to dev after this card. Do not approve narrow-viewport reflow from root
scrollWidth alone.

## Scope and clean-profile limits

`audit.json` enumerates all production matches. One shared `renderArt` caller
in `renderCard` covers its **4 callers**: section/library, ranked feed, ranked
format groups, and Search results. All **3** YouTube-brand predicates retain
the one-link/attribution/destination rules. The status formatter has **1**
rendering caller. Privacy has **1** acceptance hand-off and **1** toggle/section
pair. Changes land at those shared owners, not separate card-view patches.

Registration is unchanged and uses the existing stable ctx APIs. Doctor
exercised runtime discovery/import/registration. Separately, the clean-profile
probe copied this plugin into a fresh profile, enabled it using the native
CLI, read back its enabled user-plugin listing, accepted the policy, and drove
the actual router with real Hermes config/storage. The default unavailable
service returned **503 provider_unavailable**, then the configured **stub**
returned **200 succeeded**, 4 results. Both used zero backend outbound
requests; socket connect/DNS were explicitly refused. No user credentials or
existing profile configuration were copied. `HACKERTUBE_MODEL_KEY` was never
set or read. This establishes unavailable-service fail-closed behavior, not an
authenticated Hermes inference call or installed gateway/browser integration.
No live source, paid inference, or assistive-technology utterance is claimed.
