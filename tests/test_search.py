"""Tasks 4.1 and 4.2: the explicit focused Search.

JOB01-JOB04, JOB09, JOB10, and SEARCH01, SEARCH03-SEARCH05, SEARCH07-SEARCH09
against the deterministic stub provider. No test makes a live model or
paid-search call: the stub provider is local, and the live provider's only
fired path here is its fail-closed refusal or an injected offline transport.
`HACKERTUBE_MODEL_KEY` is never set and no credential file is read.
"""

import json
import sqlite3
from pathlib import Path

import pytest

from hackertube_core import outbound
from hackertube_core.catalog import load_catalog, load_seed
from hackertube_core.records import blank_art
from hackertube_core.search import (
    DEFAULT_LIMITS,
    DISCLOSURE,
    DisclosureRequired,
    Interpretation,
    Limits,
    ProviderUnavailable,
    StubProvider,
    canonical_question,
    interpret_question,
    result_set,
    run_search,
)
from hackertube_core.profile import ProfileStore

ROOT = Path(__file__).resolve().parents[1]
NOW = "2026-11-07T12:00:00Z"
ZERO = {"free": 0, "paid": 0, "metered": 0}
QUESTION = "What can I read or listen to by Jane Austen?"


def connect_at(root):
    """Stand-in for ``plugin_db``. It is not the production path."""
    path = Path(root) / "profile.db"
    path.parent.mkdir(parents=True, exist_ok=True)

    def connect():
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        return conn

    return connect


def store_at(tmp_path):
    return ProfileStore(connect_at(tmp_path))


def item(item_id, fmt, title, **overrides):
    row = {
        "item_id": item_id,
        "format": fmt,
        "title": title,
        "destination": "https://example.org/" + item_id.replace(":", "-"),
        "contributors": ["Jane Austen"],
        "duration_seconds": None,
        "availability": "public",
        "identifiers": [item_id],
        "show_id": None,
        "capture_order": 1,
        "captured_at": NOW,
        "art_reason": "no-art",
    }
    row.update(blank_art(row.pop("art_reason")))
    row.update(overrides)
    return row


def evidence(evidence_id, item_id, source_id="openlibrary", kind="catalog", **overrides):
    row = {
        "evidence_id": evidence_id,
        "item_id": item_id,
        "source_id": source_id,
        "retrieved_at": NOW,
        "destination": "https://example.org/e/" + evidence_id,
        "excerpt": None,
        "endorsement": "not_applicable",
        "kind": kind,
        "display_line": None,
        "refresh_after": None,
    }
    row.update(overrides)
    return row


def source(source_id, name, role="catalog"):
    return {
        "source_id": source_id,
        "name": name,
        "role": role,
        "enabled": True,
        "blocked_reason": None,
        "attribution": "Attribution text.",
        "retention": "Retention text.",
        "refresh": "Refresh text.",
        "deletion": "Deletion text.",
        "refresh_after": None,
        "last_success_at": None,
        "last_error": None,
        "formats": ["book", "audiobook", "podcast_show", "podcast_episode", "video"],
    }


def build(items, rows, sources):
    return load_catalog(
        {
            "schema": "hackertube.catalog/1",
            "demo_question": QUESTION,
            "formats_may_be_empty": ["videos"],
            "unavailable_videos": [],
            "items": items,
            "evidence": rows,
            "sources": sources,
            "editions": [],
        }
    )


def one_book(**overrides):
    """One verified book, plus nothing else."""
    row = item("ol:1", "book", "Gardening for Beginners", capture_order=1, **overrides)
    return build([row], [evidence("e1", "ol:1")], [source("openlibrary", "Open Library")])


def profile(interests=(), items=()):
    return {"schema": "hackertube.profile/1", "interests": list(interests), "items": list(items)}


# --- interpretation --------------------------------------------------------


def test_search01_the_demo_question_asks_for_read_and_listen_formats():
    reading = interpret_question(QUESTION)
    assert reading.topic == "jane austen"
    assert reading.terms == ("jane", "austen")
    assert reading.formats == ("book", "audiobook", "podcast_show", "podcast_episode")
    assert reading.max_duration_seconds is None
    assert reading.depth == "standard"


