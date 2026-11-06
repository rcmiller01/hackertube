"""Apple iTunes Search lookups for shows, episodes, and audiobooks.

Artwork is not copied. A show's trackTimeMillis is not an episode duration.
"""

ENABLED = True
BLOCKED_REASON = None


from urllib.parse import urlencode

from hackertube_core import outbound
from hackertube_core.adapters.base import ParseResult
from hackertube_core.errors import RecordError
from hackertube_core.http import read_json
from hackertube_core.records import Evidence, MediaItem, blank_art
from hackertube_core.text import millis_to_seconds, public_https_url

SEARCH_API = "https://itunes.apple.com/search"

ART_REASON = (
    "Apple album art is promotional and may be shown only beside an approved "
    "store badge. This catalog has no badge, so the artwork URL is omitted "
    "and is neither hotlinked nor cached."
)
POLICY = {
    "source_id": "itunes",
    "name": "Apple Podcasts",
    "role": "catalog",
    "attribution": "Apple Podcasts. The card links to the store page returned by the Search API.",
    "retention": (
        "Text identity fields from a lookup are kept with their retrieval time. "
        "Artwork, previews, and episode media URLs are not stored. "
        "Apple asks large sites to cache lookups; no maximum retention for text fields was stated."
    ),
    "deletion": "Promotional assets would be removed immediately on Apple's request. None are stored.",
    "formats": ("podcast_show", "podcast_episode", "audiobook"),
}
_MAPPED = {
    "kind",
    "wrapperType",
    "collectionId",
    "trackId",
    "artistName",
    "collectionName",
    "trackName",
    "collectionViewUrl",
    "trackViewUrl",
    "trackTimeMillis",
}


def _format(row):
    kind = row.get("kind")
    wrapper = row.get("wrapperType")
    if kind == "podcast":
        return "podcast_show"
    if kind == "podcast-episode" or wrapper == "podcastEpisode":
        return "podcast_episode"
    if wrapper == "audiobook":
        return "audiobook"
    return None


def parse_results(payload, retrieved_at):
    if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
        return ParseResult((), (), (), ("payload",))
    items = []
    evidence = []
    rejected = []
    ignored = set()
    for row in payload["results"]:
        if not isinstance(row, dict):
            rejected.append("row")
            continue
        ignored.update(row.keys())
        fmt = _format(row)
        if fmt is None:
            rejected.append("format")
            continue
        artist = row.get("artistName")
        contributors = (artist,) if isinstance(artist, str) and artist.strip() else None
        show_id = None
        duration = None
        if fmt == "podcast_show":
            raw_url = row.get("collectionViewUrl")
            title = row.get("collectionName")
            item_key = row.get("collectionId")
            item_id = f"itunes:podcast:{item_key}"
        elif fmt == "podcast_episode":
            raw_url = row.get("trackViewUrl")
            title = row.get("trackName")
            item_key = row.get("trackId")
            item_id = f"itunes:episode:{item_key}"
            collection_id = row.get("collectionId")
            if type(collection_id) is int:
                show_id = f"itunes:podcast:{collection_id}"
            duration = millis_to_seconds(row.get("trackTimeMillis"))
        else:
            raw_url = row.get("collectionViewUrl")
            title = row.get("collectionName")
            item_key = row.get("collectionId")
            item_id = f"itunes:audiobook:{item_key}"
            duration = millis_to_seconds(row.get("trackTimeMillis"))
        if type(item_key) is not int or not isinstance(title, str):
            rejected.append("identity")
            continue
        try:
            destination = public_https_url(raw_url)
            item = MediaItem(
                item_id=item_id,
                format=fmt,
                title=title,
                destination=destination,
                contributors=contributors,
                duration_seconds=duration,
                availability=None,
                identifiers=(item_id,),
                show_id=show_id,
                capture_order=1,
                captured_at=retrieved_at,
                **blank_art(ART_REASON),
            )
        except RecordError:
            rejected.append(str(item_key))
            continue
        items.append(item)
        evidence.append(
            Evidence(
                evidence_id=item_id,
                item_id=item_id,
                source_id="itunes",
                retrieved_at=retrieved_at,
                destination=destination,
                excerpt=None,
                endorsement="not_applicable",
                kind="catalog",
                display_line=None,
                refresh_after=None,
            )
        )
    ignored -= _MAPPED
    # Show length is never read from trackTimeMillis, so that key stays ignored
    # when every parsed row is a show. Episode parses do map it.
    if items and all(item.format == "podcast_show" for item in items):
        ignored.add("trackTimeMillis")
    return ParseResult(tuple(items), tuple(evidence), tuple(sorted(ignored)), tuple(rejected))


def fetch_search(term, *, media="podcast", limit=20, opener=None, resolve=None):
    """One bounded Search API lookup. ``read_json`` counts it free."""
    if not isinstance(term, str) or not term.strip():
        raise RecordError("query")
    url = SEARCH_API + "?" + urlencode({"term": term.strip(), "media": media, "limit": limit})
    return read_json(url, classification=outbound.FREE, opener=opener, resolve=resolve)
