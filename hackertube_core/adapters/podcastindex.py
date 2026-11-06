"""Podcast Index stays blocked. This module does not send a request."""

POLICY = {
    "source_id": "podcastindex",
    "name": "Podcast Index",
    "role": "catalog",
    "attribution": "Podcast Index.",
    "retention": "No records are stored. A key and secret are required and were not available.",
    "deletion": "Nothing is stored.",
    "formats": ("podcast_show", "podcast_episode"),
}


def fetch(**kwargs):
    return {"called": False, "enabled": False, "blocked_reason": "missing_api_key"}
