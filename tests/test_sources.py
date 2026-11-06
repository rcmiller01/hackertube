"""Task 2.3: source ingestion, per-source status, and source controls.

PREF02, PREF03, PREF04, PREF14, and CAT05. A failing source records its
own error and does not stop the others. Duplicate identities across
sources collapse into one item that keeps every source's evidence.
"""

import json
import socket
import sqlite3
from pathlib import Path

import pytest

from hackertube_core import outbound, sources
from hackertube_core.adapters import REGISTRY, hn, itunes, librivox, openlibrary
from hackertube_core.adapters.base import ParseResult
from hackertube_core.errors import RecordError
from hackertube_core.http import HttpError, read_json
from hackertube_core.profile import ProfileStore
from hackertube_core.records import Evidence, MediaItem, blank_art
from hackertube_core.sources import (
    BROADER_SEARCH_NOTE,
    configure_source,
    ingest,
    merge_duplicates,
    source_snapshot,
)

NOW = "2026-11-06T12:24:15Z"
LATER = "2026-11-06T13:00:00Z"
ROOT = Path(__file__).resolve().parents[1]


def local_connect(root):
    """Test opener. It is not the production path and it does not set WAL."""
    path = Path(root) / "profile.db"
    path.parent.mkdir(parents=True, exist_ok=True)

    def connect():
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    return connect


def store_at(root):
    return ProfileStore(local_connect(root))


def _item(item_id, fmt, title, contributors, identifiers, order=1):
    return MediaItem(
        item_id=item_id,
        format=fmt,
        title=title,
        destination="https://example.com/" + item_id.replace(":", "-"),
        contributors=contributors,
        duration_seconds=None,
        availability=None,
        identifiers=identifiers,
        show_id=None,
        capture_order=order,
        captured_at=NOW,
        **blank_art("test"),
    )


def _evidence(evidence_id, item_id, source_id):
    return Evidence(
        evidence_id=evidence_id,
        item_id=item_id,
        source_id=source_id,
        retrieved_at=NOW,
        destination="https://example.com/" + item_id.replace(":", "-"),
        excerpt=None,
        endorsement="not_applicable",
        kind="catalog",
        display_line=None,
        refresh_after=None,
    )


def _ok(source_id, item_id, fmt="book"):
    def fetch(query, now):
        item = _item(item_id, fmt, f"Title {item_id}", ("An Author",), (item_id,))
        return ParseResult((item,), (_evidence(item_id, item_id, source_id),), (), ())

    return fetch


def _resolve(host, port, *args, **kwargs):
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", 0))]


class _Response:
    status = 200

    def __init__(self, body):
        self._body = body

    def read(self, limit):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def _opener(body=b'{"ok": true}'):
    class Opener:
        def open(self, request, timeout=None):
            return _Response(body)

    return Opener()


def test_pref02_enabling_a_community_and_adding_a_feed_persists(tmp_path):
    store = store_at(tmp_path)
    status, payload = configure_source(store, "hn", True)
    assert status == 200
    assert payload["schema"] == "hackertube.sources/1"
    status, payload = configure_source(store, "itunes", True)
    assert status == 200

    again = store_at(tmp_path)
    view = {row["source_id"]: row for row in source_snapshot(again)["sources"]}
    assert view["hn"]["enabled"] is True
    assert view["itunes"]["enabled"] is True
    assert view["itunes"]["last_success_at"] is None
    assert view["itunes"]["last_error"] is None
    assert view["itunes"]["role"] == "catalog"


def test_pref03_unsupported_source_is_reported_and_not_enabled(tmp_path):
    store = store_at(tmp_path)
    status, payload = configure_source(store, "mastodon", True)
    assert status == 400
    assert payload == {"error": "unsupported_source"}
    assert "mastodon" not in store.source_settings()
    assert "mastodon" not in {row["source_id"] for row in source_snapshot(store)["sources"]}

    status, payload = configure_source(store, "reddit", True)
    assert status == 409
    assert payload["error"] == "blocked"
    assert payload["blocked_reason"] == "approval_absent"
    assert store.source_settings().get("reddit") is not True


def test_pref04_disabling_a_feed_stops_ingestion_and_explains_broader_search(tmp_path):
    store = store_at(tmp_path)
    status, _payload = configure_source(store, "itunes", False)
    assert status == 200
    calls = []

    def fetcher(source_id):
        def fetch(query, now):
            calls.append(source_id)
            return ParseResult((), (), (), ())

        return fetch

    fetchers = {sid: fetcher(sid) for sid in ("hn", "itunes", "openlibrary", "librivox")}
    report = ingest(store, NOW, "jane austen", fetchers=fetchers)
    assert "itunes" not in calls
    row = {r["source_id"]: r for r in report["sources"]}["itunes"]
    assert row["enabled"] is False
    assert BROADER_SEARCH_NOTE in row["control_note"]


