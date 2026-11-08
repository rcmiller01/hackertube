"""Explicit source-backed media search with local browsing and Hermes-owned inference.

The deterministic stub remains an offline test provider. Real searches interpret
through Hermes, retrieve bounded source records, rank only those identities, and
persist them for library actions. Source and model budgets precede dispatch.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, replace

from hackertube_core import outbound
from hackertube_core.boundaries import (
    active_evidence,
    matches_terms,
    recommendation_line,
)
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

PROVIDER_STUB = "stub"
PROVIDER_LIVE = "hermes"
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
        if (
            not isinstance(self.deadline_seconds, (int, float))
            or self.deadline_seconds <= 0
        ):
            raise RecordError("limits")

    def as_dict(self):
        return {
            "max_hits": self.max_hits,
            "max_requests": self.max_requests,
            "deadline_seconds": self.deadline_seconds,
        }


DEFAULT_LIMITS = Limits()
LIVE_LIMITS = Limits(max_hits=24, max_requests=12, deadline_seconds=45)


@dataclass(frozen=True)
class Interpretation:
    """One question read. The provider returns this and nothing else."""

    question: str
    topic: str
    terms: tuple
    formats: tuple
    depth: str
    max_duration_seconds: object
    author: object = None

    def as_dict(self):
        return {
            "question": self.question,
            "topic": self.topic,
            "terms": list(self.terms),
            "formats": list(self.formats),
            "depth": self.depth,
            "max_duration_seconds": self.max_duration_seconds,
            "author": self.author,
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
            raise ProviderTimeout(
                "the stub provider did not answer inside the deadline"
            )
        if self._fail == "error":
            raise RuntimeError("the stub provider returned an error")
        interpretation = self._script.get(cleaned) or interpret_question(cleaned)
        return ProviderOutcome(
            interpretation=interpretation,
            cost_usd=self._cost,
            requests_used=1,
            truncated=self._truncated,
        )


def _interpretation_from(body, question):
    """Validate the host model's structured interpretation; never fall back silently."""
    row = body.get("interpretation") if isinstance(body, dict) else None
    if not isinstance(row, dict):
        raise ProviderUnavailable("The model returned no structured interpretation.")
    topic, terms, formats = row.get("topic"), row.get("terms"), row.get("formats")
    allowed = {fmt for group in SECTIONS.values() for fmt in group}
    if (
        not isinstance(topic, str)
        or not topic.strip()
        or len(topic) > 200
        or not isinstance(terms, list)
        or len(terms) > 20
        or not all(isinstance(x, str) and 0 < len(x) <= 80 for x in terms)
        or not isinstance(formats, list)
        or not all(isinstance(x, str) and x in allowed for x in formats)
    ):
        raise ProviderUnavailable("The model returned invalid search fields.")
    limit = row.get("max_duration_seconds")
    if limit is not None and (type(limit) is not int or limit <= 0):
        raise ProviderUnavailable("The model returned an invalid duration constraint.")
    author = row.get("author")
    if author is not None and (not isinstance(author, str) or len(author) > 120):
        raise ProviderUnavailable("The model returned an invalid author.")
    return Interpretation(
        question,
        canonical_question(topic),
        tuple(terms),
        tuple(dict.fromkeys(formats)),
        str(row.get("depth") or "standard")[:80],
        limit,
        author,
    )


def select_provider(name, **unused):
    """Production inference is always owned by Hermes; stub is for offline checks."""
    if name == PROVIDER_STUB:
        return StubProvider()
    if name in {"hermes", "live"}:  # migrate the old setting without reading its key
        from hackertube_core.hermes import HermesProvider

        return HermesProvider()
    raise ProviderUnavailable("Unknown search provider.")


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


def result_set(
    catalog, profile, interpretation, now, *, limits=DEFAULT_LIMITS, ranking=None
):
    """The verified result set for one interpretation.

    Only retrieved records supply identity. Formats the question asked for
    but that have no verified record report insufficient evidence.
    """
    source_names = {source.source_id: source.name for source in catalog.sources}
    rows = active_evidence(catalog.evidence, now)
    _candidates, verified, dropped = candidate_verification(
        catalog, interpretation, profile, now
    )
    if ranking is not None:
        supported = {row.item_id for row in rows}
        verified = [
            item
            for item in catalog.items
            if item.item_id in ranking and item.item_id in supported
        ]
    requested_formats = set(interpretation.formats)
    verified = [
        item
        for item in verified
        if not requested_formats or item.format in requested_formats
    ]
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
        key=lambda item: (
            (
                list(ranking).index(item.item_id)
                if ranking is not None
                else -_term_hits(item, interpretation.terms)
            ),
            item.capture_order,
            item.item_id,
        ),
    )
    if len(ordered) > limits.max_hits:
        ordered = ordered[: limits.max_hits]
    results = []
    for item in ordered:
        item_rows = _active_rows(rows, item.item_id)
        row = _result(item, interpretation, item_rows, source_names, profile, limit)
        if ranking is not None:
            row["why"] = [render_untrusted(ranking[item.item_id])]
        results.append(row)
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
    retriever=None,
):
    """Run and account for one job in its own request context."""
    with outbound.request_scope() as request_ledger:
        return _run_search(
            store,
            question,
            catalog=catalog,
            profile=profile,
            now=now,
            provider=provider,
            limits=limits,
            disclosure_accepted=disclosure_accepted,
            clock=clock,
            retriever=retriever,
            request_ledger=request_ledger,
        )


