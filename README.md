# HackerTube for Hermes

A media discovery hub for the Hermes web UI, with videos, podcasts, books, and audiobooks.

Browse source-backed media matched to your interests, or ask a focused question to find relevant content across the web. Save items in one library and open them at their original sources.

## Credit

**Andrej Karpathy created the original HackerTube and inspired this project.** Read his [original HackerTube post](https://karpathy.bearblog.dev/hacker-tube/) and visit [hackertube.org](https://hackertube.org/).

This is an independent Hermes adaptation. It extends the original community-curated discovery idea across several media formats.

## Current implementation

The dashboard has Discover, Library, About, and real focused search. Search uses a provider/model the user already configured in Hermes, retrieves fresh source records, and ranks only those records. New results can be saved and opened immediately and remain available after restart. Browsing the prepared catalog makes no model or search call.

The complete installable package is **`hackertube/`**, including its core package and seed. See [installation, model selection, source setup, and checks](docs/real-search.md). Select a model in the Search panel or under **Hermes Models → Auxiliary → HackerTube search**; HackerTube requires no separate model key or endpoint. Source-specific keys remain necessary for YouTube and Podcast Index, and Reddit remains disabled pending approval.

The seed is a small development catalog; real search retrieves beyond it. Missing source credentials, failed services, and unsupported formats are disclosed. No media is hosted, downloaded, or played by HackerTube. The original [source plan](docs/sources.md), [product requirements](docs/PRD.md), and [OpenSpec workflow](openspec/README.md) retain the larger scope and unfinished release work. Andrej Karpathy's credit appears above, in About, and in the prepared marketplace description.

Installable-package network, storage, credential, and timeout disclosures are in [the plugin README](hackertube/README.md). The [prepared submission packet](docs/submission/README.md) records the actual demo and unresolved release gates.
