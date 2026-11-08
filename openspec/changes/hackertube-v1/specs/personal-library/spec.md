## Purpose

Keep a user-controlled media library with persistent, distinct records for saves, dismissals, completion, and destination opens.

## ADDED Requirements

### Requirement: Persistent idempotent saves
Saving an item SHALL create one saved record per item in the serving profile. Saves SHALL survive restarts, source refreshes, and supported plugin updates.

#### Scenario: LIB01 Save twice
- **WHEN** the user saves the same canonical item twice
- **THEN** the library contains one saved record

#### Scenario: LIB02 Restart and refresh
- **WHEN** the serving process restarts or the catalog refreshes
- **THEN** saved items and the user states exercised in the demo remain available, with an honest placeholder when source metadata has expired

#### Scenario: LIB09 Supported update after demo
- **WHEN** a supported plugin update runs after the demo
- **THEN** saved items and all their user states remain available

### Requirement: Explicit completion and open history
Only a user completion action SHALL mark an item completed. Opening its destination SHALL record an open event separately.

#### Scenario: LIB03 Open without completion
- **WHEN** the user opens a saved item's source
- **THEN** its history records an open event and its completion state is unchanged

#### Scenario: LIB04 Confirm completion
- **WHEN** the user marks an item completed and reopens the library after restart
- **THEN** its completed state is retained

### Requirement: Reversible library actions
The user SHALL be able to remove a save, dismiss an item, and undo a dismissal without deleting the underlying catalog item or changing unrelated state.

#### Scenario: LIB05 Undo dismissal
- **WHEN** the user dismisses an item and later undoes the action
- **THEN** the dismissal is cleared and the item becomes eligible under the ordinary ranking rules

#### Scenario: LIB06 Remove a save
- **WHEN** the user removes a saved item
- **THEN** its saved status is cleared while its source evidence and independent completion state remain unchanged

### Requirement: Explicit chat saves
A user-authorized media request from an explicit agent invocation SHALL save selected retrieved results to the same profile-local library as the dashboard. This capability is post-demo.

#### Scenario: LIB07 Save chat result on request
- **WHEN** the user explicitly asks the HackerTube agent entry point to save an identified result from its media response
- **THEN** the shared library stores that canonical item once and the dashboard shows the same saved state

#### Scenario: LIB08 Ordinary chat does not save
- **WHEN** a user mentions media in an ordinary chat request without invoking HackerTube or asking it to save
- **THEN** no library record changes and no HackerTube search job starts
