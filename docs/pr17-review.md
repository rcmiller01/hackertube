# PR #17 exact-head review and corrections

Reviewed head: `e26104cbd9c9a2b84d25272709f2ff6eabcb2c1c`.
Base: `206084688822a21847f989cd959d99f93cfa48cc`.
Scope: the complete PR diff, existing eligibility/ranking/job paths, dashboard result summary, behavior specs, tests, and prior installed-live receipts. Local HEAD and GitHub head agreed before changes. No subagents were used, consistent with the user's instructions.

## Standards

No separate hard violation of the repository's documented implementation standards was identified. The changes remain inside the existing modules and public Hermes surfaces. Site enumeration, committed red tests before runtime fixes, numeric outcomes, and native plugin validation are recorded below. No new dependency, provider, source, credential path, or scheduling was introduced.

## Spec and correctness findings

Original locations refer to the reviewed SHA, not the corrected tree.

| Priority | Original location | Confirmed behavior | Correction |
|---|---|---|---|
| P2 | `hackertube/hackertube_core/hermes.py:227–246` | Two structurally valid entries for one submitted identity can disagree (`direct` versus `uncertain` or `related`). The direct entry is still recommended in either order, so an ambiguous identity bypasses the direct-fit requirement. With no other matches the job even reports success. | Resolve fit across validated entries at identity level before selection. Conflicting identities are excluded; their rows count as invalid, and unambiguous matches survive with partial status. Entirely conflicting output fails closed without retry. Consistent duplicates retain first-reason deduplication. |
| P2 | `hackertube/dashboard/dist/index.js:635` interacting with the new subject/level summary at `:1551–1558` | A beginner request with exclusions displays the new level summary but also says `Constraints: none applied.` whenever the time limit is absent. This misstates the ranking criteria. The generic caption predates this PR, but its contradiction with the newly exposed intent is observable in the reviewed result view. | Name this line `Time limit` in both branches. Absence of duration no longer claims absence of audience, depth, or exclusions. Duration filtering itself is unchanged. |

The model's subjective relevance judgment, including previously observed hedged explanations, remains a documented limitation rather than a claim of independently verified suitability. This review does not treat those live recommendations as a full-content quality evaluation.

## Reproduction against the exact head

The initial working tree had no runtime edits and reproduced **5 ranking failures / 3 passing controls** plus **1 UI failure**. Tests were committed before the runtime corrections in `3d16988`.

The expanded reproduction also covers actual job behavior with and without another unambiguous match. A clean `git archive` of the full reviewed SHA, overlaid only with the new regression tests, produced **6 Python failures / 3 passing controls** and **1 UI failure**. Import paths were explicitly checked to remain inside the exported runtime rather than the editable development installation. `docs/receipts/pr17-review/pinned_repro.py` reruns this proof; its logs and JSON receipt are beside it.

The first isolated harness check failed its own path assertion because macOS resolves `/var` to `/private/var`. That setup failure was not an application result. Commit `069d2f3` canonicalizes the archive root, and the corrected run records `runtime_import_isolated: true` with the actual application failures. The expanded test was committed before runtime fixes as well.

## Site and state audit

- Ranking: **1** native row validator/selection site, **1** production rank caller, and **2** job diagnostic readers (partial status and response). Fixing the validator covers every native ranking call. Identity conflicts are resolved after structural validation; malformed rows do not supply fit votes.
- Summary: **1** duration-summary helper with **2** wording branches and **1** production renderer; its export and existing exact-string assertion were audited. One new rendered-page regression checks the beginner/exclusion context. The existing assertion was updated to the accurate wording, not removed.
- Diagnostics: `conflicting_identities` counts affected IDs; `invalid_entries` counts their rows; conflicting rows are not double-counted as intentional omissions. Same-fit duplicate controls cover all **3** fit values.
- Deployment: **2** runtime files changed. Before replacement, **34/34** installed files matched the original PR runtime manifest, so no unreviewed installed drift was overwritten. The prior files were backed up outside the repository, and **34/34** fixed installed files match the new manifest. Settings and credentials were not changed. Dashboard reload returned HTTP **200**.

## Checks and disposition

- Ambiguous identity admitted: **4/4** baseline label/order cases; **0/4** after correction. The independent valid identity is retained in all four corrected cases.
- Consistent duplicate controls: **3/3** pass before and after; no blanket duplicate rejection was added.
- Full job cases: **2/2** now report partial and retain only unambiguous matches, with exactly **2** model invocations (interpret/rank), no retry, and no ambiguous result.
- Targeted review regressions: **9/9 Python** pass and **1/1 rendered UI** check passes.
- Full suite: **260 Python passed / 0 failed**; **73 JavaScript/browser passed / 0 failed / 0 skipped**. One existing Starlette/httpx deprecation warning remains.
- Strict OpenSpec: **1 passed / 0 failed**. Coverage: **32 PRD IDs / 95 scenarios**. Fixtures: **14 invalid rejected / 1 valid accepted**. Changed-Python lint and actual Hermes plugin validation pass, with no plugin warnings. The first strict-doc check rejected overlong requirement prose; the wording was shortened without dropping the behavior, then validation passed.

All full logs, the exact-head reproduction, install record, and runtime SHA-256 manifest are in `docs/receipts/pr17-review/`. The corrected code is pinned by the commit containing this report and that manifest. Its committed bytes are read back and compared with the installed package before pushing; the remote PR head is then verified. The PR remains unmerged.

No new paid-provider run was needed: these fixes concern deterministic handling of contradictory model output and a duration caption. The earlier installed broad/strict AI receipts remain historical evidence for the original reviewed runtime; they are not relabeled as new live-query evidence. Source authentication, source APIs, request/token limits, category policy, and ordinary unique-ID rankings are unchanged. Wider relevance evaluation and source/release obligations retain their prior disposition.
