"""Clean-profile probe for tasks 4.1 and 4.2.

Runs against a disposable ``HERMES_HOME`` with the HackerTube plugin enabled
as a user plugin, the real Hermes ``plugin_db``, and the real
``hermes_cli.config`` reader. It drives the plugin's own ``plugin_api.py``
router in process (a FastAPI TestClient, no server), and it never sets
``HACKERTUBE_MODEL_KEY`` and never reads a credential file.

Steps and what each one shows:

1. ``GET /status`` — the selected provider and that the declared key is
   absent.
2. ``POST /search`` with the default (``live``) provider and no key — the
   route refuses with a clear message, writes no job, and the outbound
   ledger stays at zero.
3. The same route with ``provider: stub`` written through Hermes's own
   settings writer — a succeeded job with verified results, stored in the
   profile's ``plugin_db`` database.
4. The stub provider's failure paths (timeout, error) — a failed job with
   the reason recorded and no results.
5. The ordinary reads (catalog, feed, profile) — no request, no job.

Usage (JSON on stdout):

    HERMES_HOME=<disposable> <hermes venv>/bin/python3 search_profile_probe.py
"""

import importlib
import json
import sqlite3
import sys
from pathlib import Path

HERMES_HOME = Path(__import__("os").environ["HERMES_HOME"]).resolve()
AGENT_HOME = Path("/Users/robert/.hermes/hermes-agent")
PLUGIN_DIR = HERMES_HOME / "plugins" / "hackertube"
PLUGIN_API = PLUGIN_DIR / "dashboard" / "plugin_api.py"
QUESTION = "What can I read or listen to by Jane Austen?"

sys.path.insert(0, str(AGENT_HOME))


def report(frame):
    print(json.dumps(frame, indent=2, sort_keys=True))


def mount(module_name):
    """Load the enabled plugin's router the way the host loads it."""
    import importlib.util

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    spec = importlib.util.spec_from_file_location(module_name, PLUGIN_API)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    app = FastAPI()
    app.include_router(module.router, prefix="/api/plugins/hackertube")
    return TestClient(app)


def job_rows():
    database = HERMES_HOME / "plugin-data" / "hackertube" / "profile.db"
    if not database.exists():
        return "absent"
    connection = sqlite3.connect(str(database))
    connection.row_factory = sqlite3.Row
    try:
        return [dict(row) for row in connection.execute("SELECT * FROM search_job ORDER BY sequence")]
    finally:
        connection.close()


def main():
    from hermes_cli.plugins_state import save_plugin_setting

    storage = importlib.import_module("plugins.plugin_storage")
    frame = {
        "hermes_home": str(HERMES_HOME),
        "plugin_api": str(PLUGIN_API),
        "plugin_db_module": getattr(storage, "__file__", "unknown"),
        "plugin_data_dir": str(storage.plugin_data_dir("hackertube")),
        "settings_writer": "hermes_cli.plugins_state.save_plugin_setting",
    }

    # 1. The default provider is the key-gated live one, with no key present.
    client = mount("hackertube_probe_live")
    from hackertube_core import outbound

    outbound.reset()
    frame["status_default"] = client.get("/api/plugins/hackertube/status").json()
    frame["search_info"] = client.get("/api/plugins/hackertube/search").json()
    refused = client.post(
        "/api/plugins/hackertube/search",
        json={"question": QUESTION, "disclosure_accepted": True},
    )
    frame["keyless_refusal"] = {"status": refused.status_code, "body": refused.json()}
    frame["keyless_request_counts"] = outbound.counters()
    frame["keyless_jobs"] = job_rows()

    # 2. The disclosure gate refuses before any provider activity.
    without = client.post("/api/plugins/hackertube/search", json={"question": QUESTION})
    frame["disclosure_refusal"] = {"status": without.status_code, "body": without.json()}
    frame["disclosure_request_counts"] = outbound.counters()

    # 3. Select the deterministic stub provider through Hermes's writer.
    save_plugin_setting("hackertube", ("provider",), "stub")
    client = mount("hackertube_probe_stub")
    frame["status_stub"] = client.get("/api/plugins/hackertube/status").json()
    found = client.post(
        "/api/plugins/hackertube/search",
        json={"question": QUESTION, "disclosure_accepted": True},
    )
    body = found.json()
    frame["stub_search"] = {
        "status": found.status_code,
        "provider": body.get("provider"),
        "job": body.get("job"),
        "sections": {name: group["verified_count"] for name, group in body.get("sections", {}).items()},
        "usage": body.get("usage"),
        "first_results": [row["item_id"] for row in body.get("results", [])][:3],
        "source_labels": sorted({row["source"]["label"] for row in body.get("results", [])}),
    }
    frame["stub_request_counts"] = outbound.counters()
    frame["stored_jobs"] = job_rows()

    # 4. The stub provider's failure paths, run through the same engine.
    from hackertube_core.profile import ProfileStore, open_profile_db, utc_now
    from hackertube_core.search import StubProvider, run_search
    from hackertube_core.catalog import load_seed

    store = ProfileStore(open_profile_db)
    catalog = load_seed()
    failures = {}
    for label, provider in (("timeout", StubProvider(fail="timeout")), ("error", StubProvider(fail="error"))):
        result = run_search(
            store,
            QUESTION,
            catalog=catalog,
            profile=store.snapshot(),
            now=utc_now(),
            provider=provider,
            disclosure_accepted=True,
        )
        failures[label] = {
            "state": result["job"]["state"],
            "results": len(result["results"]),
            "notes": result["coverage"]["notes"],
        }
    frame["stub_failures"] = failures
    frame["failure_request_counts"] = outbound.counters()

    # 5. Ordinary browsing stays free and creates no job.
    counts_before = outbound.counters()
    for path in ("/catalog", "/feed", "/profile", "/status", "/search"):
        client.get("/api/plugins/hackertube" + path)
    frame["browsing_request_counts"] = {
        "before": counts_before,
        "after": outbound.counters(),
    }
    frame["final_job_count"] = len(job_rows()) if isinstance(job_rows(), list) else job_rows()
    frame["secret_never_set"] = "HACKERTUBE_MODEL_KEY" not in __import__("os").environ
    report(frame)
    return 0


if __name__ == "__main__":
    sys.exit(main())
