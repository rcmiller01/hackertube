"""Versioned consent is independent of credit acknowledgement; deletion is local."""
import logging
import threading
import time

import pytest
import route_harness
from test_search import connect_at
from test_release_sources import stored_video
from hackertube_core.profile import ProfileStore


def test_all_dashboard_features_require_current_privacy_agreement(tmp_path):
    route_harness.install_host(tmp_path)
    module, app = route_harness.load_api("privacy_gate")
    client = route_harness.client(app)
    for path in ("/catalog", "/feed", "/profile", "/sources", "/search", "/status", "/search/jobs/missing", "/search/jobs/privacy"):
        assert client.get(route_harness.API_ROOT + path).status_code == 403, path
    for path, body in (("/search", {"question":"AI", "disclosure_accepted":True}), ("/sources", {"source_id":"youtube", "enabled":True})):
        assert client.post(route_harness.API_ROOT + path, json=body).status_code == 403
    policy = client.get(route_harness.API_ROOT + "/privacy").json()
    assert not policy["accepted"]
    assert "YouTube API Services" in policy["text"]
    assert "https://www.youtube.com/t/terms" in policy["text"]
    assert "https://policies.google.com/privacy" in policy["text"]
    assert client.post(route_harness.API_ROOT + "/privacy", json={"version":"old", "accepted":True}).status_code == 400
    assert client.post(route_harness.API_ROOT + "/privacy", json={"version":policy["version"], "accepted":True}).status_code == 200
    assert client.get(route_harness.API_ROOT + "/catalog").status_code == 200
    client.close()


def test_consent_is_versioned_and_profile_local(tmp_path):
    from hackertube_core.privacy import VERSION
    store = ProfileStore(connect_at(tmp_path))
    assert not store.privacy_accepted()
    store.accept_privacy(VERSION)
    assert store.privacy_accepted()
    with store._connect() as conn:
        conn.execute("UPDATE profile_meta SET value='outdated' WHERE key='privacy_version'")
    assert not store.privacy_accepted()


def test_delete_clears_all_owned_state_and_consent(tmp_path):
    from hackertube_core.privacy import VERSION
    store, connect, clock, result = stored_video(tmp_path)
    store.accept_privacy(VERSION)
    store.clear_data()
    with connect() as conn:
        for table in ("item_state", "open_event", "interests", "source_setting", "source_status", "retrieved_catalog", "search_job", "search_result"):
            assert conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0] == 0, table
    assert not store.privacy_accepted()


def test_refresh_invalidation_removes_all_metadata_copies_but_preserves_save(tmp_path):
    store, connect, clock, result = stored_video(tmp_path)
    store.invalidate_youtube([result["results"][0]["item_id"]])
    with connect() as conn:
        raw = " ".join(row[0] for row in conn.execute("SELECT document FROM search_result UNION ALL SELECT document FROM retrieved_catalog"))
    assert "AI retention sentinel title" not in raw
    assert store.snapshot()["items"][0]["saved"] is True
    assert store.job_result(result["job"]["job_id"])["usage"] == result["usage"]


def test_housekeeping_deletes_expired_copies_without_network(tmp_path, monkeypatch):
    import threading
    from hackertube_core.privacy import start_housekeeping
    from hackertube_core import outbound
    store, connect, clock, result = stored_video(tmp_path)
    clock[0] = "2026-12-02T00:00:00Z"
    done = threading.Event()
    def opening(factory):
        ProfileStore(connect, clock=lambda: clock[0])
        done.set()
    monkeypatch.setattr("hackertube_core.profile.ProfileStore", opening)
    with outbound.guard():
        stop = start_housekeeping(interval=0.01)
        try:
            assert done.wait(1)
            assert outbound.counters() == {"free":0, "paid":0, "metered":0}
        finally:
            stop()
    assert store.job_result(result["job"]["job_id"])["results"] == []


def test_expired_youtube_data_is_purged_at_startup_not_only_when_opened(tmp_path, monkeypatch):
    """Developer Policies III.E.4.d: a dormant profile must not keep expired
    YouTube metadata and thumbnail URLs on disk.

    The retention purge used to run only when the profile store was next opened
    or written -- that is, when HackerTube was opened. It now runs once as soon
    as the plugin loads, before the first interval. A one-hour interval is used
    here so that nothing but a startup purge can explain the deletion: no store
    read or write happens between ``start_housekeeping`` and the raw check.
    """
    from hackertube_core.privacy import start_housekeeping
    from hackertube_core import outbound
    store, connect, clock, result = stored_video(tmp_path)
    clock[0] = "2026-12-01T00:00:00Z"  # exact 30-day deadline: the metadata is expired
    purged = threading.Event()
    def opening(factory):
        ProfileStore(connect, clock=lambda: clock[0])
        purged.set()
    monkeypatch.setattr("hackertube_core.profile.ProfileStore", opening)
    with outbound.guard():
        stop = start_housekeeping(interval=3600)
        try:
            # The startup purge runs off the caller's thread, so register() is
            # not blocked; the pass itself still happens before the first
            # interval. Wait for that pass, then assert the durable copy is
            # clean: no other store access has run.
            assert purged.wait(5), "the profile store is opened (and purged) at startup, not only later"
            assert outbound.counters() == {"free": 0, "paid": 0, "metered": 0}
            with connect() as conn:
                raw = " ".join(row[0] for row in conn.execute("SELECT document FROM retrieved_catalog"))
            assert "AI retention sentinel title" not in raw, (
                "expired YouTube metadata is purged at plugin startup, not only when HackerTube opens"
            )
        finally:
            stop()
    assert store.job_result(result["job"]["job_id"])["results"] == []


