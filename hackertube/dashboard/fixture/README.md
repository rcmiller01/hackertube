# Dashboard catalog fixture

`catalog.json` is a local fixture. It is an exact copy of `hackertube_core/seed/catalog.json` from pull request #3 at `be5088629f804239c96c891b23881366f416a6c5`.

This directory is not the `hackertube_core` package. The dashboard does not import that package. `catalog_adapter.py` is the only reader. Replace that reader with the merged catalog after pull request #3 lands.

YouTube rows in `unavailable_videos` are ids and watch links only. They are not cards, so the Videos section is empty. Hacker News is not a media format and not a card. This file does not store comment text or usernames.
