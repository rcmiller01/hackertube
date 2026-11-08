# Privacy policy — prepared release draft

This is prepared copy for review, not an already accepted or wired policy. The YouTube release gate remains open until the product requires explicit agreement to its published/versioned policy before access.

HackerTube is a local Hermes plugin. Explicit Search shares the question and bounded source metadata with the chosen Hermes model and configured web-search service, and queries enabled public media catalog APIs. Ordinary local browsing/library actions make no model or search call; permitted cover hotlinks and source links are browser requests. No unrelated chat history, Hermes memory, external watch history or telemetry is collected.

Hermes owns model authentication and declared source secrets. HackerTube does not read credential files. Its own profile database stores questions, normalized source identities/provenance, source settings, result/job records, interests, saves, dismissals and open history. Source metadata is not a guarantee of relevance. No media file or Apple artwork is downloaded. Open Library contact identification is sent only to Open Library in its request header, never model prompts, other providers, URLs or plugin data.

YouTube public metadata and Search response copies are bounded by original retrieval time and cleaned locally on profile access; a later job does not renew old metadata. Numeric accounting/library flags survive without expired titles. Hermes cannot perform local cleanup while stopped; the complete retention/deletion acceptance must account for that before release.

To stop a source, disable it; remove its declared key in Hermes to stop future authorized requests. No Google user OAuth permissions are requested by the current public-metadata path. [Google Privacy Policy](https://policies.google.com/privacy) and [Google permissions](https://security.google.com/settings/security/permissions) explain Google's data practices and any grants managed outside this plugin. The source API key's operator controls the Google Cloud project.

To remove HackerTube-owned local data, stop Hermes, back up anything wanted, and remove only that profile's plugin-data/hackertube directory. This removes local interests/library/results; it does not remove source content or data held by YouTube, Apple, the selected model or other third parties. Their own policies and deletion controls apply. Accepted remote model requests may still be processed or billed after local Cancel.

Use the project's GitHub issue contact for non-sensitive questions after publication; never include keys or private prompts. The final policy must have a stable published URL, versioned acceptance, a clear deletion/control path and an update/reacceptance rule. The release draft is not a substitute for implementing those controls.
