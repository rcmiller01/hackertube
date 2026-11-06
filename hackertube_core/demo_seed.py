"""Freeze the demo catalog from captured responses.

Hacker News contributes evidence lines only. It is not a media format.
"""

import json
from dataclasses import asdict, replace
from pathlib import Path

from hackertube_core.adapters import hn, itunes, librivox, openlibrary, podcastindex, reddit, youtube
from hackertube_core.boundaries import gutenberg_ids, link_editions
from hackertube_core.catalog import SCHEMA, load_catalog
from hackertube_core.errors import RecordError
from hackertube_core.records import SourceRecord, blank_art
from hackertube_core.text import http_date_to_z

BOOK_KEYS = (
    "/works/OL66554W",
    "/works/OL66513W",
    "/works/OL66562W",
    "/works/OL66534W",
)
VIDEOS = (
    ("oembed_LCEmiRjPEtQ.json", "LCEmiRjPEtQ", "hn_comment_44314766.json"),
    ("oembed_Dr20f19czeE.json", "Dr20f19czeE", "hn_comment_19628894.json"),
    ("oembed_gm0b_ijaYMQ.json", "gm0b_ijaYMQ", None),
)
PODCAST_FILES = (
    "itunes_austen_stories.json",
    "itunes_austen_year.json",
    "itunes_podcast_lookup.json",
    "itunes_episode_search.json",
)
QUESTION = "What can I read or listen to by Jane Austen?"
MAY_BE_EMPTY = ("videos",)
OL_ART = (
    "Open Library asks callers to hotlink covers and not to crawl or cache the image files. "
    "The work page is the courtesy link. The image returned HTTP 200."
)
LV_ART = (
    "LibriVox dedicates its recordings to the public domain. The API names coverart_jpg "
    "but does not grant display or hotlinking of cover images, so the card is text."
)


def _read(root, name):
    return json.loads((root / name).read_text())


def _request_time(manifest, name):
    matches = [row for row in manifest["requests"] if row["file"] == name]
    if not matches:
        raise RecordError(name)
    return http_date_to_z(matches[-1]["date"])


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


def build(root):
    root = Path(root)
    manifest = _read(root, "manifest.json")
    items = []
    evidence = []

    for oembed_name, video_id, comment_name in VIDEOS:
        captured = _request_time(manifest, oembed_name)
        parsed = youtube.parse_oembed(_read(root, oembed_name), video_id, captured)
        if len(parsed.items) != 1 or parsed.items[0].duration_seconds is not None:
            raise RecordError(video_id)
        items.append(parsed.items[0])
        evidence.extend(parsed.evidence)
        if comment_name is None:
            continue
        comment_time = _request_time(manifest, comment_name)
        comments = hn.parse_verified_comment(_read(root, comment_name), video_id, comment_time)
        if len(comments.evidence) != 1 or comments.evidence[0].item_id != f"youtube:{video_id}":
            raise RecordError(comment_name)
        if comments.evidence[0].display_line is None or comments.evidence[0].excerpt is not None:
            raise RecordError(comment_name)
        evidence.append(comments.evidence[0])

    for name in PODCAST_FILES:
        captured = _request_time(manifest, name)
        parsed = itunes.parse_results(_read(root, name), captured)
        if len(parsed.items) != 1:
            raise RecordError(name)
        items.append(parsed.items[0])
        evidence.extend(parsed.evidence)

    book_time = _request_time(manifest, "openlibrary_austen_search.json")
    book_payload = _read(root, "openlibrary_austen_search.json")
    book_parsed = openlibrary.parse_search(book_payload, book_time)
    docs = {doc["key"]: doc for doc in book_payload["docs"]}
    books = {item.item_id: item for item in book_parsed.items}

    audio_time = _request_time(manifest, "librivox_austen_search.json")
    audio_parsed = librivox.parse_books(_read(root, "librivox_austen_search.json"), audio_time)
    by_gutenberg = {}
    for item in audio_parsed.items:
        for gid in gutenberg_ids(item):
            by_gutenberg.setdefault(gid, []).append(item)

    chosen_audio = []
    for key in BOOK_KEYS:
        item = books["ol:" + key.rsplit("/", 1)[-1]]
        candidates = []
        for gid in docs[key].get("id_project_gutenberg") or []:
            candidates.extend(by_gutenberg.get(gid, []))
        if not candidates:
            raise RecordError(key)
        audio = sorted(candidates, key=lambda row: int(row.item_id.split(":")[1]))[0]
        edition = docs[key].get("cover_edition_key")
        cover = f"https://covers.openlibrary.org/b/olid/{edition}-M.jpg" if edition else None
        items.append(_with_art(item, cover, manifest, OL_ART))
        evidence.append(next(row for row in book_parsed.evidence if row.item_id == item.item_id))
        chosen_audio.append(replace(audio, **blank_art(LV_ART)))
    if len({item.item_id for item in chosen_audio}) != len(chosen_audio):
        raise RecordError("audiobook")
    for audio in chosen_audio:
        items.append(audio)
        evidence.append(next(row for row in audio_parsed.evidence if row.item_id == audio.item_id))

    ordered = tuple(replace(item, capture_order=index) for index, item in enumerate(items, start=1))
    sources = (
        _source(youtube.POLICY, enabled=True, blocked_reason=None, last_success_at=ordered[0].captured_at, last_error=None),
        _source(hn.POLICY, enabled=True, blocked_reason=None, last_success_at=evidence[1].retrieved_at, last_error=None),
        _source(itunes.POLICY, enabled=True, blocked_reason=None, last_success_at=ordered[3].captured_at, last_error=None),
        _source(
            openlibrary.POLICY,
            enabled=True,
            blocked_reason=None,
            last_success_at=book_time,
            last_error=None,
        ),
        _source(librivox.POLICY, enabled=True, blocked_reason=None, last_success_at=audio_time, last_error=None),
        _source(
            podcastindex.POLICY,
            enabled=False,
            blocked_reason="missing_api_key",
            last_success_at=None,
            last_error="HTTP 401 without a key. No request is sent by the adapter.",
        ),
        _source(
            reddit.POLICY,
            enabled=False,
            blocked_reason="approval_absent",
            last_success_at=None,
            last_error="Explicit Reddit Data API approval is absent. No request is sent.",
        ),
    )
    data = {
        "schema": SCHEMA,
        "demo_question": QUESTION,
        "formats_may_be_empty": list(MAY_BE_EMPTY),
        "items": [_row(item) for item in ordered],
        "evidence": [_row(row) for row in evidence],
        "sources": [_row(source) for source in sources],
        "editions": [_row(link) for link in link_editions(ordered)],
    }
    load_catalog(data)
    return data


def main():
    root = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "captured"
    destination = Path(__file__).parent / "seed" / "catalog.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(build(root), indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
