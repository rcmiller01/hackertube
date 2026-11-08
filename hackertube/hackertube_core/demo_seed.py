"""Freeze the demo catalog from the recorded source reads.

The seed is built from the reads recorded under ``tests/fixtures/captured/``.
Every read is replayed through the request boundary in
``hackertube_core.http.read_json`` (#11), so ``hackertube_core.outbound``
counts it ``free``, and parsed by the source adapter that task 2.3 (#12)
added. ``hackertube_core.sources.ingest`` (#12) then merges the records and
records each source's attempt in the profile store. The builder opens no
socket: a recorded body stands in for the live response, so a build makes no
network call and no paid call. ``freeze`` returns the measured counts beside
the document, and refuses a build that saw any paid or metered read.

Source choices and attempt status live in the profile database through Hermes
``plugin_db`` (``hackertube_core.profile.open_profile_db``). This module does
not import ``sqlite3`` and does not connect to a file. A caller may pass
``connect`` for a test double.

Hacker News contributes evidence lines only. It is not a media format. Its
evidence names YouTube video ids that the seed stores as ids and links only,
so no Hacker News evidence row is frozen.
"""

import json
from dataclasses import asdict, replace
from pathlib import Path

from hackertube_core import outbound, sources
from hackertube_core.adapters import (
    REGISTRY,
    hn,
    itunes,
    librivox,
    openlibrary,
    podcastindex,
    reddit,
    youtube,
)
from hackertube_core.adapters.base import ParseResult
from hackertube_core.boundaries import gutenberg_ids, link_editions
from hackertube_core.catalog import SCHEMA, load_catalog
from hackertube_core.errors import RecordError
from hackertube_core.http import read_json
from hackertube_core.profile import ProfileStore, open_profile_db
from hackertube_core.records import SourceRecord, blank_art
from hackertube_core.text import http_date_to_z

BOOK_KEYS = (
    "/works/OL66554W",
    "/works/OL66513W",
    "/works/OL66562W",
    "/works/OL66534W",
)
IDENTIFIED_VIDEOS = ("LCEmiRjPEtQ", "Dr20f19czeE", "gm0b_ijaYMQ")
VIDEO_UNUSABLE = (
    "YouTube oEmbed is disabled because no cited page grants storage of its responses. "
    "A displayable card needs a title, and that title is not stored. "
    "Only the video id and watch link are kept."
)
QUESTION = "What can I read or listen to by Jane Austen?"
MAY_BE_EMPTY = ("videos",)
#: The latest recorded read time. The ingestion pass is stamped with it.
SEED_NOW = "2026-11-06T12:24:15Z"
#: The ordered catalog reads. Each row is ``(source_id, captured file, parser)``.
CATALOG_READS = (
    ("itunes", "itunes_austen_stories.json", itunes.parse_results),
    ("itunes", "itunes_austen_year.json", itunes.parse_results),
    ("itunes", "itunes_podcast_lookup.json", itunes.parse_results),
    ("itunes", "itunes_episode_search.json", itunes.parse_results),
    ("openlibrary", "openlibrary_austen_search.json", openlibrary.parse_search),
    ("librivox", "librivox_austen_search.json", librivox.parse_books),
)
#: The seed ingestion registry, in the frozen capture order. Only catalog
#: sources that contribute a card are ingested; Hacker News carries no card.
SEED_REGISTRY = {
    source_id: REGISTRY[source_id] for source_id in ("itunes", "openlibrary", "librivox")
}
OL_ART = (
    "Open Library asks callers to hotlink covers and not to crawl or cache the image files. "
    "The work page is the courtesy link. The image returned HTTP 200."
)
LV_ART = (
    "LibriVox dedicates its recordings to the public domain. The API names coverart_jpg "
    "but does not grant display or hotlinking of cover images, so the card is text."
)


class _RecordedResponse:
    """One recorded body, shaped like the response ``read_json`` reads."""

    status = 200

    def __init__(self, body):
        self._body = body

    def read(self, limit):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class _RecordedOpener:
    """Stands in for the live HTTPS opener. It returns the recorded body.

    ``read_json`` still runs its URL screen, its one ``connection_targets``
    step through the injected ``resolve``, and its one counted
    ``outbound.dispatch``. Only the socket is replaced, so a build never
    reaches the network.
    """

    def __init__(self, body):
        self._body = body

    def open(self, request, timeout=None):
        return _RecordedResponse(self._body)


