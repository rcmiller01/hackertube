# Prepared marketplace description

Version 0.2.2, merged runtime `3e65af3b424bb932de944731340d99122f0a67ed`. Prepared only; not published.

HackerTube brings source-backed media discovery to the Hermes dashboard. Ask a focused question, choose a provider you already configured in Hermes, and discover videos, podcasts, books and audiobooks. Search retrieves new records, applies formats/time limits, balances categories and labels inferred relevance. Save useful results in your profile-local library and open the originals.

Read and explicitly agree to the bundled privacy policy before use. Privacy remains available on every page, with a local data-deletion/revocation control. Credit acknowledgement is separate. Ordinary browsing/library actions make no model or search call. Explicit Search may use model credits and source quota; usage is shown and unreported cost remains unknown.

Each Search allows up to 12 logical dispatches, 24 results and a 45-second local deadline, including worker startup. Cancel stops local work early; interrupted jobs do not resume automatically. A provider may still process or bill an accepted request. Media is linked, not hosted or played.

Discovery paths include Hacker News, Apple Podcasts/Apple Books, Open Library, LibriVox, optional keyed YouTube Data API/Podcast Index, and configured Hermes web search. Reddit remains disabled pending approval. The development seed has no curated community endorsements. Model relevance is not a community recommendation; partial rankings and empty categories remain possible. The successful final qualified AI query returned 4 videos, 4 podcasts, 5 books and 3 audiobooks; a prior take omitted videos, so this is not a general relevance guarantee.

Source metadata expires with hourly local housekeeping while Hermes runs and cleanup before access after restart. Stopped Hermes cannot execute deletion; exported backups remain the operator’s responsibility. Open Library registration was submitted and confirmed recorded; this is not provider approval. The worker requires macOS/Linux and Hermes CLI; macOS is tested, Linux integration is unrun.

**Andrej Karpathy created the original HackerTube and inspired this project.** Read his [original post](https://karpathy.bearblog.dev/hacker-tube/) and visit [hackertube.org](https://hackertube.org/). This is an independent Hermes adaptation.

[Final installed demo and checks](receipts/final-demo/README.md) · [source acceptance](source-release.md) · [privacy policy](submission/privacy-policy.md).
