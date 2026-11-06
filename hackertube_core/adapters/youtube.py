"""YouTube catalog metadata.

Disabled. No cited page grants storage of oEmbed responses, and the Data API
needs a key this package does not have. fetch_oembed does not call the network
and the seed does not store oEmbed fields. The 30-day refresh on Data API
evidence stays in place for a later enablement.
"""

from urllib.parse import urlencode

from hackertube_core.adapters.base import ParseResult
from hackertube_core.errors import RecordError
from hackertube_core.http import read_json
from hackertube_core.records import Evidence, MediaItem, blank_art
from hackertube_core.text import iso_duration_seconds, plus_days

DATA_API = "https://www.googleapis.com/youtube/v3/videos"
ENABLED = False
BLOCKED_REASON = "unresolved-terms"
ART_REASON = "YouTube art is not stored while the adapter is disabled."
POLICY = {
    "source_id": "youtube",
    "name": "YouTube",
    "role": "catalog",
    "attribution": "YouTube. A later enabled card would link to the watch page.",
    "retention": (
        "Disabled. oEmbed title, channel, player HTML, and thumbnails are not stored. "
        "Data API evidence, if a key is later supplied, still expires after 30 days."
    ),
    "deletion": "Nothing from oEmbed is stored. Data API metadata would be deleted or refreshed within 30 calendar days.",
    "formats": ("video",),
}


def watch_url(video_id):
    return f"https://www.youtube.com/watch?v={video_id}"


def _video(video_id, title, contributors, duration, availability, retrieved_at, art_reason):
    item_id = f"youtube:{video_id}"
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
        **blank_art(art_reason),
    )


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


def parse_data_api(payload, retrieved_at):
    """Parse a videos.list body. Unknown duration stays unknown."""
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
        try:
            items.append(
                _video(
                    video_id,
                    title,
                    contributors,
                    iso_duration_seconds(details.get("duration")),
                    availability,
                    retrieved_at,
                    "Data API sample did not supply a display-cleared thumbnail.",
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
    """Call videos.list only when a key is passed in. The key is not read from disk."""
    if not isinstance(api_key, str) or not api_key.strip():
        return {"called": False, "blocked_reason": "missing_api_key"}
    if not isinstance(video_id, str) or not video_id:
        raise RecordError("video_id")
    url = DATA_API + "?" + urlencode({"part": "snippet,contentDetails,status", "id": video_id})
    if api_key in url:
        raise RecordError("credential")
    payload = read_json(url, opener=opener, headers={"X-Goog-Api-Key": api_key}, resolve=resolve)
    return {"called": True, "blocked_reason": None, "payload": payload}
