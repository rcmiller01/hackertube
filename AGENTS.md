# HackerTube development

Before feature work, read `openspec/README.md`, the active proposal, and each affected capability spec. Read its design and tasks before implementation.

Implement the selected task against its scenarios. Record actual checks and remaining failures in verification.md before marking a task complete. Keep behavior changes, scenario changes, and task updates together.

Preserve product decisions in `docs/PRD.md` and credit Andrej Karpathy in the required surfaces. Resolve conflicting requirements explicitly.

Every change goes on its own branch and pull request. Bots never merge to main or push to main. Robert or Eve merges only when Robert explicitly asks for that merge.

Every bot commit ends with a trailer naming the bot, for example `Co-authored-by: Eve (Grok Bot) <eve-bot@grokbot.local>`. A squash merge keeps every unique `(Grok Bot)` trailer from the PR's commits.

Codex performs all code and non-code reviews at the exact head SHA. Review the current head again after later changes.
