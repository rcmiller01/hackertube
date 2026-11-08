"""The single Python-process outbound request boundary.

Every backend outbound network request HackerTube makes goes through
``dispatch``. Browser SDK requests and hotlinked artwork are not in this
process ledger; the browser observation receipt inventories them separately.
Each backend request is counted and labeled by its caller:

- ``free`` is a source-adapter read of public catalog data that costs
  nothing and spends no quota. Its cost is known to be zero.
- ``metered`` is a read against a provider that spends a quota or a plan
  allowance without billing a per-call price, such as the keyed YouTube
  Data API ``videos.list``. The quota is spent even though no invoice line
  appears, so a metered read is never counted as free.
- ``paid`` is a billed model or paid-search call. Its cost is whatever the
  provider reports, or ``None`` when the provider reports nothing. JOB04:
  an unknown cost is reported as unknown, never as zero.

The label is a required argument at the transport boundary
(``hackertube_core.http.read_json``), so a new caller cannot inherit
``free`` by omitting it.

A request attempt is counted once before resolution, even if DNS, address
validation after DNS, connection, or response reading fails. Resolution,
pinned connection, body reading and closing all share that authorized scope.
Pre-dispatch string validation refusals are not counted as requests.

Ordinary browsing, local reranking, and library operations make no backend
outbound request, so this ledger stays zero and ``usage`` reports known zero
backend cost. That does not mean the browser makes zero requests: it reads
local API routes and may load free external artwork. See
``tests/test_browser_requests.js`` for observed browser attempts with offline
artwork fulfillment, not production interception or live provider receipts.

``install_guard`` is the detector for a request that does not pass through
the boundary. ``socket.socket.connect`` and ``connect_ex`` are the point
every TCP and UDP connection reaches in CPython; ``create_connection``,
``http.client``, ``urllib.request`` and the resolving functions are
wrapped as well so a caller using a helper is refused before the
chokepoint. A connection attempt with no boundary request in progress on
the current thread raises ``NetworkOutsideBoundary`` instead of reaching
the network. ``tests/test_request_boundary.py`` drives browsing,
reranking, and library operations under the guard, so a new direct
connection fails the suite. Live DNS resolution is separately refused
suite-wide by ``tests/conftest.py``.
"""

import contextvars
from contextlib import contextmanager
from dataclasses import dataclass

FREE = "free"
METERED = "metered"
PAID = "paid"
LABELS = (FREE, METERED, PAID)

#: Requests this thread is inside. ``dispatch`` raises it for the duration
#: of a boundary request, so the guard can tell boundary traffic from a
#: connection opened around the boundary. A context variable rather than a
#: shared counter so one thread's request does not authorise another
#: thread's connection.
_IN_FLIGHT = contextvars.ContextVar("hackertube_outbound_in_flight", default=0)


class NetworkOutsideBoundary(RuntimeError):
    """A connection was opened without going through the boundary."""


@dataclass
class Boundary:
    """Counts dispatched requests by label and tracks in-flight calls."""

    free: int = 0
    metered: int = 0
    paid: int = 0
    cost_usd: float = 0.0
    unknown_cost_calls: int = 0

    @property
    def in_flight(self):
        """Requests this thread is currently inside."""
        return _IN_FLIGHT.get()

    def dispatch(self, label, perform, *args, cost=None, **kwargs):
        """Send one outbound request through the boundary.

        ``perform`` is the callable that actually reaches the network.
        ``label`` is required and must be ``free``, ``metered``, or
        ``paid``. ``cost`` is the provider cost in US dollars, or ``None``
        when the provider reports none. Only a paid request may carry a
        cost: a free read has none, and a metered read spends quota rather
        than billing a price.
        """
        if label not in LABELS:
            raise ValueError(f"unknown request label: {label!r}")
        if label == FREE and cost not in (None, 0, 0.0):
            raise ValueError("a free request has no cost")
        if label == METERED and cost not in (None, 0, 0.0):
            raise ValueError("a metered request spends quota, not a billed cost")
        token = _IN_FLIGHT.set(_IN_FLIGHT.get() + 1)
        try:
            if label == PAID:
                self.paid += 1
                if cost is None:
                    self.unknown_cost_calls += 1
                else:
                    self.cost_usd += float(cost)
            elif label == METERED:
                self.metered += 1
            else:
                self.free += 1
            return perform(*args, **kwargs)
        finally:
            _IN_FLIGHT.reset(token)

    def counters(self):
        """Request counts by label."""
        return {"free": self.free, "paid": self.paid, "metered": self.metered}

    def charged(self):
        """Requests that spent money or a metered allowance.

        The page shows this as ``paid_calls``, so a metered read is caught
        by the same assertion that catches a billed one.
        """
        return self.paid + self.metered

    def usage(self):
        """Accounted usage. A paid call with no reported cost is ``None``."""
        if self.unknown_cost_calls:
            return {
                "free": self.free,
                "paid": self.paid,
                "metered": self.metered,
                "cost_usd": None,
                "unknown_cost_calls": self.unknown_cost_calls,
            }
        return {
            "free": self.free,
            "paid": self.paid,
            "metered": self.metered,
            "cost_usd": self.cost_usd,
            "unknown_cost_calls": 0,
        }

    def reset(self):
        self.free = 0
        self.metered = 0
        self.paid = 0
        self.cost_usd = 0.0
        self.unknown_cost_calls = 0


