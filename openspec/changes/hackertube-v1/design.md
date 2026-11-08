# Design

## Context

The repository now contains the dashboard, core, and persistent state implementation. The original planning decisions below retain their history; the November 8 section records the real-search architecture. See proposal.md for scope. Public Hermes documentation describes web-dashboard tabs, plugin backend routes, and a separate native Desktop SDK. The exact host version, plugin LLM/search entry points, source adapters, and lifecycle behavior have not been exercised here.

This is an integration-first design. The behavior contract is specified; the host bindings remain conditional on task group 1 evidence. The November 11 hackathon cut is explicit in PRD section 13 and tasks 1 through 5. Tasks in group 6 preserve post-demo behavior. Documents being complete does not authorize pretending an unavailable host capability works.

## Goals and non-goals

Use one recommendation backend for web and explicit agent requests. Keep browser rendering independent of external inference. Store enough provenance to explain recommendations and enough user state to preserve the library.

Avoid introducing another agent loop, an inference router, a playback stack, or a native Desktop frontend. Exact package versions and API signatures are recorded after the feasibility probe rather than invented here.

## Decisions

### 1. Use the supported web-dashboard extension

The proposed package has a native plugin manifest, agent registration where needed, a dashboard manifest and prebuilt frontend bundle, and plugin-owned backend routes. Reuse host styling and authenticated request mechanisms exposed by its public SDK.

Alternative considered was patching Hermes or building a separate application. The extension keeps the product inside the requested web UI. The clean-profile probe must establish the actual supported layout, registration, and authentication behavior before this layout is finalized.

### 2. Separate read paths from explicit work

Feed reads, filters, and library mutations operate on prepared local data. Explicit Search and Refresh create bounded jobs that can retrieve, classify, and rank new candidates. Model calls and search requests use supported Hermes routes with profile-scoped credentials. The day-one fallback is a plugin-owned key in a secret `config_schema` or `requires_env` declaration, read through secret scope. It is never written to plugin data or read from a credential file by the plugin.

Alternative considered was generating recommendations on page load. That makes ordinary browsing unpredictable and violates zero paid browsing. If a required public model/search API is absent, record the gap and propose a supported binding before implementation continues. Reading credential files or patching core is not an alternative.

### 3. Keep identity, evidence, and user state distinct

Proposed domain records are MediaItem, Source, Evidence, Interest, UserItemState, SearchRequest, ResultSet, and Job. MediaItem retains canonical identity and format. Evidence retains source, retrieval time, excerpt or permitted reference, and whether endorsement is established. UserItemState separates saves, dismissal, completion, and opens.

Book works and audio editions are linked distinct items. Cross-format podcast records are linked without discarding format information. Stable source IDs take precedence over title matching. Ambiguous title-only matches remain separate until identity is established.

A transactional store in the plugin's supported profile data root is the proposed persistence choice. SQLite is the initial candidate, subject to storage and lifecycle verification. Browser-only persistence was rejected because the server and agent need the same state. A separate database service adds setup burden without an established requirement.

### 4. Normalize sources before ranking

Adapters report supported formats, access requirements, reuse limits, source status, and normalized records. A publisher feed is not an endorsement source. Ranking consumes verified item/evidence records and profile preferences. LLM output can select or explain retrieved candidates but cannot create verified identity or endorsement.

Begin with the proposed matrix in docs/sources.md. Hacker News is the default community. Reddit is restricted to explicitly selected subreddits after access approval. A broad scraper and full historical archive extraction are unnecessary. Source availability does not imply reuse permission. Adapters remain disabled when retention, display, or deletion terms for the implementation are unresolved.

### 5. Preserve results through bounded jobs

Jobs have queued, running, succeeded, partial, failed, cancelled, and interrupted outcomes. Persist job identity, limits, progress, usage availability, and result references. Retain the last successful feed until a replacement is ready. Cancellation stops new dispatch; in-flight calls can remain uncertain and must be reported accurately. Restart marks unfinished work interrupted and never resumes paid work implicitly.

The host lifecycle probe must establish a suitable execution mechanism. No independent persistent service is assumed. A cancelled or timed-out paid request is never silently replayed merely to obtain a cleaner receipt.

### 6. Scope personal context at the boundary

Interests and hub activity are allowed by default. A separate memory setting governs retrieval and onward submission of relevant Hermes memory. Context selection occurs before an external request. Result provenance records whether optional memory was used. Profile switching selects another private data root rather than sharing an unscoped singleton.

Feed selection and source blocking are distinct. As proposed in the PRD, disabling a feed stops ingestion but does not promise to exclude the publisher from broader-web search. Explain this in source controls.

### 7. Count backend outbound requests at one boundary; observe browser requests separately

