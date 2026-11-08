"""Native registration for Hermes-owned search and model selection."""
from pathlib import Path
import sys


def register(ctx):
    root = str(Path(__file__).resolve().parent)
    if root not in sys.path:
        sys.path.insert(0, root)
    from hackertube_core.hermes import register as register_search
    register_search(ctx)