def test_pref14_a_failed_source_shows_its_error_without_breaking_others(tmp_path):
    store = store_at(tmp_path)

    def bad(query, now):
        raise HttpError("http 500")

    fetchers = {
        "hn": _ok("hn", "hn:1"),
        "itunes": bad,
        "openlibrary": _ok("openlibrary", "ol:OL1W"),
        "librivox": _ok("librivox", "lv:1", "audiobook"),
    }
    report = ingest(store, NOW, "jane austen", fetchers=fetchers)
    rows = {r["source_id"]: r for r in report["sources"]}
    assert rows["itunes"]["last_error"] == "http 500"
    assert rows["itunes"]["last_success_at"] is None
    assert rows["hn"]["last_success_at"] == NOW
    assert rows["hn"]["last_error"] is None
    assert len(report["items"]) == 3

    report = ingest(store, LATER, "jane austen", fetchers={**fetchers, "itunes": _ok("itunes", "itunes:1")})
    rows = {r["source_id"]: r for r in report["sources"]}
    assert rows["itunes"]["last_error"] is None
    assert rows["itunes"]["last_success_at"] == LATER
    assert rows["hn"]["last_success_at"] == LATER


def test_cat05_duplicate_identities_collapse_and_keep_evidence():
    book_a = _item("ol:OL1W", "book", "Pride and Prejudice", ("Jane Austen",), ("ol:OL1W", "gutenberg:1342"))
    book_b = _item(
        "itunes:audiobook:9", "book", "Pride and Prejudice", ("Jane Austen",), ("itunes:audiobook:9", "gutenberg:1342")
    )
    ev_a = _evidence("ol:OL1W", "ol:OL1W", "openlibrary")
    ev_b = _evidence("itunes:audiobook:9", "itunes:audiobook:9", "itunes")
    items, evidence = merge_duplicates((book_a, book_b), (ev_a, ev_b))
    assert len(items) == 1
    assert items[0].item_id == "ol:OL1W"
    assert items[0].capture_order == 1
    assert {row.source_id for row in evidence} == {"openlibrary", "itunes"}
    assert all(row.item_id == "ol:OL1W" for row in evidence)


def test_cat05_ingest_merges_duplicate_identities_across_sources(tmp_path):
    """The merge has to run in the ingest path, not only when called directly.

    Calling ``merge_duplicates`` on its own stays green if ``ingest`` stops
    calling it, so this test drives two sources returning the same identity
    through ``ingest`` and asserts the single merged item plus both evidence
    rows. Removing the merge call from ``ingest`` makes it fail.
    """
    store = store_at(tmp_path)
    itunes_book = _item(
        "itunes:audiobook:9",
        "book",
        "Pride and Prejudice",
        ("Jane Austen",),
        ("itunes:audiobook:9", "gutenberg:1342"),
    )
    openlibrary_book = _item(
        "ol:OL1W", "book", "Pride and Prejudice", ("Jane Austen",), ("ol:OL1W", "gutenberg:1342")
    )
    two_sources = {"itunes": REGISTRY["itunes"], "openlibrary": REGISTRY["openlibrary"]}

    def itunes_fetch(query, now):
        return ParseResult(
            (itunes_book,), (_evidence("itunes:audiobook:9", "itunes:audiobook:9", "itunes"),), (), ()
        )

    def openlibrary_fetch(query, now):
        return ParseResult(
            (openlibrary_book,), (_evidence("ol:OL1W", "ol:OL1W", "openlibrary"),), (), ()
        )

    report = ingest(
        store,
        NOW,
        "jane austen",
        fetchers={"itunes": itunes_fetch, "openlibrary": openlibrary_fetch},
        registry=two_sources,
    )

    rows = {row["source_id"]: row for row in report["sources"]}
    assert rows["itunes"]["last_success_at"] == NOW
    assert rows["openlibrary"]["last_success_at"] == NOW

    assert len(report["items"]) == 1
    kept = report["items"][0]
    assert kept.item_id == "itunes:audiobook:9"
    assert kept.capture_order == 1

    assert len(report["evidence"]) == 2
    assert {row.source_id for row in report["evidence"]} == {"itunes", "openlibrary"}
    assert all(row.item_id == kept.item_id for row in report["evidence"])


def test_cat05_does_not_collapse_a_book_and_its_audiobook():
    book = _item("ol:OL1W", "book", "Pride and Prejudice", ("Jane Austen",), ("ol:OL1W", "gutenberg:1342"))
    audio = _item("lv:86", "audiobook", "Pride and Prejudice", ("Jane Austen",), ("lv:86", "gutenberg:1342"))
    items, _evidence_rows = merge_duplicates((book, audio), ())
    assert len(items) == 2
    assert [item.format for item in items] == ["book", "audiobook"]


def test_ingestion_goes_through_the_boundary_and_makes_no_paid_call(tmp_path, monkeypatch):
    outbound.install_guard(monkeypatch)
    outbound.reset()
    store = store_at(tmp_path)

    def fetch(query, now):
        assert read_json(
            "https://example.com/data",
            classification=outbound.FREE,
            opener=_opener(),
            resolve=_resolve,
        ) == {"ok": True}
        return ParseResult((), (), (), ())

    report = ingest(store, NOW, "jane austen", fetchers={"hn": fetch}, registry={"hn": REGISTRY["hn"]})
    assert report["request_counts"] == {"free": 1, "paid": 0, "metered": 0}
    assert outbound.counters() == {"free": 1, "paid": 0, "metered": 0}
    assert outbound.usage()["cost_usd"] == 0.0


