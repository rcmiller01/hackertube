"""The single explicit demo Search (tasks 4.1 and 4.2).

An explicit dashboard Search turns one question into a bounded job:

1. Question interpretation. A provider reads the question and returns a
   topic, requested formats, depth, and any hard constraint. The bounded
   default provider is the deterministic local one; the keyed model
   provider is selected by the plugin setting.
2. Retrieved-candidate verification. Candidates are found in the loaded
   catalog and admitted only when a retrieved catalog record supports
   them. A candidate with no retrieved record is not a result.
3. Hard constraints. A requested time limit is applied to the item's own
   duration. Unknown duration is labeled unverified against that limit and
   excluded from strict matches rather than assumed to pass.
4. Source labels. Every result names the source its record came from. A
   community endorsement line appears only when the record carries one; a
   broader-web record is labeled with its source and gains no community
   endorsement.
5. Partial format coverage. A requested format with no verified record
   reports insufficient evidence instead of being filled with something
   else.

Nothing here imports a network client. The only outbound path is
``hackertube_core.http`` through ``hackertube_core.outbound``, so the
``hackertube`` package's request-boundary scan stays green. The stub
provider makes no outbound call at all.

Storage is the profile store opened by ``ProfileStore``, which uses Hermes
``plugin_db``. This module does not import ``sqlite3``.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field

from hackertube_core import outbound
from hackertube_core.boundaries import active_evidence, matches_terms, recommendation_line
from hackertube_core.errors import RecordError
from hackertube_core.records import SECTIONS
from hackertube_core.text import render_untrusted, tokens

SCHEMA = "hackertube.search/1"

#: The credit-use disclosure. It is shown at the Search action before any
#: provider activity and must be accepted before a job starts (JOB09,
#: JOB10). The page renders the same string; a test pins the two together.
DISCLOSURE = (
    "Configured sources and the broader web may be searched. "
    "Model, search, and provider credits or quota may be used. Browsing is free."
)

#: The plugin-owned secret name declared in ``plugin.yaml`` as a
#: ``type: secret`` field. It is read only through ``agent.secret_scope``.
SECRET_NAME = "HACKERTUBE_MODEL_KEY"

PROVIDER_STUB = "stub"
PROVIDER_LIVE = "live"
PROVIDERS = (PROVIDER_LIVE, PROVIDER_STUB)

#: The bounded work limits the demo search runs under (JOB01, JOB03).
MAX_QUESTION = 200
DEFAULT_MAX_HITS = 12
DEFAULT_MAX_REQUESTS = 2
DEFAULT_DEADLINE_SECONDS = 5

SECTION_LABEL = {
    "videos": "videos",
    "podcasts": "podcasts",
    "books": "books",
    "audiobooks": "audiobooks",
}

#: A requested format word maps to the catalog formats it asks for. "Read"
#: asks for books; "listen" asks for audio; "watch" asks for video. The
#: format noun itself asks for the same format.
_FORMAT_WORDS = {
    "read": ("book",),
    "reads": ("book",),
    "reading": ("book",),
    "book": ("book",),
    "books": ("book",),
    "listen": ("audiobook", "podcast_show", "podcast_episode"),
    "listens": ("audiobook", "podcast_show", "podcast_episode"),
    "listening": ("audiobook", "podcast_show", "podcast_episode"),
    "hear": ("audiobook", "podcast_show", "podcast_episode"),
    "audio": ("audiobook", "podcast_show", "podcast_episode"),
    "audiobook": ("audiobook",),
    "audiobooks": ("audiobook",),
    "podcast": ("podcast_show", "podcast_episode"),
    "podcasts": ("podcast_show", "podcast_episode"),
    "watch": ("video",),
    "watching": ("video",),
    "watches": ("video",),
    "video": ("video",),
    "videos": ("video",),
}
#: Words that describe the request rather than its subject. They are not
#: topic terms, so a limit or a depth word cannot match a title.
_MEASURE = frozenset(
    """
    under below less than most longer shorter brief quick short
    minute minutes min mins hour hours second seconds sec secs
    """.split()
)
_WORD = re.compile(r"[a-z]+")

#: A time limit the question states in words. "under 30 minutes" -> 1800.
_LIMIT = re.compile(
    r"\b(?:under|shorter than|less than|below|at most|no longer than)\s+"
    r"(?:an?\s+)?(\d+)?\s*"
    r"(hours?|minutes?|mins?|seconds?|secs?)\b"
)
_UNIT_SECONDS = {
    "hour": 3600,
    "hours": 3600,
    "minute": 60,
    "minutes": 60,
    "min": 60,
    "mins": 60,
    "second": 1,
    "seconds": 1,
    "sec": 1,
    "secs": 1,
}
_BRIEF = frozenset({"brief", "quick", "short", "shorter"})

CONSTRAINT_WITHIN = "within"
CONSTRAINT_UNVERIFIED = "unverified"
CONSTRAINT_NONE = "none"

STATE_LABEL = {"saved": "Saved", "dismissed": "Dismissed", "completed": "Completed"}


class ProviderUnavailable(RuntimeError):
    """The selected provider cannot run. Raised before any outbound call."""


class ProviderTimeout(RuntimeError):
    """The provider did not answer inside the job deadline."""


class DisclosureRequired(RuntimeError):
    """The credit-use disclosure was not accepted before a job was asked for."""


@dataclass(frozen=True)
class Limits:
    """The bounded work limits one job runs under."""

    max_hits: int = DEFAULT_MAX_HITS
    max_requests: int = DEFAULT_MAX_REQUESTS
    deadline_seconds: float = DEFAULT_DEADLINE_SECONDS

    def __post_init__(self):
        if type(self.max_hits) is not int or self.max_hits < 1:
            raise RecordError("limits")
        if type(self.max_requests) is not int or self.max_requests < 1:
            raise RecordError("limits")
        if not isinstance(self.deadline_seconds, (int, float)) or self.deadline_seconds <= 0:
            raise RecordError("limits")

    def as_dict(self):
        return {
            "max_hits": self.max_hits,
            "max_requests": self.max_requests,
            "deadline_seconds": self.deadline_seconds,
        }


DEFAULT_LIMITS = Limits()


@dataclass(frozen=True)
class Interpretation:
    """One question read. The provider returns this and nothing else."""

    question: str
    topic: str
    terms: tuple
    formats: tuple
    depth: str
    max_duration_seconds: object

    def as_dict(self):
        return {
            "question": self.question,
            "topic": self.topic,
            "terms": list(self.terms),
            "formats": list(self.formats),
            "depth": self.depth,
            "max_duration_seconds": self.max_duration_seconds,
        }


def canonical_question(value, limit=MAX_QUESTION):
    """The one question boundary. Text only, no markup, bounded length."""
    if not isinstance(value, str):
        raise RecordError("question")
    text = render_untrusted(value).strip()
    if not text or len(text) > limit or "<" in text or ">" in text:
        raise RecordError("question")
    return text


def _duration_limit(lowered):
    match = _LIMIT.search(lowered)
    if not match:
        return None
    count = match.group(1)
    unit = match.group(2)
    amount = 1 if count is None else int(count)
    if amount < 1:
        return None
    return amount * _UNIT_SECONDS[unit]


def interpret_question(question):
    """Read one question into a topic, formats, depth, and constraint.

    This is the deterministic reading the bounded local provider returns.
    A keyed model provider returns the same shape so callers cannot tell
    which provider answered. Interpretation selects and explains; it never
    supplies an item identity.
    """
    cleaned = canonical_question(question)
    words = tokens(cleaned)
    raw = _WORD.findall(cleaned.lower())
    formats = []
    for word in raw:
        for fmt in _FORMAT_WORDS.get(word, ()):
            if fmt not in formats:
                formats.append(fmt)
    terms = tuple(
        word for word in words if word not in _FORMAT_WORDS and word not in _MEASURE
    )
    return Interpretation(
        question=cleaned,
        topic=" ".join(terms),
        terms=terms,
        formats=tuple(formats),
        depth="brief" if any(word in _BRIEF for word in raw) else "standard",
        max_duration_seconds=_duration_limit(cleaned.lower()),
    )


# --- providers -------------------------------------------------------------


@dataclass
class ProviderOutcome:
    """What one provider call returned.

    ``cost_usd`` is the provider's own report, or ``None`` when the
    provider does not supply one. A ``None`` cost is displayed as unknown,
    never as zero (JOB04).
    """

    interpretation: object
    cost_usd: object = None
    requests_used: int = 0
    truncated: bool = False
    error: object = None


class StubProvider:
    """The deterministic local provider. It makes no outbound call.

    ``script`` maps a cleaned question to an ``Interpretation``; without a
    script the deterministic reader answers. ``fail`` scripts the failure
    path: ``"timeout"`` raises ``ProviderTimeout`` and ``"error"`` raises
    ``RuntimeError``. ``cost`` is the provider's reported cost, left
    ``None`` by default so the job displays an unknown cost.
    """

    name = PROVIDER_STUB

    def __init__(self, *, script=None, cost=None, truncated=False, fail=None):
        self._script = dict(script or {})
        self._cost = cost
        self._truncated = bool(truncated)
        self._fail = fail

    def available(self):
        return True

    def interpret(self, question, limits):
        cleaned = canonical_question(question)
        if self._fail == "timeout":
            raise ProviderTimeout("the stub provider did not answer inside the deadline")
        if self._fail == "error":
            raise RuntimeError("the stub provider returned an error")
        interpretation = self._script.get(cleaned) or interpret_question(cleaned)
        return ProviderOutcome(
            interpretation=interpretation,
            cost_usd=self._cost,
            requests_used=1,
            truncated=self._truncated,
        )


def _default_live_transport(key, endpoint, payload, *, opener=None, resolve=None, timeout=15):
    """Post one chat-completion request through the outbound boundary.

    The key goes in the request header only. Nothing is written to the
    plugin data root. ``opener`` and ``resolve`` exist so a test can drive
    this path without a live connection; production passes neither.
    """
    from hackertube_core.http import post_json

    return post_json(
        endpoint,
        classification=outbound.PAID,
        payload=payload,
        headers={"Authorization": f"Bearer {key}"},
        cost=None,
        opener=opener,
        resolve=resolve,
        timeout=timeout,
    )


class LiveProvider:
    """The keyed model provider.

    The declared secret is read through the caller-supplied
    ``get_secret`` (``agent.secret_scope.get_secret`` in production), never
    from a credential file. With the key or the endpoint absent it fails
    closed with a clear message and makes no outbound call.

    ``transport`` is the one seam a test substitutes; the default posts
    through ``hackertube_core.http`` inside ``outbound.dispatch(PAID, ...)``.
    """

    name = PROVIDER_LIVE

    def __init__(self, key, endpoint, *, transport=None, opener=None, resolve=None, timeout=15):
        self._key = key
        self._endpoint = endpoint if isinstance(endpoint, str) else ""
        self._transport = transport or _default_live_transport
        self._opener = opener
        self._resolve = resolve
        self._timeout = timeout

    def available(self):
        return isinstance(self._key, str) and bool(self._key.strip()) and bool(self._endpoint.strip())

    def interpret(self, question, limits):
        if not isinstance(self._key, str) or not self._key.strip():
            raise ProviderUnavailable(
                "The declared model key is not set, so the live search provider was not "
                "called and no request was sent. Enter the plugin's model key, or select "
                "the deterministic stub provider for the demo cut."
            )
        if not self._endpoint.strip():
            raise ProviderUnavailable(
                "No model endpoint is configured for the live search provider, so no "
                "request was sent."
            )
        cleaned = canonical_question(question)
        payload = {
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Return the topic, requested formats, depth, and any hard time "
                        "limit of the user's media question as JSON."
                    ),
                },
                {"role": "user", "content": cleaned},
            ]
        }
        body = self._transport(
            self._key.strip(),
            self._endpoint.strip(),
            payload,
            opener=self._opener,
            resolve=self._resolve,
            timeout=self._timeout,
        )
        return ProviderOutcome(
            interpretation=_interpretation_from(body, cleaned),
            cost_usd=_reported_cost(body),
            requests_used=1,
        )


def _interpretation_from(body, question):
    """Read a provider body into an interpretation, or fall back to the
    deterministic reading rather than inventing an item identity."""
    if isinstance(body, dict) and isinstance(body.get("interpretation"), dict):
        row = body["interpretation"]
        terms = tuple(str(value) for value in row.get("terms") or () if isinstance(value, str))
        formats = tuple(
            fmt for fmt in row.get("formats") or () if fmt in {f for group in SECTIONS.values() for f in group}
        )
        limit = row.get("max_duration_seconds")
        return Interpretation(
            question=question,
            topic=str(row.get("topic") or " ".join(terms)),
            terms=terms,
            formats=formats,
            depth=str(row.get("depth") or "standard"),
            max_duration_seconds=limit if type(limit) is int and limit > 0 else None,
        )
    return interpret_question(question)


def _reported_cost(body):
    """The provider's own cost report, or ``None`` when it reports none."""
    if isinstance(body, dict):
        cost = body.get("cost_usd")
        if isinstance(cost, (int, float)) and not isinstance(cost, bool) and cost >= 0:
            return float(cost)
    return None


