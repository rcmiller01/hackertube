# Verification record

## Planning state

The proposal, eight capability specs, design, and tasks describe intended behavior. This planning snapshot was written before implementation. Current receipts are in the implementation section below: tasks 1.1, 1.2, 1.4, 2.1, and 3.1 have receipts, and tasks 1.3 and 2.4 are open. The official event and source pages were read on November 5, 2026. Reading them does not establish provider approval, legal clearance, or that the hackathon submission is complete.

## Planning checks

Checked November 5, 2026 on the box with Node.js v24.22.1, OpenSpec 1.16.0, and Python 3.13.5.

| Check | Observed result | Disposition |
|---|---|---|
| Strict OpenSpec validation | 1 change passed, 0 failed, 0 reported issues | Pass for document structure |
| PRD traceability | 32 IDs accounted for; 31 have scenario references, R16 explicitly deferred | Pass for reference coverage |
| Demo disposition | Every delivery-mapped row declares an exact post-demo subset; 8 demo rows have a partial subset, R13 is fully post-demo, and 21 scenarios are deferred | Pass for delivery labels, not implementation |
| Behavioral specification inventory | 8 capabilities, 49 requirements, 93 scenarios | Proposed behavior only |
| Coverage checker fixtures | Missing PRD ID, dangling scenario, deferred P0, missing post-demo subset, non-P0 post-demo, unmapped scenario, partial subset under whole-row post-demo status, demo row deferring all scenarios, duplicate subset entry, out-of-row subset entry, missing subset reason, non-array subset, stale `specified` status, and reason without post-demo scenarios all rejected; the valid mixed-disposition R04 mapping accepted | Pass for 14 error paths and 1 positive fixture |
| Script syntax | `python3 -m py_compile scripts/check_spec_coverage.py scripts/check_spec_coverage_fixtures.py` exited 0 | Pass |
| Diff whitespace | `git diff --check` exited 0 | Pass |
| Implementation progress | Tasks 1.1, 1.2, 1.4, 2.1, 2.2, and 3.1 have receipts. Tasks 1.3 and 2.4 are open. | Host shell, catalog package, dashboard page, and profile store. |

The machine-readable strict validation output is saved in planning-validation.json. Traceability.json maps the PRD IDs to scenario IDs. Its `demo` and `post-demo` statuses describe planning scope, not implementation results. Every delivery-mapped row has an explicit `post_demo_scenarios` array, including `[]` when all its scenarios remain in the demo. A `demo` row has at least one demo scenario. A `post-demo` row defers every mapped scenario. The checks do not establish runtime correctness, recommendation quality, source rights, or hackathon eligibility.

### Strict OpenSpec output

Command:

```sh
OPENSPEC_TELEMETRY=0 npx --yes --package @fission-ai/openspec@1.16.0 openspec validate --all --strict --no-interactive
```

Output:

```text
✓ change/hackertube-v1
Totals: 1 passed, 0 failed (1 items)
```

The same command with `--json` wrote planning-validation.json. It reports `summary.totals` as one passed and zero failed items.

### Coverage output

Command:

```sh
python3 scripts/check_spec_coverage.py
```

Output:

```text
PASS: 32 PRD IDs; 31 delivery-mapped; 1 deferred (R16); 8 demo rows with post-demo subsets (R03, R04, R05, R07, R08, R12, R14, R27); 1 fully post-demo rows (R13); 21 post-demo scenarios; 8 capabilities; 49 requirements; 93 scenarios. Runtime checks not run.
```

### Coverage checker negative checks

Each case copied the repository to a temporary fixture root and invoked the coverage script with `--root`. All invalid cases returned exit code 1 as expected. The positive mixed-disposition `R04` mapping returned exit code 0.

Command:

```sh
python3 scripts/check_spec_coverage_fixtures.py
```

The fixture driver asserts the expected deferred set, every owning row and rationale, then tests temporary repository copies and the live mixed-disposition `R04` mapping. Its 14 invalid fixtures are `missing-prd`, `dangling-scenario`, `deferred-p0`, `missing-post-demo`, `non-p0-post-demo`, `unmapped-scenario`, `subset-whole-row`, `demo-defers-all`, `duplicate-post-demo`, `outside-row-subset`, `missing-post-demo-reason`, `invalid-post-demo-subset-type`, `stale-status-value`, and `reason-without-post-demo`.

