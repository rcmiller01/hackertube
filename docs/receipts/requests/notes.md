# Task 3.3 receipts — request boundaries and zero paid calls

code commit: 53963e1ac5f8e8868a91da83eb3183f827038d8c
base: a3566679b157feecfe8ab1e9e1d6874839803143
branch: hermes/3.3-zero-paid-calls
interpreter: CPython 3.14.7

## Procedure

```sh
python -m pytest tests -q
node --test tests/test_dashboard_page.js
python docs/receipts/requests/probe.py
python docs/receipts/requests/bypass_probe.py
```

`node --test` needs the Hermes install's modules on `NODE_PATH` and a
browsers path:

```sh
NODE_PATH=~/.hermes/hermes-agent/node_modules \
  PLAYWRIGHT_BROWSERS_PATH=~/.hermes/tools \
  node --test tests/test_dashboard_page.js
```

## Counts

| Check | Command | Observed |
|---|---|---|
| Python suite | `python -m pytest tests -q` | 118 passed, 0 failed (107 before this change) |
| Page suite | `node --test tests/test_dashboard_page.js` | 36 pass, 0 fail |
| Browsing probe | `python docs/receipts/requests/probe.py` | browsing `{"free": 0, "paid": 0}`, usage `cost_usd` 0.0 |
| Source read probe | same | `{"free": 2, "paid": 0}` for two reads |
| Paid, no reported cost | same | `{"paid": 1, "cost_usd": null, "unknown_cost_calls": 1}` |
| Bypass red check | `python docs/receipts/requests/bypass_probe.py` | refused as expected: urllib.request.urlopen |

Logs: `pytest.log`, `node.log`, `probe.log`, `boundary-red.log`,
`openspec.log`, `report.json`.

OpenSpec strict validation passed (`1 passed, 0 failed`) and
`scripts/check_spec_coverage.py` passed with the pre-existing 95
scenarios, which the 3.7 spec change added.

## Boundary

`hackertube_core/outbound.py` is the single outbound request boundary.
Every request goes through `outbound.dispatch`, is counted, and is labeled
`free` or `paid`. `read_json` is the only fetch in the tree and it now
dispatches through the boundary, so the free counter is the number of
source reads that ran. `Feed.paid_calls`, which was a fixed zero, is
gone; the dashboard `/feed` response reports the ledger as
`request_counts` and keeps `paid_calls` as the paid count.

`outbound.install_guard` is the detector. It replaces
`socket.create_connection`, `socket.socket.connect`,
`http.client.HTTPConnection.connect`, `http.client.HTTPSConnection.connect`,
and `urllib.request.urlopen`. A connection made while no dispatch is
active raises `NetworkOutsideBoundary`. The import scan in
`tests/test_request_boundary.py` fails when a module outside the allowlist
imports a network client.

## Scenario receipts

### FEED04 Browse without paid calls

`tests/test_request_boundary.py::test_feed04_browsing_paging_saving_dismissing_and_reopening_make_no_request`
runs open, page, rerank, save, dismiss, and reopen under the guard.
`opened["request_counts"] == {"free": 0, "paid": 0}` and
`outbound.counters() == {"free": 0, "paid": 0}` after every step.
`tests/test_discovery.py::test_feed04_browse_actions_make_no_paid_call`
asserts the same on the view.

### PREF08 Read-only browsing

`tests/test_request_boundary.py::test_pref08_read_only_browsing_submits_nothing`
browses with four interest profiles and then reads every section. No
request is dispatched at all, so nothing — least of all personal context —
leaves the process. `usage()` is a known zero cost and `in_flight` is 0
after the reads.

### JOB02 No background paid refresh

`tests/test_request_boundary.py::test_job02_reloading_and_displaying_a_stale_feed_starts_no_paid_job`
displays the feed five times and asserts the paid count stays zero.
`test_no_module_schedules_recurring_work` scans every module for `sched`,
`apscheduler`, `threading`, `multiprocessing`, `concurrent.futures`, and
for `create_task`, `call_later`, `call_at`, `enter`, and `Timer`. The tree
has none, so the plugin starts no recurring job.

### JOB04 Provider omits cost

`tests/test_request_boundary.py::test_job04_a_paid_call_with_no_reported_cost_is_unknown`
dispatches a paid call with `cost=None`. `usage()["cost_usd"]` is `None`
and `unknown_cost_calls` is 1, so an unreported cost is unknown, not zero.
A paid call with a reported cost of 0.25 reports 0.25.

## Not run

- The Hermes host install/load and the loopback browser walk. The `hermes`
  CLI on this box refused to run with: `hermes: no dependency environment
  is committed for this install; run hermes pm repair`. Plugin-level
  install/load/display is covered by the repeated-display test and the
  scheduler scan instead. No host scheduler behavior is claimed.
- A real paid provider call. The demo build makes none; JOB04 is exercised
  with an injected paid dispatch, and the paid counter stays 0 in every
  browsing run.
- Live DNS. `tests/conftest.py` refuses it suite-wide, and no live request
  was made in this run.
