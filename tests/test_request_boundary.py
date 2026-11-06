"""Task 3.3: the outbound request boundary.

FEED04, PREF08, JOB02, and JOB04. Every outbound call goes through
``hackertube_core.outbound``. A test here fails when code reaches the
network around that boundary, and the driven flows assert the paid and
metered counters stay zero while the free counter matches what ran.
"""

import ast
import importlib.util
import socket
import ssl
from pathlib import Path

import pytest

from hackertube_core import outbound
from hackertube_core.catalog import load_seed
from hackertube_core.http import HttpError, read_json

NOW = "2026-11-06T12:24:15Z"
PRIDE = "ol:OL66554W"
ROOT = Path(__file__).resolve().parents[1]
PACKAGES = (ROOT / "hackertube_core", ROOT / "hackertube")
DISCOVERY = ROOT / "hackertube" / "dashboard" / "discovery.py"

#: Client modules that can reach the network. ``urllib.parse`` and
#: ``ipaddress`` are parsing only and are not listed.
NETWORK_MODULES = {
    "socket",
    "ssl",
    "http.client",
    "urllib.request",
    "requests",
    "httpx",
    "aiohttp",
    "ftplib",
    "smtplib",
    "telnetlib",
    "websockets",
}

#: The only modules allowed to import a network module, and which ones.
#: ``text.py`` uses ``socket.inet_aton`` to validate a host string.
ALLOWED_NETWORK_IMPORTS = {
    "hackertube_core/http.py": {"socket", "ssl", "http.client", "urllib.request"},
    "hackertube_core/outbound.py": {"socket", "http.client", "urllib.request"},
    "hackertube_core/text.py": {"socket"},
}

#: Scheduling primitives a recurring paid job would need.
SCHEDULING_MODULES = {"sched", "apscheduler", "threading", "multiprocessing", "concurrent.futures"}
SCHEDULING_CALLS = {"create_task", "call_later", "call_at", "enter", "Timer"}


