# HackerTube for Hermes

A media discovery hub for the Hermes web UI, with videos, podcasts, books, and audiobooks.

Browse community recommendations personalized to your interests, or ask a focused question to find relevant content across the web. Save items in one library and open them at their original sources.

## Credit

**Andrej Karpathy created the original HackerTube and inspired this project.** Read his [original HackerTube post](https://karpathy.bearblog.dev/hacker-tube/) and visit [hackertube.org](https://hackertube.org/).

This is an independent Hermes adaptation. It extends the original community-curated discovery idea across several media formats.

## Status

The Hermes host probe is in [docs/feasibility.md](docs/feasibility.md). The installable shell is `hackertube/`: a Python plugin with one web-dashboard page and one backend route. Source feasibility and the seeded catalog are in [docs/feasibility-sources.md](docs/feasibility-sources.md) and `hackertube_core/`.

The [product requirements document](docs/PRD.md) records the agreed scope, acceptance criteria, and remaining technical investigations.

The [OpenSpec workflow](openspec/README.md) guides development. Start with the [V1 proposal](openspec/changes/hackertube-v1/proposal.md), then read the capability specs, design, and tasks. Tasks 1.1, 1.2, 1.4, and 2.1 are checked. Tasks 1.3 and 2.4 are open because YouTube oEmbed is disabled. The other implementation tasks remain unchecked.