Scope reconciliation for task 3.3: the November 6 owner direction recorded on Kanban task `t_7d655798` permits backend-only production accounting with browser artwork explicitly scoped in the receipts. `hackertube_core.outbound` is the single **Python-process** outbound boundary, not an interceptor for the browser or the Hermes host. The prior sentence claiming every outbound request passed through Python was incorrect. The page has four `SDK.fetchJSON` sites (catalog, feed, profile, mutation helper) and one external `img src` emission site. Browser images, redirects, and user-activated source navigation do not enter the Python ledger. No all-browser production-enforcement claim is made.

Each backend call is counted under the label its caller declares: `free` (a public source-adapter read that costs nothing and spends no quota), `metered` (a read that spends a provider quota or plan allowance, such as the keyed YouTube Data API `videos.list`), or `paid` (a billed model or paid-search call). `read_json` is the only backend fetch, and its `classification` argument is required with no default. One dispatch authorizes and counts the entire attempt: default DNS resolution, validated/pinned connection, response reading and closing. DNS/transport failures still count once; pre-dispatch invalid URL/label refusals do not count. A paid call with no reported cost is recorded as unknown, never as zero (JOB04 accounting). The dashboard's `/feed` reports this backend ledger as `request_counts`, and `paid_calls` is paid plus metered. Local browsing/reranking/library routes dispatch no backend request; they may cause browser artwork requests.

`tests/test_browser_requests.js` observes real Chromium requests while the real page renders against a stub local API with artwork enabled. Its independent closed inventory distinguishes local API/assets from approved free Open Library artwork; any other destination fails the ordinary-walk assertion. Artwork responses are fulfilled offline, so the receipt measures browser attempts, not live external delivery, redirects, actual billing, or host lifecycle. The real Python routes and persisted store are tested separately in `tests/test_request_boundary_routes.py`. These are complementary harnesses, not a claimed end-to-end installed host.

The boundary also supplies the detector for a request that does not use it. `outbound.install_guard` replaces the connection entry points — `socket.socket.connect` and `connect_ex` (where a TCP or UDP connection is actually established), `sendto` and `sendmsg` for connectionless UDP, `socket.create_connection`, `socket.getaddrinfo`, `gethostbyname`, `gethostbyname_ex`, the `http.client` connection `connect` methods, and `urllib.request.urlopen` — so a connection made outside an active dispatch raises `NetworkOutsideBoundary`. The in-flight marker is a context variable, so one thread's request does not authorise another thread's connection. Enumerating entry points rather than wrapping a single helper is deliberate: the first version wrapped `connect` only, and `connect_ex` was demonstrated reaching a loopback listener uncounted. A module that imports a network client, or calls one of those entry points, outside the allowlisted boundary modules fails the scan in `tests/test_request_boundary.py` — the import scan alone could not catch a second connection added to `http.py` or `text.py`, which are already allowed to import `socket`. Alternative considered was trusting a code review to find a stray request; a test that fails on a bypass keeps the guarantee after the review.

## Feasibility gates

Task group 1 must produce a committed feasibility receipt with the chosen host version/commit, exact public entry points, a clean-profile route probe, the proposed source matrix verified against the chosen implementation, and job lifecycle probe. Task 1.2 ends on day 1 with either a supported model/search route or the declared plugin-secret fallback. Dependent tasks remain unchecked until the required path is demonstrated. Probe scaffolding must not be reported as working product behavior.

If an integration cannot meet the specs, revise the design and affected tasks before building dependent features. Escalate only product-scope changes to Robert. Technical facts should be investigated directly.

## Risks and trade-offs

- Source coverage varies by subject. Keep empty states honest and expose source status.
- Community mentions can be negative. Preserve raw evidence distinctions and evaluate endorsement classification separately.
- LLM recommendations can sound plausible without evidence. Admit displayed candidates only from traceable retrieved records.
- Provider usage may omit billing data. Show unknown cost and enforce request limits independently.
- Memory can leak unrelated context. Keep opt-in context bounded and verify payloads with memory disabled.
- Source content can contain instructions. Render it as text and keep permissions outside retrieved-content control.

## Delivery and rollback

Use a disposable Hermes profile for integration probes and clean-install validation. Ship code and dependency versions only after those paths are verified. Verify disable/re-enable and update without losing library data. Document uninstall retention and explicit owned-data cleanup before release. Roll back to the prior reviewed plugin commit while preserving compatible private data.

## Ranking weights (Robert, November 6, 2026)

Robert approved weighted ranking in the catalog core before the demo, and a section browse group that is not a recommendation. On November 6, 2026 at 11:32 a.m. ET he allowed that labeled, unranked browse group beside the coverage limit. The constants are in `hackertube_core/ranking.py`.

