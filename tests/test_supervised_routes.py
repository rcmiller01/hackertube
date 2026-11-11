"""Real HTTP routes plus real supervised child processes, offline provider probe."""

import socket
import sys
from pathlib import Path

import pytest
import route_harness
from hackertube_core.search import Limits
from hackertube_core.search_jobs import SearchSupervisor
from test_search import store_at


@pytest.fixture
def setup(tmp_path, monkeypatch):
    home = tmp_path / "home"
    root = home / "plugin-data/hackertube"
    store = store_at(root)
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    server.settimeout(3)
    manager = SearchSupervisor(
        store,
        home=home,
        command=[
            sys.executable,
            str(Path(__file__).parent / "fixtures/search_worker_probe.py"),
            "hang",
            str(server.getsockname()[1]),
        ],
    )
    dashboard = route_harness.start(root, monkeypatch=monkeypatch)
    monkeypatch.setattr(dashboard.module, "_supervisor", lambda store: manager)
    monkeypatch.setattr(
        "hackertube_core.search.DEFAULT_LIMITS", Limits(deadline_seconds=0.6)
    )
    yield dashboard, manager, server, store
    latest = store.latest_job()
    if latest and latest["state"] in {"running", "queued", "cancelling"}:
        manager.cancel(latest["job_id"])
    dashboard.close()
    server.close()


def test_start_returns_persisted_id_before_blocking_provider_finishes(setup):
    dashboard, manager, server, store = setup
    started = dashboard.post(
        "/search", {"question": "AI", "background": True, "disclosure_accepted": True}
    )
    assert started.status_code == 202
    job_id = started.json()["job"]["job_id"]
    connection, _ = server.accept()
    assert dashboard.get("/feed").status_code == 200
    assert dashboard.get("/search/jobs/" + job_id).json()["job"]["state"] == "running"
    cancelled = dashboard.post("/search/jobs/" + job_id + "/cancel", {})
    assert cancelled.json()["job"]["state"] == "cancelled"
    connection.settimeout(1)
    assert connection.recv(1) == b""
    assert store.job_count() == 1
    connection.close()


def test_expired_job_is_queryable_and_unknown_job_cannot_cancel_another(setup):
    dashboard, manager, server, store = setup
    started = dashboard.post(
        "/search", {"question": "AI", "background": True, "disclosure_accepted": True}
    )
    job_id = started.json()["job"]["job_id"]
    connection, _ = server.accept()
    assert dashboard.post("/search/jobs/job:999/cancel", {}).status_code == 404
    assert manager.wait(job_id, 2)
    done = dashboard.get("/search/jobs/" + job_id).json()
    assert done["job"]["state"] == "timed_out"
    assert done["usage"]["cost_known"] is False
    assert "catalog" in done
    connection.close()


def test_real_synchronous_api_cannot_bypass_the_supervised_deadline(setup, monkeypatch):
    import time
    from types import SimpleNamespace

    dashboard, manager, server, store = setup
    original = dashboard.module._search_binding

    def binding():
        catalog, saved, _ = original()
        return catalog, saved, SimpleNamespace(name="hermes", available=lambda: True)

    monkeypatch.setattr(dashboard.module, "_search_binding", binding)
    monkeypatch.setattr(
        "hackertube_core.search.LIVE_LIMITS", Limits(deadline_seconds=0.6)
    )
    started = time.monotonic()
    result = dashboard.post("/search", {"question": "AI", "disclosure_accepted": True})
    assert result.status_code == 200
    assert result.json()["job"]["state"] == "timed_out"
    assert time.monotonic() - started < 1.5
    connection, _ = server.accept()
    connection.settimeout(1)
    assert connection.recv(1) == b""
    connection.close()


@pytest.mark.parametrize("name,available", [("hermes", True), ("hermes", False), ("stub", True)])
def test_search_info_recovers_after_cached_supervisor_loses_other_owner(setup, monkeypatch, name, available):
    from types import SimpleNamespace

    dashboard, manager, server, store = setup
    original = dashboard.module._search_binding

    def binding():
        catalog, saved, _ = original()
        return catalog, saved, SimpleNamespace(name=name, available=lambda: available)

    monkeypatch.setattr(dashboard.module, "_search_binding", binding)
    job_id = store.record_job(dict(
        kind="search", state="running", question="AI", provider="hermes",
        limits=Limits().as_dict(), requests_used=1, result_count=0,
        cost_usd=None, cost_known=False, coverage=[],
        created_at="2026-11-08T18:00:00Z", ended_at=None,
    ), unique=True)
    result = dashboard.get("/search").json()
    assert result["job"]["job_id"] == job_id
    assert result["job"]["state"] == "interrupted"
    assert result["job"]["requests_used"] == 1
    assert store.job_count() == 1
