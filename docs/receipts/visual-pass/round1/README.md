# FEED12 round-1 correction of record

Branch `hermes/visual-pass`, PR #29. Reviewed prior head:
`7b839c4ac245fc63cb85adce967c2fc4d8a671b2`.

The original receipt's five passing trials were genuine but did **not** prove
FEED12 was no longer flaky. Independent review failed trial 2 of a consecutive
batch (stopped there), and trial 6 of a separate ten-trial batch. The attached
raw failure is preserved as `reviewer-FEED12-exact-head-failure.log`. The old
commit message, original `FEED12-*.log`, `summary.json` and `summary-table.md`
still carry that original five-pass result; this note supersedes their
"fixed" conclusion. No published history was rewritten.

## Correction

`tests/test_browser_requests.js` has two announcement waits within FEED12.
Both now depend on the operation-local MutationObserver array, which is reset
before the second operation. The first requires a fresh notice mutation; the
second requires a fresh ordered blank then notice. Exact array assertions
require one announcement per operation, not merely a nonempty array. The
held feed routes, assertions of silence before accepting each feed response,
real DOM observer, final visible notice and exactly two searches remain.
No new sleep, retry, timeout workaround or production change was added.

Production scope is unchanged: one announcement caller and the shared
announcement/effect writes. Only the two test observation sites needed repair.
DOM mutation observation does not establish actual screen-reader speech.

## Evidence

The logs in this directory are pre-commit self-verification of the corrected
candidate. `results.json` records explicit commands and exit codes. There are
ten consecutive `FEED12-<n>.log` trials (acceptance threshold: five); none was
retried or skipped. Full Python collection/run, all three requested Node suites,
all three request probes and both plugin checks were rerun. The PR/card handoff
pins a subsequent clean exact-head export and its separately attached logs;
use that handoff for final suite totals rather than counting a working tree.

`clean-enable.log`, `clean-plugin-list.log` and `clean-profile.log` rerun the
fresh enabled-profile probe: accept privacy, refuse the unavailable unconfigured
service, then explicitly select stub and succeed with zero outbound requests.
This is an in-process route/storage test, not an installed-gateway lifecycle.
The earlier screenshots/geometry remain applicable because production JS/CSS
are byte-identical to the reviewed head. No new screenshot claim is made.
