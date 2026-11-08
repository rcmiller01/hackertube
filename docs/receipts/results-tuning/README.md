# Results tuning — PR #17

Baseline: PR #16 reviewed head `076495c083cbab8c753e0a1cabbf677497d9c359`, merged by explicit user request with squash SHA `206084688822a21847f989cd959d99f93cfa48cc`. The existing installed walkthrough is the motivating evidence, rather than a new claim about the baseline.

## Changes

- Subject-only source query is separate from full intent/audience/exclusions. All source adapters and web search use the same validated query. Older scripted responses without it fall back to topic. The UI shows query and level.
- Ranking guidance distinguishes useful learning videos, educational podcasts versus news, audience-appropriate books, and actual matching audio editions. Explicit fit is `direct`, `related`, or `uncertain`; only direct fits are recommended. Fit is model-inferred, with an on-page label, rather than an independent content-quality certification.
- The 60-input allowance is shared across four categories, with podcast episodes/shows interleaved inside one. Final caps are shared across requested categories after existing duration/dismissal/format checks. Full four-category searches allow up to six each at 24 total; single-category requests retain the full allowance. Sparse categories leave unused slots. Round-robin selection reserves one per available category before extras under uneven overall limits, preserving within-category model order.
- Invalid ranking rows no longer discard valid siblings. Validation counts/partial status are reported; intentional related/uncertain omissions are separate. Entirely malformed rankings still fail closed. There is no implicit retry or promotion of unranked records.

## Scope audit

One native interpretation prompt and one interpretation decoder; one common source-query assignment feeds all adapters and the web tool. One production rank caller, one native completion site for both stages, and one ranking validator. One shared result selector enforces category caps for live ranked results. One UI result renderer and one job summary expose the subject and relevance provenance. Six valid injected model-response fixtures across three test files gained fit values without weakening assertions. The feed/stub ranking path is unaffected.

The implementation changes four existing runtime files; it adds no runtime module, dependency, scheduling, credential path, or external source. Requests remain two model invocations plus selected source/web calls; job limits stay 12 requests / 24 results / 45 seconds, with the existing 16,000-token ranking allowance. Source failures, unknown cost, Save/Open persistence, and profile handling retain their existing boundaries.

## Verification

- Committed red regression `0a7420e`: 16 failures / 1 passing single-category control. The red log exercises data flow, filtering, salvage, and category allocation through public interfaces.
- Additional red checks: uneven overall result limit (`52325fe`), UI subject/inference labels (`662641b`).
- Current offline check: 251 Python passed / 0 failed; 72 JavaScript passed / 0 failed / 0 skipped. Existing Starlette/httpx warning remains.
- Strict specs, coverage and its 14 invalid / 1 valid fixtures, lint, and Hermes plugin validation pass without plugin warnings.
- Installed checks on Hermes v0.23.0+1212.g719240d / Python 3.14.9 exercised runtime `d3e115eb9ac96e3623b48bf582e93fbc7357df9d`. The complete 34-file installed payload matches `runtime-manifest.json`. A private backup of the prior installed package/profile is recorded in `install.json`.
- Strict request (same wording as earlier empty result): **2 videos / 2 podcasts / 1 book / 5 audiobooks**, 10 total; job:12 `succeeded`, **11/12** logical requests, cost unknown. The UI showed subject query `artificial intelligence` and level `beginner` separately from the full excluded-topics request.
- Broad accessible-introduction request: **3 videos / 4 podcasts / 2 books / 6 audiobooks**, 15 total; job:13 `succeeded`, **11/12** logical requests, cost unknown.
- Numeric disposition: **2/2** installed searches succeeded; **4/4** categories nonempty in each; **0/4** categories exceeded the six-item cap in each. This is a functional/metadata check, not a measured semantic-precision score. No retry was launched by the implementation.
- The selected videos are explanatory 5–9 minute entries; podcast titles include AI 101 and AI Literacy; the strict book is Melanie Mitchell's Artificial Intelligence. None of the earlier visible news-only entries, 18-second/one-minute clips, or The Computer and the Brain appears. These observations are from source metadata/model explanations, not a full content review. The broad set includes one explanation hedged with “likely”; direct-fit labels still depend on model judgment and are not a guarantee of complete audience suitability.
- Before/after database comparison confirms saved item state, interests, open events, and source settings are unchanged. The existing configured OpenRouter model and YouTube enablement remain selected; no credential value was inspected.
- Full outputs/screenshots: `strict-ai.txt` / `.jpg`, `broad-ai.txt` / `.jpg`. `live-checks.json` records terminal jobs and state comparisons. These fresh-source reruns are not a controlled A/B experiment: the earlier strict baseline did not have YouTube enabled, and source results were not frozen.

A scripted provider test validates the contract, not the model's semantic judgment. Category caps prevent domination but do not establish relevance. The installed checks demonstrate that the strict request retrieves candidates and the observed weak matches are omitted; a broad multi-question relevance evaluation remains separate. Existing Apple audiobook naming, the 200-character error message, and source/release obligations are recorded findings outside this PR's current scope.

## Codex review and remaining limits

The implemented runtime at `d3e115eb9ac96e3623b48bf582e93fbc7357df9d` was re-read against the merge base after validation. Candidate selection preserves the 60-input bound and both podcast record types; final category caps follow eligibility checks; small/uneven result limits reserve each available category before extras; unknown or malformed ranking values do not admit identities outside the submitted set. Entirely malformed output still fails closed. Source-query fallback remains compatible with older scripted interpretation responses. No outstanding implementation finding was identified in that pass; the subsequent receipt commit does not change runtime code. The final remote head is read back after pushing.

No new package or runtime directory was introduced. There is no new provider, prompt-history/memory access, paid retry, web source, or secret store. Token/time/request limits are unchanged. Ranking remains sensitive to model behavior and retrieved metadata, and source-query semantic accuracy is still model-dependent despite its separate typed field. Current-source freshness and unknown audiobook duration are not inferred as facts. This PR does not close HCKT20's broader relevance evaluation, the Apple audiobook source-name issue, the 200-character error-message issue, or remaining source/release obligations.
