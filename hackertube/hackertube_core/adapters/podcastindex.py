"""Podcast Index show records. Search requires declared key/secret credentials."""

ENABLED = False
BLOCKED_REASON = "missing_api_key"

POLICY = {
    "source_id": "podcastindex",
    "name": "Podcast Index",
    "role": "catalog",
    "attribution": "Podcast Index.",
    "retention": "No records are stored. A key and secret are required and were not available.",
    "refresh": "No refresh is defined. No record is stored. Rate limits are unpublished and tune dynamically.",
    "deletion": "Nothing is stored.",
    "formats": ("podcast_show", "podcast_episode"),
}


def fetch(**kwargs):
    return {"called": False, "enabled": False, "blocked_reason": "missing_api_key"}


def parse_search(payload, retrieved_at):
    """Targeted show lookup; feed lengths are not episode durations."""
    from hackertube_core.adapters.base import ParseResult
    from hackertube_core.records import MediaItem, Evidence, blank_art
    from hackertube_core.errors import RecordError

    if not isinstance(payload, dict) or not isinstance(payload.get("feeds"), list):
        return ParseResult((), (), (), ("payload",))
    items, evidence = [], []
    for row in payload["feeds"][:12]:
        if (
            not isinstance(row, dict)
            or type(row.get("id")) is not int
            or not isinstance(row.get("title"), str)
        ):
            continue
        item_id = "podcastindex:" + str(row["id"])
        url = "https://podcastindex.org/podcast/" + str(row["id"])
        author = row.get("author")
        try:
            items.append(
                MediaItem(
                    item_id,
                    "podcast_show",
                    row["title"],
                    url,
                    (author,) if isinstance(author, str) and author.strip() else None,
                    None,
                    None,
                    (item_id,),
                    None,
                    1,
                    retrieved_at,
                    **blank_art("Podcast artwork is not stored."),
                )
            )
            evidence.append(
                Evidence(
                    item_id,
                    item_id,
                    "podcastindex",
                    retrieved_at,
                    url,
                    None,
                    "not_applicable",
                    "catalog",
                    None,
                    None,
                )
            )
        except RecordError:
            continue
    return ParseResult(tuple(items), tuple(evidence), (), ())
