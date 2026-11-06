"""Hacker News evidence. This adapter never creates a media item or an HN card."""

from hackertube_core.adapters.base import ParseResult
from hackertube_core.boundaries import classify_endorsement, recommendation_line
from hackertube_core.records import Evidence
from hackertube_core.text import youtube_video_id

POLICY = {
    "source_id": "hn",
    "name": "Hacker News",
    "role": "community",
    "attribution": "Hacker News. Endorsement links open the comment on news.ycombinator.com.",
    "retention": "Comment and story bodies are not stored. Evidence keeps the permalink, time, and endorsement label.",
    "deletion": "No Hacker News deletion API was found. Bodies and usernames are not stored, so there is no comment archive to delete.",
    "formats": (),
}


def _comment_url(object_id):
    return f"https://news.ycombinator.com/item?id={object_id}"


def _evidence(object_id, video_id, retrieved_at, endorsement):
    record = Evidence(
        evidence_id=f"hn:{object_id}",
        item_id=f"youtube:{video_id}",
        source_id="hn",
        retrieved_at=retrieved_at,
        destination=_comment_url(object_id),
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
    """Story search is provenance only. It does not mint a video or an HN card."""
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
            evidence.append(_evidence(object_id, video_id, retrieved_at, "mention"))
    ignored -= {"objectID", "url"}
    return ParseResult((), tuple(evidence), tuple(sorted(ignored)), ())


def parse_comment_search(payload, retrieved_at):
    """Classify comment text in memory and store the link, not the body."""
    if not isinstance(payload, dict) or not isinstance(payload.get("hits"), list):
        return ParseResult((), (), (), ("payload",))
    evidence = []
    ignored = set()
    for hit in payload["hits"]:
        if not isinstance(hit, dict):
            continue
        ignored.update(hit.keys())
        video_id = youtube_video_id(hit.get("story_url") or "")
        object_id = str(hit.get("objectID") or "")
        if not video_id or not object_id.isdigit():
            continue
        endorsement = classify_endorsement(hit.get("comment_text") or "")
        evidence.append(_evidence(object_id, video_id, retrieved_at, endorsement))
    ignored -= {"objectID", "story_url", "comment_text"}
    return ParseResult((), tuple(evidence), tuple(sorted(ignored)), ())
