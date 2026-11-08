## Purpose

Provide a recognizable, accessible media discovery page inside the Hermes web dashboard and open recommendations at their original sources.

## ADDED Requirements

### Requirement: Dashboard navigation
The plugin SHALL expose a HackerTube navigation entry through the supported Hermes web-dashboard extension surface.

#### Scenario: UI01 Installed page opens
- **WHEN** the enabled plugin loads on the declared supported Hermes version
- **THEN** its navigation entry opens the HackerTube page after installation and reload using only the installed plugin directory, without a sibling development checkout

### Requirement: Four media sections
The page SHALL provide navigable Videos, Podcasts, Books, and Audiobooks sections, plus a saved library.

#### Scenario: UI02 Browse each format
- **WHEN** the user selects each media section
- **THEN** the page shows matching items or an honest format-specific empty state

### Requirement: Original creator credit
The README, About view, and any marketplace description SHALL credit Andrej Karpathy for the original HackerTube idea and identify this as an independent Hermes adaptation.

#### Scenario: UI03 Credit appears on required surfaces
- **WHEN** the README, About view, and prepared marketplace description are reviewed
- **THEN** each credits Andrej Karpathy and links to his original HackerTube post

### Requirement: Open content at its source
Selecting an item SHALL open its validated public destination through the supported host or browser mechanism without automatic media downloading or playback.

#### Scenario: UI04 Open a recommendation
- **WHEN** the user opens a valid recommendation
- **THEN** the destination opens and HackerTube neither downloads media nor starts playback itself

#### Scenario: UI05 Unsafe destination
- **WHEN** a destination uses an unsafe scheme or a private-network target
- **THEN** the action is refused with an understandable message

### Requirement: Accessible core interactions
Navigation, search, filters, saving, dismissal, and source links SHALL have accessible names and keyboard-operable controls.

#### Scenario: UI06 Keyboard journey
- **WHEN** the user navigates, searches, filters, saves, dismisses, and opens a source using a keyboard
- **THEN** each action is reachable, has visible focus, and has an accessible name