def select_provider(name, *, get_secret, endpoint):
    """Build the selected provider, failing closed on an unknown name."""
    if name == PROVIDER_STUB:
        return StubProvider()
    if name == PROVIDER_LIVE:
        return LiveProvider(get_secret(SECRET_NAME), endpoint)
    raise ProviderUnavailable(f"unknown search provider: {name!r}")


# --- the result set --------------------------------------------------------


def _active_rows(evidence, item_id):
    return [row for row in evidence if row.item_id == item_id]


def _source_label(row, source_names):
    """The label one result carries. A community endorsement keeps its own
    line; a broader-web record is labeled with its source and is not
    presented as a community endorsement."""
    line = recommendation_line(row)
    name = source_names.get(row.source_id, row.source_id)
    if line:
        return {
            "source_id": row.source_id,
            "source_name": name,
            "kind": row.kind,
            "endorsement": row.endorsement,
            "label": line,
            "community_endorsement": True,
            "retrieved_at": row.retrieved_at,
        }
    if row.kind == "web":
        return {
            "source_id": row.source_id,
            "source_name": name,
            "kind": row.kind,
            "endorsement": row.endorsement,
            "label": f"Web: {name}",
            "community_endorsement": False,
            "retrieved_at": row.retrieved_at,
        }
    return {
        "source_id": row.source_id,
        "source_name": name,
        "kind": row.kind,
        "endorsement": row.endorsement,
        "label": name,
        "community_endorsement": False,
        "retrieved_at": row.retrieved_at,
    }


