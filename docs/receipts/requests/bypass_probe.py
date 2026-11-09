"""Task 3.3 red check: a request outside the boundary fails.

Two checks, both with the production guard installed and no external traffic:

1. A copy of ``hackertube/dashboard/discovery.py`` with a direct
   ``urllib.request.urlopen`` added to the feed path must raise
   ``NetworkOutsideBoundary``.
2. A direct ``socket.socket().connect_ex`` to a loopback listener — the
   sibling of ``connect`` that the first version of the guard missed — must
   raise too.

It also shows the gate is a gate: the same loopback ``connect_ex`` inside a
boundary request succeeds and is counted.

Run from the repository root:

    .venv/bin/python docs/receipts/requests/bypass_probe.py
"""

import importlib.util
import socket
import sys
import tempfile
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
# hackertube_core lives in the plugin package, not at the repository root.
sys.path.insert(0, str(ROOT / "hackertube"))

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


def _listener():
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    return server


def main():
    failures = []
    module = _bypassed_module()
    catalog = load_seed()
    server = _listener()
    address = server.getsockname()
    with ExitStack() as stack:
        for owner, attribute in outbound.guard_targets():
            stack.enter_context(patch.object(owner, attribute, outbound.guarded(owner, attribute)))
        outbound.reset()
        try:
            module.discovery_dict(catalog, {"interests": ["jane austen"], "items": []}, NOW)
        except outbound.NetworkOutsideBoundary as exc:
            print(f"urlopen on the feed path refused as expected: {exc}")
        else:
            failures.append("urlopen on the feed path was not refused")

        outbound.reset()
        try:
            rc = socket.socket().connect_ex(address)
        except outbound.NetworkOutsideBoundary as exc:
            print(f"connect_ex outside the boundary refused as expected: {exc}")
        else:
            failures.append(f"connect_ex reached the listener (rc={rc}) and was not refused")
        print(f"counters after refusals: {outbound.counters()}")

        # The gate is passable when the request goes through the boundary.
        outbound.reset()
        client = socket.socket()
        try:
            rc = outbound.dispatch(outbound.FREE, client.connect_ex, address)
            print(f"connect_ex inside a boundary request connected: rc={rc}")
            print(f"counters after an allowed request: {outbound.counters()}")
            if rc != 0:
                failures.append("the allowed loopback connect_ex did not connect")
        finally:
            client.close()
    server.close()

    if failures:
        for failure in failures:
            print(f"FAILED: {failure}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())