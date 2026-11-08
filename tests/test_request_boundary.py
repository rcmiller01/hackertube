"""Task 3.3: the outbound request boundary.

FEED04, PREF08, JOB02, and JOB04. Every backend outbound call goes through
``hackertube_core.outbound`` and is counted under the label its caller
declares. A test here fails when code reaches the network around that
boundary, when a metered read is counted as free, or when a connection
entry point is left unguarded.

The scenario-level receipts that drive the real dashboard routes and the
real page controls live in ``tests/test_request_boundary_routes.py`` and
``tests/test_dashboard_page.js``.
"""

import ast
import socket
import ssl
import threading
from pathlib import Path

import pytest

from hackertube_core import outbound
from hackertube_core.adapters import youtube
from hackertube_core.http import HttpError, read_json

ROOT = Path(__file__).resolve().parents[1]
PACKAGES = (ROOT / "hackertube",)

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
    "hackertube/hackertube_core/http.py": {"socket", "ssl", "http.client", "urllib.request"},
    "hackertube/hackertube_core/outbound.py": {"socket", "http.client", "urllib.request"},
    "hackertube/hackertube_core/text.py": {"socket"},
}

#: Calls that open, send on, or resolve a connection. Only the boundary
#: module and the one transport that dispatches through it may use them.
CONNECTION_CALLS = {
    "connect",
    "connect_ex",
    "sendto",
    "sendmsg",
    "urlopen",
    "urlretrieve",
    "open_connection",
    "create_connection",
    "getaddrinfo",
    "gethostbyname",
    "gethostbyname_ex",
}
ALLOWED_CONNECTION_CALLS = {
    "hackertube/hackertube_core/http.py",
    "hackertube/hackertube_core/outbound.py",
}

#: Scheduling primitives a recurring paid job would need.
SCHEDULING_MODULES = {"sched", "apscheduler", "threading", "multiprocessing", "concurrent.futures"}
SCHEDULING_CALLS = {"create_task", "call_later", "call_at", "enter", "Timer"}


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


def _listener():
    """A real loopback listener. No external traffic is involved."""
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    return server


# --- the boundary is the only path to the network -------------------------


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


def test_no_module_calls_a_connection_entry_point_outside_the_boundary():
    """A module that calls connect/urlopen/resolve outside the boundary fails.

    The import allowlist above cannot catch this on its own: ``http.py`` and
    ``text.py`` are already allowed to import ``socket``, so a second
    connection in either file would pass that test. This one checks the calls.
    """
    offenders = {}
    for path in _package_files():
        relative = _relative(path)
        if relative in ALLOWED_CONNECTION_CALLS:
            continue
        tree = ast.parse(path.read_text(), filename=str(path))
        found = _attribute_names(tree) & CONNECTION_CALLS
        if found:
            offenders[relative] = sorted(found)
    assert offenders == {}, f"connection calls outside the boundary: {offenders}"


def test_no_module_schedules_recurring_work():
    """JOB02: only explicit Search monitors and local retention may use threads."""
    offenders = {}
    for path in _package_files():
        tree = ast.parse(path.read_text(), filename=str(path))
        modules = _imported_modules(tree) & SCHEDULING_MODULES
        # This controller creates a monitor only after an explicit accepted
        # Search. Real-process tests verify no worker on reads/without consent.
        if _relative(path) in {"hackertube/hackertube_core/search_jobs.py", "hackertube/hackertube_core/privacy.py"}:
            modules -= {"threading"}
        calls = _attribute_names(tree) & SCHEDULING_CALLS
        if modules or calls:
            offenders[_relative(path)] = sorted(modules) + sorted(calls)
    assert offenders == {}, f"recurring work outside a job: {offenders}"


