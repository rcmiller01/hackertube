"""Task 3.3 red check: a request outside the boundary fails the suite.

Copies ``hackertube/dashboard/discovery.py`` to a temporary module, adds a
direct ``urllib.request.urlopen`` call to the feed path, and runs it under
the boundary guard. The expected outcome is ``NetworkOutsideBoundary`` —
the same failure the driven tests in ``tests/test_request_boundary.py``
raise when a module bypasses the boundary.

Run from the repository root:

    python3 docs/receipts/requests/bypass_probe.py
"""

import importlib.util
import sys
import tempfile
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from hackertube_core import outbound  # noqa: E402
from hackertube_core.catalog import load_seed  # noqa: E402

NOW = "2026-11-06T12:24:15Z"
SOURCE = ROOT / "hackertube" / "dashboard" / "discovery.py"
BYPASS = (
    "def _bypass(url):\n"
    "    import urllib.request\n\n"
    "    return urllib.request.urlopen(url)\n\n\n"
    "def discovery_dict(catalog, profile, now):"
)
INJECT = (
    '    _bypass("https://example.com/paid")\n'
    "    feed = catalog.feed(interests, now)"
)


def _bypassed_module():
    text = SOURCE.read_text()
    text = text.replace("def discovery_dict(catalog, profile, now):", BYPASS)
    text = text.replace("    feed = catalog.feed(interests, now)", INJECT)
    assert "_bypass(" in text and "urlopen" in text
    path = Path(tempfile.mkdtemp()) / "discovery_bypass.py"
    path.write_text(text)
    spec = importlib.util.spec_from_file_location("hackertube_discovery_bypass", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    module = _bypassed_module()
    catalog = load_seed()
    with ExitStack() as stack:
        for owner, attribute in outbound.guard_targets():
            stack.enter_context(patch.object(owner, attribute, outbound.guarded(owner, attribute)))
        outbound.reset()
        try:
            module.discovery_dict(catalog, {"interests": ["jane austen"], "items": []}, NOW)
        except outbound.NetworkOutsideBoundary as exc:
            print(f"refused as expected: {exc}")
            print(f"counters after refusal: {outbound.counters()}")
            return 0
        print("FAILED: the bypass reached the network and was not refused")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
