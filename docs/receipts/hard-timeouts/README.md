# Hard Search deadline/cancellation receipts

Subsequent review of exact head `d652e94` found two P2 issues in accounting/recovery. The original measurements below remain historical; [PR #19 corrections and current checks](../pr19-review/README.md) supersede its earlier no-finding disposition.

Implementation pin: `3f649962d4f98091110c1efebb5a27c3c4fb5ab9`, based on merged main `cec15fee4419424b18412da8f77754660e0b94ed`. PRs #17 and #18 are merged; [merge provenance](merges.json) records their reviewed heads and merge commits. The previous 36.25-second demo and catalog pin describe the previous implementation and have not been relabeled as this build.

The table is generated from [verification.json](verification.json).

| Check | Observed | Acceptance | Disposition |
| --- | --- | --- | --- |
| Python tests | 279/279 | all pass | PASS |
| JavaScript/browser tests | 80 | 0 failures / 0 skips | PASS |
| Native validation | 0 warnings | passes without warnings | PASS |
| Installed hashes | 37/37 | all match | PASS |
| 6-second native deadline | 6.015 s | < 7 s; socket EOF | PASS |
| Native in-flight Cancel | 0.039 s | < 1 s; socket EOF | PASS |
| Saved items | 3 | unchanged | PASS |

The Python suite has one existing Starlette/httpx deprecation warning. Strict OpenSpec, fatal Python lint and traceability pass; coverage fixtures reject 14 invalid inputs and accept one valid mixed input. Full logs are adjacent. Regression tests were committed before implementation; `*-red.log` receipts retain those failures. Early module-absent failures are feature contracts, not measurements of old provider socket lifetime.

Real-process tests observe socket closure after timeout/cancel, descendant termination, parent-death cleanup, independent watchdog fallback, startup/disclosure gates, durable terminal status, profile isolation, unload and no paid restart. HTTP tests cover asynchronous dashboard and synchronous real API callers. UI tests queue early Cancel, wait for server confirmation, reject stale replies and never resend a lost paid start. The scheduling exception is limited to the explicit per-job supervisor; recurring paid work remains prohibited.

## Actual Hermes provider boundary

[native_probe.py](native_probe.py) reproduces the public Hermes CLI/`ctx.llm` path with a disposable profile and a stalled local OpenAI-shaped endpoint. It first warms the host using the offline stub. The test key is a literal non-secret placeholder. [Native results](native-local-provider.json) record actual request arrival, socket EOF, deadline and Cancel latency. Both requests were in flight before termination. No live vendor key is needed.

## Installed dashboard

The default dashboard was restarted with the exact payload: [37-file manifest](runtime-manifest.json). Host: v0.23.0+1212.g719240d, Python 3.14.9, macOS. Its existing Search selection remained OpenRouter `openai/gpt-5.4-mini`; no key, source setting or model selection changed.

[Installed jobs](installed-jobs.json) records two successful explicit searches, both using 11 logical requests with unknown cost. The first returned 3 videos / 2 podcasts / 2 books / 4 audiobooks; the second 3 / 2 / 2 / 5. An attempted Cancel on the second search found it already completed, so it is not counted as a cancellation pass. A third search was immediately cancelled in the UI before provider dispatch (0 requests). In-flight cancellation is established by the separate native probe. Saved items (3), interests, open history and source settings are unchanged.

- [Successful search screenshot](installed-success.jpg) and [visible text](installed-success.txt).
- [Confirmed cancellation screenshot](installed-cancelled.jpg) and [visible text](installed-cancelled.txt).

## Limits and review

The server stops local work and closes local connections; a remote service may still process or bill an accepted request. Costs remain unknown. Cached metadata is not rolled back. macOS is verified; Linux integration remains unrun. No broad relevance evaluation, source-term clearance, public repository change or external submission is included. The old catalog candidate remains pinned until a new exact pin is reviewed.

Codex reviewed the implementation against the merged base in this chat, without external reviewers or subagents. Scope: two new runtime modules, one Search HTTP dispatch, one native completion service, one web-tool service and the shared source budget/HTTP boundary. All provider work executes inside the supervised group; two control descriptions share the stop/billing note. Review covered process ownership, independent watchdog, cancellation/result races, profile context and locking, durable transitions, provider routing, secrets, restart/unload and offline compatibility. No unresolved actionable finding remains in scope. SEARCH06 refinement, wider lifecycle/source obligations and public release gates remain open. Later receipt commits leave runtime and tests byte-identical to the pin; the exact export checks apply to that payload, not newly executed suites on each documentation commit.
