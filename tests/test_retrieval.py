"""Live retrieval, source failures, limits, and persistent new identities."""

import json
from dataclasses import replace
from types import SimpleNamespace
from urllib.parse import urlsplit

import pytest

from hackertube_core import outbound
from hackertube_core.catalog import load_seed
from hackertube_core.hermes import HermesProvider, register
from hackertube_core.retrieval import Budget, SourceRetriever
from hackertube_core.search import Limits, LIVE_LIMITS, interpret_question, run_search
from test_search import NOW, one_book, profile, store_at


def public_read(url, **kwargs):
    host = urlsplit(url).hostname
    if host == "openlibrary.org":
        return {
            "docs": [
                {
                    "key": "/works/OL999999W",
                    "title": "Growing Vegetables",
                    "author_name": ["A Gardener"],
                }
            ]
        }
    if host == "hn.algolia.com":
        return {"hits": []}
    if host == "itunes.apple.com":
        return {"results": []}
    if host == "librivox.org":
        return {"books": []}
    raise AssertionError(host)


def test_source_search_gets_records_absent_from_seed_and_filters_unrequested_sources(
    tmp_path, monkeypatch
):
    seen = []

    def read(url, **kwargs):
        seen.append(url)
        assert 0 < kwargs["timeout"] <= 10
        return public_read(url, **kwargs)

    monkeypatch.setattr("hackertube_core.retrieval.read_json", read)
    store = store_at(tmp_path)
    catalog, status = SourceRetriever(store)(
        interpret_question("gardening books"), NOW, Budget(LIVE_LIMITS)
    )
    assert [x.item_id for x in catalog.items] == ["ol:OL999999W"]
    assert not {x.item_id for x in catalog.items} & {
        x.item_id for x in load_seed().items
    }
    assert {urlsplit(x).hostname for x in seen} == {"openlibrary.org", "hn.algolia.com"}
    assert (
        next(x for x in status if x["source_id"] == "reddit")["reason"]
        == "approval_absent"
    )


def test_named_source_failure_keeps_other_retrieved_items(tmp_path, monkeypatch):
    def read(url, **kwargs):
        if "hn.algolia.com" in url:
            raise RuntimeError("secret-bearing remote response")
        return public_read(url, **kwargs)

    monkeypatch.setattr("hackertube_core.retrieval.read_json", read)
    catalog, status = SourceRetriever(store_at(tmp_path))(
        interpret_question("gardening books"), NOW, Budget(LIVE_LIMITS)
    )
    assert len(catalog.items) == 1
    assert next(x for x in status if x["source_id"] == "hn")["state"] == "failed"
    assert "secret-bearing" not in json.dumps(status)


def test_source_request_budget_is_enforced_before_dispatch(tmp_path, monkeypatch):
    seen = []
    monkeypatch.setattr(
        "hackertube_core.retrieval.read_json",
        lambda url, **kw: seen.append(url) or public_read(url, **kw),
    )
    budget = Budget(Limits(max_requests=1))
    _, status = SourceRetriever(store_at(tmp_path))(
        interpret_question("gardening books"), NOW, budget
    )
    assert len(seen) == budget.used == 1
    assert (
        next(x for x in status if x["source_id"] == "openlibrary")["state"] == "limit"
    )


def test_unknown_web_pages_and_invented_audio_editions_are_not_admitted(
    tmp_path, monkeypatch
):
    monkeypatch.setattr("hackertube_core.retrieval.read_json", public_read)
    rows = [
        {"title": "A real ebook", "url": "https://www.gutenberg.org/ebooks/1234"},
        {"title": "An audiobook probably", "url": "https://example.org/ebook"},
        {"title": "Private", "url": "https://127.0.0.1/item"},
        {"title": "No oEmbed bypass", "url": "https://youtube.com/watch?v=LCEmiRjPEtQ"},
    ]
    cat, _ = SourceRetriever(store_at(tmp_path), web_search=lambda q, **k: rows)(
        interpret_question("gardening books"), NOW, Budget(LIVE_LIMITS)
    )
    web = [x for x in cat.evidence if x.kind == "web"]
    assert (
        len(web) == 1 and web[0].destination == "https://www.gutenberg.org/ebooks/1234"
    )
    assert web[0].endorsement == "not_applicable"


