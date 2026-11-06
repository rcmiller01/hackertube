"""The only catalog reader for the dashboard page.

Loads the local fixture in ``fixture/catalog.json``. That file matches schema
``hackertube.catalog/1``. This module does not import ``hackertube_core``.
Swap ``load_catalog`` for the merged package after pull request #3 lands.
Library persistence and feed ranking are not this adapter.
"""

from __future__ import annotations

import json
from pathlib import Path

SCHEMA = "hackertube.catalog/1"
ROOT_KEYS = {
    "schema",
    "demo_question",
    "formats_may_be_empty",
    "unavailable_videos",
    "items",
    "evidence",
    "sources",
    "editions",
}
UNAVAILABLE_KEYS = {"video_id", "destination", "reason"}
FORMATS = {"video", "podcast_episode", "podcast_show", "book", "audiobook"}
FIXTURE_PATH = Path(__file__).with_name("fixture") / "catalog.json"


class CatalogFixtureError(Exception):
    """The local fixture is missing or does not match the catalog shape."""


def load_catalog() -> dict:
    """Return the fixture object. No network and no model call."""
    try:
        data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CatalogFixtureError("fixture") from exc
    _check(data)
    return data


def load_view() -> dict:
    """Wrapper the page fetches. ``fixture`` stays true until the real catalog is wired."""
    return {"fixture": True, "catalog": load_catalog()}


def _check(data: dict) -> None:
    if not isinstance(data, dict) or set(data) != ROOT_KEYS or data.get("schema") != SCHEMA:
        raise CatalogFixtureError("schema")
    question = data.get("demo_question")
    if not isinstance(question, str) or not question.strip():
        raise CatalogFixtureError("demo_question")
    if not isinstance(data.get("items"), list) or not data["items"]:
        raise CatalogFixtureError("items")
    seen = set()
    for item in data["items"]:
        if not isinstance(item, dict):
            raise CatalogFixtureError("item")
        item_id = item.get("item_id")
        fmt = item.get("format")
        if not isinstance(item_id, str) or not item_id or item_id in seen:
            raise CatalogFixtureError("item_id")
        if item_id.startswith("hn:") or fmt == "hn" or fmt not in FORMATS:
            raise CatalogFixtureError("format")
        if not isinstance(item.get("title"), str) or not item["title"].strip():
            raise CatalogFixtureError("title")
        if not isinstance(item.get("destination"), str) or not item["destination"].startswith("https://"):
            raise CatalogFixtureError("destination")
        seen.add(item_id)
    if any(row.get("format") == "hn" for row in data["items"]):
        raise CatalogFixtureError("format")
    unavailable = data.get("unavailable_videos")
    if not isinstance(unavailable, list):
        raise CatalogFixtureError("unavailable_videos")
    for row in unavailable:
        if not isinstance(row, dict) or set(row) != UNAVAILABLE_KEYS:
            raise CatalogFixtureError("unavailable_videos")
        if not isinstance(row.get("video_id"), str) or not row["video_id"]:
            raise CatalogFixtureError("unavailable_videos")
        destination = row.get("destination")
        if not isinstance(destination, str) or not destination.startswith("https://"):
            raise CatalogFixtureError("unavailable_videos")
        if row["video_id"] not in destination:
            raise CatalogFixtureError("unavailable_videos")
