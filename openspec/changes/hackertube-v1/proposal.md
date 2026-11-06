# HackerTube V1

## Why

Hermes users need one place to discover worthwhile videos, podcasts, books, and audiobooks. This release translates the agreed PRD into a web-dashboard experience with community discovery and focused question-driven search.

## What Changes

- Add the HackerTube dashboard page and source-linked cards, with Andrej Karpathy credit.
- Combine community evidence, chosen interests, and hub activity into a prepared feed.
- Add explicit LLM-backed searches across selected sources and the broader web.
- Preserve personal library state, source settings, and provenance.
- Bound paid work to explicit searches and refreshes, with progress and cancellation.
- Cover PRD R01 through R15. Defer P1 R16, the save-search-as-interest shortcut.

## Capabilities

### New Capabilities

- `dashboard-shell`: navigation, media sections, attribution, source opening, and accessibility.
- `media-catalog`: item identity, metadata, deduplication, and provenance.
- `discovery-feed`: community evidence, interest ranking, filters, and sparse coverage.
- `focused-search`: question interpretation, search, constraints, and refinements.
- `personal-library`: saves, completion, dismissals, history, and persistence.
- `personalization-sources`: interests, sources, profile isolation, and memory consent.
- `request-jobs`: explicit paid work, bounded execution, usage, cancellation, and recovery.

### Modified Capabilities

None. No delivered capability specs or product implementation exist.

## Impact

The implementation adds a Hermes web-dashboard extension and shared agent/backend capabilities. Exact public host APIs, source adapters, and dependencies are established by feasibility tasks before dependent implementation. This commit adds planning artifacts only.

V1 excludes playback, readers, media downloads, recurring paid refreshes, purchases, and native Desktop parity. Source availability limits coverage. Public listing and publication are outside this planning change.