def test_interpretation_is_deterministic_and_reads_a_time_limit():
    assert interpret_question(QUESTION) == interpret_question(QUESTION)
    limited = interpret_question("What can I listen to about physics under 30 minutes?")
    assert limited.max_duration_seconds == 1800
    # A measure word is not a topic term, so it cannot match a title.
    assert "minutes" not in limited.terms
    assert interpret_question("watch a video about gardening").formats == ("video",)
    assert interpret_question("gardening books").formats == ("book",)


def test_canonical_question_refuses_an_empty_or_oversized_question():
    from hackertube_core.errors import RecordError

    for value in ("", "   ", "a" * 201, 17, None):
        with pytest.raises(RecordError):
            canonical_question(value)
    assert canonical_question("  gardening books  ") == "gardening books"
    # Markup is rendered to plain text, exactly like every other text field.
    assert canonical_question("<b>gardening</b> books") == "gardening books"


# --- SEARCH01 through SEARCH05, SEARCH07 through SEARCH09 ------------------


def test_search01_the_seed_question_returns_verified_candidates_per_section():
    catalog = load_seed()
    reading = interpret_question(QUESTION)
    found = result_set(catalog, profile(), reading, NOW)
    assert [row["item_id"] for row in found["results"]] == [
        "itunes:podcast:1840669662",
        "itunes:podcast:1788168257",
        "ol:OL66554W",
        "ol:OL66513W",
        "ol:OL66562W",
        "ol:OL66534W",
        "lv:253",
        "lv:86",
        "lv:620",
        "lv:219",
    ]
    counts = {name: group["verified_count"] for name, group in found["sections"].items()}
    assert counts == {"podcasts": 2, "books": 4, "audiobooks": 4}
    assert found["coverage"]["formats_without_match"] == []
    assert all(row["verified"] is True for row in found["results"])
    assert all(row["source"]["label"] for row in found["results"])


def test_search03_the_question_wins_over_stored_interests():
    """Technology interests must not add technology items to a gardening question."""
    catalog = build(
        [
            item("ol:1", "book", "Gardening for Beginners", capture_order=1),
            item("ol:2", "book", "Rust for Rustaceans", contributors=["Jon Gjengset"], capture_order=2),
        ],
        [evidence("e1", "ol:1"), evidence("e2", "ol:2")],
        [source("openlibrary", "Open Library")],
    )
    reading = interpret_question("gardening books")
    with_tech = result_set(catalog, profile(interests=("technology", "rust")), reading, NOW)
    without = result_set(catalog, profile(), reading, NOW)
    assert [row["item_id"] for row in with_tech["results"]] == ["ol:1"]
    assert [row["item_id"] for row in without["results"]] == ["ol:1"]
    assert with_tech["results"] == without["results"]


def test_search04_unknown_duration_under_a_limit_is_unverified_and_not_strict():
    catalog = build(
        [
            item("ol:1", "book", "Austen Short", capture_order=1, duration_seconds=600),
            item("ol:2", "book", "Austen Unknown", capture_order=2, duration_seconds=None),
            item("ol:3", "book", "Austen Long", capture_order=3, duration_seconds=7200),
        ],
        [evidence("e1", "ol:1"), evidence("e2", "ol:2"), evidence("e3", "ol:3")],
        [source("openlibrary", "Open Library")],
    )
    found = result_set(catalog, profile(), interpret_question("austen books under 30 minutes"), NOW)
    by_id = {row["item_id"]: row for row in found["results"]}
    assert by_id["ol:1"]["constraint"] == "within"
    assert by_id["ol:1"]["strict"] is True
    assert by_id["ol:2"]["constraint"] == "unverified"
    assert by_id["ol:2"]["strict"] is False
    assert "Unverified against the 30 minutes limit" in by_id["ol:2"]["constraint_note"]
    assert "ol:3" not in by_id
    assert found["coverage"]["excluded_over_duration"] == 1


def test_search05_a_broader_web_record_is_labeled_without_community_endorsement():
    catalog = build(
        [item("ol:1", "book", "Austen on the Web", capture_order=1)],
        [evidence("e1", "ol:1", source_id="example", kind="web")],
        [source("example", "Example Blog")],
    )
    found = result_set(catalog, profile(), interpret_question("austen books"), NOW)
    assert len(found["results"]) == 1
    label = found["results"][0]["source"]
    assert label["label"] == "Web: Example Blog"
    assert label["community_endorsement"] is False
    assert label["kind"] == "web"


