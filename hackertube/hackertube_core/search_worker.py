"""One disposable search process. All provider work stays in this process group."""

import json
import os
from pathlib import Path
import select
import signal
import sys
import time


def start_watchdog(deadline, parent_fd):
    """An independent guard survives even a native call holding the worker GIL.

    Only a fresh session leader may start it. EOF means the dashboard died;
    expiry and EOF both kill this private group, never the dashboard's group.
    """
    if os.getpid() != os.getpgrp():
        raise RuntimeError("Search worker must own its process group")
    if os.fork() == 0:
        try:
            select.select([parent_fd], [], [], max(0, deadline - time.monotonic()))
            os.killpg(os.getpgrp(), signal.SIGKILL)
        finally:
            os._exit(1)


def execute(payload, emit):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from hermes_constants import get_hermes_home

    if Path(get_hermes_home()).resolve() != Path(payload["home"]).resolve():
        raise RuntimeError("Search profile mismatch")
    from agent.secret_scope import get_secret
    from hackertube_core.catalog import load_seed
    from hackertube_core.hermes import web_search
    from hackertube_core.profile import ProfileStore, open_profile_db, utc_now
    from hackertube_core.retrieval import SourceRetriever
    from hackertube_core.search import Limits, run_search, select_provider
    from hackertube_core.search_jobs import response

    store = ProfileStore(open_profile_db)
    provider = select_provider(payload["provider"])
    job = store.job(payload["job_id"])
    if (
        time.monotonic() >= payload["deadline"]
        or not job
        or job["state"] != "running"
        or job["question"] != payload["question"]
        or job["provider"] != payload["provider"]
    ):
        return

    def before_request(counts):
        # A cancellation received during CLI startup must not start inference.
        current = store.job(payload["job_id"])
        if (
            time.monotonic() >= payload["deadline"]
            or not current
            or current["state"] != "running"
        ):
            raise SystemExit(0)
        current["requests_used"] = sum(counts.values())
        progress = response(current)
        progress["usage"]["request_counts"] = counts.copy()
        progress["usage"]["paid_calls"] = counts["paid"] + counts["metered"]
        if not store.update_job(payload["job_id"], current, progress):
            raise SystemExit(0)
        emit({"type": "usage", "counts": counts})

    result = run_search(
        store,
        payload["question"],
        catalog=store.catalog(load_seed()),
        profile=store.snapshot(),
        now=utc_now(),
        provider=provider,
        limits=Limits(**payload["limits"]),
        disclosure_accepted=True,
        job_id=payload["job_id"],
        deadline_at=payload["deadline"],
        observer=before_request,
        retriever=None
        if provider.name == "stub"
        else SourceRetriever(store, get_secret=get_secret, web_search=web_search),
    )
    emit({"type": "result", "result": result})


def setup_cli(parser):
    """Public Hermes plugin CLI registration; never starts work on import."""
    parser.set_defaults(func=cli_main)


def cli_main(args):
    """Called by the native Hermes CLI after register(ctx) binds host services."""
    input_fd = os.environ.pop("HACKERTUBE_INPUT_FD", None)
    output_fd = os.environ.pop("HACKERTUBE_OUTPUT_FD", None)
    if input_fd is None or output_fd is None:
        raise SystemExit("This command is only for a supervised HackerTube search.")
    with os.fdopen(int(input_fd)) as source, os.fdopen(int(output_fd), "w") as events:
        payload = json.load(source)

        def emit(value):
            events.write(json.dumps(value, ensure_ascii=False) + "\n")
            events.flush()

        try:
            execute(payload, emit)
        except Exception:
            # Provider errors can contain credentials; do not forward raw errors.
            emit({"type": "error"})
            raise SystemExit(1)


def main():
    payload = json.loads(sys.stdin.buffer.readline(65536))
    start_watchdog(payload["deadline"], sys.stdin.fileno())
    # Re-enter through the supported Hermes CLI, not private loader functions.
    # Private inherited pipes carry the question and events; argv/env contain
    # no question or credential. The original stdin is a parent-lifetime pipe.
    source, writer = os.pipe()
    os.write(writer, json.dumps(payload).encode())
    os.close(writer)
    events = os.dup(sys.stdout.fileno())
    os.set_inheritable(source, True)
    os.set_inheritable(events, True)
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    env = dict(
        os.environ, HACKERTUBE_INPUT_FD=str(source), HACKERTUBE_OUTPUT_FD=str(events)
    )
    os.execve(payload["cli"], [payload["cli"], "hackertube-worker"], env)


if __name__ == "__main__":
    main()
