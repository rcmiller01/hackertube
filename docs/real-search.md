# Real search and installation

Implemented on the `codex/live-search-package` branch, November 8, 2026. Product scope follows the original [source matrix](sources.md), [PRD](PRD.md), and focused-search scenarios. The seeded demo catalog is unchanged.

## One installable directory

`hackertube/` now contains the native manifest and entry point, dashboard, `hackertube_core/`, and the seed. Copy/install that complete directory; its parent repository and development environment are not runtime dependencies. The native entry and dashboard resolve imports from the installed directory. No second core package is kept at repository root.

For a local installation, copy `hackertube/` to a new `$HERMES_HOME/plugins/hackertube/`, then run `hermes plugins enable hackertube`. If that target exists, back it up and replace the complete package rather than nesting another copy inside it. Reload the Hermes process that serves the dashboard after installing or updating native plugin code. Public/catalog distribution would use the repository URL with the `#hackertube` subdirectory and a reviewed commit pin; this branch has not been published.

## Existing Hermes providers

The native `register(ctx)` registers the `hackertube_search` auxiliary task and binds its `ctx.llm` and `ctx.dispatch_tool` facades for the canonical serving profile. The dashboard opens Hermes's public `/api/model/auxiliary` and `/api/model/options?explicit_only=true` routes when the Search panel opens. This also causes Hermes to discover native task registrations when necessary. No model request starts while opening that panel.

Choose an existing provider/model and click **Use for search**. The page writes only the `hackertube_search` slot through `/api/model/set`; it does not replace the main chat model. **Use current Hermes model** clears the slot's explicit model/provider choice. Named custom providers retain their Hermes identity; Hermes resolves their existing endpoint and authentication. HackerTube sends only provider/model identifiers, never copies endpoint credentials. An unnamed custom route can continue through the current Hermes model; manage a separate endpoint choice in Hermes Models. Hermes's expensive-model confirmation remains enforced; if it asks for confirmation, finish the choice on the Hermes Models page.

Search waits for model/source setting writes to finish. A failed write must be retried or read back before another search can start; delayed configuration reads cannot overwrite a newer choice.

The same selection is available under **Hermes Models → Auxiliary → HackerTube search**. Model authentication, endpoints, fallback routing, usage, and provider trust stay with Hermes. There is no plugin-owned model key, endpoint, or model SDK. The former `live` setting migrates to `hermes`; `stub` remains an explicitly selected offline test provider.

The binding stores no credentials. It is keyed by the resolved profile directory, supports `/var` versus `/private/var` aliases, and unregisters on plugin unload. If the native entry has not loaded, Search refuses before inference rather than silently selecting a stub.

## Explicit search flow

1. Require the credit/quota disclosure on every submission.
2. Ask the selected Hermes model for a validated topic, formats, depth, optional author, and time constraint. Invalid model JSON does not silently become a successful local interpretation.
3. Query enabled, relevant source adapters and the configured Hermes web-search tool. The bundled seed supplies no candidates to this real retrieval stage.
4. Ask the same Hermes task to rank at most 60 retrieved candidate identities. Invented IDs are rejected. Format constraints are applied before the result limit; duration unknowns stay labeled and outside strict matches.
5. Persist normalized retrieved items/evidence in this profile's `plugin_db` database. The response includes the updated catalog so new results immediately have Save/Open controls. Later catalog/library reads resolve those same identities after a restart. Expired metadata requires current identity evidence; community mentions cannot extend its lifetime. Saved entries with unavailable metadata remain visible as placeholders.

Actual dashboard Search now runs in a supervised process group, with an independent deadline/parent-death watchdog. The job allows 12 logical dispatches, 24 results, and a 45-second local deadline including CLI startup. Deadline expiry and Cancel stop/reap local worker work; already accepted remote processing/billing cannot be undone. Per-call remaining-budget forwarding is retained (8,000 interpretation / 16,000 ranking completion tokens including reasoning). Status/results and observed request counts are persisted; interrupted work never resumes paid calls. See [execution, cancellation, supported platforms and API](search-execution.md). The older rehearsal sections below describe their pinned historical candidates, not the current hard-stop behavior.

