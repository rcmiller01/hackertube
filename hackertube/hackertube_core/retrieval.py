"""Bounded source retrieval for explicit searches; browsing never calls this."""

import hashlib
import re
import time
from urllib.parse import urlencode, urlsplit

from hackertube_core import outbound
from hackertube_core.adapters import REGISTRY
from hackertube_core.adapters import (
    hn,
    itunes,
    librivox,
    openlibrary,
    youtube,
    podcastindex,
)
from hackertube_core.adapters.base import ParseResult
from hackertube_core.catalog import Catalog
from hackertube_core.errors import RecordError
from hackertube_core.http import HttpError, read_json
from hackertube_core.records import Evidence, MediaItem, SourceRecord, blank_art
from hackertube_core.sources import merge_duplicates, search_policy
from hackertube_core.text import public_https_url


class BudgetExhausted(RuntimeError):
    pass


class Budget:
    def __init__(self, limits, clock=time.monotonic):
        self.limits, self.clock = limits, clock
        self.ends = clock() + limits.deadline_seconds
        self.used = 0

    def remaining(self):
        value = self.ends - self.clock()
        if value <= 0 or self.used >= self.limits.max_requests:
            raise BudgetExhausted("Search work limit reached; coverage is incomplete.")
        return value

    def call(self, fn):
        self.remaining()
        self.used += 1
        return fn()

    def read(self, url, **kwargs):
        timeout = min(self.remaining(), 10)
        return self.call(lambda: read_json(url, timeout=timeout, **kwargs))


def _source(source_id, enabled=True, reason=None):
    policy = search_policy(source_id)
    return SourceRecord(
        **policy,
        enabled=enabled,
        blocked_reason=reason,
        refresh_after=None,
        last_success_at=None,
        last_error=None,
    )


def _web_source():
    return SourceRecord(
        "web",
        "Hermes web search",
        "catalog",
        True,
        None,
        "Original media destination and Hermes search provider.",
        "Minimal item identity and retrieval provenance only; no excerpts.",
        "Refreshed only by explicit search.",
        "Clear owned data to remove records.",
        None,
        None,
        None,
        ("video", "book", "audiobook", "podcast_show", "podcast_episode"),
    )


def _web_items(rows, now):
    """Admit only recognizable media-record URLs; no format guesses by an LLM.

    YouTube is deliberately excluded: it must use its Data API path, not
    stored oEmbed or search-title metadata as a workaround for that policy.
    """
    items, evidence = [], []
    for row in rows[:8]:
        if not isinstance(row, dict) or not isinstance(row.get("title"), str):
            continue
        try:
            url = public_https_url(row.get("url"))
            parsed = urlsplit(url)
            host = parsed.hostname.lower().removeprefix("www.")
            path = parsed.path
            fmt = None
            if host == "openlibrary.org" and re.fullmatch(r"/works/OL\d+W/?", path):
                fmt = "book"
            elif host == "gutenberg.org" and re.fullmatch(r"/ebooks/\d+/?", path):
                fmt = "book"
            elif host == "vimeo.com" and re.fullmatch(r"/\d+/?", path):
                fmt = "video"
            elif (
                host == "podcasts.apple.com"
                and "/podcast/" in path
                and re.search(r"/id\d+", path)
            ):
                fmt = (
                    "podcast_episode"
                    if re.search(r"(?:^|&)i=\d+", parsed.query)
                    else "podcast_show"
                )
            # Audio editions require their dedicated adapter record.
            if fmt is None:
                continue
            item_id = "web:" + hashlib.sha256(url.encode()).hexdigest()[:24]
            items.append(
                MediaItem(
                    item_id,
                    fmt,
                    row["title"],
                    url,
                    None,
                    None,
                    None,
                    (item_id,),
                    None,
                    1,
                    now,
                    **blank_art("No artwork retrieved."),
                )
            )
            evidence.append(
                Evidence(
                    item_id,
                    item_id,
                    "web",
                    now,
                    url,
                    None,
                    "not_applicable",
                    "web",
                    None,
                    None,
                )
            )
        except (RecordError, ValueError):
            continue
    return ParseResult(tuple(items), tuple(evidence), (), ())


