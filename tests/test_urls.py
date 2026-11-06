"""Public HTTPS checks. DNS is injected; the suite does not call live resolvers."""

import socket
import ssl

import pytest

from hackertube_core import outbound
from hackertube_core.errors import RecordError
from hackertube_core.http import (
    HttpError,
    _PinnedHTTPSConnection,
    _pinned_opener,
    connection_targets,
    read_json,
)
from hackertube_core.text import public_https_url

_REJECTED = [
    "https://127.1/",
    "https://2130706433/",
    "https://0x7f000001/",
    "https://0177.0.0.1/",
    "https://10.1/",
    "https://0.0.0.0/",
    "https://169.254.169.254/",
    "https://[::1]/",
    "https://[::ffff:127.0.0.1]/",
    "https://127.0.0.1/",
    "https://10.1.2.3/",
    "https://224.0.0.1/",
    "https://[ff02::1]/",
    "https://[fec0::1]/",
    "https://[::127.0.0.1]/",
    "https://[64:ff9b::7f00:1]/",
    "https://[fe80::1%25eth0]/",
]

_SOURCE_HOSTS = [
    "https://hn.algolia.com/",
    "https://itunes.apple.com/",
    "https://openlibrary.org/",
    "https://librivox.org/",
]

_POLICY_IPS = [
    "224.0.0.1",
    "ff02::1",
    "fec0::1",
    "::127.0.0.1",
    "64:ff9b::7f00:1",
]


def _answer(ip):
    family = socket.AF_INET6 if ":" in ip else socket.AF_INET
    sockaddr = (ip, 0, 0, 0) if family == socket.AF_INET6 else (ip, 0)
    return [(family, socket.SOCK_STREAM, 6, "", sockaddr)]


def _public_resolve(host, port, *args, **kwargs):
    return _answer("1.1.1.1")


@pytest.mark.parametrize("url", _REJECTED)
def test_non_global_and_non_canonical_hosts_are_refused(url):
    with pytest.raises(RecordError):
        public_https_url(url)


@pytest.mark.parametrize("url", _SOURCE_HOSTS)
def test_source_hosts_pass_the_literal_check(url):
    assert public_https_url(url) == url
    host = url.removeprefix("https://").rstrip("/")
    assert connection_targets(host, resolve=_public_resolve) == ["1.1.1.1"]


def test_public_ipv4_and_mapped_ipv6_pass():
    assert public_https_url("https://8.8.8.8/dns") == "https://8.8.8.8/dns"
    assert public_https_url("https://[::ffff:8.8.8.8]/dns") == "https://[::ffff:8.8.8.8]/dns"


def test_read_json_rejects_a_hostname_that_resolves_privately():
    def resolve(host, port, *args, **kwargs):
        return _answer("127.0.0.1")

    class Opener:
        def open(self, request, timeout=None):
            raise AssertionError("network")

    with pytest.raises(RecordError):
        read_json("https://hn.algolia.com/search", opener=Opener(), resolve=resolve, classification=outbound.FREE)


def test_read_json_allows_a_hostname_that_resolves_globally():
    def resolve(host, port, *args, **kwargs):
        return _answer("1.1.1.1")

    class Response:
        status = 200

        def read(self, limit):
            return b'{"ok": true}'

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    class Opener:
        def open(self, request, timeout=None):
            return Response()

    assert read_json("https://example.com/data", opener=Opener(), resolve=resolve, classification=outbound.FREE) == {"ok": True}


def test_read_json_rejects_when_any_answer_is_private_and_none_remain():
    def resolve(host, port, *args, **kwargs):
        return _answer("10.0.0.1")

    class Opener:
        def open(self, request, timeout=None):
            raise AssertionError("network")

    with pytest.raises(RecordError):
        read_json("https://example.com/data", opener=Opener(), resolve=resolve, classification=outbound.FREE)


@pytest.mark.parametrize("ip", _POLICY_IPS)
def test_policy_addresses_are_refused_as_dns_answers(ip):
    def resolve(host, port, *args, **kwargs):
        return _answer(ip)

    class Opener:
        def open(self, request, timeout=None):
            raise AssertionError("network")

    with pytest.raises(RecordError):
        read_json("https://example.com/data", opener=Opener(), resolve=resolve, classification=outbound.FREE)


def test_public_then_private_dns_does_not_connect_to_the_private_address(monkeypatch):
    connects = []
    sni = []

    def resolve(host, port, *args, **kwargs):
        return _answer("1.1.1.1") + _answer("10.0.0.1")

    def fake_create_connection(address, timeout=None, source_address=None):
        connects.append(address)
        return object()

    def fake_wrap(self, sock, server_hostname=None, **kwargs):
        sni.append(server_hostname)
        raise OSError("mocked transport")

    monkeypatch.setattr(socket, "create_connection", fake_create_connection)
    monkeypatch.setattr(ssl.SSLContext, "wrap_socket", fake_wrap)
    with pytest.raises(HttpError):
        read_json("https://example.com/data", resolve=resolve, classification=outbound.FREE)
    assert connects == [("1.1.1.1", 443)]
    assert sni == ["example.com"]


def test_connect_rechecks_every_pinned_address(monkeypatch):
    def fake_create_connection(address, timeout=None, source_address=None):
        raise AssertionError("private socket")

    monkeypatch.setattr(socket, "create_connection", fake_create_connection)
    conn = _PinnedHTTPSConnection(
        "example.com",
        443,
        pinned_ips=["10.0.0.1"],
        server_hostname="example.com",
    )
    with pytest.raises(RecordError):
        conn.connect()


def test_ambient_proxies_are_off(monkeypatch):
    monkeypatch.setenv("http_proxy", "http://127.0.0.1:9")
    monkeypatch.setenv("https_proxy", "http://127.0.0.1:9")
    opener = _pinned_opener("example.com", ["1.1.1.1"])
    assert all(not getattr(handler, "proxies", None) for handler in opener.handlers)
    assert type(opener.handle_open["https"][0]).__name__ == "_PinnedHTTPSHandler"


def test_nat64_with_a_public_embedded_ipv4_is_allowed():
    assert public_https_url("https://[64:ff9b::808:808]/") == "https://[64:ff9b::808:808]/"

    def resolve(host, port, *args, **kwargs):
        return _answer("64:ff9b::808:808")

    class Response:
        status = 200

        def read(self, limit):
            return b'{"ok": true}'

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    class Opener:
        def open(self, request, timeout=None):
            return Response()

    assert read_json("https://example.com/data", opener=Opener(), resolve=resolve, classification=outbound.FREE) == {"ok": True}


def test_literal_private_address_does_not_resolve():
    class Opener:
        def open(self, request, timeout=None):
            raise AssertionError("network")

    with pytest.raises(RecordError):
        read_json("https://10.1/", opener=Opener(), classification=outbound.FREE)