LEDGER = Boundary()


def dispatch(label, perform, *args, cost=None, **kwargs):
    """Send one outbound request through the process boundary."""
    return LEDGER.dispatch(label, perform, *args, cost=cost, **kwargs)


def counters():
    return LEDGER.counters()


def charged():
    return LEDGER.charged()


def usage():
    return LEDGER.usage()


def reset():
    LEDGER.reset()


def guard_targets():
    """Every connection entry point the guard replaces.

    ``socket.socket.connect`` and ``connect_ex`` are where a TCP or UDP
    connection is actually established; ``sendto`` and ``sendmsg`` are the
    connectionless UDP paths. The rest are helpers that reach one of those,
    wrapped so a caller using a helper is refused before the chokepoint and
    so the refusal names the call that was made.
    """
    import http.client
    import socket
    import urllib.request

    return (
        (socket.socket, "connect"),
        (socket.socket, "connect_ex"),
        (socket.socket, "sendto"),
        (socket.socket, "sendmsg"),
        (socket, "create_connection"),
        (socket, "getaddrinfo"),
        (socket, "gethostbyname"),
        (socket, "gethostbyname_ex"),
        (http.client.HTTPConnection, "connect"),
        (http.client.HTTPSConnection, "connect"),
        (urllib.request, "urlopen"),
    )


def entry_name(owner, attribute):
    """The dotted name of one connection entry point.

    A class carries its qualified name, so ``socket.socket.connect`` reads as
    the socket method and not as a function on the ``socket`` module.
    """
    if isinstance(owner, type):
        return f"{owner.__module__}.{owner.__qualname__}.{attribute}"
    return f"{owner.__name__}.{attribute}"


def install_guard(monkeypatch):
    """Fail a connection that opens without an active ``dispatch``.

    The wrapper reads the in-flight request count for the current thread,
    which ``dispatch`` raises for the duration of a boundary request, so
    traffic through the boundary is allowed and anything else raises
    ``NetworkOutsideBoundary``.
    """
    for owner, attribute in guard_targets():
        monkeypatch.setattr(owner, attribute, guarded(owner, attribute))


@contextmanager
def guard():
    """Install the boundary guard for the duration of a ``with`` block.

    The same replacement ``install_guard`` makes through ``monkeypatch``,
    for a caller that is not a pytest fixture.
    """
    saved = []
    try:
        for owner, attribute in guard_targets():
            saved.append((owner, attribute, getattr(owner, attribute)))
            setattr(owner, attribute, guarded(owner, attribute))
        yield
    finally:
        for owner, attribute, original in reversed(saved):
            setattr(owner, attribute, original)


def guarded(owner, attribute):
    """The boundary-aware replacement for one connection entry point."""
    real = getattr(owner, attribute)
    return _checked(entry_name(owner, attribute), real)


def _checked(name, real):
    def checked(*args, **kwargs):
        if _IN_FLIGHT.get() == 0:
            raise NetworkOutsideBoundary(name)
        return real(*args, **kwargs)

    checked.__name__ = getattr(real, "__name__", "checked")
    return checked