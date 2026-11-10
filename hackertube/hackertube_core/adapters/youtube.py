"""YouTube catalog metadata. oEmbed stays disabled.

The explicit search path can use a configured Data API key with 30-day
metadata expiry. The static seed and legacy ingestion defaults remain disabled.
"""

from urllib.parse import urlencode, urlsplit

from hackertube_core import outbound
from hackertube_core.adapters.base import ParseResult
from hackertube_core.errors import RecordError
from hackertube_core.http import read_image_status, read_json
from hackertube_core.records import Evidence, MediaItem, blank_art
from hackertube_core.text import iso_duration_seconds, plus_days, public_https_url

DATA_API = "https://www.googleapis.com/youtube/v3/videos"
ENABLED = False
BLOCKED_REASON = "unresolved-terms"
ART_REASON = "YouTube art is not stored while the adapter is disabled."
NO_THUMBNAIL_REASON = "The Data API response carried no official thumbnail URL."
UNCLEARED_THUMBNAIL_REASON = "The Data API thumbnail did not clear the display check."
#: Hosts that serve an official YouTube thumbnail. A URL the Data API did not
#: return, or one on any other host, is never turned into stored artwork.
THUMBNAIL_HOSTS = ("i.ytimg.com", "img.youtube.com")
#: Largest first. ``hqdefault`` and smaller letterbox the 16:9 image; that
#: letterboxing is part of the official image and must not be cropped away,
#: so the presentation keeps the image's own aspect ratio.
THUMBNAIL_KEYS = ("maxres", "standard", "high", "medium", "default")
POLICY = {
    "source_id": "youtube",
    "name": "YouTube",
    "role": "catalog",
    "attribution": "YouTube. A later enabled card would link to the watch page.",
    "retention": (
        "Disabled. oEmbed title, channel, player HTML, and thumbnails are not stored. "
        "Data API evidence, if a key is later supplied, still expires after 30 days."
    ),
    "refresh": (
        "Disabled. If the Data API path is enabled later, non-authorized metadata must be "
        "re-read within 30 calendar days (developer policies III.E). No record is stored now, "
        "so no seeded row expires."
    ),
    "deletion": "Nothing from oEmbed is stored. Data API metadata would be deleted or refreshed within 30 calendar days.",
    "formats": ("video",),
}


def watch_url(video_id):
    return f"https://www.youtube.com/watch?v={video_id}"


def _video(
    video_id,
    title,
    contributors,
    duration,
    availability,
    retrieved_at,
    art_reason,
    art=None,
):
    item_id = f"youtube:{video_id}"
    artwork = blank_art(art_reason)
    if art is not None:
        # Zero paid calls: this URL came back on the keyed videos.list payload
        # the search already reads, and only a FREE image check cleared it.
        artwork = {
            "art_url": art["url"],
            "art_hotlink": True,
            "art_cache": False,
            "art_reason": art_reason,
            "art_checked_at": art["checked_at"],
            "art_http_status": 200,
        }
    return MediaItem(
        item_id=item_id,
        format="video",
        title=title,
        destination=watch_url(video_id),
        contributors=contributors,
        duration_seconds=duration,
        availability=availability,
        identifiers=(item_id,),
        show_id=None,
        capture_order=1,
        captured_at=retrieved_at,
        **artwork,
    )


def thumbnail_url(snippet):
    """The largest official https thumbnail URL the Data API returned, or None.

    The URL is taken only from ``snippet.thumbnails`` and only from an official
    thumbnail host. Nothing is synthesized from the video id.
    """
    table = snippet.get("thumbnails")
    if not isinstance(table, dict):
        return None
    for key in THUMBNAIL_KEYS:
        row = table.get(key)
        if not isinstance(row, dict):
            continue
        value = row.get("url")
        if not isinstance(value, str):
            continue
        try:
            url = public_https_url(value)
        except RecordError:
            continue
        if (urlsplit(url).hostname or "").lower() not in THUMBNAIL_HOSTS:
            continue
        return url
    return None


def thumbnail_is_display_clear(url, *, opener=None, resolve=None, timeout=10):
    """One FREE image request on the public thumbnail host.

    This is not a Data API read: it spends no quota and is not billed, so it is
    classified ``free`` and never counted as metered or paid. The image bytes
    are not downloaded or cached; only the status and content type are read.
    """
    answer = read_image_status(
        url,
        classification=outbound.FREE,
        opener=opener,
        resolve=resolve,
        timeout=timeout,
    )
    content_type = str(answer.get("content_type") or "").lower()
    return answer.get("status") == 200 and content_type.startswith("image/")


def _evidence(video_id, retrieved_at):
    return Evidence(
        evidence_id=f"youtube:{video_id}",
        item_id=f"youtube:{video_id}",
        source_id="youtube",
        retrieved_at=retrieved_at,
        destination=watch_url(video_id),
        excerpt=None,
        endorsement="not_applicable",
        kind="catalog",
        display_line=None,
        refresh_after=plus_days(retrieved_at, 30),
    )


