# Add HackerTube media discovery plugin

HackerTube adds source-backed media search to the Hermes dashboard, with a profile-local library and original-source links across videos, podcasts, books, and audiobooks. It uses an already configured Hermes provider through the registered `hackertube_search` auxiliary slot. Andrej Karpathy created the original HackerTube and inspired this independent adaptation.

The proposed entry is `plugin-catalog/hackertube.yaml`: full runtime SHA `7e1e8f9819cf840aee1f3c33e3d1233853789864`, version "0.2.0", subdirectory `hackertube`, community tier, Hermes >=0.23.0. It is the reviewed and merged PR #19 build. The screenshot URLs are separately pinned to immutable materials commit `41b4444aa59e33aa65f7d1c9a88ebf25f831d22e`; their installed payload matches the runtime pin (37/37 files). The repository owner is `rcmiller01`. This remains prepared PR text, not an upstream PR.

## Disclosure

Explicit Search sends the question and bounded metadata to the selected Hermes model provider and contacts enabled source APIs plus the configured Hermes web-search backend. Supported destinations, optional key names, stored data, removal behavior and source terms are in `hackertube/README.md`. Hermes owns model credentials/routing; source keys use declared secret settings and secret scope. The plugin reads its seed, native services/configuration and profile-local plugin data. It does not read credential files, memory or unrelated chat history.

An explicit Search starts a supervised Python/Hermes CLI worker and independent watchdog through public CLI registration, fixed arguments and private pipes. These are finite per-search processes, not recurring paid jobs. No agent turn, approval bypass, shell command, telemetry, self-update, core override, media download/playback or native binary is shipped. Questions, normalized source metadata, job summaries/results, library flags, source choices and open history persist in the serving profile's plugin data; disabling retains data, and uninstall cleanup is documented in the installable README.

Jobs have 12 logical dispatches, up to 24 results and a 45-second local deadline, including worker startup. Cancel stops/reaps local work before confirmation. Interrupted jobs require another explicit action. Remote processing or billing already accepted by a service may continue; unknown costs remain unknown. Ordinary browsing/library actions make no model or search call. macOS/Linux process groups and Hermes CLI on PATH are required; macOS is verified, Linux integration is unrun.

The development seed has no curated community endorsements. Reddit remains disabled; Podcast Index is optional, lacks configured credentials and has not been live-tested. YouTube works with the configured key, but enabled-source release acceptance checks remain open. Apple audiobook results currently use the Apple Podcasts source label; model fit is not an independent full-content judgment.

## Evidence

- Actual installed merged-build six-step demo: **29.25 seconds**, including an uncut live AI search, Save, matching Apple Books source, and Karpathy credit. Prepared local video, not posted.
- Final filmed search: **2 videos / 2 podcasts / 1 book / 3 audiobooks**, 11/12 logical requests, cost unknown, approximately 9.687 seconds from submit to observed result.
- Merged-build live controlled-stall checks: full deadline **45.014 seconds**, in-flight UI Cancel **0.078 seconds**; workers reaped, no live group members, counts retained. These are separate supporting checks, not scenes silently inserted into the short demo.
- Exact runtime-pin native plugin validation passes without warnings. Its payload is identical to the reviewed implementation with 287 passing Python and 80 passing browser tests; those unchanged suites were reused rather than relabeled as a new run.
- Fresh UI screenshots in `docs/receipts/pr19-demo/`; metadata, hashes, complete limitations and recording history in its README.

**Draft only:** before opening the upstream PR, finish public clone/release checks and the recorded source acceptance gate. Robert confirms solo entry, MIT authority, and idea-only Karpathy inspiration with no known code reuse. Source fixes and the scoped secret audit are in project PR #21; review/merge, source consent acceptance and a new final runtime pin are still required before publication. Publishing the repository, upstream catalog PR, X post and form are separate explicitly authorized actions. The official announcement permits form submission once the catalog PR is open; its merge is not a prerequisite.
