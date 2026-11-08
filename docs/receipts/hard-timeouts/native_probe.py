"""Real Hermes facade + local stalled provider. No live vendor key required.

Run with Python from a checkout and the installed Hermes CLI on PATH. Host
bootstrap can install its own dependencies in the disposable Hermes home.
"""
import json
from pathlib import Path
import shutil
import socket
import sqlite3
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "hackertube"))
from hackertube_core.profile import ProfileStore
from hackertube_core.search import Limits
from hackertube_core.search_jobs import SearchSupervisor


def main():
    home = Path(tempfile.mkdtemp(prefix="ht-native-deadline-"))
    shutil.copytree(ROOT / "hackertube", home / "plugins/hackertube", ignore=shutil.ignore_patterns("__pycache__", "*.egg-info"))
    base_config = "plugins:\n  enabled: [hackertube]\n"
    (home / "config.yaml").write_text(base_config)
    data = home / "plugin-data/hackertube"
    data.mkdir(parents=True)
    def connect():
        conn = sqlite3.connect(data / "profile.db")
        conn.row_factory = sqlite3.Row
        return conn
    store = ProfileStore(connect)
    from hackertube_core.privacy import VERSION
    store.accept_privacy(VERSION)  # Explicit disposable-test-profile agreement.
    manager = SearchSupervisor(store, home=home)
    warmup = manager.start("Jane Austen books", provider="stub", limits=Limits(deadline_seconds=20), disclosure_accepted=True)
    assert manager.wait(warmup["job_id"], 22)
    assert manager.status(warmup["job_id"])["job"]["state"] == "succeeded"
    entered, closed = threading.Event(), threading.Event()
    paths = []
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def do_POST(self):
            self.rfile.read(int(self.headers.get("Content-Length", "0")))
            paths.append(self.path)
            entered.set()
            self.connection.settimeout(12)
            try:
                if self.connection.recv(1) == b"":
                    closed.set()
            except TimeoutError:
                pass
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    (home / "config.yaml").write_text(base_config + "auxiliary:\n  hackertube_search:\n    provider: openai\n    model: deadline-probe\n    api_mode: chat_completions\n    base_url: http://127.0.0.1:" + str(server.server_port) + "/v1\n    api_key: local-test-placeholder\n    fallback_chain: []\n")
    checks = []
    try:
        for mode in ("deadline", "cancel"):
            entered.clear()
            closed.clear()
            before, start = len(paths), time.monotonic()
            job = manager.start("AI books", provider="hermes", limits=Limits(deadline_seconds=6 if mode == "deadline" else 15), disclosure_accepted=True)
            seen = entered.wait(5)
            cancel_at = None
            if mode == "cancel":
                cancel_at = time.monotonic()
                manager.cancel(job["job_id"])
            assert manager.wait(job["job_id"], 9)
            result = manager.status(job["job_id"])
            eof = closed.wait(1)
            checks.append({"mode": mode, "native_model_request_seen": seen, "paths": paths[before:],
                "provider_connection_closed": eof, "wall_seconds": time.monotonic() - start,
                "cancel_seconds": None if cancel_at is None else time.monotonic() - cancel_at,
                "state": result["job"]["state"], "requests_used": result["usage"]["requests_used"],
                "cost_known": result["usage"]["cost_known"]})
    finally:
        server.shutdown()
        for entry in list(manager._jobs):
            manager.cancel(entry)
    receipt = {"home": str(home), "scope": "real Hermes ctx.llm, stalled local OpenAI-shaped endpoint; no live vendor key", "checks": checks}
    (Path(__file__).parent / "native-local-provider.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps(checks, indent=2))
    assert all(x["native_model_request_seen"] and x["provider_connection_closed"] for x in checks)
    assert checks[0]["state"] == "timed_out" and checks[0]["wall_seconds"] < 7
    assert checks[1]["state"] == "cancelled" and checks[1]["cancel_seconds"] < 1


if __name__ == "__main__":
    main()
