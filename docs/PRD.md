# HackerTube PRD

Version 0.3. November 5, 2026. Product scope is drafted from Robert's confirmed decisions and the official hackathon announcement and catalog guide. No implementation has been built or verified. Delivery estimates, integrations, and numerical quality targets remain provisional.

## 1. Product definition

HackerTube is a media recommendation hub inside the Hermes web UI. It has Videos, Podcasts, Books, and Audiobooks sections, plus a persistent saved library.

When a user browses without a question, HackerTube combines community recommendations with chosen interests and hub activity. When a user asks a focused question, HackerTube performs LLM-backed search and recommends relevant content. Both modes explain their recommendations and link to the original sources.

The name and original community-curated discovery idea come from **Andrej Karpathy's HackerTube**. His [original post](https://karpathy.bearblog.dev/hacker-tube/) says that he used Hacker News comments to find YouTube videos and used the YouTube API for metadata. It does not say that he used the Hacker News Algolia API. This independent Hermes adaptation extends that idea to videos, podcasts, books, and audiobooks. Credit to Andrej Karpathy must appear in the plugin README, About view, and marketplace description.

Version one is a discovery product. All content opens at its source. Playback, ebook readers, and media hosting are outside this release.

## 2. Problem and intended users

Users who consume several media formats must search separate services and remember which items they saved. Recommendation feeds may repeat familiar topics or optimize for engagement rather than the user's purpose. A user who wants to learn a particular subject must also translate that goal into several searches and compare the results.

The initial audience is Hermes users who want a personal place to discover worthwhile media, research a question, and save what interests them. Interests may include any subject. Available sources determine actual coverage. The product must make coverage limits visible.

The intended outcome is a useful next item to watch, hear, or read, with enough evidence to understand why it was recommended.

## 3. Confirmed product decisions

| Decision | Requirement |
|---|---|
| Home experience | Community recommendations ranked against chosen interests and hub activity |
| Focused experience | LLM-backed search driven by the user's question |
| Subject coverage | Any chosen interests, with honest coverage limits |
| Media sections | Videos, Podcasts, Books, and Audiobooks |
| Consumption | Open every item at its source |
| Default personal context | Chosen interests and activity within HackerTube |
| Hermes memory | Optional and explicitly enabled |
| Source setup | Hacker News is the default community. Reddit includes only user-selected subreddits. Curated format sources and user-selectable feeds are listed in docs/sources.md. |
| Focused search coverage | May search the broader web beyond selected communities and feeds. Every result identifies its source. |
| Paid activity | Focused requests, model inference, and explicit refreshes may consume credits or provider quota |
| Ordinary browsing | Opening and browsing the saved feed makes no paid calls |
| Placement | A plugin page in the Hermes web UI, comparable in access to Kanban |

## 4. Core user journeys

### Browse without asking

The user opens HackerTube and sees recommendations from the last successful refresh. Videos, Podcasts, Books, and Audiobooks are visible sections. Filters can narrow the results by interest, format, and known duration.

Each card shows its title, creator or author when known, format, destination, and recommendation explanation. Community evidence links to the recommendation or discussion. A timestamp identifies when the source data was retrieved.

The user saves an item, dismisses it, or opens the destination. Saving and dismissing update the local view without paid requests. Opening a destination does not mark the item completed.

### Research a focused question

The user enters a request such as “Find approachable introductions to distributed systems. I have 30 minutes now and want a book for later.”

HackerTube interprets the subject, purpose, time, depth, and requested formats. It searches configured sources, verifies candidate identities and links, then presents ranked results across the relevant sections. The user can refine the request without losing the earlier result set or saved items.

Focused relevance takes precedence over the user's usual interests. The result view explains which constraints were used. A section with no credible matches says so. The product never invents an audiobook edition or fills a section merely to meet a count.

### Save and return

The user saves an item to the library. Saved items survive refreshes and restarts. The user can mark an item completed, remove a save, or undo a dismissal. A visible history distinguishes opened destinations from user-confirmed completion.

### Control personalization and sources

