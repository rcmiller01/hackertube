## Purpose

Turn a user's explicit question into source-backed media recommendations across selected sources and the broader public web.

## ADDED Requirements

### Requirement: Explicit focused search
An explicit dashboard media request SHALL invoke LLM-backed search. Ordinary chat questions SHALL NOT be intercepted automatically. The supported agent entry point is post-demo.

#### Scenario: SEARCH01 Request across formats
- **WHEN** the user explicitly requests media for a topic through the page
- **THEN** the shared search behavior retrieves candidates beyond the bundled catalog, ranks only source-backed identities through the selected configured Hermes provider, and returns relevant media sections

#### Scenario: SEARCH12 Explicit agent entry after demo
- **WHEN** the user explicitly invokes the HackerTube agent entry point for media recommendations after the demo
- **THEN** the entry invokes the same search backend as the dashboard and returns its verified result set

#### Scenario: SEARCH02 Unrelated chat
- **WHEN** the user asks an ordinary chat question without media-recommendation intent
- **THEN** HackerTube starts no search job

### Requirement: Question and constraint priority
Focused recommendations SHALL prioritize the question's purpose, topic, requested formats, depth, and explicit constraints over general interest preferences.

#### Scenario: SEARCH10 Include dismissed items explicitly
- **WHEN** the user turns on the include-dismissed control and submits a focused search
- **THEN** relevant dismissed items may appear with their dismissed state clearly labeled

#### Scenario: SEARCH11 Dismissed items excluded by control default
- **WHEN** the include-dismissed control is off and a focused search runs
- **THEN** dismissed items are excluded from the focused result set as well as the discovery feed

#### Scenario: SEARCH03 Question differs from interests
- **WHEN** the user with technology interests asks for gardening books
- **THEN** the results prioritize gardening books rather than unrelated technology items

#### Scenario: SEARCH04 Uncertain hard constraint
- **WHEN** an otherwise relevant item has unknown duration under a requested time limit
- **THEN** the item is labeled unverified against that constraint and excluded from strict matches

### Requirement: Broader-web source labeling
Users SHALL be able to select an already configured Hermes provider/model for HackerTube search without adding separate model credentials. Focused search SHALL support the broader public web in addition to enabled communities and feeds, and SHALL identify every result's source.

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
Focused results that include previously saved, dismissed, or completed items SHALL display the recorded state. A question SHALL NOT change interests implicitly. Focused search SHALL expose an explicit include-dismissed control. Dismissed items SHALL remain excluded from the focused result set when that control is off.

#### Scenario: SEARCH08 Previously saved or completed result
- **WHEN** a focused search returns a relevant item previously saved or completed
- **THEN** the item shows that recorded state and opening it does not change completion

#### Scenario: SEARCH09 Search does not edit interests
- **WHEN** the user searches for a new subject
- **THEN** their chosen interests remain unchanged
