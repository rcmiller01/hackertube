| Check | Result |
|---|---|
| Python (pytest -q) | 334 passed / 0 failed |
| Node full suite (`node --test tests/*.js`) | 179 tests, 179 passed / 0 failed |
| FEED12 (10 runs) | 10/10 |
| Ring mutations caught (red) | 10/11 (the one NOT caught is the wanted PASS) |
| Green control after every revert | exit 0, all three tests pass: True |
| Real host, compact Watch ring clipped | no (8 measurements: 320/390/768/1280) |
| Real host, host-content clip edge moved out by | 4.0-4.0px (the link itself does not move; the full-page captures are byte-identical) |
| Real host, measured CardContent padding | 11.25px 15px at every width (block, inline) |
| Fixture, fixed vs pre-fix full-page capture | byte-identical at every width: True |
| Fixture, host CardContent padding 0 at 320px | ring differs between pre-fix and fixed: True |
| `hermes plugins validate .` | exit 0 (Validation passed.) |
| `hermes plugins doctor . --ci` | exit 0 (OK: runtime discovery) |