A failed source is named and does not discard other retrieved records. If ranking fails, unranked remote candidates are not promoted as LLM recommendations. Unknown provider/search cost, including an unsuccessful paid web attempt, makes the total unknown, not zero. Per-job usage is counted in its own request context; process totals remain cumulative diagnostics. Completed Apple subqueries survive a later query failure or limit. Local browsing, saves, dismissals, and opens start no model/search requests. The plugin submits only the question and bounded candidate metadata; it requests neither Hermes memory nor unrelated chat history.

## Sources from the original plan

| Source | Real-search path | Setup and limits |
|---|---|---|
| Hacker News | Bounded Algolia query; discussion links are evidence, not standalone media cards | No key; mentions do not become endorsements. Raw comments/usernames are not retained. Only evidence linked to admitted media identities is retained. |
| YouTube | Data API `search.list`, followed by a bounded `videos.list` metadata lookup | Declared `YOUTUBE_API_KEY` and explicit source enablement; metered; no oEmbed fallback. No artwork or media downloads. Data API evidence expires after 30 days; expired stored metadata is purged on catalog reads/writes. Source notices and deletion behavior remain part of the release review. |
| Apple/iTunes | Targeted podcast-show, podcast-episode, and audiobook lookups, according to requested formats | No key; artwork/previews are omitted. Shows and episodes remain distinct. |
| Podcast Index | Signed `search/byterm`; retrieved records are labeled whole shows | Declared `PODCASTINDEX_API_KEY` and `PODCASTINDEX_API_SECRET`, plus explicit source enablement; conservatively metered because rate limits are dynamic. No feed crawling or inferred episode duration. |
| Open Library | Bounded work search | No key; unknown duration/availability stays unknown. New searches do not download covers. |
| LibriVox | Bounded author lookup when an author is known, otherwise title lookup | No key; a no-match 404 is an empty result. Only actual audiobook records are admitted. |
| Reddit | Listed with `approval_absent`; no request | Remains disabled pending the approval and selected-subreddit setup specified in the original plan. |
| Broader public web | Existing Hermes `web_search` provider through `ctx.dispatch_tool` | Uses the user's configured search service and may incur credits/quota. Only recognized media-record URLs are admitted: Open Library works, Gutenberg ebooks, Vimeo video records, and Apple podcast records. Other pages remain outside verified media coverage. Search does not invent audio editions from a web title or bypass YouTube's metadata path. |

Source choices are still profile-local. YouTube and Podcast Index remain off until explicitly enabled in the Search panel after credentials are configured. `/sources` shows credential availability without returning secrets, and `POST /sources` changes an enabled source choice. A missing key/approval is reported rather than represented as working coverage. Source-specific keys are read only through their declared Hermes secret scope; model credentials are never read by HackerTube. Podcast Index and YouTube paths have offline response/credential/budget checks. The November 8 installed YouTube check now passes with a user-supplied key; Podcast Index is still untested with credentials. See the four-format follow-up below.

