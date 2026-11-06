# HackerTube for Hermes

A media discovery hub for the Hermes web UI, with videos, podcasts, books, and audiobooks.

Browse community recommendations personalized to your interests, or ask a focused question to find relevant content across the web. Save items in one library and open them at their original sources.

## Credit

**Andrej Karpathy created the original HackerTube and inspired this project.** Read his [original HackerTube post](https://karpathy.bearblog.dev/hacker-tube/) and visit [hackertube.org](https://hackertube.org/).

This is an independent Hermes adaptation. It extends the original community-curated discovery idea across several media formats.

## Status

The Hermes host probe is in [docs/feasibility.md](docs/feasibility.md). The installable plugin is `hackertube/`. The web page has Discover, Library, and About. Discover reads a local fixture of schema `hackertube.catalog/1` until it imports `hackertube_core/`. Saves last for the page visit. Focused search shows the question and the credit disclosure and does not call a model or a search provider. Source feasibility and the seeded catalog are in [docs/feasibility-sources.md](docs/feasibility-sources.md). The prepared marketplace description is [docs/marketplace-description.md](docs/marketplace-description.md).

The [product requirements document](docs/PRD.md) records the agreed scope, acceptance criteria, and remaining technical investigations.

The [OpenSpec workflow](openspec/README.md) guides development. Start with the [V1 proposal](openspec/changes/hackertube-v1/proposal.md), then read the capability specs, design, and tasks. Tasks 1.1, 1.2, 1.4, and 2.1 are checked. Tasks 1.3 and 2.4 are open because YouTube oEmbed is disabled. Task 3.1 stays unchecked until the catalog package replaces the local fixture. The other implementation tasks remain unchecked.
