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
- **THEN** the destination opens and HackerTube neither downloads media nor starts playback itself; a YouTube card has one source-opening link, containing the attribution icon and visible Watch on YouTube text beneath it, with the accessible name Watch "<title>" on YouTube; compact format-section rows omit art and use a visible Watch on YouTube link with the same accessible name

#### Scenario: UI05 Unsafe destination
- **WHEN** a destination uses an unsafe scheme or a private-network target
- **THEN** the action is refused with an understandable message

### Requirement: Accessible core interactions
Navigation, search, filters, saving, dismissal, and source links SHALL have accessible names and keyboard-operable controls.

#### Scenario: UI06 Keyboard journey
- **WHEN** the user navigates, searches, filters, saves, dismisses, and opens a source using a keyboard
- **THEN** each action is reachable, has visible focus, and has an accessible name; accepting the privacy policy moves focus to the page heading even without automatic state batching, and its controlled policy section remains mounted with hidden when closed after acceptance; a finished or cancelled Search started in this page session moves focus to the results heading, and a failed one moves focus to its alert, while a Search recovered on page load finishes without moving focus; while Search is stopping, Cancel stays focusable and exposes aria-disabled

#### Scenario: UI07 Collapse feed controls
- **WHEN** the user opens Discover or collapses the controls between the opening description and Ranked feed
- **THEN** controls start collapsed when stored interests exist and open for a first-time profile without interests; the How this feed is ordered disclosure keeps ranking and policy notes available without occupying the initial feed; when collapsed, interest entry, focused search, and section links are hidden together while Discover, Library, and About navigation, the polite status region, catalog and feed alerts, the ranked feed, and a keyboard-operable reopen control remain visible; the reopen control's focus outline uses the host ring color; a feed update caused by a profile write preserves the collapsed state, while a Search started in this page session that ends expands the controls and moves focus to its results heading or its alert (a Search recovered on page load does neither), and reopening preserves entered interests, the question, and Search results