def test_search07_a_format_with_no_verified_record_reports_insufficient_evidence():
    catalog = one_book()
    found = result_set(catalog, profile(), interpret_question(QUESTION), NOW)
    assert found["sections"]["books"]["verified_count"] == 1
    assert found["sections"]["books"]["insufficient_evidence"] is False
    audiobooks = found["sections"]["audiobooks"]
    assert audiobooks["verified_count"] == 0
    assert audiobooks["insufficient_evidence"] is True
    assert audiobooks["note"] == "No verified audiobooks match for this question."
    assert found["sections"]["podcasts"]["insufficient_evidence"] is True
    assert found["coverage"]["formats_without_match"] == ["podcasts", "audiobooks"]


def test_search07_a_candidate_whose_record_has_expired_is_not_a_result():
    """Verification: a candidate needs an unexpired retrieved record.

    ``refresh_after`` in the past drops the record, so the item is a
    candidate with no supporting record and is not admitted.
    """
    catalog = build(
        [
            item("ol:1", "book", "Austen Verified", capture_order=1),
            item("ol:2", "book", "Austen Expired", capture_order=2),
        ],
        [
            evidence("e1", "ol:1"),
            evidence("e2", "ol:2", refresh_after="2026-11-06T00:00:00Z"),
        ],
        [source("openlibrary", "Open Library")],
    )
    found = result_set(catalog, profile(), interpret_question("austen books"), NOW)
    assert [row["item_id"] for row in found["results"]] == ["ol:1"]
    assert found["coverage"]["unverified_candidates"] == 1


def test_search08_a_saved_or_completed_result_keeps_its_recorded_state():
    catalog = one_book()
    saved = profile(items=[{"item_id": "ol:1", "saved": True, "completed": True,
                            "dismissed": False, "saved_order": 1, "opens": ["2026-11-07T10:00:00Z"]}])
    found = result_set(catalog, profile(), interpret_question("gardening books"), NOW)
    assert found["results"][0]["state"]["label"] is None
    with_state = result_set(catalog, saved, interpret_question("gardening books"), NOW)
    assert with_state["results"][0]["state"] == {
        "saved": True,
        "dismissed": False,
        "completed": True,
        "opens": 1,
        "label": "Saved",
    }


def test_search08_opening_a_result_does_not_change_completion(tmp_path):
    store = store_at(tmp_path)
    store.save_item("ol:1", known_ids={"ol:1"})
    before = store.snapshot()
    store.record_open("ol:1", known_ids={"ol:1"})
    after = store.snapshot()
    assert len(after["items"][0]["opens"]) == len(before["items"][0]["opens"]) + 1
    assert after["items"][0]["completed"] is False
    assert before["items"][0]["completed"] is False
    assert after["items"][0]["saved"] is True


def test_search11_default_excludes_a_dismissed_item_and_labels_it_out():
    catalog = one_book()
    dismissed = profile(items=[{"item_id": "ol:1", "saved": False, "completed": False,
                               "dismissed": True, "saved_order": None, "opens": []}])
    found = result_set(catalog, dismissed, interpret_question("gardening books"), NOW)
    assert found["results"] == []
    assert found["coverage"]["excluded_dismissed"] == 1


def test_search09_a_search_does_not_edit_interests(tmp_path):
    store = store_at(tmp_path)
    store.add_interest("gardening")
    provider = StubProvider()
    run_search(
        store,
        "rust books",
        catalog=one_book(),
        profile=store.snapshot(),
        now=NOW,
        provider=provider,
        disclosure_accepted=True,
    )
    assert store.interest_texts() == ("gardening",)


# --- JOB01 through JOB04, JOB09, JOB10 ------------------------------------