def _prior_state(profile, item_id):
    """The recorded profile state for one item. A question never edits it."""
    row = None
    for candidate in profile.get("items") or ():
        if isinstance(candidate, dict) and candidate.get("item_id") == item_id:
            row = candidate
            break
    state = {
        "saved": bool(row and row.get("saved")),
        "dismissed": bool(row and row.get("dismissed")),
        "completed": bool(row and row.get("completed")),
        "opens": len(row.get("opens") or ()) if row else 0,
    }
    for key in ("saved", "dismissed", "completed"):
        if state[key]:
            state["label"] = STATE_LABEL[key]
            break
    else:
        state["label"] = None
    return state


def _constraint_state(item, limit):
    """Apply the requested time limit to the item's own duration.

    Unknown duration is unverified, not a pass (SEARCH04). A known duration
    over the limit is not a result at all.
    """
    if limit is None:
        return CONSTRAINT_NONE, None, True
    duration = item.duration_seconds
    if duration is None:
        return (
            CONSTRAINT_UNVERIFIED,
            f"Unverified against the {_limit_phrase(limit)} limit. This record has no duration.",
            True,
        )
    if duration > limit:
        return CONSTRAINT_WITHIN, None, False
    return CONSTRAINT_WITHIN, None, True


def _limit_phrase(limit):
    if limit % 3600 == 0:
        hours = limit // 3600
        return f"{hours} hour" if hours == 1 else f"{hours} hours"
    if limit % 60 == 0:
        minutes = limit // 60
        return f"{minutes} minute" if minutes == 1 else f"{minutes} minutes"
    return f"{limit} second" if limit == 1 else f"{limit} seconds"


