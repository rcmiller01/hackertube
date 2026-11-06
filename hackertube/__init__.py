"""Native plugin entry. The dashboard page is not given this context."""


def register(ctx):
    """Load hook. Tools, hooks, and model calls stay unregistered."""
    return None
