# Merged PR #19 demo and submission refresh

Subsequent pre-public audit: Robert confirms solo/MIT/idea-only provenance, resolving that earlier missing information. [PR #21](https://github.com/rcmiller01/hackertube/pull/21) holds source fixes and sanitized secret-audit evidence. This video remains pinned to merged PR #19 and is not relabeled as those unmerged changes.

Runtime/catalog pin: `7e1e8f9819cf840aee1f3c33e3d1233853789864`, version `0.2.0`, merged PR #19. All 37 installed files match this commit; no runtime or test file changes are part of this materials PR. The source package's existing README already discloses the process worker/watchdog, storage, sources and remote billing caveat. Native validation was rerun on a clean export of the exact merged commit with `--install-deps`: passes with zero warnings. Host: Hermes v0.23.0+1212.g719240d, Python 3.14.9, macOS, default-profile installed dashboard. The current Search route remains the already configured OpenRouter `openai/gpt-5.4-mini`; no model/source/credential setting was changed.

## Generated acceptance table

Derived from [verification.json](verification.json), [jobs](jobs.json), [ffprobe](ffprobe.json), [catalog validation](catalog-validation.json) and [installed hashes](installed-manifest.json).

| Check | Value | Acceptance | Disposition |
| --- | --- | --- | --- |
| Runtime commit | 7e1e8f9819cf840aee1f3c33e3d1233853789864 | merged, reviewed PR #19 | PASS |
| Native validation | 0 warnings | passes at exact merged pin | PASS |
| Installed payload | 37/37 | all hashes match | PASS |
| Demo duration | 29.25 seconds | <90 seconds | PASS |
| Final Search | succeeded | succeeded; four nonempty categories | PASS |
| Final category counts | 2 / 2 / 1 / 3 | videos / podcasts / books / audiobooks | PASS |
| Logical requests | 11 | ≤12; cost unknown | PASS |
| Visible search wait | 9.687 seconds | original wall time preserved | OBSERVED |
| Saved library | 3 → 4 | all prior saves retained; one new save | PASS |
| Source opening | matching Apple Books audiobook | rendered original identity | PASS |
| Catalog mapping | accepted, 3 immutable screenshot objects | correct SHA / quoted version / subdir | PASS |
| Public visibility | PRIVATE | public HTTPS clone required | OPEN |

## Actual new recording

Video: `/Users/robert/Documents/Codex/2026-11-08/hackertube-demo-pr19/hackertube-pr19-demo.mp4`. SHA-256: `194615b065bd9b9d703982569b2fc4b6133a61c23cba703067eae63086215408`; 945,160 bytes. It is kept locally for review/X attachment, not uploaded or placed in the installable package. The previous 36.25-second video remains historical and is not the current submission attachment.

The fresh six-step video shows the installed page, prepared catalog, explicit live AI Search, one audiobook Save, its original Apple Books page, and Andrej Karpathy credit. All four result sections were visited. It is silent and uses 120 actual CUA tab screenshots over 29.039 wall seconds (about four captures/second), encoded to H.264 at 20 fps. Original frame timestamps are retained; source-tab dimensions are letterboxed to a common canvas. No generated scene, mock result, sped-up search or removed search wait is included. The encoded duration is 29.25 seconds. We inspected screenshot evidence and representative encoded frames for the six actions. [Walkthrough/evidence map](walkthrough.json) records the scope and the recorder metadata limitation.

Three individually acknowledged live searches occurred during preparation: calibration job 22, an incomplete recording of job 23, and final job 24. All succeeded at 11 logical requests each with unknown cost. The early recorder attempt lost its background context; the next attempt encountered the recorder's short locator wait. They are retained outside Git as failed takes and are not relabeled as the final video. The final take uses a capture loop in one live tool context with bounded visible-state observation, and has no capture error. Its generic frame labels/empty step-label array are disclosed in walkthrough.json; actual frames, UI observations, source identity and profile writes establish the six steps independently. No application change or provider retry was made to repair the recorder.

Final job `job:24:017ed0f4a78d48c8969e40eae2f4e7f4` returned **2 videos / 2 podcasts / 1 book / 3 audiobooks**, 8 total. Save added Artificial Intelligence For Dummies; its matching Apple Books page rendered. All three pre-existing saves remain. One source-open event was added. Interests/source settings are unchanged. No media played or downloaded, no purchase/sign-in/CAPTCHA interaction occurred. This is a functional demo, not a new broad relevance evaluation; Apple audiobook source captions still say Apple Podcasts and remain a disclosed release/polish item.

The supporting [live hard-stop receipt](deadline-cancel-live.json) belongs to this same merged payload: controlled worker pause after a real provider connection, deadline 45.014s and UI Cancel 0.078s, both workers reaped and counts retained. These earlier controlled-stop checks are not scenes inserted into the short demo. Accepted remote processing/billing may continue; local cancellation is not a vendor refund guarantee.

## Catalog and official-rule reconciliation

The prepared catalog entry pins the merged runtime, while its gallery URLs pin immutable materials commit `41b4444aa59e33aa65f7d1c9a88ebf25f831d22e`. Each image exists in that Git tree; public raw-image access remains unverified because the repository is private. Hermes's current `entry_from_mapping` parser accepted all entry fields, the quoted version, 40-character runtime pin, subdir and all three screenshots without warnings. A first parser attempt used the bare bundled Python without PyYAML and failed before validation; it was rerun successfully with the actual Hermes environment. No dependency was installed or changed for that correction.

The official [catalog guide](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins/catalog-submission) was read online. The [official announcement](https://x.com/NousResearch/status/2118094256438936062), inaccessible to the web fetcher, was then read in the browser: November 11, 2026 at 5 p.m. EST / 22:00 UTC, a working video under 90 seconds on X tagging @NousResearch, an open catalog PR, and both links in the entry form. Catalog merge is not a prerequisite for submitting the form. The live Typeform was reachable; only its welcome/first question (Plugin Title, 1 of 6) was inspected. No field value was entered or submitted. [Official check metadata](official-check.json) distinguishes observed from inherited packet fields. No detailed additional entrant/team/originality/IP rule was visible; existing entrant confirmation remains open rather than invented as an official restriction.

[Repository metadata](repository.json) currently reports PRIVATE. The new [submission packet](../../submission/README.md), [blocker list](../../submission/blockers.md), catalog draft/PR disclosure, 271-character X draft and private form description/build/video pointers are updated. Contact values remain outside Git, supplied previously by Robert; public URL fields remain null. Five active public materials files and one private form draft were enumerated/updated, plus the execution pointer and verification/tasks. Prior receipts are explicitly historical. The package/source behavior, version and tests are unchanged; the existing exact-payload 287 Python/80 browser receipts are reused, not claimed as newly run.

Still open: publication/credential-free clone, enabled-source acceptance, entrant-specific confirmation, actual upstream PR, X post and form submission. The materials PR must be reviewed separately. Disabled optional services, expanded seed, Linux integration, wider lifecycle and the 20-request study are not silently promoted into new hackathon entry requirements. Nothing was made public or externally submitted.
