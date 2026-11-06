## Purpose

Control explicit searches and refreshes with bounded costs, visible progress, cancellation, and preservation of useful prior results.

## ADDED Requirements

### Requirement: Explicit credit-consuming actions
Only explicit focused searches or refreshes SHALL trigger paid model or search activity. Their controls SHALL disclose potential credit use. Installation and ordinary browsing SHALL NOT schedule recurring paid jobs.

#### Scenario: JOB01 Start explicit work
- **WHEN** the user submits Search or Refresh after the credit-use disclosure
- **THEN** a visible job begins under the configured work limits

#### Scenario: JOB02 No background paid refresh
- **WHEN** the plugin installs, loads, or displays a stale feed
- **THEN** it launches no recurring paid job or implicit paid refresh

### Requirement: Bounded visible execution
Each search or refresh SHALL expose progress and terminal status, enforce finite deadlines and request/result limits, and report actual usage when available. Unknown cost SHALL NOT be displayed as zero.

#### Scenario: JOB03 Work budget exhausted
- **WHEN** an operation reaches its deadline or request limit
- **THEN** it stops new work, labels incomplete coverage, and reports available partial results and usage

#### Scenario: JOB04 Provider omits cost
- **WHEN** a provider returns no reliable cost information
- **THEN** the job displays cost as unknown rather than zero

### Requirement: Cancellation and restart recovery
Cancelling a job SHALL prevent further dispatch and expose the disposition of in-flight calls. Interrupted jobs SHALL NOT silently resume paid work after restart.

#### Scenario: JOB05 Cancel running search
- **WHEN** the user cancels a running job
- **THEN** no new requests are sent, in-flight status is disclosed, and saved items remain intact

#### Scenario: JOB06 Restart interrupted job
- **WHEN** Hermes restarts during an unfinished paid job
- **THEN** the job is marked interrupted and paid work requires a new explicit action

### Requirement: Preserve successful cached results
Source or model failures SHALL report affected services and retain the last successful feed and library. Valid partial results SHALL identify missing coverage and retrieval age.

#### Scenario: JOB07 One source fails
- **WHEN** one source times out while other sources return credible matches
- **THEN** the job identifies the failed source and presents labeled partial results

#### Scenario: JOB08 Full refresh fails
- **WHEN** all refresh sources fail or the model is unavailable
- **THEN** the last successful feed remains readable with its age and error state
