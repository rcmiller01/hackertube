"""Task 3.3 probe: receipts for FEED04, PREF08, JOB02, and JOB04.

Run from the repository root with the suite dependencies installed:

    .venv/bin/python docs/receipts/requests/probe.py

This drives the real dashboard routes — ``GET /catalog``, ``GET /feed``,
``GET /profile``, ``POST /profile/interests``, ``POST /profile/saves``,
``POST /profile/dismissals``, ``POST /profile/opens`` and a reopened plugin
load — with the outbound boundary guard installed, and records what each
phase dispatched. The page controls that issue these requests are driven by
``tests/test_dashboard_page.js``.

The two host seams (``agent.secret_scope`` and ``plugins.plugin_storage``)
are substituted by ``tests/route_harness.py``. No plugin code is patched.
"""

import json
import socket
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

import route_harness  # noqa: E402
from hackertube_core import outbound  # noqa: E402
from hackertube_core.adapters import youtube  # noqa: E402
from hackertube_core.http import read_json  # noqa: E402

PRIDE = "ol:OL66554W"
ZERO = {"free": 0, "paid": 0, "metered": 0}


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


def _phase(report, name, call):
    """Run one step and record the counters it dispatched."""
    before = outbound.counters()
    result = call()
    after = outbound.counters()
    report[name] = {
        "dispatched": {key: after[key] - before[key] for key in ("free", "paid", "metered")},
        "counters": after,
    }
    return result


def browsing(data_root, report):
    """FEED04: open, rank, page, save, dismiss, open, and reopen."""
    dashboard = route_harness.start(data_root, name="probe_feed04")
    try:
        _phase(report, "open_catalog", lambda: dashboard.get("/catalog").status_code)
        first = _phase(report, "open_feed", lambda: dashboard.get("/feed").json())
        assert first["personalized"] is False
        _phase(report, "open_profile", lambda: dashboard.get("/profile").status_code)
        _phase(
            report,
            "add_interest",
            lambda: dashboard.post("/profile/interests", {"text": "jane austen"}).status_code,
        )
        ranked = _phase(report, "rerank_feed", lambda: dashboard.get("/feed").json())
        assert ranked["personalized"] is True
        # Show more reveals the items the first screen holds back. It is a
        # client-side read of this payload; the page test drives the control.
        report["paging"] = {
            "ranked_items": len(ranked["feed"]),
            "first_screen": 4,
            "revealed_by_show_more": max(0, len(ranked["feed"]) - 4),
            "dispatched": {"free": 0, "paid": 0, "metered": 0},
        }
        saved = _phase(report, "save", lambda: dashboard.post("/profile/saves", {"item_id": PRIDE}).json())
        assert any(row["item_id"] == PRIDE and row["saved"] for row in saved["items"])
        after_save = _phase(report, "feed_after_save", lambda: dashboard.get("/feed").json())
        assert PRIDE in after_save["feed"]
        dismissed = _phase(
            report, "dismiss", lambda: dashboard.post("/profile/dismissals", {"item_id": PRIDE}).json()
        )
        assert any(row["item_id"] == PRIDE and row["dismissed"] for row in dismissed["items"])
        after_dismiss = _phase(report, "feed_after_dismiss", lambda: dashboard.get("/feed").json())
        assert PRIDE not in after_dismiss["feed"]
        opened = _phase(report, "open_item", lambda: dashboard.post("/profile/opens", {"item_id": PRIDE}).json())
        assert any(row["item_id"] == PRIDE and len(row["opens"]) == 1 for row in opened["items"])
    finally:
        dashboard.close()

    reopened = route_harness.start(data_root, name="probe_feed04_reopened")
    try:
        _phase(report, "reopen_catalog", lambda: reopened.get("/catalog").status_code)
        body = _phase(report, "reopen_feed", lambda: reopened.get("/feed").json())
        assert PRIDE not in body["feed"], "the dismissal did not survive the reopen"
        profile = _phase(report, "reopen_profile", lambda: reopened.get("/profile").json())
        row = next(row for row in profile["items"] if row["item_id"] == PRIDE)
        report["reopen_persisted"] = {"dismissed": row["dismissed"], "opens": len(row["opens"])}
    finally:
        reopened.close()


def pref08(data_root, report):
    """PREF08: browsing with stored interests submits nothing."""
    dashboard = route_harness.start(data_root, name="probe_pref08")
    phases = {}
    try:
        for interest in ("jane austen", "AI", "C++", "gardening"):
            _phase(
                phases,
                f"interest:{interest}",
                lambda interest=interest: dashboard.post("/profile/interests", {"text": interest}).status_code,
            )
            body = _phase(phases, f"feed:{interest}", lambda: dashboard.get("/feed").json())
            assert interest in body["interests"]
            assert body["request_counts"] == ZERO, body["request_counts"]
    finally:
        dashboard.close()
    report["pref08_phases"] = phases


def job02(data_root, report):
    """JOB02 at the plugin boundary: repeated load and display, no paid job."""
    loads = {}
    for index in range(5):
        dashboard = route_harness.start(data_root, name=f"probe_job02_{index}")
        try:
            _phase(loads, f"load_{index}", lambda: dashboard.get("/feed").status_code)
        finally:
            dashboard.close()
    report["job02_loads"] = loads


def classification(report):
    """A free source read, a metered source read, and a paid call."""
    outbound.reset()
    read_json(
        "https://example.com/catalog",
        classification=outbound.FREE,
        opener=_Opener(),
        resolve=_resolve,
    )
    report["unmetered_source_read"] = outbound.usage()

    outbound.reset()
    youtube.fetch_data_api("docSampleId", "test-key", opener=_Opener(), resolve=_resolve)
    report["metered_youtube_read"] = outbound.usage()

    outbound.reset()
    outbound.dispatch(outbound.PAID, lambda: "provider call", cost=None)
    report["paid_without_reported_cost"] = outbound.usage()

    outbound.reset()
    outbound.dispatch(outbound.PAID, lambda: "provider call", cost=0.25)
    report["paid_with_reported_cost"] = outbound.usage()
    outbound.reset()


def main():
    report = {"now": "2026-11-06T12:24:15Z", "labels": list(outbound.LABELS)}
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / "profile"
        for name, call in (
            ("feed04", browsing),
            ("pref08", pref08),
            ("job02", job02),
        ):
            with outbound.guard():
                outbound.reset()
                call(root, report)
                report[f"{name}_counters"] = outbound.counters()
                report[f"{name}_usage"] = outbound.usage()

    classification(report)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())