def _result(item, interpretation, rows, source_names, profile, limit):
    """One admitted result: a retrieved identity, a label, a constraint
    state, and the recorded prior state."""
    constraint, note, within = _constraint_state(item, limit)
    label = _source_label(rows[0], source_names)
    return {
        "item_id": item.item_id,
        "title": item.title,
        "format": item.format,
        "destination": item.destination,
        "contributors": list(item.contributors or ()),
        "duration_seconds": item.duration_seconds,
        "source": label,
        "constraint": constraint,
        "constraint_note": note,
        "strict": within and constraint != CONSTRAINT_UNVERIFIED,
        "state": _prior_state(profile, item.item_id),
        "why": [f"Matched the question: {interpretation.topic}"],
        "verified": True,
    }


def candidate_verification(catalog, interpretation, profile, now):
    """Found candidates, then the ones a retrieved record supports.

    A candidate with no unexpired catalog evidence is dropped. The count of
    dropped candidates is reported so "no match" is not confused with "the
    record was unavailable".
    """
    terms = interpretation.terms
    if not terms:
        return [], [], 0
    rows = active_evidence(catalog.evidence, now)
    supported = {row.item_id for row in rows}
    candidates = [item for item in catalog.items if matches_terms(item, terms)]
    verified = [item for item in candidates if item.item_id in supported]
    dropped = [item for item in candidates if item.item_id not in supported]
    return candidates, verified, len(dropped)


