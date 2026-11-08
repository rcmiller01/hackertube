"""Adapter parse results. Adapters do not create an HN media type."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ParseResult:
    items: tuple
    evidence: tuple
    ignored_fields: tuple
    rejected: tuple
