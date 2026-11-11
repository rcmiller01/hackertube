| Check | Result |
|---|---|
| Python (pytest -q) | 334 passed / 0 failed |
| Node full suite (`node --test tests/*.js`) | 178 tests, 178 passed / 0 failed |
| FEED12 (10 runs) | 10/10 |
| Ring mutations caught (red) | 7/7 |
| Green control after every revert | exit 0, both tests pass: True |
| Real host, compact Watch ring clipped | no (4 measurements: 320/390 x light/dark) |
| `hermes plugins validate .` | exit 0 (Validation passed.) |
| `hermes plugins doctor . --ci` | exit 0 (OK: runtime discovery, manifest parsing, import, and registration passed) |