def _resolve(host, port=None, *args, **kwargs):
    """No live DNS. One allowed address, so the shared allowlist is exercised.

    ``connection_targets`` reads only ``answer[4][0]``, so the address family
    and socket type fields are placeholders. This module imports no socket
    client and opens no connection.
    """
    return [(0, 0, 6, "", ("1.1.1.1", 0))]


class _Reads:
    """The recorded read set. Each file is read through the boundary once."""

    def __init__(self, root):
        self.root = Path(root)
        self.manifest = json.loads((self.root / "manifest.json").read_text())
        self._cache = {}

    def _row(self, name):
        matches = [row for row in self.manifest["requests"] if row["file"] == name]
        if not matches:
            raise RecordError(name)
        return matches[-1]

    def body(self, name):
        """One recorded read through the request boundary, counted ``free``."""
        if name not in self._cache:
            row = self._row(name)
            payload = read_json(
                row["url"],
                classification=outbound.FREE,
                opener=_RecordedOpener((self.root / name).read_bytes()),
                resolve=_resolve,
            )
            captured = http_date_to_z(row["date"] or SEED_NOW)
            self._cache[name] = (payload, captured)
        return self._cache[name]

    def fetchers(self):
        """Ingest fetchers that replay this read set, one per source."""
        grouped = {}
        for source_id, name, parser in CATALOG_READS:
            grouped.setdefault(source_id, []).append((name, parser))

        def make(reads):
            def fetch(query, now):
                items = []
                evidence = []
                for name, parser in reads:
                    payload, captured = self.body(name)
                    parsed = parser(payload, captured)
                    items.extend(parsed.items)
                    evidence.extend(parsed.evidence)
                return ParseResult(tuple(items), tuple(evidence), (), ())

            return fetch

        return {source_id: make(reads) for source_id, reads in grouped.items()}


def _image(manifest, url):
    for image in manifest["images"]:
        content_type = str(image.get("content_type") or "")
        if image.get("url") == url and image.get("status") == 200 and content_type.startswith("image/"):
            return image
    return None


def _with_art(item, url, manifest, reason):
    image = _image(manifest, url)
    if image is None:
        return replace(item, **blank_art(reason + " The image check did not return an image."))
    return replace(
        item,
        art_url=url,
        art_hotlink=True,
        art_cache=False,
        art_reason=reason,
        art_checked_at=http_date_to_z(image["date"]),
        art_http_status=200,
    )


def _source(policy, *, enabled, blocked_reason, last_success_at, last_error):
    return SourceRecord(
        source_id=policy["source_id"],
        name=policy["name"],
        role=policy["role"],
        enabled=enabled,
        blocked_reason=blocked_reason,
        attribution=policy["attribution"],
        retention=policy["retention"],
        refresh=policy["refresh"],
        deletion=policy["deletion"],
        refresh_after=None,
        last_success_at=last_success_at,
        last_error=last_error,
        formats=policy["formats"],
    )


def _row(record):
    data = asdict(record)
    for field in ("contributors", "identifiers", "formats"):
        if field in data and data[field] is not None:
            data[field] = list(data[field])
    return data


def _blocked(source_id):
    return REGISTRY[source_id]["blocked_reason"]


