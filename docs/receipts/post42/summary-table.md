| Check | Result |
|---|---|
| Python (pytest -q) | 336 passed / 0 failed |
| Node full suite (`node --test tests/*.js`) | 179 tests, 179 passed / 0 failed |
| FEED12 (10 runs) | 10/10 |
| An absolute home path under `docs/receipts/` (`Users`/`home` prefix) | 0 matches over 1172 files |
| no slit (the full ring) | this card: 163/163 (100.0%) painted, 0 partly painted -> PASSES; the 50% band: 163/163 (100.0%) -> PASSES |
| 1px slit, integer offset | this card: 162/163 (99.4%) painted, 0 partly painted -> FAILS as coverage; the 50% band: 162/163 (99.4%) -> FAILS as coverage |
| 1px slit, .25px offset | this card: 161/163 (98.8%) painted, 2 partly painted -> FAILS as coverage; the 50% band: 162/163 (99.4%) -> FAILS as coverage |
| 1px slit, .5px offset | this card: 161/163 (98.8%) painted, 2 partly painted -> FAILS as coverage; the 50% band: 163/163 (100.0%) -> PASSES |
| 1px slit, .75px offset | this card: 161/163 (98.8%) painted, 2 partly painted -> FAILS as coverage; the 50% band: 162/163 (99.4%) -> FAILS as coverage |
| 5px slit (the old 97% control) | this card: 158/163 (96.9%) painted, 0 partly painted -> FAILS as coverage; the 50% band: 158/163 (96.9%) -> FAILS as coverage |
| 12px slit (94%) | this card: 151/163 (92.6%) painted, 0 partly painted -> FAILS as coverage; the 50% band: 151/163 (92.6%) -> FAILS as coverage |
| Ring mutations caught by these tests (red) | 13/13 |
| Green control after every revert | exit 0, all three tests pass: True |
| Clean profile, source-down failure path | return with 7 sources accounted, 0 items, outbound {'free': 0, 'paid': 0, 'metered': 0} (down source: hn) |
| `hermes plugins validate .` | exit 0 (Validation passed.) |
| `hermes plugins doctor . --ci` | exit 0 (OK: runtime discovery) |