def result_set(catalog, profile, interpretation, now, *, limits=DEFAULT_LIMITS):
    """The verified result set for one interpretation.

    Only retrieved records supply identity. Formats the question asked for
    but that have no verified record report insufficient evidence.
    """
    source_names = {source.source_id: source.name for source in catalog.sources}
    rows = active_evidence(catalog.evidence, now)
    _candidates, verified, dropped = candidate_verification(catalog, interpretation, profile, now)
    limit = interpretation.max_duration_seconds
    excluded_dismissed = 0
    over_limit = 0
    admitted = []
    for item in verified:
        state = _prior_state(profile, item.item_id)
        if state["dismissed"]:
            # The include-dismissed control is post-demo. With it off, a
            # dismissed item stays out of the focused set too (SEARCH11's
            # default), and its state is not presented as a match.
            excluded_dismissed += 1
            continue
        constraint, _note, within = _constraint_state(item, limit)
        if constraint == CONSTRAINT_WITHIN and not within:
            over_limit += 1
            continue
        admitted.append(item)
    ordered = sorted(
        admitted,
        key=lambda item: (-_term_hits(item, interpretation.terms), item.capture_order, item.item_id),
    )
    if len(ordered) > limits.max_hits:
        ordered = ordered[: limits.max_hits]
    results = []
    for item in ordered:
        item_rows = _active_rows(rows, item.item_id)
        results.append(_result(item, interpretation, item_rows, source_names, profile, limit))
    requested = list(interpretation.formats) or [
        fmt for fmt in ("book", "audiobook", "podcast_show", "podcast_episode", "video")
    ]
    sections = {}
    without_match = []
    for name, formats in SECTIONS.items():
        if not any(fmt in requested for fmt in formats):
            continue
        rows_here = [row for row in results if row["format"] in formats]
        note = None
        if not rows_here:
            without_match.append(name)
            note = f"No verified {SECTION_LABEL[name]} match for this question."
        sections[name] = {
            "label": SECTION_LABEL[name],
            "verified": rows_here,
            "verified_count": len(rows_here),
            "insufficient_evidence": not rows_here,
            "note": note,
        }
    return {
        "results": results,
        "sections": sections,
        "coverage": {
            "verified": len(results),
            "formats_requested": requested,
            "formats_without_match": without_match,
            "candidates": len(_candidates),
            "unverified_candidates": dropped,
            "excluded_dismissed": excluded_dismissed,
            "excluded_over_duration": over_limit,
        },
    }


