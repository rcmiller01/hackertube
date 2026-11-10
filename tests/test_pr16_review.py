"""Regression cases found while reviewing dca17be7f0a6a77759397ffcbc61d0de7cbf684d."""

import json
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace

import pytest

from hackertube_core import outbound
from hackertube_core.catalog_store import without_expired
from hackertube_core.hermes import HermesProvider
from hackertube_core.http import HttpError
from hackertube_core.retrieval import Budget, SourceRetriever
from hackertube_core.search import (
    LIVE_LIMITS,
    ProviderOutcome,
    StubProvider,
    interpret_question,
    run_search,
)
from test_search import NOW, build, evidence, item, one_book, profile, source, store_at
from test_retrieval import public_read


def test_community_mention_cannot_extend_youtube_metadata_retention():
    video = item("youtube:LCEmiRjPEtQ", "video", "Expired YouTube title")
    cat = build(
        [video],
        [
            evidence(
                "youtube:LCEmiRjPEtQ",
                video["item_id"],
                "youtube",
                refresh_after="2026-11-08T00:00:00Z",
            ),
            evidence(
                "hn:123",
                video["item_id"],
                "hn",
                kind="community",
                endorsement="mention",
            ),
        ],
        [source("youtube", "YouTube"), source("hn", "Hacker News", role="community")],
    )
    active = without_expired(cat, "2026-11-09T00:00:00Z")
    assert not active.items
    assert not active.evidence, "Discard evidence pointing to purged metadata too"


def test_stored_youtube_thumbnail_url_is_dropped_at_the_30_day_read_boundary():
    """Developer Policies III.E.4.d: metadata and its thumbnail URL age together.

    The adapter sets ``refresh_after = retrieved_at + 30 days`` on the YouTube
    catalog evidence and stores the hotlinked thumbnail URL on the same item.
    ``without_expired`` is the read-time filter every profile read runs
    (``profile.py`` uses it for the catalog and the stored search), so the URL is
    served only while its metadata is unexpired and disappears with the item at
    the deadline -- it is dropped at read time, never refreshed in place.
    """
    thumb = "https://i.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg"
    video = item(
        "youtube:LCEmiRjPEtQ",
        "video",
        "Gardening lesson",
        art_url=thumb,
        art_hotlink=True,
        art_cache=False,
        art_checked_at="2026-11-06T12:22:23Z",
        art_http_status=200,
    )
    cat = build(
        [video],
        [
            evidence(
                "youtube:LCEmiRjPEtQ",
                video["item_id"],
                "youtube",
                refresh_after="2026-12-06T12:22:23Z",
            )
        ],
        [source("youtube", "YouTube")],
    )
    fresh = without_expired(cat, "2026-12-06T12:22:22Z")
    assert [row.art_url for row in fresh.items] == [thumb], (
        "a stored thumbnail URL is served while its metadata is within 30 days"
    )
    expired = without_expired(cat, "2026-12-06T12:22:23Z")
    assert not expired.items, "at the 30-day deadline the item is dropped, not refreshed in place"
    assert not expired.evidence
    assert all(row.art_url != thumb for row in expired.items), (
        "the stored thumbnail URL leaves with the expired metadata"
    )


def test_failed_paid_web_attempt_keeps_total_cost_unknown(tmp_path):
    def invoke(raw):
        if json.loads(raw)["stage"] == "interpret":
            return {
                "data": {
                    "topic": "gardening",
                    "terms": ["gardening"],
                    "formats": ["book"],
                },
                "cost_usd": 0.01,
            }
        return {
            "data": {"items": [{"item_id": "ol:1", "reason": "A gardening book.", "fit": "direct"}]},
            "cost_usd": 0.02,
        }

    def retrieve(interpretation, now, budget):
        budget.call(lambda: outbound.dispatch(outbound.PAID, lambda: None, cost=None))
        return one_book(), [{"source_id": "web", "state": "failed", "items": 0}]

    result = run_search(
        store_at(tmp_path),
        "gardening books",
        catalog=one_book(),
        profile=profile(),
        now=NOW,
        provider=HermesProvider(invoke),
        retriever=retrieve,
        limits=LIVE_LIMITS,
        disclosure_accepted=True,
    )
    assert result["usage"]["paid_calls"] == 3
    assert result["usage"]["cost_usd"] is None
    assert result["usage"]["cost_known"] is False
    assert result["coverage"]["limit_reached"] is False, (
        "Source failure is not budget exhaustion"
    )


