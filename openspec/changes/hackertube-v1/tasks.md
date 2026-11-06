# Tasks

Tasks 1.1, 1.2, 1.3, 1.4, 2.1, and 2.4 are complete. The other implementation tasks are not. Group 1 establishes integration feasibility before dependent product work. Scenario IDs refer to specs in this change. "Demo" means the November 11 hackathon cut in PRD section 13. "Post-demo" tasks preserve the later requirements but do not block the demo video. No public release or external submission is authorized by a checkbox.

## 1. Verify host and source integration

- [x] 1.1 Pin a Hermes version and verify the web extension, authentication, and profile data root in a disposable profile. Record exact entry points and a real page reload receipt in feasibility.md. Demo. Covers UI01 and LIB02. The PREF07 two-profile check moves to task 6.4.
- [x] 1.2 Time-box model and search integration to the end of day 1. Verify `ctx.llm` and any public search route for the selected plugin binding without reading credential files. If the required route is unavailable, use the pre-decided fallback of a plugin-owned model or search key entered in a secret plugin setting. Declare it through `requires_env` or `config_schema`, store it through Hermes, and read only that declared secret through secret scope. Never read Hermes credential stores directly or store secrets in plugin data. Record either working path and a memory-disabled payload check. Demo. Covers SEARCH01, PREF05, HCKT14, and HCKT15. Agent registration and optional memory probes move to task 6.1.
- [x] 1.3 Start with the proposed source matrix in docs/sources.md. Verify bounded access and real records for Hacker News, YouTube, Apple or Podcast Index, Open Library, and LibriVox. Verify applicable attribution, retention, privacy, and deletion obligations. Request explicit Reddit approval before any live Reddit call and keep Reddit disabled otherwise. Record working choices and unresolved terms in docs/feasibility-sources.md. Demo sources are limited to those needed by the seeded catalog and one search. Covers CAT01 through CAT08, PREF02, PREF03, PREF09 through PREF12, and HCKT18.
- [x] 1.4 Probe bounded jobs, cancellation, and restart using deterministic stub services. Record observable host lifecycle behavior in feasibility.md before choosing execution bindings. JOB03, JOB05, and JOB06 are specified. Cancellation and restart implementation move to task 6.2. Demo only needs the bounds used by the single focused request.

## 2. Establish catalog and persistent state

- [x] 2.1 Implement normalized item, evidence, source, and edition records with boundary checks. Verify CAT01 through CAT11 on real captured source samples and hostile/invalid fixtures. Document adapter contracts and unknown fields. Demo: implement only fields used by the seeded records and one search. Limited source samples do not change the demo status of the CAT scenarios.
- [ ] 2.2 Implement profile-local interests and library state for the seeded feed and demo save. Verify LIB01, LIB02, LIB03, and PREF01 across their respective save, restart, refresh, source-opening, and interest-persistence steps. Demo. LIB04 through LIB06 and PREF07 remain for post-demo tasks 6.3 and 6.4.
- [ ] 2.3 Implement source ingestion and status for the selected demo adapters. Verify PREF02 through PREF04, PREF14, and CAT05, including a failed source and duplicate identities. Document supported source setup and source-control semantics. Reddit scenarios stay unimplemented until approval. Demo source coverage may be smaller than the proposed matrix.
- [x] 2.4 Prepare a small seeded catalog from real, licensed-for-display records with the evidence needed by the demo. Include refresh and retention metadata required by each source. Verify UI02, FEED01, CAT03, CAT04, CAT10, and CAT11. Demo.

## 3. Deliver the dashboard and local discovery

- [ ] 3.1 Build the supported web page, four sections, library, About view, and source-opening controls. Verify UI01 through UI06 in the real web dashboard with a keyboard for the six-step cut and record accessibility evidence. Add Karpathy credit to the README, About view, and prepared marketplace description. Demo.
- [ ] 3.2 Implement prepared-feed ranking against the seeded catalog and basic feedback exclusions. Verify FEED01 through FEED07 with a fixed catalog. FEED08 strict duration filtering moves to task 6.3. Document the ranking policy and its limited subject coverage. Demo.
- [ ] 3.3 Instrument request boundaries and verify zero paid calls across ordinary browsing, local reranking, library operations, and reopening. Record FEED04, PREF08, JOB02, and JOB04 receipts. Demo.

