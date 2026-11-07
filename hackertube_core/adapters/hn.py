"""Hacker News evidence. This adapter never creates a media item or an HN card.

The Algolia API page states no reuse license. Stored evidence is an id, a
comment permalink, a timestamp, and our display line. Comment text and
usernames are not kept.
"""

ENABLED = True
BLOCKED_REASON = None


from urllib.parse import urlencode

from hackertube_core import outbound
from hackertube_core.adapters.base import ParseResult
from hackertube_core.boundaries import recommendation_line
from hackertube_core.errors import RecordError
from hackertube_core.http import read_json
from hackertube_core.records import Evidence
from hackertube_core.text import youtube_video_id

SEARCH_API = "https://hn.algolia.com/api/v1/search"

POLICY = {
    "source_id": "hn",
    "name": "Hacker News",
    "role": "community",
    "attribution": "Hacker News. The line links to the comment on news.ycombinator.com.",
    "retention": (
        "No reuse license is stated. Stored fields are the comment id, permalink, "
        "retrieval time, and the display line. Comment text and usernames are not stored."
    ),
    "refresh": (
        "The API page states no maximum storage or refresh period. Each evidence row keeps "
        "its own retrieval time, so a stale row is visible rather than silently refreshed."
    ),
    "deletion": "No deletion API was found. Comment text is not stored, so there is no comment archive to delete.",
    "formats": (),
}


def _evidence(object_id, video_id, retrieved_at, endorsement, comment_url):
    record = Evidence(
        evidence_id=f"hn:{object_id}",
        item_id=f"youtube:{video_id}",
        source_id="hn",
        retrieved_at=retrieved_at,
        destination=comment_url,
        excerpt=None,
        endorsement=endorsement,
        kind="community",
        display_line=None,
        refresh_after=None,
    )
    line = recommendation_line(record)
    if line is None:
        return record
    return Evidence(
        evidence_id=record.evidence_id,
        item_id=record.item_id,
        source_id=record.source_id,
        retrieved_at=record.retrieved_at,
        destination=record.destination,
        excerpt=None,
        endorsement=record.endorsement,
        kind=record.kind,
        display_line=line,
        refresh_after=None,
    )


def parse_search(payload, retrieved_at):
    """A story hit is not a card. It may record a mention of a YouTube URL."""
    if not isinstance(payload, dict) or not isinstance(payload.get("hits"), list):
        return ParseResult((), (), (), ("payload",))
    evidence = []
    ignored = set()
    for hit in payload["hits"]:
        if not isinstance(hit, dict):
            continue
        ignored.update(hit.keys())
        video_id = youtube_video_id(hit.get("url") or "")
        object_id = str(hit.get("objectID") or "")
        if video_id and object_id.isdigit():
            evidence.append(
                _evidence(
                    object_id,
                    video_id,
                    retrieved_at,
                    "mention",
                    f"https://news.ycombinator.com/item?id={object_id}",
                )
            )
    ignored -= {"objectID", "url", "created_at"}
    return ParseResult((), tuple(evidence), tuple(sorted(ignored)), ())


def parse_verified_comment(payload, item_video_id, retrieved_at):
    """Attach the display line only when a hand check names this exact video.

    Keyword praise is not accepted. A comment that links a different video is
    not attached to the parent story's video.
    """
    if not isinstance(payload, dict):
        return ParseResult((), (), (), ("payload",))
    object_id = str(payload.get("objectID") or "")
    comment_url = payload.get("comment_url") or ""
    endorsed = youtube_video_id(payload.get("endorsed_url") or "")
    if payload.get("hand_verified") is not True or not object_id.isdigit() or not endorsed:
        return ParseResult((), (), (), ("not-verified",))
    if not isinstance(comment_url, str) or not comment_url.startswith("https://news.ycombinator.com/item?id="):
        return ParseResult((), (), (), ("comment-url",))
    if endorsed != item_video_id:
        return ParseResult((), (), (), (f"different-item:{endorsed}",))
    evidence = _evidence(object_id, endorsed, retrieved_at, "established", comment_url)
    return ParseResult((), (evidence,), (), ())


def fetch_search(query, *, tags="story", hits_per_page=20, opener=None, resolve=None):
    """One bounded Algolia search. ``read_json`` counts it free."""
    if not isinstance(query, str) or not query.strip():
        raise RecordError("query")
    url = SEARCH_API + "?" + urlencode(
        {"query": query.strip(), "tags": tags, "hitsPerPage": hits_per_page}
    )
    return read_json(url, classification=outbound.FREE, opener=opener, resolve=resolve)