def parse_data_api(payload, retrieved_at, art_check=None):
    """Parse a videos.list body. Unknown duration stays unknown.

    ``art_check`` is an optional callable that answers whether a thumbnail URL
    is display-cleared. Without it the record keeps blank artwork, exactly as
    before. When it answers yes, the URL the Data API returned is stored as a
    hotlink; no image bytes and no extra Data API request are involved.
    """
    if not isinstance(payload, dict) or payload.get("kind") != "youtube#videoListResponse":
        return ParseResult((), (), (), ("payload",))
    items = []
    evidence = []
    rejected = []
    ignored = set()
    for row in payload.get("items") or []:
        if not isinstance(row, dict):
            rejected.append("item")
            continue
        ignored.update(row.keys())
        snippet = row.get("snippet") if isinstance(row.get("snippet"), dict) else {}
        details = row.get("contentDetails") if isinstance(row.get("contentDetails"), dict) else {}
        status = row.get("status") if isinstance(row.get("status"), dict) else {}
        ignored.update(f"snippet.{key}" for key in snippet)
        ignored.update(f"contentDetails.{key}" for key in details)
        ignored.update(f"status.{key}" for key in status)
        video_id = row.get("id")
        title = snippet.get("title")
        if not isinstance(video_id, str) or not isinstance(title, str):
            rejected.append("item")
            continue
        channel = snippet.get("channelTitle")
        contributors = (channel,) if isinstance(channel, str) and channel.strip() else None
        privacy = status.get("privacyStatus")
        availability = privacy if privacy in {"public", "unlisted", "private"} else None
        if availability == "private":
            rejected.append(video_id)
            continue
        thumb = thumbnail_url(snippet)
        art = None
        art_reason = (
            NO_THUMBNAIL_REASON if thumb is None else UNCLEARED_THUMBNAIL_REASON
        )
        if thumb is not None and art_check is not None:
            try:
                cleared = bool(art_check(thumb))
            except Exception:
                # A thumbnail that cannot be checked is shown as no artwork;
                # it never fails the item or the source.
                cleared = False
            if cleared:
                art = {"url": thumb, "checked_at": retrieved_at}
        try:
            items.append(
                _video(
                    video_id,
                    title,
                    contributors,
                    iso_duration_seconds(details.get("duration")),
                    availability,
                    retrieved_at,
                    art_reason,
                    art,
                )
            )
        except RecordError:
            rejected.append(video_id)
            continue
        evidence.append(_evidence(video_id, retrieved_at))
    mapped = {
        "id",
        "snippet",
        "snippet.title",
        "snippet.channelTitle",
        "snippet.thumbnails",
        "contentDetails",
        "contentDetails.duration",
        "status",
        "status.privacyStatus",
        "kind",
    }
    return ParseResult(tuple(items), tuple(evidence), tuple(sorted(ignored - mapped)), tuple(rejected))


def fetch_oembed(video_id, *, opener=None):
    """Disabled. Does not request https://www.youtube.com/oembed."""
    return {"called": False, "enabled": False, "blocked_reason": BLOCKED_REASON}


def parse_oembed(payload, video_id, retrieved_at):
    """Parser kept for a later grant. The seed does not call it while disabled."""
    if not isinstance(payload, dict) or not isinstance(payload.get("title"), str):
        return ParseResult((), (), (), ("payload",))
    author = payload.get("author_name")
    contributors = (author,) if isinstance(author, str) and author.strip() else None
    try:
        item = _video(video_id, payload["title"], contributors, None, None, retrieved_at, ART_REASON)
    except RecordError:
        return ParseResult((), (), (), (video_id,))
    ignored = tuple(sorted(set(payload) - {"title", "author_name", "provider_name"}))
    return ParseResult((item,), (_evidence(video_id, retrieved_at),), ignored, ())


def fetch_data_api(video_id, api_key, *, opener=None, resolve=None):
    """Call videos.list only when a key is passed in. The key is not read from disk.

    ``videos.list`` is a keyed Google Data API read that spends the project's
    daily quota, so it is dispatched as ``metered`` rather than ``free``.
    See ``docs/sources.md`` and ``docs/feasibility-sources.md``.
    """
    if not isinstance(api_key, str) or not api_key.strip():
        return {"called": False, "blocked_reason": "missing_api_key"}
    if not isinstance(video_id, str) or not video_id:
        raise RecordError("video_id")
    url = DATA_API + "?" + urlencode({"part": "snippet,contentDetails,status", "id": video_id})
    if api_key in url:
        raise RecordError("credential")
    payload = read_json(
        url,
        classification=outbound.METERED,
        opener=opener,
        headers={"X-Goog-Api-Key": api_key},
        resolve=resolve,
    )
    return {"called": True, "blocked_reason": None, "payload": payload}
