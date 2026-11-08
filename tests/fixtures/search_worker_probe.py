"""Trusted test executable: a stalled socket, not a real provider or runtime hook."""

import json
import os
from pathlib import Path
import socket
import sqlite3
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "hackertube"))


def main():
    mode, port = sys.argv[1], int(sys.argv[2])
    if mode == "orphan-owner":
        from hackertube_core.profile import ProfileStore
        from hackertube_core.search import Limits
        from hackertube_core.search_jobs import SearchSupervisor

        home = Path(sys.argv[3])
        root = home / "plugin-data/hackertube"
        root.mkdir(parents=True)

        def connect():
            conn = sqlite3.connect(root / "profile.db")
            conn.row_factory = sqlite3.Row
            return conn

        marker = home / "connected"
        supervisor = SearchSupervisor(
            ProfileStore(connect),
            home=home,
            command=[sys.executable, __file__, "hang", str(port), str(marker)],
        )
        supervisor.start(
            "AI",
            provider="hermes",
            limits=Limits(deadline_seconds=8),
            disclosure_accepted=True,
        )
        end = time.monotonic() + 3
        while not marker.exists() and time.monotonic() < end:
            time.sleep(0.01)
        if len(sys.argv) > 4:
            release = Path(sys.argv[4])
            end = time.monotonic() + 5
            while not release.exists() and time.monotonic() < end:
                time.sleep(0.01)
        os._exit(0 if marker.exists() else 2)
    payload = json.loads(sys.stdin.readline())
    from hackertube_core.search_worker import start_watchdog

    start_watchdog(payload["deadline"], sys.stdin.fileno())
    if mode in {"persisted-usage", "stale-progress"}:
        from hackertube_core.profile import ProfileStore
        from hackertube_core.search_jobs import response

        def connect():
            conn = sqlite3.connect(Path(payload["home"]) / "plugin-data/hackertube/profile.db")
            conn.row_factory = sqlite3.Row
            return conn

        store = ProfileStore(connect)
        job = store.job(payload["job_id"])
        count = 2 if mode == "stale-progress" else 1
        job["requests_used"] = count
        progress = response(job)
        progress["usage"]["request_counts"]["paid"] = count
        progress["usage"]["paid_calls"] = count
        store.update_job(payload["job_id"], job, progress)
        # Simulate termination between durable accounting and pipe notification,
        # or an older notification arriving after a newer durable dispatch.
        if mode == "stale-progress":
            print(json.dumps({"type": "usage", "counts": {"free": 0, "paid": 1, "metered": 0}}), flush=True)
        peer = socket.socket()
        peer.connect(("127.0.0.1", port))
        time.sleep(60)
        return 0
    if mode == "crash":
        return 3
    if mode == "success":
        print(
            json.dumps(
                {
                    "type": "result",
                    "result": {
                        "schema": "hackertube.search/1",
                        "job": {"state": "succeeded"},
                        "results": [],
                        "sections": {},
                        "coverage": {"notes": []},
                        "usage": {
                            "requests_used": 0,
                            "cost_usd": None,
                            "cost_known": False,
                        },
                    },
                }
            ),
            flush=True,
        )
        return 0
    if mode in {"dns", "source-read"}:
        from hackertube_core.http import read_json
        from hackertube_core import outbound

        print(
            json.dumps(
                {"type": "usage", "counts": {"free": 1, "paid": 0, "metered": 0}}
            ),
            flush=True,
        )

        def block():
            peer = socket.socket()
            peer.connect(("127.0.0.1", port))
            peer.recv(1)

        def lookup(*args):
            if mode == "dns":
                block()
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", 443))]

        class Response:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

            def read(self, size):
                block()
                return b"{}"

        class Opener:
            def open(self, *args, **kwargs):
                return Response()

        read_json(
            "https://example.org/",
            classification=outbound.FREE,
            resolve=lookup,
            opener=Opener(),
        )
        return 0
    print(
        json.dumps({"type": "usage", "counts": {"free": 0, "paid": 1, "metered": 0}}),
        flush=True,
    )
    if mode == "descendant" and os.fork() == 0:
        peer = socket.socket()
        peer.connect(("127.0.0.1", port))
        time.sleep(60)
        os._exit(0)
    peer = socket.socket()
    peer.connect(("127.0.0.1", port))
    if len(sys.argv) > 3:
        Path(sys.argv[3]).touch()
    time.sleep(60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
