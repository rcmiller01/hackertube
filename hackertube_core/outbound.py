"""The single outbound request boundary.

Every outbound network request HackerTube makes goes through
``dispatch``. Each request is counted and labeled ``free`` or ``paid``:

- ``free`` is a source-adapter read of public catalog data. It costs
  nothing, and its cost is known to be zero.
- ``paid`` is a model, paid-search, or metered provider call. Its cost is
  whatever the provider reports, or ``None`` when the provider reports
  nothing. JOB04: an unknown cost is reported as unknown, never as zero.

Ordinary browsing, local reranking, and library operations make no
request at all, so both counters stay zero and ``usage`` reports a known
zero cost.

``install_guard`` is the detector for a request that does not pass through
the boundary. It replaces every connection entry point so any socket that
opens without an active ``dispatch`` raises ``NetworkOutsideBoundary``
instead of reaching the network. ``tests/test_request_boundary.py`` drives
browsing, reranking, and library operations under the guard, so a new
direct connection fails the suite. Live DNS resolution is separately
refused suite-wide by ``tests/conftest.py``; the guard covers connection
establishment.
"""

from dataclasses import dataclass

FREE = "free"
PAID = "paid"
LABELS = (FREE, PAID)


class NetworkOutsideBoundary(RuntimeError):
    """A connection was opened without going through the boundary."""


@dataclass
class Boundary:
    """Counts dispatched requests by label and tracks in-flight calls."""

    free: int = 0
    paid: int = 0
    cost_usd: float = 0.0
    unknown_cost_calls: int = 0
    in_flight: int = 0

    def dispatch(self, label, perform, *args, cost=None, **kwargs):
        """Send one outbound request through the boundary.

        ``perform`` is the callable that actually reaches the network.
        ``cost`` is the provider cost in US dollars, or ``None`` when the
        provider reports none. A free request may not carry a nonzero cost.
        """
        if label not in LABELS:
            raise ValueError(f"unknown request label: {label!r}")
        if label == FREE and cost not in (None, 0, 0.0):
            raise ValueError("a free request has no cost")
        self.in_flight += 1
        try:
            if label == PAID:
                self.paid += 1
                if cost is None:
                    self.unknown_cost_calls += 1
                else:
                    self.cost_usd += float(cost)
            else:
                self.free += 1
            return perform(*args, **kwargs)
        finally:
            self.in_flight -= 1

    def counters(self):
        """Request counts by label."""
        return {"free": self.free, "paid": self.paid}

    def usage(self):
        """Accounted usage. A paid call with no reported cost is ``None``."""
        if self.unknown_cost_calls:
            return {
                "free": self.free,
                "paid": self.paid,
                "cost_usd": None,
                "unknown_cost_calls": self.unknown_cost_calls,
            }
        return {
            "free": self.free,
            "paid": self.paid,
            "cost_usd": self.cost_usd,
            "unknown_cost_calls": 0,
        }

    def reset(self):
        self.free = 0
        self.paid = 0
        self.cost_usd = 0.0
        self.unknown_cost_calls = 0
        self.in_flight = 0


LEDGER = Boundary()


def dispatch(label, perform, *args, cost=None, **kwargs):
    """Send one outbound request through the process boundary."""
    return LEDGER.dispatch(label, perform, *args, cost=cost, **kwargs)


def counters():
    return LEDGER.counters()


def usage():
    return LEDGER.usage()


def reset():
    LEDGER.reset()


def guard_targets():
    """The live ``(owner, attribute)`` connection entry points."""
    import http.client
    import socket
    import urllib.request

    return (
        (socket, "create_connection"),
        (socket.socket, "connect"),
        (http.client.HTTPConnection, "connect"),
        (http.client.HTTPSConnection, "connect"),
        (urllib.request, "urlopen"),
    )


def install_guard(monkeypatch):
    """Fail a connection that opens without an active ``dispatch``.

    The wrapper reads ``LEDGER.in_flight``, which ``dispatch`` raises for
    the duration of a boundary request, so traffic through the boundary is
    allowed and anything else raises ``NetworkOutsideBoundary``.
    """
    for owner, attribute in guard_targets():
        monkeypatch.setattr(owner, attribute, guarded(owner, attribute))


def guarded(owner, attribute):
    """The boundary-aware replacement for one connection entry point."""
    real = getattr(owner, attribute)
    return _checked(f"{owner.__name__}.{attribute}", real)


def _checked(name, real):
    def checked(*args, **kwargs):
        if LEDGER.in_flight == 0:
            raise NetworkOutsideBoundary(name)
        return real(*args, **kwargs)

    checked.__name__ = getattr(real, "__name__", "checked")
    return checked
