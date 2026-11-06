"""Offline regression for the real default resolver (no resolve= injection).

The resolver and transport are replaced *beneath* the production guard.
Assertions observe authorization and independent calls, not just the ledger.
"""
import io
import socket
from types import SimpleNamespace

import pytest

from hackertube_core import outbound
from hackertube_core.errors import RecordError
from hackertube_core.http import HttpError, read_json


@pytest.mark.parametrize("label", [outbound.FREE, outbound.METERED, outbound.PAID])
def test_default_resolver_and_response_body_share_one_counted_scope(monkeypatch, label):
    observed = []

    def lookup(host, port):
        observed.append(("dns", host, outbound.LEDGER.in_flight))
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", 0))]

    class Response(io.BytesIO):
        status = 200

        def read(self, size):
            observed.append(("body", size, outbound.LEDGER.in_flight))
            return super().read(size)

    def open_request(request, timeout):
        observed.append(("open", request.full_url, outbound.LEDGER.in_flight))
        return Response(b'{"ok":true}')

    monkeypatch.setattr(socket, "getaddrinfo", lookup)
    outbound.install_guard(monkeypatch)
    assert read_json("https://example.com/data", classification=label,
                     opener=SimpleNamespace(open=open_request)) == {"ok": True}
    assert [entry[0] for entry in observed] == ["dns", "open", "body"]
    assert all(entry[2] == 1 for entry in observed), observed
    assert outbound.counters() == {key: int(key == label) for key in outbound.LABELS}
    assert outbound.LEDGER.in_flight == 0


@pytest.mark.parametrize("failure", ["dns", "empty", "private", "open", "body"])
def test_default_resolver_failures_count_one_attempt_and_clear_scope(monkeypatch, failure):
    observed = []

    def lookup(host, port):
        observed.append(("dns", outbound.LEDGER.in_flight))
        if failure == "dns":
            raise socket.gaierror("offline lookup failure")
        if failure == "empty":
            return []
        ip = "127.0.0.1" if failure == "private" else "1.1.1.1"
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))]

    class Response(io.BytesIO):
        status = 200

        def read(self, size):
            observed.append(("body", outbound.LEDGER.in_flight))
            raise OSError("offline body failure")

    def open_request(request, timeout):
        observed.append(("open", outbound.LEDGER.in_flight))
        if failure == "open":
            raise OSError("offline connection failure")
        return Response()

    monkeypatch.setattr(socket, "getaddrinfo", lookup)
    outbound.install_guard(monkeypatch)
    expected = RecordError if failure in {"dns", "empty", "private"} else HttpError
    with pytest.raises(expected):
        read_json("https://example.com/data", classification=outbound.FREE,
                  opener=SimpleNamespace(open=open_request))
    assert observed[0] == ("dns", 1)
    assert all(scope == 1 for _, scope in observed), observed
    if failure in {"dns", "empty", "private"}:
        assert len(observed) == 1  # unsafe/unresolved address never reaches opener
    assert outbound.counters() == {"free": 1, "paid": 0, "metered": 0}
    assert outbound.LEDGER.in_flight == 0
    with pytest.raises(outbound.NetworkOutsideBoundary):
        socket.getaddrinfo("example.com", None)