## 4. Deliver the explicit demo search and submission candidate

- [ ] 4.1 Implement the single explicit demo Search and the disclosure shown before any model, paid-search, or metered provider activity. Verify JOB01 through JOB04, JOB09, and JOB10 with the selected provider and bounded limits. Demo. JOB05 through JOB08 are post-demo.
- [ ] 4.2 Implement question interpretation, retrieved candidate verification, hard constraints, source labels, and partial format coverage for one focused demo question. Verify SEARCH01, SEARCH03 through SEARCH05, and SEARCH07 through SEARCH09 using retrieved records. Demo. SEARCH02, SEARCH06, SEARCH12, and HCKT20 are post-demo. SEARCH10 and SEARCH11 move to task 6.3.
- [ ] 4.3 Record the six-step demo cut in a video under 90 seconds. Verify HCKT10 with the running plugin and prepare HCKT11. Publishing the X post is a separate explicit action.
- [ ] 4.4 Prepare the public repository, exact commit pin, plugin manifest, README disclosure, screenshots, and one catalog-entry PR draft. Verify HCKT02 through HCKT09, HCKT13 through HCKT18, and HCKT21 through HCKT23 at the candidate commit. Run `hermes plugins validate /path/to/your-plugin --install-deps`. Making the repository public and opening the catalog PR are separate explicit actions.
- [ ] 4.5 Prepare the entry form values and deadline checklist for HCKT01, HCKT12, and the native-payload HCKT22 check. Robert approves the external form submission separately. Record any still-unanswered eligibility, team, originality, license, or IP terms as blockers.

## 5. Verify the demo candidate

- [ ] 5.1 Run all demo-scope scenario receipts in verification.md, including zero paid browsing, provenance, save persistence, source opening, disclosure, and the actual demo video length. Do not claim the deferred 20-request relevance result. Demo.
- [ ] 5.2 Run clean-profile installation at the exact candidate commit and record manifest validation, UI screenshots, and remaining warnings. Demo. Lifecycle rehearsal beyond initial installation is task 6.5.
- [ ] 5.3 Confirm whether participant eligibility, team size, originality, project license, and IP terms have official answers. Do not turn silence into permission. Demo release gate.

## 6. Complete post-demo requirements

- [ ] 6.1 Add the explicit agent entry and shared search/library behavior. Verify SEARCH02, SEARCH12, LIB07, and LIB08 and confirm ordinary chat is unchanged. Add memory consent and bounded context only through the verified API. Verify PREF06 and PREF13 with observed payloads before and after revocation. Demo PREF05 and PREF08 use the same shared defaults and retain their receipts under tasks 1.2 and 3.3. Post-demo.
- [ ] 6.2 Complete bounded cancellation and restart behavior and source/model partial failure handling. Verify JOB05 through JOB08 and SEARCH06. Post-demo.
- [ ] 6.3 Complete remaining library actions, include-dismissed controls, and strict duration filtering. Verify LIB04 through LIB06, SEARCH10, SEARCH11, and FEED08. Post-demo.
- [ ] 6.4 Verify two-profile state isolation and secure source/profile handling across restart and supported profile switching. Verify PREF07. Post-demo.
- [ ] 6.5 Rehearse clean install, reload, update, disable/re-enable, rollback, and documented uninstall retention on the pinned host. Verify HCKT19 and LIB09, including library preservation through a supported update and rollback. Post-demo.
- [ ] 6.6 Freeze 20 representative focused requests, a relevance rubric, source snapshots, budgets, and reference setup. Run HCKT20 and measure relevance, cached-render latency, progress latency, usage, and coverage. Report sample sizes, unknown costs, and missed proposed targets. Post-demo.

## Workflow follow-up

- Archive only after implementation checks are complete and unresolved failures are explicitly dispositioned. Verify delivered specs and archive contents after synchronization.