The user edits interests and selects supported communities or feeds. The source list shows each source's coverage, status, and last successful retrieval. Adding an unsupported community produces a clear explanation rather than a false enabled state.

The user may opt into relevant Hermes memory for recommendations. The setting states what context can be used and which service may receive it. Disabling memory prevents future use. Earlier saved results remain identifiable as having used that context.

## 5. First-release requirements and acceptance criteria

P0 means required for the hackathon submission unless the delivery section explicitly marks its scenario post-demo. P1 means a useful follow-up that does not block it. The demo cut narrows delivery without deleting the later requirements.

| ID | User story | Priority | Observable acceptance |
|---|---|---|---|
| R01 | As a Hermes user, I want HackerTube inside the web UI so I can find media where I work. | P0 | The plugin adds a named navigation entry through the documented extension surface. Its page opens after a clean install and reload. |
| R02 | As a new user, I want to choose interests and sources so the feed reflects my preferences. | P0 | Interests and source choices persist after restart. Empty setup shows useful next actions and never claims personalized results. |
| R03 | As a browsing user, I want community-based recommendations without asking a question. | P0 | A prepared catalog produces an interest-ranked feed. Opening, paging, filtering, and saving produce zero paid model or search requests. |
| R04 | As a user with a question, I want relevant recommendations across formats. | P0 | A focused request produces traceable real candidates, uses explicit constraints, and reports sections without sufficient matches. |
| R05 | As a user, I want four distinct sections so I can choose a format. | P0 | All four sections are navigable. A podcast recommendation identifies an episode or clearly labels a whole show. Audiobooks identify an actual audio edition. |
| R06 | As a user, I want trustworthy explanations so I can assess a recommendation. | P0 | Every displayed recommendation has a destination and at least one retrieval or provenance record. Community claims link to community evidence. Inferred relevance is labeled separately. |
| R07 | As a user, I want saved, completed, and dismissed states to remain under my control. | P0 | State survives restart and source refresh. Repeating Save creates one saved record. Undo restores dismissed items. Opening does not imply completion. |
| R08 | As a user, I want control over what informs my recommendations. | P0 | Default operation uses interests and hub activity. Memory-disabled requests contain no plugin-requested Hermes memory. Opt-in context is disclosed. |
| R09 | As a user, I want to choose and inspect sources. | P0 | Hacker News is the default community. Reddit retrieval is restricted to selected subreddits, with suggested curated defaults. Users can enable supported sources, add supported feeds and subreddits, and inspect retrieval errors and timestamps. |
| R10 | As a user, I want to open an item without a separate media player. | P0 | Each valid destination opens through the supported host or browser mechanism. No media file is downloaded or played automatically. |
| R11 | As a user, I want to understand credit-consuming actions before I trigger them. | P0 | Focused Search and Refresh disclose that they can use model or search credits. Those actions are explicit. Browsing never triggers hidden paid retries or refreshes. |
| R12 | As a user, I want usable results when a service fails. | P0 | Source failures are named. Cached results remain available with age labels. Cancellation stops new work. A failed refresh preserves the last successful feed. |
| R13 | As a chat user, I want to request and save media without manually navigating every page. | P0 | An explicit media recommendation request can invoke the same backend as HackerTube and save results to its library. Ordinary chat questions are not intercepted automatically. |
| R14 | As a returning user, I want familiar items handled consistently. | P0 | Known duplicates are grouped without losing their source evidence. Dismissed items stay excluded from the discovery feed. Focused search may reveal them only with a clear state label or explicit include control. |
| R15 | As a user, I want a useful empty state outside the catalog's coverage. | P0 | Unsupported interests show coverage limits and source controls. The product never substitutes unrelated recommendations to hide a gap. |
| R17 | As an entrant, I want the submission completed before the published deadline. | P0 | The catalog PR, X demo post, and entry form are complete by November 11, 2026 at 5 p.m. EST, which is 22:00 UTC and 5 p.m. Eastern on that date. |
| R18 | As a reviewer, I want to inspect and clone the submitted plugin. | P0 | The plugin repository is publicly cloneable over HTTPS by the catalog-submission deadline. The pinned commit contains a supported manifest and loadable entry point. |
| R19 | As an entrant, I want the catalog submission prepared in the required form. | P0 | A PR to NousResearch/hermes-agent adds one valid catalog entry, pins a full 40-character plugin commit, and quotes its version. |
| R20 | As a catalog maintainer, I want a validated review candidate. | P0 | `hermes plugins validate /path/to/your-plugin --install-deps` passes at the pinned commit with no failures. Declared capabilities, compatibility metadata, dependencies, and registered behavior agree. |
| R21 | As a catalog maintainer, I want the plugin to stay on supported interfaces. | P0 | The plugin uses public Hermes interfaces, does not patch core or Desktop markup, respects approvals and unattended runs, and ships no unscannable executable payload. |
| R22 | As an entrant, I want the required public demo. | P0 | An X post tags @NousResearch and contains a video under 90 seconds that shows the actual plugin performing the demo cut. |
| R23 | As an entrant, I want the official entry form completed with the requested details. | P0 | The form records the plugin title, description, email address, Discord username, X demo-post URL, and catalog-PR URL. Robert submits it only as a separate approved external action. |
| R24 | As a submitter, I want the catalog ownership condition checked. | P0 | The catalog PR author is the plugin repository owner or a major contributor. The actual submission identity and authorization are recorded before the PR opens. |
| R25 | As a judge, I want to assess a working plugin rather than a claim. | P0 | The demo and catalog description show concrete behavior beyond what a prompt or skill could do and provide evidence relevant to usefulness, reliability, polish, and creativity. |
| R26 | As a user, I want my service credentials handled through supported routes. | P0 | Plugin-owned keys are declared in `requires_env` or a secret `config_schema` field and read through Hermes secret scope. OAuth uses the declared Hermes route. The plugin never reads credential files directly. |
| R27 | As a catalog maintainer, I want installed code to remain the reviewed code. | P0 | The catalog build contains no self-updater. A later version reaches catalog users only through a new SHA-bump PR and review. |
| R28 | As a reviewer and user, I want the plugin's behavior disclosed before installation. | P0 | The catalog PR and README disclose network calls, external services, stored data, credentials, and other risky behavior. The PR includes screenshots for the UI. |
| R29 | As a user and content owner, I want third-party content and API limits respected. | P0 | Each enabled adapter follows its current provider terms for access, attribution, privacy, storage, deletion, and redistribution, as recorded in docs/sources.md. Unresolved terms block that adapter, not the whole specification. |
| R30 | As a catalog maintainer, I want each listing to have a distinct identity. | P0 | The candidate is not a vendor-lookalike skin or a competing listing for a bundled plugin. A community fork is materially different, identifies its origin, and meets the catalog's upstream-contribution or 30-day-unanswered-PR condition. |
| R31 | As a reviewer, I want all executable package content to be inspectable. | P0 | The pinned package contains no unreviewable binaries, bytecode, or archive payloads. Any permitted native component has the required public-build provenance and attestation. |
| R32 | As a user, I want third-party login backends restricted to their vendors. | P0 | HackerTube does not register a `browser_vault` login backend. Any future request for one stays out of scope unless the catalog's vendor and tier conditions can be met. |
| R16 | As a user, I want to turn a useful search into an ongoing interest. | P1 | An explicit action saves the topic as an interest. Asking a question alone never changes interests. |

