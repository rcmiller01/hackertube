"""Seeded catalog: UI02, FEED01, CAT03, CAT04, CAT10, CAT11."""

import json
from pathlib import Path

from hackertube_core.catalog import load_seed
from hackertube_core.demo_seed import MAY_BE_EMPTY, QUESTION, build

NOW = "2026-11-06T12:24:15Z"
ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "hackertube_core" / "seed" / "catalog.json"
CAPTURED = ROOT / "tests" / "fixtures" / "captured"


def test_seed_file_matches_the_builder():
    assert json.loads(SEED.read_text()) == build(CAPTURED)


def test_ui02_each_format_has_two_to_four_real_records():
    catalog = load_seed()
    counts = {section: len(catalog.section(section, NOW)) for section in ("videos", "podcasts", "books", "audiobooks")}
    assert counts == {"videos": 3, "podcasts": 4, "books": 4, "audiobooks": 4}
    assert all(2 <= count <= 4 for count in counts.values())
    assert {item.format for item in catalog.items} <= {"video", "podcast_episode", "podcast_show", "book", "audiobook"}
    assert [item.capture_order for item in catalog.items] == list(range(1, 16))


def test_feed01_is_deterministic_and_local():
    catalog = load_seed()
    first = catalog.feed(["jane austen"], NOW)
    second = catalog.feed(["Jane Austen"], NOW)
    assert first == second
    assert first.paid_calls == 0 and first.personalized is True
    assert [item.capture_order for item in first.items] == sorted(item.capture_order for item in first.items)
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


def test_art_policy_and_no_estimated_duration():
    catalog = load_seed()
    black_hole = next(item for item in catalog.items if item.item_id == "youtube:Dr20f19czeE")
    assert black_hole.duration_seconds is None
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
    assert "~30m" not in text


def test_hn_line_only_on_the_video_the_comment_names():
    catalog = load_seed()
    endorsed = {
        "youtube:LCEmiRjPEtQ": "44314766",
        "youtube:Dr20f19czeE": "19628894",
    }
    for item in catalog.items:
        card = catalog.explain(item)
        lines = [row for row in card["retrievals"] if row["display_line"]]
        if item.item_id in endorsed:
            assert lines[0]["display_line"] == "Recommended in Hacker News"
            assert lines[0]["destination"].endswith(endorsed[item.item_id])
        else:
            assert lines == []
        assert item.format != "hn"
    landing = catalog.explain(next(item for item in catalog.items if item.item_id == "youtube:gm0b_ijaYMQ"))
    assert all(row["display_line"] is None for row in landing["retrievals"])
    assert all(item.art_url is None for item in catalog.items if item.format == "audiobook")


def test_youtube_metadata_expires_and_other_sections_remain():
    catalog = load_seed()
    refresh = next(row.refresh_after for row in catalog.evidence if row.source_id == "youtube")
    assert catalog.section("videos", refresh) == ()
    assert len(catalog.section("books", refresh)) == 4
    assert len(catalog.section("audiobooks", refresh)) == 4


def test_blocked_sources_have_no_records():
    catalog = load_seed()
    blocked = {source.source_id: source for source in catalog.sources if not source.enabled}
    assert set(blocked) == {"podcastindex", "reddit"}
    assert blocked["reddit"].blocked_reason == "approval_absent"
    assert blocked["podcastindex"].blocked_reason == "missing_api_key"
    assert all(row.source_id not in blocked for row in catalog.evidence)
