"""Plain-text and URL limits shared by records and adapters."""

import re
import socket
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from ipaddress import ip_address, ip_network
from urllib.parse import parse_qs, urlsplit

from hackertube_core.errors import RecordError

_TAG = re.compile(r"<[^>]*>")
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
_TIME = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
_DURATION = re.compile(
    r"^P(?:(?P<days>\d+)D)?T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?$"
)
_YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{6,64}$")
_STOPWORDS = frozenset(
    """
    what when where which with from that this your have about should would
    could into want wants watch watches read listen the and for are was will
    can just than then them they this into over some
    """.split()
)


def render_untrusted(value):
    """Return text that cannot carry markup. Non-strings become empty."""
    if not isinstance(value, str):
        return ""
    text = _TAG.sub("", value)
    text = unescape(text)
    text = _TAG.sub("", text)
    return _CONTROL.sub("", text)


def plain_title(value):
    text = render_untrusted(value).strip()
    if not text or len(text) > 300 or "<" in text or ">" in text:
        raise RecordError("title")
    return text


def canon_time(value):
    if not isinstance(value, str) or not _TIME.fullmatch(value):
        raise RecordError("time")
    datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
    return value


def plus_days(stamp, days):
    start = datetime.strptime(canon_time(stamp), "%Y-%m-%dT%H:%M:%SZ")
    return (start + timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")


def http_date_to_z(value):
    parsed = parsedate_to_datetime(value)
    if parsed is None:
        raise RecordError("time")
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _canonical_ipv4(host):
    parts = host.split(".")
    if len(parts) != 4:
        return None
    octets = []
    for part in parts:
        if not part.isascii() or not part.isdigit() or (len(part) > 1 and part.startswith("0")):
            return None
        number = int(part, 10)
        if number > 255:
            return None
        octets.append(str(number))
    return ip_address(".".join(octets))


def _numeric_ip_form(host):
    """True when inet_aton would accept a non-canonical IPv4 spelling."""
    try:
        socket.inet_aton(host)
    except OSError:
        return False
    return True


def host_address(host):
    """Return a parsed IP, or None for a hostname. Non-canonical numeric forms are refused."""
    if "%" in host:
        raise RecordError("destination")
    if ":" in host:
        try:
            return ip_address(host)
        except ValueError:
            raise RecordError("destination") from None
    canonical = _canonical_ipv4(host)
    if canonical is not None:
        return canonical
    if _numeric_ip_form(host):
        raise RecordError("destination")
    return None


_V4_COMPATIBLE = ip_network("::/96")
_NAT64 = ip_network("64:ff9b::/96")


def address_is_allowed(address):
    """Shared allowlist for literals and DNS answers. ``is_global`` alone is not enough."""
    mapped = getattr(address, "ipv4_mapped", None)
    if mapped is not None:
        return address_is_allowed(mapped)
    if address.version == 6 and address in _NAT64:
        embedded = ip_address(int(address) & 0xFFFFFFFF)
        return address_is_allowed(embedded)
    if address.version == 6 and address in _V4_COMPATIBLE:
        return False
    if (
        address.is_multicast
        or address.is_unspecified
        or address.is_loopback
        or address.is_link_local
        or getattr(address, "is_site_local", False)
        or getattr(address, "is_reserved", False)
    ):
        return False
    return bool(address.is_global)


def public_https_url(value):
    """Preliminary screen for a URL string. ``read_json`` is the fetch boundary."""
    if not isinstance(value, str) or not value.strip() or len(value) > 2000:
        raise RecordError("destination")
    parts = urlsplit(value.strip())
    host = (parts.hostname or "").rstrip(".").lower()
    if (
        parts.scheme != "https"
        or not host
        or parts.username
        or parts.password
        or host == "localhost"
        or host.endswith(".localhost")
        or host.endswith(".local")
    ):
        raise RecordError("destination")
    address = host_address(host)
    if address is not None and not address_is_allowed(address):
        raise RecordError("destination")
    return value.strip()


def youtube_video_id(value):
    try:
        cleaned = public_https_url(value)
    except RecordError:
        return None
    parts = urlsplit(cleaned)
    host = parts.hostname.lower()
    if host.startswith("www."):
        host = host[4:]
    if host == "youtu.be":
        video_id = parts.path.strip("/").split("/")[0]
    elif host in {"youtube.com", "m.youtube.com"} and parts.path == "/watch":
        video_id = (parse_qs(parts.query).get("v") or [None])[0]
    else:
        return None
    if not video_id or not _YOUTUBE_ID.fullmatch(video_id):
        return None
    return video_id


def iso_duration_seconds(value):
    """Parse an ISO 8601 duration. Anything else stays unknown."""
    if not isinstance(value, str):
        return None
    match = _DURATION.fullmatch(value)
    if not match:
        return None
    parts = {name: int(match.group(name) or 0) for name in ("days", "hours", "minutes", "seconds")}
    if parts == {"days": 0, "hours": 0, "minutes": 0, "seconds": 0} and "T" not in value:
        return None
    if not any(match.group(name) for name in ("days", "hours", "minutes", "seconds")):
        return None
    return parts["days"] * 86400 + parts["hours"] * 3600 + parts["minutes"] * 60 + parts["seconds"]


def millis_to_seconds(value):
    if type(value) is not int or value <= 0 or value % 1000:
        return None
    return value // 1000


def tokens(text):
    words = re.findall(r"[a-z0-9]+", text.lower())
    return tuple(word for word in words if len(word) >= 4 and word not in _STOPWORDS)


def source_display_name(source_id, destination, fallback):
    """Apple's shared API serves two stores; label the actual item destination."""
    if source_id == "itunes":
        host = (urlsplit(destination).hostname or "").lower()
        if host == "books.apple.com":
            return "Apple Books"
        if host == "podcasts.apple.com":
            return "Apple Podcasts"
    return fallback
