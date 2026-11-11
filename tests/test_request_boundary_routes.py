"""FEED04, PREF08, JOB02, and JOB04 driven through the real dashboard routes.

These tests mount ``hackertube/dashboard/plugin_api.py`` as the host does and
drive the save, dismiss, and open routes, the profile store, and the feed
read with the outbound boundary guard installed. Nothing in the plugin is
simulated: the only substitutions are the two host seams listed in
``tests/route_harness.py``. A network call added to a mutation route fails
here.

The page controls that issue these requests are driven in
``tests/test_dashboard_page.js`` (Save, Dismiss, Open, and Show more), and
``docs/receipts/requests/probe.py`` replays this same flow for the receipt.
"""

import socket

import pytest

outbound = pytest.importorskip("hackertube_core.outbound")
pytest.importorskip("fastapi")

import route_harness  # noqa: E402  (needs the tests directory on sys.path)

PRIDE = "ol:OL66554W"
ZERO = {"free": 0, "paid": 0, "metered": 0}


def _start(root, name, monkeypatch):
    return route_harness.start(root, name=name, monkeypatch=monkeypatch)


def _no_request(where):
    counters = outbound.counters()
    assert counters == ZERO, f"{where} dispatched {counters}"
    assert outbound.LEDGER.in_flight == 0, f"{where} left a request in flight"


@pytest.fixture
def root(tmp_path):
    return tmp_path / "plugin-data"


def test_pref16_remove_interest_updates_feed_and_persists_without_outbound_calls(root, monkeypatch):
    with outbound.guard():
        outbound.reset()
        dashboard = _start(root, "hackertube_remove_interest", monkeypatch)
        try:
            dashboard.post("/profile/interests", {"text": "jane austen"})
            assert dashboard.get("/feed").json()["feed"]
            dashboard.post("/profile/saves", {"item_id": PRIDE})
            removed = dashboard.post("/profile/interests", {"text": "jane austen", "remove": True})
            assert removed.status_code == 200
            assert removed.json()["interests"] == []
            assert any(row["saved"] for row in removed.json()["items"])
            feed = dashboard.get("/feed").json()
            assert feed["feed"] == []
            assert feed["personalized"] is False
            _no_request("remove interest and rerank")
        finally:
            dashboard.close()
        reopened = _start(root, "hackertube_remove_interest_reopened", monkeypatch)
        try:
            assert reopened.get("/profile").json()["interests"] == []
            assert reopened.get("/feed").json()["feed"] == []
            _no_request("reopen after interest removal")
        finally:
            reopened.close()


def test_feed04_browsing_paging_saving_dismissing_and_reopening_make_no_request(root, monkeypatch):
    """Open, page, save, dismiss, reopen — through the routes the page calls."""
    with outbound.guard():
        outbound.reset()
        dashboard = _start(root, "hackertube_feed04", monkeypatch)
        try:
            # Opening the dashboard: catalog, feed, profile — three page reads.
            assert dashboard.get("/catalog").status_code == 200
            _no_request("GET /catalog")
            opened = dashboard.get("/feed")
            assert opened.status_code == 200
            _no_request("GET /feed (first run)")
            body = opened.json()
            assert body["personalized"] is False
            assert body["paid_calls"] == 0
            assert body["request_counts"] == ZERO
            assert dashboard.get("/profile").status_code == 200
            _no_request("GET /profile")

            # A stored interest is the profile; ranking stays local.
            added = dashboard.post("/profile/interests", {"text": "jane austen"})
            assert added.status_code == 200
            assert added.json()["interests"] == ["jane austen"]
            _no_request("POST /profile/interests")

            ranked = dashboard.get("/feed")
            assert ranked.status_code == 200
            feed = ranked.json()
            assert feed["personalized"] is True
            assert len(feed["feed"]) == 10
            # Show more reveals items the first screen holds back. Paging is a
            # client-side read of this payload; the page test drives the
            # control and asserts it issues no request.
            assert len(feed["feed"]) > 5
            _no_request("GET /feed (ranked)")
            assert feed["paid_calls"] == 0

            # Save: the real POST /profile/saves route, the real store write.
            saved = dashboard.post("/profile/saves", {"item_id": PRIDE})
            assert saved.status_code == 200
            saved_row = _row(saved.json(), PRIDE)
            assert saved_row["saved"] is True
            assert saved_row["saved_order"] == 1
            _no_request("POST /profile/saves")

            after_save = dashboard.get("/feed").json()
            assert PRIDE in after_save["feed"], "a saved item stays in discovery"
            _no_request("GET /feed (after save)")

            # Dismiss: the real POST /profile/dismissals route.
            dismissed = dashboard.post("/profile/dismissals", {"item_id": PRIDE})
            assert dismissed.status_code == 200
            assert _row(dismissed.json(), PRIDE)["dismissed"] is True
            _no_request("POST /profile/dismissals")

            after_dismiss = dashboard.get("/feed").json()
            assert PRIDE not in after_dismiss["feed"], "a dismissed item leaves discovery"
            sections = after_dismiss["sections"]
            assert all(PRIDE not in group["browse"] for group in sections.values())
            _no_request("GET /feed (after dismiss)")

            # Open: the real POST /profile/opens route. An open is not a removal.
            opened_row = dashboard.post("/profile/opens", {"item_id": PRIDE})
            assert opened_row.status_code == 200
            assert len(_row(opened_row.json(), PRIDE)["opens"]) == 1
            assert _row(opened_row.json(), PRIDE)["dismissed"] is True
            _no_request("POST /profile/opens")
        finally:
            dashboard.close()

        # Reopening the dashboard: a fresh plugin load and client over the same
        # data root, so the store is re-read from disk rather than from memory.
        reopened = _start(root, "hackertube_feed04_reopened", monkeypatch)
        try:
            assert reopened.get("/catalog").status_code == 200
            _no_request("GET /catalog (reopen)")
            body = reopened.get("/feed").json()
            assert PRIDE not in body["feed"], "the dismissal survived the reopen"
            assert body["interests"] == ["jane austen"]
            assert body["request_counts"] == ZERO
            assert body["paid_calls"] == 0
            profile = reopened.get("/profile").json()
            assert _row(profile, PRIDE)["dismissed"] is True
            assert len(_row(profile, PRIDE)["opens"]) == 1
            _no_request("GET /feed and /profile (reopen)")
        finally:
            reopened.close()


