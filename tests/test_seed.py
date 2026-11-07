"""Seeded catalog: UI02, FEED01, CAT03, CAT04, CAT10, CAT11.

The build reads its records through the request boundary
(``hackertube_core.outbound``) and merges them through
``hackertube_core.sources.ingest``. ``plugin_db`` is the production profile
store; these tests pass a temporary one because Hermes is not importable here.
"""

import json
import sqlite3
from pathlib import Path

import pytest

from hackertube_core import outbound
from hackertube_core.boundaries import explain_item, recommendation_line, section_items
from hackertube_core.catalog import load_seed
from hackertube_core.demo_seed import (
    CATALOG_READS,
    IDENTIFIED_VIDEOS,
    MAY_BE_EMPTY,
    QUESTION,
    build,
    freeze,
)
from hackertube_core.records import Evidence, MediaItem, blank_art

NOW = "2026-11-06T12:24:15Z"
ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "hackertube_core" / "seed" / "catalog.json"
CAPTURED = ROOT / "tests" / "fixtures" / "captured"


def connect_at(root):
    """Stand-in for ``plugin_db``. It is not the production path."""
    path = Path(root) / "profile.db"
    path.parent.mkdir(parents=True, exist_ok=True)

    def connect():
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        return conn

    return connect


# --- the seed is built from reads through the boundary ---------------------


def test_seed_file_matches_the_builder(tmp_path):
    assert json.loads(SEED.read_text()) == build(CAPTURED, connect=connect_at(tmp_path))


def test_build_reads_through_the_boundary_and_makes_no_paid_call(tmp_path, monkeypatch):
    """Acceptance 1: seed reads cross the boundary; a build makes no paid call."""
    outbound.install_guard(monkeypatch)
    outbound.reset()
    data, counts = freeze(CAPTURED, connect=connect_at(tmp_path))
    assert counts == {"free": len(CATALOG_READS), "paid": 0, "metered": 0}
    assert outbound.counters() == counts
    assert outbound.usage()["cost_usd"] == 0.0
    assert len(data["items"]) == 12


def test_seed_build_stores_through_the_profile_store_not_raw_sqlite():
    source = (ROOT / "hackertube_core" / "demo_seed.py").read_text(encoding="utf-8")
    assert "import sqlite3" not in source
    assert "sqlite3.connect" not in source
    assert "open_profile_db" in source


def test_ui02_sections_are_honest_without_youtube_titles():
    catalog = load_seed()
    counts = {
        section: len(catalog.section(section, NOW))
        for section in ("videos", "podcasts", "books", "audiobooks")
    }
    assert counts == {"videos": 0, "podcasts": 4, "books": 4, "audiobooks": 4}
    assert [item.capture_order for item in catalog.items] == list(range(1, 13))
    assert [row[0] for row in catalog.unavailable_videos] == list(IDENTIFIED_VIDEOS)
    assert all(row[1] == f"https://www.youtube.com/watch?v={row[0]}" for row in catalog.unavailable_videos)


def test_feed01_is_deterministic_and_local(monkeypatch):
    outbound.install_guard(monkeypatch)
    outbound.reset()
    catalog = load_seed()
    first = catalog.feed(["jane austen"], NOW)
    second = catalog.feed(["Jane Austen"], NOW)
    assert first == second
    assert outbound.counters() == {"free": 0, "paid": 0, "metered": 0}
    assert first.personalized is True
    assert len(first.why) == len(first.items)
    assert {item.format for item in first.items} == {"podcast_show", "book", "audiobook"}
    assert catalog.feed([], NOW).personalized is False


def test_demo_question_names_the_empty_format():
    catalog = load_seed()
    assert catalog.demo_question == QUESTION
    coverage = catalog.coverage(NOW)
    empty = tuple(section for section, count in coverage.items() if count == 0)
    assert empty == MAY_BE_EMPTY == catalog.formats_may_be_empty
    assert coverage["books"] == 4
    assert coverage["audiobooks"] == 4
    assert coverage["podcasts"] == 2


# --- CAT03 / CAT04 ---------------------------------------------------------


def test_cat03_a_book_without_an_audio_edition_is_not_an_audiobook():
    """CAT03: a book found without an audio-edition record stays a book."""
    catalog = load_seed()
    books = [item for item in catalog.items if item.format == "book"]
    assert books and all(item.format == "book" for item in books)
    # A book card carries no audio-edition source record and no audio format.
    for book in books:
        assert not any(row["source_id"] == "librivox" for row in catalog.explain(book)["retrievals"])
    # Drop one LibriVox recording. It leaves the audiobooks section and the
    # book is not re-labelled as an audiobook to cover the gap.
    audio = next(item for item in catalog.items if item.format == "audiobook")
    kept = tuple(row for row in catalog.evidence if row.item_id != audio.item_id)
    remaining = section_items(catalog.items, kept, "audiobooks", NOW)
    assert audio.item_id not in {item.item_id for item in remaining}
    assert len(remaining) == 3
    assert {item.format for item in section_items(catalog.items, kept, "books", NOW)} == {"book"}


def test_cat04_podcast_identity_is_clear():
    """CAT04: a whole show is labelled a show and invents no episode metadata."""
    catalog = load_seed()
    shows = [item for item in catalog.items if item.format == "podcast_show"]
    episodes = [item for item in catalog.items if item.format == "podcast_episode"]
    assert len(shows) == 3
    assert len(episodes) == 1
    for show in shows:
        assert catalog.explain(show)["label"] == "show"
        assert show.duration_seconds is None
        assert show.show_id is None
    episode = episodes[0]
    assert catalog.explain(episode)["label"] == "episode"
    assert episode.show_id is not None
    assert episode.duration_seconds == 4257


