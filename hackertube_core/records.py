"""Normalized catalog records. Hacker News is not a media format."""

from dataclasses import dataclass

from hackertube_core.errors import RecordError
from hackertube_core.text import canon_time, plain_title, public_https_url, render_untrusted

FORMATS = ("video", "podcast_episode", "podcast_show", "book", "audiobook")
SECTIONS = {
    "videos": ("video",),
    "podcasts": ("podcast_episode", "podcast_show"),
    "books": ("book",),
    "audiobooks": ("audiobook",),
}
HN_RECOMMENDATION_LINE = "Recommended in Hacker News"
ENDORSEMENTS = ("established", "mention", "criticism", "none", "not_applicable")
EVIDENCE_KINDS = ("community", "catalog", "web")
AVAILABILITY = ("public", "unlisted", "private")
_IDENTIFIER = __import__("re").compile(r"^[A-Za-z0-9_.:-]{1,80}$")


def _identifier(value, field):
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
        raise RecordError(field)
    return value


@dataclass(frozen=True)
class MediaItem:
    item_id: str
    format: str
    title: str
    destination: str
    contributors: tuple
    duration_seconds: object
    availability: object
    identifiers: tuple
    show_id: object
    capture_order: int
    captured_at: str
    art_url: object
    art_hotlink: bool
    art_cache: bool
    art_reason: str
    art_checked_at: object
    art_http_status: object

    def __post_init__(self):
        _identifier(self.item_id, "item_id")
        if self.format not in FORMATS:
            raise RecordError("format")
        object.__setattr__(self, "title", plain_title(self.title))
        object.__setattr__(self, "destination", public_https_url(self.destination))
        if self.contributors is None:
            contributors = None
        else:
            contributors = tuple(plain_title(name) for name in self.contributors)
            if not contributors:
                contributors = None
        object.__setattr__(self, "contributors", contributors)
        if self.duration_seconds is not None and (
            type(self.duration_seconds) is not int or self.duration_seconds < 0
        ):
            raise RecordError("duration")
        if self.availability is not None and self.availability not in AVAILABILITY:
            raise RecordError("availability")
        identifiers = tuple(_identifier(value, "identifier") for value in self.identifiers)
        if self.item_id not in identifiers:
            raise RecordError("identifier")
        object.__setattr__(self, "identifiers", identifiers)
        if self.show_id is not None:
            _identifier(self.show_id, "show_id")
        if type(self.capture_order) is not int or self.capture_order < 1:
            raise RecordError("capture_order")
        object.__setattr__(self, "captured_at", canon_time(self.captured_at))
        if not isinstance(self.art_reason, str) or not self.art_reason.strip():
            raise RecordError("art")
        if self.art_url is None:
            if self.art_hotlink or self.art_cache or self.art_checked_at or self.art_http_status:
                raise RecordError("art")
        else:
            object.__setattr__(self, "art_url", public_https_url(self.art_url))
            if not self.art_hotlink or self.art_http_status != 200:
                raise RecordError("art")
            object.__setattr__(self, "art_checked_at", canon_time(self.art_checked_at))
        if not isinstance(self.art_hotlink, bool) or not isinstance(self.art_cache, bool):
            raise RecordError("art")


@dataclass(frozen=True)
class Evidence:
    evidence_id: str
    item_id: str
    source_id: str
    retrieved_at: str
    destination: str
    excerpt: object
    endorsement: str
    kind: str
    display_line: object
    refresh_after: object

    def __post_init__(self):
        _identifier(self.evidence_id, "evidence_id")
        _identifier(self.item_id, "item_id")
        _identifier(self.source_id, "source_id")
        object.__setattr__(self, "retrieved_at", canon_time(self.retrieved_at))
        object.__setattr__(self, "destination", public_https_url(self.destination))
        if self.excerpt is not None:
            rendered = render_untrusted(self.excerpt).strip()
            if rendered != self.excerpt or not rendered or len(rendered) > 280:
                raise RecordError("excerpt")
        if self.endorsement not in ENDORSEMENTS:
            raise RecordError("endorsement")
        if self.kind not in EVIDENCE_KINDS:
            raise RecordError("kind")
        if self.display_line is not None and self.display_line != HN_RECOMMENDATION_LINE:
            raise RecordError("display_line")
        if self.display_line and (
            self.endorsement != "established" or self.source_id != "hn" or self.kind != "community"
        ):
            raise RecordError("display_line")
        if self.refresh_after is not None:
            object.__setattr__(self, "refresh_after", canon_time(self.refresh_after))


@dataclass(frozen=True)
class SourceRecord:
    source_id: str
    name: str
    role: str
    enabled: bool
    blocked_reason: object
    attribution: str
    retention: str
    deletion: str
    refresh_after: object
    last_success_at: object
    last_error: object
    formats: tuple

    def __post_init__(self):
        _identifier(self.source_id, "source_id")
        if self.role not in {"catalog", "community"}:
            raise RecordError("role")
        if not isinstance(self.enabled, bool):
            raise RecordError("enabled")
        if not self.enabled and not self.blocked_reason:
            raise RecordError("blocked_reason")
        if self.enabled and self.blocked_reason:
            raise RecordError("blocked_reason")
        for field in ("name", "attribution", "retention", "deletion"):
            if not isinstance(getattr(self, field), str) or not getattr(self, field).strip():
                raise RecordError(field)
        formats = tuple(self.formats)
        if any(fmt not in FORMATS for fmt in formats):
            raise RecordError("format")
        object.__setattr__(self, "formats", formats)
        if self.refresh_after is not None:
            object.__setattr__(self, "refresh_after", canon_time(self.refresh_after))
        if self.last_success_at is not None:
            object.__setattr__(self, "last_success_at", canon_time(self.last_success_at))


@dataclass(frozen=True)
class EditionLink:
    work_id: str
    book_item_id: str
    audio_item_id: str

    def __post_init__(self):
        _identifier(self.work_id, "work_id")
        _identifier(self.book_item_id, "book_item_id")
        _identifier(self.audio_item_id, "audio_item_id")


INTEREST_MAX = 80


@dataclass(frozen=True)
class Interest:
    """A subject the user typed. It is not a catalog item and not a source."""

    text: str

    def __post_init__(self):
        if not isinstance(self.text, str):
            raise RecordError("interest")
        text = self.text.strip()
        if (
            render_untrusted(text) != text
            or not text
            or len(text) > INTEREST_MAX
            or "<" in text
            or ">" in text
        ):
            raise RecordError("interest")
        object.__setattr__(self, "text", text)


@dataclass(frozen=True)
class UserItemState:
    """One profile record for a canonical item.

    Saves, dismissal, completion, and opens stay separate fields. This
    record does not copy the item's title, destination, or evidence.
    """

    item_id: str
    saved: bool
    dismissed: bool
    completed: bool
    opens: tuple
    saved_order: object

    def __post_init__(self):
        _identifier(self.item_id, "item_id")
        if type(self.saved) is not bool or type(self.dismissed) is not bool or type(self.completed) is not bool:
            raise RecordError("state")
        opens = tuple(canon_time(stamp) for stamp in self.opens)
        object.__setattr__(self, "opens", opens)
        if self.saved:
            if type(self.saved_order) is not int or self.saved_order < 1:
                raise RecordError("saved_order")
        elif self.saved_order is not None:
            raise RecordError("saved_order")


def blank_art(reason):
    return {
        "art_url": None,
        "art_hotlink": False,
        "art_cache": False,
        "art_reason": reason,
        "art_checked_at": None,
        "art_http_status": None,
    }
