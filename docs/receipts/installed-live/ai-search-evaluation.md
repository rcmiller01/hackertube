# AI category and qualifier test — November 8, 2026

Runtime: installed package matching `1624f417cea084dbf0f44d85ba99c3d244158da9`; existing Hermes OpenRouter `deepseek/deepseek-v4.1-flash`, same default profile and source configuration. No runtime code, provider assignment, interests, saves, or source settings changed during this comparison.

| Request | Job | Videos | Podcasts | Books | Audiobooks | Outcome |
|---|---|---:|---:|---:|---:|---|
| Find useful videos, podcasts, books, and audiobooks about AI (artificial intelligence). | job:6 | 0 | 7 | 7 | 10 | succeeded; 24 results |
| AI for nontechnical beginners: clear introductions, no coding, academic textbooks, or daily news. Include videos, podcasts, books, and audiobooks. | job:7 | 0 | 0 | 0 | 0 | succeeded; no matches |
| Artificial intelligence. Include videos, podcasts, books, and audiobooks. Rank accessible introductions first. | job:8 | 0 | 9 | 5 | 10 | succeeded; 24 results |

Each completed job reported **9/12 logical requests**, a 24-result cap, and unknown cost. On-disk rows are in `ai-jobs.json`; actual rendered responses are `ai-broad.txt`, `ai-narrow.txt`, and `ai-accessible.txt`. Screenshots record the broad and accessible-introduction results. The browser automation's wait expired during two checks, but both searches later finalized `succeeded`. Exact wall-clock latency was not captured reliably; those automation timeouts do not establish a server deadline breach.

## Findings

- **Broad AI works across three available formats**, but mixes technical textbooks, daily news, business applications, ethics, and general introductions. The broad books included Russell/Norvig's Artificial intelligence alongside Human Compatible, Life 3.0, and Atlas of AI. Those titles demonstrate mixed audiences; this is not an independent content-quality evaluation.
- **A soft ranking qualifier improves the apparent audience fit without emptying the results.** The accessible-introduction request put AI LITERACY and Artificial Intelligence 101 at the top of podcasts, Melanie Mitchell's Artificial Intelligence first among books, and Artificial Intelligence For Dummies first among audiobooks. Suitability is inferred from source metadata and model explanations, not a review of complete media content.
- **The stricter qualifier/exclusion combination is brittle.** It returned zero across every format while reporting `succeeded`. The response does not expose candidate counts or the interpreted retrieval query, so this walkthrough cannot determine whether retrieval or ranking caused the empty result. A follow-up should capture those stage outputs and separate retrieval subject from audience/exclusion preferences before deciding on a fix.
- **Video coverage is blocked by source setup.** YouTube reported `missing_api_key` in all three searches, and no Vimeo video was admitted from broader web search. A wording change cannot enable the YouTube source. Podcast Index is also missing keys; Reddit remains approval-gated. None was enabled or queried.
- **Longer qualifiers hit an unexplained input limit.** The first strict request exceeded the existing 200-character boundary and the result panel displayed only `question` (`ai-long-query-error.txt`), with no new job. That input limit is in `search.canonical_question`; a follow-up should give a useful length message/counter.
- **Audiobook source labels need clearer naming.** Retrieved Apple audiobook records appear as `Public source` / `Apple Podcasts`. They are typed as actual audiobooks, but the displayed source wording is confusing. This evaluation did not change taxonomy or rendering.

## Working prompt

> Artificial intelligence. Include videos, podcasts, books, and audiobooks. Rank accessible introductions first.

This currently gives useful introductory candidates for the three available formats. Test it again after enabling YouTube to assess the fourth format. Do not claim that all four formats have passed yet.

## Credential guidance verified

This local Hermes build exposes arbitrary plugin key values through **Keys → Custom keys**, rather than a settings form on the HackerTube plugin card. Add `YOUTUBE_API_KEY` there, save its value directly in Hermes, then reopen HackerTube → Focused search → Search sources and explicitly enable YouTube. No key was entered, copied, revealed, or stored in the repository during this test.

For a new Google key, enable YouTube Data API v3 in a Google Cloud project, create an API key under Credentials, and apply an API restriction to YouTube Data API v3. API keys cover public-data access; OAuth is for user-authorized/private data. Official reference: https://developers.google.com/youtube/registering_an_application . The UI was inspected read-only and left open for the user; adding credentials and enabling YouTube remain pending.

## YouTube-enabled follow-up

The user added the key in Hermes and explicitly requested enabling YouTube and rerunning the same accessible-introduction query. The agent inspected only credential availability, never the key value. The source checkbox became available, the enablement was saved in the profile, and the YouTube API source reported success.

The first run (`job:9`) used **11/12 requests**, then failed ranking and displayed zero results. A second run (`job:10`) reproduced the failure with temporary stage-metadata diagnostics: **57 ranking candidates**, provider finish reason **length**, **0 final text characters**, no parsed object. No prompt, provider reasoning, response content, or credential value was captured by that diagnostic. The native-facade regression was corrected to use valid fixture identifiers and committed red in `b71e99d` before the runtime fix; it then failed at the actual empty-JSON boundary.

The single production structured-completion site now permits **16,000 ranking completion tokens**, including hidden reasoning, and its prompt asks for at most 24 concise useful matches with relevant format variety. Interpretation remains 2,500 tokens. Candidate recall remains capped at 60 rather than dropping candidates to fit the previous allowance. Job limits remain **12 logical requests / 24 results / 45 seconds**. No silent model retry, credential copy, provider switch, or fallback promotion was introduced. Temporary instrumentation was removed before the final run.

The clean installed candidate succeeded (`job:11`):

| Format | Rendered recommendations | Example / quality observation |
|---|---:|---|
| Videos | **5** | Two accessible-introduction lectures, a TED talk, and two very short videos. |
| Podcasts | **6** | Mix of shows and episodes; several news entries remain rather than introductory material. |
| Books | **1** | The Computer and the Brain — foundational/historical, a weak fit for a modern accessible introduction. |
| Audiobooks | **12** | Several beginner-oriented titles; audiobook source naming remains confusing. |

Total **24**, **11/12 logical requests**, job `succeeded`, cost unknown. Eight YouTube items persisted; all eight YouTube evidence rows have expiry timestamps. `youtube-checks.json` records source success and enablement without credentials. `youtube-all-formats.txt` and `.jpg` show the actual final page; failed outputs and stage-metadata diagnosis are retained separately. YouTube remains enabled for the user's further tests.

This passes four-format retrieval/rendering for the exercised query. It is not a relevance-quality pass, proof that all configured models fit these bounds, or completion of all YouTube source release obligations. The query interpreter still varies its retrieval wording across calls, so this is a functional rerun rather than a controlled A/B relevance experiment. Podcast Index remains missing credentials; Reddit remains approval-gated. Existing setup/terms/lifecycle gates are not silently closed.

Validation: **233 Python passed / 0 failed**, **71 JavaScript passed / 0 failed / 0 skipped**, Hermes plugin validation without warnings, changed-Python lint, strict specs, and traceability checks. Runtime code is identified by the commit containing this follow-up and `youtube-runtime-manifest.json`; **34/34 installed runtime files match**. The original installed/live manifests remain historical.
