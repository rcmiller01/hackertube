"""Weighted ranking for interest matches.

Interest match is a gate, not a weight. ``prepared_feed`` admits an item
only when a stored interest matches the title or a contributor name.
This module then orders those matches. It does not read the wall clock.
Freshness is the whole-day age of ``captured_at`` against the ``now``
argument the caller passes in.

The three weighted components are module constants:

* Community evidence (``ENDORSEMENT_WEIGHT``). Added only when an
  unexpired evidence row has ``kind == "community"`` and
  ``endorsement == "established"``. A mention, a criticism, a catalog
  row, or a missing endorsement adds nothing. The why-line says
  "Community evidence" for that case and never names Hacker News.
* Freshness (``FRESHNESS_WEIGHT`` per day remaining in
  ``FRESHNESS_WINDOW_DAYS``). A newer record scores higher. The
  why-line says "Recent" only when the age is within ``RECENT_DAYS``.
  An older record can still rank on its remaining points without
  being called recent.
* Variety (``VARIETY_SOURCE_PENALTY`` and ``VARIETY_FORMAT_PENALTY``).
  A greedy pass subtracts those penalties when the candidate shares a
  catalog source or a format with the immediately previous pick, then
  breaks ties by item id. Variety changes order only. It is not a
  why-line.

``ENDORSEMENT_WEIGHT`` is larger than the whole freshness window, so a
documented endorsement outranks an unendorsed item captured on the
reference day. The variety penalties are smaller than that gap and
smaller than a 41-day freshness difference, so they break same-day
same-source runs without burying an endorsement or a clearly newer
record. Same items, evidence, interests, and reference time produce
the same order.
"""

from datetime import datetime, timezone

from hackertube_core.records import evidence_is_current
from hackertube_core.text import canon_time

ENDORSEMENT_WEIGHT = 1000
FRESHNESS_WINDOW_DAYS = 366
FRESHNESS_WEIGHT = 1
RECENT_DAYS = 30
VARIETY_SOURCE_PENALTY = 40
VARIETY_FORMAT_PENALTY = 20

WHY_MATCH = "Matched interest"
WHY_COMMUNITY = "Community evidence"
WHY_RECENT = "Recent"

COMPONENTS = (
    "matched interest",
    "community evidence",
    "freshness",
    "variety",
)


def _stamp(value):
    parsed = datetime.strptime(canon_time(value), "%Y-%m-%dT%H:%M:%SZ")
    return parsed.replace(tzinfo=timezone.utc)


def age_days(captured_at, now):
    """Whole days from ``captured_at`` to the reference instant.

    A record captured after the reference instant has age 0. Only the
    two timestamps passed in are used.
    """
    seconds = (_stamp(now) - _stamp(captured_at)).total_seconds()
    if seconds <= 0:
        return 0
    return int(seconds // 86400)


def _active(evidence, now):
    return tuple(record for record in evidence if evidence_is_current(record, now))


def established_community(item_id, evidence, now):
    """True only for an unexpired established community endorsement."""
    for record in _active(evidence, now):
        if record.item_id != item_id:
            continue
        if record.kind == "community" and record.endorsement == "established":
            return True
    return False


def _source_key(item, evidence, now):
    sources = {
        record.source_id
        for record in _active(evidence, now)
        if record.item_id == item.item_id and record.kind == "catalog"
    }
    return tuple(sorted(sources))


def _freshness_points(item, now):
    remaining = FRESHNESS_WINDOW_DAYS - age_days(item.captured_at, now)
    if remaining < 0:
        remaining = 0
    return remaining * FRESHNESS_WEIGHT


def _base_score(item, evidence, now):
    score = _freshness_points(item, now)
    if established_community(item.item_id, evidence, now):
        score += ENDORSEMENT_WEIGHT
    return score


def why_lines(item, evidence, now):
    """Signals that applied to this match. Order is fixed."""
    lines = [WHY_MATCH]
    if established_community(item.item_id, evidence, now):
        lines.append(WHY_COMMUNITY)
    if age_days(item.captured_at, now) <= RECENT_DAYS:
        lines.append(WHY_RECENT)
    return tuple(lines)


def _penalty(item, prev, evidence, now):
    if prev is None:
        return 0
    penalty = 0
    if _source_key(item, evidence, now) == _source_key(prev, evidence, now):
        penalty += VARIETY_SOURCE_PENALTY
    if item.format == prev.format:
        penalty += VARIETY_FORMAT_PENALTY
    return penalty


def rank_matches(items, evidence, now):
    """Return ``(ordered items, why tuples)``. ``now`` is the reference time."""
    canon_time(now)
    remaining = list(items)
    ordered = []
    reasons = []
    prev = None
    while remaining:
        remaining.sort(
            key=lambda item: (
                -(_base_score(item, evidence, now) - _penalty(item, prev, evidence, now)),
                item.item_id,
            )
        )
        chosen = remaining.pop(0)
        ordered.append(chosen)
        reasons.append(why_lines(chosen, evidence, now))
        prev = chosen
    return tuple(ordered), tuple(reasons)
