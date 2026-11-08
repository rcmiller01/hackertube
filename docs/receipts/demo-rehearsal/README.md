# Installed demo rehearsal — November 8, 2026

Original readiness items 1/2 (self-contained packaging and actual retrieval through an existing Hermes provider) are implemented. Original item 4's format-limit and timeout-forwarding defects are fixed. **A hard wall-clock deadline is not complete:** this rehearsal reproduced an in-flight Hermes ranking stall beyond the 45-second work budget. Cancellation/restart recovery remains task 6.2. Item 5's rehearsal, actual video, screenshots, and local submission drafts are prepared; public submission gates remain open. Seed expansion/item 3 stays skipped.

Host: Hermes `v0.23.0+1212.g719240d`, Python 3.14.9, actual installed default-profile dashboard on loopback port 9119. Runtime starts from reviewed PR17 head `fb34c2237ff5f26fdcc97a959a6f9889e47052c2`, with the two runtime edits described below. PR17 is unmerged. Candidate pin and installed hashes are recorded in `candidate.json` / `runtime-manifest.json` after the candidate commit exists; no hidden temporary instrumentation was used in the final run.

## Findings and changes

1. Installed job:14 failed before retrieval: the selected DeepSeek reasoning model returned no parsed JSON with the 2,500-token interpretation allowance. Host audit recorded `content_type=text`, 2,740 total tokens. A larger allowance returned JSON at 3,226 total tokens, consistent with exhaustion of the smaller allowance; the original finish reason was not captured, so token exhaustion is an inference. The native-facade test recreates an exhausted structured-answer boundary; it is not a replay of the vendor response. It failed before the fix in `28f7e54`. Interpretation now allows 8,000 completion tokens including reasoning; ranking remains 16,000. One `ctx.llm.complete_structured` site covers both stages, with remaining-budget forwarding retained and no new retry/fallback.
2. The next DeepSeek interpretation succeeded, but ranking remained in-flight beyond the work budget. Only the dashboard was restarted to stop the attempt; the gateway was untouched. No terminal job was persisted for that interrupted attempt. Its final vendor usage/cost is unknown. Changing a token allowance alone does not fix host transport/retry deadlines.
3. The job summary advertised a deadline although cancellation is deferred. The UI regression was committed red in `afa5349`; the one `limitsLine` helper, used at one result-rendering site, now calls it a work budget and explicitly discloses in-flight overrun and absent cancellation. This clarifies a limitation; it does not implement cancellation or a hard timeout.
4. In the actual UI, selected the existing OpenRouter `openai/gpt-5.4-mini` route for the HackerTube auxiliary slot. Main and unrelated auxiliary models were not changed. This explicit selection is for the rehearsal, not an automatic code fallback.

## Observable acceptance results

| Check | Value | Threshold / disposition |
|---|---:|---|
| Original constraint checks | 4 passed, 0 failed | Format-before-cap; remaining timeout forwarded; slow search permits feed read; budget stops new work — pass |
| Isolated native package probe | exit 0, 12 seed items, slot registered | No sibling core or configured credentials — pass |
| Separate clean-profile actual UI | 0 videos / 4 podcasts / 4 books / 4 audiobooks, 0 saves | Untouched development seed — pass; no seed expansion claimed |
| Successful live job:15 | 3 video / 2 podcast / 1 book / 5 audio | 11 total; all four types — pass |
| Final recorded live job:16 | 4 video / 3 podcast / 2 book / 4 audio | 13 total; all four types — pass |
| Job:16 logical requests | 11 | ≤12 — pass; vendor retries not independently counted |
| Job:16 visible launch-to-result | ~8.1 seconds | <45 for this run — pass; not a hard-bound guarantee |
| Final MP4 | 36.25 seconds, 889,739 bytes | <90 seconds — pass |
| Saved state across dashboard restart | both previously saved items retained | 2/2 — pass; final rehearsal added a third item |
| Original source | rendered Apple Podcasts page | Same saved podcast source opened — pass; no CAPTCHA bypass |
| Attribution | About, installable README, prepared listing | Karpathy credit visible — pass |
| Full Python suite | 261 passed / 0 failed | Pass; one existing Starlette/httpx deprecation warning |
| JavaScript/browser suite | 73 passed / 0 failed / 0 skipped | Pass |
| Native plugin validation | pass, 0 security failures | Host isolation information recorded; no plugin warnings |
| Strict OpenSpec | 1 passed / 0 failed | Pass |
| Traceability | 32 PRD IDs / 95 scenarios | Pass; does not prove all runtime scenarios |
| Coverage fixtures | 14 invalid rejected / 1 valid accepted | Pass |
| Changed-Python fatal lint | 0 findings (E9,F63,F7,F82) | Pass |
| Broader style lint | 66 findings before / 66 after | Unrelated baseline; not fixed or represented as passing |

Full checks live beside this report. `live-results.txt`, `original-source.txt`, `karpathy-credit.txt`, screenshots, and `walkthrough.json` preserve UI observations. Ordinary browsing/library zero-paid-call behavior is covered by the existing full-suite request-boundary checks; actual restart/library reads started no new Search. State snapshots preserve the saved items/source settings without credential values. Missing Podcast Index keys and Reddit approval remain visible in live results. All model/provider cost remains **unknown**, not zero.

## Recording and artifacts

Final video: `/Users/robert/Documents/Codex/2026-11-08/hackertube-demo/hackertube-demo.mp4`.

Raw timestamped frames and full DOM step observations: `/Users/robert/Documents/Codex/2026-11-08/hackertube-demo/final/`. The video is an actual low-frame-rate tab capture (about five captures/second), encoded to H.264 at 20 fps using original wall-time frame durations. It is silent, has no generated scenes, does not speed up or remove the live search wait, and includes page/catalog, one explicit live search, all four result sections, Save, original-source page, About credit, and explicitly prepared marketplace copy. The screenshots/step observations were inspected; the MP4 duration was measured with ffprobe. Failed earlier takes are retained locally, outside Git.

Local intended form/contact draft: `/Users/robert/Documents/Codex/2026-11-08/hackertube-demo/entry-form.private.json`. Public URL fields remain null. See [submission packet](../../submission/README.md) for prepared copy, exact-pin catalog draft, and unresolved public clone, source-term, eligibility/IP, and publication gates. No upstream catalog PR, X post, or form was sent; repository visibility was not changed. No credential value was read or copied.
