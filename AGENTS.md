# HackerTube development

Before feature work, read `openspec/README.md`, the active proposal, and each affected capability spec. Read its design and tasks before implementation.

Implement the selected task against its scenarios. Record actual checks and remaining failures in verification.md before marking a task complete. Keep behavior changes, scenario changes, and task updates together.

Preserve product decisions in `docs/PRD.md` and credit Andrej Karpathy in the required surfaces. Resolve conflicting requirements explicitly.

Use subagents only when explicitly requested by the user. Set author and committer to `codex-agent <codex-agent@hermes.local>` with explicit environment variables for every commit.
