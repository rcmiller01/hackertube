# Dashboard catalog fixture

`catalog.json` is a local fixture. It is a snapshot of the `hackertube.catalog/1` seed shape from pull request #3 (`hackertube_core/seed/catalog.json` at `5fe8e71dbbae33a48bcd9eae6cdc4919e5badcca`).

This directory is not the `hackertube_core` package. The dashboard does not import that package. `catalog_adapter.py` is the only reader. Replace that reader with the merged catalog after pull request #3 lands.

Hacker News rows in this file are evidence on a media item. There is no Hacker News media format and no Hacker News card.
