"""FEED01 through FEED07. Ranking is Catalog.feed. Sections are Catalog.section."""

import importlib.util
from dataclasses import replace
from pathlib import Path

from hackertube_core.catalog import load_seed

NOW = "2026-11-06T12:24:15Z"
PAST = "2026-11-01T00:00:00Z"
FUTURE = "2026-12-01T00:00:00Z"
ROOT = Path(__file__).resolve().parents[1]
DISCOVERY = ROOT / "hackertube" / "dashboard" / "discovery.py"
PYTHON_SHOW = "itunes:podcast:1691189730"
PYTHON_EPISODE = "itunes:episode:1000797776212"
PRIDE = "ol:OL66554W"
EMMA = "ol:OL66513W"


def _discovery():
    spec = importlib.util.spec_from_file_location("hackertube_discovery_test", DISCOVERY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _by_id(catalog):
    return {item.item_id: item for item in catalog.items}


def _titles(catalog, ids):
    by_id = _by_id(catalog)
    return [by_id[item_id].title for item_id in ids]


def _counts(catalog, ids):
    counts = {"videos": 0, "podcasts": 0, "books": 0, "audiobooks": 0}
    by_id = _by_id(catalog)
    groups = {
        "videos": ("video",),
        "podcasts": ("podcast_episode", "podcast_show"),
        "books": ("book",),
        "audiobooks": ("audiobook",),
    }
    for item_id in ids:
        fmt = by_id[item_id].format
        for name, formats in groups.items():
            if fmt in formats:
                counts[name] += 1
    return counts


def _expire(catalog, item_id, stamp):
    evidence = tuple(
        replace(row, refresh_after=stamp)
        if row.item_id == item_id and row.kind == "catalog"
        else row
        for row in catalog.evidence
    )
    return replace(catalog, evidence=evidence)


def test_feed01_open_with_interests_ranks_without_a_question_or_paid_call(monkeypatch):
    def explode(*_args, **_kwargs):
        raise AssertionError("network")

    monkeypatch.setattr("urllib.request.urlopen", explode)
    catalog = load_seed()
    view = _discovery().discovery_dict(catalog, {"interests": ["jane austen"], "items": []}, NOW)
    assert view["paid_calls"] == 0
    assert view["personalized"] is True
    assert view["feed"]
    assert view["feed"] == [item.item_id for item in catalog.feed(("jane austen",), NOW).items]
    assert "question" not in view


def test_feed02_relevant_matches_explain_the_signals_used():
    catalog = load_seed()
    discovery = _discovery()
    view = discovery.discovery_dict(catalog, {"interests": ["Jane Austen"], "items": []}, NOW)
    titles = _titles(catalog, view["feed"])
    assert "Pride and Prejudice" in titles
    assert "The Python Show" not in titles
    assert view["signals"] == list(discovery.SIGNALS)
    assert "matched interest" in view["signals"]
    assert "community evidence" in view["signals"]
    assert "freshness" in view["signals"]
    assert "variety" in view["signals"]
    assert view["why"]
    for lines in view["why"].values():
        assert lines[0] == "Matched interest"
        assert "Community evidence" not in lines
        assert "Hacker News" not in " ".join(lines)
        assert "Recommended" not in " ".join(lines)
    assert "weight" not in view


def test_feed03_publisher_records_stay_source_candidates():
    catalog = load_seed()
    view = _discovery().discovery_dict(catalog, {"interests": ["jane austen"], "items": []}, NOW)
    by_id = _by_id(catalog)
    assert view["feed"]
    for item_id in view["feed"]:
        card = catalog.explain(by_id[item_id])
        assert card["positive_endorsement"] is False
        assert any(row["kind"] == "catalog" for row in card["retrievals"])
        assert all(row["display_line"] is None for row in card["retrievals"])
        assert all(row["endorsement"] != "established" for row in card["retrievals"])


def test_feed04_browse_actions_make_no_paid_call(monkeypatch):
    from hackertube_core import outbound

    outbound.install_guard(monkeypatch)
    outbound.reset()
    catalog = load_seed()
    discovery = _discovery()
    opened = discovery.discovery_dict(catalog, {"interests": ["jane austen"], "items": []}, NOW)
    paged = opened["feed"][:4]
    books = opened["sections"]["books"]["matches"]
    saved = discovery.discovery_dict(
        catalog,
        {"interests": ["jane austen"], "items": [{"item_id": PRIDE, "saved": True, "dismissed": False, "completed": False}]},
        NOW,
    )
    dismissed = discovery.discovery_dict(
        catalog,
        {"interests": ["jane austen"], "items": [{"item_id": PRIDE, "saved": True, "dismissed": True, "completed": False}]},
        NOW,
    )
    reopened = discovery.discovery_dict(catalog, {"interests": ["jane austen"], "items": []}, NOW)
    assert opened["request_counts"] == {"free": 0, "paid": 0, "metered": 0}
    assert opened["paid_calls"] == saved["paid_calls"] == dismissed["paid_calls"] == reopened["paid_calls"] == 0
    assert reopened["request_counts"] == {"free": 0, "paid": 0, "metered": 0}
    assert outbound.counters() == {"free": 0, "paid": 0, "metered": 0}
    assert paged
    assert books
    assert PRIDE in saved["feed"]
    assert PRIDE not in dismissed["feed"]
    assert reopened == opened


def test_feed05_dismissed_and_completed_stay_excluded_after_refresh():
    catalog = load_seed()
    discovery = _discovery()
    profile = {
        "interests": ["jane austen"],
        "items": [
            {"item_id": PRIDE, "dismissed": True, "completed": False, "saved": True},
            {"item_id": EMMA, "dismissed": False, "completed": True, "saved": False},
        ],
    }
    first = discovery.discovery_dict(catalog, profile, NOW)
    second = discovery.discovery_dict(catalog, profile, NOW)
    assert first == second
    assert PRIDE not in first["feed"]
    assert EMMA not in first["feed"]
    assert all(
        PRIDE not in group["matches"] and PRIDE not in group["browse"]
        and EMMA not in group["matches"] and EMMA not in group["browse"]
        for group in first["sections"].values()
    )
    opened = discovery.discovery_dict(
        catalog,
        {
            "interests": ["jane austen"],
            "items": [{
                "item_id": PRIDE,
                "dismissed": False,
                "completed": False,
                "saved": True,
                "opens": ["2026-11-06T15:00:00Z"],
            }],
        },
        NOW,
    )
    assert PRIDE in opened["feed"]
    assert PRIDE in opened["sections"]["books"]["matches"]
    assert PRIDE in opened["why"]


def _assert_sparse(view):
    assert view["personalized"] is True
    assert view["paid_calls"] == 0
    assert view["feed"] == []
    assert view["why"] == {}
    assert view["signals"] == []
    for group in view["sections"].values():
        assert group["matches"] == []
        assert group["match_count"] == 0
        assert group["browse_count"] == len(group["browse"])
    assert len(view["sections"]["podcasts"]["browse"]) == 4
    assert len(view["sections"]["books"]["browse"]) == 4


def test_feed06_ai_interest_is_a_personalized_profile_with_no_unrelated_fill():
    catalog = load_seed()
    view = _discovery().discovery_dict(catalog, {"interests": ["AI"], "items": []}, NOW)
    _assert_sparse(view)
    core = catalog.feed(("AI",), NOW)
    assert core.personalized is False and core.items == ()


def test_feed06_cpp_interest_is_a_personalized_profile_with_no_unrelated_fill():
    catalog = load_seed()
    view = _discovery().discovery_dict(catalog, {"interests": ["C++"], "items": []}, NOW)
    _assert_sparse(view)
    core = catalog.feed(("C++",), NOW)
    assert core.personalized is False and core.items == ()


def test_short_interest_mixed_with_a_match_still_ranks_the_match():
    catalog = load_seed()
    discovery = _discovery()
    mixed = discovery.discovery_dict(
        catalog, {"interests": ["AI", "C++", "jane austen"], "items": []}, NOW
    )
    alone = discovery.discovery_dict(catalog, {"interests": ["jane austen"], "items": []}, NOW)
    assert mixed["personalized"] is True
    assert mixed["feed"] == alone["feed"]
    assert mixed["sections"] == alone["sections"]
    titles = _titles(catalog, mixed["feed"])
    assert "Pride and Prejudice" in titles
    assert "The Python Show" not in titles


def test_feed06_gardening_interest_has_no_catalog_match():
    catalog = load_seed()
    view = _discovery().discovery_dict(catalog, {"interests": ["gardening"], "items": []}, NOW)
    assert view["personalized"] is True
    assert view["feed"] == []
    assert view["why"] == {}
    assert view["paid_calls"] == 0
    assert all(group["matches"] == [] for group in view["sections"].values())
    assert len(view["sections"]["podcasts"]["browse"]) == 4


def test_feed07_no_interests_is_not_a_personalized_feed():
    catalog = load_seed()
    view = _discovery().discovery_dict(catalog, {"interests": [], "items": []}, NOW)
    assert view["personalized"] is False
    assert view["feed"] == []
    assert view["why"] == {}
    assert view["signals"] == []
    assert view["paid_calls"] == 0
    assert view["sections"]["podcasts"]["matches"] == []
    assert view["sections"]["podcasts"]["browse_count"] == 4
    assert view["sections"]["books"]["browse_count"] == 4
    assert view["sections"]["audiobooks"]["browse_count"] == 4
    assert view["sections"]["videos"]["browse"] == []
    assert view["sections"]["videos"]["match_count"] == 0


def test_demo_question_ranked_output_drops_the_python_show_and_episode():
    catalog = load_seed()
    view = _discovery().discovery_dict(
        catalog,
        {"interests": [catalog.demo_question], "items": []},
        NOW,
    )
    titles = _titles(catalog, view["feed"])
    assert "The Python Show" not in titles
    assert "The Future of Python Security: Trends, Challenges, and Solutions" not in titles
    assert PYTHON_SHOW not in view["feed"]
    assert PYTHON_EPISODE not in view["feed"]
    assert PYTHON_SHOW not in view["why"]
    assert PYTHON_EPISODE not in view["why"]
    podcasts = view["sections"]["podcasts"]
    assert PYTHON_SHOW not in podcasts["matches"]
    assert PYTHON_EPISODE not in podcasts["matches"]
    assert PYTHON_SHOW in podcasts["browse"]
    assert PYTHON_EPISODE in podcasts["browse"]
    assert podcasts["match_count"] == 2
    assert podcasts["browse_count"] == 2
    assert _counts(catalog, view["feed"]) == {
        "videos": 0,
        "podcasts": 2,
        "books": 4,
        "audiobooks": 4,
    }
    assert [view["sections"][name]["match_count"] for name in ("videos", "podcasts", "books", "audiobooks")] == [0, 2, 4, 4]
    assert [view["sections"][name]["browse_count"] for name in ("videos", "podcasts", "books", "audiobooks")] == [0, 2, 0, 0]
    assert view["feed"] == [item.item_id for item in catalog.feed((catalog.demo_question,), NOW).items]


def test_expired_catalog_evidence_is_hidden_from_the_feed_and_sections():
    catalog = _expire(load_seed(), PYTHON_SHOW, PAST)
    discovery = _discovery()
    ranked = discovery.discovery_dict(catalog, {"interests": ["python"], "items": []}, NOW)
    assert PYTHON_SHOW not in ranked["feed"]
    assert PYTHON_EPISODE in ranked["feed"]
    assert PYTHON_SHOW not in ranked["sections"]["podcasts"]["matches"]
    assert PYTHON_SHOW not in ranked["sections"]["podcasts"]["browse"]
    assert PYTHON_EPISODE in ranked["sections"]["podcasts"]["matches"]
    unranked = discovery.discovery_dict(catalog, {"interests": [], "items": []}, NOW)
    assert PYTHON_SHOW not in unranked["sections"]["podcasts"]["browse"]
    assert PYTHON_SHOW not in unranked["sections"]["podcasts"]["matches"]
    assert len(unranked["sections"]["podcasts"]["browse"]) == 3
    kept = discovery.discovery_dict(_expire(load_seed(), PYTHON_SHOW, FUTURE), {"interests": ["python"], "items": []}, NOW)
    assert PYTHON_SHOW in kept["feed"]
    assert PYTHON_SHOW in kept["sections"]["podcasts"]["matches"]
    boundary = discovery.discovery_dict(_expire(load_seed(), PYTHON_SHOW, NOW), {"interests": ["python"], "items": []}, NOW)
    assert PYTHON_SHOW not in boundary["feed"]
    assert PYTHON_SHOW not in boundary["sections"]["podcasts"]["matches"]
    assert PYTHON_SHOW not in boundary["sections"]["podcasts"]["browse"]


def test_feed10_matches_come_first_and_browse_has_no_why_line():
    catalog = load_seed()
    view = _discovery().discovery_dict(catalog, {"interests": ["jane austen"], "items": []}, NOW)
    podcasts = view["sections"]["podcasts"]
    assert podcasts["match_count"] == 2
    assert podcasts["browse_count"] == 2
    assert podcasts["matches"] == [item_id for item_id in view["feed"] if item_id in set(podcasts["matches"])]
    assert set(podcasts["matches"]).isdisjoint(podcasts["browse"])
    assert set(view["why"]) == set(view["feed"])
    assert set(podcasts["browse"]).isdisjoint(view["why"])
    assert set(podcasts["browse"]).isdisjoint(view["feed"])
    titles = _titles(catalog, podcasts["matches"])
    browse_titles = _titles(catalog, podcasts["browse"])
    assert "Jane Austen Stories" in titles
    assert "The Python Show" in browse_titles
    assert "The Python Show" not in titles


def test_feed06_zero_match_section_keeps_an_unranked_browse_group():
    catalog = load_seed()
    view = _discovery().discovery_dict(catalog, {"interests": ["gardening"], "items": []}, NOW)
    assert view["personalized"] is True
    assert view["feed"] == []
    assert view["why"] == {}
    podcasts = view["sections"]["podcasts"]
    assert podcasts["match_count"] == 0
    assert podcasts["browse_count"] == 4
    assert "The Python Show" in _titles(catalog, podcasts["browse"])
    assert all(item_id not in view["feed"] for item_id in podcasts["browse"])


def test_search07_audiobook_browse_is_not_a_ranked_match():
    catalog = load_seed()
    view = _discovery().discovery_dict(catalog, {"interests": ["python"], "items": []}, NOW)
    audio = view["sections"]["audiobooks"]
    assert audio["match_count"] == 0
    assert audio["browse_count"] == 4
    assert view["sections"]["podcasts"]["match_count"] == 2
    assert set(audio["browse"]).isdisjoint(view["feed"])
    assert set(audio["browse"]).isdisjoint(view["why"])
    assert all("Community evidence" not in lines for lines in view["why"].values())
