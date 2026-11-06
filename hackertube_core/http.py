"""Bounded HTTPS reads. Redirects and ambient proxies are off.

``public_https_url`` is a preliminary string check. ``read_json`` is the
fetch boundary: it resolves once, keeps only allowed addresses, and connects
the socket to one of those addresses.
"""

import json
import socket
import ssl
from http.client import HTTPSConnection
from ipaddress import ip_address
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPSHandler, ProxyHandler, Request, build_opener

from hackertube_core.errors import RecordError
from hackertube_core.text import address_is_allowed, host_address, public_https_url

USER_AGENT = "HackerTube/0.1 (Hermes plugin research)"
MAX_BYTES = 1_000_000


class HttpError(RuntimeError):
    pass


class _PinnedHTTPSConnection(HTTPSConnection):
    def __init__(
        self,
        host,
        port=None,
        *,
        pinned_ips,
        server_hostname,
        timeout=socket._GLOBAL_DEFAULT_TIMEOUT,
        source_address=None,
        context=None,
        blocksize=8192,
    ):
        self._pinned_ips = list(pinned_ips)
        self._sni_host = server_hostname
        super().__init__(
            host,
            port,
            timeout=timeout,
            source_address=source_address,
            context=context,
            blocksize=blocksize,
        )

    def connect(self):
        last_error = None
        context = self._context or ssl.create_default_context()
        for ip in self._pinned_ips:
            if "%" in ip:
                raise RecordError("destination")
            try:
                address = ip_address(ip)
            except ValueError:
                raise RecordError("destination") from None
            if not address_is_allowed(address):
                raise RecordError("destination")
            try:
                sock = socket.create_connection((ip, self.port), self.timeout, self.source_address)
            except OSError as exc:
                last_error = exc
                continue
            self.sock = context.wrap_socket(sock, server_hostname=self._sni_host)
            return
        raise OSError("connect failed" if last_error is None else last_error)


class _PinnedHTTPSHandler(HTTPSHandler):
    def __init__(self, pinned_ips, server_hostname):
        super().__init__()
        self._pinned_ips = pinned_ips
        self._server_hostname = server_hostname

    def https_open(self, req):
        pinned = self._pinned_ips
        sni = self._server_hostname

        def factory(host, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, **kwargs):
            return _PinnedHTTPSConnection(
                host,
                timeout=timeout,
                pinned_ips=pinned,
                server_hostname=sni,
                **kwargs,
            )

        return self.do_open(factory, req)


def _no_redirect():
    from urllib.request import HTTPRedirectHandler

    class Refused(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            raise HttpError("redirect refused")

    return Refused()


def connection_targets(host, *, resolve=None):
    """Resolve once. Only allowed addresses are returned, in answer order."""
    literal = host_address(host)
    if literal is not None:
        if not address_is_allowed(literal):
            raise RecordError("destination")
        return [host]
    lookup = resolve or socket.getaddrinfo
    try:
        answers = lookup(host, None)
    except socket.gaierror:
        raise RecordError("destination") from None
    if not answers:
        raise RecordError("destination")
    chosen = []
    for answer in answers:
        raw = answer[4][0]
        if "%" in raw:
            continue
        try:
            address = ip_address(raw)
        except ValueError:
            continue
        if address_is_allowed(address):
            chosen.append(raw)
    if not chosen:
        raise RecordError("destination")
    return chosen


def _pinned_opener(host, pinned_ips):
    return build_opener(
        ProxyHandler({}),
        _no_redirect(),
        _PinnedHTTPSHandler(pinned_ips, host),
    )


def read_json(url, *, timeout=15, opener=None, headers=None, resolve=None):
    public_https_url(url)
    host = (urlsplit(url.strip()).hostname or "").rstrip(".").lower()
    pinned = connection_targets(host, resolve=resolve)
    merged = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if headers:
        merged.update(headers)
    request = Request(url, headers=merged)
    download = opener or _pinned_opener(host, pinned)
    try:
        with download.open(request, timeout=timeout) as response:
            status = getattr(response, "status", 200)
            if status != 200:
                raise HttpError(f"http {status}")
            body = response.read(MAX_BYTES + 1)
    except RecordError:
        raise
    except HTTPError as exc:
        raise HttpError(f"http {exc.code}") from None
    except HttpError:
        raise
    except Exception:
        raise HttpError("request failed") from None
    if len(body) > MAX_BYTES:
        raise HttpError("response too large")
    return json.loads(body)
