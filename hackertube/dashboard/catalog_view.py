"""Read the dashboard catalog from ``hackertube_core``.

The page receives the reviewed seed after core loads and checks it. This
module does not keep a second catalog file, and it does not rank, search,
or call a model.
"""

from __future__ import annotations

import sys
from dataclasses import asdict
from pathlib import Path

SCHEMA = "hackertube.catalog/1"


def _jsonable(value):
    """Values the catalog route can encode. Tuples become lists."""
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    return value


def repo_root() -> Path:
    """Repository root when this file lives in ``hackertube/dashboard/``."""
    return Path(__file__).resolve().parents[2]


def _load_seed():
    root = str(repo_root())
    if root not in sys.path:
        sys.path.insert(0, root)
    from hackertube_core import load_seed

    return load_seed()


def load_catalog():
    """The seed core returns. Ranking is a separate read."""
    return _load_seed()


def catalog_dict() -> dict:
    """JSON object for the page. Field values are what core stored."""
    catalog = _load_seed()
    return {
        "schema": SCHEMA,
        "demo_question": catalog.demo_question,
        "formats_may_be_empty": list(catalog.formats_may_be_empty),
        "unavailable_videos": [
            {"video_id": video_id, "destination": destination, "reason": reason}
            for video_id, destination, reason in catalog.unavailable_videos
        ],
        "items": [_jsonable(asdict(item)) for item in catalog.items],
        "evidence": [_jsonable(asdict(row)) for row in catalog.evidence],
        "sources": [_jsonable(asdict(row)) for row in catalog.sources],
        "editions": [_jsonable(asdict(row)) for row in catalog.editions],
    }


def load_view() -> dict:
    """Body of ``GET /catalog``. There is no fixture flag."""
    return {"catalog": catalog_dict()}
