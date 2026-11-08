"""Open Library work lookups. Cover bytes are not downloaded."""

import re
from urllib.parse import urlencode

from hackertube_core import outbound
from hackertube_core.adapters.base import ParseResult
from hackertube_core.errors import RecordError
from hackertube_core.http import read_json
from hackertube_core.records import Evidence, MediaItem, blank_art
from hackertube_core.text import public_https_url

SEARCH_API = "https://openlibrary.org/search.json"
#: Only the fields the parser maps. The captured request used the same set.
FIELDS = "key,title,author_name,cover_edition_key,first_publish_year,id_project_gutenberg"

ENABLED = True
BLOCKED_REASON = None

_WORK = re.compile(r"^/works/OL\d+W$")
ART_REASON = "Cover use is decided when the seed is frozen."
POLICY = {
    "source_id": "openlibrary",
    "name": "Open Library",
    "role": "catalog",
    "attribution": "Open Library. The card links to the work page. Cover hotlinks include that courtesy link.",
    "retention": "Catalog metadata is CC0. Responses are cached in the seed. Cover image files are not cached.",
    "refresh": (
        "No maximum refresh period is stated. A seed refresh re-reads the bounded search, and "
        "Open Library asks callers to cache when possible."
    ),
    "deletion": "No deletion window is stated for CC0 catalog metadata. Cover files are not stored.",
    "formats": ("book",),
}


def parse_search(payload, retrieved_at):
    if not isinstance(payload, dict) or not isinstance(payload.get("docs"), list):
        return ParseResult((), (), (), ("payload",))
    items = []
    evidence = []
    rejected = []
    ignored = set()
    for doc in payload["docs"]:
        if not isinstance(doc, dict):
            rejected.append("doc")
            continue
        ignored.update(doc.keys())
        key = doc.get("key")
        title = doc.get("title")
        if not isinstance(key, str) or not _WORK.fullmatch(key) or not isinstance(title, str):
            rejected.append("work")
            continue
        authors = doc.get("author_name")
        contributors = None
        if isinstance(authors, list) and authors:
            contributors = tuple(name for name in authors if isinstance(name, str) and name.strip()) or None
        gutenberg = []
        for value in doc.get("id_project_gutenberg") or []:
            if isinstance(value, str) and value.isdigit():
                gutenberg.append(f"gutenberg:{value}")
        item_id = "ol:" + key.rsplit("/", 1)[-1]
        destination = "https://openlibrary.org" + key
        try:
            destination = public_https_url(destination)
            item = MediaItem(
                item_id=item_id,
                format="book",
                title=title,
                destination=destination,
                contributors=contributors,
                duration_seconds=None,
                availability=None,
                identifiers=(item_id, *gutenberg),
                show_id=None,
                capture_order=1,
                captured_at=retrieved_at,
                **blank_art(ART_REASON),
            )
        except RecordError:
            rejected.append(key)
            continue
        items.append(item)
        evidence.append(
            Evidence(
                evidence_id=item_id,
                item_id=item_id,
                source_id="openlibrary",
                retrieved_at=retrieved_at,
                destination=destination,
                excerpt=None,
                endorsement="not_applicable",
                kind="catalog",
                display_line=None,
                refresh_after=None,
            )
        )
    ignored -= {"key", "title", "author_name", "id_project_gutenberg"}
    return ParseResult(tuple(items), tuple(evidence), tuple(sorted(ignored)), tuple(rejected))


def fetch_search(query, *, limit=20, opener=None, resolve=None):
    """One bounded search read. ``read_json`` counts it free."""
    if not isinstance(query, str) or not query.strip():
        raise RecordError("query")
    url = SEARCH_API + "?" + urlencode({"q": query.strip(), "limit": limit, "fields": FIELDS})
    return read_json(url, classification=outbound.FREE, opener=opener, resolve=resolve)
