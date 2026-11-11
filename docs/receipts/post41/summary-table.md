| Check | Result |
|---|---|
| Python (pytest -q) | 334 passed / 0 failed |
| Node full suite (`node --test tests/*.js`) | 179 tests, 179 passed / 0 failed |
| FEED12 (10 runs) | 10/10 |
| Ring mutations caught by these tests (red) | 6/6 |
| The same mutations against the BASE tests | 0/2 caught — 2 MISSED (that is the closed gap) |
| Green control after every revert | exit 0, all three tests pass: True |
| 1px gap, the rule this card ships | painted 162/163 (99.4%), 1 partly-painted pixel at 25.1% ring -> the coverage rule fires; min over painted 7.919:1 (contrast passes) |
| 1px gap, the rule it replaces | painted 163/163 (100.0%), 0 partly painted -> coverage passes; min over painted 1.726:1 at a pixel 25.1% ring, i.e. the coverage defect reported as a contrast reading |
| Clean profile, source-down failure path | return with 7 sources accounted, 0 items, outbound {'free': 0, 'paid': 0, 'metered': 0} (down source: hn) |
| Clean profile, installed assets | ring rule `.hackertube :focus,`; wrapper `.hackertube .hackertube {   padding: 0 4px;   margin: 0 -4px;   max-width: none; }` |
| `hermes plugins validate .` | exit 0 (Validation passed.) |
| `hermes plugins doctor . --ci` | exit 0 (OK: runtime discovery) |