def test_hermes_ranked_new_item_survives_save_open_and_reopen(tmp_path, monkeypatch):
    import route_harness

    monkeypatch.setattr("hackertube_core.retrieval.read_json", public_read)

    def invoke(raw):
        req = json.loads(raw)
        if req["stage"] == "interpret":
            return {
                "data": {
                    "topic": "gardening",
                    "terms": ["gardening"],
                    "formats": ["book"],
                },
                "cost_usd": None,
            }
        assert req["stage"] == "rank"
        ids = [x["item_id"] for x in req["input"]["candidates"]]
        assert ids == ["ol:OL999999W"]
        return {
            "data": {
                "items": [
                    {
                        "item_id": ids[0],
                        "reason": "A source-backed vegetable growing guide.",
                        "fit": "direct",
                    }
                ]
            },
            "provider": "existing",
            "model": "configured",
            "cost_usd": None,
        }

    monkeypatch.setattr("hackertube_core.hermes.handler", lambda: invoke)
    dashboard = route_harness.start(tmp_path / "data", settings={"provider": "hermes"})
    # This test keeps its injected HTTP/model seams in-process to exercise
    # retrieval + route + library behavior. Process ownership/cancellation is
    # exercised with real children in test_supervised_routes.py.
    class RetrievalController:
        def start(self, question, **kwargs):
            catalog, store, provider = dashboard.module._search_binding()
            self.result = run_search(store, question, catalog=catalog, profile=store.snapshot(),
                now=NOW, provider=provider, limits=kwargs["limits"], disclosure_accepted=True,
                retriever=SourceRetriever(store))
            return self.result["job"]
        def wait(self, job_id, timeout):
            return True
        def status(self, job_id):
            return self.result
    controller = RetrievalController()
    monkeypatch.setattr(dashboard.module, "_supervisor", lambda store: controller)
    result = dashboard.post(
        "/search",
        {
            "question": "How do I grow food? Recommend books",
            "disclosure_accepted": True,
        },
    )
    assert result.status_code == 200
    body = result.json()
    assert body["results"][0]["item_id"] == "ol:OL999999W"
    assert body["results"][0]["why"] == ["A source-backed vegetable growing guide."]
    assert any(x["item_id"] == "ol:OL999999W" for x in body["catalog"]["items"])
    saved = dashboard.post("/profile/saves", {"item_id": "ol:OL999999W"})
    assert saved.status_code == 200
    assert (
        dashboard.post("/profile/opens", {"item_id": "ol:OL999999W"}).status_code == 200
    )
    dashboard.close()
    before = outbound.counters().copy()
    dashboard = route_harness.start(tmp_path / "data", name="ht-reopened")
    assert any(
        x["item_id"] == "ol:OL999999W"
        for x in dashboard.get("/catalog").json()["catalog"]["items"]
    )
    state = next(
        x
        for x in dashboard.get("/profile").json()["items"]
        if x["item_id"] == "ol:OL999999W"
    )
    assert (
        state["saved"] is True
        and state["completed"] is False
        and len(state["opens"]) == 1
    )
    assert outbound.counters() == before
    dashboard.close()


def test_host_model_can_only_rank_retrieved_ids():
    provider = HermesProvider(
        lambda raw: {
            "data": {"items": [{"item_id": "invented", "reason": "plausible", "fit": "direct"}]}
        }
    )
    with pytest.raises(Exception, match="unsupported candidate"):
        provider.rank("books", one_book(), 2)


def test_native_registration_starts_no_model_or_tool_work(monkeypatch):
    monkeypatch.setitem(
        __import__("sys").modules,
        "hermes_constants",
        SimpleNamespace(get_hermes_home=lambda: "/profile-a"),
    )
    tasks = []
    unloaded = []
    ctx = SimpleNamespace(
        register_auxiliary_task=lambda key, **kw: tasks.append(key),
        on_unload=unloaded.append,
    )
    register(ctx)
    from hackertube_core.hermes import handler

    assert tasks == ["hackertube_search"] and callable(handler())
    unloaded[0]()
    assert handler() is None


