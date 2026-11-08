"""Serialization and merge of validated, profile-owned retrieved records."""

from dataclasses import asdict, replace
from hackertube_core.catalog import Catalog, load_catalog
from hackertube_core.boundaries import active_evidence


def document(catalog):
    return {
        "schema": "hackertube.catalog/1",
        "demo_question": catalog.demo_question,
        "formats_may_be_empty": list(catalog.formats_may_be_empty),
        "unavailable_videos": [
            {"video_id": x, "destination": y, "reason": z}
            for x, y, z in catalog.unavailable_videos
        ],
        **{
            name: [asdict(row) for row in getattr(catalog, name)]
            for name in ("items", "evidence", "sources", "editions")
        },
    }


def merge(base, incoming):
    # Keep stable IDs (and existing saved identities) across later searches.
    items = {x.item_id: x for x in base.items}
    items.update({x.item_id: x for x in incoming.items})
    evidence = {x.evidence_id: x for x in base.evidence}
    evidence.update({x.evidence_id: x for x in incoming.evidence})
    sources = {x.source_id: x for x in base.sources}
    sources.update({x.source_id: x for x in incoming.sources})
    editions = {x.work_id: x for x in base.editions}
    editions.update({x.work_id: x for x in incoming.editions})
    result = Catalog(
        tuple(replace(x, capture_order=i) for i, x in enumerate(items.values(), 1)),
        tuple(evidence.values()),
        tuple(sources.values()),
        tuple(editions.values()),
        base.demo_question,
        base.formats_may_be_empty,
        base.unavailable_videos,
    )
    return load_catalog(document(result))


def without_expired(catalog, now):
    evidence = active_evidence(catalog.evidence, now)
    known = {x.item_id for x in evidence}
    items = tuple(
        replace(x, capture_order=i)
        for i, x in enumerate((x for x in catalog.items if x.item_id in known), 1)
    )
    ids = {x.item_id for x in items}
    return replace(
        catalog,
        items=items,
        evidence=tuple(evidence),
        editions=tuple(
            x
            for x in catalog.editions
            if x.book_item_id in ids and x.audio_item_id in ids
        ),
    )
