## Purpose

Let users discover community-recommended media matched to chosen interests without submitting a question or paying to browse.

## ADDED Requirements

### Requirement: Prepared personalized feed
Opening HackerTube without a focused request SHALL display the last successful prepared feed ranked against chosen interests and hub activity.

#### Scenario: FEED01 Open without a question
- **WHEN** the user opens HackerTube with a prepared catalog and chosen interests
- **THEN** the feed shows relevant recommendations without requiring a question or launching paid work

### Requirement: Evidence-aware ranking
Discovery ranking SHALL consider interest match, supported community evidence, freshness, diversity, and user feedback. Mention counts alone SHALL NOT establish positive endorsement.

#### Scenario: FEED02 Strong interest match
- **WHEN** a fixed catalog contains relevant, positively recommended items and unrelated items
- **THEN** the configured ranking surfaces relevant recommendations and explains the signals used

#### Scenario: FEED03 Publisher feed without community evidence
- **WHEN** an item comes from a publisher feed without endorsement evidence
- **THEN** it is labeled a source candidate rather than community-recommended

### Requirement: Free ordinary browsing
Opening, paging, filtering, saving, dismissing, and locally reranking prepared recommendations SHALL make zero paid model or search requests.

#### Scenario: FEED04 Browse without paid calls
- **WHEN** the user opens, pages, filters, saves, dismisses, and reopens a prepared feed
- **THEN** paid model and search request counters remain unchanged

### Requirement: Feedback exclusions
The discovery feed SHALL exclude dismissed and completed items by default and retain saved items in the library. Opens SHALL NOT be treated as likes or completion.

#### Scenario: FEED05 Dismissed item stays excluded
- **WHEN** a dismissed or completed item reappears in a source refresh
- **THEN** it remains excluded from the default discovery feed

### Requirement: Honest sparse coverage
The feed SHALL disclose unsupported interests, stale data, and insufficient matches rather than filling gaps with unrelated items.

#### Scenario: FEED06 No catalog matches
- **WHEN** selected interests have no credible matches in the enabled sources
- **THEN** the page explains the coverage limit and offers source controls or an explicit focused search

#### Scenario: FEED07 Empty first run
- **WHEN** no prepared feed exists
- **THEN** the page offers interest/source setup and an explicit refresh without claiming personalized results

### Requirement: Known-duration filtering
Duration filters SHALL distinguish known matches from unknown duration and SHALL exclude unknowns when strict matching is selected.

#### Scenario: FEED08 Strict duration filter
- **WHEN** the user selects a strict maximum duration
- **THEN** items with longer or unknown duration are excluded from matching results
