"""Public HTTPS checks, including non-canonical IP spellings and DNS."""

import socket

import pytest

from hackertube_core.errors import RecordError
from hackertube_core.http import assert_resolved_public, read_json
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
]

_SOURCE_HOSTS = [
    "https://hn.algolia.com/",
    "https://itunes.apple.com/",
    "https://openlibrary.org/",
    "https://librivox.org/",
]


@pytest.mark.parametrize("url", _REJECTED)
def test_non_global_and_non_canonical_hosts_are_refused(url):
    with pytest.raises(RecordError):
        public_https_url(url)


@pytest.mark.parametrize("url", _SOURCE_HOSTS)
def test_source_hosts_pass_the_literal_check(url):
    assert public_https_url(url) == url


@pytest.mark.parametrize(
    "host",
    ["hn.algolia.com", "itunes.apple.com", "openlibrary.org", "librivox.org"],
)
def test_source_hosts_resolve_to_global_addresses(host):
    assert_resolved_public(host)


def test_public_ipv4_and_mapped_ipv6_pass():
    assert public_https_url("https://8.8.8.8/dns") == "https://8.8.8.8/dns"
    assert public_https_url("https://[::ffff:8.8.8.8]/dns") == "https://[::ffff:8.8.8.8]/dns"


def _answer(ip):
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))]


def test_read_json_rejects_a_hostname_that_resolves_privately():
    def resolve(host, port, *args, **kwargs):
        assert host == "hn.algolia.com"
        return _answer("127.0.0.1")

    class Opener:
        def open(self, request, timeout=None):
            raise AssertionError("network")

    with pytest.raises(RecordError):
        read_json("https://hn.algolia.com/search", opener=Opener(), resolve=resolve)


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

    assert read_json("https://example.com/data", opener=Opener(), resolve=resolve) == {"ok": True}


def test_read_json_rejects_when_any_answer_is_private():
    def resolve(host, port, *args, **kwargs):
        return _answer("1.1.1.1") + _answer("10.0.0.1")

    class Opener:
        def open(self, request, timeout=None):
            raise AssertionError("network")

    with pytest.raises(RecordError):
        read_json("https://example.com/data", opener=Opener(), resolve=resolve)


def test_literal_private_address_does_not_resolve(monkeypatch):
    def explode(*args, **kwargs):
        raise AssertionError("dns")

    monkeypatch.setattr(socket, "getaddrinfo", explode)

    class Opener:
        def open(self, request, timeout=None):
            raise AssertionError("network")

    with pytest.raises(RecordError):
        read_json("https://10.1/", opener=Opener())
