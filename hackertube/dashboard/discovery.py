"""Prepared-feed read for the dashboard.

The opening feed is ``Catalog.feed``. Interest match is the gate, and
the core ranker orders matches by community evidence, freshness, and
variety. Each format section is ``Catalog.section`` split into those
matches and the other visible items of that format. Both calls hide
evidence whose ``refresh_after`` has passed. This module does not score
items, and it does not call a model or a search provider.

``signals`` names the ranking components. It is not a claim that every
component applied to every item. ``why`` is that per-item claim, and
only for ranked ids. Browse ids are absent from ``why`` and from
``feed``. A stored interest still counts as a profile when it yields
no match token. Dismissed and completed profile rows are removed after
those reads. An open is not a removal. With no stored interests the
sections keep the unranked catalog list in ``browse`` and the page
does not present it as a not-matched recommendation group.
"""

from hackertube_core import outbound
from hackertube_core.ranking import COMPONENTS
from hackertube_core.records import SECTIONS

SCHEMA = "hackertube.discovery/1"
SIGNALS = COMPONENTS


def excluded_ids(profile):
    """Item ids the default discovery feed leaves out."""
    found = []
    for row in profile.get("items") or ():
        if not isinstance(row, dict):
            continue
        if row.get("dismissed") is True or row.get("completed") is True:
            item_id = row.get("item_id")
            if isinstance(item_id, str):
                found.append(item_id)
    return frozenset(found)


def _section_groups(catalog, ranked, excluded, now):
    ranked_set = set(ranked)
    sections = {}
    for name in SECTIONS:
        visible = [
            item.item_id
            for item in catalog.section(name, now)
            if item.item_id not in excluded
        ]
        visible_set = set(visible)
        matches = [item_id for item_id in ranked if item_id in visible_set]
        browse = [item_id for item_id in visible if item_id not in ranked_set]
        sections[name] = {
            "matches": matches,
            "browse": browse,
            "match_count": len(matches),
            "browse_count": len(browse),
        }
    return sections


def discovery_dict(catalog, profile, now):
    """JSON object for ``GET /feed``.

    ``request_counts`` is the outbound boundary's ledger for this process.
    Opening, paging, and reranking read only local state, so both counts
    are zero. ``paid_calls`` is the paid count, kept for the page.
    """
    interests = tuple(
        text for text in (profile.get("interests") or ()) if isinstance(text, str)
    )
    excluded = excluded_ids(profile)
    feed = catalog.feed(interests, now)
    # Stored interests are the profile. Catalog.feed reports personalized
    # only when a match token exists, so a short interest such as "AI"
    # would otherwise look like an empty profile.
    personalized = bool(interests)
    ranked = []
    why = {}
    for item, reasons in zip(feed.items, feed.why):
        if item.item_id in excluded:
            continue
        ranked.append(item.item_id)
        why[item.item_id] = list(reasons)
    return {
        "schema": SCHEMA,
        "personalized": personalized,
        "paid_calls": outbound.counters()["paid"],
        "request_counts": outbound.counters(),
        "interests": list(interests),
        "signals": list(SIGNALS) if ranked else [],
        "feed": ranked,
        "why": why,
        "sections": _section_groups(catalog, ranked, excluded, now),
    }