def test_the_guard_replaces_every_connection_entry_point():
    """Removing a target from the guard fails here before it ships.

    Enumerated from ``guard_targets`` and compared against the literal set,
    so deleting one entry point fails rather than silently shrinking cover.
    """
    expected = {
        "socket.socket.connect",
        "socket.socket.connect_ex",
        "socket.socket.sendto",
        "socket.socket.sendmsg",
        "socket.create_connection",
        "socket.getaddrinfo",
        "socket.gethostbyname",
        "socket.gethostbyname_ex",
        "http.client.HTTPConnection.connect",
        "http.client.HTTPSConnection.connect",
        "urllib.request.urlopen",
    }
    names = {outbound.entry_name(owner, attribute) for owner, attribute in outbound.guard_targets()}
    assert names == expected


def test_every_guard_target_refuses_a_connection_outside_the_boundary(monkeypatch):
    """Each entry point raises, in turn, with no external traffic."""
    outbound.install_guard(monkeypatch)
    outbound.reset()
    server = _listener()
    address = server.getsockname()
    try:
        calls = {
            "socket.socket.connect": lambda: socket.socket().connect(address),
            "socket.socket.connect_ex": lambda: socket.socket().connect_ex(address),
            "socket.socket.sendto": lambda: socket.socket().sendto(b"x", address),
            "socket.socket.sendmsg": lambda: socket.socket().sendmsg([b"x"], [], 0, address),
            "socket.create_connection": lambda: socket.create_connection(address),
            "socket.getaddrinfo": lambda: socket.getaddrinfo("example.com", 443),
            "socket.gethostbyname": lambda: socket.gethostbyname("example.com"),
            "socket.gethostbyname_ex": lambda: socket.gethostbyname_ex("example.com"),
            "http.client.HTTPConnection.connect": lambda: __import__("http.client", fromlist=["x"]).HTTPConnection(
                "example.com"
            ).connect(),
            "http.client.HTTPSConnection.connect": lambda: __import__("http.client", fromlist=["x"]).HTTPSConnection(
                "example.com"
            ).connect(),
            "urllib.request.urlopen": lambda: __import__("urllib.request", fromlist=["x"]).urlopen(
                "https://example.com/data"
            ),
        }
        assert set(calls) == {
            outbound.entry_name(owner, attribute) for owner, attribute in outbound.guard_targets()
        }
        for name, call in calls.items():
            with pytest.raises(outbound.NetworkOutsideBoundary):
                call()
        assert outbound.counters() == {"free": 0, "paid": 0, "metered": 0}
    finally:
        server.close()


def test_a_loopback_connection_inside_the_boundary_is_permitted(monkeypatch):
    """The guard allows real traffic that passes through ``dispatch``.

    A refusal-only detector would also pass the test above; this proves the
    guard is a gate and not a wall, and that the counter moves with it.
    """
    outbound.install_guard(monkeypatch)
    outbound.reset()
    server = _listener()
    address = server.getsockname()
    client = socket.socket()
    try:
        rc = outbound.dispatch(outbound.FREE, client.connect_ex, address)
        assert rc == 0, "the guarded connect_ex did not reach the loopback listener"
        assert outbound.counters() == {"free": 1, "paid": 0, "metered": 0}
    finally:
        client.close()
        server.close()


def test_a_connection_on_another_thread_is_still_refused(monkeypatch):
    """One thread's boundary request does not authorise another thread.

    The in-flight marker is a context variable, so the guard fails closed for
    a worker thread that was started from inside a request.
    """
    outbound.install_guard(monkeypatch)
    outbound.reset()
    server = _listener()
    address = server.getsockname()
    outcome = {}

    def worker():
        try:
            socket.socket().connect_ex(address)
        except outbound.NetworkOutsideBoundary:
            outcome["refused"] = True
        except Exception as exc:  # pragma: no cover - a different failure is a real bug
            outcome["error"] = repr(exc)

    def inside_boundary():
        thread = threading.Thread(target=worker)
        thread.start()
        thread.join()

    try:
        outbound.dispatch(outbound.FREE, inside_boundary)
        assert outcome == {"refused": True}, outcome
        assert outbound.counters() == {"free": 1, "paid": 0, "metered": 0}
    finally:
        server.close()


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
        read_json("https://example.com/data", classification=outbound.FREE, resolve=_resolve)
    assert seen == [(("1.1.1.1", 443), 1)]
    assert outbound.counters() == {"free": 1, "paid": 0, "metered": 0}


