"""Boundary checks for verified items, endorsement, editions, and the seeded feed."""

import re
from dataclasses import dataclass

from hackertube_core.errors import RecordError
from hackertube_core.ranking import rank_matches
from hackertube_core.records import HN_RECOMMENDATION_LINE, SECTIONS
from hackertube_core.text import render_untrusted, tokens

_CRITICISM = (
    "don't recommend",
    "do not recommend",
    "don't watch",
    "do not watch",
    "waste of time",
    "not worth",
    "clickbait",
    "terrible",
    "avoid",
)


def _phrase(text, phrase):
    return re.search(rf"\b{re.escape(phrase)}\b", text) is not None


def classify_endorsement(value):
    """Keyword praise is not an endorsement. Negation fails closed.

    Established endorsement is not decided here. It requires a hand-verified
    flag and a direct item link in the Hacker News adapter.
    """
    text = render_untrusted(value).lower()
    if not text.strip():
        return "mention"
    if any(_phrase(text, phrase) for phrase in _CRITICISM):
        return "criticism"
    if re.search(r"\brecommend\w*\b.{0,40}\bavoid", text):
        return "criticism"
    if re.search(r"\bnot\b.{0,40}\b(?:good|recommend)", text):
        return "criticism"
    return "mention"


def recommendation_line(evidence):
    """The only Hacker News display line, and only for a real endorsement."""
    if (
        evidence.source_id == "hn"
        and evidence.kind == "community"
        and evidence.endorsement == "established"
        and evidence.destination.startswith("https://")
    ):
        return HN_RECOMMENDATION_LINE
    return None


def card_label(item):
    if item.format == "podcast_show":
        return "show"
    if item.format == "podcast_episode":
        return "episode"
    return item.format


def present_excerpt(settings, excerpt):
    """Render remote text. The settings object is not a write target."""
    return render_untrusted("" if excerpt is None else excerpt)


def verified_items(items, evidence):
    supported = {record.item_id for record in evidence}
    return tuple(item for item in items if item.item_id in supported)


def dedupe_items(items, evidence):
    kept = {}
    order = []
    for item in items:
        if item.item_id not in kept:
            kept[item.item_id] = item
            order.append(item.item_id)
    return tuple(kept[item_id] for item_id in order), tuple(evidence)


def gutenberg_ids(item):
    return tuple(value.split(":", 1)[1] for value in item.identifiers if value.startswith("gutenberg:"))


def link_editions(items):
    from hackertube_core.records import EditionLink

    books = {}
    audios = {}
    for item in items:
        target = books if item.format == "book" else audios if item.format == "audiobook" else None
        if target is None:
            continue
        for gid in gutenberg_ids(item):
            target.setdefault(gid, []).append(item.item_id)
    links = []
    for gid in sorted(set(books) & set(audios)):
        for book_id in books[gid]:
            for audio_id in audios[gid]:
                links.append(EditionLink(f"gutenberg:{gid}", book_id, audio_id))
    return tuple(links)


def explain_item(item, evidence, sources):
    rows = []
    for record in evidence:
        if record.item_id != item.item_id:
            continue
        source = sources[record.source_id]
        rows.append(
            {
                "source_id": record.source_id,
                "source_name": source.name,
                "retrieved_at": record.retrieved_at,
                "kind": record.kind,
                "endorsement": record.endorsement,
                "destination": record.destination,
                "display_line": recommendation_line(record),
                "attribution": source.attribution,
            }
        )
    if not rows:
        return None
    return {
        "item_id": item.item_id,
        "format": item.format,
        "label": card_label(item),
        "retrievals": tuple(rows),
        "positive_endorsement": any(row["display_line"] for row in rows),
    }


def active_evidence(evidence, now):
    kept = []
    for record in evidence:
        if record.refresh_after is not None and record.refresh_after <= now:
            continue
        kept.append(record)
    return tuple(kept)


def visible_item_ids(evidence, now):
    """A card needs unexpired catalog evidence. Hacker News alone is not a card."""
    grouped = {}
    for record in active_evidence(evidence, now):
        grouped.setdefault(record.item_id, []).append(record)
    return {
        item_id
        for item_id, rows in grouped.items()
        if any(row.kind == "catalog" for row in rows)
    }


@dataclass(frozen=True)
class Feed:
    items: tuple
    personalized: bool
    paid_calls: int = 0
    why: tuple = ()

    def __post_init__(self):
        if self.paid_calls != 0:
            raise RecordError("paid")
        if len(self.why) != len(self.items):
            raise RecordError("why")


def _matches(item, words):
    haystack = item.title.lower()
    if item.contributors:
        haystack = haystack + " " + " ".join(item.contributors).lower()
    return any(word in haystack for word in words)


def prepared_feed(items, evidence, interests, now):
    """Interest match is the gate. Weights and variety live in ``ranking``."""
    words = tokens(" ".join(interests))
    if not words:
        return Feed((), False)
    visible = visible_item_ids(evidence, now)
    matched = [item for item in items if item.item_id in visible and _matches(item, words)]
    ordered, why = rank_matches(matched, evidence, now)
    return Feed(ordered, True, why=why)


def section_items(items, evidence, section, now):
    if section not in SECTIONS:
        raise RecordError("section")
    formats = SECTIONS[section]
    visible = visible_item_ids(evidence, now)
    chosen = [item for item in items if item.format in formats and item.item_id in visible]
    chosen.sort(key=lambda item: item.capture_order)
    return tuple(chosen)


def question_coverage(items, evidence, question, now):
    feed = prepared_feed(items, evidence, (question,), now)
    counts = {section: 0 for section in SECTIONS}
    for item in feed.items:
        for section, formats in SECTIONS.items():
            if item.format in formats:
                counts[section] += 1
    return counts
