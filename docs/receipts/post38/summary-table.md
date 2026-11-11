| Check | Result |
|---|---|
| Python (pytest -q) | 334 passed / 0 failed |
| Node full suite (3 runs) | 178/178/0, 178/178/0, 178/178/0 |
| FEED12 (10 runs) | 10/10 |
| Node suite, the run with the unrelated flake | 178/177/1 (PREF16 interest remove button works by keyboard and stays removed after reload in tests/test_browser_requests.js) |
| Mutations, all as expected | yes |
| Mutations the OLD check missed | ring rgba(24,24,27,.25), opacity .3 on the ring, ring color(srgb .6 .6 .6) |
| `hermes plugins validate .` | exit 0 |
| `hermes plugins doctor . --ci` | exit 0 |
| Clean-profile source-down pass | sources 7, items 0, ledger {'free': 0, 'paid': 0, 'metered': 0} (down: hn) |