## 6. Recommendation behavior

### Discovery ranking

Candidate inputs are the selected community sources and supported feeds. A publisher feed is a source of candidates, not proof of community endorsement.

Ranking considers interest match, documented community recommendations, recommendation age, diversity, and hub feedback. Repeated mentions, independent recommenders, and recency are different signals. Mention counts alone cannot establish positive endorsement.

The first release uses an inspectable ranking policy. It does not require a trained recommender. The exact weights and refresh volume are implementation decisions to calibrate on a fixed sample.

Completed items are excluded from the discovery feed by default. Saved items remain accessible in the library. Clicks are a weak interest signal and never evidence that an item was liked or completed. An explicit refresh may retrieve and enrich new candidates. Local reranking of already prepared data must not require a paid call.

### Focused search

The LLM converts the user's question into bounded searches and assesses candidate relevance. Retrieved records supply item identity, source links, format, and availability. The LLM cannot supply an unsupported item as a verified result.

Explicit hard constraints exclude known mismatches. If duration, availability, or another required field is unknown, the result is labeled unverified against that constraint. A strict filter excludes those records. The system does not equate missing metadata with a match.

Focused search may use selected communities, feeds, and the broader public web. Every result identifies its source. A web-search result does not gain a community endorsement label unless supporting community evidence was retrieved.