def test_hermes_memory_disabled_payload_contains_only_request_and_retrieved_candidates(
    monkeypatch,
):
    monkeypatch.setitem(
        __import__("sys").modules,
        "hermes_constants",
        SimpleNamespace(get_hermes_home=lambda: "/profile-memory-test"),
    )
    calls = []

    class Llm:
        def complete_structured(self, **kw):
            calls.append(kw)
            return SimpleNamespace(
                parsed={
                    "topic": "gardening",
                    "terms": ["gardening"],
                    "formats": ["book"],
                },
                provider="configured",
                model="existing",
                usage=SimpleNamespace(cost_usd=None),
            )

    ctx = SimpleNamespace(
        register_auxiliary_task=lambda *a, **k: None,
        on_unload=lambda fn: None,
        llm=Llm(),
    )
    register(ctx)
    HermesProvider().interpret("gardening books", LIVE_LIMITS)
    assert json.loads(calls[0]["input"][0]["text"]) == "gardening books"
    assert calls[0]["task"] == "hackertube_search"
    assert "memory" not in calls[0]


def test_expired_retrieved_metadata_is_purged_from_store(tmp_path):
    store = store_at(tmp_path)
    cat = one_book()
    old = replace(
        cat, evidence=(replace(cat.evidence[0], refresh_after="2001-01-01T00:00:00Z"),)
    )
    store.remember_catalog(old)
    assert not {x.item_id for x in store.catalog(load_seed()).items} & {"ol:1"}


def test_podcastindex_signed_lookup_uses_headers_not_urls(tmp_path, monkeypatch):
    store = store_at(tmp_path)
    store.set_source_enabled("podcastindex", True)
    seen = []

    def read(url, **kw):
        if "podcastindex" in url:
            seen.append((url, kw))
            return {
                "feeds": [{"id": 123, "title": "Garden talk", "author": "Gardener"}]
            }
        return public_read(url, **kw)

    monkeypatch.setattr("hackertube_core.retrieval.read_json", read)
    keys = {
        "PODCASTINDEX_API_KEY": "key-test",
        "PODCASTINDEX_API_SECRET": "secret-test",
    }
    cat, _ = SourceRetriever(store, get_secret=keys.get)(
        interpret_question("gardening podcasts"), NOW, Budget(LIVE_LIMITS)
    )
    assert any(x.item_id == "podcastindex:123" for x in cat.items)
    assert seen[0][1]["classification"] == outbound.METERED
    assert seen[0][1]["headers"]["X-Auth-Key"] == "key-test"
    assert all(secret not in seen[0][0] for secret in keys.values())


def test_host_bridge_keys_the_profile_by_canonical_path(tmp_path, monkeypatch):
    actual = tmp_path / "actual"
    actual.mkdir()
    alias = tmp_path / "alias"
    alias.symlink_to(actual, target_is_directory=True)
    home = [alias]
    monkeypatch.setitem(
        __import__("sys").modules,
        "hermes_constants",
        SimpleNamespace(get_hermes_home=lambda: home[0]),
    )
    ctx = SimpleNamespace(
        register_auxiliary_task=lambda *a, **k: None, on_unload=lambda fn: None
    )
    register(ctx)
    home[0] = actual
    from hackertube_core.hermes import handler

    assert callable(handler())


def test_slow_search_does_not_block_feed_reads(tmp_path, monkeypatch):
    import asyncio
    import threading
    import httpx
    import route_harness
    from hackertube_core.search import StubProvider

    dashboard = route_harness.start(tmp_path / "data")
    original = dashboard.module._search_binding
    feed_read = threading.Event()
    entered = threading.Event()
    observed = []

    class Slow(StubProvider):
        def interpret(self, question, limits):
            entered.set()
            observed.append(feed_read.wait(1))
            return super().interpret(question, limits)

    def binding():
        catalog, store, _ = original()
        return catalog, store, Slow()

    monkeypatch.setattr(dashboard.module, "_search_binding", binding)

    async def exercise():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=dashboard.app), base_url="http://test"
        ) as client:
            job = asyncio.create_task(
                client.post(
                    "/api/plugins/hackertube/search",
                    json={"question": "Jane Austen books", "disclosure_accepted": True},
                )
            )
            for _ in range(100):
                if entered.is_set():
                    break
                await asyncio.sleep(0.001)
            response = await client.get("/api/plugins/hackertube/feed")
            feed_read.set()
            assert response.status_code == 200
            assert (await job).status_code == 200

    asyncio.run(exercise())
    assert observed == [True]
    dashboard.close()


