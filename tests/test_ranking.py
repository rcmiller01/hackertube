"""FEED09. Fixed weights, honest why-lines, and no clock reads."""

import time
from dataclasses import replace
from datetime import datetime

from hackertube_core.boundaries import prepared_feed
from hackertube_core.catalog import load_seed
from hackertube_core.ranking import (
    ENDORSEMENT_WEIGHT,
    FRESHNESS_WEIGHT,
    FRESHNESS_WINDOW_DAYS,
    RECENT_DAYS,
    VARIETY_FORMAT_PENALTY,
    VARIETY_SOURCE_PENALTY,
    WHY_COMMUNITY,
    WHY_MATCH,
    WHY_RECENT,
)
from hackertube_core.records import Evidence, HN_RECOMMENDATION_LINE

NOW = "2026-11-06T12:24:15Z"
OLD = "2025-01-01T00:00:00Z"
PAST = "2026-11-01T00:00:00Z"


def test_weight_constants_keep_endorsement_ahead_of_freshness_and_variety():
    assert ENDORSEMENT_WEIGHT == 1000
    assert FRESHNESS_WINDOW_DAYS == 366
    assert FRESHNESS_WEIGHT == 1
    assert RECENT_DAYS == 30
    assert VARIETY_SOURCE_PENALTY == 40
    assert VARIETY_FORMAT_PENALTY == 20
    assert ENDORSEMENT_WEIGHT > FRESHNESS_WINDOW_DAYS * FRESHNESS_WEIGHT
    assert VARIETY_SOURCE_PENALTY + VARIETY_FORMAT_PENALTY < ENDORSEMENT_WEIGHT
    assert VARIETY_SOURCE_PENALTY > VARIETY_FORMAT_PENALTY


def _item(template, item_id, captured_at, order, fmt):
    return replace(
        template,
        item_id=item_id,
        identifiers=(item_id,),
        captured_at=captured_at,
        capture_order=order,
        format=fmt,
        title="Sample " + item_id,
        contributors=("Jane Austen",),
        show_id=None,
        duration_seconds=None,
    )


def _catalog_row(item, source_id):
    return Evidence(
        evidence_id="cat-" + item.item_id,
        item_id=item.item_id,
        source_id=source_id,
        retrieved_at=item.captured_at,
        destination=item.destination,
        excerpt=None,
        endorsement="not_applicable",
        kind="catalog",
        display_line=None,
        refresh_after=None,
    )


def _community(item, endorsement, refresh_after=None):
    established = endorsement == "established"
    return Evidence(
        evidence_id="com-" + item.item_id,
        item_id=item.item_id,
        source_id="hn",
        retrieved_at=item.captured_at,
        destination="https://news.ycombinator.com/item?id=26188584",
        excerpt=None,
        endorsement=endorsement,
        kind="community",
        display_line=HN_RECOMMENDATION_LINE if established else None,
        refresh_after=refresh_after,
    )


def _feed(items, evidence):
    return prepared_feed(items, evidence, ("Jane Austen",), NOW)


def test_feed09_endorsed_item_outranks_an_otherwise_equal_unendorsed_item():
    template = next(item for item in load_seed().items if item.format == "book")
    endorsed = _item(template, "z-endorsed", NOW, 1, "book")
    plain = _item(template, "a-plain", NOW, 2, "book")
    evidence = (
        _catalog_row(endorsed, "openlibrary"),
        _community(endorsed, "established"),
        _catalog_row(plain, "openlibrary"),
    )
    feed = _feed((plain, endorsed), evidence)
    assert [item.item_id for item in feed.items][0] == "z-endorsed"
    assert feed.why[0] == (WHY_MATCH, WHY_COMMUNITY, WHY_RECENT)
    assert WHY_COMMUNITY not in feed.why[1]
    assert "Hacker News" not in " ".join(feed.why[0])
    assert "Recommended" not in " ".join(feed.why[0])


