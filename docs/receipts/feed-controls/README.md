# Feed refresh and controls verification

Branch: `codex/refresh-feed-after-search`. Production implementation: `d9019d66498df932ae71649b0bd3ddab698053bd`. Final test-fixture corrections: `819cf22fe43c10272810e77be047da8fdc84fa1e`. November 9, 2026.

## Results

- Python: 311 collected, 311 passed, 0 failed in a clean export of `d9019d6`. [Collection](python-collection.txt), [full result](python-full.txt). One existing Starlette/httpx deprecation warning. Runtime code did not change after that run.
- Node/browser: 91 passed, 0 failed, 0 skipped in a clean export of `819cf22`. [Full result](node-full.txt). Includes a real Chromium background Search, feed update while controls are collapsed, keyboard reopen with retained question, and keyboard interest deletion surviving page reload. Browser APIs are offline fixtures; no live provider or installed-host claim.
- Planning: strict OpenSpec 1 passed/0 failed; 32 PRD IDs, 100 scenarios; 14 invalid traceability fixtures rejected and 1 valid mixed fixture accepted. [Results](spec-checks.txt).
- Gate: 0 test failures, no extra paid work, exactly 1 catalog read and 1 feed read per current terminal Search, 0 rereads for duplicate/stale completions. Profile/route tests prove removal persists and local removal/reranking makes 0 free, metered, or paid outbound calls.

The first full Node run at `d9019d6` had 88 passes/3 failures; [raw result](node-initial-full.txt). Two assertions counted the newly added × button as part of interest text; the third fixture returned an outdated catalog after Search despite the new reread. The corrected tests still assert exact interest text, require the remove button, and retain Save/Open assertions while returning the catalog the Search persisted. No assertion was removed to make the behavior pass. Red regression logs preceded implementation and are retained beside this report. Terminal Search tests failed 4/4 before the fix and pass 4/4 after.

Logs retain complete test output, with ANSI color and trailing whitespace removed. Clean exports used the existing installed dependencies; no scratch test files were added to those exports.

## Scope and review

One Search completion handler owns five entry paths: initial response, status polling, cancellation response, recovery of running work on mount, and lost-start-acknowledgement attachment. One profile writer owns five mutation callers: Save, Dismiss, Open, Add interest, Remove interest. Both interest views use the same profile: Discovery is editable; Library remains read-only. The existing interest route accepts a strictly boolean `remove` option; the store validates the interest and performs a parameterized deletion without touching library rows.

Controls are initially expanded and can be collapsed with native keyboard-operated disclosure behavior. The reopen summary remains visible and displays running Search status. Search/feed refresh preserves the collapsed choice for the mounted page. Full page reloads start expanded. The sparse-feed Search shortcut expands the controls. [Expanded preview](controls-expanded.png), [collapsed preview](controls-collapsed.png) show offline fixtures without Hermes host styling; artwork was blocked deliberately for those screenshots.

Production diff is limited to dashboard JS/CSS and the profile store. Tests/fixtures, PRD, scenario specifications, traceability, task/verification records, and these receipts support that behavior. [Artwork findings](../../real-search.md#feed-updates-and-artwork-november-9) document existing blank-art adapters and the YouTube branding renderer. No artwork integration is changed. Scheduled searches using Hermes's scheduled jobs list are a separate requested update.

No merge, installed-plugin change, or live paid search was performed. Exact final-head review is recorded in the PR description. Prefer a squash merge to combine the intentionally failing regression commits with their fixes.
