# Task 3.3 receipts — request boundaries and zero paid calls

Run on 2026-11-06. Fix round after the review of the merged head `6e840fd`.

| Field | Value |
|---|---|
| code commit | `3bdc023` (tests, red on their own) then `078014f` (implementation) |
| base | `6e840fd068a014ff9d98d8fe838bf15b06e8f6b5` (main, task 3.3 first landing) |
| branch | `hermes/3.3-request-boundary-fix1` |
| interpreter | CPython 3.14.7 (`.venv/bin/python`) |
| node | node 26.7.0 |

## Procedure

```sh
.venv/bin/python -m pytest tests -q
PLAYWRIGHT_BROWSERS_PATH=$HOME/.hermes/tools node --test tests/test_dashboard_page.js
.venv/bin/python docs/receipts/requests/probe.py
.venv/bin/python docs/receipts/requests/bypass_probe.py
```

Dependencies for the Python suite (the route harness mounts the FastAPI
router):

```sh
uv pip install --python .venv/bin/python pytest fastapi httpx
```

The page suite resolves `esbuild`, `playwright`, `react`, and
`react-dom/client` from `HACKERTUBE_NODE_MODULES`, then `NODE_PATH`, then
`~/.hermes/hermes-agent/node_modules`. It no longer hardcodes a `/tmp`
React path, so `PLAYWRIGHT_BROWSERS_PATH` is the only variable needed:

```sh
PLAYWRIGHT_BROWSERS_PATH=$HOME/.hermes/tools node --test tests/test_dashboard_page.js
```

## Counts measured at `078014f`

| Check | Command | Observed |
|---|---|---|
| Python suite | `.venv/bin/python -m pytest tests -q` | **125 passed, 0 failed** (118 at `6e840fd`) |
| Page suite | `node --test tests/test_dashboard_page.js` | **38 pass, 0 fail** (36 before; 35 pass / 1 fail on the old harness because of the hardcoded React path) |
| Boundaries tests at the red commit `3bdc023` | `.venv/bin/python -m pytest tests -q` | **18 failed, 107 passed** (red-commit-tests.log) |
| New test files against `6e840fd` | `.venv/bin/python -m pytest tests/test_request_boundary.py tests/test_request_boundary_routes.py -q` | **15 failed, 3 passed** (main-red-tests.log) |
| OpenSpec strict | `OPENSPEC_TELEMETRY=0 npx --yes --package @fission-ai/openspec@1.16.0 openspec validate --all --strict --no-interactive` | 1 passed, 0 failed |
| Coverage | `.venv/bin/python scripts/check_spec_coverage.py` | PASS, 95 scenarios |
| Pre-fix defect probe | `.venv/bin/python docs/receipts/requests/red_against_main.py` in a worktree at `6e840fd` | connect_ex CONNECTED rc=0 with counters `{free:0, paid:0}`; keyed YouTube read `{free:1, paid:0}`; unclassified read accepted |
| Same probe on the fixed tree | `.venv/bin/python docs/receipts/requests/red_against_main.py` | connect_ex refused; keyed YouTube read `{metered:1}`; unclassified read raises `TypeError` |

Logs: `pytest.log`, `node.log`, `probe.log`/(`report.json`),
`boundary-red.log`, `main-red-tests.log`, `red-commit-tests.log`,
`openspec.log`.

## The boundary

`hackertube_core/outbound.py` is the single outbound request boundary.
`dispatch` counts every call under the label its caller declares:

- `free` — a public source read that costs nothing and spends no quota.
- `metered` — a read that spends a provider quota or plan allowance, such as
  the keyed YouTube Data API `videos.list`.
- `paid` — a billed model or paid-search call. A paid call with no reported
  cost is reported as unknown, never as zero (JOB04).

`read_json` is the only fetch in the tree and its `classification`
argument is keyword-only and required, so a new adapter cannot inherit
`free` by omitting it. `counters()` reports `free`, `paid`, and `metered`;
`charged()` reports paid + metered and is what `/feed` exposes as
`paid_calls`, so a metered read cannot pass the page's zero-charge check.