```text
PASS: 21 expected post-demo scenarios; every owning row, status, and rationale agrees
missing-prd: exit 1; FAIL: Traceability IDs differ from the PRD
dangling-scenario: exit 1; FAIL: Invalid scenario references for R01
deferred-p0: exit 1; FAIL: Invalid deferral for R01
missing-post-demo: exit 1; FAIL: Missing post-demo scenario subset for R04
non-p0-post-demo: exit 1; FAIL: Only P0 rows can have post-demo scenarios for R16
unmapped-scenario: exit 1; FAIL: Scenarios without PRD references: ['dashboard-shell/UI01']
subset-whole-row: exit 1; FAIL: Post-demo row must be a complete subset for R04
demo-defers-all: exit 1; FAIL: Demo row cannot defer every scenario for R13
duplicate-post-demo: exit 1; FAIL: Invalid post-demo scenarios for R03
outside-row-subset: exit 1; FAIL: Invalid post-demo scenarios for R03
missing-post-demo-reason: exit 1; FAIL: Missing post-demo reason for R04
invalid-post-demo-subset-type: exit 1; FAIL: Invalid post-demo scenario subset for R04
stale-status-value: exit 1; FAIL: Unknown specification status for R04
reason-without-post-demo: exit 1; FAIL: Unexpected post-demo reason for R01
PASS: 14 invalid fixtures rejected
positive-mixed-row: exit 0; R04 keeps SEARCH01/03/04/05/07/08/09 in the demo; exactly SEARCH02/06/12 and HCKT20 are post-demo
PASS: 1 mixed-row fixture accepted

### Demo-cut review decisions

The six-step cut in PRD section 13 governs these delivery decisions. `LIB02` now covers restart and refresh in the demo. `LIB09` covers a supported update after the demo. The other scenarios retain their existing stable IDs.

- `UI06` stays demo for R01 and R10 because keyboard operation and accessible names apply to every six-step action.
- `FEED08` is post-demo for R03 and R05 because strict duration filtering is outside the seeded feed step.
- `LIB02` stays demo for R07 because the demo save must survive a restart and a refresh.
- `LIB04` is post-demo for R07 because confirming completion is not part of saving a result.
- `LIB05` is post-demo for R07 because undoing a dismissal is not needed to save or open the demo result.
- `LIB06` is post-demo for R07 because removing a saved item is not needed for the demo save.
- `LIB09` is post-demo for R07 and R27 because supported-update persistence belongs to the lifecycle rehearsal.
- `JOB05` is post-demo for R12 because cancellation is not exercised by the single completed demo search.
- `JOB06` is post-demo for R12 because interrupted-job recovery after restart is not part of a successful demo search.
- `JOB07` is post-demo for R12 because one-source partial-failure recovery is beyond the single working demo search.
- `JOB08` is post-demo for R12 because preserving the seeded feed through a full refresh or model failure is not one of the six steps.
- `SEARCH06` is post-demo for R04 and R14 because refinement creates another focused request beyond the single demo search.
- `SEARCH10` is post-demo for R14 because turning on the include-dismissed control is an additional focused-search interaction.
- `SEARCH11` is post-demo for R14 because the include-dismissed control and its default state ship together after the demo.
- `PREF06` is post-demo for R08 because it enables and revokes optional Hermes memory.
- `PREF07` is post-demo for R08 because Robert excluded two-profile isolation from the demo cut.
- `PREF13` is post-demo for R08 because it tests the disclosure before opting into memory; default memory-disabled behavior stays in the demo.
- `SEARCH02` is post-demo for R04 and R13 because it verifies the ordinary-chat boundary at the agent entry, not dashboard search.
- `SEARCH12` is post-demo for R04 and R13 because it explicitly invokes the agent entry.
- `LIB07` is post-demo for R13 because it saves a result through the agent entry rather than the dashboard.
- `LIB08` is post-demo for R13 because it tests ordinary chat through the agent boundary.
- `HCKT19` is post-demo for R27 because Robert excluded update, rollback, disable/re-enable, and uninstall rehearsal.
- `HCKT20` is post-demo for R04 because Robert excluded the 20-request relevance evaluation.

Every other scenario stays in the demo unless its PRD row is R16, the P1 requirement deferred entirely. Every row with `demo` status retains at least one demo scenario. R13 is the only fully post-demo row. The exact owning-row subsets are in traceability.json.

## Delivery subset consistency

The same 21 scenarios appear in the `post_demo_scenarios` arrays, the task references, and the decision bullets above. Shared scenarios appear once per owning PRD row. This audit compares names only; it does not prove that the listed behavior works.

## Requirement-to-scenario audit

The initial change added the requested credit-disclosure, chat-save, include-dismissed, Reddit, and hackathon scenarios. Reviewing each R row found four further concrete gaps:

- R01 needed a navigable-page scenario and clean clone evidence, added through UI02 and HCKT02.
- R05 needed the existing strict-duration scenario mapped, FEED08.
- R06 needed retrieval time and direct community-evidence links, added through CAT10 and CAT11.
- R08 and R09 needed memory-receiving-service disclosure and last-successful-retrieval status, added through PREF13 and PREF14.

The row audit also maps UI03 and UI06 to R01, separates agent entry into SEARCH12, and maps all new R17 through R32 requirements to HCKT scenarios. `SEARCH08` now covers previously saved or completed items, matching saved-result requirement R07 and the prior-state text. Search refinement and the include-dismissed controls are mapped to R14. Dismissed items no longer appear in a focused result set without the include control. No scenario is left without a PRD reference. This is document coverage only; scenarios remain untested.

## Research checks

The [official @NousResearch announcement](https://x.com/NousResearch/status/2118094256438936062) was read through its full long-post body. The [entry form](https://form.typeform.com/to/FwJLvOln) supplied the required fields, and the [catalog guide](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins/catalog-submission) supplied the admission rules. No official full-rules page covering participant eligibility, team size, originality, project licensing, or IP assignment was found. Those items remain open in the PRD.

Official source pages are cited in docs/sources.md. No API keys were used, no live adapters ran, and no Reddit API request was made. Karpathy's post verifies Hacker News comments and YouTube metadata use, not use of the Algolia API.

## Implementation receipts

Tasks 1.1, 1.2, 1.4, 2.1, and 2.2 have receipts below, as do tasks 3.1, 3.2, 3.7, and 3.3. Task 2.4 has a receipt but stays open: its video cards are unusable while YouTube oEmbed is disabled. Task 1.3 is open. Before marking a task complete, record its task ID, scenario IDs, exact host/code revision, test or manual procedure, observed result, date, and log/artifact location. Use pass, fail, not-run, or blocked with evidence. Keep full logs in files.

### Task 1.1 — host pin, page, auth, data root

| Field | Record |
|---|---|
| Date | 2026-11-06 |
| Plugin revision | `6601ddf9e962510c6a11f880dc85262d032e541d` |
| Host | Hermes Agent v0.23.0 (2026.9.24), commit `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19`, Python 3.14.9, disposable profile |
| Scenarios | UI01 exercised for the shell page. LIB02's saved-item behavior is not implemented; the profile data directory survived a dashboard process restart. PREF07 was not run. |
| Procedure | `hermes plugins validate hackertube --install-deps`. Enable the user plugin. Start the loopback dashboard. Open `/hackertube`, reload, restart the server, open the page again. Call `GET /api/plugins/hackertube/status` with and without the session token. |
| Result | Pass for the shell. Validation ok, no warnings. Nav href `/hackertube`. Heading text HackerTube visible after reload and after process restart. Unauthenticated status returned 401; authenticated status returned 200. |
| Artifacts | [validate.log](../../../docs/receipts/feasibility/validate.log), [http-401.txt](../../../docs/receipts/feasibility/http-401.txt), [http-200-absent.txt](../../../docs/receipts/feasibility/http-200-absent.txt), [reload-restart.log](../../../docs/receipts/feasibility/reload-restart.log), [hackertube-after-reload.png](../../../docs/receipts/feasibility/hackertube-after-reload.png) |

### Task 1.2 — model and search binding

| Field | Record |
|---|---|
| Date | 2026-11-06 |
| Plugin revision | `6601ddf9e962510c6a11f880dc85262d032e541d` |
| Host | Hermes Agent v0.23.0, commit `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19` |
| Scenarios | SEARCH01, PREF05, HCKT14, HCKT15 are not product-complete. The day-one route decision, the dashboard `get_secret` read, and the memory-disabled payload check are recorded. No focused search is implemented. |
| Procedure | Construct `PluginContext` for `hackertube` on the pinned host. Capture `complete()` messages with an injected caller. Attempt one live `complete()`. On the running dashboard, store and remove a placeholder `HACKERTUBE_MODEL_KEY` through Hermes and read presence from `GET /status`. Confirm plugin data does not contain the placeholder. |
| Result | Pass for the route decision. `ctx.llm` is `agent.plugin_llm.PluginLlm` on the native context. The dashboard module is not given `ctx`. Live `complete()` failed closed with `AuxiliaryClientUnavailable`. The captured payload was only the plugin's user message. `GET /status` reported `model_key` absent, then present, then absent, and never returned the value. Plugin data did not contain the placeholder. |
| Artifacts | [model-payload.json](../../../docs/receipts/feasibility/model-payload.json), [secret-check.log](../../../docs/receipts/feasibility/secret-check.log), [http-200-absent.txt](../../../docs/receipts/feasibility/http-200-absent.txt), [http-200-present.txt](../../../docs/receipts/feasibility/http-200-present.txt), [http-200-after-remove.txt](../../../docs/receipts/feasibility/http-200-after-remove.txt) |

### Task 1.4 — stub job lifecycle

| Field | Record |
|---|---|
| Date | 2026-11-06 |
| Plugin revision | `6601ddf9e962510c6a11f880dc85262d032e541d` |
| Host | Hermes Agent v0.23.0, commit `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19` |
| Scenarios | JOB03, JOB05, and JOB06 remain specified. Product cancellation and restart are still task 6.2. This receipt is the host observation only. |
| Procedure | Run [job_probe.py](../../../docs/receipts/feasibility/job_probe.py). It cancels a `ctx.spawn_task` stub, unloads the plugin manager, kills a child process that was ticking a stub, and inspects the receipt from a new process. |
| Result | Pass as a host observation, not as product job behavior. Cancel stopped the stub (`CancelledError`, ticks stayed at 3). Unload cancelled the second stub (ticks stayed at 2). After the process was killed, a new interpreter saw the frozen receipt at 2 ticks and did not resume the task. |
| Artifacts | [job_probe.py](../../../docs/receipts/feasibility/job_probe.py), [job-probe.log](../../../docs/receipts/feasibility/job-probe.log) |

### Tasks 1.3, 2.1, and 2.4 — sources and seeded catalog

| Field | Record |
|---|---|
| Date | 2026-11-06 |
| Tested revision | `4cb29b622b9f48b04a6a76065f7856323358e151` |
| Scenarios | 2.1 covers CAT01–CAT11 on the package. UI02, FEED01, CAT03, CAT04, and CAT10 still run against the non-video seed. PREF02, PREF03, and HCKT18 are pending and are not claimed. PREF09–PREF12 stay unimplemented because Reddit is disabled. |
| Procedure | `python3 -m pytest tests -q` on that revision. Captures and the redacted Hacker News fixtures are listed in `tests/fixtures/captured/manifest.json`, including `hn_search.json`, `youtube_videos_list_error.json`, and `podcastindex_401.txt`. |
| Result | 2.1 passes. Tasks 1.3 and 2.4 stay open. YouTube oEmbed is disabled (`unresolved-terms`); the seed keeps three video ids and watch links and does not display those cards. The Austen question matches books, audiobooks, and two podcast shows. |
| Artifacts | [pytest.log](../../../docs/receipts/catalog/pytest.log), [feasibility-sources.md](../../../docs/feasibility-sources.md) |

Saved pytest output from that revision was 34 passed. After merging main, `python3 -m pytest tests -q` also collects the dashboard catalog tests. The URL guard on code revision `77e9578834381b0b5e668c2301f86165609012bb` pins each `read_json` connection to an address that already passed the shared allowlist. `tests/conftest.py` replaces `socket.getaddrinfo` with a function that raises, so this run does no live DNS. Live source-host lookups are the manual receipt [dns-smoke.md](../../../docs/receipts/catalog/dns-smoke.md). `git diff 77e9578834381b0b5e668c2301f86165609012bb -- hackertube_core tests` is empty on the receipt commit that refreshes the log. `python3 -m pytest tests -q` on that tree reported 71 passed. Back-to-back runs took 0.12s and 0.13s. The refreshed log is [pytest.log](../../../docs/receipts/catalog/pytest.log):

```text
.......................................................................  [100%]
71 passed in 0.12s
```

### Task 3.1 — dashboard page, four sections, library, About, source opening

| Field | Record |
|---|---|
| Date | 2026-11-06 |
| Plugin revision | Code commit `ae5837db5e519884f12537fe69d4668c50731d0f`. Receipt commit `cdb23b3db03b303e516e540240320ecc5ee96883` changes `docs/receipts/dashboard/` only. `git diff --stat ae5837db5e519884f12537fe69d4668c50731d0f cdb23b3db03b303e516e540240320ecc5ee96883 -- hackertube tests` is empty. |
| Host | Hermes Agent v0.23.0 (2026.9.24), commit `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19`, Python 3.14.10, disposable profile `HERMES_HOME=/tmp/ht-profile` |
| Scenarios | UI01, UI02, UI03, UI04, UI05, and UI06 pass on the running web dashboard. The page reads the seed `hackertube_core.load_seed` returns. SEARCH01 is not executed. LIB02 persistence is not implemented. FEED ranking is not implemented. |
| Procedure | `hermes plugins validate hackertube --install-deps`, then `NODE_PATH=/tmp/pw/node_modules node docs/receipts/dashboard/capture.js` against `http://127.0.0.1:9119/hackertube`. The script is [capture.js](../../../docs/receipts/dashboard/capture.js). The raw walk is [walk.log](../../../docs/receipts/dashboard/walk.log). The validate output is [validate.log](../../../docs/receipts/dashboard/validate.log). The host line is [hermes-version.txt](../../../docs/receipts/dashboard/hermes-version.txt). |
| Result | Pass for UI01 through UI06 at code commit `ae5837db5e519884f12537fe69d4668c50731d0f`. See the scenario notes below. |
| Artifacts | [docs/receipts/dashboard/](../../../docs/receipts/dashboard/) |

UI01. The host nav link `HackerTube` points at `/hackertube`. After `location.reload` the page heading is `HackerTube`. Screenshot: [02-after-reload.png](../../../docs/receipts/dashboard/02-after-reload.png).

UI02. Videos shows `Videos 0` and `No videos in this catalog.` Core stores three `unavailable_videos` rows (video id, watch link, and reason) and no video cards, and the page does not render those rows. Podcasts 4, Books 4, and Audiobooks 4 render from the core seed, in capture order. There is no Hacker News card. No displayed item has an established Hacker News endorsement, so the page shows none. Screenshots: [03-videos.png](../../../docs/receipts/dashboard/03-videos.png), [04-podcasts.png](../../../docs/receipts/dashboard/04-podcasts.png), [05-books.png](../../../docs/receipts/dashboard/05-books.png), [06-audiobooks.png](../../../docs/receipts/dashboard/06-audiobooks.png).

UI03. The README credit, the About view, and [docs/marketplace-description.md](../../../docs/marketplace-description.md) name Andrej Karpathy and link to `https://karpathy.bearblog.dev/hacker-tube/`. About also says this is an independent Hermes adaptation. About names podcasts, books, and audiobooks, and does not say the page shows videos from YouTube. The credit is in the first viewport at 1280x720. Screenshot: [11-about.png](../../../docs/receipts/dashboard/11-about.png).

UI04. Keyboard activation of Open at source opened `https://podcasts.apple.com/us/podcast/jane-austen-stories/id1840669662?uo=4`. The dashboard contained no `video`, `audio`, or `iframe`.

UI05. With `?ht_unsafe=1` the page shows the refusal text for `javascript:alert(1)` and `https://127.0.0.1/private` and renders no link with those destinations. The same `destinationDecision` function gates every card. The default page does not show this check. Mapped IPv6 forms, including hex `::ffff:7f00:1` and `::ffff:a00:1`, are refused by the node tests at this plugin revision. Screenshot: [13-unsafe.png](../../../docs/receipts/dashboard/13-unsafe.png).