## Reproducible development checks

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
npm ci
npm run setup:browser
.venv/bin/python -m pytest tests -q
npm test
python3 scripts/check_spec_coverage.py
python3 scripts/check_spec_coverage_fixtures.py
hermes plugins validate "$PWD/hackertube" --install-deps
```

The Node dependencies are development-only and locked at repository root. Runtime React still comes from the Hermes dashboard SDK. Historical receipts refer to their original commit layouts; current commands and paths are above.

## Observed evidence

A bounded live run used the existing Hermes OpenRouter route and `deepseek/deepseek-v4.1-flash`: 3 new vegetable-gardening book results in 10.082 seconds, 2 public source reads, 2 model invocations, and 1 Hermes web-search invocation. The returned model/search cost was unknown. The search did not change the user's configured provider or install/enable a plugin. Its registration and results were confined to the probe process and temporary result storage.

A separate clean-profile test copied only the installable directory, used the actual local Hermes loader and `plugin_db`, registered the auxiliary task, and served the catalog and live-provider availability through the actual plugin router. It made no model call. The current local Hermes was `v0.23.0+1212.g719240d`; the release-tag source also contains the required auxiliary/model-selection interfaces, but a new end-to-end run on that older tag was not performed.

Receipts are in `docs/receipts/live-search/`. These targeted checks establish the implemented paths, not a 20-question relevance result, a completed release, a public installation, or authorization to submit the hackathon entry.

## Primary implementation references

- Local Hermes docs: `website/docs/developer-guide/plugin-llm-access.md` and `website/docs/user-guide/features/extending-the-dashboard.md`; the public plugin API inventory is `hermes_cli/data/plugin_api.json`.
- [Open Library search API](https://openlibrary.org/dev/docs/api/search).
- [LibriVox API fields and lookup modes](https://librivox.org/api/info).
- [YouTube search.list](https://developers.google.com/youtube/v3/docs/search/list) and [developer policies](https://developers.google.com/youtube/terms/developer-policies).
- [Podcast Index API documentation](https://github.com/Podcastindex-org/docs-api) and [official request examples](https://github.com/Podcastindex-org/example-code).

## Installed-host live walkthrough

The November 8 installed walkthrough found and fixed two gaps missed by the isolated probe: a cold dashboard had not discovered the host web-search tool, and the reasoning model exhausted the original ranking completion cap before returning JSON. Explicit web search now uses the public host tool discovery path before dispatch, and ranking has an 8,000-token completion allowance within the existing request/time limits.

In the actual default Hermes profile, the configured OpenRouter model returned three fresh gardening books; Save and source-link launch worked, and the saved/opened state survived a dashboard restart. The dedicated search model selection remains configured; the main model and other auxiliary settings were unchanged. Open Library presented a human-verification checkpoint after the source link opened, so content beyond that checkpoint was not checked. See [installed walkthrough and receipts](receipts/installed-live/README.md). Keyed YouTube/Podcast Index and remaining source/release obligations remain open.

## Four-format AI search with YouTube

After the user added `YOUTUBE_API_KEY` through Hermes Keys, YouTube was explicitly enabled and its `search.list` / `videos.list` path succeeded. A larger 57-candidate pool exhausted the previous 8,000-token ranking allowance without final JSON. Ranking now allows up to 16,000 completion tokens, including hidden reasoning, and requests at most 24 concise useful matches. At that revision interpretation retained 2,500 tokens (raised to 8,000 after the installed rehearsal below); input candidates remain capped at 60, and job request/result/time limits are unchanged. No automatic retry or fallback to unranked records was added.

The live AI query succeeded with **5 videos, 6 podcasts, 1 book, and 12 audiobooks**, using **11/12 logical requests**. This verifies retrieval and rendering in all four formats; relevance is mixed, including news podcasts and a historical book rather than a modern introduction. Eight YouTube source records persisted with expiry metadata. YouTube remains enabled. Podcast Index credentials, Reddit approval, and remaining source release obligations are still open. Evidence: [four-format follow-up](receipts/installed-live/ai-search-evaluation.md#youtube-enabled-follow-up).

## Category relevance follow-up (PR #17)

Interpretation now emits a validated subject-only `retrieval_query` separately from the full topic/purpose. Source adapters and Hermes web search use that one query; audience and exclusion wording stays in the original request supplied to ranking. Older scripted interpretation responses without the new field fall back to their topic. The results show the selected topic query and level so a user can inspect the interpretation.

Ranking compares all supplied metadata with the complete request, using separate guidance for substantive learning videos, educational podcasts versus news, books appropriate to the audience, and actual matching audiobook editions. Every ranked row must have a submitted ID, a concise explanation, and fit `direct`, `related`, or `uncertain`. Only direct fits are recommended. This fit is inferred by the model; source verification establishes identity/provenance, not that relevance was independently verified. Explanations are labeled **Model relevance** in the page.

Candidate input remains bounded at 60 and is interleaved across the four visible categories; podcast shows and episodes share one category and interleave inside it. The final result allowance is shared across requested categories after format, duration, and dismissal checks: a 24-result four-category request allows up to six per category. Missing matches leave unused slots. A single-category request retains its full result allowance. One first match per available category precedes extras, including when the overall result limit is not divisible by the number of categories. Within each category, the model order is preserved.

A malformed ranking row no longer discards good siblings: bad IDs, explanations, or fit values are counted/ignored, and a valid partial ranking is labeled partial. If no valid direct rows remain alongside malformed entries, ranking still fails closed. Intentional related/uncertain omissions are counted separately from errors. No paid retry or promotion of unranked source records is introduced. Response diagnostics include input candidate count, ignored entry count, and intentional omissions.

The existing two model invocations, 16,000-token ranking allowance, 12-request / 24-result / 45-second limits, source configuration, credentials, and saved library are retained. Check evidence and current live disposition: [results-tuning receipts](receipts/results-tuning/README.md).

### Exact-head PR #17 review corrections

Validated duplicate ranking entries that disagree about fit now exclude their shared identity; neither order nor a direct duplicate can override a valid related/uncertain assessment. Other valid recommendations remain available with partial status. Consistent duplicates still deduplicate as before, and wholly conflicting output fails closed without a paid retry. Diagnostics distinguish `conflicting_identities`, invalid rows, and intentional related/uncertain omissions. The duration caption says **Time limit**, so its absence is not presented as absence of audience or exclusion preferences. Exact-head review and reproduction evidence: [PR #17 review](pr17-review.md).

## Installed demo rehearsal follow-up

The old 2,500-token interpretation allowance produced no parsed JSON in installed job:14. The single native completion site now allows 8,000 interpretation tokens; ranking remains 16,000. This is a bounded allowance, not a guaranteed successful answer. Tests reproduce the exhausted structured-response boundary before the fix. The next interpretation returned valid JSON, but DeepSeek ranking stalled inside Hermes beyond the remaining budget; restarting only the local dashboard stopped that attempt. No automatic retry, provider switch, or unranked fallback was added to plugin code.

The user-configured Search slot was explicitly changed in the UI from OpenRouter DeepSeek to the existing OpenRouter `openai/gpt-5.4-mini` route for the rehearsal. Main and unrelated auxiliary models were untouched. Two completed AI searches then succeeded (11 and 13 results), all four categories, 11 logical dispatches each, unknown cost. Final job:16 took about 8.1 seconds between visible launch/results observations. The UI calls the 45 seconds a work budget and explicitly discloses that in-flight Hermes calls may finish later; cancellation is not implemented. The former claim of a hard deadline is not retained.

The final actual installed demo is 36.25 seconds, with prepared catalog, explicit search/disclosure, all four categories, Save/Open at a rendered Apple Podcasts source, Karpathy credit, and prepared listing copy. Saved state survived a dashboard restart; a clean profile loaded the 12-item seed without credentials. Detailed checks and remaining gates: [rehearsal receipt](receipts/demo-rehearsal/README.md), [submission packet](submission/README.md).

### PR #18 review: pending-call disclosure

The budget/cancellation limitation now appears in the Hermes Search panel before submission and remains visible while the request is pending, in addition to the completed job summary. Both the question and submit control reference it for screen readers. The offline stub omits the Hermes-only note and its ARIA reference. The 36.25-second video and live-query counts above remain historical evidence for candidate `c691a75`; this disclosure fix makes no model or search call. See [PR #18 exact-head review](pr18-review.md).

## Feed updates and artwork (November 9)

The dashboard now rereads the local catalog and interest-ranked feed once when the current Search finishes, including failure, timeout, and cancellation responses. Duplicate and stale responses do not trigger rereads. This is local work: there is no extra Search, model call, or scheduled remote refresh. Interests can be removed using the adjacent × button. The controls above Ranked feed can be collapsed without stopping Search or hiding the feed. Scheduled searches in Hermes's scheduled jobs list are a separate requested update.

Missing artwork is currently an implementation limitation, rather than a missing model or search credential:

- YouTube: **updated November 10.** `adapters/youtube.py` keeps the largest official `https` thumbnail URL from `snippet.thumbnails` on the existing keyed `videos.list` payload and stores it only after a display check: one `free` GET of the public thumbnail host that reads the status and content type and never reads the image body. No Data API, oEmbed, metered, or paid call was added, and no image bytes are downloaded or cached (Developer Policies III.E.1). The dashboard hotlinks the stored URL, shows it unaltered (its own aspect ratio, no crop, no overlay), and keeps the official linked Icon beside it. A record without a display-cleared thumbnail, or an image that fails to load, shows the linked Icon only.
- Apple podcasts/audiobooks: `adapters/itunes.py` deliberately omits artwork because the current cards lack the required store-badge presentation described by its policy. Another API key does not change this.
- Open Library: `adapters/openlibrary.py` emits blank artwork for new results; cover use is only assigned when building the curated seed. The dashboard renders approved seed hotlinks, explaining why some older books have covers while new ones do not.
- Podcast Index: its adapter emits blank artwork independently of credential availability. Adding its missing key/secret can improve podcast coverage but does not enable artwork in these adapters.

No artwork behavior is changed here. A dedicated artwork follow-up should map provider-supplied images and attribution through adapters, stored records, and rendering, with source-specific lifecycle checks.

**November 10 update:** the YouTube half of that follow-up is done, as described above. The other providers are unchanged.