def test_startup_purge_does_not_block_plugin_registration(monkeypatch):
    """``register()`` must not wait on the startup purge's store I/O."""
    from hackertube_core import privacy
    released = threading.Event()

    def slow_opening(factory):
        released.wait(5)

    monkeypatch.setattr("hackertube_core.profile.ProfileStore", slow_opening)
    monkeypatch.setattr(privacy, "_profile_db_path", lambda: None)
    began = time.monotonic()
    stop = privacy.start_housekeeping(interval=600)
    elapsed = time.monotonic() - began
    released.set()
    stop()
    assert elapsed < 0.5, (
        f"register() must not block on the startup purge; it took {elapsed:.2f}s "
        "(the purge runs on the background thread)"
    )


def test_startup_purge_logs_a_warning_and_continues_on_failure(caplog, monkeypatch):
    """A failed purge is recorded, not swallowed: it logs and keeps going."""
    from hackertube_core import privacy
    attempted = threading.Event()

    def failing(factory):
        attempted.set()
        raise RuntimeError("purge boom")

    monkeypatch.setattr("hackertube_core.profile.ProfileStore", failing)
    monkeypatch.setattr(privacy, "_profile_db_path", lambda: None)
    with caplog.at_level(logging.WARNING, logger="hackertube.privacy"):
        stop = privacy.start_housekeeping(interval=600)
        try:
            assert attempted.wait(5), "the startup purge ran"
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline and not caplog.records:
                time.sleep(0.02)
            warnings = [record for record in caplog.records
                        if record.levelno >= logging.WARNING and "purge" in record.getMessage().lower()]
            assert warnings, "a failed purge logs a warning instead of being swallowed silently"
        finally:
            stop()


def test_startup_purge_does_not_create_a_missing_profile_database(tmp_path, monkeypatch):
    """A fresh profile has no DB yet; loading the plugin must not create one."""
    from hackertube_core import privacy
    db_path = tmp_path / "plugin-data" / "hackertube" / "profile.db"
    opened = []

    def recording(factory):
        opened.append(factory)

    monkeypatch.setattr(privacy, "_profile_db_path", lambda: db_path)
    monkeypatch.setattr("hackertube_core.profile.ProfileStore", recording)
    stop = privacy.start_housekeeping(interval=600)
    try:
        # Give the background thread ample time to run its first pass; the
        # guarded purge returns before it would ever open the store.
        deadline = time.monotonic() + 0.5
        while time.monotonic() < deadline:
            time.sleep(0.02)
    finally:
        stop()
    assert opened == [], "the startup purge does not open (and so cannot create) a missing database"
    assert not db_path.exists(), "loading the plugin must not create the profile database"


def test_supervisor_refuses_unagreed_profile_and_deletion_while_active(tmp_path):
    from hackertube_core.search_jobs import SearchSupervisor, SearchBusy
    from hackertube_core.search import Limits, DisclosureRequired
    from test_search_supervisor import setup_job, wait_done
    store = ProfileStore(connect_at(tmp_path / "unagreed"))
    manager = SearchSupervisor(store, home=tmp_path / "unagreed-home")
    with pytest.raises(DisclosureRequired):
        manager.start("AI", provider="stub", limits=Limits(), disclosure_accepted=True)
    assert store.job_count() == 0
    manager, store, server, job = setup_job(tmp_path / "active", seconds=10)
    connection, _ = server.accept()
    try:
        with pytest.raises(SearchBusy):
            manager.clear_data()
        assert store.job_count() == 1
        manager.cancel(job["job_id"])
        wait_done(manager, job)
        manager.clear_data()
        assert store.job_count() == 0
        assert not store.privacy_accepted()
    finally:
        connection.close()
        server.close()


@pytest.mark.parametrize("payload,removed", [
    ({"kind":"youtube#videoListResponse", "items":[]}, True),
    ({"kind":"youtube#videoListResponse", "items":[{"id":"LCEmiRjPEtQ", "snippet":{"title":"Gone"}, "status":{"privacyStatus":"private"}}]}, True),
    ({"error":{"message":"quota"}}, False),
])
def test_successful_youtube_hydration_invalidates_old_copies_but_errors_do_not(tmp_path, monkeypatch, payload, removed):
    from hackertube_core.retrieval import SourceRetriever, Budget
    from hackertube_core.search import LIVE_LIMITS, interpret_question
    store, connect, clock, result = stored_video(tmp_path)
    for sid in ("hn", "itunes", "openlibrary", "librivox"):
        store.set_source_enabled(sid, False)
    store.set_source_enabled("youtube", True)
    def read(url, **kwargs):
        if "/search?" in url:
            return {"items":[{"id":{"videoId":"LCEmiRjPEtQ"}}]}
        return payload
    monkeypatch.setattr("hackertube_core.retrieval.read_json",read)
    SourceRetriever(store, get_secret=lambda name:"test-key" if name=="YOUTUBE_API_KEY" else None)(
        interpret_question("retention videos"), clock[0], Budget(LIVE_LIMITS))
    assert (not store.job_result(result["job"]["job_id"])["results"]) == removed
    assert store.snapshot()["items"][0]["saved"] is True