def test_job01_one_explicit_search_records_a_bounded_succeeded_job(tmp_path):
    store = store_at(tmp_path)
    result = run_search(
        store,
        QUESTION,
        catalog=load_seed(),
        profile=store.snapshot(),
        now=NOW,
        provider=StubProvider(),
        disclosure_accepted=True,
    )
    job = result["job"]
    assert job["job_id"] == "job:1"
    assert job["kind"] == "search"
    assert job["state"] == "succeeded"
    assert job["provider"] == "stub"
    assert job["limits"] == DEFAULT_LIMITS.as_dict()
    assert job["limits"] == {"max_hits": 12, "max_requests": 2, "deadline_seconds": 5}
    assert job["result_count"] == 10
    assert store.job_count() == 1
    assert store.latest_job()["job_id"] == "job:1"
    assert result["request_counts"] == ZERO
    assert result["usage"]["paid_calls"] == 0
    assert result["disclosure"] == DISCLOSURE


def test_job03_a_truncated_run_stops_labeled_partial_with_partial_results(tmp_path):
    store = store_at(tmp_path)
    result = run_search(
        store,
        QUESTION,
        catalog=load_seed(),
        profile=store.snapshot(),
        now=NOW,
        provider=StubProvider(truncated=True),
        disclosure_accepted=True,
    )
    job = result["job"]
    assert job["state"] == "partial"
    assert result["coverage"]["limit_reached"] is True
    assert any("work limit" in note for note in result["coverage"]["notes"])
    assert job["result_count"] > 0, "partial results are still reported"
    assert store.latest_job()["state"] == "partial"


def test_job03_a_deadline_is_enforced_by_bounded_limits(tmp_path):
    store = store_at(tmp_path)
    ticks = iter([0.0, 9.0])
    result = run_search(
        store,
        QUESTION,
        catalog=load_seed(),
        profile=store.snapshot(),
        now=NOW,
        provider=StubProvider(),
        limits=Limits(max_hits=5, max_requests=2, deadline_seconds=1),
        disclosure_accepted=True,
        clock=lambda: next(ticks),
    )
    assert result["job"]["state"] == "partial"
    assert any("deadline" in note for note in result["coverage"]["notes"])
    assert result["job"]["limits"]["deadline_seconds"] == 1


def test_job04_a_provider_that_reports_no_cost_is_unknown_never_zero(tmp_path):
    store = store_at(tmp_path)
    result = run_search(
        store,
        QUESTION,
        catalog=load_seed(),
        profile=store.snapshot(),
        now=NOW,
        provider=StubProvider(),
        disclosure_accepted=True,
    )
    usage = result["usage"]
    assert usage["cost_usd"] is None
    assert usage["cost_known"] is False
    assert usage["cost_usd"] != 0
    assert result["job"]["cost_usd"] is None
    assert result["job"]["cost_known"] is False
    assert store.latest_job()["cost_known"] is False


def test_job04_a_provider_reported_cost_is_kept(tmp_path):
    store = store_at(tmp_path)
    result = run_search(
        store,
        "gardening books",
        catalog=one_book(),
        profile=store.snapshot(),
        now=NOW,
        provider=StubProvider(cost=0.125),
        disclosure_accepted=True,
    )
    assert result["usage"] == {
        "cost_usd": 0.125,
        "cost_known": True,
        "requests_used": 1,
        "request_counts": ZERO,
        "paid_calls": 0,
    }
    assert store.latest_job()["cost_usd"] == 0.125


def test_job04_a_non_numeric_cost_is_unknown_never_zero(tmp_path):
    for cost in ("0.125", True, {"usd": 1}):
        store = store_at(tmp_path / type(cost).__name__)
        result = run_search(
            store,
            "gardening books",
            catalog=one_book(),
            profile=store.snapshot(),
            now=NOW,
            provider=StubProvider(cost=cost),
            disclosure_accepted=True,
        )
        assert result["usage"]["cost_usd"] is None
        assert result["usage"]["cost_known"] is False
        assert result["usage"]["cost_usd"] != 0
        assert result["job"]["cost_usd"] is None
        assert result["job"]["cost_known"] is False
        assert store.latest_job()["cost_usd"] is None
        assert store.latest_job()["cost_known"] is False


def test_job04_a_non_numeric_rank_cost_keeps_the_total_unknown(tmp_path):
    class Ranked(StubProvider):
        def rank(self, question, catalog, timeout):
            return {}, "0.02"

    def retrieve(interpretation, now, budget):
        return one_book(), []

    result = run_search(
        store_at(tmp_path),
        "gardening books",
        catalog=one_book(),
        profile=profile(),
        now=NOW,
        provider=Ranked(cost=0.01),
        retriever=retrieve,
        disclosure_accepted=True,
    )
    assert result["usage"]["cost_usd"] is None
    assert result["usage"]["cost_known"] is False
    assert result["job"]["cost_known"] is False


