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

Tasks 1.1, 1.2, 1.4, 2.1, and 2.2 have receipts below. Tasks 1.3 and 2.4 are open. Before marking a task complete, record its task ID, scenario IDs, exact host/code revision, test or manual procedure, observed result, date, and log/artifact location. Use pass, fail, not-run, or blocked with evidence. Keep full logs in files.

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

## Release measurements

All values are unmeasured. Freeze the post-demo evaluation workload, rubric, source snapshots, provider configuration, and request limits before collecting results. Use PRD section 9 for proposed targets and report adjustments explicitly. The demo video length is measured under task 4.3, not inferred from the six-step outline.