def _run_search(
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
    retriever=None,
    request_ledger=None,
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
    from hackertube_core.retrieval import Budget, BudgetExhausted

    cleaned = canonical_question(question)
    budget = Budget(limits, clock=clock if retriever is not None else time.monotonic)
    source_statuses = []
    ranking = None
    retrieval_limited = False
    rank_cost = None
    started = clock()
    state = "running"
    notes = []
    try:
        outcome = budget.call(
            lambda: provider.interpret(
                cleaned,
                replace(
                    limits, deadline_seconds=max(0.01, budget.ends - budget.clock())
                ),
            )
        )
    except ProviderUnavailable:
        if not provider.available():
            raise
        outcome = ProviderOutcome(
            interpretation=interpret_question(cleaned),
            error="invalid model response",
            requests_used=budget.used,
        )
    except ProviderTimeout:
        outcome = ProviderOutcome(
            interpretation=interpret_question(cleaned), error="timeout"
        )
    except RecordError:
        raise
    except Exception:
        outcome = ProviderOutcome(
            interpretation=interpret_question(cleaned), error="provider error"
        )
    elapsed = clock() - started
    if outcome.error:
        state = "failed"
        notes.append(
            "The provider did not answer, so no candidates were retrieved. "
            f"Reason: {outcome.error}."
        )
        set_ = {
            "results": [],
            "sections": {},
            "coverage": {"verified": 0, "notes": notes},
        }
        interpretation = outcome.interpretation
    else:
        interpretation = outcome.interpretation
        if retriever is not None:
            try:
                catalog, source_statuses = retriever(interpretation, now, budget)
                if catalog.items and hasattr(provider, "rank"):
                    timeout = budget.remaining()
                    ranking, rank_cost = budget.call(
                        lambda: provider.rank(cleaned, catalog, timeout)
                    )
                elif hasattr(provider, "rank"):
                    ranking = {}
                store.remember_catalog(catalog)
            except BudgetExhausted:
                retrieval_limited = True
                # No unranked remote record is promoted to an LLM recommendation.
                if hasattr(provider, "rank"):
                    ranking = {}
            except TypeError:
                raise
            except Exception:
                source_statuses.append(
                    {
                        "source_id": "ranking",
                        "state": "failed",
                        "error": "Search ranking failed.",
                    }
                )
                ranking = {}
        set_ = result_set(
            catalog, profile, interpretation, now, limits=limits, ranking=ranking
        )
        if retriever is not None:
            elapsed = clock() - started
        state, limit_notes = _job_state(outcome, limits, elapsed)
        notes.extend(limit_notes)
        if retriever is not None and (
            retrieval_limited
            or any(
                x["state"] in {"failed", "limit", "partial"} for x in source_statuses
            )
        ):
            state = "partial"
            notes.append("Some search services did not finish; coverage is incomplete.")
        if retriever is not None:
            for source in source_statuses:
                if source["state"] in {"unavailable", "failed", "limit", "partial"}:
                    notes.append(
                        source["source_id"]
                        + ": "
                        + source.get("reason", source.get("error", source["state"]))
                    )
    coverage = set_["coverage"]
    coverage["notes"] = list(notes)
    coverage["limit_reached"] = bool(
        retrieval_limited
        or outcome.truncated
        or outcome.requests_used > limits.max_requests
        or elapsed > limits.deadline_seconds
        or any(x["state"] == "limit" for x in source_statuses)
    )
    delta = request_ledger.counters()
    total_cost = outcome.cost_usd
    if retriever is not None:
        # Any call without reliable cost makes the whole job cost unknown.
        total_cost = (
            None
            if outcome.cost_usd is None
            or rank_cost is None
            or any(
                x["source_id"] == "web"
                and x["state"] in {"succeeded", "failed", "partial"}
                for x in source_statuses
            )
            else outcome.cost_usd + rank_cost
        )
    used = budget.used if retriever is not None else outcome.requests_used
    usage = {
        "cost_usd": total_cost,
        "cost_known": total_cost is not None,
        "requests_used": used,
        "request_counts": delta,
        "paid_calls": delta[outbound.PAID] + delta[outbound.METERED],
    }
    job = {
        "kind": "search",
        "state": state,
        "question": cleaned,
        "provider": provider.name,
        "limits": limits.as_dict(),
        "requests_used": used,
        "result_count": len(set_["results"]),
        "cost_usd": total_cost,
        "cost_known": total_cost is not None,
        "coverage": list(notes),
        "created_at": now,
        "ended_at": now,
    }
    job_id = store.record_job(job)
    job["job_id"] = job_id
    return {
        "schema": SCHEMA,
        "sources": source_statuses,
        "model_route": getattr(provider, "route", {}),
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
