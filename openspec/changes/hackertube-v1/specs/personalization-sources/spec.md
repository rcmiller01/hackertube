## Purpose

Give users control over interests, source coverage, personal context, and profile-local recommendation data.

## ADDED Requirements

### Requirement: Any interests with explicit coverage
Users SHALL be able to save interests on any subject. Source coverage limitations SHALL remain visible instead of restricting interests to technology.

#### Scenario: PREF01 Nontechnical interest persists
- **WHEN** the user adds a gardening interest and restarts Hermes
- **THEN** the interest is retained and available for ranking

### Requirement: Source selection and inspection
Users SHALL receive curated defaults, enable supported communities, add supported feeds, and inspect each source's coverage, last successful retrieval, and current error status.

#### Scenario: PREF02 Configure sources
- **WHEN** the user enables a supported community and adds a supported feed
- **THEN** those choices persist and their source status is inspectable

#### Scenario: PREF03 Unsupported source
- **WHEN** a user adds a source the plugin does not support
- **THEN** the plugin reports the limitation instead of showing a false enabled state

#### Scenario: PREF09 Add a subreddit
- **WHEN** an approved Reddit adapter is enabled and the user adds a named public subreddit
- **THEN** the selection persists and later Reddit evidence queries are restricted to the selected subreddits

#### Scenario: PREF10 Unavailable or private subreddit
- **WHEN** the user adds a subreddit that is private, unavailable, or not permitted for the app
- **THEN** the plugin leaves it disabled, explains the condition, and does not broaden the query to all of Reddit

#### Scenario: PREF11 Reddit API failure or unapproved access
- **WHEN** Reddit returns an error or explicit API approval is absent
- **THEN** Reddit is named as unavailable, cached results remain labeled, and other enabled sources continue without substituting whole-Reddit retrieval

#### Scenario: PREF12 Selected subreddits only
- **WHEN** the user runs an explicit refresh with several subreddits selected
- **THEN** every Reddit query is scoped to those selections and never requests an unrestricted site-wide community feed

#### Scenario: PREF04 Feed disabled
- **WHEN** the user disables a discovery feed
- **THEN** later refreshes stop ingesting it and the control explains that broader-web search can still discover the publisher

### Requirement: Bounded default personalization
Default personalization SHALL use chosen interests and hub activity. It SHALL NOT request Hermes memory or unrelated chat or external watch history without opt-in.

#### Scenario: PREF05 Default context boundary
- **WHEN** the user searches or refreshes with memory disabled
- **THEN** the plugin requests no Hermes memory and submits only permitted hub context with the task

### Requirement: Inspectable memory consent
Memory use SHALL require explicit opt-in that explains context scope and receiving services. Disabling it SHALL prevent future memory use and retain provenance of earlier results that used it.

#### Scenario: PREF06 Opt in and revoke
- **WHEN** the user enables memory, produces results, and disables memory
- **THEN** later requests omit memory and earlier results remain identifiable as having used it

### Requirement: Versioned API-client privacy agreement
All HackerTube features SHALL require explicit agreement to the current bundled privacy policy and terms, distinct from credit-use acknowledgement. The policy SHALL remain available before agreement and on every page. Users SHALL be able to delete this profile’s plugin-owned data and revoke agreement without removing host credentials or provider-held data. Active searches SHALL block deletion until cancelled.

#### Scenario: PREF15 Policy agreement and local deletion
- **WHEN** a profile lacks current agreement, accepts the current version, and later deletes its HackerTube data
- **THEN** features are blocked before agreement, available after explicit acceptance, and blocked again after local deletion, with no late worker restoring deleted state

### Requirement: Profile-local private state
Interests, library activity, results, and source settings SHALL remain isolated to the serving Hermes profile. Personal context SHALL leave the profile only for explicitly triggered operations with disclosed destinations.

#### Scenario: PREF07 Two profiles
- **WHEN** two profiles use HackerTube with different interests and saved items
- **THEN** neither reads or modifies the other's private hub state

#### Scenario: PREF08 Read-only browsing
- **WHEN** the user browses prepared recommendations
- **THEN** no personal context is submitted to an external model or search service

### Requirement: Context and source inspection details
The memory consent control SHALL name the permitted context and receiving services. Source inspection SHALL show the last successful retrieval time and any current error.

#### Scenario: PREF13 Memory disclosure names recipients
- **WHEN** a user reviews the memory opt-in control before enabling it
- **THEN** the control states which context can be used and which services may receive it

#### Scenario: PREF14 Source status includes retrieval time
- **WHEN** a source has completed a retrieval or failed a later attempt
- **THEN** its source view shows the last successful retrieval time and the current error, if any
