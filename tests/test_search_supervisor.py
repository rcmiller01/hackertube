"""Real-process deadline/cancellation tests; no model or external service calls."""
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest

from hackertube_core.search import DisclosureRequired, Limits
from test_search import store_at

FIXTURE = Path(__file__).parent / "fixtures" / "search_worker_probe.py"


def setup_job(tmp_path, *, mode="hang", seconds=0.6):
    from hackertube_core.search_jobs import SearchSupervisor

    home = tmp_path / "home"
    root = home / "plugin-data/hackertube"
    store = store_at(root)
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(2)
    server.settimeout(3)
    supervisor = SearchSupervisor(
        store, home=home, host_root=tmp_path,
        command=[sys.executable, str(FIXTURE), mode, str(server.getsockname()[1])],
    )
    job = supervisor.start("AI books", provider="hermes", limits=Limits(deadline_seconds=seconds), disclosure_accepted=True)
    return supervisor, store, server, job


def wait_done(supervisor, job, seconds=4):
    assert supervisor.wait(job["job_id"], seconds), "supervisor did not finish"
    return supervisor.status(job["job_id"])


def test_deadline_kills_stalled_call_and_closes_connection(tmp_path):
    supervisor, store, server, job = setup_job(tmp_path)
    connection, _ = server.accept()
    connection.settimeout(3)
    started = time.monotonic()
    result = wait_done(supervisor, job)
    assert result["job"]["state"] == "timed_out"
    assert time.monotonic() - started < 1.2
    assert result["usage"]["cost_known"] is False
    assert result["usage"]["requests_used"] == 1
    assert connection.recv(1) == b"", "socket outlived the terminal timeout"
    assert result["job"]["ended_at"] is not None
    assert store.job_count() == 1
    connection.close()
    server.close()


def test_cancel_kills_work_before_marking_cancelled_and_keeps_saves(tmp_path):
    supervisor, store, server, job = setup_job(tmp_path, seconds=10)
    connection, _ = server.accept()
    connection.settimeout(2)
    before = store.snapshot()
    started = time.monotonic()
    supervisor.cancel(job["job_id"])
    result = wait_done(supervisor, job)
    assert result["job"]["state"] == "cancelled"
    assert time.monotonic() - started < 1
    assert connection.recv(1) == b""
    assert store.snapshot() == before
    assert supervisor.cancel(job["job_id"])["job"]["state"] == "cancelled"
    connection.close()
    server.close()


def test_child_process_in_same_group_cannot_outlive_deadline(tmp_path):
    supervisor, store, server, job = setup_job(tmp_path, mode="descendant")
    connections = [server.accept()[0] for _ in range(2)]
    result = wait_done(supervisor, job)
    assert result["job"]["state"] == "timed_out"
    for connection in connections:
        connection.settimeout(1)
        assert connection.recv(1) == b""
        connection.close()
    server.close()


def test_second_search_is_refused_while_first_owns_profile(tmp_path):
    from hackertube_core.search_jobs import SearchBusy, SearchSupervisor

    supervisor, store, server, job = setup_job(tmp_path, seconds=10)
    connection, _ = server.accept()
    other = SearchSupervisor(store, home=tmp_path / "home", host_root=tmp_path)
    with pytest.raises(SearchBusy):
        other.start("different question", provider="hermes", limits=Limits(), disclosure_accepted=True)
    assert store.job_count() == 1
    other.cancel(job["job_id"])
    assert wait_done(supervisor, job)["job"]["state"] == "cancelled"
    connection.close()
    server.close()


def test_no_worker_or_job_without_disclosure(tmp_path):
    from hackertube_core.search_jobs import SearchSupervisor

    store = store_at(tmp_path / "data")
    supervisor = SearchSupervisor(store, home=tmp_path / "home", host_root=tmp_path)
    with pytest.raises(DisclosureRequired):
        supervisor.start("AI", provider="hermes", limits=Limits(), disclosure_accepted=False)
    assert store.job_count() == 0


def test_dead_worker_becomes_failed_not_successful(tmp_path):
    supervisor, store, server, job = setup_job(tmp_path, mode="crash", seconds=3)
    result = wait_done(supervisor, job)
    assert result["job"]["state"] == "failed"
    assert result["results"] == []
    assert result["usage"]["cost_known"] is False
    server.close()


def test_restart_recovers_running_job_without_starting_work(tmp_path):
    from hackertube_core.search_jobs import SearchSupervisor

    store = store_at(tmp_path / "home/plugin-data/hackertube")
    job_id = store.record_job(dict(kind="search", state="running", question="AI", provider="hermes",
        limits=Limits().as_dict(), requests_used=1, result_count=0, cost_usd=None, cost_known=False,
        coverage=[], created_at="2026-11-08T18:00:00Z", ended_at=None))
    supervisor = SearchSupervisor(store, home=tmp_path / "home", host_root=tmp_path)
    result = supervisor.status(job_id)
    assert result["job"]["state"] == "interrupted"
    assert result["usage"]["cost_known"] is False
    assert store.job_count() == 1


def test_terminal_response_is_persisted_and_does_not_restart(tmp_path):
    from hackertube_core.search_jobs import SearchSupervisor

    supervisor, store, server, job = setup_job(tmp_path, mode="success", seconds=3)
    result = wait_done(supervisor, job)
    assert result["job"]["state"] == "succeeded"
    other = SearchSupervisor(store, home=tmp_path / "home", host_root=tmp_path)
    assert other.status(job["job_id"]) == result
    assert store.job_count() == 1
    server.close()


def test_worker_exits_when_its_dashboard_parent_dies(tmp_path):
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    server.settimeout(4)
    owner = subprocess.Popen([sys.executable, str(FIXTURE), "orphan-owner",
                              str(server.getsockname()[1]), str(tmp_path / "home")])
    connection, _ = server.accept()
    connection.settimeout(2)
    assert owner.wait(timeout=3) == 0
    assert connection.recv(1) == b"", "orphan worker kept its provider connection open"
    connection.close()
    server.close()