UI06. Tab order reaches the host navigation before Discover. Discover's focus outline is `solid 2px` using the host ring color. Escape closes an idle search and returns focus to Focused search. The question `What can I read or listen to by Jane Austen?` is typed into the labelled field. The disclosure is visible and tied with `aria-describedby`. Enter on Search focuses `Search results` and shows that no search was started. Enter on Save changes that control to `Saved` with `aria-disabled="true"`, announces the save, and sets the nav to `Library (1 saved)`. A second Enter does not add another save. Shift+Tab returns to Open at source. About is opened from the keyboard and its heading receives focus. An empty Search moves focus to the alert after it mounts, with a solid 2px ring: [16-focused-alert.png](../../../docs/receipts/dashboard/16-focused-alert.png). Activating Podcasts moves focus to that section `h2`: [17-focused-section.png](../../../docs/receipts/dashboard/17-focused-section.png). About links use `ht-text-link`, are underlined, and are 44px tall: [18-underlined-links.png](../../../docs/receipts/dashboard/18-underlined-links.png). This seed has no evidence anchor to photograph. The same class is covered by the node test `evidence and about links use the text link class`. Axe reports 0 violations on discover, search open, library, about, and the 390px width. At 390px and 768px the card grid is one column and the plugin root does not scroll sideways. Screenshots: [07-search-disclosure.png](../../../docs/receipts/dashboard/07-search-disclosure.png), [08-search-results.png](../../../docs/receipts/dashboard/08-search-results.png), [09-saved-focus.png](../../../docs/receipts/dashboard/09-saved-focus.png), [10-library.png](../../../docs/receipts/dashboard/10-library.png), [12-keyboard-focus.png](../../../docs/receipts/dashboard/12-keyboard-focus.png), [14-width-390.png](../../../docs/receipts/dashboard/14-width-390.png), [15-width-768.png](../../../docs/receipts/dashboard/15-width-768.png). Machine summary: [report.json](../../../docs/receipts/dashboard/report.json).

Checks quoted from this run, at code commit `ae5837db5e519884f12537fe69d4668c50731d0f`:

```text
python3 -m pytest tests -q -rs
....................................                                     [100%]
36 passed in 0.06s

python3 -m unittest discover -v
Ran 0 tests in 0.000s
NO TESTS RAN

python3 -m unittest tests.test_dashboard_catalog -v
Ran 2 tests in 0.014s
OK

node --test tests/test_dashboard_page.js
tests 17
pass 17
fail 0

python3 scripts/check_spec_coverage.py
PASS: 32 PRD IDs; 31 delivery-mapped; 1 deferred (R16); 8 demo rows with post-demo subsets (R03, R04, R05, R07, R08, R12, R14, R27); 1 fully post-demo rows (R13); 21 post-demo scenarios; 8 capabilities; 49 requirements; 93 scenarios. Runtime checks not run.

OPENSPEC_TELEMETRY=0 npx --yes --package @fission-ai/openspec@1.16.0 openspec validate --all --strict --no-interactive
✓ change/hackertube-v1
Totals: 1 passed, 0 failed (1 items)

hermes plugins validate hackertube --install-deps
Validation passed.
security scan: safe

git diff --check
exit 0

python3 -m py_compile hackertube/__init__.py hackertube/dashboard/plugin_api.py hackertube/dashboard/catalog_view.py
exit 0
```

`python3 -m unittest discover -v` collects nothing: `tests/` has no `__init__.py`, so discovery from the repository root does not import that directory. `python3 -m pytest tests -q -rs` is the suite that includes the core tests and the dashboard catalog tests. It reported 36 passed.

Not done in this task, and not claimed by the checkbox:

- Focused search does not call a model, a search provider, or any host outside the dashboard. Submitting Search only reveals the results area. Tasks 4.1 and 4.2 own execution. During the walk, Search added no new network hosts.
- Save, dismiss, and opened state are profile records under task 2.2. Dismiss does not remove a card. Task 3.2 owns ranking and feed exclusion.
- The page shows the seed in capture order. It does not call `Catalog.feed` or `Catalog.section`. On this seed those section counts match the page, because every item has catalog evidence and `refresh_after` is null. `Catalog.feed` for the demo question would omit the two Python podcast records. That ranking choice is task 3.2 and is left open.
- The catalog is `hackertube_core.load_seed()`. Open Library book covers are hotlinked and the browser follows those URLs to cover files on archive.org. Audiobook covers and Apple artwork stay text fallbacks. Those image requests are not paid model or search calls, and Reddit was not called. Hacker News evidence on this seed is not attached to a card. A unit test checks that an endorsement line stays on the item id it names.

### Task 2.2 — profile interests and library state

| Field | Record |
|---|---|
| Date | 2026-11-06 |
| Plugin revision | Code commit `4d1593e2c6a0d7f4fc7f8ff549cfecdf80e88649`, after merge `cb9d876b29529a6f50fa00afef8b04151b58db8a` of main `a73563eacdbfcf9c5fb75f8d900b1f42da327295`. Receipt commit `af532b76b425aabe5c2476339771578f900f5745` changes `docs/receipts/library/` only. `git diff --stat 4d1593e2c6a0d7f4fc7f8ff549cfecdf80e88649 af532b76b425aabe5c2476339771578f900f5745 -- hackertube hackertube_core tests` is empty. |
| Host | Hermes Agent v0.23.0 (2026.9.24), commit `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19`, Python 3.14.10, disposable profile `HERMES_HOME=/tmp/ht-lib-profile` |
| Scenarios | LIB01, LIB02, LIB03, and PREF01. LIB04 through LIB06 and PREF07 were not run. |
| Procedure | `hermes plugins validate hackertube --install-deps`, then `NODE_PATH=/tmp/pw/node_modules node docs/receipts/library/capture.js` against `http://127.0.0.1:9119/hackertube`. Stop the dashboard, start it again on the same profile, then `node docs/receipts/library/capture.js --after-restart`. |
| Result | Pass at code commit `4d1593e2c6a0d7f4fc7f8ff549cfecdf80e88649`. The profile file is `$HERMES_HOME/plugin-data/hackertube/profile.db`, opened with `plugin_db`. It was absent before the walk and present after it. One save record survived a page reload and a dashboard restart on that same home. Opening the saved source stored one open event and left completion unset. The gardening interest was still listed after that restart, and `Catalog.feed` accepts the stored interest text. The page still lists the seed in capture order. |
| Artifacts | [docs/receipts/library/](../../../docs/receipts/library/) |

### Task 3.2 — prepared-feed ranking

| Field | Record |
|---|---|
| Date | 2026-11-06 |
| Plugin revision | Code commit `b923b93c0301599e30c15d6f8cbfc284972b1a21`. Receipt commit `8fb33c0cdaa37de46366a331dee203f63e81d01e` changes `docs/receipts/feed/` only. `git diff --stat b923b93c0301599e30c15d6f8cbfc284972b1a21 8fb33c0cdaa37de46366a331dee203f63e81d01e -- hackertube hackertube_core tests` is empty. |
| Host | Hermes Agent v0.23.0 (2026.9.24), commit `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19`, Python 3.14.10, disposable profile `HERMES_HOME=/tmp/ht-feed-profile` |
| Scenarios | FEED01, FEED02, FEED03, FEED04, FEED05, FEED06, and FEED07. FEED08 was not run. |
| Procedure | `hermes plugins validate hackertube --install-deps`, then `NODE_PATH=/tmp/pw/node_modules node docs/receipts/feed/capture.js` against `http://127.0.0.1:9119/hackertube`. Stop the dashboard, start it again on the same profile, then `node docs/receipts/feed/capture.js --after-restart`. |
| Result | Pass at code commit `b923b93c0301599e30c15d6f8cbfc284972b1a21`. With no interests the ranked feed is empty and the sections are Videos 0, Podcasts 4, Books 4, Audiobooks 4. Stored interests `AI` and `C++` stay personalized, show the coverage limit, and do not fill unrelated titles. The demo question still ranks Videos 0, Podcasts 2, Books 4, Audiobooks 4. Show more moves focus to the Sense and Sensibility heading and announces `10 of 10`. A dismissed show stays out of discovery after reload and restart. `paid_calls` stayed 0. Axe reported 0 violations. |
| Artifacts | [docs/receipts/feed/](../../../docs/receipts/feed/) |

### Task 3.7 — weighted ranking and section browse

| Field | Record |
|---|---|
| Date | 2026-11-06 |
| Plugin revision | Code commit `b09714354a7ae4685b5fb5874025285ad75d723c`. Receipt commit `e644a4d2dd3ed4e0a9cc13f783ea14955e6fc73b` changes `docs/receipts/ranking/` only. `git diff --stat b09714354a7ae4685b5fb5874025285ad75d723c e644a4d2dd3ed4e0a9cc13f783ea14955e6fc73b -- hackertube hackertube_core tests` is empty. |
| Host | Hermes Agent v0.23.0 (2026.9.24), commit `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19`, Python 3.14.10, disposable profile `HERMES_HOME=/tmp/ht-rank-profile` |
| Scenarios | FEED02, FEED06, FEED07, FEED09, and FEED10. The browse group is not presented as a SEARCH07 verified match. FEED08 was not run. |
| Procedure | `hermes plugins validate hackertube --install-deps`, then `NODE_PATH=/tmp/pw/node_modules node docs/receipts/ranking/capture.js` against `http://127.0.0.1:9119/hackertube`. |
| Result | Pass at code commit `b09714354a7ae4685b5fb5874025285ad75d723c`. With no stored interests the page keeps the unranked catalog and does not use a not-matched heading. Stored interest `AI` stays personalized, the ranked feed is empty, the coverage note is shown, and Podcasts shows `0 matches` plus `More in Podcasts, not matched to your interests` with 4 browse items and no why-lines. Stored interest `Jane Austen` ranks 10 items. Every why-line is `Matched interest. Recent.` None name community evidence or Hacker News. Podcasts shows `2 matches`, then the not-matched group with the two Python records and no why-lines. `paid_calls` stayed 0. The page does not show ranking scores. |
| Artifacts | [docs/receipts/ranking/](../../../docs/receipts/ranking/) |

The weights are module constants in `hackertube_core/ranking.py`: community evidence 1000, freshness 1 point per day remaining in a 366-day window, variety penalties 40 for a consecutive same catalog source and 20 for a consecutive same format. Interest match is the gate and is not a weight. `Recent` is the why-line word only when the catalog age is 30 days or less. Tie-break is item id.

### Task 3.3 — request boundaries and zero paid calls