def test_overlapping_jobs_count_only_their_own_dispatches(tmp_path):
    entered = threading.Event()
    release = threading.Event()

    class Paid(StubProvider):
        def __init__(self, hold=False):
            self.hold = hold

        def interpret(self, question, limits):
            def answer():
                if self.hold:
                    entered.set()
                    assert release.wait(2), "other job failed to complete"
                return ProviderOutcome(interpret_question(question), requests_used=1)

            return outbound.dispatch(outbound.PAID, answer, cost=None)

    def run(name, hold):
        return run_search(
            store_at(tmp_path / name),
            "gardening books",
            catalog=one_book(),
            profile=profile(),
            now=NOW,
            provider=Paid(hold),
            disclosure_accepted=True,
        )

    with ThreadPoolExecutor(max_workers=1) as pool:
        first = pool.submit(run, "first", True)
        try:
            assert entered.wait(2)
            second = run("second", False)
        finally:
            release.set()
        first = first.result(timeout=2)
    assert first["usage"]["request_counts"] == {"free": 0, "metered": 0, "paid": 1}
    assert second["usage"]["request_counts"] == {"free": 0, "metered": 0, "paid": 1}
    assert outbound.counters() == {"free": 0, "metered": 0, "paid": 2}


@pytest.mark.parametrize("failure", ["http", "malformed", "limit"])
def test_apple_keeps_completed_subquery_when_later_query_fails(
    tmp_path, monkeypatch, failure
):
    def read(url, **kwargs):
        if "itunes.apple.com" in url:
            if "entity=podcastEpisode" in url:
                if failure == "malformed":
                    return {"results": "bad"}
                raise HttpError("http 503")
            return {
                "results": [
                    {
                        "kind": "podcast",
                        "collectionId": 123,
                        "collectionName": "Gardening talk",
                        "collectionViewUrl": "https://podcasts.apple.com/us/podcast/gardening/id123",
                    }
                ]
            }
        return public_read(url, **kwargs)

    monkeypatch.setattr("hackertube_core.retrieval.read_json", read)
    store = store_at(tmp_path)
    store.set_source_enabled("hn", False)
    limits = replace(LIVE_LIMITS, max_requests=1) if failure == "limit" else LIVE_LIMITS
    cat, statuses = SourceRetriever(store)(
        interpret_question("gardening podcasts"), NOW, Budget(limits)
    )
    assert any(x.item_id == "itunes:podcast:123" for x in cat.items)
    apple = next(x for x in statuses if x["source_id"] == "itunes")
    assert apple["state"] in {"partial", "limit"}
    assert apple["items"] == 1


def test_request_scope_restores_context_after_failure():
    with pytest.raises(RuntimeError):
        with outbound.request_scope() as request:
            outbound.dispatch(outbound.PAID, lambda: None, cost=None)
            raise RuntimeError("test failure")
    outbound.dispatch(outbound.FREE, lambda: None)
    assert request.counters() == {"free": 0, "metered": 0, "paid": 1}
    assert outbound.counters() == {"free": 1, "metered": 0, "paid": 1}


def test_expiry_purges_disk_metadata_but_preserves_saved_flags(tmp_path):
    from hackertube_core.catalog import load_seed
    from hackertube_core.profile import ProfileStore
    from test_search import connect_at

    stamp = ["2026-11-07T12:00:00Z"]
    store = ProfileStore(connect_at(tmp_path), clock=lambda: stamp[0])
    video = item("youtube:LCEmiRjPEtQ", "video", "Never retain this expired title")
    cat = build(
        [video],
        [
            evidence(
                "yt", video["item_id"], "youtube", refresh_after="2026-11-08T00:00:00Z"
            ),
            evidence(
                "hn:999",
                video["item_id"],
                "hn",
                kind="community",
                endorsement="mention",
            ),
        ],
        [source("youtube", "YouTube"), source("hn", "Hacker News", role="community")],
    )
    store.remember_catalog(cat)
    store.save_item(video["item_id"], known_ids={video["item_id"]})
    stamp[0] = "2026-11-09T00:00:00Z"
    assert video["item_id"] not in {x.item_id for x in store.catalog(load_seed()).items}
    assert store.snapshot()["items"][0]["saved"] is True
    conn = connect_at(tmp_path)()
    try:
        raw = conn.execute("SELECT document FROM retrieved_catalog").fetchone()[
            "document"
        ]
        assert "Never retain this expired title" not in raw
        assert video["item_id"] not in raw
    finally:
        conn.close()
