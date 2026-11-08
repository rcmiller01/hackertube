# Add HackerTube media discovery plugin

HackerTube adds source-backed media search to the Hermes dashboard, with a profile-local library and original-source links across videos, podcasts, books, and audiobooks. It uses an existing configured Hermes provider through the registered `hackertube_search` auxiliary slot. Andrej Karpathy created the original HackerTube and inspired this independent adaptation.

The proposed entry is `plugin-catalog/hackertube.yaml`; use the accompanying exact-pin draft, version "0.2.0", subdirectory `hackertube`, community tier, Hermes >=0.23.0. The submitter must be the repository owner or a major contributor. This document is a draft, not an upstream PR.

## Disclosure

Explicit Search sends the question and bounded metadata to the selected Hermes model provider and contacts the enabled source APIs plus the configured Hermes web-search backend. Supported destinations, optional key names, stored data, removal behavior, and source terms are in `hackertube/README.md`. Hermes owns model credentials and routing; plugin source keys use declared secret settings and secret scope. No credential-file, memory, or unrelated-chat reads; no telemetry, shell command, background refresh, media download/playback, self-update, core override, or native binary is shipped by the plugin.

Jobs use 12 logical dispatches, 24 results, and a 45-second work budget. In-flight host calls can overrun that budget; cancellation/restart recovery is unfinished. Unknown costs remain unknown. Ordinary browsing and library actions make no model or search call. The development seed has no curated community endorsements. Reddit remains disabled; Podcast Index needs keys and has not been live-tested.

## Validation and screenshots

Attach or use immutable screenshot URLs at the final pin for `docs/receipts/demo-rehearsal/results.jpg`, `about.jpg`, `clean-profile.jpg`, and `library-after-restart.jpg`. The accompanying rehearsal receipts record exact installation validation, tests, live results, and the measured 36.25-second video.

**Do not submit this draft yet:** public clone, source-specific release checks, eligibility/IP questions, and final exact-pin review remain gates. A successful demo is not source-term clearance or a broad relevance evaluation.