Proposed source-control behavior distinguishes an enabled discovery feed from a blocked source. Disabling a feed stops its ingestion. A result from the same publisher may still appear in an explicit broader-web search. The interface must explain that distinction. A source blocklist is outside the first release unless a required source integration needs it.

### Identity and format

A media item has one canonical identity when a source provides it, format, title, contributors, destination, provenance, and known metadata. A book work and its audiobook edition are linked but distinct items. A podcast video can be cross-linked to an episode without creating duplicate recommendations in the same result set.

User state records save, dismissal, completion, and open events separately. Search requests and source retrievals carry their own status and timestamps. Unknown duration, rights, edition, and availability remain unknown.

## 7. Scope and integration constraints

The primary surface is the web dashboard. Native Desktop requires a separate frontend integration and is not a first-release requirement.

The plugin uses supported Hermes extension APIs and plugin-owned persistent storage. It must preserve user state through a supported update. Removal behavior and optional data cleanup must be documented before release.

The preferred path uses the documented `ctx.llm` route and configured search capabilities. The day-one probe must verify that those routes work for the selected dashboard binding. If they do not, the fallback is a plugin-owned model or search key entered in a secret plugin setting. Hermes stores the secret and the plugin reads only its declared secret through secret scope. Plugin data files are not credential stores. Direct reads of credential files and core patches are prohibited.

Refreshes and searches are bounded jobs with visible progress, cancellation, deadlines, result limits, and errors. Exact budgets are set after source feasibility work. Rendering the feed never launches a refresh. No recurring paid job is installed in version one.

Source adapters must document access method, licensing or reuse constraints, required keys, supported formats, and expected costs. The first source set must support genuine records in all four sections. Coverage remains specific to the sources actually integrated.

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Responsiveness | Proposed target is cached-feed first useful render within 2 seconds on a documented reference setup with 1,000 catalog items. Measure before claiming compliance. |
| Search progress | Proposed target is a visible queued or running state within 1 second of submission. Search completion time depends on configured services and must be measured. |
| Cost | Zero paid calls for saved-feed browsing. Explicit searches and refreshes have bounded work. Actual usage is shown when the host supplies it. Unknown cost is not reported as zero. |
| Reliability | Refresh failure preserves cached content and library state. Duplicate job retries do not duplicate saves or destroy results. |
| Accessibility | Core navigation, search, filters, save, dismiss, and source links work with a keyboard and have accessible names. |
| Privacy | Interests and activity remain local unless needed for an explicit search, refresh, or opted-in memory use. Such actions disclose destinations. No product telemetry is required. |
| Content handling | Remote titles and excerpts render as untrusted text. Retrieved instructions cannot alter tools, permissions, or settings. |
| Link retrieval | Fetch only supported public destinations with bounded size and time. Refuse private-network destinations and unsafe URL schemes. |
| Maintainability | Each source exposes supported fields and limitations. Missing metadata remains explicit across normalization, ranking, and UI. |

## 9. Validation and success measures

These are release checks and proposed targets, not measured results.

