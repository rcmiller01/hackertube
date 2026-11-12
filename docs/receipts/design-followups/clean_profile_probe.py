"""Clean-profile check for the design follow-ups PR.

Runs the enabled HackerTube plugin inside a disposable ``HERMES_HOME`` with the
real Hermes ``plugin_db`` and the real ``hermes_cli.config`` reader, and drives
the plugin's own router in process (FastAPI TestClient, no server).

The failure path this records is the keyless one: a fresh profile has no
HACKERTUBE_MODEL_KEY and no privacy agreement, so the agreement is accepted
first (otherwise the disclosure gate answers 403 before the provider is ever
consulted and the keyless close is never exercised).

    HERMES_HOME=<fresh disposable> <hermes venv>/bin/python3 clean_profile_probe.py
"""

import importlib
import importlib.util
import json
import os
import sqlite3
import sys
from pathlib import Path

HERMES_HOME = Path(os.environ["HERMES_HOME"]).resolve()
AGENT_HOME = Path("<hermes-home>/hermes-agent")
PLUGIN_API = HERMES_HOME / "plugins" / "hackertube" / "dashboard" / "plugin_api.py"
QUESTION = "What can I read or listen to by Jane Austen?"

sys.path.insert(0, str(AGENT_HOME))


def mount(module_name):
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
        return [dict(row) for row in connection.execute("SELECT job_id, state FROM search_job")]
    finally:
        connection.close()


def main():
    storage = importlib.import_module("plugins.plugin_storage")

    frame = {
        "hermes_home": str(HERMES_HOME),
        "plugin_api": str(PLUGIN_API),
        "plugin_db_module": getattr(storage, "__file__", "unknown"),
        "plugin_data_dir": str(storage.plugin_data_dir("hackertube")),
        "model_key_in_environment": "HACKERTUBE_MODEL_KEY" in os.environ,
    }
    # Loading the router puts the plugin package on sys.path, so hackertube_core
    # imports only after the first mount.
    client = mount("hackertube_clean_live")
    from hackertube_core import outbound

    policy = client.get("/api/plugins/hackertube/privacy").json()
    accepted = client.post(
        "/api/plugins/hackertube/privacy",
        json={"version": policy["version"], "accepted": True},
    )
    frame["agreement"] = {"status": accepted.status_code, "accepted": accepted.json().get("accepted")}

    outbound.reset()
    frame["status_default"] = client.get("/api/plugins/hackertube/status").json()
    refused = client.post(
        "/api/plugins/hackertube/search",
        json={"question": QUESTION, "disclosure_accepted": True},
    )
    frame["keyless_search"] = {"status": refused.status_code, "body": refused.json()}
    frame["keyless_request_counts"] = outbound.counters()
    frame["keyless_jobs"] = job_rows()

    from hermes_cli.plugins_state import save_plugin_setting

    save_plugin_setting("hackertube", ("provider",), "stub")
    client = mount("hackertube_clean_stub")
    frame["status_stub"] = client.get("/api/plugins/hackertube/status").json()
    found = client.post(
        "/api/plugins/hackertube/search",
        json={"question": QUESTION, "disclosure_accepted": True},
    )
    body = found.json()
    frame["stub_search"] = {
        "status": found.status_code,
        "provider": body.get("provider"),
        "state": (body.get("job") or {}).get("state"),
        "results": len(body.get("results") or []),
        "sections": {name: group["verified_count"] for name, group in (body.get("sections") or {}).items()},
        "usage": body.get("usage"),
    }
    frame["stub_request_counts"] = outbound.counters()
    frame["stored_jobs"] = job_rows()
    print(json.dumps(frame, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