Interest match is a gate, not a weight. Community evidence adds 1000 only for an unexpired established community endorsement. Freshness adds one point per day remaining in a 366-day window, measured from the item's `captured_at` to the reference time passed into ranking. Variety subtracts 40 for a consecutive same catalog source and 20 for a consecutive same format, then breaks ties by item id. The why-line says "Recent" only when that age is 30 days or less. The page does not show these numbers. A mention, a criticism, or missing endorsement data does not add the community-evidence weight and does not appear on the why-line.

## Deferrable details

Ranking weights, catalog refresh volume, and presentation density can be calibrated within the specs. The November 6 constants above are that calibration for the demo. The PRD's latency and relevance figures are proposed targets. Freeze the workload, rubric, limits, and reference setup before measuring and make any target adjustment explicit.


## November 8: self-contained package and real Hermes search

The installable `hackertube/` directory now owns `hackertube_core/`, dashboard, manifest, entry point, and seed. The repository parent is not a runtime dependency. Native `register(ctx)` binds the supported Hermes inference/tool facades by canonical profile path and registers `hackertube_search`. The dashboard uses the host's public model-assignment HTTP routes, with no imports of private provider inventory or command-dispatch modules. The user chooses an already configured Hermes provider/model for that auxiliary slot; no plugin-owned model key or endpoint is used.

Real Search interprets through `ctx.llm.complete_structured`, retrieves bounded source records through the shared HTTP boundary plus `ctx.dispatch_tool('web_search')`, ranks only admitted IDs, and stores normalized records through `plugin_db` for subsequent library actions. Ordinary reads merge local records with the existing seed and launch no retrieval. Requested formats are filtered before the result cap. Blocking work uses the ASGI worker pool; each next dispatch checks the remaining budget. Host-owned retries/fallback are counted as one logical invocation and are not claimed as an independently measured vendor request count. Cancellation/restart remains post-demo.

The full implementation contract, current source coverage, immutable original receipts, and limits are recorded in docs/real-search.md and verification.md. The original key-fallback decision above is superseded by Robert's provider-selection instruction.

## Results tuning after PR #16

The live AI walkthrough established retrieval across all four categories, but the output overfilled audiobooks, included weak introductions, and lost good rows on a single invalid model entry. The follow-up keeps one interpretation and one ranking invocation. A validated `retrieval_query` separates the subject from the full request; absent fields from older scripted providers fall back to the topic. The complete question still reaches ranking, so narrowing is not discarded.

The ranking input is round-robin across the four user-facing categories, with shows/episodes interleaved inside Podcasts. The 60-input cap remains. Ranking returns retrieved IDs, concise explanations, and `fit` (`direct`, `related`, or `uncertain`); only direct fits are recommended. Fit is model-inferred from supplied metadata, not a claim of independently verified relevance. Format-specific instructions distinguish substantive learning videos, educational podcasts versus news, modern introductions versus historical book context, and actual matching audio editions.

Validate each ranked entry separately. Bad IDs, malformed explanations, and missing/invalid fit are counted and ignored if valid entries remain; an entirely malformed ranking fails closed. No retry or local promotion replaces missing model output. Intentional related/uncertain omissions are separate from validation failures. A partial ranking status and diagnostic counts accompany retained valid results.

Apply the final category share after existing format, dismissal, and duration checks, preserving within-category model order. The share is `ceil(max_hits / requested_categories)`, bounded by max_hits overall; unused slots stay unused. This preserves the single-category allowance, avoids counting Podcasts twice, and does not fabricate coverage. No new dependencies, credential paths, source expansion, or scheduling are needed.

### PR #17 review: ambiguous identities and summary scope

Fit validation resolves all structurally valid entries for an identity before choosing a recommendation. If those entries disagree (`direct` versus `related` or `uncertain`, in either order), every conflicting entry is invalid and that identity is excluded. Other unambiguous identities survive with partial ranking coverage; an all-conflicting ranking fails closed. Consistent duplicates preserve the existing first-reason deduplication rule. `conflicting_identities` counts affected IDs, while `invalid_entries` counts their rows; those rows are not double-counted as intentional relevance omissions.

The duration caption now says Time limit, including when none was requested. Depth/audience/exclusion preferences remain separate ranking criteria, so an absent duration can no longer be described as no constraints applied.

## Installed rehearsal: completion allowance and time disclosure

The native structured-completion site allows 8,000 interpretation tokens and 16,000 ranking tokens, including provider reasoning. Both stages continue to receive the remaining shared work budget and make one host invocation each. A live interpretation returned no parsed JSON at the old 2,500 allowance; a larger allowance returned JSON, while a later ranking stalled inside the host. The UI therefore names a work budget and discloses that in-flight Hermes calls can finish later; it does not present the budget as cancellation. No host internals, retries, or credential routing are changed. The rehearsed provider/model is an existing user-configured route, not a plugin-owned endpoint.
