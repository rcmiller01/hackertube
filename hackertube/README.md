# HackerTube for Hermes

Discover videos, podcasts, books, and audiobooks in the Hermes web dashboard. Ask a focused question using a provider already configured in Hermes, save source-backed results in a profile-local library, and open their originals.

**Andrej Karpathy created the original HackerTube and inspired this project.** Read his [original post](https://karpathy.bearblog.dev/hacker-tube/) and visit [hackertube.org](https://hackertube.org/). This is an independent Hermes adaptation.

## Install and configure

Requires Hermes >=0.23.0. This directory is the complete native plugin: `plugin.yaml`, `__init__.py`, dashboard, core package, and seed. Install this directory through Hermes's supported local-plugin workflow, enable HackerTube, then reload the dashboard. Validate with `hermes plugins validate /absolute/path/to/hackertube --install-deps`.

Choose an existing provider under **Focused search → Search provider and model → Use for search**, or **Models → Auxiliary → HackerTube search**. No separate model key or endpoint is needed. The development-only stub does not retrieve live results.

Optional YouTube and Podcast Index keys belong in Hermes's declared secret settings (`YOUTUBE_API_KEY`, `PODCASTINDEX_API_KEY`, `PODCASTINDEX_API_SECRET`). Enable a source only after configuring it. Never put keys in plugin files or plugin data. Reddit remains disabled pending separate approval. The prepared catalog is small development content; it has no curated community endorsements.

## Network, privacy, and storage disclosure

Only explicit Search sends the question and bounded candidate metadata to the selected Hermes model provider. Retrieval can contact Hacker News (`hn.algolia.com`, `hacker-news.firebaseio.com`), Apple/iTunes (`itunes.apple.com`), Open Library (`openlibrary.org`), LibriVox (`librivox.org`), enabled YouTube Data API (`www.googleapis.com`), configured Podcast Index (`api.podcastindex.org`), and the user's configured Hermes web-search backend. Provider routing and retries belong to Hermes. Public source links open in the browser. Open Library cover hotlinks may load when permitted by a stored record; search does not download artwork or media. Apple artwork is not loaded.

Ordinary browsing, local ranking, and library actions make no model or search calls. Explicit Search may spend credits or source quota. Missing cost is shown as unknown. Jobs allow 12 logical dispatches, 24 results, and a 45-second work budget; each operation receives the remaining budget. An in-flight host call can outlast that budget. Cancellation and interrupted-job recovery are not implemented. Logical dispatches do not count every vendor retry.

Hermes stores model credentials. The plugin reads only its declared source secrets through Hermes secret scope. It does not read credential files, memory, or unrelated chat history. It reads its bundled seed and uses Hermes configuration and plugin services. It stores normalized source records, questions/job summaries, interests, saves, dismissals, source settings, and open history in `plugin-data/hackertube/profile.db` under the active Hermes home. It starts no recurring job, shell process, telemetry, self-updater, or media player. Data remains after disabling the plugin; remove its plugin-data directory while Hermes is stopped to erase it. YouTube records expire after 30 days and are purged on the next catalog read/write.

Source records establish identity, not an endorsement or a guarantee of relevance. Model explanations may be wrong. Unknown duration remains unknown and is excluded from a strict duration match. Source-specific release obligations, lifecycle testing, and the broader relevance evaluation remain open. See the repository's [source plan](../docs/sources.md), [live-search notes](../docs/real-search.md), and [submission checklist](../docs/submission/README.md).

When YouTube is enabled, use is subject to the [YouTube Terms of Service](https://www.youtube.com/t/terms) and [Google Privacy Policy](https://policies.google.com/privacy).