def test_skipped_sources_are_named_in_plain_language(tmp_path):
    def retrieve(interpretation, now, budget):
        return one_book(), [
            {"source_id": "podcastindex", "state": "unavailable", "reason": "missing_api_key"},
            {"source_id": "reddit", "state": "unavailable", "reason": "approval_absent"},
            {"source_id": "youtube", "state": "unavailable", "reason": "missing_api_key"},
            {"source_id": "web", "state": "unavailable", "reason": "host_search_unavailable"},
            {"source_id": "hn", "state": "failed", "error": "source request failed"},
            {"source_id": "itunes", "state": "limit"},
            {"source_id": "openlibrary", "state": "partial"},
            {
                "source_id": "ranking",
                "state": "partial",
                "error": "Some invalid ranking entries were ignored; valid matches are retained.",
            },
            {"source_id": "librivox", "state": "skipped", "reason": "disabled"},
        ]

    result = run_search(
        store_at(tmp_path),
        "gardening books",
        catalog=one_book(),
        profile=profile(),
        now=NOW,
        provider=StubProvider(),
        retriever=retrieve,
        disclosure_accepted=True,
    )
    notes = result["coverage"]["notes"]
    assert (
        "Not searched: Podcast Index (needs its own API key), Reddit (not approved), "
        "YouTube (needs its own API key), Broader web (host search is unavailable)."
    ) in notes
    assert "Failed: Hacker News (request failed)." in notes
    assert (
        "Incomplete: Apple Podcasts / Apple Books (reached the work limit), "
        "Open Library (finished only in part), Ranking (some invalid ranking entries were ignored)."
    ) in notes
    blob = " ".join(notes)
    for raw in ("podcastindex", "missing_api_key", "approval_absent", "librivox", "host_search_unavailable"):
        assert raw not in blob


def test_job09_no_accepted_disclosure_starts_no_job_and_no_provider_call(tmp_path):
    store = store_at(tmp_path)
    provider = StubProvider()
    for body in ({}, {"disclosure_accepted": False}, {"disclosure_accepted": "yes"}):
        with pytest.raises(DisclosureRequired):
            run_search(
                store,
                QUESTION,
                catalog=load_seed(),
                profile=store.snapshot(),
                now=NOW,
                provider=provider,
                disclosure_accepted=body.get("disclosure_accepted"),
            )
    assert store.job_count() == 0, "a refused submit records no job"
    assert outbound.counters() == ZERO


def test_job10_a_later_search_needs_the_disclosure_again(tmp_path):
    store = store_at(tmp_path)
    first = run_search(
        store,
        "gardening books",
        catalog=one_book(),
        profile=store.snapshot(),
        now=NOW,
        provider=StubProvider(),
        disclosure_accepted=True,
    )
    assert first["job"]["job_id"] == "job:1"
    with pytest.raises(DisclosureRequired):
        run_search(
            store,
            "austen books",
            catalog=one_book(),
            profile=store.snapshot(),
            now=NOW,
            provider=StubProvider(),
            disclosure_accepted=False,
        )
    assert store.job_count() == 1


def test_provider_failure_paths_record_a_failed_job_without_a_call(tmp_path):
    for provider, marker in (
        (StubProvider(fail="timeout"), "timeout"),
        (StubProvider(fail="error"), "provider error"),
    ):
        store = store_at(tmp_path / marker.replace(" ", "-"))
        result = run_search(
            store,
            QUESTION,
            catalog=load_seed(),
            profile=store.snapshot(),
            now=NOW,
            provider=provider,
            disclosure_accepted=True,
        )
        assert result["job"]["state"] == "failed"
        assert result["results"] == []
        assert result["sections"] == {}
        assert any(marker in note for note in result["coverage"]["notes"])
        assert result["usage"]["paid_calls"] == 0


# --- Hermes owns model routing/auth; no plugin-owned model credentials ---