# --- every read declares what it costs ------------------------------------

def test_an_unmetered_source_read_is_counted_free(monkeypatch):
    outbound.install_guard(monkeypatch)
    outbound.reset()
    for _ in range(3):
        assert read_json(
            "https://example.com/data",
            classification=outbound.FREE,
            opener=_opener(),
            resolve=_resolve,
        ) == {"ok": True}
    assert outbound.counters() == {"free": 3, "paid": 0, "metered": 0}
    assert outbound.usage()["cost_usd"] == 0.0


def test_the_keyed_youtube_read_is_counted_metered_not_free(monkeypatch):
    """videos.list spends the project's Data API quota, so it is not free.

    ``docs/sources.md`` and ``docs/feasibility-sources.md`` both record the
    quota consumption. The adapter is disabled in the default seed, so this
    drives its transport directly with an injected opener.
    """
    outbound.install_guard(monkeypatch)
    outbound.reset()
    result = youtube.fetch_data_api("docSampleId", "test-key", opener=_opener(), resolve=_resolve)
    assert result["called"] is True
    assert outbound.counters() == {"free": 0, "paid": 0, "metered": 1}
    usage = outbound.usage()
    assert usage["metered"] == 1
    assert usage["free"] == 0
    assert usage["cost_usd"] == 0.0
    assert outbound.charged() == 1


def test_a_metered_read_is_not_reported_as_a_paid_cost():
    outbound.reset()
    outbound.dispatch(outbound.METERED, lambda: "quota read")
    assert outbound.counters() == {"free": 0, "paid": 0, "metered": 1}
    with pytest.raises(ValueError):
        outbound.dispatch(outbound.METERED, lambda: None, cost=0.25)


def test_read_json_requires_an_explicit_classification():
    """A caller that forgets to classify cannot inherit ``free``."""
    outbound.reset()
    with pytest.raises(TypeError):
        read_json("https://example.com/data", opener=_opener(), resolve=_resolve)  # type: ignore[call-arg]
    with pytest.raises(ValueError):
        read_json(
            "https://example.com/data",
            classification="cheap",
            opener=_opener(),
            resolve=_resolve,
        )
    assert outbound.counters() == {"free": 0, "paid": 0, "metered": 0}


# --- JOB04 accounting -----------------------------------------------------


def test_job04_a_paid_call_with_no_reported_cost_is_unknown(monkeypatch):
    outbound.install_guard(monkeypatch)
    outbound.reset()
    outbound.dispatch(outbound.PAID, lambda: "called", cost=None)
    usage = outbound.usage()
    assert usage["paid"] == 1
    assert usage["cost_usd"] is None
    assert usage["unknown_cost_calls"] == 1
    outbound.reset()
    outbound.dispatch(outbound.PAID, lambda: "called", cost=0.25)
    usage = outbound.usage()
    assert usage == {
        "free": 0,
        "paid": 1,
        "metered": 0,
        "cost_usd": 0.25,
        "unknown_cost_calls": 0,
    }
    assert outbound.counters() == {"free": 0, "paid": 1, "metered": 0}


def test_a_free_request_may_not_carry_a_cost():
    outbound.reset()
    with pytest.raises(ValueError):
        outbound.dispatch(outbound.FREE, lambda: None, cost=1.0)
    with pytest.raises(ValueError):
        outbound.dispatch("metered-ish", lambda: None)
    assert outbound.counters() == {"free": 0, "paid": 0, "metered": 0}