def test_pref08_read_only_browsing_submits_nothing_outside_the_profile(root, monkeypatch):
    """PREF08: browsing sends no personal context, because it sends nothing."""
    with outbound.guard():
        outbound.reset()
        dashboard = _start(root, "hackertube_pref08", monkeypatch)
        try:
            for interest in ("jane austen", "AI", "C++", "gardening"):
                dashboard.post("/profile/interests", {"text": interest})
                _no_request(f"POST /profile/interests {interest!r}")
                body = dashboard.get("/feed").json()
                assert interest in body["interests"]
                assert body["request_counts"] == ZERO
                _no_request(f"GET /feed for {interest!r}")
            sections = dashboard.get("/feed").json()["sections"]
            assert set(sections) == {"videos", "podcasts", "books", "audiobooks"}
        finally:
            dashboard.close()
    assert outbound.counters() == ZERO
    assert outbound.usage() == {
        "free": 0,
        "paid": 0,
        "metered": 0,
        "cost_usd": 0.0,
        "unknown_cost_calls": 0,
    }


def test_job02_loading_the_plugin_repeatedly_starts_no_paid_job(root, monkeypatch):
    """JOB02 at the plugin boundary: repeated load and display, no job.

    The Hermes host install/load walk was not run on this box (the ``hermes``
    CLI refused to start), so this is the plugin-level equivalent: five
    separate router loads against one data root, each displaying the stale
    feed. It asserts no scheduler, no recurring job, and no request. Host
    scheduler behaviour is not claimed.
    """
    with outbound.guard():
        outbound.reset()
        for index in range(5):
            dashboard = _start(root, f"hackertube_job02_{index}", monkeypatch)
            try:
                assert dashboard.get("/feed").status_code == 200
                _no_request(f"plugin load {index}")
            finally:
                dashboard.close()
    assert outbound.counters() == ZERO
    # The guard is a context manager: leaving it restores the real entry points.
    assert socket.getaddrinfo.__name__ == "_refuse_live_dns"


def test_job04_a_paid_call_with_no_reported_cost_is_ledger_unknown():
    """JOB04 accounting only: an unknown cost is null, never zero.

    This is **ledger-only** accounting: it reads the boundary ledger directly
    and calls no route. The dashboard has no job display in 3.3 (the job
    surfaces are task 4.x), so nothing here verifies a rendered job cost.
    ``test_job04_the_feed_reports_the_count_but_not_the_cost`` separately
    pins what ``GET /feed`` actually carries.
    """
    with outbound.guard():
        outbound.reset()
        outbound.dispatch(outbound.PAID, lambda: "provider call", cost=None)
        usage = outbound.usage()
        assert usage["paid"] == 1
        assert usage["cost_usd"] is None
        assert usage["unknown_cost_calls"] == 1
        # A free or metered read never turns that into a zero-cost paid call.
        outbound.dispatch(outbound.METERED, lambda: "quota read")
        assert outbound.usage()["cost_usd"] is None
        assert outbound.counters() == {"free": 0, "paid": 1, "metered": 1}


def test_job04_the_feed_reports_the_count_but_not_the_cost(root, monkeypatch):
    """JOB04: ``GET /feed`` carries the paid count, never the cost fields.

    ``discovery_dict`` reports only counts, so an unknown cost is a ledger
    fact the page does not receive as a value. This replaces an earlier claim
    that the route propagated the unknown cost: the route propagates the
    **count** (what the page's zero-charge check reads), not the cost.
    """
    with outbound.guard():
        outbound.reset()
        dashboard = _start(root, "hackertube_job04_feed", monkeypatch)
        try:
            outbound.dispatch(outbound.PAID, lambda: "provider call", cost=None)
            body = dashboard.get("/feed").json()
        finally:
            dashboard.close()
        assert body["paid_calls"] == 1
        assert body["request_counts"] == {"free": 0, "paid": 1, "metered": 0}
        assert "cost_usd" not in body
        assert "unknown_cost_calls" not in body


def _row(snapshot, item_id):
    for row in snapshot["items"]:
        if row["item_id"] == item_id:
            return row
    raise AssertionError(f"{item_id} missing from the profile snapshot")
