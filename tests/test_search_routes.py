"""Tasks 4.1 and 4.2 driven through the real dashboard routes.

The search route is mounted exactly as the host mounts it, with the three
host seams listed in ``tests/route_harness.py``. The default settings select
the deterministic stub provider, so no test makes a live model or
paid-search call. `HACKERTUBE_MODEL_KEY` is never set.
"""

import json
import sqlite3

import pytest

outbound = pytest.importorskip("hackertube_core.outbound")
pytest.importorskip("fastapi")

import route_harness  # noqa: E402  (needs the tests directory on sys.path)

ZERO = {"free": 0, "paid": 0, "metered": 0}
QUESTION = "What can I read or listen to by Jane Austen?"


def _no_request(where):
    counters = outbound.counters()
    assert counters == ZERO, f"{where} dispatched {counters}"
    assert outbound.LEDGER.in_flight == 0, f"{where} left a request in flight"


def _job_rows(root):
    database = root / "profile.db"
    if not database.exists():
        return []
    connection = sqlite3.connect(str(database))
    connection.row_factory = sqlite3.Row
    try:
        return [dict(row) for row in connection.execute("SELECT * FROM search_job")]
    finally:
        connection.close()


@pytest.fixture
def root(tmp_path):
    return tmp_path / "plugin-data"


def test_job09_the_route_refuses_a_submit_without_the_disclosure(root):
    with outbound.guard():
        outbound.reset()
        dashboard = route_harness.start(root, name="hackertube_search_disclosure")
        try:
            for body in ({}, {"question": QUESTION}, {"question": QUESTION, "disclosure_accepted": False}):
                refused = dashboard.post("/search", body)
                assert refused.status_code == 400, body
                payload = refused.json()
                assert payload["error"] == "disclosure_required"
                assert "disclosure" in payload["message"].lower()
            _no_request("POST /search without the disclosure")
            assert _job_rows(root) == [], "a refused submit writes no job"
        finally:
            dashboard.close()


def test_acceptance1_a_keyless_live_provider_fails_closed_with_no_outbound_call(root):
    """The declared key is absent, so the live provider refuses before a call."""
    with outbound.guard():
        outbound.reset()
        route_harness.SECRETS.clear()
        dashboard = route_harness.start(
            root,
            name="hackertube_search_live_absent",
            settings={"provider": "live", "model_endpoint": "https://example.org/v1/chat/completions"},
        )
        try:
            status = dashboard.get("/status")
            assert status.status_code == 200
            assert status.json()["provider"] == "hermes"
            assert "model_key" not in status.json()

            info = dashboard.get("/search")
            assert info.status_code == 200
            assert info.json()["provider_available"] is False
            assert info.json()["provider"] == "hermes"

            refused = dashboard.post("/search", {"question": QUESTION, "disclosure_accepted": True})
            assert refused.status_code == 503
            payload = refused.json()
            assert payload["error"] == "provider_unavailable"
            assert payload["provider"] == "hermes"
            assert "Hermes search service" in payload["message"]
            assert "No request was sent" in payload["message"]
            _no_request("POST /search with no model key")
            assert _job_rows(root) == [], "a refused provider writes no job"
        finally:
            dashboard.close()


def test_acceptance1_an_undeclared_provider_name_falls_back_to_live_and_fails_closed(root):
    """A provider name outside the declared choices selects the live provider.

    The route never guesses a cheaper provider: an undeclared name behaves
    exactly like ``live``, so with no key it refuses and sends nothing.
    """
    with outbound.guard():
        outbound.reset()
        dashboard = route_harness.start(
            root, name="hackertube_search_unknown_provider", settings={"provider": "free-tier"}
        )
        try:
            refused = dashboard.post("/search", {"question": QUESTION, "disclosure_accepted": True})
            assert refused.status_code == 503
            assert refused.json()["provider"] == "hermes"
            assert refused.json()["message"]
            _no_request("POST /search with an undeclared provider name")
        finally:
            dashboard.close()