| Check | Proposed threshold | Current disposition |
|---|---|---|
| Required feature coverage | Every P0 criterion passes on the declared Hermes version | Not run |
| Browsing cost | 0 paid requests across opening, paging, filtering, saving, dismissing, and reopening a seeded feed | Not run |
| Identity and provenance | 100% of reviewed displayed recommendations have a real identity and traceable destination/source record | Not run |
| Personal state | 100% of save/dismiss/complete cases survive restart and refresh in the acceptance fixture | Not run |
| Unsupported claims | 0 fabricated community endorsements, audiobook editions, or completion events in the review set | Not run |
| Focused relevance | Proposed target is at least 80% of top-five results rated useful across 20 frozen requests | Needs calibration before evaluation |
| Hard constraints | 0 known hard-constraint violations presented as matches in the frozen review set | Not run |
| Source coverage | At least one working adapter path and verified real examples for each of the four formats | Source selection pending |

The frozen requests must include nontechnical interests, focused learning, entertainment discovery, sparse coverage, unavailable items, follow-up questions, and duration limits. Define the relevance rubric and review procedure before scoring. Format coverage is reported separately from relevance.

Failure checks include a source timeout, malformed metadata, a model outage, an unavailable link, an interrupted refresh, duplicate results, and memory disabled. An empty result set is acceptable when evidence is insufficient.

## 10. Delivery sequence

1. Validate the host extension, storage, model access, search access, and source rights. Deliver a short feasibility receipt with supported versions and unresolved constraints.
2. Build the four-section page and library over a small real catalog. Verify source links, duplicates, user state, and restart persistence.
3. Add community ingestion and interest-based discovery. Verify provenance, feedback behavior, coverage limits, and zero paid browsing calls.
4. Add focused LLM-backed search, explicit refreshes, cancellation, and partial failures. Verify constraints, bounded work, and context disclosure.
5. Run the frozen acceptance set and a clean-profile installation. Record numerical results and unresolved failures before catalog submission.

The hackathon cut and submission requirements are in section 13. A working vertical slice takes precedence over additional integrations. The full P0 scope does not fit the confirmed demo cut, so post-demo scenarios retain the later requirements without pretending they are part of the November 11 deliverable.

## 11. Outside the first release

- In-app playback, ebook reading, media downloading, hosting, and commercial audiobook entitlement handling.
- Automated recurring paid searches or refreshes.
- Training a custom recommendation model.
- Whole-web crawling or a fresh full extraction of the Hacker News archive.
- Social accounts, public profiles, collaborative lists, purchases, and affiliate monetization.
- Automatic ingestion of unrelated chat history or external watch history.
- Native Desktop parity and cloud account synchronization.

## 12. Open decisions and investigations

All six scope questions asked during drafting are answered. Robert selected HackerTube as the product name. The proposed source-control behavior in section 6 is a reviewable default, not a confirmed user decision.

Investigations for the implementation owner include exact source adapters, public-data reuse terms, supported Hermes APIs, model and search credit accounting, profile isolation, secure URL opening, and job lifecycle support. These are observable technical questions, not preferences to send back to the user.

## 13. Hackathon requirements

