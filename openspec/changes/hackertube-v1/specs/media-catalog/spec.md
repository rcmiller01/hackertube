## Purpose

Represent real media items with stable identity and traceable evidence while preserving distinctions between formats and editions.

## ADDED Requirements

### Requirement: Verified recommendation records
Every displayed recommendation SHALL identify a real item, its format, title, public destination, and retrieval or provenance record. Unknown metadata SHALL remain unknown.

#### Scenario: CAT01 Candidate lacks evidence
- **WHEN** the LLM suggests a title without a supporting retrieved source record
- **THEN** the suggestion is excluded from verified recommendations

#### Scenario: CAT02 Metadata is incomplete
- **WHEN** a retrieved item has unknown duration, contributor, or availability
- **THEN** the display retains the unknown state instead of inventing a value

### Requirement: Format and edition identity
Podcasts SHALL distinguish episodes from whole shows. Books and audiobooks SHALL retain distinct edition identities when provided. Audiobooks SHALL require an actual audio-edition source record.

#### Scenario: CAT03 An audiobook is not verified
- **WHEN** a book is found but no audio-edition record is retrieved
- **THEN** the book is not presented as an audiobook

#### Scenario: CAT04 Podcast identity is clear
- **WHEN** a podcast result identifies a whole show instead of an episode
- **THEN** its card labels it as a show and does not invent episode metadata

### Requirement: Deduplication preserves evidence
Known duplicate recommendations SHALL be grouped without discarding source evidence. Related formats SHALL remain distinguishable.

#### Scenario: CAT05 Repeated community links
- **WHEN** multiple sources identify the same canonical item
- **THEN** one recommendation retains the available source evidence

#### Scenario: CAT06 Linked editions
- **WHEN** a book and its audiobook edition refer to the same work
- **THEN** they remain distinct format records with their relationship preserved

### Requirement: Source-backed explanations
Recommendation explanations SHALL distinguish retrieved community endorsement from inferred relevance, show source links, and identify retrieval time.

#### Scenario: CAT07 Mention is not endorsement
- **WHEN** a community post merely mentions or criticizes an item
- **THEN** its mention is not labeled a positive recommendation

#### Scenario: CAT08 Public-web evidence
- **WHEN** a result comes only from public-web search
- **THEN** the card identifies that source and makes no unsupported community-endorsement claim

### Requirement: Untrusted remote content
Remote titles, excerpts, and retrieved instructions SHALL be treated as untrusted content that cannot change tools, permissions, or settings.

#### Scenario: CAT09 Malicious source excerpt
- **WHEN** an excerpt contains markup or instructions to change configuration
- **THEN** it renders safely and produces no configuration or permission changes

### Requirement: Visible retrieval provenance
Every recommendation card SHALL identify its retrieval source and retrieval time. Community evidence SHALL link to the source discussion rather than only naming the community.

#### Scenario: CAT10 Retrieval source and time
- **WHEN** a recommendation is displayed from a stored source record
- **THEN** its explanation identifies the source and the time of retrieval

#### Scenario: CAT11 Community evidence destination
- **WHEN** a recommendation claims community endorsement
- **THEN** the user can open the supporting discussion or comment and inspect its source
