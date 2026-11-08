# Search deadlines and cancellation

PRs #17 and #18 merged on November 8, 2026. The follow-up replaces the in-process Search worker that could outlive its forwarded timeout. It adds two runtime modules: the supervisor and a disposable worker/CLI entry; the existing interpretation, retrieval, ranking and storage behavior is reused.

## What stops

A Search gets one 45-second local deadline starting before process launch, including Hermes CLI startup. A per-job process group contains inference, source/web calls, DNS, SDK threads and ordinary descendants. The supervisor and an independent watchdog enforce the same absolute deadline. The watchdog is created in the fresh worker before Hermes initializes; parent-pipe EOF also stops the group after dashboard death. The supervisor reaps the worker before confirming timeout or cancellation. Scheduling/reaping has a small cleanup delay, not a new provider timeout allowance.

Cancel requests are persisted and can be observed by the owning monitor even from another dashboard process. The UI keeps its busy guard until the server confirms a terminal state. A cancel clicked before the start response is queued until the actual job handle arrives; no guessed handle is sent. Polling only reads local status and cannot start inference. Reload can observe existing work; a restarted server marks unfinished jobs interrupted on status recovery and does not restart them. Plugin unload stops owned jobs. Local feed/library state remains intact; already retrieved source metadata can remain cached.

A remote service may continue processing or billing a request it already accepted. Killing local work closes the local connection and prevents further local calls/retries; it does not revoke remote work or claim zero cost. Cancel/timeout/interruption retain unknown cost and observed request counts. Each worker's process totals are local diagnostics; durable per-job usage is the accounting record.

## Host and storage

The implementation requires macOS/Linux, Hermes >=0.23.0, and the Hermes CLI on PATH. macOS is verified locally; Linux integration has not been run here. Unsupported hosts fail closed before provider work. No new Python/Node dependency or plugin-owned model key is required.

The worker re-enters Hermes through documented `ctx.register_cli_command` registration for `hermes hackertube-worker`; native registration binds the existing `ctx.llm` and `ctx.dispatch_tool` services. It does not import a private loader, create its own provider client, read credentials, patch core, or start an agent turn. The question travels over a private inherited pipe, not argv or an environment value. Source secrets still use the declared Hermes secret scope. YOLO environment flags are removed from the child environment.

A file lock in the profile's `plugin-data/hackertube/search.lock` enforces one active Search across server processes. Random job-handle nonces prevent cross-profile sequence collisions. The monitor captures the serving profile context. Existing `profile.db` gains a `search_result` table; jobs are recorded running before launch, usage is persisted before dispatch, and terminal updates cannot overwrite an already terminal job. No PID from disk or a request is trusted for killing: only the supervisor's own new process group is targeted.

The independent watchdog also handles a worker blocked in native code. Native model adapters that hand accepted work to a separate server/service are subject to the remote-processing caveat above. Detached external services and provider billing are not killed as unrelated shared processes.

## API

- `POST /api/plugins/hackertube/search`: question, accepted disclosure, and `background:true`. Returns 202 with a persisted job handle; no second call starts the work. Busy profiles return 409 with their current job. Real callers omitting background use the same supervised execution and wait for its outcome. The deterministic offline API compatibility path is unchanged; the dashboard always uses supervised execution.
- `GET /api/plugins/hackertube/search/jobs/{job_id}`: local status/result. Terminal states include `succeeded`, `partial`, `failed`, `timed_out`, `cancelled`, and `interrupted`. Unknown/current-other-profile handles return 404.
- `POST /api/plugins/hackertube/search/jobs/{job_id}/cancel`: idempotent stop request. `cancelled` is confirmed after local termination; `cancelling` can be returned while reaping completes. An already terminal job is unchanged.

No public release or external submission is authorized by this change. The catalog draft still pins its previous reviewed implementation until a new exact pin is reviewed. Original demo video and source/eligibility gates remain unchanged. Checks and measured timing: [receipts](receipts/hard-timeouts/README.md).
