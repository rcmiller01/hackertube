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

### Requirement: Profile-local private state
Interests, library activity, results, and source settings SHALL remain isolated to the serving Hermes profile. Personal context SHALL leave the profile only for explicitly triggered operations with disclosed destinations.

#### Scenario: PREF07 Two profiles
- **WHEN** two profiles use HackerTube with different interests and saved items
- **THEN** neither reads or modifies the other's private hub state

#### Scenario: PREF08 Read-only browsing
- **WHEN** the user browses prepared recommendations
- **THEN** no personal context is submitted to an external model or search service
