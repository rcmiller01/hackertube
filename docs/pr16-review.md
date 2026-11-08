# PR #16 exact-head review and fixes

Reviewed head: `dca17be7f0a6a77759397ffcbc61d0de7cbf684d`.
Base: `fa692729cbf4ed26743f163dceeb6c12f9ae1e7a`.
Scope: the complete PR runtime, packaging/configuration, changed tests, and behavior contracts. No subagents were used. The initial head was checked against GitHub metadata and the local tree before edits.

## Confirmed findings

Line numbers below identify the original reviewed head, not the later fixes.

| Priority | Original location | Reproducer and consequence | Fix |
|---|---|---|---|
| P1 | `hackertube/hackertube_core/catalog_store.py:46–57` | An expired YouTube Data API row plus an unexpired HN mention kept the video's cached title/duration alive. Any evidence was treated as current identity metadata. | Require active identity evidence; a YouTube ID needs its own active Data API record. Purge dangling evidence and expired metadata on both catalog reads and writes. A disk-level regression verifies that saved flags survive the purge. |
| P1 | `hackertube/dashboard/dist/index.js:943–975` and the Search submit handler | A model/source setting POST could still be pending when Search dispatched. The request then used the previous provider or source choice. | One configuration-write helper gates both write paths and Search. Failed writes stay blocked until successfully retried or saved state is reloaded; stale configuration reads cannot overwrite a later write. Controls show pending state and preserve a retry path. |
| P2 | `hackertube/hackertube_core/search.py:725–736` | With known model costs and a failed paid web attempt, the total was reported as the sum of model costs with `cost_known=true`. The web attempt's unknown cost was omitted. | Failed as well as successful web attempts make total cost unknown. Source failure no longer sets the separate budget-exhaustion flag. |
| P2 | `hackertube/hackertube_core/search.py:621` and `:723–724` | Two deliberately overlapping searches made the earlier job report both paid invocations, because usage was a difference of process-wide counters. | Each job owns a context-local ledger at the existing outbound dispatch chokepoint. Process totals remain separate. Scope cleanup is tested on exceptions. |
| P2 | `hackertube/hackertube_core/retrieval.py:257–283` | An Apple show query could succeed, then a later episode query could fail or exhaust the budget. The successful records were discarded. A malformed response could instead be labeled successful with no results. | Preserve each completed subquery's records, distinguish partial/failure/limit status, validate payloads, and stop dispatching at the budget. Tests cover HTTP failure, malformed data, and exhaustion. |
| P2 | `hackertube/dashboard/dist/index.js:1712–1726` | Expired saved records disappeared from the visible library even though their saved flags remained in the profile. | Show saved-item placeholders when current metadata is unavailable. This retains visible bookmark state without redisplaying expired source metadata or triggering a refresh. |

## Exact-head reproduction

A clean `git archive` of the full reviewed SHA was extracted into a temporary directory, with only the new regression tests overlaid. Python import paths were checked to confirm they pointed into that export, rather than the editable development installation. The export reproduced **6 Python failures and 3 UI failures**. Logs: `docs/receipts/pr16-review/pinned-python-red.log`, `pinned-node-red.log`, and `pinned-red.json`.

The deterministic overlap test reproduced the incorrect count **5/5 times** before the fix and passed **5/5 times** afterward. It uses ordered events and bounded waits, not scheduler-dependent timing or a barrier placed inside a locked region.

The reproducing tests were committed before their fixes: `7de26bd` for accounting, expiry, partial Apple results, and configuration writes; `7355f9f` for the saved-library placeholder. The original implementation receipts remain historical records for `dca17be`; they are not silently rewritten as receipts for the fixes.

## Scope and resource audit

- Expiry: **1** shared pruning function, **2** persistent-store callers (read/write). All existing catalog consumers receive pruned records. **1** library rendering path separately preserves visible saved state.
- Configuration: **2** write callers, **2** configuration-read effects, the Search handler/button, and **3** setting controls were audited. The shared write helper gates new work; a request epoch rejects stale reads. Failure state is keyed by setting kind, with retries and read-back recovery.
- Usage: **3** production dispatch callers (HTTP transport, Hermes model, Hermes web tool), **1** dispatch chokepoint, and **1** job-usage reader. Per-job `free`, `metered`, `paid`, `cost_usd`, and `unknown_cost_calls` now belong to the context-local request ledger. No lock is held across model or source work; the fix removes process-wide differencing from job accounting rather than serializing requests.
- Cost: **1** total-cost aggregation path, including failed web attempts. Process diagnostic counts remain cumulative; job usage is isolated.
- Apple: **1** aggregator covering **3** query kinds, the shared source-status reader, and the job partial/limit readers. A source outage is reported independently of budget exhaustion.

## Validation and disposition

The updated tree passes **230/230 Python tests**, **71/71 JavaScript/browser tests** with no skips, targeted regressions, strict OpenSpec validation, coverage fixtures, and Hermes plugin validation with no warnings. The existing Starlette/httpx deprecation warning remains. Relevant full logs and the new runtime SHA-256 manifest are in `docs/receipts/pr16-review/`.

The fixtures and source/model injections are offline. The earlier bounded live-model receipt was reused because these fixes do not change provider authentication or source API contracts. Keyed YouTube/Podcast Index live checks and the installed-host browser release walkthrough remain open as previously documented; this review did not expand those gates or merge the PR.

All six confirmed findings are addressed. The updated head is re-read after committing and verified against the runtime manifest before the branch is pushed. This is a review of the exercised implementation and contracts, not proof that every possible runtime/provider failure is covered.
