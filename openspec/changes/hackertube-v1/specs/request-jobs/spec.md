## Purpose

Control explicit searches and refreshes with bounded costs, visible progress, cancellation, and preservation of useful prior results.

## ADDED Requirements

### Requirement: Explicit credit-consuming actions
Only explicit focused searches or refreshes SHALL trigger paid model or search activity or metered third-party provider activity. Their controls SHALL disclose potential credit use. Installation and ordinary browsing SHALL NOT schedule recurring paid jobs.

#### Scenario: JOB01 Start explicit work
- **WHEN** the user submits Search or Refresh after the credit-use disclosure
- **THEN** a visible job begins under the configured work limits

#### Scenario: JOB09 Disclosure precedes first work
- **WHEN** a new user selects Search or Refresh before any request has started
- **THEN** the credit-or-quota disclosure is visible before model, paid-search, or metered provider activity begins

#### Scenario: JOB10 Disclosure precedes later work
- **WHEN** the user starts another Search or Refresh in the same or a later session
- **THEN** the disclosure is visible at the action before the request runs, without relying on a prior job's completion screen

#### Scenario: JOB02 No background paid refresh
- **WHEN** the plugin installs, loads, or displays a stale feed
- **THEN** it launches no recurring paid job or implicit paid refresh

### Requirement: Bounded visible execution
Each search or refresh SHALL expose progress, terminal status, finite deadlines and request/result limits, and actual usage when available. Supervised Search SHALL stop its local worker group at the deadline, including blocked model, source and DNS work. Remote processing or billing already accepted by a provider may continue and SHALL be disclosed. Unknown cost SHALL NOT be displayed as zero.

#### Scenario: JOB03 Work budget exhausted
- **WHEN** an operation reaches its deadline or request limit
- **THEN** supervised Search terminates and reaps its local worker group, records timed_out, rejects late results, and reports incomplete coverage and observed usage without promoting unranked candidates

#### Scenario: JOB04 Provider omits cost
- **WHEN** a provider returns no reliable cost information
- **THEN** the job displays total cost as unknown, including an attempted paid request that failed without reporting cost, and counts only its own dispatches rather than overlapping jobs

### Requirement: Cancellation and restart recovery
Cancelling a job SHALL prevent further dispatch and expose the disposition of in-flight calls. Interrupted jobs SHALL NOT silently resume paid work after restart.

#### Scenario: JOB05 Cancel running search
- **WHEN** the user cancels a running job
- **THEN** its profile-scoped job handle stops and reaps the local worker group before cancellation is confirmed, no late result is accepted, remote billing uncertainty is disclosed, and saved items remain intact

#### Scenario: JOB06 Restart interrupted job
- **WHEN** Hermes restarts during an unfinished paid job
- **THEN** the orphan worker group stops, the persisted job is marked interrupted on status recovery, and paid work requires a new explicit action

### Requirement: Preserve successful cached results
Source or model failures SHALL report affected services and retain the last successful feed and library. Partial results SHALL identify missing coverage and retrieval age. Malformed or unsubmitted ranking entries, and validated duplicates with conflicting fit labels, SHALL be rejected while retaining unambiguous matches, without an implicit paid retry.

#### Scenario: JOB07 One source fails
- **WHEN** one source times out while other sources return credible matches
- **THEN** the job identifies the failed source and presents labeled partial results

#### Scenario: JOB08 Full refresh fails
- **WHEN** all refresh sources fail or the model is unavailable
- **THEN** the last successful feed remains readable with its age and error state
