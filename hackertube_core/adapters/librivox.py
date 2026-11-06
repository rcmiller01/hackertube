"""LibriVox public-domain recordings. Section counts are not turned into a duration."""

import re
from urllib.parse import urlencode

from hackertube_core import outbound
from hackertube_core.adapters.base import ParseResult
from hackertube_core.errors import RecordError
from hackertube_core.http import read_json
from hackertube_core.records import Evidence, MediaItem, blank_art
from hackertube_core.text import public_https_url

SEARCH_API = "https://librivox.org/api/feed/audiobooks"
#: Only the fields the parser maps. The captured request used the same set.
FIELDS = "{id,title,url_librivox,url_text_source,language,totaltimesecs,authors}"

ENABLED = True
BLOCKED_REASON = None

_GUTENBERG = re.compile(r"gutenberg\.org/(?:etext|ebooks)/(\d+)", re.I)
ART_REASON = "Cover use is decided when the seed is frozen."
POLICY = {
    "source_id": "librivox",
    "name": "LibriVox",
    "role": "catalog",
    "attribution": "LibriVox. The card links to the catalog page for the recording.",
    "retention": "Recording metadata is kept. Audio files are not stored. Cover files are not cached.",
    "deletion": "No deletion window is stated for these public-domain recordings. Audio files are not stored.",
    "formats": ("audiobook",),
}


def _duration(value):
    if type(value) is not int or value <= 0:
        return None
    return value


def _contributors(authors):
    if not isinstance(authors, list):
        return None
    names = []
    for author in authors:
        if not isinstance(author, dict):
            continue
        first = author.get("first_name") if isinstance(author.get("first_name"), str) else ""
        last = author.get("last_name") if isinstance(author.get("last_name"), str) else ""
        name = f"{first} {last}".strip()
        if name:
            names.append(name)
    return tuple(names) or None


def parse_books(payload, retrieved_at):
    if not isinstance(payload, dict) or not isinstance(payload.get("books"), list):
        return ParseResult((), (), (), ("payload",))
    items = []
    evidence = []
    rejected = []
    ignored = set()
    for book in payload["books"]:
        if not isinstance(book, dict):
            rejected.append("book")
            continue
        ignored.update(book.keys())
        raw_id = book.get("id")
        book_id = str(raw_id) if type(raw_id) is int or (isinstance(raw_id, str) and raw_id.isdigit()) else ""
        title = book.get("title")
        if not book_id or not isinstance(title, str):
            rejected.append("identity")
            continue
        match = _GUTENBERG.search(book.get("url_text_source") or "")
        identifiers = [f"lv:{book_id}"]
        if match:
            identifiers.append(f"gutenberg:{match.group(1)}")
        try:
            destination = public_https_url(book.get("url_librivox"))
            item = MediaItem(
                item_id=f"lv:{book_id}",
                format="audiobook",
                title=title,
                destination=destination,
                contributors=_contributors(book.get("authors")),
                duration_seconds=_duration(book.get("totaltimesecs")),
                availability=None,
                identifiers=tuple(identifiers),
                show_id=None,
                capture_order=1,
                captured_at=retrieved_at,
                **blank_art(ART_REASON),
            )
        except RecordError:
            rejected.append(book_id)
            continue
        items.append(item)
        evidence.append(
            Evidence(
                evidence_id=f"lv:{book_id}",
                item_id=f"lv:{book_id}",
                source_id="librivox",
                retrieved_at=retrieved_at,
                destination=destination,
                excerpt=None,
                endorsement="not_applicable",
                kind="catalog",
                display_line=None,
                refresh_after=None,
            )
        )
    ignored -= {"id", "title", "url_librivox", "url_text_source", "authors", "totaltimesecs"}
    return ParseResult(tuple(items), tuple(evidence), tuple(sorted(ignored)), tuple(rejected))


def fetch_search(author, *, limit=20, opener=None, resolve=None):
    """One bounded author search. ``read_json`` counts it free."""
    if not isinstance(author, str) or not author.strip():
        raise RecordError("query")
    url = SEARCH_API + "?" + urlencode(
        {"author": author.strip(), "format": "json", "limit": limit, "fields": FIELDS}
    )
    return read_json(url, classification=outbound.FREE, opener=opener, resolve=resolve)