| Field | Record |
|---|---|
| Date | 2026-11-06 |
| Plugin revision | `9b8b76960421b457d488e48b8edd07bf9574d289` on PR #13, branch `hermes/3.3-request-boundary-fix1`, base main `6e840fd`. Standalone red commit `fc7bf6d` adds eight default-resolver regressions: all eight fail before the fix. Clean `git archive` export of the code commit used for full suite counts; no scratch test files in that export. |
| Host | Not exercised. CPython 3.14.7 at `/Users/robert/Developer/hackertube-3.3/.venv/bin/python`; Node v26.7.0. Earlier CLI refusal is historical, not a newly attempted install. The browser receipt runs Chromium against a local stub API, not a Hermes host. |
| Scope correction | The owner direction recorded by Eve on Kanban `t_7d655798` allows backend-only production accounting with artwork explicitly scoped. The Python ledger is not a browser interceptor. Earlier all-outbound wording at `078014f`/`4b4820b`, prior PR comments and historical commit messages was too broad; this is the correction of record. Four SDK fetch sites and one img-src emission site are now inventoried separately. |
| Scenarios | FEED04/PREF08 verified through real plugin routes and separate page/browser harnesses; not claimed as an installed-host end-to-end run. JOB02 is plugin-level load/display only: host install/load remains partial/not run. JOB04 is ledger-only accounting: an unknown cost stays null in the boundary ledger, and `GET /feed` carries the paid **count** only (`paid_calls`, `request_counts`) — neither `cost_usd` nor `unknown_cost_calls` reaches the page as a value. Rendered job-cost display remains unverified in task 4.x. |
| Procedure | Python dependencies: pytest 9.2.0, fastapi 0.162.0, httpx 0.28.1. `.venv/bin/python -m pytest tests --collect-only -q` then `.venv/bin/python -m pytest tests -q`; `PLAYWRIGHT_BROWSERS_PATH=$HOME/.hermes/tools node --test tests/test_dashboard_page.js tests/test_browser_requests.js`; `.venv/bin/python docs/receipts/requests/probe.py`; `.venv/bin/python docs/receipts/requests/bypass_probe.py`; `PLAYWRIGHT_BROWSERS_PATH=$HOME/.hermes/tools node docs/receipts/requests/browser_probe.js`. Pinned strict OpenSpec command is in the receipt notes. |
| Result | Python: 134 collected, 134 passed/0 failed, one Starlette/httpx deprecation warning. Node: 41 passed/0 failed/0 skipped. Strict OpenSpec: 1/0; coverage checker: 95 scenarios (structural only). Default-resolver and response reading now run within one counted scope, including DNS/transport failures; eight new offline regression cases pass. Real catalog/feed/profile/interests/save/dismiss/open/reopen routes record backend `{free:0,metered:0,paid:0}` with on-disk persistence. Browser receipt: 18 local API/assets requests, 9 free artwork attempts, 27 total, no outside-inventory/paid/metered requests. Show more adds one free artwork attempt, not an SDK request. All external image responses are fulfilled offline; no live delivery/redirect count is claimed. Unknown destinations fail the observer assertion, calibrated with a rendered unapproved image URL. Browser fixture uses stub API/in-memory state, while actual persisted state is checked separately in Python. Keyed YouTube read counts metered=1; unmetered source read free=1; paid unknown cost remains null in the ledger, while the real `GET /feed` route reports the count only and carries no cost field (all injected controls). No live DNS or real paid/metered call. |
| Artifacts | [docs/receipts/requests/](../../../docs/receipts/requests/): `notes.md` (scope and limitations), `dns-red.log`, `collect.log`, `pytest.log`, `node.log`, `report.json` (real routes), `browser-report.json` (raw Chromium events), `browser-probe.log` (generated phase counts), `boundary-red.log`, `openspec.log`. Browser attempt counts may vary by run; each event is reconciled with independent server/interception observations, not a fixed expected total. |

### Task 2.3 — source ingestion, status, and controls

| Field | Record |
|---|---|
| Date | 2026-11-06 |
| Plugin revision | Code commit `735cb76c51b4dfe02ab36da0d4304d9138c80a0e` adds `hackertube_core/sources.py`, the four adapter `fetch_search` functions, the profile source tables, the `/sources` routes, and `tests/test_sources.py`. |
| Host | None. The `hermes` CLI on this box still refuses to start (`run hermes pm repair`), so no host install/load or loopback browser walk was run. Counts come from CPython 3.13.13 in a scratch virtualenv. No host scheduler behavior is claimed. |
| Scenarios | PREF02, PREF03, PREF04, PREF14, and CAT05 pass at the package boundary. PREF09 through PREF12 stay unimplemented because Reddit is disabled. |
| Procedure | `/Users/robert/.hermes/cache/scratch/ht23-venv/bin/python -m pytest -q` from the worktree. Then one live ingestion pass over the four enabled sources with the default fetchers and a temporary profile database. |
| Result | 134 passed, 0 failed (118 before; 16 new tests). The live pass for `Austen` made 4 free reads and 0 paid calls, returned 49 items (20 books, 9 audiobooks, 20 podcast shows), and set `last_success_at` on Hacker News, Apple, Open Library, and LibriVox with no error. The pass for `jane austen` returned 39 items and also succeeded on all four. Reddit, YouTube, and Podcast Index were never fetched. The live pass found two defects the unit tests could not: the LibriVox path 404s with a trailing slash, and LibriVox answers 404 when an author search has no match. The path is now pinned by a test and the no-match 404 is recorded as an empty result, not a source error. |
| Artifacts | [tests/test_sources.py](../../../tests/test_sources.py), [docs/sources.md](../../../docs/sources.md) |

The page suite was also run: `node --test tests/test_dashboard_page.js` reported 35 pass and 1 fail. The failure is `Show more Enter focuses the fifth item heading`, which requires `esbuild` and `playwright` at `/tmp/hermes-src/hermes-v023/node_modules` and `/tmp/pw/node_modules`; neither exists on this box. No page JavaScript or template changed in this task, so that failure is an environment gap, not a regression from this change.

### Task 2.3 fix 1 — CAT05 ingest-path regression (#12)

Test commit `70a7e80e1f9b12e4e4e32e2701183f6c81fd0e16` adds
`tests/test_sources.py::test_cat05_ingest_merges_duplicate_identities_across_sources`.
Two deterministic source fetchers return the same work identity through the real
`ingest` function. The test asserts both sources succeeded, one item survives,
and both source evidence rows point at that item. No production behavior changed.

Verified on November 6, 2026 with CPython 3.13.13 at
`/Users/robert/.hermes/cache/scratch/ht23-venv/bin/python`:

- Collection: `-m pytest --collect-only -q` — 135 tests collected.
- Mutation: replaced the single production merge call inside `ingest`,
  `merged_items, merged_evidence = merge_duplicates(items, evidence)`, with
  `merged_items, merged_evidence = tuple(items), tuple(evidence)`.
  Full suite `-m pytest -q` returned **1 failed, 134 passed**. Only the new test
  failed, at `len(report["items"]) == 1` (actual: 2).
- Restored the merge call; full suite `-m pytest -q` returned **135 passed,
  0 failed**. The mutation is not committed.

Call-site audit found one production caller of `merge_duplicates` (`ingest`)
and one production caller of `ingest` (the dashboard refresh route). The test
covers the merge chokepoint without replacing it with a mock. Existing host/UI
limitations above remain unchanged; this test-only follow-up does not claim a
new host or browser integration check.

### Task 2.3 fix 2 — classification on the free source reads (#12)

