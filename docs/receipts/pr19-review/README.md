# PR #19 exact-head review

Codex reviewed immutable head `d652e9431e6ab28bac6565af7ed4ea7961adb213` against main `cec15fee4419424b18412da8f77754660e0b94ed`. No subagents or external reviewers were used. Runtime/test fixes are pinned to `d13cea59ca84b7c35e24ad74c04edf41e6773b56` on `codex/search-hard-timeouts`; later commits add documentation/receipts only. This is the correction of record for the earlier self-review's no-finding disposition in `docs/receipts/hard-timeouts/README.md`.

## Standards

Zero independently actionable standards findings. Reviewed repository instructions, the fix-quality floor and documented public Hermes/plugin constraints. No provider, dependency, credential, private host loader, core override, paid scheduling or scope expansion was added. Existing broad style findings remain outside this focused review. Source/config/package assumptions were checked against the prior native receipts before reusing them. No config or environment-variable shape changes are needed for these corrections.

## Specification: two P2 findings, both fixed

1. **Preserve the durable request count when stopping.** Original `search_jobs.py:247–256` rebuilt terminal usage from in-memory pipe counters. The worker saves usage before notifying that pipe; timeout/Cancel in between erased an already observed paid attempt (1 became 0). The monitor at original lines 307–313 could also overwrite a newer durable count with an older notification. JOB04 requires per-job actual usage and unknown cost. Running progress now has one durable writer; after stopping/reaping, terminal cleanup merges the saved and notified counters by class. Three deterministic regression cases cover missing notifications on timeout/Cancel and delayed progress (2 stays 2).
2. **Recover a dead owner from an existing observer.** Recovery ran only when constructing a supervisor. A second server that observed a live owner could retain that supervisor after the owner died, leaving its job running indefinitely; the Search info route additionally tied recovery to current model availability. JOB06 requires interrupted status without paid resume. Recovery now rechecks the exclusive lease on job status, Search info and explicit start, even after selecting the offline provider or losing the model. Five cases cover an actual owner-process death, a new explicit start and three provider states. A live owner's lease still blocks recovery; no saved PID is trusted for killing.

Original locations refer to the reviewed SHA, not revised line numbers. Changes are confined to the two runtime files shown in [fix scope](fix-scope.txt); the other changed files are regression tests/fixture, execution documentation and OpenSpec contracts/tasks/verification. [Original PR scope](original-scope.txt) retains the full base-to-head inventory.

## Reproduction and scope enumeration

Tests preceded fixes in `4cf16bf`, `2c03a00` and `4fa8b4b`; implementation is `d13cea59ca84b7c35e24ad74c04edf41e6773b56`. An immutable Git export of the original reviewed SHA with only those regression files overlaid produces **8 failed / 279 passed** in each of three full Python runs. The same eight exact test identifiers fail in every run: [baseline runs](baseline-runs.json), [run 1](exact-head-full-red-1.log), [run 2](exact-head-full-red-2.log), [run 3](exact-head-full-red-3.log). The first four cases separately failed in all five scheduled runs (20/20 case executions; `red*.log`). These tests force the ordering with a persisted-write/connection handshake and owner release; they do not rely on winning a probabilistic timing race. The earlier six-case [exact-head focused run](exact-head-red.log) predates the two extra provider states. [Provider-state red run](provider-recovery-red.log) records the two extra failures against the interim correction.

Repo-wide enumeration found two original running-progress writers (worker + monitor); the monitor writer is removed, leaving **one worker writer**. **One terminal writer** covers four external completion/cleanup call sites and its internal cancellation-race retry. **Two GET observation routes**, Cancel's shared status path, constructor recovery, and explicit start all use the profile lease/recovery boundary. The worker's per-request observer is unchanged. No sibling usage writer or recovery entry point is left relying on the stale notification or constructor-only assumption.

## Exact fixed-build checks

The table is generated from [verification.json](verification.json), [native results](native-local-provider.json) and [baseline runs](baseline-runs.json).

| Check | Observed | Acceptance | Disposition |
| --- | --- | --- | --- |
| Exact-head regressions | 24/24 failed | reproduce before fix | REPRODUCED |
| Fixed focused tests | 26 | 0 failures | PASS |
| Full Python suite | 287/287 | 0 failures | PASS |
| Browser suite | 80 | 0 failures / 0 skips | PASS |
| 6-second native deadline | 6.015 s | < 7 s; EOF; 1 request retained | PASS |
| In-flight native Cancel | 0.043 s | < 1 s; EOF; 1 request retained | PASS |
| Installed payload | 37/37 | all match fixed pin | PASS |
| Saved items | 3 | unchanged | PASS |

[Check runner results](checks.json) and adjacent full logs record collection before execution, strict OpenSpec, traceability, 14 invalid/1 valid coverage fixtures, fatal Python lint and native `hermes plugins validate --install-deps`. All pass; native validation has zero warnings. Published logs trim trailing whitespace only; original outputs remain in the local review artifact directory. Python has one existing Starlette/httpx deprecation warning. [Focused green](focused-green.log) covers all 26 supervisor/route cases; full Python adds eight regressions to the original 279. All 80 browser cases were rerun although UI code is unchanged.

The reproducible native probe remains `docs/receipts/hard-timeouts/native_probe.py`; it ran from the clean fixed export. It exercises actual public Hermes CLI and `ctx.llm` against a stalled localhost provider using a dummy test key. Both in-flight calls close their sockets and retain one observed request with unknown cost. No live vendor query was made in this review.

## Installed copy and remaining limits

The default installed plugin was backed up outside Git, updated from the exact fixed payload and the dashboard alone restarted. [Manifest](installed-manifest.json) confirms 37/37 matching files; [installed check](installed-check.json) records 3 saved items, unchanged library flags/interests/open history/source settings, and zero paid searches started. An unauthenticated local dashboard request returns 401, as expected for its protected API; the authenticated dashboard UI was not rechecked in this review. The original screenshots/live relevance queries remain historical, not relabeled as this build. Actual native execution is rechecked separately by the disposable-profile probe above.

macOS is verified; Linux integration remains unrun. Local termination cannot revoke processing/billing already accepted by a remote service. SEARCH06 refinement, wider source/lifecycle/public release gates and the old catalog pin remain unchanged. No unresolved actionable finding remains within this reviewed scope. The final receipt-only head is checked again for runtime/test equality and read back from GitHub after push; no merge is requested or performed.
