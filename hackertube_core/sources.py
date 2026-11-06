"""Source ingestion, per-source status, and source controls.

PREF02, PREF03, PREF04, PREF14, and CAT05.

A source is one adapter in ``hackertube_core.adapters``. A *feed* is a
catalog-role source: enabling it adds that publisher's records to
ingestion, and disabling it stops later ingestion without claiming the
publisher is unreachable by broader-web search.

Ingestion is one bounded pass. Each enabled source is fetched through
``hackertube_core.http.read_json``, which sends the request through
``hackertube_core.outbound`` and counts it ``free``. A source that raises
records its own short error and the pass continues, so one failed source
does not hide the others. A disabled source is never fetched: Reddit,
YouTube, and Podcast Index stay blocked and make no request.

A ``TypeError`` is the one exception that is not treated as a source
failure. It is a mis-wired call in our own code (a read with no
classification, a wrong argument), so it is re-raised and fails loudly
rather than being stored as a source-down status that would hide the bug.

Storage is the profile database opened by ``ProfileStore``. This module
does not import ``sqlite3`` and does not connect to a file.

Duplicate identities: two sources that name the same work collapse into
one item that keeps every source's evidence. A shared ``gutenberg:``
identifier is the strong key. Without one, the key is the format plus the
normalized title and contributor set, so a book and its audiobook stay
distinct records (CAT06).
"""

from dataclasses import replace

from hackertube_core import outbound
from hackertube_core.adapters import MODULES, REGISTRY
from hackertube_core.adapters import hn, itunes, librivox, openlibrary
from hackertube_core.adapters.base import ParseResult
from hackertube_core.errors import RecordError
from hackertube_core.http import HttpError
from hackertube_core.text import canon_time

SCHEMA = "hackertube.sources/1"

#: PREF04: disabling a feed stops ingestion. It does not claim the publisher
#: is unreachable, because broader-web search can still find it.
BROADER_SEARCH_NOTE = (
    "Disabling this feed stops HackerTube from ingesting it. "
    "Broader-web search can still discover this publisher."
)
COMMUNITY_DISABLED_NOTE = "Disabled. No request is sent to this community."


def _fetch_hn(query, now):
    return hn.parse_search(hn.fetch_search(query), now)


def _fetch_itunes(query, now):
    return itunes.parse_results(itunes.fetch_search(query), now)


def _fetch_openlibrary(query, now):
    return openlibrary.parse_search(openlibrary.fetch_search(query), now)


def _fetch_librivox(query, now):
    """LibriVox answers 404 when the author search has no match.

    That is an empty result, not a source failure, so it is recorded as a
    successful attempt with no records. Any other HTTP error still raises.
    """
    try:
        payload = librivox.fetch_search(query)
    except HttpError as exc:
        if str(exc) == "http 404":
            return ParseResult((), (), (), ("no-records",))
        raise
    return librivox.parse_books(payload, now)


#: The default fetcher for each enabled source. A disabled source has none.
FETCHERS = {
    "hn": _fetch_hn,
    "itunes": _fetch_itunes,
    "openlibrary": _fetch_openlibrary,
    "librivox": _fetch_librivox,
}


def _control_note(policy, enabled):
    if enabled:
        return None
    if policy["role"] == "catalog":
        return BROADER_SEARCH_NOTE
    return COMMUNITY_DISABLED_NOTE


def source_view(settings=None, statuses=None, registry=None):
    """One inspectable row per supported source.

    ``settings`` is the stored choice per source id. A source with no
    stored choice uses the adapter default. ``statuses`` is the stored
    attempt record: last attempt, last success, and the current error.
    """
    settings = {} if settings is None else settings
    statuses = {} if statuses is None else statuses
    registry = REGISTRY if registry is None else registry
    rows = []
    for source_id, entry in registry.items():
        policy = MODULES[source_id].POLICY
        enabled = settings.get(source_id, entry["enabled"])
        status = statuses.get(source_id, {})
        rows.append(
            {
                "source_id": source_id,
                "name": policy["name"],
                "role": policy["role"],
                "formats": list(policy["formats"]),
                "supported": True,
                "enabled": enabled,
                "blocked_reason": None if enabled else entry["blocked_reason"],
                "last_attempt_at": status.get("last_attempt_at"),
                "last_success_at": status.get("last_success_at"),
                "last_error": status.get("last_error"),
                "attribution": policy["attribution"],
                "retention": policy["retention"],
                "deletion": policy["deletion"],
                "control_note": _control_note(policy, enabled),
            }
        )
    return tuple(rows)


