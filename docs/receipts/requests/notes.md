# Task 3.3 receipts — backend request accounting and browser observation

Run on November 6, 2026, branch `hermes/3.3-request-boundary-fix1`, PR #13.
Code under test: `9b8b76960421b457d488e48b8edd07bf9574d289`; base main
`6e840fd068a014ff9d98d8fe838bf15b06e8f6b5`.

## Correction of record and scope

This supersedes the earlier receipt claims at `078014f`/`4b4820b` that
`read_json` was the only fetch in the entire product and that all browser
requests passed through the Python ledger. Those claims remain in historical
commit messages and prior PR comments; they were too broad. The previous
Show more receipt observed SDK calls only, with artwork disabled.

The owner direction recorded by Eve on Kanban `t_7d655798` on November 6
permits backend-only production accounting with browser artwork explicitly
scoped. This run uses that option: **one Python-process production boundary,
plus a separate browser observation receipt**, not a cross-process interceptor.
There is no production browser counter or browser resource firewall added.
The zero-paid browsing requirement is unchanged; no search/model-key/4.x
implementation is included.

Inventory at this code commit:

- One production `read_json` caller: keyed YouTube `videos.list`, labeled
  `metered`. Other source adapters currently parse stored payloads.
- One backend dispatch chokepoint in `read_json`, one `connection_targets`
  call in that scope, one indirect default `socket.getaddrinfo` lookup, one
  pinned `socket.create_connection` call. Eleven guarded entry points remain
  enumerated by `outbound.guard_targets()` and tested by the existing suite.
- Four frontend `SDK.fetchJSON` sites: catalog, feed, profile, mutation helper.
  These call the local plugin API and are not backend outbound requests.
- One `img src` emission site: hotlinked artwork is a browser request, not a
  Python request. User-activated source/evidence/About links are navigation,
  not implicit provider dispatch; live destination navigation and redirects
  are not measured by this receipt.

## Reproduction and environment

Python: `<repo>-3.3/.venv/bin/python`,
**CPython 3.14.7**. Installed dependencies: pytest 9.2.0, fastapi 0.162.0,
httpx 0.28.1. Node: **v26.7.0**. Python dependencies can be installed with:

```sh
uv pip install --python .venv/bin/python pytest==9.2.0 fastapi==0.162.0 httpx==0.28.1
```

The page harness resolves esbuild, playwright, react and react-dom from
`HACKERTUBE_NODE_MODULES`, `NODE_PATH`, or `~/.hermes/hermes-agent/node_modules`.
A missing dependency/browser fails the test; there is no skip fallback.

```sh
.venv/bin/python -m pytest tests --collect-only -q
.venv/bin/python -m pytest tests -q
PLAYWRIGHT_BROWSERS_PATH=$HOME/.hermes/tools node --test tests/test_dashboard_page.js tests/test_browser_requests.js
.venv/bin/python docs/receipts/requests/probe.py
.venv/bin/python docs/receipts/requests/bypass_probe.py
PLAYWRIGHT_BROWSERS_PATH=$HOME/.hermes/tools node docs/receipts/requests/browser_probe.js
OPENSPEC_TELEMETRY=0 npx --yes --package @fission-ai/openspec@1.16.0 openspec validate --all --strict --no-interactive
.venv/bin/python scripts/check_spec_coverage.py
```

## Checks and red/green evidence

The full suites were run in a clean `git archive` export of code commit
`9b8b769` within this task's workspace, using the interpreter above. No
scratch Python test files were added to that export.

- `collect.log`: **133 collected**.
- `pytest.log`: **133 passed, 0 failed**, one Starlette/httpx deprecation
  warning. This warning is disclosed, not counted as a failure.
- `node.log`: **41 passed, 0 failed, 0 skipped** across both JS test files.
- `openspec.log`: **1 passed, 0 failed**.
- Coverage checker: **95 scenarios**, structure/traceability only.
- New DNS regression at standalone red commit `fc7bf6d`: **8 failed, 0
  passed**, all at `NetworkOutsideBoundary('socket.getaddrinfo')` on the
  pre-fix code. `dns-red.log` contains the real failures. After the fix all
  eight pass (included in the full 133).
- Historical first fix-round red logs are retained as historical evidence:
  `main-red-tests.log` and `red-commit-tests.log` are not new measurements.
- `boundary-red.log`: direct urlopen/connect_ex refused with counters all
  zero; counted loopback connect_ex succeeds with free=1. No live DNS.

