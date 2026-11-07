# The demo seed

The demo catalog is `hackertube.catalog/1` in
`hackertube_core/seed/catalog.json`. It is built by
`hackertube_core/demo_seed.py` from the recorded reads under
`tests/fixtures/captured/`. It is the catalog the dashboard serves: `GET
/api/plugins/hackertube/catalog` returns exactly this document, and
`GET /api/plugins/hackertube/feed` ranks it locally.

## How it is built

1. **Reads go through the request boundary.** Every read is issued by
   `hackertube_core.http.read_json`, which sends it through
   `hackertube_core.outbound` (#11) and counts it `free`. The builder passes
   a recorded-body opener, so the transport is replaced and the builder opens
   no socket. The URL screen and the one `connection_targets` step still run.
2. **Parsing is the source adapter's.** `hn`, `itunes`, `openlibrary`, and
   `librivox` parse the payloads through the functions task 2.3 (#12) added.
3. **Merging and status are the ingestion path's.**
   `hackertube_core.sources.ingest` runs one pass over the catalog sources in
   capture order, merges duplicate identities, and records each source's
   attempt. The pass covers `itunes`, `openlibrary`, and `librivox` only;
   Hacker News carries no card and no seeded evidence row.
4. **Storage is the profile database.** Source choices and attempt status go
   through `hackertube_core.profile.ProfileStore`, opened with Hermes
   `plugin_db`. `demo_seed.py` does not import `sqlite3`.

A build that sees any paid or metered read raises instead of freezing.

### Measured build counts

`free` 6, `paid` 0, `metered` 0 — six recorded reads, one per captured file.
`freeze()` returns the counts it measured; `build()` returns the document.

```sh
# From the repository root, in a profile where hermes is importable:
python -m hackertube_core.demo_seed
# Or in the test suite, against a temporary profile store:
python -m pytest tests/test_seed.py -q
```

## What the seed holds

| Section | Records |
|---|---|
| Videos | none. Three video ids and `https://www.youtube.com/watch?v={id}` links are kept in `unavailable_videos`. A card needs a title, and no cited page grants storage of the oEmbed title. |
| Podcasts | 4 — three shows (labels `show`, no episode metadata) and one episode (label `episode`, duration from `trackTimeMillis`). |
| Books | 4 Open Library works. Their covers are hotlinked with the work page as the courtesy link. |
| Audiobooks | 4 LibriVox recordings, the lowest id that shares a Project Gutenberg id with each book. Text only; covers are not shown. |

`editions` links each book to its recording by the shared Gutenberg id; the
book and the recording stay distinct items. `formats_may_be_empty` is
`["videos"]`, so an empty videos section is an honest empty state rather than
a missing section. Capture order is the feed order.

## Refresh

A refresh re-runs the build against fresh reads: re-read the bounded source
set through the boundary and re-freeze. The live in-product path is
`POST /api/plugins/hackertube/sources/refresh`, which runs one bounded
ingestion pass over the enabled sources and returns the merged items, the
per-source status, and the request counts. Every read there is `free`.

No enabled seeded source states a maximum retention or refresh period, so no
seeded row carries an expiry (`refresh_after` is null on every source and
evidence row). Each source row still states the obligation its terms imply.
The one stated window is YouTube's 30 calendar days for non-authorized Data
API data; YouTube is disabled, stores no record, and its 30-day rule is kept
in `youtube.py` (`plus_days(retrieved_at, 30)`) for a later enablement.

| Source | Refresh obligation | Retention |
|---|---|---|
| Hacker News | No stated period. Each evidence row keeps its own retrieval time. | Comment id, permalink, retrieval time, display line. No comment text or usernames. |
| Apple Podcasts | No stated period. A refresh re-reads the bounded lookup set. | Text identity fields with their retrieval time. No artwork, preview, or media URLs. |
| Open Library | No stated period. Re-read the bounded search; caching is asked for. | CC0 catalog metadata. Cover files are not cached. |
| LibriVox | No stated period. Stay bounded and sequential per the September 2026 update. | Recording metadata. No audio or cover files. |
| YouTube | Disabled. A later Data API path must re-read within 30 calendar days. | Nothing stored. |
| Podcast Index | No refresh defined. Nothing stored. | Nothing; a key and secret are absent. |
| Reddit | No refresh defined. Nothing stored. | Nothing; approval is absent. |

The full source matrix, with the cited terms, is `docs/sources.md`; the
frozen-seed table is `docs/feasibility-sources.md`.

## What the seed does not claim

- YouTube oEmbed is disabled (`unresolved-terms`). No page granting storage
  of oEmbed responses has been cited, so the terms are not resolved. The
  videos section is empty and no video card is displayed.
- Reddit is disabled and no Reddit request is made.
- Hacker News attaches no seeded evidence: `docs/receipts/catalog/
  hn-endorsement-search.md` found no hit that named or linked a seed item and
  was positive about it, so no card carries a community-endorsement line.

## Scenarios

`tests/test_seed.py` covers UI02, FEED01, CAT03, CAT04, CAT10, and CAT11
against this seed, plus the boundary/storage and per-source metadata checks.
