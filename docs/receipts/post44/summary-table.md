# Measured checks

| Check | Result | Evidence |
|---|---|---|
| pytest | 338 collected; 338 passed, 0 failed | pytest-collect.log, pytest.log |
| Node | 181 tests; 181 passed, 0 failed, 0 skipped | node-full-suite.log |
| FEED12 | 10/10 successful runs | feed12-*.log |
| mutations | 16/16 caught; restored green control exit 0 | mutations.json, mutations.log, raw/ |
| validate / doctor | exit 0 / 0 | plugin-validate.log, plugin-doctor.log |
| path scanner | no matches in docs + openspec | path-scan.log; path-check.log |
| strongest-pixel-red | exit 1 (expected 1); restored=True | strongest-pixel-red.log |
| ignored-dpr-red | exit 1 (expected 1); restored=True | ignored-dpr-red.log |
| old-slit-red | exit 1 (expected 1); restored=True | old-slit-red.log |
| lighter-gradient-green | exit 0 (expected 0); restored=True | lighter-gradient-green.log |
| bytecode-walk-red | exit 1 (expected 1); restored=True | bytecode-walk-red.log |

## Mutation diagnoses

| Mutation | Exit | Caught | First failure |
|---|---|---|---|
| compact-side clips its own overflow | 1 | True | AssertionError [ERR_ASSERTION]: at 320px light the compact row's Watch link: no ancestor clips the left ring (cut by ht-compact-side; 0/163 of the side is painted) |
| youtube-compact wrapper clips | 1 | True | AssertionError [ERR_ASSERTION]: at 320px light the compact row's Watch link: no ancestor clips the left ring (cut by ht-youtube-compact; 0/163 of the side is painted) |
| ring colour dim but fully painted (rgba .25) | 1 | True | AssertionError [ERR_ASSERTION]: at 320px light the full card's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 1.71:1, ring rgb(189,189,190) on surface rgb(244,244,245) at 43,768; min over every sampled pixel 1.71:1) |
| compact Watch link at opacity .3 (with or without focus) | 1 | True | AssertionError [ERR_ASSERTION]: at 320px light the compact row's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 1.98:1, ring rgb(184,184,185) on surface rgb(255,255,255) at 36,719; min over every sampled pixel 1.98:1) |
| ring colour color(srgb .6 .6 .6) | 1 | True | AssertionError [ERR_ASSERTION]: at 320px light the full card's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 2.59:1, ring rgb(153,153,153) on surface rgb(244,244,245) at 43,768; min over every sampled pixel 2.59:1) |
| ring colour = the surface it paints on | 1 | True | AssertionError [ERR_ASSERTION]: at 320px light the full card's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 1.10:1, ring rgb(255,255,255) on surface rgb(244,244,245) at 43,768; min over every sampled pixel 1.10:1) |
| dark-only dim ring (.dark token block) | 1 | True | AssertionError [ERR_ASSERTION]: at 320px dark the full card's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 1.02:1, ring rgb(11,46,46) on surface rgb(7,48,48) at 43,768; min over every sampled pixel 1.02:1) |
| the dark tokens exist only for the media query, not for an ancestor class | 1 | True | AssertionError [ERR_ASSERTION]: at 320px dark the full card's Watch link: every painted pixel of the top ring reaches >= 3:1 (min over painted pixels 1.00:1, ring rgb(24,24,27) on surface rgb(4,28,28) at 58,753; min over every sampled pixel 1.00:1) |
| the #41 wrapper rule reverted (both copies) | 1 | True | AssertionError [ERR_ASSERTION]: at 320px light host-padding-0 the compact row's Watch link: no ancestor clips the left ring (cut by hackertube; 0/163 of the side is painted) |
| a plugin rule under @media (prefers-color-scheme: dark) kills the ring | 1 | True | AssertionError [ERR_ASSERTION]: at 320px os-dark the full card's Watch link: every painted pixel of the left ring reaches >= 3:1 (min over painted pixels 1.07:1, ring rgb(11,42,43) on surface rgb(7,48,48) at 43,768; min over every sampled pixel 1.07:1) |
| the coverage rule is a 95% painted fraction again | 1 | True | AssertionError [ERR_ASSERTION]: Missing expected exception: the 1px-gap ring control at a 0px offset fails as a COVERAGE finding, not as a contrast reading |
| the painted band is 50% again | 1 | True | AssertionError [ERR_ASSERTION]: the 1px-gap ring control at a 0.5px offset: the slit splits its boundary pixels, which are partly painted ({}) |
| the ring's painted test is a fixed channel delta again | 1 | True | AssertionError [ERR_ASSERTION]: the 1px-gap ring control at a 0.25px offset: the slit splits its boundary pixels, which are partly painted ({}) |
| the sampler uses CSS coordinates as PNG indexes again | 1 | True | AssertionError [ERR_ASSERTION]: at 390px light dpr-2 the full card's Watch link: every sampled pixel of the left ring is painted (0/301 painted, 0.0%) — a side passes only when 100% of its pixels carry the ring, so an unpainted or partly-painted pixel is a COVERAGE defect, not a contrast reading |
| a pixel is classified against the side's strongest difference again | 1 | True | AssertionError [ERR_ASSERTION]: the full ring over the gradient paints every pixel of its top side (133/194 painted; 61 partly painted {"0.95":12,"0.94":24,"0.93":25}) |
| the gradient-surface option is inert | 1 | True | AssertionError [ERR_ASSERTION]: the fixture paints a GRADIENT under the ring: at least one stroke's first and last sampled surfaces must differ (they are left rgb(255,255,255)->rgb(255,255,255), right rgb(255,255,255)->rgb(255,255,255), top rgb(255,255,255)->rgb(255,255,255), bottom rgb(255,255,255)->rgb(255,255,255)) |
