"""Bounded HTTPS reads. Redirects are refused. No credential file is opened."""

import json
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from hackertube_core.errors import RecordError
from hackertube_core.text import public_https_url

USER_AGENT = "HackerTube/0.1 (Hermes plugin research)"
MAX_BYTES = 1_000_000


class HttpError(RuntimeError):
    pass


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise HttpError("redirect refused")


def read_json(url, *, timeout=15, opener=None, headers=None):
    public_https_url(url)
    merged = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if headers:
        merged.update(headers)
    request = Request(url, headers=merged)
    download = opener or build_opener(_NoRedirect())
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
    except Exception as exc:
        raise HttpError("request failed") from None
    if len(body) > MAX_BYTES:
        raise HttpError("response too large")
    return json.loads(body)