# --- CAT10 / CAT11 ---------------------------------------------------------


def test_cat10_retrieval_source_and_time_on_every_card():
    """CAT10: a card identifies its retrieval source and the retrieval time."""
    catalog = load_seed()
    known = {source.source_id: source for source in catalog.sources}
    for item in catalog.items:
        card = catalog.explain(item)
        assert card is not None
        assert card["retrievals"]
        for row in card["retrievals"]:
            assert row["source_id"] in known
            assert row["source_name"] == known[row["source_id"]].name
            assert row["retrieved_at"] == item.captured_at
            assert row["retrieved_at"].endswith("Z")
            assert row["attribution"].strip()


def test_cat11_community_evidence_opens_its_discussion():
    """CAT11: a community claim can be opened and inspected at its source.

    The seed attaches no community endorsement: docs/receipts/catalog/
    hn-endorsement-search.md found no hit that named or linked a seed item and
    was positive about it. So no card claims one, and the seed keeps no HN
    evidence row. The mechanism is pinned on seed-shaped Hacker News evidence.
    """
    catalog = load_seed()
    assert all(row.kind != "community" for row in catalog.evidence)
    for item in catalog.items:
        assert catalog.explain(item)["positive_endorsement"] is False

    record = Evidence(
        evidence_id="hn:44314766",
        item_id="youtube:LCEmiRjPEtQ",
        source_id="hn",
        retrieved_at=NOW,
        destination="https://news.ycombinator.com/item?id=44314766",
        excerpt=None,
        endorsement="established",
        kind="community",
        display_line=None,
        refresh_after=None,
    )
    assert recommendation_line(record) == "Recommended in Hacker News"
    video = MediaItem(
        item_id="youtube:LCEmiRjPEtQ",
        format="video",
        title="Software in the era of AI",
        destination="https://www.youtube.com/watch?v=LCEmiRjPEtQ",
        contributors=None,
        duration_seconds=None,
        availability=None,
        identifiers=("youtube:LCEmiRjPEtQ",),
        show_id=None,
        capture_order=1,
        captured_at=NOW,
        **blank_art("not displayed by the seed"),
    )
    card = explain_item(video, (record,), catalog.source_map())
    assert card["positive_endorsement"] is True
    assert card["retrievals"][0]["destination"] == "https://news.ycombinator.com/item?id=44314766"


# --- source scope, metadata, and the art policy ----------------------------


def test_only_display_usable_sources_are_seeded():
    catalog = load_seed()
    blocked = {source.source_id for source in catalog.sources if not source.enabled}
    assert blocked == {"youtube", "podcastindex", "reddit"}
    assert all(row.source_id not in blocked for row in catalog.evidence)
    assert all(item.format != "video" for item in catalog.items)
    assert not any(item.item_id.startswith("hn:") for item in catalog.items)
    youtube = {source.source_id: source for source in catalog.sources}["youtube"]
    assert youtube.blocked_reason == "unresolved-terms"
    reason = catalog.unavailable_videos[0][2]
    assert "disabled" in reason and "title" in reason


def test_each_source_carries_its_refresh_retention_and_attribution():
    """Acceptance 3: each source row carries the metadata its terms require."""
    catalog = load_seed()
    for source in catalog.sources:
        assert source.attribution.strip()
        assert source.retention.strip()
        assert source.refresh.strip()
        assert source.deletion.strip()
        # No enabled seeded source states a maximum retention or refresh
        # period, so no seeded row carries an expiry. YouTube states 30 days
        # and stores nothing, so it carries none either.
        assert source.refresh_after is None
    assert all(row.refresh_after is None for row in catalog.evidence)
    youtube = {source.source_id: source for source in catalog.sources}["youtube"]
    assert "30 calendar days" in youtube.refresh


def test_art_policy_and_no_estimated_duration():
    catalog = load_seed()
    assert all(item.format != "video" for item in catalog.items)
    for item in catalog.items:
        if item.format in {"video", "podcast_show", "book"}:
            assert item.duration_seconds is None
        if item.art_url is None:
            assert item.art_hotlink is False and item.art_cache is False
        else:
            assert item.art_hotlink is True and item.art_cache is False
            assert item.art_http_status == 200 and item.art_checked_at
            assert "ytimg.com" not in item.art_url
    episode = next(item for item in catalog.items if item.format == "podcast_episode")
    assert episode.duration_seconds == 4257
    text = SEED.read_text()
    assert "<iframe" not in text
    assert "loved the analogies" not in text
    assert "artworkUrl" not in text
    assert "i.ytimg.com" not in text
    assert "thumbnail_url" not in text
    assert all(item.art_url is None for item in catalog.items if item.format == "audiobook")


def test_seed_does_not_claim_hacker_news_on_a_card():
    catalog = load_seed()
    for item in catalog.items:
        card = catalog.explain(item)
        assert all(row["display_line"] is None for row in card["retrievals"])
        assert item.format != "hn"


def test_blocked_sources_have_no_records():
    catalog = load_seed()
    blocked = {source.source_id: source for source in catalog.sources if not source.enabled}
    assert set(blocked) == {"youtube", "podcastindex", "reddit"}
    assert blocked["youtube"].blocked_reason == "unresolved-terms"
    assert blocked["reddit"].blocked_reason == "approval_absent"
    assert blocked["podcastindex"].blocked_reason == "missing_api_key"
    assert all(row.source_id not in blocked for row in catalog.evidence)