The event is the **Hermes Agent Plugin Hackathon**, organized by Nous Research. The primary announcement is the [official @NousResearch post](https://x.com/NousResearch/status/2118094256438936062), published November 4, 2026 at 4:33 p.m. EST. It is the event-rules source. The [official entry form](https://form.typeform.com/to/FwJLvOln) and [catalog-submission guide](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins/catalog-submission) supply the further requirements cited in R17 through R32.

The announcement states that every kind of plugin is eligible. It does not publish participant age, geography, or team-size terms. The catalog requires a public plugin repository and a PR from the repository owner or a major contributor. The unknown participant terms remain open below.

The three submission artifacts are a catalog PR, a working-demo video under 90 seconds posted on X with @NousResearch tagged, and the entry form containing both URLs. The form also requires the plugin title, a description, an email address, and a Discord username. The form can be submitted after the PR opens. Catalog acceptance still requires maintainer review. The planning repository being private today is a release blocker under R18, not a reason to publish it now.

The announcement and form contain no separate project-license, originality, third-party-content, team ownership, or IP-assignment terms. Catalog rules still govern derivation, attribution, interfaces, security, and disclosure. Provider agreements govern their own data and content. No separate official full-rules page was found in the reviewed Hermes documentation, Devpost, Luma, or the announcement thread.

### Hackathon cut

Robert confirmed this demo slice:

1. Open the HackerTube page.
2. Show a feed from a small seeded catalog of real records.
3. Run one focused search.
4. Save a result.
5. Open the result at its source.
6. Show the Andrej Karpathy credit in the About view and prepared marketplace description.

The video must fit this sequence in under 90 seconds. It must show the running plugin, not a mockup.

The following scenarios remain specified but are post-demo. PRD rows retain their full requirement mappings in traceability.json. A row has status `demo` when at least one mapped scenario belongs to the cut, and `post-demo` only when every mapped scenario is deferred. The exact subsets are:

- Memory opt-in and revocation in PREF06, plus the memory-consent disclosure in PREF13. Default memory-disabled behavior in PREF05 and read-only privacy in PREF08 remain in the demo.
- Two-profile isolation in PREF07.
- The chat and agent entry in SEARCH02, SEARCH12, LIB07, and LIB08. Dashboard SEARCH01 remains in the demo.
- Rollback, update, disable/re-enable, and uninstall rehearsal in HCKT19 and supported-update library persistence in LIB09. LIB02 restart/refresh persistence, initial clean installation, and catalog validation remain in the demo.
- The 20-request relevance evaluation in HCKT20. The single demonstrated search and its hard constraints still need verification.
- Strict duration filtering in FEED08. The seeded catalog feed remains in the demo.
- Search refinement in SEARCH06 and the include-dismissed behavior in SEARCH10 and SEARCH11. The single focused search remains in the demo.
- Completion, undo dismissal, and save removal in LIB04 through LIB06. The demo save and restart/refresh persistence remain in the demo.
- Cancellation, interrupted-job recovery, and partial-failure recovery in JOB05 through JOB08. The bounded single demo search and its credit disclosure remain in the demo.

Keyboard operation in UI06 remains in the demo because the six-step cut must be operable. All other scenarios remain in the demo unless an exact post-demo subset above or in traceability.json excludes them.

### Submission gates still open

- Confirm participant eligibility, team terms, originality terms, license expectations, and IP terms with Nous Research through its official Discord. The announcement does not answer them.
- Repository visibility (Robert, November 5, 2026): the repository stays private until right before the catalog PR is opened, then becomes public so the pinned commit is cloneable over HTTPS (R18).
- License (Robert, November 5, 2026): MIT. The repository root contains the MIT `LICENSE`.
- Obtain explicit Reddit Data API access for this use case before enabling Reddit. Subreddit scoping alone does not grant access or permission to retain data.
- Verify source-specific display, privacy, retention, and deletion obligations against the exact implementation. Source notes are research, not legal clearance.

## 14. Research references and limits

- [Official hackathon announcement](https://x.com/NousResearch/status/2118094256438936062), [official entry form](https://form.typeform.com/to/FwJLvOln), and [catalog-submission guide](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins/catalog-submission) define the known event requirements. Unknown terms are open in section 13.
- [Source research](sources.md) records official API references, verified limits, and unresolved terms.
- [Karpathy's original HackerTube post](https://karpathy.bearblog.dev/hacker-tube/) supplies the community-discovery inspiration.
- [Hermes dashboard extension documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/extending-the-dashboard) documents web tabs and backend plugin routes. Native Desktop uses a different SDK.
- [Official plugin catalog](https://hermes-agent.nousresearch.com/docs/api/plugin-catalog.json) was screened in this chat. Related listings include RSS readers, by2kb, revamp, youtube-dock, and hermes-muse. No exact match was found in that screen. This is not proof of uniqueness.
- The supplied YouTube video could not be retrieved. No requirement depends on an assumed transcript or claim about its contents.

The confirmed decisions in section 3 come directly from this chat. Other choices are proposed defaults or implementation constraints. This document grants no authorization to publish, purchase media, connect additional accounts, or run paid evaluations.