DNS, address validation after DNS, opening, reading, and closing now share
one authorized dispatch. The three request labels and five failure cases
(DNS error, empty answer, private answer, opener error, body-read error) are
exercised offline **without passing a `resolve=` argument**. Stub DNS and
transport observations independently assert `in_flight == 1`, exactly one
attempt counted, unsafe addresses never opened, and scope cleared afterward.
The default resolver is replaced below the production guard, not bypassed.

## Scenario receipts

### FEED04 — ordinary browsing

`tests/test_request_boundary_routes.py` and `probe.py` exercise the actual
plugin routes and persisted ProfileStore: catalog/feed/profile reads,
interest changes and rerank, save, dismiss, open event, and a fresh plugin
load against the same data directory. The reopened routes confirm saved,
dismissed, and open state from disk. `report.json` records backend
`{free:0, metered:0, paid:0}` at every browsing phase. Its `paging` entry is
only backend pagination metadata; actual Show more is exercised in JS.

`tests/test_dashboard_page.js` activates real page controls, including
Show more, Save, Dismiss, and Open, and checks their SDK route payloads.
`tests/test_browser_requests.js` additionally uses Chromium with the actual
page bundle and **artwork enabled**. This browser harness has a **stub API**
and in-memory state; it does not replace the separate real-route/persisted
store test and is not claimed as an installed-host end-to-end test.

`browser-report.json` is the raw browser observation from the clean export;
`browser-probe.log` is generated from it by `browser_probe.js`. The observed
requests comprise **18 local API/assets requests and 9 free artwork attempts,
27 total, 0 outside-inventory requests, 0 paid/metered requests**. Counts are
attempts: artwork responses were fulfilled offline; nothing contacted Open
Library, a model provider, or a paid service. Per-phase rows below were
programmatically derived from that JSON, not inferred from SDK calls:

| Phase | Local requests | Free artwork attempts | Outside |
|---|---:|---:|---:|
| feed load | 6 | 4 | 0 |
| show more | 0 | 1 | 0 |
| section browse | 0 | 0 | 0 |
| save | 3 | 0 | 0 |
| dismiss | 3 | 0 | 0 |
| reopen | 6 | 4 | 0 |
| library | 0 | 0 | 0 |

Browser counts are observations, not a constant enforced across runs.
React response timing/cache behavior can change the number of image
attempts; tests compare each run's browser events with independent local
server/interception records rather than hardcoding this total. A preliminary
workspace probe observed 10 artwork attempts (5 on reopen), whereas the
published clean-export receipt observed 9 (4 on reopen). Only the latter's
complete raw record is published; the earlier console-only count is not a
second reproducible receipt. Neither is a backend free-call count.

The browser observer accepts only its exact local route inventory and the
fixture's approved Open Library cover URLs; unknown endpoints never inherit
`free`. Its negative control renders an unapproved image URL and confirms
that the real browser event appears as `outside`, which fails the ordinary
walk assertion. Server counts and intercepted image counts independently
match all browser events phase by phase. Library and dismiss state survive
the browser reload in the stub; real on-disk persistence is verified in Python.

### PREF08 — no personal context to external model/search

The real-route test stores four different interests and locally reranks;
`report.json` has all-zero backend counters. The browser walk observes only
local API/assets and fixed cover URLs, no model/search destination. This is
not a claim of zero external browser traffic: free artwork is disclosed above.

### JOB02 — no implicit paid work

The real plugin-load test loads the plugin five times against one data root
and displays the feed with all-zero backend counters. The scheduler scan
remains green. This is **plugin-level load/display only**; the Hermes host
installation/scheduler lifecycle was not run and JOB02 is partial at that
host boundary.

### JOB04 — accounting only

A stub paid dispatch without reported cost produces `cost_usd: null` and
`unknown_cost_calls: 1`; a reported cost of 0.25 stays 0.25. This is
**ledger-only** accounting: `GET /feed` carries the paid **count** only
(`paid_calls` and `request_counts`), and neither `cost_usd` nor
`unknown_cost_calls` reaches the page, so the unknown cost does not propagate
as a value. A stub keyed YouTube read counts metered=1; a stub unmetered
source read counts free=1. These are positive classification controls, not
actual billed deliveries. **Rendered job-cost display remains unverified**,
belongs to 4.x, and is not claimed complete by this receipt.

## Not run / not claimed

- Hermes host install/load, lifecycle/scheduler behavior, or real-host browser
  integration. The earlier CLI failure (`run hermes pm repair`) is historical;
  no host repair or configuration change was attempted for this task.
- Live DNS, live artwork deliveries/redirects, or real paid/metered calls.
- A unified Python-plus-browser production request boundary, or runtime
  browser accounting enforcement. Production counters are backend-only by
  the recorded owner scope reconciliation.
- Model-key handling, explicit search, or any task 4.x implementation.
