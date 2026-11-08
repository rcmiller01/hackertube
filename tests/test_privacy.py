"""Versioned consent is independent of credit acknowledgement; deletion is local."""
import json
import pytest
import route_harness
from test_search import connect_at
from test_release_sources import stored_video
from hackertube_core.profile import ProfileStore


def test_all_dashboard_features_require_current_privacy_agreement(tmp_path):
    root = route_harness.install_host(tmp_path)
    module, app = route_harness.load_api("privacy_gate")
    client = route_harness.client(app)
    for path in ("/catalog", "/feed", "/profile", "/sources", "/search", "/status", "/search/jobs/missing"):
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
        for table in ("item_state", "open_event", "interest", "source_setting", "source_status", "retrieved_catalog", "search_job", "search_result"):
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
