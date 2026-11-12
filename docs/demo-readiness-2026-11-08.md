# HackerTube demo readiness and workspace consolidation

> Historical baseline review, superseded by [real search](real-search.md), [PR17 review](pr17-review.md), and [installed demo rehearsal](receipts/demo-rehearsal/README.md). Packaging, real retrieval, format-before-limit filtering, remaining-budget forwarding, and nonblocking search are implemented. The old five-second live limit is obsolete; live jobs use a 45-second work budget. Seed expansion remains deliberately skipped. See the rehearsal report for remaining submission gates.

Reviewed November 8, 2026. Baseline: `fa692729cbf4ed26743f163dceeb6c12f9ae1e7a`, fetched from origin/main during this review. The search worktree at `a4993e6fa12c9515eb737ab422f0d81dd797a2f2` has an identical tracked tree: zero differing files. PR #15 is already merged. This review changes no application behavior and does not authorize publication or paid calls.

## Assessment

The dashboard, local interest ranking, saved library, source links, attribution, and deterministic search are implemented. This is enough for a local catalog demonstration after configuring the stub provider. It is not yet the specified live, LLM-backed discovery/search demo. Tasks 4.1/4.2 being checked do not establish that the live path works.

## Findings, in delivery order

1. **P1 — The advertised plugin folder is not self-contained.** `hackertube/dashboard/catalog_view.py:26-35` adds the parent repository to the import path, then imports the sibling `hackertube_core`. README calls `hackertube/` the installable plugin, but that directory excludes core and its seed. An isolated copy of that directory fails with `ModuleNotFoundError: No module named 'hackertube_core'`. Make the supported installation payload include the core package and seed; verify installation from a clean clone with no development checkout on the import path. This is a concrete packaging failure; an actual catalog install on the pinned host is still untested.

2. **P1 — Search does no new candidate retrieval.** `_search_binding` loads the bundled seed (`hackertube/dashboard/plugin_api.py:97-114`). `candidate_verification` searches only `catalog.items` (`hackertube_core/search.py:546-561`). The provider only interprets the question. There is no source or broader-web retrieval stage in `run_search`. Labeling constructed `kind=web` evidence in tests proves labeling, not a working web-search integration. Wire bounded retrieval into the explicit search, admit real returned records, and make returned identities available to Save/Open. A question about a new topic must be able to produce a result absent from the bundled seed.

3. **P1 — The live provider is unfinished.** The default is `live`, but the endpoint is empty and a declared key is required, so a fresh configuration refuses Search. Its request contains messages only, with no model selection, and `_interpretation_from` only accepts a custom top-level `interpretation` object (`search.py:349-407`). An injected chat-completion response containing `choices[0].message.content` was ignored: the response said `gardening`, while the returned interpretation was the locally parsed `jane austen`. Implement one explicitly supported provider contract, validate its structured response, expose its required settings, and avoid silently treating a malformed model response as successful model interpretation. Prove one successful call separately with authorized credentials. No real model call was made in this review.

4. **P1 — The seed does not demonstrate videos or community recommendations.** The current seed has Videos **0**, Podcasts **4**, Books **4**, Audiobooks **4**. Its **12** evidence records are all catalog records, with **0** community endorsements. YouTube remains deliberately disabled for unresolved storage terms. Complete a permitted video metadata path and add genuinely supported community evidence to a small demo selection. Do not enable oEmbed by bypassing the recorded restriction. Empty states work, but the seed cannot currently demonstrate the full four-format community-discovery pitch.

5. **P2 — Requested formats are filtered after the global result limit.** `search.py:590-618` sorts and truncates all admitted formats, then builds requested sections. `Jane Austen books` returns **10** top-level results containing books, audiobooks, and podcast shows despite `formats_requested=[book]`. With `max_hits=1`, a podcast consumes the single slot and the Books section incorrectly says there are **0** matches. Filter requested formats before ranking and limiting; verify both the response and visible section under a small limit.

6. **P2 — The declared deadline does not bound provider work.** Default job deadline is **5 seconds**, but `LiveProvider` passes **15 seconds** to its transport. `_job_state` labels an overrun only after the provider returns (`search.py:645-711`). `POST /search` calls the synchronous engine directly inside an async route (`plugin_api.py:274-307`), which can also block the dashboard event loop during a slow request. Pass the remaining budget into transport, bound relevant operations, and run blocking work away from the event loop. Check that a slow provider cannot prevent ordinary feed reads while Search is running. Cancellation/restart recovery remains a separate post-demo requirement.

7. **P2 — Development checks depend on undeclared external packages.** The repository has no Node dependency manifest; browser tests discover dependencies in environment paths or another Hermes installation. The first run here failed on missing `esbuild`. A temporary test environment containing esbuild, Playwright, React, React DOM, and the matching Chromium shell made **63/63** tests pass. Declare and lock development dependencies and document one reproducible setup command. Runtime React should continue to come from the Hermes SDK.