def _term_hits(item, terms):
    haystack = item.title.lower()
    if item.contributors:
        haystack = haystack + " " + " ".join(item.contributors).lower()
    return sum(1 for term in terms if term in haystack)


# --- the job ---------------------------------------------------------------


def _job_state(outcome, limits, elapsed):
    """The terminal state, with the reason coverage is incomplete."""
    notes = []
    state = "succeeded"
    if outcome.truncated or outcome.requests_used > limits.max_requests:
        state = "partial"
        notes.append(
            f"Stopped at the {limits.max_requests}-request work limit. Coverage is incomplete."
        )
    if elapsed > limits.deadline_seconds:
        state = "partial"
        notes.append(
            f"Stopped at the {limits.deadline_seconds}-second deadline. Coverage is incomplete."
        )
    return state, notes


def run_search(
    store,
    question,
    *,
    catalog,
    profile,
    now,
    provider,
    limits=DEFAULT_LIMITS,
    disclosure_accepted=False,
    clock=time.monotonic,
):
    """Run one explicit bounded Search and persist its job.

    The disclosure gate runs first: without an accepted disclosure no
    provider is called and no job is created (JOB09, JOB10). A provider
    that cannot run raises before any outbound call (JOB01).
    """
    if disclosure_accepted is not True:
        raise DisclosureRequired(
            "The credit-use disclosure must be accepted before a Search starts."
        )
    cleaned = canonical_question(question)
    before = outbound.counters()
    started = clock()
    state = "running"
    notes = []
    try:
        outcome = provider.interpret(cleaned, limits)
    except ProviderUnavailable:
        raise
    except ProviderTimeout:
        outcome = ProviderOutcome(interpretation=interpret_question(cleaned), error="timeout")
    except RecordError:
        raise
    except Exception:
        outcome = ProviderOutcome(interpretation=interpret_question(cleaned), error="provider error")
    elapsed = clock() - started
    if outcome.error:
        state = "failed"
        notes.append(
            "The provider did not answer, so no candidates were retrieved. "
            f"Reason: {outcome.error}."
        )
        set_ = {"results": [], "sections": {}, "coverage": {"verified": 0, "notes": notes}}
        interpretation = outcome.interpretation
    else:
        interpretation = outcome.interpretation
        set_ = result_set(catalog, profile, interpretation, now, limits=limits)
        state, limit_notes = _job_state(outcome, limits, elapsed)
        notes.extend(limit_notes)
    coverage = set_["coverage"]
    coverage["notes"] = list(notes)
    coverage["limit_reached"] = state == "partial"
    after = outbound.counters()
    delta = {label: after[label] - before[label] for label in outbound.LABELS}
    usage = {
        "cost_usd": outcome.cost_usd,
        "cost_known": outcome.cost_usd is not None,
        "requests_used": outcome.requests_used,
        "request_counts": delta,
        "paid_calls": delta[outbound.PAID] + delta[outbound.METERED],
    }
    job = {
        "kind": "search",
        "state": state,
        "question": cleaned,
        "provider": provider.name,
        "limits": limits.as_dict(),
        "requests_used": outcome.requests_used,
        "result_count": len(set_["results"]),
        "cost_usd": outcome.cost_usd,
        "cost_known": outcome.cost_usd is not None,
        "coverage": list(notes),
        "created_at": now,
        "ended_at": now,
    }
    job_id = store.record_job(job)
    job["job_id"] = job_id
    return {
        "schema": SCHEMA,
        "job": job,
        "question": cleaned,
        "provider": provider.name,
        "interpretation": interpretation.as_dict(),
        "coverage": coverage,
        "sections": set_["sections"],
        "results": set_["results"],
        "usage": usage,
        "request_counts": outbound.counters(),
        "disclosure": DISCLOSURE,
    }
