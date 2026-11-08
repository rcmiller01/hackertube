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
- Installed broad/strict AI comparison: pending. This document will record actual counts and quality limitations before task 8.4 is marked complete.

A scripted provider test validates the contract, not the model's semantic judgment. Category caps prevent domination but do not establish relevance. The next installed checks need to show that the strict request retrieves candidates and that category-specific weak matches are omitted; a broad multi-question relevance evaluation remains separate. Existing Apple audiobook naming, the 200-character error message, and source/release obligations are recorded findings outside this PR's current scope.