## Remaining demo work

1. Fix packaging and reproducible setup first. Use one clean disposable Hermes profile and the declared host pin, not the existing development import path.
2. Finish one actual model provider and one bounded retrieval path. Freeze the exact demo question and limits, then confirm relevant retrieved identities, source labels, unknown metadata, format selection, and save/open behavior.
3. Finish the small source-backed demo catalog, including a usable video and genuine community evidence. Retain honest empty states for unsupported topics.
4. Rehearse the six-step cut on the running installed dashboard: open feed, ask the question, save, open source, show attribution. Check keyboard operation, save persistence after restart, and zero paid/metered calls during ordinary browsing. Existing separate route and browser harnesses do not replace this installed-host check.
5. Record the real plugin in a video under **90 seconds**; prepare current screenshots, network/storage/setup disclosures, exact plugin SHA/version, catalog PR draft, and form values. Resolve the remaining documented eligibility/source gates. The recorded project deadline is November 11 at 5 p.m. Eastern; this review did not re-research event rules. Public repository visibility, X posting, catalog PR submission, and form submission remain separate external actions.

Memory integration, agent/chat entry, refinement, full cancellation/recovery, advanced library controls, two-profile verification, lifecycle rehearsal, and the 20-question relevance evaluation remain post-demo. They should not expand the immediate implementation cut.

## Consolidation performed

- Canonical working directory: `<home>/Developer/hackertube`.
- Working branch: `codex/demo-readiness-consolidation`, starting at the latest fetched origin/main. Local main was not merged or pushed.
- Removed the four task worktrees `hackertube-2.3`, `hackertube-2.4`, `hackertube-3.3`, and `hackertube-4.1`. All had clean tracked state; their only non-ignored untracked files were Finder `.DS_Store` files. All branch references remain. The older review worktree outside Developer was left alone.
- Before removal, archived all four complete directories, including ignored environments/caches, and verified **4,069 regular files** byte-for-byte. Also created and verified an all-branches Git bundle. Backup: `<home>/Documents/Codex/2026-11-08/hackertube-consolidation/`. Its `manifest.json` records the archive checksum. The archive and branch bundle together preserve files and history for restoration.
- Created one Python environment in the canonical directory and verified its suite. Added ignore rules for `.DS_Store`, `.venv/`, `.pytest_cache/`, and `node_modules/`.

## Code/file simplification recommended

The task directories were separate Git worktrees, not four packages that needed their code manually merged. Their cleanup removes the immediate folder confusion.

Inside the repository, preserve a single plugin payload with dashboard and core together. Prefer a root manifest/entry point alongside `dashboard/` and `hackertube_core/`, or place core within the existing installable directory; choose and test one layout. Remove the repository-parent import assumptions as part of that packaging change. Do not maintain two copies of core.

Keep the existing small catalog, source adapter, ranking, storage, and request-accounting modules where they separate real responsibilities. A shared recommendation operation should coordinate interpretation, retrieval, verification, and results for the dashboard and later agent entry; it should not duplicate source or persistence logic. The **1,724-line** dashboard file deserves a separate maintainability pass into source modules with a repeatable bundle step after the demo works. Simply concatenating Python files would not resolve the current defects.

Most file volume is evidence: **171 of 272 tracked files** at the baseline are under docs, and receipts occupy approximately **9.1 MB**. Consolidate current setup/status instructions and correct stale README/design statements, but preserve revision-specific receipts until their replacement checks exist. Historical captures can later move to one archive location with a receipt index. Runtime correctness and reproducible installation take precedence over reducing file counts.

## Validation and evidence

| Check | Observed | Threshold / disposition |
|---|---|---|
| Search worktree vs latest origin/main | 0 differing tracked files | 0; identical |
| Python, original search worktree | 201 passed, 0 failed | 0 failures; pass |
| Python, consolidated directory | 201 passed, 0 failed; 1 Starlette/httpx deprecation warning | 0 failures; pass |
| JavaScript/browser, supplied temporary dependencies | 63 passed, 0 failed, 0 skipped | 0 failures/skips; pass within harness scope |
| PRD traceability | 32 IDs, 95 scenarios | All mapped/deferred as specified; pass for structure |
| Coverage checker fixtures | 14 invalid rejected, 1 valid accepted | 15/15; pass |
| Isolated advertised plugin folder | 1 import failure | 0; fail |
| Video / community endorsement seed coverage | 0 videos / 0 endorsements | At least one usable example each for the proposed pitch; open |
| Live provider / installed-host demo | No live call; no new installed-host walkthrough | Required before claiming live demo readiness; not run |

Full test logs, reproductions, Python dependency versions, temporary Node dependency lockfile, and worktree inventory are in `docs/receipts/demo-readiness-2026-11-08/`. The targeted reproductions used only injected/offline data. No credential store was read, no paid call was made, and no application defect was fixed by this review. The report is the handoff for a focused demo-completion task.