def freeze(root, *, connect=None):
    """Build the catalog. Returns ``(document, request counts)``."""
    reads = _Reads(root)
    if youtube.ENABLED:
        raise RecordError("youtube")
    open_db = open_profile_db if connect is None else connect
    store = ProfileStore(open_db)
    for source_id, entry in REGISTRY.items():
        store.set_source_enabled(source_id, entry["enabled"], updated_at=SEED_NOW)
    report = sources.ingest(
        store,
        SEED_NOW,
        QUESTION,
        fetchers=reads.fetchers(),
        registry=SEED_REGISTRY,
    )
    counts = dict(report["request_counts"])
    if counts["paid"] or counts["metered"]:
        raise RecordError("paid")

    merged = report["items"]
    merged_by_id = {item.item_id: item for item in merged}
    # An item that shares a work with another recording carries the sibling's
    # remapped evidence too. The frozen card keeps the item's own row.
    evidence_by_item = {}
    for row in report["evidence"]:
        if row.item_id not in evidence_by_item or row.evidence_id == row.item_id:
            evidence_by_item[row.item_id] = row
    missing = set(merged_by_id) - set(evidence_by_item)
    if missing:
        raise RecordError("evidence")

    unavailable_videos = [
        {
            "video_id": video_id,
            "destination": youtube.watch_url(video_id),
            "reason": VIDEO_UNUSABLE,
        }
        for video_id in IDENTIFIED_VIDEOS
    ]

    podcasts = [item for item in merged if item.format in ("podcast_show", "podcast_episode")]

    # The raw Open Library docs are the only place the cover key and the
    # Project Gutenberg ids appear; the item records stay the ingested ones.
    book_payload, book_time = reads.body("openlibrary_austen_search.json")
    docs = {doc["key"]: doc for doc in book_payload["docs"]}
    audio_by_gutenberg = {}
    for item in merged:
        if item.format != "audiobook":
            continue
        for gid in gutenberg_ids(item):
            audio_by_gutenberg.setdefault(gid, []).append(item)

    chosen_audio = []
    book_rows = []
    for key in BOOK_KEYS:
        item = merged_by_id["ol:" + key.rsplit("/", 1)[-1]]
        candidates = []
        for gid in docs[key].get("id_project_gutenberg") or []:
            candidates.extend(audio_by_gutenberg.get(gid, []))
        if not candidates:
            raise RecordError(key)
        audio = sorted(candidates, key=lambda row: int(row.item_id.split(":")[1]))[0]
        edition = docs[key].get("cover_edition_key")
        cover = f"https://covers.openlibrary.org/b/olid/{edition}-M.jpg" if edition else None
        book_rows.append(_with_art(item, cover, reads.manifest, OL_ART))
        chosen_audio.append(replace(audio, **blank_art(LV_ART)))
    if len({item.item_id for item in chosen_audio}) != len(chosen_audio):
        raise RecordError("audiobook")
    if not podcasts or not book_rows or not chosen_audio:
        raise RecordError("empty")

    ordered = tuple(
        replace(item, capture_order=index)
        for index, item in enumerate(podcasts + book_rows + chosen_audio, start=1)
    )
    evidence = tuple(evidence_by_item[item.item_id] for item in ordered)
    audio_time = reads.body("librivox_austen_search.json")[1]

    rows = (
        _source(
            youtube.POLICY,
            enabled=False,
            blocked_reason=_blocked("youtube"),
            last_success_at=None,
            last_error="unresolved-terms",
        ),
        _source(hn.POLICY, enabled=True, blocked_reason=None, last_success_at=None, last_error=None),
        _source(
            itunes.POLICY,
            enabled=True,
            blocked_reason=None,
            last_success_at=podcasts[0].captured_at,
            last_error=None,
        ),
        _source(
            openlibrary.POLICY,
            enabled=True,
            blocked_reason=None,
            last_success_at=book_time,
            last_error=None,
        ),
        _source(
            librivox.POLICY,
            enabled=True,
            blocked_reason=None,
            last_success_at=audio_time,
            last_error=None,
        ),
        _source(
            podcastindex.POLICY,
            enabled=False,
            blocked_reason=_blocked("podcastindex"),
            last_success_at=None,
            last_error="HTTP 401 without a key. No request is sent by the adapter.",
        ),
        _source(
            reddit.POLICY,
            enabled=False,
            blocked_reason=_blocked("reddit"),
            last_success_at=None,
            last_error="Explicit Reddit Data API approval is absent. No request is sent.",
        ),
    )
    data = {
        "schema": SCHEMA,
        "demo_question": QUESTION,
        "formats_may_be_empty": list(MAY_BE_EMPTY),
        "unavailable_videos": unavailable_videos,
        "items": [_row(item) for item in ordered],
        "evidence": [_row(row) for row in evidence],
        "sources": [_row(source) for source in rows],
        "editions": [_row(link) for link in link_editions(ordered)],
    }
    load_catalog(data)
    return data, counts


def build(root, *, connect=None):
    """The catalog document that ``hackertube_core.seed.catalog.json`` holds."""
    data, _counts = freeze(root, connect=connect)
    return data


def main():
    root = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "captured"
    destination = Path(__file__).parent / "seed" / "catalog.json"
    data, counts = freeze(root)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
    print(f"wrote {destination} with request counts {counts}")


if __name__ == "__main__":
    main()
