# Verification record

## Planning state

The proposal, eight capability specs, design, and tasks describe intended behavior. No product implementation, host integration, source ingestion, paid inference, or quality evaluation has been verified. The official event and source pages were read on November 5, 2026. Reading them does not establish provider approval, legal clearance, or that the hackathon submission is complete.

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
| Implementation progress | No implementation task is complete | Not started |

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

No scenario has an implementation receipt yet. Before marking a task complete, record its task ID, scenario IDs, exact host/code revision, test or manual procedure, observed result, date, and log/artifact location. Use pass, fail, not-run, or blocked with evidence. Keep full logs in files.

## Release measurements

All values are unmeasured. Freeze the post-demo evaluation workload, rubric, source snapshots, provider configuration, and request limits before collecting results. Use PRD section 9 for proposed targets and report adjustments explicitly. The demo video length is measured under task 4.3, not inferred from the six-step outline.