def test_youtube_search_hydrates_only_api_ids_and_retains_expiry(tmp_path, monkeypatch):
    store = store_at(tmp_path)
    seen = []
    store.set_source_enabled("youtube", True)

    def read(url, **kw):
        if "googleapis.com" in url:
            seen.append((url, kw))
            if "/search?" in url:
                return {"items": [{"id": {"videoId": "LCEmiRjPEtQ"}}]}
            return {
                "kind": "youtube#videoListResponse",
                "items": [
                    {
                        "id": "LCEmiRjPEtQ",
                        "snippet": {
                            "title": "Gardening lesson",
                            "channelTitle": "Grower",
                        },
                        "status": {"privacyStatus": "public"},
                        "contentDetails": {"duration": "PT10M"},
                    }
                ],
            }
        return public_read(url, **kw)

    monkeypatch.setattr("hackertube_core.retrieval.read_json", read)
    cat, _ = SourceRetriever(
        store,
        get_secret=lambda name: (
            "youtube-key-test" if name == "YOUTUBE_API_KEY" else None
        ),
    )(interpret_question("gardening videos"), NOW, Budget(LIVE_LIMITS))
    video = next(x for x in cat.items if x.format == "video")
    assert video.duration_seconds == 600
    assert len(seen) == 2
    assert all(x[1]["classification"] == outbound.METERED for x in seen)
    assert all("youtube-key-test" not in x[0] for x in seen)
    assert (
        next(x for x in cat.evidence if x.item_id == video.item_id).refresh_after
        is not None
    )


def test_youtube_thumbnail_display_check_is_free_and_takes_no_budget_slot(tmp_path, monkeypatch):
    store = store_at(tmp_path)
    store.set_source_enabled("youtube", True)
    google, images = [], []
    thumb = "https://i.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg"

    def read(url, **kw):
        if "googleapis.com" in url:
            google.append((url, kw))
            if "/search?" in url:
                return {"items": [{"id": {"videoId": "LCEmiRjPEtQ"}}]}
            return {
                "kind": "youtube#videoListResponse",
                "items": [
                    {
                        "id": "LCEmiRjPEtQ",
                        "snippet": {
                            "title": "Gardening lesson",
                            "channelTitle": "Grower",
                            "thumbnails": {
                                "medium": {
                                    "url": "https://i.ytimg.com/vi/LCEmiRjPEtQ/mqdefault.jpg",
                                    "width": 320,
                                    "height": 180,
                                },
                                "high": {"url": thumb, "width": 480, "height": 360},
                            },
                        },
                        "status": {"privacyStatus": "public"},
                        "contentDetails": {"duration": "PT10M"},
                    }
                ],
            }
        return public_read(url, **kw)

    def check(url):
        images.append(url)
        return True

    monkeypatch.setattr("hackertube_core.retrieval.read_json", read)
    monkeypatch.setattr("hackertube_core.adapters.youtube.thumbnail_is_display_clear", check)
    budget = Budget(LIVE_LIMITS)
    cat, _ = SourceRetriever(
        store,
        get_secret=lambda name: "youtube-key-test" if name == "YOUTUBE_API_KEY" else None,
    )(interpret_question("gardening videos"), NOW, budget)

    video = next(x for x in cat.items if x.format == "video")
    # The URL came back on the videos.list payload the search already read.
    assert len(google) == 2, "no third Data API request was added"
    assert all(kw["classification"] == outbound.METERED for _, kw in google)
    assert images == [thumb]
    assert video.art_url == thumb
    assert video.art_hotlink is True
    assert video.art_cache is False
    assert video.art_http_status == 200
    assert video.art_checked_at == NOW

    # The display check takes no work-budget slot: a run that refuses every
    # thumbnail spends the same slots and issues the same Data API reads.
    monkeypatch.setattr(
        "hackertube_core.adapters.youtube.thumbnail_is_display_clear",
        lambda url: False,
    )
    baseline_budget = Budget(LIVE_LIMITS)
    google.clear()
    SourceRetriever(
        store,
        get_secret=lambda name: "youtube-key-test" if name == "YOUTUBE_API_KEY" else None,
    )(interpret_question("gardening videos"), NOW, baseline_budget)
    assert budget.used == baseline_budget.used
    assert len(google) == 2


