"""Boundary checks CAT01–CAT11 and hostile records."""

import copy
import json
from dataclasses import replace
from pathlib import Path

import pytest

from hackertube_core.boundaries import (
    card_label,
    classify_endorsement,
    dedupe_items,
    explain_item,
    link_editions,
    present_excerpt,
    prepared_feed,
    recommendation_line,
    section_items,
    verified_items,
)
from hackertube_core.catalog import load_seed
from hackertube_core.errors import RecordError
from hackertube_core.records import Evidence, HN_RECOMMENDATION_LINE, MediaItem, SourceRecord
from hackertube_core.text import iso_duration_seconds, public_https_url

NOW = "2026-11-06T12:24:15Z"
ROOT = Path(__file__).resolve().parents[1]
HOSTILE = ROOT / "tests" / "fixtures" / "hostile"


@pytest.fixture(scope="module")
def catalog():
    return load_seed()


def test_hn_is_not_a_format():
    with pytest.raises(RecordError):
        MediaItem(
            item_id="hn:1",
            format="hn",
            title="Not a card",
            destination="https://news.ycombinator.com/item?id=1",
            contributors=None,
            duration_seconds=None,
            availability=None,
            identifiers=("hn:1",),
            show_id=None,
            capture_order=1,
            captured_at=NOW,
            art_url=None,
            art_hotlink=False,
            art_cache=False,
            art_reason="none",
            art_checked_at=None,
            art_http_status=None,
        )


def test_private_and_unsafe_destinations_are_refused():
    hostile = json.loads((HOSTILE / "bad_records.json").read_text())
    with pytest.raises(RecordError):
        public_https_url(hostile["destination"])
    with pytest.raises(RecordError):
        public_https_url("javascript:alert(1)")
    with pytest.raises(RecordError):
        public_https_url("https://user:secret@example.com/a")


def test_cat01_item_without_evidence_is_excluded(catalog):
    orphan = replace(
        catalog.items[0],
        item_id="youtube:orphan",
        identifiers=("youtube:orphan",),
        capture_order=99,
    )
    assert verified_items((orphan,), ()) == ()
    assert verified_items(catalog.items, catalog.evidence) == catalog.items


def test_cat02_unknown_duration_stays_unknown():
    assert iso_duration_seconds("about 10 minutes") is None
    assert iso_duration_seconds("PT15M33S") == 933
    assert iso_duration_seconds(900) is None


def test_cat07_criticism_is_not_a_recommendation():
    assert classify_endorsement("This is terrible, avoid it") == "criticism"
    assert classify_endorsement("This is not good, I recommend avoiding it") == "criticism"
    assert classify_endorsement("I highly recommend this talk") == "mention"
    assert classify_endorsement("Here is the link") == "mention"
    criticism = Evidence(
        evidence_id="hn:9",
        item_id="youtube:docSampleId",
        source_id="hn",
        retrieved_at=NOW,
        destination="https://news.ycombinator.com/item?id=9",
        excerpt=None,
        endorsement="criticism",
        kind="community",
        display_line=None,
        refresh_after=None,
    )
    assert recommendation_line(criticism) is None


def test_cat08_web_evidence_is_not_community_endorsement(catalog):
    item = catalog.items[0]
    web = Evidence(
        evidence_id="web:1",
        item_id=item.item_id,
        source_id="youtube",
        retrieved_at=NOW,
        destination=item.destination,
        excerpt=None,
        endorsement="none",
        kind="web",
        display_line=None,
        refresh_after=None,
    )
    explained = explain_item(item, (web,), catalog.source_map())
    assert explained["positive_endorsement"] is False
    assert explained["retrievals"][0]["kind"] == "web"
    assert explained["retrievals"][0]["display_line"] is None


def test_cat09_excerpt_does_not_change_settings():
    payload = json.loads((HOSTILE / "excerpt.json").read_text())
    settings = {"sources": ["hn"], "mode": "reader"}
    before = copy.deepcopy(settings)
    shown = present_excerpt(settings, payload["excerpt"])
    assert settings == before
    assert "<" not in shown
    assert "set mode to admin" in shown