def test_feed09_endorsement_outranks_a_full_freshness_window():
    template = next(item for item in load_seed().items if item.format == "book")
    endorsed = _item(template, "z-old", OLD, 1, "book")
    fresh = _item(template, "a-fresh", NOW, 2, "book")
    evidence = (
        _catalog_row(endorsed, "openlibrary"),
        _community(endorsed, "established"),
        _catalog_row(fresh, "openlibrary"),
    )
    feed = _feed((fresh, endorsed), evidence)
    assert [item.item_id for item in feed.items] == ["z-old", "a-fresh"]
    assert feed.why[0] == (WHY_MATCH, WHY_COMMUNITY)
    assert feed.why[1] == (WHY_MATCH, WHY_RECENT)


def test_feed09_fresher_item_outranks_an_otherwise_equal_older_item():
    template = next(item for item in load_seed().items if item.format == "book")
    fresh = _item(template, "z-fresh", NOW, 1, "book")
    older = _item(template, "a-older", OLD, 2, "book")
    evidence = (
        _catalog_row(fresh, "openlibrary"),
        _catalog_row(older, "openlibrary"),
    )
    feed = _feed((older, fresh), evidence)
    assert [item.item_id for item in feed.items] == ["z-fresh", "a-older"]
    assert feed.why[0] == (WHY_MATCH, WHY_RECENT)
    assert feed.why[1] == (WHY_MATCH,)


def test_feed09_variety_breaks_a_same_source_run():
    template = next(item for item in load_seed().items if item.format == "book")
    items = (
        _item(template, "a1", NOW, 1, "podcast_show"),
        _item(template, "a2", NOW, 2, "podcast_show"),
        _item(template, "a3", NOW, 3, "podcast_show"),
        _item(template, "b1", NOW, 4, "audiobook"),
    )
    evidence = (
        _catalog_row(items[0], "itunes"),
        _catalog_row(items[1], "itunes"),
        _catalog_row(items[2], "itunes"),
        _catalog_row(items[3], "librivox"),
    )
    feed = _feed(items, evidence)
    ids = [item.item_id for item in feed.items]
    assert ids == ["a1", "b1", "a2", "a3"]
    assert ids != ["a1", "a2", "a3", "b1"]


def test_feed09_ranking_is_deterministic_and_does_not_read_the_clock(monkeypatch):
    import hackertube_core.ranking as ranking

    def explode(*_args, **_kwargs):
        raise AssertionError("clock")

    class GuardDatetime:
        @staticmethod
        def strptime(value, fmt):
            return datetime.strptime(value, fmt)

        @staticmethod
        def now(*_args, **_kwargs):
            raise AssertionError("clock")

    monkeypatch.setattr(time, "time", explode)
    monkeypatch.setattr(time, "monotonic", explode)
    monkeypatch.setattr(ranking, "datetime", GuardDatetime)
    catalog = load_seed()
    first = catalog.feed(("jane austen",), NOW)
    second = catalog.feed(("Jane Austen",), NOW)
    assert first == second
    assert [item.item_id for item in first.items] == [item.item_id for item in second.items]
    assert first.why == second.why
    assert first.items
    assert all(WHY_COMMUNITY not in lines for lines in first.why)


def test_feed09_why_line_omits_endorsement_without_established_community_evidence():
    template = next(item for item in load_seed().items if item.format == "book")
    mention = _item(template, "m1", NOW, 1, "book")
    criticism = _item(template, "c1", NOW, 2, "book")
    expired = _item(template, "e1", NOW, 3, "book")
    web = _item(template, "w1", NOW, 4, "book")
    evidence = (
        _catalog_row(mention, "openlibrary"),
        _community(mention, "mention"),
        _catalog_row(criticism, "openlibrary"),
        _community(criticism, "criticism"),
        _catalog_row(expired, "openlibrary"),
        _community(expired, "established", refresh_after=PAST),
        _catalog_row(web, "openlibrary"),
        replace(_community(web, "established"), evidence_id="web-w1", kind="web", display_line=None),
    )
    feed = _feed((mention, criticism, expired, web), evidence)
    for lines in feed.why:
        assert lines[0] == WHY_MATCH
        assert WHY_COMMUNITY not in lines
        text = " ".join(lines)
        assert "Hacker News" not in text
        assert "endorsement" not in text.lower()
        assert "Recommended" not in text
    seed = load_seed()
    seeded = seed.feed(("jane austen",), NOW)
    assert seeded.why
    for lines in seeded.why:
        assert WHY_COMMUNITY not in lines
        assert "Hacker News" not in " ".join(lines)
