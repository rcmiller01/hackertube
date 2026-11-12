# Pre-public security and source-release receipt

Initial materials pin b29b20c8e26411b804838176c700b91c53962ca8; merged runtime pin 7e1e8f9819cf840aee1f3c33e3d1233853789864. New source implementation checked/installed privately: `abfebee24d86bcf8b3e08a15acd4eb3376b1c6ad`. Later commits in this PR contain receipt/docs only. **Repository remains private; public release is on HOLD for the remaining source gate.**

Table generated from [secret audit](secret-audit.json), [verification](verification.json), [native results](native-results.json), [check exits](fixed-checks.json) and [installed manifest](installed-manifest.json).

| Check | Observed | Acceptance | Disposition |
| --- | --- | --- | --- |
| Reachable Git commits | 163 | fetched branches/tags/PR heads + local reflogs | SCANNED |
| History alerts | 12 | all independently recomputed source-file hashes | 12 FALSE POSITIVES |
| Confirmed credentials | 0 | 0 confirmed / 0 untriaged | PASS |
| Historical + new screenshot OCR | 141 | all processed, 0 alerts | PASS |
| GitHub PR/issue bodies + comments + reviews | 20 + 41 + 1 | 0 credential alerts | PASS |
| Local unreachable blobs | 19 | 0 alerts | PASS |
| Python tests | 300 | 0 failures | PASS |
| Browser tests | 81 | 0 failures / 0 skips | PASS |
| Native plugin validation | 0 warnings | exact implementation passes | PASS |
| Native 6-second deadline | 6.016s | <7s; socket closed; 1 request retained | PASS |
| Native Cancel | 0.032s | <1s; socket closed; 1 request retained | PASS |
| Installed payload | 37/37 | hash matches fixed build | PASS |
| Saved items | 4 | unchanged, as are interests/history/source choices | PASS |

## Credential audit scope and limits

Gitleaks 8.30.1 was installed through Homebrew. All remote branch/tag and 20 GitHub PR-head refs were fetched into local audit refs. History scans include all refs/reflogs, decode depth 3 and archive depth 2; gitleaks:allow comments and repository ignore suppressions were not used to waive findings. The initial 570 tracked-file inventory includes the new materials; a second scan covers the source candidate. A private export scans commit messages, 20 GitHub PR/issue bodies, 41 issue comments and one review; review comments, Action runs/artifacts and releases enumerate as zero. No external secret-validity service was contacted. Default per-format pattern scanning is not proof against every encoded or low-entropy credential.

All 12 raw history alerts and six current-tree alerts are integrity-manifest entries. [Per-finding proof](final-classified-findings.json) records only rule/path/line/commit and hashed source path: each candidate digest was independently recomputed from that same commit's source blob. No broad allowlist was added, and no live-looking token was dismissed just because it appeared in a test. A separately generated synthetic Google-key-shaped positive control was detected; [control result](canary-result.json) publishes no value. The synthetic control stays outside Git and is not a leaked/live credential.

All 140 unique historical screenshot image blobs were exported privately and processed with Tesseract; their OCR text was scanned. The additional installed-caption screenshot was also OCR-scanned (141 total), with zero alerts. OCR can miss text; the current screenshot was visually checked as the normal library, not the credentials screen. Local Git fsck identified 19 unreachable blobs, also scanned with zero alerts; no history rewrite or deletion was performed. The Wiki flag is enabled but its authenticated clone returned repository-not-found, so no wiki content was retrieved; this is not represented as a complete audit of inaccessible server content.

Raw scanner JSON, GitHub exports, OCR and snapshots remain in `<home>/Documents/Codex/2026-11-08/hackertube-pre-public/` with private directory permissions. No actual credential value or approved contact address is printed or committed. Reports publish sanitized counts and verified false-positive locations only. The developer's private form contact stays outside Git. Usernames/local file paths and normal Git author metadata are not represented as authentication secrets. No credential rotation is indicated by the observed findings; this does not attest to exposure outside this repository. Rerun scans before publication after later edits/merges.

## Source corrections and actual checks

Regression tests were committed before fixes. [Original source red](source-red.log) records 5 failures / 3 controls; [UI red](source-ui-red.log) records the Apple Books caption failure. Separate red logs cover later-search copy age, future credential staging, source controls and both contact dispatch paths. The first new-test attempt used an unsupported short stub query and is retained privately as a harness error, not a product finding. A full run then caught the live policy edit changing frozen seed reproduction; [failed run](first-fixed-python.log) is preserved. Moving the current notice into the live policy override fixes that without editing the seed. The final clean immutable export collects/passes 300 Python cases and passes all 81 browser cases; one existing Starlette/httpx deprecation warning remains. Strict OpenSpec, coverage and fatal Python lint pass. Native validation passes with zero warnings; the real Hermes CLI/ctx.llm local stalled-provider probe still passes deadline/Cancel with retained usage. No live model search was started.

The retention boundary owns two stores: retrieved_catalog and search_result. It clears expired metadata copies on profile opening/metadata access using original metadata age, preserves truthful usage and independent saved flags, and does not start paid cleanup. Two Python attribution writers use one helper; all seven frontend source-name calls pass the item, and source controls name both Apple stores. [Installed caption](installed-caption.jpg) and [UI text](installed-caption.txt) verify Apple Books in the actual Hermes Library; 37/37 candidate files match and all four saved items/history/interests/source settings remain unchanged. This is the unmerged private candidate, not the old video build.

Robert explicitly approved his supplied contact for Open Library headers only. The declared optional OPENLIBRARY_CONTACT setting was written with `hermes config set`; its value is absent from source, URLs, other providers and result data. Both explicit-search and legacy-refresh dispatches share the same header helper and have regression coverage. [One authorized live lookup](openlibrary-live.json) succeeded with one free request and one result. No use-case registration form was sent, and the contact is not permission to transmit it to a separate external form.

## Remaining gates

[Pre-public decision](../../pre-public-release.md) and [source acceptance](../../source-release.md) distinguish code fixes from provider/consent obligations. Robert's solo/MIT/idea-only declaration closes the prior missing entrant information. YouTube still needs a published/versioned privacy agreement and explicit acceptance flow plus remaining retention/deletion/branding disposition; the current credit checkbox is not mislabeled as that agreement. A concrete [privacy draft](../../submission/privacy-policy.draft.md) is prepared, not deployed as an accepted policy. Requested Open Library use-case registration remains prepared locally and unsent.

Review/merge these source changes, resolve the remaining source gate, then repin/validate the runtime and refresh affected materials. PR #20's 29.25-second demo remains correctly pinned to prior merged PR #19. Public clone/gallery checks and the upstream catalog PR, X post and Typeform are deferred until explicit public-release authorization; none was sent. No organizer/provider message was sent. The repository has not been made public.
