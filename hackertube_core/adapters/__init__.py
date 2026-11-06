"""Adapter registry. A disabled source does not fetch or store records."""

from . import hn, itunes, librivox, openlibrary, podcastindex, reddit, youtube

_MODULES = (hn, itunes, librivox, openlibrary, podcastindex, reddit, youtube)


def _entry(module):
    return {
        "source_id": module.POLICY["source_id"],
        "enabled": module.ENABLED,
        "blocked_reason": module.BLOCKED_REASON,
    }


REGISTRY = {entry["source_id"]: entry for entry in (_entry(module) for module in _MODULES)}
