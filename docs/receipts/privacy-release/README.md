# Privacy/source lifecycle verification

Implementation pin: `8c6b8bbfcd132cd5d87d8d7c3bd563939a9e9ced`, based on merged PR #21 `c96b86d2ea25a044e0c68eaec7ea4061d8593fc0`. Exact code exported before checks; receipt-only follow-up commits do not change it. [Verification](verification.json), [check exits](checks.json), [native probe](native-results.json), [installed hashes](installed-manifest.json).

| Check | Value | Threshold | Disposition |
| --- | --- | --- | --- |
| Python | 309 passed | 0 failed | PASS |
| Node / real Chromium | 82 passed, 0 skips | 0 failed | PASS |
| Native validation | ok, 0 warnings | ok | PASS |
| Native deadline | 6.0182 seconds | <7 for 6-second setting | PASS |
| Native Cancel | 0.0397 seconds | <1 | PASS |
| Native sockets | both closed; 1 request retained each | closed after stop | PASS |
| Installed files | 40/40 match | all | PASS |
| Saved library after agreement | 4 → 4 | unchanged | PASS |

Four [red regressions](red.log) were committed in `1997000` before implementation. Nine privacy tests cover the route gate/version, local deletion, expiry, lease refusal, successful deleted/private invalidation, and provider-error preservation. The real Chromium privacy test confirms that no catalog/feed/profile/status request starts before agreement, the unchecked action is disabled, the explicit version is posted, failed deletion keeps features, and successful deletion unmounts them. Native model/web dispatch is additionally gated; existing model/deadline fixtures now explicitly agree in their disposable profiles.

One dependency protects 16 feature routes; three policy endpoints remain readable/actionable before agreement. One native facade and one lease-protected start enforce agreement. Both stored metadata copies share one invalidation/expiry boundary. One card renderer adds official YouTube source branding and product-versus-provider disclosure. Hourly housekeeping deletes locally only, captures profile context and stops on unload. It cannot run while Hermes/computer is stopped; every profile opening/access purges first on resume. This disclosed installed-client limitation and operator-managed backups are not represented as a server-side timer guarantee or provider approval.

The user authorized policy version 2026-11-08.1 acceptance after seeing the actual installed gate and policy. The actual dashboard then showed Library with four saved items. No real library was deleted. The [gate screenshot](installed-privacy.jpg) shows the pre-agreement state. A new live four-category rehearsal is separately authorized and pending; the old PR #19 video is not relabeled.
