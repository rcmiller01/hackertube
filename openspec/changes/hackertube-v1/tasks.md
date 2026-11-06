# Tasks

No implementation task is complete. Group 1 establishes integration feasibility before dependent product work. Scenario IDs refer to specs in this change.

## 1. Verify host and source integration

- [ ] 1.1 Pin a Hermes version and verify the web extension, authentication, and profile data root in a disposable profile. Record exact entry points and a real page reload receipt in feasibility.md. Covers UI01, PREF07, LIB02.
- [ ] 1.2 Verify public model, search, agent registration, and optional memory APIs without reading credential files. Record the supported call path and a memory-disabled payload check in feasibility.md. Covers SEARCH01, SEARCH02, PREF05, PREF06.
- [ ] 1.3 Select a minimal source set with community evidence and real records across all four formats. Record access, reuse terms, costs, keys, format coverage, and limitations in feasibility.md. Covers CAT01 through CAT08, PREF02, PREF03.
- [ ] 1.4 Probe bounded jobs, cancellation, and restart using deterministic stub services. Record observable host lifecycle behavior in feasibility.md before choosing execution bindings. Covers JOB03, JOB05, JOB06.

## 2. Establish catalog and persistent state

- [ ] 2.1 Implement normalized item, evidence, source, and edition records with boundary checks. Verify CAT01 through CAT09 on real captured source samples and hostile/invalid fixtures. Document adapter contracts and unknown fields.
- [ ] 2.2 Implement profile-local interests and library state. Verify LIB01 through LIB06 and PREF01/PREF07 across restart, repeated operations, and profile separation. Document storage and update behavior.
- [ ] 2.3 Implement source ingestion and status for the selected adapters. Verify PREF02 through PREF04 and CAT05, including a failed source and duplicate identities. Document supported source setup and source-control semantics.

## 3. Deliver the dashboard and local discovery

- [ ] 3.1 Build the supported web page, four sections, library, About view, and source-opening controls. Verify UI01 through UI06 in the real web dashboard with a keyboard. Add Karpathy credit to all required surfaces and document source-opening behavior.
- [ ] 3.2 Implement prepared-feed ranking, filters, and feedback exclusions. Verify FEED01 through FEED08 with a fixed catalog including nontechnical interests, missing metadata, negative mentions, and sparse coverage. Document the ranking policy.
- [ ] 3.3 Instrument paid-request boundaries and verify zero paid calls across ordinary browsing, reranking, library operations, and reopening. Record FEED04, PREF08, and JOB02 receipts and document which actions consume credits.

## 4. Deliver explicit search and refresh jobs

- [ ] 4.1 Implement explicit bounded Search and Refresh with progress, terminal status, cancellation, and no implicit restart. Verify JOB01 through JOB08 with failure-injecting services and document limits/retry behavior.
- [ ] 4.2 Implement question interpretation, broader-web retrieval, verified candidate ranking, constraints, refinements, and partial format coverage. Verify SEARCH01 through SEARCH09 and CAT01/CAT03/CAT08 with frozen source responses. Document source labels and uncertainty handling.
- [ ] 4.3 Connect explicit agent requests to the same search and library behavior. Verify SEARCH01/SEARCH02, LIB01, and PREF07 on the declared host. Document invocation and verify ordinary chat is unchanged.
- [ ] 4.4 Add memory consent and bounded context selection through the verified public API. Verify PREF05/PREF06/PREF08 with observed payloads before and after revocation. Document scope and receiving services.

## 5. Verify the complete release

- [ ] 5.1 Freeze 20 representative focused requests, a relevance rubric, source snapshots, budgets, and reference setup before evaluation. Record accepted targets in verification.md and cover all four formats plus nontechnical and sparse interests.
- [ ] 5.2 Run the end-to-end scenario set and record every scenario's test or manual receipt in verification.md. Check zero paid browsing, 100% reviewed provenance, persistent state, hard constraints, and disclosed partial failures. Record actual counts and disposition, not just pass labels.
- [ ] 5.3 Measure relevance, cached-render latency, progress latency, usage, and coverage against the frozen setup. Report sample sizes, unknown costs, and any missed proposed targets from PRD section 9. Do not infer savings from cheaper individual calls.
- [ ] 5.4 Rehearse clean install, reload, update, disable/re-enable, rollback, and documented uninstall retention on the pinned host. Run Hermes plugin validation on the candidate commit and record numeric results and remaining warnings.
- [ ] 5.5 Prepare the source-attributed demo and catalog metadata, verify UI03 and the PRD scope, and run strict OpenSpec validation plus the coverage check. Public submission is a separate action.

## Workflow follow-up

- Archive only after implementation checks are complete and unresolved failures are explicitly dispositioned. Verify delivered specs and archive contents after synchronization.