`outbound.install_guard` / `outbound.guard()` replace every connection
entry point: `socket.socket.connect`, `connect_ex`, `sendto`, `sendmsg`,
`socket.create_connection`, `getaddrinfo`, `gethostbyname`,
`gethostbyname_ex`, `http.client.HTTPConnection.connect`,
`HTTPSConnection.connect`, and `urllib.request.urlopen`. A connection while
no boundary request is in progress on that thread raises
`NetworkOutsideBoundary`. The in-flight marker is a context variable, so a
worker thread started inside a request is not authorised.

Two static scans back the guard: one fails a module outside the allowlist
that imports a network client, the other fails a module outside the
allowlist that calls one of those entry points. The second exists because
`http.py` and `text.py` are already allowed to import `socket`, so the
import scan alone could not catch a second connection added there.

## Scenario receipts

### FEED04 Browse without paid calls

`tests/test_request_boundary_routes.py::test_feed04_browsing_paging_saving_dismissing_and_reopening_make_no_request`
drives the real routes under the guard: `GET /catalog`, `GET /feed`,
`GET /profile`, `POST /profile/interests`, `GET /feed` (ranked, 10 items),
`POST /profile/saves`, `GET /feed` (saved item retained),
`POST /profile/dismissals`, `GET /feed` (dismissed item gone from the feed
and from every section's browse group), `POST /profile/opens`, then a fresh
plugin load and client over the same data root — the reopened dashboard
re-reads the store from disk and the dismissal and open are still there.
Every phase asserts `counters() == {free:0, paid:0, metered:0}` and
`in_flight == 0`. `probe.py` records the same run phase by phase in
`report.json`.

Show more is a page control, not a backend call: `tests/test_dashboard_page.js::FEED04 Show more is the rendered control, and it dispatches no request`
mounts the page, asserts four cards first, activates the rendered control,
asserts the fifth card appears, and asserts the control dispatched no
request. The mutation controls are driven in the same file
(`FEED04 Save, Dismiss, and Open controls post to the profile routes`):
each control posts exactly once to `/api/plugins/hackertube/profile/saves`,
`/dismissals`, or `/opens` with `{item_id}`, and every URL on the click path
stays under `/api/plugins/hackertube/`.

### PREF08 Read-only browsing

`tests/test_request_boundary_routes.py::test_pref08_read_only_browsing_submits_nothing_outside_the_profile`
stores four interests through the real route and reads `/feed` for each.
No request is dispatched at all, so nothing — least of all personal context
— leaves the process. `usage()` is a known zero cost.

### JOB02 No background paid refresh

`tests/test_request_boundary_routes.py::test_job02_loading_the_plugin_repeatedly_starts_no_paid_job`
loads the plugin five times against one data root and displays the feed
each time: zero requests, no scheduler. `test_no_module_schedules_recurring_work`
scans every package module for `sched`, `apscheduler`, `threading`,
`multiprocessing`, `concurrent.futures`, and for `create_task`,
`call_later`, `call_at`, `enter`, `Timer`.

Scope: this is the plugin-level load and display. The Hermes **host**
install/load walk was not run (see Not run), so host scheduler behaviour is
not claimed.

### JOB04 Provider omits cost

Accounting only in 3.3. `tests/test_request_boundary.py::test_job04_a_paid_call_with_no_reported_cost_is_unknown`
dispatches a paid call with `cost=None`: `usage()["cost_usd"]` is `None` and
`unknown_cost_calls` is 1. A paid call reporting 0.25 reports 0.25. A metered
read never converts that to a zero-cost paid call.
`tests/test_request_boundary_routes.py::test_job04_a_paid_call_with_no_reported_cost_reaches_the_feed_as_unknown`
asserts the same rule holds through the boundary the feed reads.

**Not verified:** the rendered job cost. The job progress and status display
is task 4.x (`specs/request-jobs/spec.md:33-35` covers the requirement, and
no job surface exists in 3.3). No receipt here claims the display.

## Not run

- The Hermes host install/load and the loopback browser walk. The `hermes`
  CLI on this box refuses to start with `no dependency environment is
  committed for this install; run hermes pm repair`. The plugin-level load
  is exercised instead; host behaviour is not claimed.
- A real paid provider call. The demo makes none. JOB04 is exercised with an
  injected paid dispatch, and the paid and metered counters stay 0 in every
  browsing run.
- Live DNS. `tests/conftest.py` refuses it suite-wide. Every loopback
  connection in these tests is a listener on `127.0.0.1` opened by the test
  itself; no external traffic was sent in this run.