def test_search01_the_stub_provider_runs_the_demo_question_through_the_route(root):
    with outbound.guard():
        outbound.reset()
        dashboard = route_harness.start(root, name="hackertube_search_demo")
        try:
            info = dashboard.get("/search")
            assert info.status_code == 200
            assert info.json()["disclosure"] == (
                "Search may query your configured sources and the web, and may use model, "
                "search, or provider credits or quota. Browsing is free. Search stops at its "
                "deadline or when you cancel; a provider may still bill for a request it already accepted."
            )
            assert info.json()["job"] is None
            assert info.json()["demo_question"] == QUESTION
            _no_request("GET /search")

            found = dashboard.post("/search", {"question": QUESTION, "disclosure_accepted": True})
            assert found.status_code == 200
            body = found.json()
            assert body["schema"] == "hackertube.search/1"
            assert body["provider"] == "stub"
            assert body["job"]["state"] == "succeeded"
            assert body["job"]["job_id"] == "job:1"
            assert {name: group["verified_count"] for name, group in body["sections"].items()} == {
                "podcasts": 2,
                "books": 4,
                "audiobooks": 4,
            }
            assert body["interpretation"]["topic"] == "jane austen"
            assert body["coverage"]["formats_without_match"] == []
            _no_request("POST /search with the stub provider")

            rows = _job_rows(root)
            assert len(rows) == 1, "the job is stored in the profile database"
            assert rows[0]["job_id"] == "job:1"
            assert rows[0]["provider"] == "stub"
            assert json.loads(rows[0]["limits"]) == {
                "max_hits": 12,
                "max_requests": 2,
                "deadline_seconds": 5,
            }

            after = dashboard.get("/search")
            assert after.json()["job"]["job_id"] == "job:1"
        finally:
            dashboard.close()


def test_job04_the_route_reports_an_unknown_cost_and_the_page_renders_it(root):
    """The route carries an unknown cost as null and a paid count of zero.

    The rendered half is pinned in ``tests/test_dashboard_page.js``.
    """
    with outbound.guard():
        outbound.reset()
        dashboard = route_harness.start(root, name="hackertube_search_cost")
        try:
            body = dashboard.post(
                "/search", {"question": QUESTION, "disclosure_accepted": True}
            ).json()
            usage = body["usage"]
            assert usage["cost_usd"] is None
            assert usage["cost_known"] is False
            assert usage["paid_calls"] == 0
            assert usage["request_counts"] == ZERO
            assert body["job"]["cost_known"] is False
            assert body["job"]["cost_usd"] is None
        finally:
            dashboard.close()


def test_job02_browsing_and_reloading_start_no_job_and_no_paid_call(root):
    with outbound.guard():
        outbound.reset()
        for index in range(3):
            dashboard = route_harness.start(root, name=f"hackertube_search_job02_{index}")
            try:
                assert dashboard.get("/catalog").status_code == 200
                assert dashboard.get("/feed").status_code == 200
                assert dashboard.get("/profile").status_code == 200
                assert dashboard.get("/status").status_code == 200
                assert dashboard.get("/search").status_code == 200
                assert dashboard.post("/profile/interests", {"text": "jane austen"}).status_code == 200
            finally:
                dashboard.close()
            _no_request(f"browse pass {index}")
    assert _job_rows(root) == [], "ordinary browsing creates no search job"
    assert outbound.counters() == ZERO


def test_the_route_refuses_a_question_the_boundary_rejects(root):
    with outbound.guard():
        outbound.reset()
        dashboard = route_harness.start(root, name="hackertube_search_bad_question")
        try:
            for question in ("", "   ", "a" * 201, 17):
                refused = dashboard.post("/search", {"question": question, "disclosure_accepted": True})
                assert refused.status_code == 400, question
                assert refused.json()["error"] == "question"
            assert dashboard.post("/search", "not-an-object").status_code == 400
            _no_request("POST /search with a bad question")
            assert _job_rows(root) == []
        finally:
            dashboard.close()


def test_each_search_appends_one_job_row(root):
    with outbound.guard():
        outbound.reset()
        dashboard = route_harness.start(root, name="hackertube_search_rows")
        try:
            for expected in ("job:1", "job:2", "job:3"):
                body = dashboard.post(
                    "/search", {"question": "austen books", "disclosure_accepted": True}
                ).json()
                assert body["job"]["job_id"] == expected
            rows = _job_rows(root)
            assert [row["job_id"] for row in rows] == ["job:1", "job:2", "job:3"]
            assert {row["state"] for row in rows} == {"succeeded"}
            _no_request("three searches with the stub provider")
        finally:
            dashboard.close()


def test_the_plugin_source_reads_settings_only_through_the_published_surface():
    """The route must not import a Hermes internal or read a credential file."""
    source = (
        route_harness.ROOT / "hackertube" / "dashboard" / "plugin_api.py"
    ).read_text(encoding="utf-8")
    assert "from hermes_cli.config import load_config_readonly" in source
    for forbidden in ("auth.json", "load_env_file", "sqlite3.connect", "import sqlite3"):
        assert forbidden not in source, f"plugin_api.py mentions {forbidden}"
