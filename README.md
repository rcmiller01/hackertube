# HackerTube for Hermes

A media discovery hub for the Hermes web UI, with videos, podcasts, books, and audiobooks.

Browse community recommendations personalized to your interests, or ask a focused question to find relevant content across the web. Save items in one library and open them at their original sources.

## Credit

**Andrej Karpathy created the original HackerTube and inspired this project.** Read his [original HackerTube post](https://karpathy.bearblog.dev/hacker-tube/) and visit [hackertube.org](https://hackertube.org/).

This is an independent Hermes adaptation. It extends the original community-curated discovery idea across several media formats.

## Status

Lane B has a framework-neutral catalog package, `hackertube_core`, and a frozen seed of real records. The Hermes dashboard, plugin manifest, and routes are not part of this package.

The [product requirements document](docs/PRD.md) records the agreed scope, acceptance criteria, and remaining technical investigations.

The [OpenSpec workflow](openspec/README.md) guides development. Start with the [V1 proposal](openspec/changes/hackertube-v1/proposal.md), then read the capability specs, design, and tasks. Source feasibility and the seeded catalog are recorded in [docs/feasibility-sources.md](docs/feasibility-sources.md). Host integration and the dashboard remain open.
