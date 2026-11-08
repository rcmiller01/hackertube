# Specification workflow

HackerTube uses [OpenSpec](https://github.com/Fission-AI/OpenSpec) and its built-in `spec-driven` schema. Version 1.16.0 initialized and validated this repository. That version requires Node.js 22.12.0 or later.

## Authority and current state

- `docs/PRD.md` records product intent and confirmed scope.
- `openspec/changes/hackertube-v1/` contains proposed behavior, design, and tasks. Tasks 1.1, 1.2, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.7, 4.1, and 4.2 are checked. Tasks 1.3 and 2.4 are open because YouTube oEmbed is disabled. The dashboard reads the `hackertube_core` seed, keeps profile state beside it, and ranks interest matches with fixed weights. Each format section then lists the rest of that format as a labeled browse group. The explicit Search uses the user's existing Hermes provider/model, retrieves beyond the seed, and stores normalized records and a profile job. November 8 packaging and real-search tasks 7.1–7.3 are checked; keyed-source live checks in 7.4 remain open. See `docs/real-search.md`. The other implementation tasks are not.
- `openspec/specs/` holds delivered behavior after a verified change is archived. It is empty because the host shell has not been archived as a delivered capability.

A complete artifact graph means the documents exist, not that implementation or integration checks passed.

## Development workflow

1. Read the active proposal and affected specs. Stable scenario IDs connect behavior to tests and receipts.
2. Read design.md and complete the feasibility tasks first. Save evidence against the exact host version.
3. Implement one task group with its checks. Mark a checkbox only when its completion check passes.
4. Record results, errors, and limitations in verification.md. Link covered scenarios to actual tests or manual receipts.
5. Archive after release checks pass. Sync delta specs into delivered specs and verify the archive.

Update behavior specs with each behavior change. Update the PRD when product intent changes. R16 is explicitly deferred from V1. Traceability separates specified, deferred, and post-demo rows. Post-demo rows retain scenario references and list the exact post-demo scenario subset.

## Validate planning artifacts

Run from the repository root:

```sh
OPENSPEC_TELEMETRY=0 npx --yes --package @fission-ai/openspec@1.16.0 openspec validate --all --strict --no-interactive
python3 scripts/check_spec_coverage.py
OPENSPEC_TELEMETRY=0 npx --yes --package @fission-ai/openspec@1.16.0 openspec status --change hackertube-v1
```

The first invocation can download the pinned CLI and its dependencies. It installs no global CLI or application dependencies. Strict validation checks OpenSpec structure. The coverage check ensures every PRD ID has real scenario references or an explicit P1 deferral. Post-demo rows require P0, a reason, and a validated post-demo scenario subset. Every scenario must map to a PRD ID. Neither check evaluates runtime correctness or recommendation quality.

## References

- [Concepts](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md)
- [Standard schema](https://github.com/Fission-AI/OpenSpec/blob/main/schemas/spec-driven/schema.yaml)
- [Project configuration](https://github.com/Fission-AI/OpenSpec/blob/main/docs/customization.md)

Standard artifacts and project context replace the need for a custom schema. Local additions are traceability.json, verification.md, and the coverage check.
