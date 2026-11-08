# Hard Search deadline/cancellation receipts

This follow-up starts after merged PRs #17/#18. The previous 36.25-second video and catalog pin describe the previous implementation and have not been relabeled as this build.

The working implementation passes 279 Python tests and 80 JavaScript/browser tests, with no failures/skips and one existing Starlette/httpx deprecation warning. Real-process tests observe provider sockets closing after timeout/cancel, descendants stopping, parent-death cleanup, independent watchdog fallback, startup/disclosure gates, durable terminal status, profile isolation and no paid restart. HTTP tests cover both the asynchronous dashboard path and synchronous real API callers. UI tests keep cancellation pending until server confirmation and never resend a lost paid start.

`native_probe.py` reproduces the actual Hermes CLI/ctx.llm path with a disposable profile and a local stalled OpenAI-shaped endpoint. It first warms the isolated host using the offline stub. The configured test key is a literal non-secret placeholder. `native-local-provider.json` records actual request arrival, EOF, deadline and cancel timing. No live vendor key is needed. A provider may still bill or process an already accepted remote request; a closed local socket is not proof of vendor-side cancellation.

Exact final implementation pin, full suite logs, validation, installed manifest and live UI checks are added below after the implementation commit exists. Do not interpret the working measurements as a new broad relevance evaluation or source-term clearance. The implementation is verified on macOS; Linux integration remains unrun. No public repository change or external submission is included.
