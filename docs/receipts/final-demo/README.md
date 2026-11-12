# Final installed demo — version 0.2.2

Runtime/catalog pin: `3e65af3b424bb932de944731340d99122f0a67ed` (merged PR #23; includes merged PRs #19, #21 and #22). Exact runtime is byte-identical to reviewed/tested implementation `bafa37de8507042f73b1e8a33bce1b43f8c5b14b`. [Installed manifest](installed-manifest.json), [verification](verification.json), [normalized live result](live-results.json), [capture timing](capture.json), [media probe](ffprobe.json), [native validation](validation.json).

| Check | Observed | Acceptance | Disposition |
| --- | --- | --- | --- |
| Final MP4 | 23.25 seconds | <90 seconds | PASS |
| Capture | 102 actual frames / 23.065 wall seconds | original elapsed time | PASS |
| Max frame gap | 0.291 seconds | disclosed low-frame-rate video | PASS |
| Source-pinned installed files | 39/39 | all match | PASS |
| Live job 27 | succeeded, 16 admitted results | evidence-backed, all four categories | PASS |
| Videos / podcasts / books / audiobooks | 4 / 4 / 5 / 3 | each >0 | PASS |
| Logical requests | 11/12 | ≤12 | PASS |
| Visible Search | 9.67 seconds | 45-second local deadline | PASS |
| Saved state | 6 → 7; all original saves retained | preserved | PASS |
| Native validate | ok, 0 warnings | ok | PASS |

The local attachment is `<home>/Documents/Codex/2026-11-08/hackertube-demo-final/hackertube-final-demo.mp4` (SHA-256 `531fec7bab344c9b4430773e70e9ec1d7865e21f4142c9bb6951d663eeeefffb`). It is a silent, actual installed UI recording, sampled at about 4.4 fps and encoded at 20 fps with original wall time retained. No mock scenes, synthetic results, removed Search wait or sped-up sections. One continuous six-step take: prepared discovery; explicit Search; browse all four result categories; Save; matching original Apple Books source; Karpathy credit/disclosures. The final policy agreement was previously explicitly authorized and remains valid; it is not reaccepted for filming.

Question: “Find introductory artificial intelligence resources for a beginner. Include videos, educational podcasts, books, and audiobooks.” Existing Hermes assignment: OpenRouter `openai/gpt-5.4-mini`; no provider/key selection was changed. Cost remains unknown. Normalized result and UI show the unavailable optional sources honestly. Final source opening: https://books.apple.com/us/audiobook/artificial-intelligence/id1480129835?uo=4. No purchase, playback or media download.

Recording history is retained: job 25 on 0.2.1 returned 3/3/3/3 and exposed the broken icon, fixed in PR #23. Job 26 on corrected 0.2.2 returned partial ranking with 0/6/2/4; YouTube retrieved eight candidates but ranking omitted videos. Those two captures and complete local frames remain outside Git in `hackertube-demo-v021/` and `hackertube-demo-v022-partial/`. Job 27 with clearer introductory/educational wording is the final attachment. Each job used 11 logical requests; three filming searches used 33 total, with unknown provider cost. No cached or unranked result was substituted. This is one successful qualified request, not proof that wording always fixes ranking or a 20-request relevance study.

The fresh [YouTube view](videos.jpg) shows working official attribution; [Podcasts](podcasts.jpg), [Books](books.jpg) and [Audiobooks](audiobooks.jpg) show actual admitted records and corrected Apple Books captions. [Original source](source.jpg) and [About](about.jpg) complete the six steps. Prior PR #19 video remains historical, not the current attachment.

The unchanged hard-stop path retains its prior native facade/localhost receipt (6-second setting: 6.018 seconds; Cancel: 0.040 seconds), pinned to 8c6b8bb in `../privacy-release/`; actual earlier merged-PR19 live-provider controlled-stall tests are in `../pr19-demo/`. They are supporting historical checks, not newly relabeled runs or edited into this demo. Current full suites: 309 Python / 83 Node+Chromium pass; native validation was rerun at this exact merged pin. Linux integration remains unrun; remote accepted work may still process/bill.

[Open Library registration](openlibrary-registration.json) is submitted and confirmed recorded, with public featuring declined. This is not provider approval. Repository stays private; catalog PR, X publication and hackathon form remain unsubmitted until separately authorized. Contact details, profile snapshots, original frames and raw registration confirmation stay outside Git.

## Final scoped security refresh

[Sanitized scan inventory](security-audit.json) at materials head `eae779e2e2ad336da5951b5232e41beba016e42a`: 182 reachable/reflog commits; 12 history alerts, all exactly matching prior independently verified source-manifest digest findings; **0 confirmed credentials / 0 untriaged alerts**. All 113/113 additional OCR inputs passed (11 historical image blobs and all 102 final-video frames). The 151 historical image inventory reuses 140 unchanged prior OCR objects. GitHub text includes 23 issue/PR bodies, 41 comments, 1 review and 0 review comments; the prepared replacement PR #20 body is also scanned. Text/OCR alerts: 0. Actions runs/artifacts/releases: 0/0/0. The supplied private email/Discord values appear in zero tracked files.

No live credential verification, key rotation, history rewrite or visibility change. Raw scanner/GitHub/OCR exports stay outside Git. The enabled Wiki clone endpoint was previously unavailable; that uninspected surface is explicitly not claimed empty. Pattern scanning/OCR is scoped evidence and can miss values, not an absolute absence guarantee. Receipt-only commits after this scan do not change runtime or media.