def test_hn_links_book_mentions_without_claiming_endorsement(tmp_path, monkeypatch):
    def read(url, **kw):
        if "hn.algolia.com" in url:
            return {
                "hits": [
                    {
                        "objectID": "123",
                        "url": "https://openlibrary.org/works/OL999999W",
                    }
                ]
            }
        return public_read(url, **kw)

    monkeypatch.setattr("hackertube_core.retrieval.read_json", read)
    cat, _ = SourceRetriever(store_at(tmp_path))(
        interpret_question("gardening books"), NOW, Budget(LIVE_LIMITS)
    )
    row = next(x for x in cat.evidence if x.kind == "community")
    assert row.item_id == "ol:OL999999W"
    assert row.endorsement == "mention" and row.display_line is None
    assert row.excerpt is None


def test_rank_input_reserves_space_for_each_format_and_rejects_unsubmitted_ids():
    from test_search import item, evidence, source, build

    books = [
        item("book:" + str(n), "book", "Gardening", capture_order=n + 1)
        for n in range(65)
    ]
    video = item("video:one", "video", "Gardening lesson", capture_order=66)
    cat = build(
        books + [video],
        [evidence("e" + str(n), x["item_id"]) for n, x in enumerate(books + [video])],
        [source("openlibrary", "Open Library")],
    )
    observed = []

    def invoke(raw):
        payload = json.loads(raw)["input"]["candidates"]
        observed.extend(payload)
        return {
            "data": {"items": [{"item_id": "video:one", "reason": "A video lesson.", "fit": "direct"}]}
        }

    ranked, _ = HermesProvider(invoke).rank("gardening", cat, 3)
    assert len(observed) == 60
    assert "video:one" in ranked
    assert any(x["format"] == "video" for x in observed)


def test_malformed_hn_payload_does_not_discard_other_sources(tmp_path, monkeypatch):
    def read(url, **kw):
        return [] if "hn.algolia.com" in url else public_read(url, **kw)

    monkeypatch.setattr("hackertube_core.retrieval.read_json", read)
    cat, status = SourceRetriever(store_at(tmp_path))(
        interpret_question("gardening books"), NOW, Budget(LIVE_LIMITS)
    )
    assert len(cat.items) == 1
    assert next(x for x in status if x["source_id"] == "hn")["state"] == "failed"


def test_malformed_model_output_is_a_recorded_failure_not_a_local_success(tmp_path):
    store = store_at(tmp_path)
    result = run_search(
        store,
        "gardening books",
        catalog=load_seed(),
        profile=profile(),
        now=NOW,
        provider=HermesProvider(lambda raw: {"data": {"topic": "gardening"}}),
        disclosure_accepted=True,
    )
    assert result["job"]["state"] == "failed"
    assert result["results"] == []
    assert store.job_count() == 1
    assert result["usage"]["cost_known"] is False
    assert result["usage"]["paid_calls"] == 1


def test_keyed_sources_require_explicit_enablement_and_can_be_revoked(tmp_path):
    from hackertube_core.sources import (
        available_registry,
        configure_source,
        source_snapshot,
    )

    store = store_at(tmp_path)
    registry = available_registry(lambda name: "configured")
    initial = {x["source_id"]: x for x in source_snapshot(store, registry)["sources"]}
    assert initial["youtube"]["enabled"] is False
    assert initial["youtube"]["blocked_reason"] is None
    assert configure_source(store, "youtube", True, registry)[0] == 200
    assert (
        next(
            x
            for x in source_snapshot(store, registry)["sources"]
            if x["source_id"] == "youtube"
        )["enabled"]
        is True
    )
    missing = available_registry(lambda name: None)
    row = next(
        x
        for x in source_snapshot(store, missing)["sources"]
        if x["source_id"] == "youtube"
    )
    assert row["enabled"] is False and row["blocked_reason"] == "missing_api_key"
    assert configure_source(store, "youtube", True, missing)[0] == 409
