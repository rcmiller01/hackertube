# PR #18 exact-head review

Reviewed head: `ba1fd3d70b5c464a764bd7bf882babc77b722654`.
Base: `fb34c2237ff5f26fdcc97a959a6f9889e47052c2` (`codex/search-results-tuning`, PR #17). The remote head was read from GitHub and matched the clean local checkout. Review used that immutable Git archive, not the branch name. Both standards and specification review were performed by Codex in this chat; no delegated or external reviewer was used.

## Standards

No actionable standards finding. The two original runtime edits preserve the existing Hermes facade and request boundaries; one structured-completion site covers interpretation/ranking. The token increase is bounded and its original root-cause inference is qualified rather than presented as a captured vendor finish reason. No new dependency, provider, credential path, or background work was added. The historical broader-lint baseline remains separate from this review.

## Specification

**One P2 finding, fixed: the in-flight limitation was hidden until the provider returned.** At the reviewed head, the new warning existed only in `limitsLine`, called by the terminal `renderJob`. Submitting clears the previous result; a stalled first search renders only “Search running.” The very failure that motivates the warning therefore prevented it from being shown. The request-jobs demo requirement calls for disclosing the work-budget/cancellation limitation. It now explicitly requires that disclosure before submission and while waiting.

The fix displays the shared note in the Hermes Search panel and associates both the question and Search submit control through ARIA. It remains visible while pending. The terminal helper reuses the same text; the offline stub has neither a Hermes-only note nor a dangling ARIA reference. This does not implement cancellation or a hard wall-clock deadline.

Scope audit: **one original warning literal**, **one terminal helper/caller**, **one Search panel**, and **two search-control description attributes**. The shared note now serves both the panel and terminal helper; both control sites are wired. No sibling literal or search submit surface is left unwired.

## Reproduction and checks

The regression commit `e2986a7` precedes the runtime fix. With only the final regression test file overlaid on the immutable reviewed archive: **2 failing disclosure cases / 1 passing offline-stub control**. With the fix: **3 passed / 0 failed**. The test harness's submit selector was narrowed to the Search control (the Interests form has another submit control); the exact-head red reproduction was repeated with that corrected selector before reporting the count.

Clean original archive: **261 Python tests passed**, **73 JavaScript/browser tests passed**, no JavaScript skips. One existing Starlette/httpx deprecation warning. The original video has SHA-256 `ff380cbb5fea2d50c3978bbffbedb6f4e851ec749059a344f5e9877b4c4e96ce`, matching its receipt. The recorded 36.25-second demo and live-query measurements remain historical evidence for `c691a75`, not a new live-provider run for this fix.

The revised working implementation passes **76 JavaScript/browser tests / 0 failures / 0 skips** and strict OpenSpec. Final exact-commit checks, installation hashes, and disposition are recorded in `docs/receipts/pr18-review/verification.json` after the implementation commit exists. Full original-head and revised logs are kept there or under `/Users/robert/Documents/Codex/2026-11-08/hackertube-pr18-review/`.

Standards: **0 actionable findings**. Specification: **1 P2 finding fixed**. Known in-flight timeout/cancellation, interrupted-job recovery, source-release, public-clone, eligibility/IP, and submission gates remain open as already disclosed; they are not newly closed by this UI change. PR #18 remains draft and unmerged.

## Fixed implementation verification

Exact implementation commit `026b3d7b6ad2060490ce31929b2c3e9779684ef9` was exported independently: **261 collected / 261 Python passed**, **76 JavaScript passed / 0 failures / 0 skips**, strict OpenSpec **1 passed / 0 failed**, coverage fixtures **14 invalid rejected / 1 valid accepted**, and native plugin validation passed without plugin warnings. One existing Starlette/httpx deprecation warning remains. All **35/35 installed payload files match** that commit. The real installed page displays the note before submitting; both controls reference it. Screenshot: `docs/receipts/pr18-review/installed-before-search.jpg`. No new Search was dispatched. The local plugin backup is outside Git under the review artifact directory.

The catalog draft now pins the fixed implementation commit, so it does not retain the superseded UI. Existing rehearsal assets remain historical, with a current screenshot in this review. Later commits contain review receipts and draft updates only; the final PR head is reported and rechecked in the PR description rather than embedded recursively in its own files.

Final code/test revision `b1a7bb839f53abf0ff55d2d442e89cebc85c0897` adds an edge control: attempts to close a pending Search already leave the panel open. The initial edge-test assumption that it could close was corrected after reading the existing guard; no runtime branch was added for that unreachable state. The final clean archive passes **261 Python / 77 JavaScript / 0 failures / 0 JavaScript skips**, with **4 focused UI cases passing**. Its 35-file plugin payload is byte-identical to the validated implementation pin `026b3d7b6ad2060490ce31929b2c3e9779684ef9`. Earlier 76-test counts describe the earlier fixed archive; the final count is 77.
