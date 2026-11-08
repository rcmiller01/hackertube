# Real search and installation

Implemented on the `codex/live-search-package` branch, November 8, 2026. Product scope follows the original [source matrix](sources.md), [PRD](PRD.md), and focused-search scenarios. The seeded demo catalog is unchanged.

## One installable directory

`hackertube/` now contains the native manifest and entry point, dashboard, `hackertube_core/`, and the seed. Copy/install that complete directory; its parent repository and development environment are not runtime dependencies. The native entry and dashboard resolve imports from the installed directory. No second core package is kept at repository root.

For a local installation, copy `hackertube/` to a new `$HERMES_HOME/plugins/hackertube/`, then run `hermes plugins enable hackertube`. If that target exists, back it up and replace the complete package rather than nesting another copy inside it. Reload the Hermes process that serves the dashboard after installing or updating native plugin code. Public/catalog distribution would use the repository URL with the `#hackertube` subdirectory and a reviewed commit pin; this branch has not been published.

## Existing Hermes providers

The native `register(ctx)` registers the `hackertube_search` auxiliary task and binds its `ctx.llm` and `ctx.dispatch_tool` facades for the canonical serving profile. The dashboard opens Hermes's public `/api/model/auxiliary` and `/api/model/options?explicit_only=true` routes when the Search panel opens. This also causes Hermes to discover native task registrations when necessary. No model request starts while opening that panel.

Choose an existing provider/model and click **Use for search**. The page writes only the `hackertube_search` slot through `/api/model/set`; it does not replace the main chat model. **Use current Hermes model** clears the slot's explicit model/provider choice. Named custom providers retain their Hermes identity; Hermes resolves their existing endpoint and authentication. HackerTube sends only provider/model identifiers, never copies endpoint credentials. An unnamed custom route can continue through the current Hermes model; manage a separate endpoint choice in Hermes Models. Hermes's expensive-model confirmation remains enforced; if it asks for confirmation, finish the choice on the Hermes Models page.

The same selection is available under **Hermes Models → Auxiliary → HackerTube search**. Model authentication, endpoints, fallback routing, usage, and provider trust stay with Hermes. There is no plugin-owned model key, endpoint, or model SDK. The former `live` setting migrates to `hermes`; `stub` remains an explicitly selected offline test provider.

The binding stores no credentials. It is keyed by the resolved profile directory, supports `/var` versus `/private/var` aliases, and unregisters on plugin unload. If the native entry has not loaded, Search refuses before inference rather than silently selecting a stub.

## Explicit search flow

1. Require the credit/quota disclosure on every submission.
2. Ask the selected Hermes model for a validated topic, formats, depth, optional author, and time constraint. Invalid model JSON does not silently become a successful local interpretation.
3. Query enabled, relevant source adapters and the configured Hermes web-search tool. The bundled seed supplies no candidates to this real retrieval stage.
4. Ask the same Hermes task to rank at most 60 retrieved candidate identities. Invented IDs are rejected. Format constraints are applied before the result limit; duration unknowns stay labeled and outside strict matches.
5. Persist normalized retrieved items/evidence in this profile's `plugin_db` database. The response includes the updated catalog so new results immediately have Save/Open controls. Later catalog/library reads resolve those same identities after a restart.

Actual search runs in a worker thread so a slow synchronous provider does not block feed requests. The live job allows at most 12 logical model/search/source dispatches, 24 returned results, and a 45-second work budget. Source reads use at most the remaining budget or 10 seconds; model calls receive the remaining budget; the Hermes web tool receives an execution timeout. The plugin sends no new work after exhaustion. Hermes owns retries/fallback inside one host invocation, so these counts are logical invocations, not an independently observed count of every vendor network request. DNS and an in-flight host operation remain subject to their transport/host timeout behavior. This is not cancellation or restart recovery.

A failed source is named and does not discard other retrieved records. If ranking fails, unranked remote candidates are not promoted as LLM recommendations. Unknown provider/search cost makes the total unknown, not zero. Local browsing, saves, dismissals, and opens start no model/search requests. The plugin submits only the question and bounded candidate metadata; it requests neither Hermes memory nor unrelated chat history.

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

Source choices are still profile-local. YouTube and Podcast Index remain off until explicitly enabled in the Search panel after credentials are configured. `/sources` shows credential availability without returning secrets, and `POST /sources` changes an enabled source choice. A missing key/approval is reported rather than represented as working coverage. Source-specific keys are read only through their declared Hermes secret scope; model credentials are never read by HackerTube. Podcast Index and YouTube paths have offline response/credential/budget checks; they have not been live-tested with keys in this task.

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