The combined tree after merging #13 (`3e66d09`) into PR #12 failed 6 tests:
`read_json` became a required-keyword `classification` call, and the four
free source reads still omitted it, so each raised `TypeError`, which
`ingest` swallowed into a per-source error. Code commit
`175304d8f8b54c2e5f2e081aef56e11c155a6750` passes
`classification=outbound.FREE` in `hn`, `itunes`, `openlibrary`, and
`librivox`, passes it in the direct `read_json` call in
`tests/test_sources.py`, adds `metered: 0` to the three counter assertions
(#13 added `metered` to `outbound.counters()`), and re-raises `TypeError`
from `ingest` so a mis-wired call fails loudly instead of storing a
source-down status. Red test commit
`ccb029fc0cb4c15cb3eecd43ee3842f950fd43f8` adds
`tests/test_sources.py::test_ingest_surfaces_a_source_read_that_omits_its_classification`,
which drives a classification-less read through `ingest`.

Verified on November 6, 2026:

- Before the fix, on the merge commit `603849f`: `-m pytest -q` returned
  **6 failed, 140 passed, 1 skipped**; the red regression test failed with
  `Failed: DID NOT RAISE TypeError`.
- After the fix: `-m pytest -q` with CPython 3.13.13 (pytest 9.2.0,
  fastapi 0.162.0, httpx 0.28.1) returned **152 passed, 0 failed**. The one
  module-skip in the earlier count was `test_request_boundary_routes.py`
  importing `fastapi`; with fastapi installed the five route tests run.
- Node: `PLAYWRIGHT_BROWSERS_PATH=$HOME/.hermes/tools node --test
  tests/test_dashboard_page.js tests/test_browser_requests.js` returned
  **41 pass, 0 fail, 0 skipped**.
- Plugin: `hermes plugins validate .` and `hermes plugins doctor . --ci`
  from `hackertube/` both exit 0. Validate prints "Validation passed." The
  only doctor flag is `install out of sync (ffmpeg: not installed or
  outdated)` — a host install/dependency gap outside this job, reported,
  not fixed.

No production behavior changed beyond the four call labels and the
`TypeError` disposition. No owner decision was made or claimed.

### Task 2.4 — seeded catalog built through the ingestion path

| Field | Record |
|---|---|
| Date | 2026-11-07 |
| Plugin revision | `hackertube_core/demo_seed.py`, `hackertube_core/records.py` (`SourceRecord.refresh`), the seven adapter `POLICY` maps, `hackertube_core/sources.py`, `hackertube_core/seed/catalog.json`, `tests/test_seed.py`, `docs/seed.md`. |
| Host | None for the counts. Counts come from CPython 3.13.13 in `/Users/robert/.hermes/cache/scratch/ht24-venv`. The clean-profile probe ran on the Hermes venv (`/Users/robert/.hermes/hermes-agent/venv/bin/python3`, 3.11.16) with `HERMES_HOME=/Users/robert/.hermes/cache/scratch/ht24-profile`, so `plugin_db` is the real profile store. No host dashboard walk and no loopback browser run. |
| Scenarios | UI02, FEED01, CAT03, CAT04, CAT10, CAT11 pass against the seed. This task stays unchecked: YouTube oEmbed is `unresolved-terms`, so there is no displayable video card and the videos section is empty. |
| Procedure | `python -m pytest -q` from the worktree; `node --test tests/test_dashboard_page.js tests/test_browser_requests.js`; `hermes plugins validate .` and `hermes plugins doctor . --ci` from `hackertube/`; the clean-profile probe `/Users/robert/.hermes/cache/scratch/ht24_profile_probe.py`. |
| Result | Python 160 collected, 160 passed, 0 failed (pytest 9.2.0, fastapi 0.162.0, httpx 0.28.1; one Starlette/httpx deprecation warning). Node 41 passed, 0 failed. Build measured `{free: 6, paid: 0, metered: 0}`. Clean profile: `plugin_db` opened `plugin-data/hackertube/profile.db` (57344 bytes), the seed served Videos 0, Podcasts 4, Books 4, Audiobooks 4, and the ranked Austen feed returned 10 items with `paid_calls` 0. |
| Artifacts | [seed-pytest.log](../../../docs/receipts/catalog/seed-pytest.log), [seed-node.log](../../../docs/receipts/catalog/seed-node.log), [seed-validate.log](../../../docs/receipts/catalog/seed-validate.log), [seed-doctor.log](../../../docs/receipts/catalog/seed-doctor.log), [seed-profile.log](../../../docs/receipts/catalog/seed-profile.log), [seed_profile_probe.py](../../../docs/receipts/catalog/seed_profile_probe.py), [tests/test_seed.py](../../../tests/test_seed.py), [docs/seed.md](../../../docs/seed.md) |

The seed is now built from recorded reads replayed through
`hackertube_core.http.read_json` (#11) and merged by
`hackertube_core.sources.ingest` (#12). Every read crosses the outbound
boundary and is counted `free`; the builder opens no socket and imports no
socket client, so `tests/test_request_boundary.py` still passes. The frozen
records are byte-identical to the previous seed apart from one new field.

**Refresh and retention metadata.** Each source row gained a `refresh` field
carrying the refresh obligation its documented terms imply, beside the
existing `attribution`, `retention`, and `deletion`. No enabled seeded source
states a maximum retention or refresh period, so `refresh_after` stays null on
every source and evidence row; this is recorded per source in `docs/seed.md`
rather than invented. The one stated window is YouTube's 30 calendar days for
non-authorized Data API data; YouTube is disabled and stores no record, and its
rule stays in `youtube.py` (`plus_days(retrieved_at, 30)`) for a later
enablement. Widening the source vocabulary made every live source row carry
`refresh`; no enum of values exists to widen, so no negative case applies. A
`SourceRecord` built without `refresh` is a `RecordError`, pinned by
`tests/test_records.py::test_source_record_requires_a_reason_when_disabled`.

**Failure paths (clean profile).** A malformed seed record
(`items[0].format = "hn"`) is refused with `RecordError("format")` by
`load_catalog`, so the route cannot serve it. A seed source that is down
(`read_json` raising `HttpError("http 500")` for the Apple host) makes the
build refuse to freeze an incomplete seed (`RecordError("empty")`) instead of
shipping a truncated catalog; the read was still counted (`free: 2`). Inside
one ingestion pass the same down source records `last_error` `http 500`, keeps
its earlier `last_success_at`, and the other two sources succeed.

**Exact scope.** `git diff --stat c1235d1 HEAD` (base main, PR #12) reports 25
files: 11 under `hackertube_core/` (the seven adapters, `demo_seed.py`,
`records.py`, `sources.py`, `seed/catalog.json`), 2 under `tests/`, 9 under
`docs/` (six receipts, `seed.md`, `sources.md`, `feasibility-sources.md`), 2
under `openspec/changes/hackertube-v1/`, and `README.md`. No file outside
those paths. No UI copy, template, or page JavaScript changed
(`hackertube/dashboard/dist/index.js` is untouched). No search, model-key, or
4.x work. No owner decision was claimed.

### Tasks 4.1 and 4.2 — the explicit demo Search

| Field | Record |
|---|---|
| Date | 2026-11-07 |
| Plugin revision | `hackertube_core/search.py` (new), `hackertube_core/profile.py` (`search_job` table, `record_job`/`latest_job`), `hackertube_core/http.py` (`post_json` through the same boundary), `hackertube_core/boundaries.py` (`matches_terms`), `hackertube/dashboard/plugin_api.py` (`GET /search`, `POST /search`, `provider` in `/status`), `hackertube/plugin.yaml` (`provider`, `model_endpoint`), `hackertube/dashboard/dist/index.js` and `style.css`, `tests/test_search.py`, `tests/test_search_routes.py`, `tests/test_dashboard_page.js`, `tests/browser_net_harness.js`, `tests/route_harness.py`. |
| Host | None for the suite counts. Counts come from CPython 3.13.13 in `/Users/robert/.hermes/cache/scratch/ht41-venv` (pytest 9.2.0, fastapi 0.162.1, httpx 0.28.1) and Node v26.7.0. The clean-profile probe ran on the Hermes venv (`/Users/robert/.hermes/hermes-agent/venv/bin/python3`) with `HERMES_HOME=/Users/robert/.hermes/cache/scratch/ht41-profile-a` and the plugin enabled there by `hermes plugins enable hackertube`, so `plugin_db` is the real profile store. |
| Scenarios | JOB01, JOB02, JOB03, JOB04, JOB09, JOB10, SEARCH01, SEARCH03, SEARCH04, SEARCH05, SEARCH07, SEARCH08, and SEARCH09 pass at the plugin and page boundaries. JOB05-JOB08 (task 6.2), SEARCH02/06/12 (post-demo), SEARCH10/SEARCH11 (task 6.3), and HCKT20 were not run. |
| Procedure | `python -m pytest tests --collect-only -q`; `python -m pytest tests -q`; `node --test tests/test_dashboard_page.js tests/test_browser_requests.js`; the mutation probe (five production mutations, each restored); `hermes plugins validate .`; `hermes plugins doctor . --ci`; `HERMES_HOME=<disposable> <hermes venv>/bin/python3 docs/receipts/search/search_profile_probe.py`; the pinned strict OpenSpec and coverage commands. |
| Result | Python 201 collected, 201 passed, 0 failed (one Starlette/httpx deprecation warning). Node 57 passed, 0 failed. Plugin checks both exit 0 with no warnings. Clean profile: plugin enabled, `plugin_db` at `/Users/robert/.hermes/hermes-agent/plugins/plugin_storage.py`, data root `plugin-data/hackertube`; with the default `live` provider and no key, `POST /search` returned 503 with the clear message, wrote no job, and the outbound ledger stayed `{free:0, paid:0, metered:0}`; with `provider: stub`, one Submit returned 200 with a `succeeded` job of 10 verified results (podcasts 2, books 4, audiobooks 4) labelled Apple Podcasts, Open Library, and LibriVox, cost `unknown`, and the row was read back from the profile database; the stub's timeout and error paths both recorded `failed` with the reason and no results; ordinary reads made no request and created no job. `HACKERTUBE_MODEL_KEY` was never set (`secret_never_set: true`). Strict OpenSpec: 1/0; coverage checker: 95 scenarios (structural only). `git diff --check` exits 0. |
| Artifacts | [docs/receipts/search/](../../../docs/receipts/search/): `notes.md` (scope and limitations), `search_profile_probe.py`, `collect.log`, `pytest.log`, `node.log`, `mutation.log`, `validate.log`, `doctor.log`, `profile.log`. |

**Red before green.** Each mutation breaks one production line and the named
tests fail; the file is restored from its saved text after every check and
the probe asserts the restore (`mutation.log`):

| Mutation | Failing tests |
|---|---|
| The disclosure gate removed from `run_search` | `test_job09_...`, `test_job10_...`, `test_job09_the_route_refuses_a_submit_without_the_disclosure` |
| A missing model key no longer refuses | `test_a_missing_model_key_refuses_before_any_outbound_call`, `test_acceptance1_a_keyless_live_provider_fails_closed_with_no_outbound_call` |
| An unknown cost reported as zero | `test_job04_a_provider_that_reports_no_cost_is_unknown_never_zero`, `test_a_paid_call_with_no_reported_cost_stays_unknown_in_the_job`, `test_job04_the_route_reports_an_unknown_cost_and_the_page_renders_it` |
| An unverified constraint treated as strict | `test_search04_unknown_duration_under_a_limit_is_unverified_and_not_strict` |
| The page rendering an unknown cost as `$0.0000` | `the rendered job cost is unknown, never zero` (node) |

**What this does not prove.** No live model or paid-search call was made and
no key was set. The live provider's successful path is unproven; only its
fail-closed refusal and its single paid request through `outbound.dispatch`
with an injected offline opener are shown. "Verified" means admitted by the
retrieved-record check, not judged relevant by a model, and no relevance
number is claimed. The browser counts in `node.log` come from the stub local
API with offline artwork, as the task 3.3 receipt records. Installing the
plugin from GitHub into the pinned host is task 5.2, not this task. No owner
decision was claimed beyond what the decisions already recorded: the
existing `docs/feasibility.md` chosen path (the plugin-owned key) and the
card's stub-provider approval.

### Review fix 1 — "Back to discovery" closes the Search results

| Field | Record |
|---|---|
| Date | 2026-11-07 |
| Finding | Picasso's blocking UX finding on PR #15: after a Search finished, "Back to discovery" left the results panel on screen with an empty `Question:` line. The panel renders while `searchBusy || searchError || searchResult`, but `backToDiscovery` cleared only `submitted`. |
| Fix | `hackertube/dashboard/dist/index.js`: `backToDiscovery` now clears `searchResult` and `searchError` and resets `searchStatus` to `idle`. The typed question (`question`), the feed, and the saves are untouched; focus still returns to the search input. No other behaviour, copy, heading, or a11y change. |
| Scope | The results panel is the single view that derives from the search result state; `backToDiscovery` is the only control that clears it. `closeSearch` (Escape, "Close search") collapses the form and is out of scope for this fix, as the card states. |
| Procedure | `python -m pytest tests -q`; `node --test tests/test_dashboard_page.js tests/test_browser_requests.js`; `hermes plugins validate .`; `hermes plugins doctor . --ci`; the clean-profile probe on a fresh `HERMES_HOME`; the pinned strict OpenSpec and coverage commands. |
| Result | Python 201 collected, 201 passed, 0 failed. Node 59 passed, 0 failed (57 before, plus the two new regressions). Plugin checks both exit 0 with no warnings. Fresh clean profile: default `live` with no key → `POST /search` 503 `provider_unavailable`, no job, ledger `{free:0, paid:0, metered:0}`, `secret_never_set: true`; `provider: stub` → 200, `succeeded` job of 10 verified results; stub timeout and error both `failed`. Strict OpenSpec 1/0; coverage checker PASS; `git diff --check` exit 0. |
| Red before green | The two new node regressions (`Back to discovery closes a completed Search and keeps the typed question`, `Back to discovery closes a failed Search`) fail 0 passed / 2 failed against the unfixed page (the results panel is still present with an empty `Question:` line) and pass after the fix. |
| Artifacts | the PR body and the card comment on Kanban `t_c3640e90`. |

**What this does not prove.** The fix is a page-state change; it was exercised
in the node page harness (stub provider, no live call) and by the clean-profile
probe. No live model or search call was made.

## November 8 — tasks 7.1–7.3: self-contained package and real search

This section supersedes the earlier plugin-owned model-key/stub-only receipts for the real-search path. Baseline `fa692729cbf4ed26743f163dceeb6c12f9ae1e7a`; runtime files are pinned by the commit containing this record and `docs/receipts/live-search/runtime-manifest.json`. Host actually exercised: `Hermes Agent v0.23.0+1212.g719240d`, upstream `64547a94`, local `719240dc`, Python 3.14.9. The `v0.23.0` source contains the required registration and model-selection interfaces; this task did not repeat an end-to-end run on that older tag.

| Task / scenarios | Procedure and observed result | Disposition |
|---|---|---|
| 7.1; UI01, LIB02 | Copy only `hackertube/` into a disposable home; actual Hermes loader registers `hackertube_search`; real plugin router serves 12 seed items and reports `provider_available: true`; real `plugin_db` creates profile-local state. Separate `python -I -S` import test excludes editable/development/site-package fallback. | Pass for isolated payload, native registration, router, and storage. Authenticated browser install/reload release check remains separate. |
| 7.2; SEARCH01, PREF05, JOB01 | Native `ctx.llm.complete_structured(task='hackertube_search')`; public host model-assignment routes; picker test writes only that auxiliary slot. Existing-host inventory supplied 11 configured providers / 325 models without returning secrets in the receipt. Payload tests contain only the question and bounded candidate metadata; no memory request. | Pass for implemented paths. Running user provider configuration was not modified. |
| 7.3; SEARCH01/03/04/05/07/08/09, CAT01/03/08, LIB01/02/03, JOB03/04 | Source fixtures and real routes verify identities absent from the seed, model-ranked IDs only, format-before-cap, unknown duration, per-source failure/budget notes, new-item Save/Open, restart persistence, and non-blocking feed reads. | Pass for these measured paths. Web-media admission is deliberately limited to documented URL shapes; this is not whole-web media normalization. |
| Live model/source integration | One explicit question, “Find beginner books about vegetable gardening,” through the existing OpenRouter `deepseek/deepseek-v4.1-flash` route returned 3 fresh Open Library book identities in 10.082 s. Counts: 2 free source reads + 2 model invocations + 1 Hermes web-search invocation; total 5 of 12 logical dispatches, 3 of 24 result slots. Provider/search cost unknown. Web returned no admitted media record in this sample. | Pass for this question, not a relevance evaluation. Invocation counts do not independently count retries/fallback inside Hermes. |
| Whole Python suite | 222 collected; 222 passed, 0 failed; one Starlette/httpx deprecation warning. | Pass; warning retained. |
| JavaScript/browser suites | 66 passed, 0 failed, 0 skipped with repository-local locked development dependencies. New tests drive model/source controls and Save/Open handlers for a newly retrieved identity. Browser resource checks continue to use stub API and offline artwork. | Pass within harness scope; not claimed as an installed-host browser walkthrough. |
| Source/credential scope | YouTube Data API and signed Podcast Index paths have offline key/header/typed-record checks and require explicit enablement. Source secrets use only declared Hermes secret scope. Reddit makes no request. | Live keyed checks / source release obligations remain open in 7.4 and 1.3. |
| Plugin validation | `hermes plugins validate "$PWD/hackertube" --install-deps`: exit 0, no warnings, including no private-core-import warning. | Pass on exercised host. |
| Planning integrity | Strict OpenSpec: 1 passed, 0 failed; traceability: 32 IDs / 95 scenarios; fixture checks: 14 invalid rejected, 1 valid accepted. | Pass for structure, not runtime quality. |

The initial six regressions were committed in `377c901` before implementation. The local host exposed a `/var` versus `/private/var` alias mismatch; the failing canonical-profile regression is in `98292cd`, and the corrected clean-profile run reports the service available. A malformed community payload regression was committed in `5df0edd` before guarding that path. Full red and green logs are in `docs/receipts/live-search/`.

Scope enumeration: 15 active Python path/allowlist references were audited before moving core; both import entry points now resolve inside the plugin. Six production catalog consumers use the shared stored-catalog loader (search binding, catalog, feed, profile mutations, refresh's input, and the returned search catalog). One native model call site covers interpretation/ranking; one native web-tool call site handles configured Hermes search; seven source-read sites use the bounded counted transport. Historical receipts retain their original revision's layout. Development-only dependency declarations, installation docs, specs, tasks, and these receipts move with the code; the seed data and unrelated host code were not changed.

The user allowed experimentation with the local instance. The live probe registered the candidate only in its own process and stored results in a temporary database. No plugin was installed/enabled in the running user profile, no gateway was restarted, and no model/source credentials or provider choices were copied or rewritten. It used a real host-owned paid-capable model/search route once for this bounded functional check. No recurring follow-up or paid job was created.

## PR #16 review follow-up — exact head dca17be

Reviewed `dca17be7f0a6a77759397ffcbc61d0de7cbf684d` against base `fa692729cbf4ed26743f163dceeb6c12f9ae1e7a`, then fixed six confirmed findings. The complete review, severity, original-head locations, caller/resource enumeration, reproduction procedure, and remaining release limits are in `docs/pr16-review.md`.

- Scenarios: CAT01/CAT02/CAT10 and LIB02 for expiry/visible saved state; SEARCH01 and PREF02/PREF04 for configuration write ordering; JOB03/JOB04/JOB07 for per-job usage, unknown failed-call cost, source failure versus budget state, and valid partial source results.
- A clean archive of the exact reviewed head with only regression tests overlaid produced 6 Python failures and 3 UI failures. Runtime import isolation was explicitly checked. Red tests were committed in `7de26bd` and `7355f9f` before fixes.
- Deterministically overlapping jobs: incorrect count 5/5 baseline reproductions, corrected count 5/5 runs. Each job reports 1 paid invocation; the process reports 2. Failed web cost remains unknown, not the 0.03 sum of model costs. Apple retains 1 completed record in each HTTP/malformed/limit regression. Expired metadata is removed from disk while saved flags remain true.
- Updated suite: 230 Python tests passed, 0 failed; 71 JavaScript/browser tests passed, 0 failed, 0 skipped. Strict OpenSpec 1/0; traceability fixtures 14 invalid rejected and 1 valid accepted; Hermes plugin validation exit 0 with no warnings. One existing Starlette/httpx deprecation warning remains.
- Code is identified by the commit containing this follow-up and the new `docs/receipts/pr16-review/runtime-manifest.json`. Full logs are in that same receipts directory. Original live-search receipts remain pinned historical evidence for their original revision.

No new paid-provider run was needed; provider/auth/source API contracts are unchanged. Keyed-source live checks, installed-host browser validation, cancellation/restart recovery, and wider release work retain their prior disposition. The PR remains unmerged.

## Installed-host live walkthrough — November 8

Task 7.5: **pass** for installed navigation, configured-provider selection, real Search, Save, source launch, and saved/opened persistence across an actual dashboard restart. Host `v0.23.0+1212.g719240d`, Python 3.14.9. Code is pinned by the commit containing this record and `docs/receipts/installed-live/runtime-manifest.json` (**34/34 installed files match**). Full procedure, failure diagnosis, red/green tests, configuration boundaries, and snapshots: `docs/receipts/installed-live/README.md`.

The installed test exposed two defects: cold dashboards lacked the registered web-search tool, and the reasoning model exhausted the 2,500-token ranking cap. Public host tool discovery and an 8,000-token ranking allowance corrected them; no retry/fallback was added. One native tool dispatch and one structured-completion call site cover the changes. Red tests precede fixes in `e10dc00` and `7e76c88`.

The final search produced **3 verified new books**, job `succeeded`, **5 requests used / 12 allowed**, unknown cost, and the same 45-second / 24-result bounds. The first item was saved/opened; after dashboard restart its state remained and job count stayed **5 before / 5 after**. Four diagnostic failures remain honestly recorded. Open Library's human-verification page stopped external content inspection; source launch itself worked. The main model and other auxiliary settings are unchanged; the new dedicated search assignment remains selected. No source credentials were added.

Checks: **232 Python passed / 0 failed**, **71 JavaScript passed / 0 failed / 0 skipped**, plugin validation without warnings, strict specs and coverage fixtures. Scenarios exercised: UI01, SEARCH01, PREF05, LIB01/02/03, JOB03/04; UI04 verified through destination launch only. The successful run contained no temporary instrumentation. Keyed-source checks and the remaining release tasks stay open; the installed plugin remains enabled and the PR unmerged.

## AI category and qualifiers — November 8

Installed runtime `1624f417cea084dbf0f44d85ba99c3d244158da9`, unchanged existing provider and sources. Three explicit live questions each used **9/12 logical requests**; costs unknown. Broad AI: **0 videos / 7 podcasts / 7 books / 10 audiobooks**. Strict nontechnical/exclusion request: **0/0/0/0**, though job state was `succeeded`. Soft “rank accessible introductions first”: **0/9/5/10**, with introductory candidates ahead of specialist material. Evidence and follow-up findings are in `docs/receipts/installed-live/ai-search-evaluation.md`.

Disposition: SEARCH01 works for the three available non-video formats; qualifier robustness needs investigation, not a blanket pass. YouTube remains unavailable without `YOUTUBE_API_KEY`; the fourth format is not verified. The long-input boundary's terse `question` error and confusing Apple audiobook source labels are recorded for follow-up. No implementation or credential changes were made in this comparison; no new code test run was necessary. Automation wait timeouts did not establish a backend deadline violation; latency is unmeasured.

## YouTube-enabled four-format check — November 8

Task 7.4 is **partial**, not complete: the user supplied a YouTube key through Hermes Keys, and explicitly enabled source testing. The actual installed Data API search/metadata path passed; source status has a successful attempt and no error, with eight normalized YouTube records and eight expiry timestamps stored. Final query returned **5 videos / 6 podcasts / 1 book / 12 audiobooks**, job `succeeded`, **11/12 requests**, unknown cost. Remaining missing-source notices are Podcast Index credentials and Reddit approval.

Two earlier attempts failed ranking. Stage-only diagnostics showed **57 candidates**, `finish_reason=length`, zero final text, and no parsed JSON under the previous 8,000-token completion cap. A corrected red regression was committed in `b71e99d` before raising ranking's bounded completion allowance to 16,000 and requesting a concise list of at most 24 useful matches. Interpretation remains 2,500 tokens, input remains at most 60 candidates, and job request/result/time limits are unchanged. Scope audit: one structured-completion call site and one ranking prompt; no provider switch, host changes, automatic retry, or recall-reducing candidate cut. No diagnostic instrumentation was present in the successful run.

Scenarios: SEARCH01 and CAT01/03/08 pass for the exercised four-format path; JOB03/04 remain bounded with unknown cost reported honestly. Relevance is mixed: the single book is historical, several podcasts are news, and some videos are very short. This is not a broad relevance evaluation or a pass for every model. Task 7.4 stays unchecked for Podcast Index and remaining source obligations.

Checks: **233 Python passed / 0 failed**, **71 JavaScript passed / 0 failed / 0 skipped**, plugin validation without warnings, lint and strict specification/traceability checks. Code is pinned by the commit containing this section and `docs/receipts/installed-live/youtube-runtime-manifest.json` (**34/34 installed runtime files match**). Full report, observed source state, failures, red/green logs, and screenshot: `docs/receipts/installed-live/ai-search-evaluation.md#youtube-enabled-follow-up`. The key was never inspected or copied by the agent.

## Category relevance and ranking follow-up — PR #17

PR #16 merged at reviewed head `076495c083cbab8c753e0a1cabbf677497d9c359`, squash commit `206084688822a21847f989cd959d99f93cfa48cc`. The follow-up branch starts from that merge. Tasks 8.1–8.3 pass offline; 8.4 passes the bounded installed-live checks recorded below.

The baseline regression run reproduced **16 failures / 1 passing control** before implementation (`0a7420e`). A further uneven-result-limit test reproduced category starvation (`52325fe`), and a rendered UI test reproduced missing subject/inference labels (`662641b`), each before its fix. The updated suite passes **251 Python / 0 failures**, **72 JavaScript / 0 failures / 0 skips**, strict OpenSpec, 14 invalid coverage fixtures plus one valid mixed fixture, lint, and Hermes plugin validation without warnings. One existing Starlette/httpx deprecation warning remains. Six existing valid model-response fixtures were migrated to include the new required fit field, retaining all their assertions.

Scope: one interpretation decoder and native interpretation prompt; one shared source-query assignment for all adapters/web; one ranking caller and validator; one shared final result selector; one UI result renderer and one job summary. Four categories share candidate/result allocation, with the two podcast record types interleaved inside one category. No new dependency or outbound call site was introduced; model/source budgets are unchanged. Relevance is model-inferred, while identity/provenance stays source-backed.

Full policy, checks, remaining quality risks, runtime pin, and installed-live disposition: `docs/receipts/results-tuning/README.md`. This does not close source credential/release obligations, cancellation/restart recovery, or the broad relevance evaluation.

### PR #17 installed checks and review

Runtime `d3e115eb9ac96e3623b48bf582e93fbc7357df9d`; **34/34 installed files** match the new runtime manifest. Host v0.23.0+1212.g719240d, Python 3.14.9, same configured OpenRouter model and source settings. The actual dashboard showed the new subject/level and model-inference labels. Strict AI request: **2 videos / 2 podcasts / 1 book / 5 audiobooks**. Broad accessible-introduction request: **3/4/2/6**. Both succeeded at **11/12 logical requests**, unknown cost; **4/4 categories** nonempty and **0/4** over the six-item category allowance. Saved state, interests, open events, and source settings are unchanged after the two searches.

The earlier visible news-only entries, tiny clips, and historical computing book were absent. These are metadata-based observations rather than independent full-content judgments; one broad audiobook explanation remains hedged despite its direct-fit label. Live results are not frozen, and the earlier strict baseline lacked YouTube, so these are functional reruns rather than causal A/B scores. The broader relevance evaluation stays open.

Codex re-read the implemented runtime against the merge base after the checks, including partial-validation handling, subject fallback, source-backed identity, category shares after eligibility, uneven caps, and the two podcast record types. No further implementation finding was identified. Full receipts and limits are in `docs/receipts/results-tuning/README.md`; final head is re-read after push. PR #17 remains unmerged.

## PR #17 exact-head review corrections

Reviewed `e26104cbd9c9a2b84d25272709f2ff6eabcb2c1c` against base `206084688822a21847f989cd959d99f93cfa48cc`. Two P2 findings were reproduced and corrected: conflicting validated fit labels could still promote an ambiguous identity, and the duration caption claimed no constraints were applied despite audience/exclusion preferences. Scope, original locations, exact-head proof, and remaining limits: `docs/pr17-review.md`.

The isolated exact-head archive with regression tests only reproduces **6 Python failures / 3 passing duplicate controls** and **1 UI failure**, with import isolation verified after canonicalizing macOS path aliases. Red tests precede runtime fixes. Fixed cases admit **0/4** conflicting identities versus **4/4** before; the **3/3** consistent-duplicate controls remain passing. Two full-job tests retain only unambiguous matches with partial status and exactly two model invocations, without retry.

Checks: **260 Python passed / 0 failed**, **73 JavaScript/browser passed / 0 failed / 0 skipped**, strict OpenSpec **1/0**, coverage **32 IDs / 95 scenarios**, fixtures **14 invalid rejected / 1 valid accepted**, lint, and Hermes plugin validation without warnings. Existing Starlette/httpx warning remains. Two installed runtime files were updated after verifying the original 34-file manifest; **34/34** now match `docs/receipts/pr17-review/runtime-manifest.json`, and dashboard reload responds HTTP **200**. No settings, credentials, or paid live calls were changed/started.

The fixes exercise SEARCH01's direct-fit semantics and summary accuracy plus JOB07's partial-result retention. Tasks 8.2/8.3 remain checked with these stronger cases. Earlier live receipts remain pinned to their original runtime. The PR stays unmerged; broader relevance and release/source obligations remain open.

## Release measurements

All values are unmeasured. Freeze the post-demo evaluation workload, rubric, source snapshots, provider configuration, and request limits before collecting results. Use PRD section 9 for proposed targets and report adjustments explicitly. The demo video length is measured under task 4.3, not inferred from the six-step outline.

## Original readiness constraints and installed demo rehearsal

Receipt: `docs/receipts/demo-rehearsal/README.md`. Four original constraint regressions pass; an isolated native loader/router probe loads the self-contained 12-item package, and a separate actual clean-profile dashboard renders the unchanged seed. Format filtering precedes result caps and remaining time reaches host operations. A DeepSeek ranking call nevertheless stalled beyond the work budget: hard wall-clock cancellation and interrupted-job recovery remain unfinished task 6.2, not a newly claimed pass for JOB05/06.

Installed job:14 returned no parsed interpretation at the old 2,500-token allowance. The red native-facade regression was committed in `28f7e54`; the single structured-completion site now allows 8,000 interpretation / 16,000 ranking tokens, with no retry, credential, or host changes. A second red UI regression in `afa5349` precedes changing the one limits-line helper to disclose a work budget and in-flight overrun instead of advertising cancellation. Root-cause confidence and the stopped live attempt are explicitly qualified in the receipt.

After explicitly selecting the already configured OpenRouter `openai/gpt-5.4-mini` route in the UI, installed job:16 succeeded with **4 videos / 3 podcasts / 2 books / 4 audiobooks**, **11 logical dispatches**, unknown cost, and about **8.1 seconds** from visible launch to results. The actual six-step video is **36.25 seconds (<90)**. Save/Open reached the rendered matching Apple Podcasts page; About/README/listing credit Karpathy. Two previously saved items survived a dashboard restart; the final take added one new save. HCKT10 passes; HCKT11 copy is prepared, not posted. No broad relevance target or hard-timeout guarantee is claimed.

Full suites: **261 Python / 0 failures** (one existing Starlette/httpx deprecation warning), **73 JavaScript / 0 failures / 0 skips**; native plugin validation, strict specs, traceability, coverage fixtures, and changed-Python fatal lint pass. A broader style-lint attempt found **66 baseline findings at both reviewed head and candidate**; they are recorded separately, not repaired in this task. Runtime hashes and exact candidate checks accompany the receipt. Public clone, source obligations, eligibility/IP answers, and external publication/form URLs remain open; tasks 4.4/4.5/5.1/5.3 are not marked complete.

## PR #18 exact-head review

Codex reviewed immutable head `ba1fd3d70b5c464a764bd7bf882babc77b722654` against base `fb34c2237ff5f26fdcc97a959a6f9889e47052c2`. Standards: zero actionable findings. Specification: one P2 finding fixed — the budget/cancellation limitation was visible only after a host call returned. A stalled request could therefore never show it. The Hermes Search panel now shows the shared note before submission and while pending; both search controls reference it through ARIA. The offline stub retains its prior description without a nonexistent note reference.

The new tests were committed before the fix in `e2986a7`. Overlaying the corrected regression file on the exact reviewed archive reproduces **2 failures / 1 passing stub control**; the fix gives **3 passed / 0 failed**. The clean original archive passes **261 Python / 73 JavaScript** tests; the revised working tree passes **76 JavaScript / 0 failures / 0 skips** and strict OpenSpec. One warning literal, one terminal helper/caller, one Search panel, and both control-description sites were enumerated. Final immutable-build validation and installed hashes accompany `docs/pr18-review.md` and `docs/receipts/pr18-review/verification.json`. This review makes no paid provider call and does not claim hard cancellation, a new live-search measurement, or cleared release gates.

PR #18 fixed-build check: immutable commit `026b3d7b6ad2060490ce31929b2c3e9779684ef9` passes **261/261 Python**, **76/76 JavaScript**, strict OpenSpec, coverage fixtures (**14 invalid / 1 valid**), and native validation. Installed payload: **35/35 files match**. The real installed panel and both ARIA descriptions were checked before dispatch without a paid call. The new pre-submit screenshot and detailed exact-head red/green proof are in `docs/receipts/pr18-review/`; the catalog draft pins this fixed build. Hard cancellation and release gates remain open.

Final PR #18 code/test revision `b1a7bb839f53abf0ff55d2d442e89cebc85c0897` adds the existing pending-close guard control: **261 Python / 77 JavaScript passed**, **4 focused cases passed**, no failures or skips. Its plugin payload is unchanged from the natively validated `026b3d7` pin. The earlier 76-test result refers to that earlier fixed archive; the final suite count is 77.

## Hard Search deadlines and cancellation follow-up

PR17 merged as `60d07ae869cb6c215536fec97a0993ae0b0e9361`; PR18 merged as `cec15fee4419424b18412da8f77754660e0b94ed`. Its integration head `c52fd2a` has the exact reviewed `2532a13` tree; resolving the squash-parent overlaps introduced no source change. The follow-up branch starts at that merged main.

The prior in-process provider could outlive a forwarded timeout. Supervised Search now persists a running job, launches a private process group, and enforces an absolute deadline from before launch. A separate watchdog created before Hermes bootstrap kills the group on expiry or parent EOF, including blocked native code; the monitor also stops/reaps before confirming a terminal state. The worker uses documented native CLI registration and the existing native model/tool/secret facades, with no private loader or direct credential read. Questions travel through a private pipe, not argv/environment. No agent turn or YOLO flags are used. macOS/Linux are required; macOS is the verified platform.

New tests were committed before the implementation. The real-process tests observe socket EOF, descendant cleanup, manual cancellation, parent death, durable terminal results, failed-worker refusal, one-profile exclusivity, profile-context propagation, random cross-profile handles, unload cleanup, and independent watchdog cancellation when the parent's signal fails. The actual HTTPS boundary is exercised with injected blocking DNS/response seams. The real routes test background and synchronous real-provider API paths; UI tests cover early Cancel, busy/stale guards, and status recovery without a second paid start.

Working-tree checks: **279 Python passed / 0 failed**, **80 JavaScript passed / 0 failed / 0 skipped**; one existing Starlette/httpx deprecation warning. Strict OpenSpec and fatal Python lint pass. A native Hermes CLI/model-facade probe used a disposable profile and a stalled local OpenAI-shaped endpoint: **6.017 seconds** at a six-second deadline, socket EOF observed; manual Cancel confirmed in **0.038 seconds**, socket EOF observed. No live vendor key was needed. Final immutable-build and installed-live receipts are recorded in `docs/receipts/hard-timeouts/` before task 10.5 is closed.

Scope: one real Search HTTP dispatch path plus supervised dashboard stub execution; one native model service (interpret/rank), one web-tool service, and one shared source budget/HTTP boundary all execute inside the same killable group. The direct deterministic offline API compatibility path remains unchanged. Two search-control ARIA descriptions share the updated stop/billing disclosure. Per-job usage is authoritative; process totals are worker-local. Cached source metadata and saved state are not rolled back by cancellation. A remote service may still process/bill a request it accepted. Wider refinement, lifecycle, source-term and publication gates remain open; prior demo/catalog pins remain historical.

Final immutable implementation `3f649962d4f98091110c1efebb5a27c3c4fb5ab9`: **279/279 Python**, **80 JavaScript / 0 failures / 0 skips**, strict OpenSpec, traceability, coverage fixtures (14 invalid / 1 valid), fatal lint and native admission pass with **0 plugin warnings**. One existing Python deprecation warning remains. Exact native probe: six-second deadline at **6.015 seconds (<7)**, in-flight Cancel **0.039 seconds (<1)**, both socket EOF. These supersede working measurements above.

Installed default profile: **37/37 payload files match**. Two live searches succeeded at **11 requests each**, all four types nonempty; a third was cancelled before provider dispatch (**0 requests**). Cancel on the second lost the race to completion and is not a cancellation pass. Native local-provider evidence establishes in-flight termination separately. Saved items **3 before / 3 after**; interests, open history and sources unchanged. Task 10.5 is complete for this scoped candidate. Full evidence/review: `docs/receipts/hard-timeouts/README.md`. macOS verified; Linux integration unrun; remote work/billing is outside local cancellation guarantees. Later receipt-only commits leave runtime/tests unchanged.

## PR #19 exact-head review corrections

Reviewed remote head `d652e9431e6ab28bac6565af7ed4ea7961adb213` against main `cec15fee4419424b18412da8f77754660e0b94ed`. Two P2 specification findings: terminal cleanup could erase persisted usage when killed before pipe notification (and delayed notifications could regress newer progress); a cached observer could leave another dead owner's job running forever, including after provider availability/selection changed. No separate actionable standards finding.

Regressions were committed before runtime changes. Six original cases fail on an immutable export of the exact head with tests overlaid. The original four-case deterministic schedule fails in all five runs (20/20 case executions). Two additional provider-state cases fail before their route correction. Working focused tests pass; final immutable-build validation follows in `docs/receipts/pr19-review/` before task 10.6 is checked. No live vendor request is required by this review.

Fixed immutable implementation `d13cea59ca84b7c35e24ad74c04edf41e6773b56`: **287/287 Python**, **80 browser / 0 failures / 0 skips**, **26 focused process/route cases**. The eight new cases reproduce on the original exact-head archive in three full runs, each **8 failed / 279 passed** (24/24 regression case executions failed before the fix). Strict specs, traceability, fixtures, fatal lint and native plugin validation pass with **0 plugin warnings**. Native stalled-provider deadline **6.015s (<7)** and Cancel **0.043s (<1)** both close the socket and retain one request. Installed **37/37 files match**; saved items **3 unchanged**, zero live vendor queries. Dashboard restarted; unauthenticated API returns401, authenticated UI not rerun. Full review/limits: `docs/receipts/pr19-review/README.md`. Task 10.6 is complete; prior query/UI receipts remain historical.

## Pre-public audit and source corrections

The audit starts from main 7e1e8f9 and materials head b29b20c. All branch/tag and PR head refs were fetched. Gitleaks alerts are independently verified SHA-256 file manifests, not credentials. GitHub bodies/comments and 140 historical image blobs (OCR) are included; no credential values are published. Robert confirms solo entry and MIT authority, with no known code copied from Karpathy. Full scope/limits and remaining source gates are in docs/pre-public-release.md and docs/source-release.md.

Red regressions precede fixes for three expired-data access routes, backend/UI Apple Books labels, copied-data age, source controls and future credential-file staging. Initial fixture-only failures are retained outside Git and are not described as product findings. Final exact-build evidence follows before 12.3 closes.

Final source implementation `abfebee24d86bcf8b3e08a15acd4eb3376b1c6ad` passes **300/300 Python**, **81/81 browser**, strict specs/coverage/fatal lint and native admission (**0 warnings**). Actual native six-second deadline **6.016s (<7)**, Cancel **0.032s (<1)**: sockets closed and request counts retained. Private installed candidate **37/37 files**, Apple Books caption verified, **4 saved items unchanged**. One user-authorized identified Open Library lookup succeeded; contact value stays out of Git. No paid/live model search. Task 12.3 complete for the fixes, not HCKT18 overall.

Sanitized secret audit: **0 confirmed credentials / 0 untriaged**, 12 independently recomputed manifest-hash false positives, 141 screenshot OCR inputs, all fetched PR/branch/tag history/reflogs plus enumerated GitHub text and unreachable local blobs. Full limits/scope/source holds: docs/receipts/pre-public/README.md. Robert confirms solo/MIT/idea-only Karpathy inspiration. Repository remains private; privacy-consent/source acceptance and public-dependent submission actions stay open.

## Privacy and source lifecycle candidate (November 8)

PR #21 was reviewed at f8ef95339c7bae58f9ca1870a70bd7dd78391f30, its 13 regressions passed, and it was explicitly authorized and squash merged as c96b86d2ea25a044e0c68eaec7ea4061d8593fc0. The next candidate starts there. Four reproducing privacy/deletion/invalidation regressions were committed red in 1997000 before implementation. Current working candidate passes 309 Python tests and 82 Node/browser checks (0 skips/failures); strict OpenSpec validates 97 scenarios / 32 PRD IDs. Exact committed/exported native and installed verification is still pending and tasks 13.1–13.4 remain unchecked here.

Enumeration: 19 dashboard endpoints, 3 policy-only endpoints and 16 protected endpoints share one dependency; 1 native model/web dispatch facade checks agreement, and 1 supervised start checks it under the lease. Both metadata copies (catalog and durable Search response) share transactional invalidation/expiry. One renderer covers all normal source cards; result fallbacks retain explicit source/relevance labels. One unload-aware local-only housekeeping loop captures the registration profile context. One exclusive Search lease is shared by Search and deletion.

Exact privacy implementation `8c6b8bbfcd132cd5d87d8d7c3bd563939a9e9ced`: exported tree passes 309 Python, 82 Node/Chromium, fatal lint, coverage (97 scenarios/32 PRD), strict OpenSpec and native validation (0 warnings). Real native localhost provider probe: 6-second deadline 6.0182 seconds (<7), Cancel 0.0397 seconds (<1), both sockets closed with 1 request retained, cost unknown. Actual private installation matches 40/40 files; the user explicitly authorized policy acceptance, the installed gate worked and four saved items remained. No real deletion or credential-store read. See docs/receipts/privacy-release/README.md. Tasks 13.1–13.3 pass; 13.4 remains pending registration/material work, which does not authorize public visibility or submission.

### Installed YouTube icon correction

Final filming exposed a broken YouTube attribution image on the merged 159fc0b build. The original icon request cannot carry Hermes SDK auth headers. One frontend image call and one backend FileResponse route were enumerated; the fix embeds the unmodified official image bytes in the bundle and deletes the route/duplicate binary. The real Chromium regression was committed red (2408830; initial fab6c39 had a strict-locator harness defect, corrected before the production fix). Current verification is pending. The first job-25 film/capture remains evidence of the defect and must not be relabeled as the fixed build.

Exact attribution implementation bafa37de8507042f73b1e8a33bce1b43f8c5b14b passes 309 Python / 83 Node+Chromium tests, 0 skips/failures, fatal lint, strict OpenSpec/coverage and native validation (0 warnings). Native private installation matches 39/39 files; the actual browser decodes the official embedded image at 1255×1075 and displays it at 100px. Full reload was required after a hash-only navigation preserved old page code. See docs/receipts/branding-fix/README.md. Privacy terms and supervised execution are unchanged; their prior native deadline/cancel observations remain pinned to 8c6b8bb and are not falsely described as new runs. No new live search was needed for this fix.
