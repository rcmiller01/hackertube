## Purpose

Let users discover community-recommended media matched to chosen interests without submitting a question or paying to browse.

## ADDED Requirements

### Requirement: Prepared personalized feed
Opening HackerTube without a focused request SHALL display the last successful prepared feed ranked against chosen interests and hub activity.

#### Scenario: FEED01 Open without a question
- **WHEN** the user opens HackerTube with a prepared catalog and chosen interests
- **THEN** the feed shows relevant recommendations without requiring a question or launching paid work

### Requirement: Evidence-aware ranking
Discovery ranking SHALL gate on an interest match, then apply fixed weights for community evidence, freshness, and variety. It SHALL be deterministic for the same inputs and SHALL NOT read a wall clock. Mention counts alone SHALL NOT establish positive endorsement. A why-line SHALL name only signals that contributed, and the interface SHALL NOT display scores.

#### Scenario: FEED02 Strong interest match
- **WHEN** a fixed catalog contains relevant, positively recommended items and unrelated items
- **THEN** the configured ranking surfaces relevant recommendations and explains only the signals that contributed to each one, including no endorsement claim for an item that has none

#### Scenario: FEED03 Publisher feed without community evidence
- **WHEN** an item comes from a publisher feed without endorsement evidence
- **THEN** it is labeled a source candidate rather than community-recommended

#### Scenario: FEED09 Weighted endorsement, freshness, and variety
- **WHEN** a fixed catalog and reference time contain an endorsed item and an otherwise equal unendorsed item, a fresher item and an otherwise equal older item, or a run of items from the same source
- **THEN** the endorsed item ranks above the unendorsed item, the fresher item ranks above the older item, variety breaks up the same-source run, and a second ranking with the same inputs is identical without reading a clock

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
The ranked feed SHALL disclose insufficient matches instead of filling the recommendation list with unrelated items. Other catalog items shown in a format section SHALL be labeled as not matched, kept out of the ranked feed, and given no why-line. With no stored interests the catalog list SHALL stay unranked.

#### Scenario: FEED06 No catalog matches
- **WHEN** selected interests have no credible matches in the enabled sources
- **THEN** the page explains the coverage limit and offers source controls or an explicit focused search, and any other items in a format section are labeled as not matched, stay out of the ranked feed, and are not described as recommendations

#### Scenario: FEED07 Empty first run
- **WHEN** no prepared feed exists
- **THEN** the page offers interest/source setup and an explicit refresh without claiming personalized results, and the catalog sections stay an unranked list rather than a not-matched recommendation group

#### Scenario: FEED10 Matches then a labeled browse group
- **WHEN** a format section contains interest matches and other catalog items of that format
- **THEN** the matches appear first with why-lines, the other items appear under a not-matched heading with no why-line, and the match count and the browse count are both shown

### Requirement: Known-duration filtering
Duration filters SHALL distinguish known matches from unknown duration and SHALL exclude unknowns when strict matching is selected.

#### Scenario: FEED08 Strict duration filter
- **WHEN** the user selects a strict maximum duration
- **THEN** items with longer or unknown duration are excluded from matching results