def test_ingest_surfaces_a_source_read_that_omits_its_classification(tmp_path):
    """A read with no classification is a bug, not a source outage.

    ``read_json`` requires an explicit classification, so a fetcher that
    omits it raises ``TypeError``. ``ingest`` must let that surface (fail
    the test) instead of recording it as a quiet per-source error and
    carrying on, which would hide a mis-wired source behind a source-down
    status the reader would read as a network problem.
    """
    store = store_at(tmp_path)
    only = {"hn": REGISTRY["hn"]}

    def fetch(query, now):
        read_json("https://example.com/data", opener=_opener(), resolve=_resolve)  # type: ignore[call-arg]
        return ParseResult((), (), (), ())

    with pytest.raises(TypeError):
        ingest(store, NOW, "jane austen", fetchers={"hn": fetch}, registry=only)
    assert store.source_statuses().get("hn") is None


def test_disabled_sources_are_never_fetched(tmp_path):
    store = store_at(tmp_path)
    calls = []

    def fetch(query, now):
        calls.append(1)
        return ParseResult((), (), (), ())

    report = ingest(
        store,
        NOW,
        "jane austen",
        fetchers={sid: fetch for sid in ("reddit", "youtube", "podcastindex")},
    )
    assert calls == []
    rows = {r["source_id"]: r for r in report["sources"]}
    assert rows["reddit"]["blocked_reason"] == "approval_absent"
    assert rows["youtube"]["blocked_reason"] == "unresolved-terms"
    assert rows["podcastindex"]["blocked_reason"] == "missing_api_key"
    assert rows["reddit"]["last_attempt_at"] is None


def test_source_storage_uses_the_profile_store_not_raw_sqlite():
    source = Path(sources.__file__).read_text(encoding="utf-8")
    assert "import sqlite3" not in source
    assert "sqlite3.connect" not in source
    profile = (ROOT / "hackertube_core" / "profile.py").read_text(encoding="utf-8")
    assert "sqlite3.connect" not in profile
    api = (ROOT / "hackertube" / "dashboard" / "plugin_api.py").read_text(encoding="utf-8")
    assert "sqlite3.connect" not in api


@pytest.mark.parametrize(
    "module,args",
    [
        (hn, ("jane austen",)),
        (itunes, ("jane austen",)),
        (openlibrary, ("jane austen",)),
        (librivox, ("jane austen",)),
    ],
)
def test_each_enabled_adapter_fetch_goes_through_the_boundary(module, args):
    outbound.reset()
    seen = {}

    class Opener:
        def open(self, request, timeout=None):
            seen["url"] = request.full_url
            return _Response(b'{"ok": true}')

    payload = module.fetch_search(*args, opener=Opener(), resolve=_resolve)
    assert payload == {"ok": True}
    assert seen["url"].startswith("https://")
    assert outbound.counters() == {"free": 1, "paid": 0, "metered": 0}


def test_librivox_and_openlibrary_fetch_use_the_captured_endpoints():
    """The live probe found a 404 on a trailing slash. Pin the real paths."""
    seen = {}

    class Opener:
        def open(self, request, timeout=None):
            seen[request.full_url.split("?")[0]] = request.full_url
            return _Response(b'{"books": [], "docs": []}')

    librivox.fetch_search("Austen", opener=Opener(), resolve=_resolve)
    openlibrary.fetch_search("jane austen", opener=Opener(), resolve=_resolve)
    assert "https://librivox.org/api/feed/audiobooks" in seen
    assert "https://openlibrary.org/search.json" in seen
    assert "fields=" in seen["https://librivox.org/api/feed/audiobooks"]
    assert "fields=" in seen["https://openlibrary.org/search.json"]


def test_librivox_no_match_is_an_empty_result_not_a_source_error(tmp_path, monkeypatch):
    """LibriVox answers 404 for an author with no recordings."""
    store = store_at(tmp_path)
    only = {"librivox": REGISTRY["librivox"]}

    def not_found(query, **kwargs):
        raise HttpError("http 404")

    monkeypatch.setattr(librivox, "fetch_search", not_found)
    report = ingest(store, NOW, "jane austen", fetchers={"librivox": sources.FETCHERS["librivox"]}, registry=only)
    row = report["sources"][0]
    assert row["last_error"] is None
    assert row["last_success_at"] == NOW
    assert report["items"] == ()

    def server_error(query, **kwargs):
        raise HttpError("http 500")

    monkeypatch.setattr(librivox, "fetch_search", server_error)
    report = ingest(store, LATER, "jane austen", fetchers={"librivox": sources.FETCHERS["librivox"]}, registry=only)
    assert report["sources"][0]["last_error"] == "http 500"


def test_adapter_fetch_refuses_an_empty_query():
    for module in (hn, itunes, openlibrary, librivox):
        with pytest.raises(RecordError):
            module.fetch_search("   ", opener=_opener(), resolve=_resolve)
