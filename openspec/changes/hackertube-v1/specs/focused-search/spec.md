## Purpose

Turn a user's explicit question into source-backed media recommendations across selected sources and the broader public web.

## ADDED Requirements

### Requirement: Explicit focused search
An explicit media request SHALL invoke LLM-backed search through the dashboard or supported agent entry point. Ordinary chat questions SHALL NOT be intercepted automatically.

#### Scenario: SEARCH01 Request across formats
- **WHEN** the user explicitly requests media for a topic through the page or agent
- **THEN** the shared search behavior returns verified candidates in relevant media sections

#### Scenario: SEARCH02 Unrelated chat
- **WHEN** the user asks an ordinary chat question without media-recommendation intent
- **THEN** HackerTube starts no search job

### Requirement: Question and constraint priority
Focused recommendations SHALL prioritize the question's purpose, topic, requested formats, depth, and explicit constraints over general interest preferences.

#### Scenario: SEARCH03 Question differs from interests
- **WHEN** the user with technology interests asks for gardening books
- **THEN** the results prioritize gardening books rather than unrelated technology items

#### Scenario: SEARCH04 Uncertain hard constraint
- **WHEN** an otherwise relevant item has unknown duration under a requested time limit
- **THEN** the item is labeled unverified against that constraint and excluded from strict matches

### Requirement: Broader-web source labeling
Focused search SHALL support the broader public web in addition to enabled communities and feeds, and SHALL identify every result's source.

#### Scenario: SEARCH05 Beyond selected communities
- **WHEN** a credible relevant item is found on the broader web
- **THEN** it is eligible with its source labeled and without invented community endorsement

### Requirement: Preserve refinements and library state
Refining a question SHALL retain enough search context to interpret the refinement, preserve earlier result sets, and leave saved items intact.

#### Scenario: SEARCH06 Narrow a previous search
- **WHEN** the user refines a search with “shorter and beginner-friendly”
- **THEN** the refinement uses the prior topic, produces a distinct result set, and preserves earlier results and saves

### Requirement: No forced format filling
Focused search SHALL report insufficient evidence for a format instead of inventing items or adding irrelevant results.

#### Scenario: SEARCH07 No audiobook match
- **WHEN** no verified relevant audiobook edition is found
- **THEN** the audiobook section reports no verified matches while other credible results remain available

### Requirement: Prior user state is visible
Focused results that include previously saved, dismissed, or completed items SHALL display the recorded state. A question SHALL NOT change interests implicitly.

#### Scenario: SEARCH08 Previously dismissed result
- **WHEN** a focused search returns a relevant item dismissed from discovery
- **THEN** the item is marked dismissed and remains excluded from the discovery feed

#### Scenario: SEARCH09 Search does not edit interests
- **WHEN** the user searches for a new subject
- **THEN** their chosen interests remain unchanged