def test_missing_hermes_service_refuses_before_outbound_call(tmp_path, monkeypatch):
    from hackertube_core.hermes import HermesProvider
    monkeypatch.setattr('hackertube_core.hermes.handler',lambda:None)
    outbound.reset()
    store = store_at(tmp_path)
    with pytest.raises(ProviderUnavailable):
        run_search(store, QUESTION, catalog=load_seed(), profile=store.snapshot(), now=NOW,
                   provider=HermesProvider(), disclosure_accepted=True)
    assert outbound.counters() == ZERO
    assert store.job_count() == 0


def test_host_completion_is_counted_once_and_unknown_cost_stays_unknown(tmp_path):
    from hackertube_core.hermes import HermesProvider
    outbound.reset()
    def invoke(raw):
        assert outbound.LEDGER.in_flight == 1
        return {'data':{'topic':'jane austen','terms':['jane','austen'],'formats':[]},'cost_usd':None}
    store = store_at(tmp_path)
    result = run_search(store, QUESTION, catalog=load_seed(),profile=store.snapshot(),now=NOW,
                        provider=HermesProvider(invoke),disclosure_accepted=True)
    assert result['usage']['cost_known'] is False
    assert result['usage']['cost_usd'] is None
    assert result['usage']['request_counts']=={'free':0,'paid':1,'metered':0}
    assert result['usage']['paid_calls']==1


def test_the_stub_provider_is_deterministic_across_runs(tmp_path):
    first = run_search(
        store_at(tmp_path / "one"),
        QUESTION,
        catalog=load_seed(),
        profile=profile(),
        now=NOW,
        provider=StubProvider(),
        disclosure_accepted=True,
    )
    second = run_search(
        store_at(tmp_path / "two"),
        QUESTION,
        catalog=load_seed(),
        profile=profile(),
        now=NOW,
        provider=StubProvider(),
        disclosure_accepted=True,
    )
    assert [row["item_id"] for row in first["results"]] == [
        row["item_id"] for row in second["results"]
    ]
    assert first["interpretation"] == second["interpretation"]
    assert first["job"]["state"] == second["job"]["state"] == "succeeded"


def test_a_scripted_stub_answers_the_demo_question_from_its_own_reading():
    scripted = Interpretation(
        question=QUESTION,
        topic="austen",
        terms=("austen",),
        formats=("book",),
        depth="brief",
        max_duration_seconds=None,
    )
    outcome = StubProvider(script={QUESTION: scripted}).interpret(QUESTION, DEFAULT_LIMITS)
    assert outcome.interpretation == scripted
    assert outcome.cost_usd is None


def test_an_honest_empty_result_is_reported_rather_than_filled():
    catalog = load_seed()
    found = result_set(catalog, profile(), interpret_question("quantum welding"), NOW)
    assert found["results"] == []
    assert found["coverage"]["verified"] == 0
    assert found["coverage"]["candidates"] == 0


def test_the_limits_bound_the_result_count(tmp_path):
    store = store_at(tmp_path)
    result = run_search(
        store,
        QUESTION,
        catalog=load_seed(),
        profile=store.snapshot(),
        now=NOW,
        provider=StubProvider(),
        limits=Limits(max_hits=3, max_requests=2, deadline_seconds=5),
        disclosure_accepted=True,
    )
    assert len(result["results"]) == 3
    assert result["job"]["limits"]["max_hits"] == 3
    assert result["job"]["result_count"] == 3


def test_the_search_module_keeps_the_disclosure_text_and_the_page_together():
    page = (ROOT / "hackertube" / "dashboard" / "dist" / "index.js").read_text(encoding="utf-8")
    for line in page.splitlines():
        if line.strip().startswith("var DISCLOSURE = "):
            declared = line.split("var DISCLOSURE = ", 1)[1].strip().rstrip(";").strip('"')
            assert declared == DISCLOSURE
            break
    else:  # pragma: no cover - the page must declare it
        raise AssertionError("the page no longer declares DISCLOSURE")


def test_the_search_module_never_opens_a_credential_file():
    """The declared secret is read through secret scope only."""
    source = (ROOT / "hackertube" / "hackertube_core" / "search.py").read_text(encoding="utf-8")
    for forbidden in ("auth.json", "os.environ", "load_env_file", "keychain", "import sqlite3"):
        assert forbidden not in source, f"search.py mentions {forbidden}"
    assert "HACKERTUBE_MODEL_KEY" not in source
    assert "get_secret" not in source
