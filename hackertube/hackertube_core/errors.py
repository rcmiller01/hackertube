class RecordError(ValueError):
    """A catalog record or source payload failed a boundary check."""


class ProfileError(ValueError):
    """A profile write was rejected. The message is a short code, not the payload."""
