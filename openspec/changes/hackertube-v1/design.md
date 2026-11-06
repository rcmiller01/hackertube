# Design

## Context

The repository contains a PRD and README, with no application code. See proposal.md for scope. Public Hermes documentation describes web-dashboard tabs, plugin backend routes, and a separate native Desktop SDK. The exact host version, plugin LLM/search entry points, source adapters, and lifecycle behavior have not been exercised here.

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

Robert approved weighted ranking in the catalog core before the demo, and a section browse group that is not a recommendation. The constants are in `hackertube_core/ranking.py`.

Interest match is a gate, not a weight. Community evidence adds 1000 only for an unexpired established community endorsement. Freshness adds one point per day remaining in a 366-day window, measured from the item's `captured_at` to the reference time passed into ranking. Variety subtracts 40 for a consecutive same catalog source and 20 for a consecutive same format, then breaks ties by item id. The why-line says "Recent" only when that age is 30 days or less. The page does not show these numbers. A mention, a criticism, or missing endorsement data does not add the community-evidence weight and does not appear on the why-line.

## Deferrable details

Ranking weights, catalog refresh volume, and presentation density can be calibrated within the specs. The November 6 constants above are that calibration for the demo. The PRD's latency and relevance figures are proposed targets. Freeze the workload, rubric, limits, and reference setup before measuring and make any target adjustment explicit.
