"""Load a frozen catalog and serve section and feed reads. No network."""

import json
from dataclasses import dataclass
from pathlib import Path

from hackertube_core.boundaries import (
    active_evidence,
    explain_item,
    link_editions,
    prepared_feed,
    question_coverage,
    recommendation_line,
    section_items,
)
from hackertube_core.errors import RecordError
from hackertube_core.records import SECTIONS, EditionLink, Evidence, MediaItem, SourceRecord
from hackertube_core.text import public_https_url, youtube_video_id

_ROOT_KEYS = {
    "schema",
    "demo_question",
    "formats_may_be_empty",
    "unavailable_videos",
    "items",
    "evidence",
    "sources",
    "editions",
}
SCHEMA = "hackertube.catalog/1"


def _tuple_fields(data, fields):
    copied = dict(data)
    for field in fields:
        value = copied.get(field)
        if value is not None:
            copied[field] = tuple(value)
    return copied


@dataclass(frozen=True)
class Catalog:
    items: tuple
    evidence: tuple
    sources: tuple
    editions: tuple
    demo_question: str
    formats_may_be_empty: tuple
    unavailable_videos: tuple

    def source_map(self):
        return {source.source_id: source for source in self.sources}

    def explain(self, item):
        return explain_item(item, self.evidence, self.source_map())

    def feed(self, interests, now):
        return prepared_feed(self.items, self.evidence, interests, now)

    def section(self, section, now):
        return section_items(self.items, self.evidence, section, now)

    def coverage(self, now):
        return question_coverage(self.items, self.evidence, self.demo_question, now)

    def visible_evidence(self, now):
        return active_evidence(self.evidence, now)


def load_catalog(data):
    if set(data) != _ROOT_KEYS or data.get("schema") != SCHEMA:
        raise RecordError("schema")
    if not isinstance(data["demo_question"], str) or not data["demo_question"].strip():
        raise RecordError("demo_question")
    empty = tuple(data["formats_may_be_empty"])
    if any(section not in SECTIONS for section in empty):
        raise RecordError("formats_may_be_empty")
    unavailable = tuple(_unavailable(row) for row in data["unavailable_videos"])
    items = tuple(MediaItem(**_tuple_fields(row, ("contributors", "identifiers"))) for row in data["items"])
    evidence = tuple(Evidence(**row) for row in data["evidence"])
    sources = tuple(
        SourceRecord(**_tuple_fields(row, ("formats",))) for row in data["sources"]
    )
    editions = tuple(EditionLink(**row) for row in data["editions"])
    _check(items, evidence, sources, editions)
    return Catalog(items, evidence, sources, editions, data["demo_question"], empty, unavailable)


def _unavailable(row):
    if set(row) != {"video_id", "destination", "reason"}:
        raise RecordError("unavailable_videos")
    if youtube_video_id(row["destination"]) != row["video_id"]:
        raise RecordError("unavailable_videos")
    if not isinstance(row["reason"], str) or not row["reason"].strip():
        raise RecordError("unavailable_videos")
    public_https_url(row["destination"])
    return (row["video_id"], row["destination"], row["reason"])


def _check(items, evidence, sources, editions):
    ids = [item.item_id for item in items]
    if len(ids) != len(set(ids)):
        raise RecordError("item_id")
    orders = [item.capture_order for item in items]
    if orders != list(range(1, len(items) + 1)):
        raise RecordError("capture_order")
    if len({row.evidence_id for row in evidence}) != len(evidence):
        raise RecordError("evidence_id")
    known = set(ids)
    sources_by_id = {source.source_id: source for source in sources}
    if len(sources_by_id) != len(sources):
        raise RecordError("source_id")
    evidence_ids = set()
    for row in evidence:
        if row.item_id not in known or row.source_id not in sources_by_id:
            raise RecordError("evidence")
        if row.display_line != recommendation_line(row):
            raise RecordError("display_line")
        evidence_ids.add(row.item_id)
    if evidence_ids != known:
        raise RecordError("evidence")
    for link in editions:
        books = {item.item_id: item for item in items}
        book = books[link.book_item_id]
        audio = books[link.audio_item_id]
        if book.format != "book" or audio.format != "audiobook":
            raise RecordError("edition")
        if link.work_id not in book.identifiers or link.work_id not in audio.identifiers:
            raise RecordError("edition")
    derived = {(link.work_id, link.book_item_id, link.audio_item_id) for link in link_editions(items)}
    stored = {(link.work_id, link.book_item_id, link.audio_item_id) for link in editions}
    if derived != stored:
        raise RecordError("edition")
    if any(item.format == "hn" or item.item_id.startswith("hn:") for item in items):
        raise RecordError("format")


def load_seed():
    path = Path(__file__).parent / "seed" / "catalog.json"
    return load_catalog(json.loads(path.read_text()))
