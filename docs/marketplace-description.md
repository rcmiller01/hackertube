# Prepared marketplace description

Current draft for merged PR #19, commit `7e1e8f9819cf840aee1f3c33e3d1233853789864`. Prepared only; not published.

HackerTube brings source-backed media discovery to the Hermes dashboard. Ask a focused question, choose a provider you already configured in Hermes, and discover videos, podcasts, books, and audiobooks. Search retrieves fresh records, applies requested formats and time limits, balances categories, and explains model relevance. Save results in a profile-local library and open the originals at their sources.

Ordinary browsing and library actions make no model or search call. Explicit Search can use model credits and source quota; usage is shown and unreported cost stays unknown. Each search has a 45-second local deadline, 12 logical provider requests, and up to 24 results. Cancel stops local work early; interrupted searches do not automatically resume. A provider may still process or bill a request it already accepted. Missing credentials and partial coverage are disclosed. Media is linked, not hosted or played.

Supported discovery paths include Hacker News, Apple/iTunes, Open Library, LibriVox, optional YouTube Data API and Podcast Index, and Hermes web search when available. Reddit remains disabled pending approval. The small seed is development content, with no curated community endorsements; model relevance is not a community recommendation. Source release checks remain open. The worker requires macOS/Linux and the Hermes CLI; macOS is tested, Linux integration remains unrun.

**Andrej Karpathy created the original HackerTube and inspired this project.** Read his [original HackerTube post](https://karpathy.bearblog.dev/hacker-tube/) and visit [hackertube.org](https://hackertube.org/).

This is an independent Hermes adaptation. The new [demo receipt](receipts/pr19-demo/README.md) records the actual installed build and its limits.