def _discovery():
    spec = importlib.util.spec_from_file_location("hackertube_discovery_boundary", DISCOVERY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _imported_modules(tree):
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            found.add(node.module)
    return found


def _attribute_names(tree):
    return {
        node.attr
        for node in ast.walk(tree)
        if isinstance(node, ast.Attribute)
    }


def _package_files():
    return sorted(path for package in PACKAGES for path in package.rglob("*.py"))


def _relative(path):
    return str(path.relative_to(ROOT))


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


def test_every_network_import_is_inside_the_boundary():
    """A module that imports a client library outside the allowlist fails."""
    offenders = {}
    for path in _package_files():
        modules = _imported_modules(ast.parse(path.read_text(), filename=str(path)))
        found = modules & NETWORK_MODULES
        allowed = ALLOWED_NETWORK_IMPORTS.get(_relative(path), set())
        extra = found - allowed
        if extra:
            offenders[_relative(path)] = sorted(extra)
    assert offenders == {}, f"network imports outside the boundary: {offenders}"


def test_no_module_schedules_recurring_work():
    """JOB02: the plugin has no scheduler and no recurring paid job."""
    offenders = {}
    for path in _package_files():
        tree = ast.parse(path.read_text(), filename=str(path))
        modules = _imported_modules(tree) & SCHEDULING_MODULES
        calls = _attribute_names(tree) & SCHEDULING_CALLS
        if modules or calls:
            offenders[_relative(path)] = sorted(modules) + sorted(calls)
    assert offenders == {}, f"recurring work outside a job: {offenders}"


def test_a_socket_connection_outside_the_boundary_is_refused(monkeypatch):
    outbound.install_guard(monkeypatch)
    outbound.reset()
    with pytest.raises(outbound.NetworkOutsideBoundary):
        socket.create_connection(("93.184.216.34", 443))
    with pytest.raises(outbound.NetworkOutsideBoundary):
        socket.socket().connect(("93.184.216.34", 443))


def test_a_urlopen_outside_the_boundary_is_refused(monkeypatch):
    import urllib.request

    outbound.install_guard(monkeypatch)
    outbound.reset()
    with pytest.raises(outbound.NetworkOutsideBoundary):
        urllib.request.urlopen("https://example.com/data")


def test_the_guard_permits_a_connection_inside_the_boundary(monkeypatch):
    outbound.reset()
    seen = []

    def fake_create_connection(address, timeout=None, source_address=None):
        seen.append((address, outbound.LEDGER.in_flight))
        return object()

    def fake_wrap(self, sock, server_hostname=None, **kwargs):
        raise OSError("mocked transport")

    monkeypatch.setattr(socket, "create_connection", fake_create_connection)
    monkeypatch.setattr(ssl.SSLContext, "wrap_socket", fake_wrap)
    outbound.install_guard(monkeypatch)
    with pytest.raises(HttpError):
        read_json("https://example.com/data", resolve=_resolve)
    assert seen == [(("1.1.1.1", 443), 1)]
    assert outbound.counters() == {"free": 1, "paid": 0}


def test_a_source_read_is_counted_free(monkeypatch):
    outbound.install_guard(monkeypatch)
    outbound.reset()
    for _ in range(3):
        assert read_json("https://example.com/data", opener=_opener(), resolve=_resolve) == {"ok": True}
    assert outbound.counters() == {"free": 3, "paid": 0}
    assert outbound.usage()["cost_usd"] == 0.0


def test_feed04_browsing_paging_saving_dismissing_and_reopening_make_no_request(monkeypatch):
    outbound.install_guard(monkeypatch)
    outbound.reset()
    discovery = _discovery()
    catalog = load_seed()
    profile = {"interests": ["jane austen"], "items": []}
    opened = discovery.discovery_dict(catalog, profile, NOW)
    paged = opened["feed"][:4]
    reranked = discovery.discovery_dict(catalog, {"interests": ["jane austen"], "items": []}, NOW)
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
    reopened = discovery.discovery_dict(catalog, profile, NOW)
    assert paged
    assert opened["feed"]
    assert reranked == opened
    assert PRIDE in saved["feed"] and PRIDE not in dismissed["feed"]
    assert reopened == opened
    assert opened["request_counts"] == {"free": 0, "paid": 0}
    assert outbound.counters() == {"free": 0, "paid": 0}
    assert outbound.usage() == {"free": 0, "paid": 0, "cost_usd": 0.0, "unknown_cost_calls": 0}


def test_pref08_read_only_browsing_submits_nothing(monkeypatch):
    """No request at all leaves the process, so no personal context is sent."""
    outbound.install_guard(monkeypatch)
    outbound.reset()
    discovery = _discovery()
    catalog = load_seed()
    for interests in (["jane austen"], ["AI"], [], ["gardening"]):
        view = discovery.discovery_dict(catalog, {"interests": interests, "items": []}, NOW)
        assert view["request_counts"] == {"free": 0, "paid": 0}
    sections = {name: catalog.section(name, NOW) for name in ("videos", "podcasts", "books", "audiobooks")}
    assert sections["podcasts"]
    assert outbound.counters() == {"free": 0, "paid": 0}
    assert outbound.LEDGER.in_flight == 0


def test_job02_reloading_and_displaying_a_stale_feed_starts_no_paid_job(monkeypatch):
    outbound.install_guard(monkeypatch)
    outbound.reset()
    discovery = _discovery()
    catalog = load_seed()
    for _ in range(5):
        view = discovery.discovery_dict(catalog, {"interests": ["jane austen"], "items": []}, NOW)
        assert view["paid_calls"] == 0
    assert outbound.counters() == {"free": 0, "paid": 0}
    assert outbound.LEDGER.in_flight == 0


def test_job04_a_paid_call_with_no_reported_cost_is_unknown(monkeypatch):
    outbound.reset()
    outbound.dispatch(outbound.PAID, lambda: "called", cost=None)
    usage = outbound.usage()
    assert usage["paid"] == 1
    assert usage["cost_usd"] is None
    assert usage["unknown_cost_calls"] == 1
    outbound.reset()
    outbound.dispatch(outbound.PAID, lambda: "called", cost=0.25)
    usage = outbound.usage()
    assert usage == {"free": 0, "paid": 1, "cost_usd": 0.25, "unknown_cost_calls": 0}
    assert outbound.counters() == {"free": 0, "paid": 1}


def test_a_free_request_may_not_carry_a_cost():
    outbound.reset()
    with pytest.raises(ValueError):
        outbound.dispatch(outbound.FREE, lambda: None, cost=1.0)
    with pytest.raises(ValueError):
        outbound.dispatch("metered-ish", lambda: None)
    assert outbound.counters() == {"free": 0, "paid": 0}
