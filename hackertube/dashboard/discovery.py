"""Prepared-feed read for the dashboard.

The opening feed is ``Catalog.feed``. Each format section is
``Catalog.section``. Both calls hide evidence whose ``refresh_after`` has
passed. This module does not score items, and it does not call a model
or a search provider.

``Catalog.feed`` matches interest words of at least four characters,
excluding a fixed stopword list, against the title and contributor names.
Matching items stay in capture order. A stored interest still counts as
a profile when it yields no match token. Dismissed and completed profile
rows are removed after those reads. An open is not a removal. When the
feed is personalized, a section shows only the ranked items of that
format, so an unmatched title is not used to fill a gap.
"""

from hackertube_core.records import SECTIONS

SCHEMA = "hackertube.discovery/1"
SIGNALS = (
    "interest word match in the title or a contributor name",
    "capture order",
    "unexpired catalog evidence",
)


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


def discovery_dict(catalog, profile, now):
    """JSON object for ``GET /feed``. ``paid_calls`` is the core feed's value."""
    interests = tuple(
        text for text in (profile.get("interests") or ()) if isinstance(text, str)
    )
    excluded = excluded_ids(profile)
    feed = catalog.feed(interests, now)
    # Stored interests are the profile. Catalog.feed reports personalized
    # only when a match token exists, so a short interest such as "AI"
    # would otherwise look like an empty profile.
    personalized = bool(interests)
    ranked = [item.item_id for item in feed.items if item.item_id not in excluded]
    allowed = set(ranked) if personalized else None
    sections = {}
    for name in SECTIONS:
        rows = catalog.section(name, now)
        visible = [item.item_id for item in rows if item.item_id not in excluded]
        if allowed is not None:
            visible = [item_id for item_id in visible if item_id in allowed]
        sections[name] = visible
    return {
        "schema": SCHEMA,
        "personalized": personalized,
        "paid_calls": feed.paid_calls,
        "interests": list(interests),
        "signals": list(SIGNALS) if feed.personalized else [],
        "feed": ranked,
        "sections": sections,
    }