def test_display_line_rejects_other_wording():
    with pytest.raises(RecordError):
        Evidence(
            evidence_id="hn:8",
            item_id="youtube:docSampleId",
            source_id="hn",
            retrieved_at=NOW,
            destination="https://news.ycombinator.com/item?id=8",
            excerpt=None,
            endorsement="established",
            kind="community",
            display_line="Recommended on HN",
            refresh_after=None,
        )


def test_seed_cards_cat03_cat04_cat06_cat10_cat11(catalog):
    explained = [catalog.explain(item) for item in catalog.items]
    for card in explained:
        for row in card["retrievals"]:
            assert row["source_name"]
            assert row["retrieved_at"]
        if card["positive_endorsement"]:
            line = next(row for row in card["retrievals"] if row["display_line"])
            assert line["display_line"] == HN_RECOMMENDATION_LINE
            assert line["destination"].startswith("https://news.ycombinator.com/item?id=")
            assert line["kind"] == "community"
    shows = [item for item in catalog.items if item.format == "podcast_show"]
    assert shows and all(card_label(item) == "show" and item.duration_seconds is None for item in shows)
    books = [item for item in catalog.items if item.format == "book"]
    audios = {item.item_id for item in catalog.items if item.format == "audiobook"}
    assert books and audios.isdisjoint({item.item_id for item in books})
    assert all(item.format != "audiobook" for item in books)
    assert len(catalog.editions) == 4
    assert {(link.book_item_id, link.audio_item_id) for link in catalog.editions} == {
        (link.book_item_id, link.audio_item_id) for link in link_editions(catalog.items)
    }


def test_cat05_duplicate_identity_keeps_every_evidence(catalog):
    show = next(item for item in catalog.items if item.format == "podcast_show")
    extra = next(row for row in catalog.evidence if row.item_id == show.item_id)
    copy_item = replace(show, title=show.title + " copy")
    items, evidence = dedupe_items((show, copy_item), (extra, extra))
    assert len(items) == 1
    assert len(evidence) == 2


def test_same_title_without_shared_id_stays_unlinked(catalog):
    book = next(item for item in catalog.items if item.format == "book")
    other = replace(
        book,
        item_id="ol:OL9W",
        identifiers=("ol:OL9W",),
        capture_order=99,
        title=book.title,
    )
    links = link_editions((*catalog.items, other))
    assert all(link.book_item_id != "ol:OL9W" for link in links)


def test_prepared_feed_orders_by_capture_and_makes_no_paid_call(catalog, monkeypatch):
    def explode(*args, **kwargs):
        raise AssertionError("network")

    from hackertube_core import outbound

    monkeypatch.setattr("urllib.request.urlopen", explode)
    outbound.install_guard(monkeypatch)
    outbound.reset()
    feed = prepared_feed(catalog.items, catalog.evidence, ["jane austen"], NOW)
    again = prepared_feed(catalog.items, catalog.evidence, ["jane austen"], NOW)
    assert feed == again
    assert outbound.counters() == {"free": 0, "paid": 0, "metered": 0}
    assert feed.personalized is True
    assert len(feed.why) == len(feed.items)
    assert feed.items
    empty = prepared_feed(catalog.items, catalog.evidence, [], NOW)
    assert empty.items == () and empty.personalized is False


def test_section_empty_state_is_empty(catalog):
    books = tuple(item for item in catalog.items if item.format == "book")
    assert section_items(books, catalog.evidence, "videos", NOW) == ()
    with pytest.raises(RecordError):
        section_items(catalog.items, catalog.evidence, "hacker-news", NOW)


def test_source_record_requires_a_reason_when_disabled():
    with pytest.raises(RecordError):
        SourceRecord(
            source_id="reddit",
            name="Reddit",
            role="community",
            enabled=False,
            blocked_reason=None,
            attribution="Reddit",
            retention="none",
            deletion="none",
            refresh_after=None,
            last_success_at=None,
            last_error=None,
            formats=(),
        )
