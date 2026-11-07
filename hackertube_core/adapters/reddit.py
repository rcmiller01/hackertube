"""Reddit stays disabled. This module does not send a request."""

ENABLED = False
BLOCKED_REASON = "approval_absent"

POLICY = {
    "source_id": "reddit",
    "name": "Reddit",
    "role": "community",
    "attribution": "Reddit.",
    "retention": "Disabled until explicit Data API approval. No Reddit content is stored.",
    "refresh": "No refresh is defined. Nothing is stored, so the wiki's ~48-hour stored-content deletion guidance is not in use.",
    "deletion": "Nothing is stored. Approval is absent, so the 48-hour stored-content guidance is not in use.",
    "formats": (),
}


def fetch(**kwargs):
    return {"called": False, "enabled": False, "blocked_reason": "approval_absent"}