def source_snapshot(store):
    """Body of ``GET /sources``. Reads the profile store only."""
    return {
        "schema": SCHEMA,
        "sources": list(source_view(store.source_settings(), store.source_statuses())),
    }


def configure_source(store, source_id, enabled):
    """Enable or disable one supported source.

    An unsupported id is reported and not stored, so the view never shows
    a false enabled state (PREF03). A source the adapter marks blocked
    cannot be enabled from the control; its blocked reason is returned.
    """
    if not isinstance(source_id, str) or source_id not in REGISTRY:
        return 400, {"error": "unsupported_source"}
    if type(enabled) is not bool:
        return 400, {"error": "enabled"}
    entry = REGISTRY[source_id]
    if enabled and not entry["enabled"]:
        return 409, {
            "error": "blocked",
            "source_id": source_id,
            "blocked_reason": entry["blocked_reason"],
        }
    store.set_source_enabled(source_id, enabled)
    return 200, source_snapshot(store)


def canonical_identity(item):
    """The key two sources must share to be the same canonical item.

    A shared work identifier wins. Otherwise the format, normalized title,
    and contributor set are the key. Format is part of every key, so a
    book and its audiobook never collapse.
    """
    works = sorted(value for value in item.identifiers if value.startswith("gutenberg:"))
    if works:
        return ("work", item.format, works[0])
    contributors = tuple(sorted(name.casefold() for name in (item.contributors or ())))
    return ("title", item.format, item.title.casefold(), contributors)


def merge_duplicates(items, evidence):
    """Collapse duplicate identities and keep every source's evidence.

    The first item in input order is kept. Evidence from a dropped
    duplicate is re-pointed at the kept item id. Evidence ids stay unique;
    a repeated id from the same source is kept once.
    """
    kept = {}
    order = []
    remap = {}
    for item in items:
        key = canonical_identity(item)
        if key in kept:
            remap[item.item_id] = kept[key].item_id
            continue
        kept[key] = item
        order.append(key)
        remap[item.item_id] = item.item_id
    merged = tuple(
        replace(kept[key], capture_order=position)
        for position, key in enumerate(order, start=1)
    )
    rows = []
    seen = set()
    for row in evidence:
        if row.evidence_id in seen:
            continue
        seen.add(row.evidence_id)
        item_id = remap.get(row.item_id, row.item_id)
        rows.append(row if item_id == row.item_id else replace(row, item_id=item_id))
    return merged, tuple(rows)


def _error_code(exc):
    """A short stored error. The payload is never echoed."""
    if isinstance(exc, (HttpError, RecordError)):
        text = str(exc).strip()
        if text:
            return text[:80]
    return "request failed"


def ingest(store, now, query, *, fetchers=None, registry=None):
    """Run one bounded ingestion pass over the enabled sources.

    ``fetchers`` maps a source id to ``fetch(query, now)`` returning a
    ``ParseResult``. The default is ``FETCHERS``. A source with no fetcher
    records ``no_fetcher`` instead of being silently skipped.
    """
    now = canon_time(now)
    if not isinstance(query, str) or not query.strip():
        raise RecordError("query")
    registry = REGISTRY if registry is None else registry
    fetchers = FETCHERS if fetchers is None else fetchers
    settings = store.source_settings()
    items = []
    evidence = []
    for source_id, entry in registry.items():
        enabled = settings.get(source_id, entry["enabled"])
        if not enabled:
            continue
        fetch = fetchers.get(source_id)
        if fetch is None:
            store.record_source_result(source_id, ok=False, at=now, error="no_fetcher")
            continue
        try:
            parsed = fetch(query, now)
        except TypeError:
            # A TypeError is a mis-wired call (a read with no classification,
            # a wrong argument), not a source outage. Let it surface: a
            # source-down status here would hide a bug in our own code.
            raise
        except Exception as exc:  # one source must not stop the pass
            store.record_source_result(source_id, ok=False, at=now, error=_error_code(exc))
            continue
        store.record_source_result(source_id, ok=True, at=now)
        items.extend(parsed.items)
        evidence.extend(parsed.evidence)
    merged_items, merged_evidence = merge_duplicates(items, evidence)
    return {
        "schema": SCHEMA,
        "query": query.strip(),
        "sources": list(source_view(store.source_settings(), store.source_statuses(), registry)),
        "items": merged_items,
        "evidence": merged_evidence,
        "request_counts": outbound.counters(),
    }