class SourceRetriever:
    def __init__(self, store, *, get_secret=lambda name: None, web_search=None):
        self.store, self.get_secret, self.web_search = store, get_secret, web_search

    def __call__(self, interpretation, now, budget):
        hn_payload = {}
        query = interpretation.topic.strip()
        if not query:
            raise RecordError("empty search topic")
        settings = self.store.source_settings()
        formats = set(interpretation.formats)
        items, evidence, statuses, sources = [], [], [], []

        def fetch(source_id, fn):
            try:
                parsed = fn()
                if (
                    parsed.rejected
                    and not parsed.items
                    and "payload" in parsed.rejected
                ):
                    raise RecordError("source payload")
                items.extend(parsed.items)
                evidence.extend(parsed.evidence)
                statuses.append(
                    {
                        "source_id": source_id,
                        "state": "succeeded",
                        "items": len(parsed.items),
                    }
                )
                self.store.record_source_result(source_id, ok=True, at=now)
            except BudgetExhausted:
                statuses.append({"source_id": source_id, "state": "limit", "items": 0})
            except TypeError:
                raise  # A mis-wired adapter is a programming error, not a source outage.
            except Exception:
                # Provider responses and exceptions can contain keys or content.
                statuses.append(
                    {
                        "source_id": source_id,
                        "state": "failed",
                        "items": 0,
                        "error": "source request failed",
                    }
                )
                self.store.record_source_result(
                    source_id, ok=False, at=now, error="source request failed"
                )

        for source_id in REGISTRY:
            policy = search_policy(source_id)
            supported = set(policy["formats"])
            relevant = not formats or not supported or bool(formats & supported)
            reason = None
            key = None
            if source_id == "reddit":
                reason = "approval_absent"
            elif source_id == "youtube":
                # Data API only; oEmbed remains disabled.
                key = self.get_secret("YOUTUBE_API_KEY")
                if not key:
                    reason = "missing_api_key"
            elif source_id == "podcastindex":
                key = self.get_secret("PODCASTINDEX_API_KEY")
                secret = self.get_secret("PODCASTINDEX_API_SECRET")
                if not key or not secret:
                    reason = "missing_api_key"
            enabled = settings.get(
                source_id, source_id not in {"youtube", "podcastindex", "reddit"}
            )
            if not enabled:
                reason = reason or "disabled"
            if not relevant:
                reason = reason or "not_requested"
            sources.append(_source(source_id, not bool(reason), reason))
            if reason:
                statuses.append(
                    {
                        "source_id": source_id,
                        "state": "unavailable"
                        if reason not in {"disabled", "not_requested"}
                        else "skipped",
                        "reason": reason,
                        "items": 0,
                    }
                )
                continue
            if source_id == "hn":

                def community():
                    nonlocal hn_payload
                    hn_payload = budget.read(
                        hn.SEARCH_API
                        + "?"
                        + urlencode({"query": query, "hitsPerPage": 12}),
                        classification=outbound.FREE,
                    )
                    return hn.parse_search(hn_payload, now)

                fetch(source_id, community)
            elif source_id == "itunes":

                def apple():
                    groups = []
                    if not formats or "podcast_show" in formats:
                        groups.append(("podcast", "podcast"))
                    if not formats or "podcast_episode" in formats:
                        groups.append(("podcast", "podcastEpisode"))
                    if not formats or "audiobook" in formats:
                        groups.append(("audiobook", "audiobook"))
                    collected, rows = [], []
                    for media, entity in groups:
                        payload = budget.read(
                            itunes.SEARCH_API
                            + "?"
                            + urlencode(
                                {
                                    "term": query,
                                    "media": media,
                                    "entity": entity,
                                    "limit": 12,
                                }
                            ),
                            classification=outbound.FREE,
                        )
                        parsed = itunes.parse_results(payload, now)
                        collected.extend(parsed.items)
                        rows.extend(parsed.evidence)
                    return ParseResult(tuple(collected), tuple(rows), (), ())

                fetch(source_id, apple)
            elif source_id == "openlibrary":
                fetch(
                    source_id,
                    lambda: openlibrary.parse_search(
                        budget.read(
                            openlibrary.SEARCH_API
                            + "?"
                            + urlencode(
                                {"q": query, "limit": 12, "fields": openlibrary.FIELDS}
                            ),
                            classification=outbound.FREE,
                        ),
                        now,
                    ),
                )
            elif source_id == "librivox":

                def audio():
                    author = getattr(interpretation, "author", None)
                    field, value = (
                        ("author", author.rsplit(maxsplit=1)[-1])
                        if author
                        else ("title", query)
                    )
                    try:
                        payload = budget.read(
                            librivox.SEARCH_API
                            + "?"
                            + urlencode(
                                {
                                    field: value,
                                    "format": "json",
                                    "limit": 12,
                                    "fields": librivox.FIELDS,
                                }
                            ),
                            classification=outbound.FREE,
                        )
                    except HttpError as exc:
                        if str(exc) == "http 404":
                            return ParseResult((), (), (), ())
                        raise
                    return librivox.parse_books(payload, now)

                fetch(source_id, audio)
            elif source_id == "podcastindex":

                def podcast():
                    stamp = str(int(time.time()))
                    auth = hashlib.sha1((key + secret + stamp).encode()).hexdigest()
                    payload = budget.read(
                        "https://api.podcastindex.org/api/1.0/search/byterm?"
                        + urlencode({"q": query, "max": 12}),
                        classification=outbound.METERED,
                        headers={
                            "X-Auth-Key": key,
                            "X-Auth-Date": stamp,
                            "Authorization": auth,
                        },
                    )
                    return podcastindex.parse_search(payload, now)

                fetch(source_id, podcast)
            elif source_id == "youtube":

                def video():
                    headers = {"X-Goog-Api-Key": key}
                    payload = budget.read(
                        "https://www.googleapis.com/youtube/v3/search?"
                        + urlencode(
                            {
                                "part": "snippet",
                                "q": query,
                                "type": "video",
                                "maxResults": 8,
                            }
                        ),
                        classification=outbound.METERED,
                        headers=headers,
                    )
                    ids = [
                        row.get("id", {}).get("videoId")
                        for row in payload.get("items", [])
                        if isinstance(row, dict)
                    ]
                    ids = [
                        x
                        for x in ids
                        if isinstance(x, str) and re.fullmatch(r"[A-Za-z0-9_-]{11}", x)
                    ]
                    if not ids:
                        return ParseResult((), (), (), ())
                    payload = budget.read(
                        youtube.DATA_API
                        + "?"
                        + urlencode(
                            {
                                "part": "snippet,contentDetails,status",
                                "id": ",".join(ids),
                            }
                        ),
                        classification=outbound.METERED,
                        headers=headers,
                    )
                    return youtube.parse_data_api(payload, now)

                fetch(source_id, video)
        sources.append(_web_source())
        if self.web_search:

            def web():
                timeout = min(10, budget.remaining())
                return _web_items(
                    budget.call(lambda: self.web_search(query, timeout=timeout)), now
                )

            fetch("web", web)
        else:
            statuses.append(
                {
                    "source_id": "web",
                    "state": "unavailable",
                    "reason": "host_search_unavailable",
                    "items": 0,
                }
            )
        evidence.extend(hn.evidence_for_items(hn_payload, items, now))
        items, evidence = merge_duplicates(items, evidence)
        known = {x.item_id for x in items}
        evidence = tuple(x for x in evidence if x.item_id in known)
        return Catalog(items, evidence, tuple(sources), (), query, (), ()), statuses
