"""Reddit stays disabled. This module does not send a request."""

POLICY = {
    "source_id": "reddit",
    "name": "Reddit",
    "role": "community",
    "attribution": "Reddit.",
    "retention": "Disabled until explicit Data API approval. No Reddit content is stored.",
    "deletion": "Nothing is stored. Approval is absent, so the 48-hour stored-content guidance is not in use.",
    "formats": (),
}


def fetch(**kwargs):
    return {"called": False, "enabled": False, "blocked_reason": "approval_absent"}
