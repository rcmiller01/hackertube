"""Task 3.3 probe: request counts for browsing, a source read, and a paid call.

Run from the repository root:

    python3 docs/receipts/requests/probe.py

It installs the outbound boundary guard for the browsing section, so a
request that bypassed the boundary would raise instead of being counted.
"""

import importlib.util
import json
import socket
import sys
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from hackertube_core import outbound  # noqa: E402
from hackertube_core.catalog import load_seed  # noqa: E402
from hackertube_core.http import read_json  # noqa: E402

NOW = "2026-11-06T12:24:15Z"
PRIDE = "ol:OL66554W"
DISCOVERY = ROOT / "hackertube" / "dashboard" / "discovery.py"


def _discovery():
    spec = importlib.util.spec_from_file_location("hackertube_discovery_probe", DISCOVERY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _guard(stack):
    for owner, attribute in outbound.guard_targets():
        stack.enter_context(patch.object(owner, attribute, outbound.guarded(owner, attribute)))


def _resolve(host, port, *args, **kwargs):
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", 0))]


class _Response:
    status = 200

    def read(self, limit):
        return b'{"ok": true}'

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class _Opener:
    def open(self, request, timeout=None):
        return _Response()


def browsing():
    """FEED04 and PREF08: open, page, filter, save, dismiss, reopen."""
    discovery = _discovery()
    catalog = load_seed()
    profile = {"interests": ["jane austen"], "items": []}
    opened = discovery.discovery_dict(catalog, profile, NOW)
    paged = opened["feed"][:4]
    saved = discovery.discovery_dict(
        catalog,
        {"interests": ["jane austen"], "items": [{"item_id": PRIDE, "saved": True, "dismissed": False, "completed": False}]},
        NOW,
    )
    dismissed = discovery.discovery_dict(
        catalog,
        {"interests": ["jane austen"], "items": [{"item_id": PRIDE, "saved": True, "dismissed": True, "completed": False}]},
        NOW,
    )
    for _ in range(5):
        discovery.discovery_dict(catalog, profile, NOW)
    return {
        "opened_feed": len(opened["feed"]),
        "paged": len(paged),
        "saved_keeps_pride": PRIDE in saved["feed"],
        "dismissed_drops_pride": PRIDE not in dismissed["feed"],
        "request_counts": opened["request_counts"],
        "labels_seen": ["no request dispatched"],
    }


def main():
    result = {}
    with ExitStack() as stack:
        _guard(stack)
        outbound.reset()
        result["browsing"] = browsing()
        result["browsing_counters"] = outbound.counters()
        result["browsing_usage"] = outbound.usage()

    outbound.reset()
    for _ in range(2):
        read_json("https://example.com/catalog", opener=_Opener(), resolve=_resolve)
    result["source_read_counters"] = outbound.counters()
    result["source_read_usage"] = outbound.usage()

    outbound.reset()
    outbound.dispatch(outbound.PAID, lambda: "provider call", cost=None)
    result["paid_without_cost_usage"] = outbound.usage()

    outbound.reset()
    outbound.dispatch(outbound.PAID, lambda: "provider call", cost=0.25)
    result["paid_with_reported_cost_usage"] = outbound.usage()
    outbound.reset()

    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
