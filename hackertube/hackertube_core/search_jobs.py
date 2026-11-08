"""Profile-scoped, killable search execution; no background inference on load."""

import contextvars
import json
import math
import os
from pathlib import Path
import selectors
import shutil
import signal
import subprocess
import sys
import threading
import time

from hackertube_core.profile import utc_now
from hackertube_core.search import (
    DisclosureRequired,
    ProviderUnavailable,
    canonical_question,
)

ACTIVE = {"queued", "running", "cancelling"}
MAX_MESSAGE = 2_000_000


class SearchBusy(RuntimeError):
    pass


def response(job):
    counts = {"free": 0, "paid": 0, "metered": 0}
    return {
        "schema": "hackertube.search/1",
        "job": job,
        "question": job["question"],
        "provider": job["provider"],
        "results": [],
        "sections": {},
        "sources": [],
        "coverage": {
            "verified": 0,
            "notes": job["coverage"],
            "limit_reached": job["state"] == "timed_out",
        },
        "usage": {
            "cost_usd": None,
            "cost_known": False,
            "requests_used": job["requests_used"],
            "request_counts": counts,
            "paid_calls": 0,
        },
    }


class SearchSupervisor:
    def __init__(self, store, *, home, command=None):
        if os.name != "posix":
            raise ProviderUnavailable(
                "Hard-stop searches require macOS or Linux. No request was sent."
            )
        import fcntl

        self._fcntl = fcntl
        self.store, self.home = store, Path(home).resolve()
        self.data_root = self.home / "plugin-data/hackertube"
        self.data_root.mkdir(parents=True, exist_ok=True)
        self.command = command or [
            sys.executable,
            "-I",
            str(Path(__file__).with_name("search_worker.py")),
        ]
        self._context = contextvars.copy_context()
        self._guard = threading.Lock()
        self._jobs = {}
        # A lock held by another supervisor means its job is still running.
        lock = self._claim()
        if lock is not None:
            try:
                store.recover_jobs()
            finally:
                lock.close()

    def _claim(self):
        lock = (self.data_root / "search.lock").open("a+b")
        try:
            self._fcntl.flock(lock, self._fcntl.LOCK_EX | self._fcntl.LOCK_NB)
            return lock
        except BlockingIOError:
            lock.close()
            return None

    def start(self, question, *, provider, limits, disclosure_accepted=False):
        if disclosure_accepted is not True:
            raise DisclosureRequired("Accept the credit-use disclosure before Search.")
        question = canonical_question(question)
        if provider not in {"stub", "hermes"} or not math.isfinite(
            limits.deadline_seconds
        ):
            raise ValueError("search limits or provider")
        with self._guard:
            lock = self._claim()
            if lock is None:
                raise SearchBusy("A search is already running in this profile.")
            deadline = time.monotonic() + limits.deadline_seconds
            job = dict(
                kind="search",
                state="running",
                question=question,
                provider=provider,
                limits=limits.as_dict(),
                requests_used=0,
                result_count=0,
                cost_usd=None,
                cost_known=False,
                coverage=[],
                created_at=utc_now(),
                ended_at=None,
            )
            try:
                job_id = self.store.record_job(job, unique=True)
                job = self.store.job(job_id)
                entry = {
                    "done": threading.Event(),
                    "lock": lock,
                    "process": None,
                    "counts": {"free": 0, "paid": 0, "metered": 0},
                }
                self._jobs[job_id] = entry
                payload = {
                    "job_id": job_id,
                    "question": question,
                    "provider": provider,
                    "limits": limits.as_dict(),
                    "deadline": deadline,
                    "home": str(self.home),
                    "cli": shutil.which("hermes"),
                }
                env = {k: v for k, v in os.environ.items() if "YOLO" not in k.upper()}
                env["HERMES_HOME"] = str(self.home)
                process = subprocess.Popen(
                    self.command,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True,
                    bufsize=0,
                    env=env,
                )
                entry["process"] = process
                process.stdin.write((json.dumps(payload) + "\n").encode())
                process.stdin.flush()
                threading.Thread(
                    target=contextvars.copy_context().run,
                    args=(self._monitor, job_id, entry, deadline),
                    daemon=True,
                    name="hackertube-search-supervisor",
                ).start()
            except Exception:
                if "entry" in locals():
                    self._stop(entry)
                    self._finish(
                        job_id, entry, "failed", "Search worker could not start."
                    )
                    entry["done"].set()
                    self._jobs.pop(job_id, None)
                lock.close()
                raise
            return job

    def status(self, job_id):
        job = self.store.job(job_id)
        if job is None:
            return None
        value = self.store.job_result(job_id)
        if value is None or (
            job["state"] not in ACTIVE and value["job"]["state"] in ACTIVE
        ):
            previous = value
            value = response(job)
            if previous is not None:
                counts = previous["usage"]["request_counts"]
                value["usage"]["request_counts"] = counts
                value["usage"]["paid_calls"] = counts["paid"] + counts["metered"]
        value["job"] = job
        return value

    def wait(self, job_id, timeout):
        entry = self._jobs.get(job_id)
        return (
            entry["done"].wait(timeout)
            if entry
            else bool(
                self.status(job_id)
                and self.status(job_id)["job"]["state"] not in ACTIVE
            )
        )

    def cancel(self, job_id):
        job = self.store.cancel_job(job_id)
        if job is None:
            return None
        entry = self._jobs.get(job_id)
        if entry:
            entry["done"].wait(0.5)
        return self.status(job_id)

    def _stop(self, entry):
        process = entry["process"]
        if process is None or entry.get("stopped"):
            return
        # EOF independently asks the watchdog to kill its group, even if the
        # parent signal races another kill or is refused by the OS.
        if process.stdin and not process.stdin.closed:
            process.stdin.close()
        # Always stop the group, even if the leader exited leaving descendants.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        except PermissionError:
            # The independent watchdog also received EOF; confirmation below
            # still requires the worker to be reaped.
            pass
        process.wait(timeout=1)
        entry["stopped"] = True
        for stream in (process.stdin, process.stdout):
            if stream:
                stream.close()

    def _finish(self, job_id, entry, state, note, result=None):
        job = self.store.job(job_id)
        if job["state"] not in ACTIVE:
            return
        if job["state"] == "cancelling":
            state, result, note = (
                "cancelled",
                None,
                "Search cancelled. Local provider work was stopped. Remote usage may still be billed.",
            )
        job.update(
            state=state,
            ended_at=utc_now(),
            coverage=[note] if note else job["coverage"],
        )
        if result is None:
            job.update(
                requests_used=sum(entry["counts"].values()),
                result_count=0,
                cost_usd=None,
                cost_known=False,
            )
            result = response(job)
            result["usage"]["request_counts"] = entry["counts"].copy()
            result["usage"]["paid_calls"] = (
                entry["counts"]["paid"] + entry["counts"]["metered"]
            )
        else:
            usage = result["usage"]
            job.update(
                requests_used=usage["requests_used"],
                result_count=len(result["results"]),
                cost_usd=usage["cost_usd"],
                cost_known=usage["cost_known"],
                coverage=result["coverage"]["notes"],
            )
            result["job"] = job
        if not self.store.update_job(job_id, job, result):
            # A cross-process cancel won the database transition race.
            if self.store.job(job_id)["state"] == "cancelling":
                self._finish(job_id, entry, "cancelled", "Search cancelled.")

    def _monitor(self, job_id, entry, deadline):
        process = entry["process"]
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ)
        buffer = b""
        try:
            while True:
                job = self.store.job(job_id)
                if job["state"] == "cancelling":
                    state, note = "cancelled", "Search cancelled."
                    break
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    state, note = (
                        "timed_out",
                        "Search reached its deadline. Local provider work was stopped. Remote usage may still be billed.",
                    )
                    break
                ready = selector.select(min(remaining, 0.05))
                if ready:
                    data = os.read(process.stdout.fileno(), 65536)
                    buffer += data
                    if len(buffer) > MAX_MESSAGE:
                        raise ValueError("oversized worker response")
                    while b"\n" in buffer:
                        line, buffer = buffer.split(b"\n", 1)
                        event = json.loads(line)
                        if event["type"] == "usage":
                            counts = event["counts"]
                            if set(counts) != {"free", "paid", "metered"} or any(
                                type(x) is not int or x < 0 for x in counts.values()
                            ):
                                raise ValueError("invalid worker counts")
                            entry["counts"] = counts
                            job.update(requests_used=sum(counts.values()))
                            progress = response(job)
                            progress["usage"]["request_counts"] = counts.copy()
                            progress["usage"]["paid_calls"] = (
                                counts["paid"] + counts["metered"]
                            )
                            self.store.update_job(job_id, job, progress)
                        elif event["type"] == "result":
                            if time.monotonic() >= deadline:
                                state, note = (
                                    "timed_out",
                                    "Search reached its deadline. Local work was stopped.",
                                )
                                break
                            result = event["result"]
                            if result["job"]["state"] not in {
                                "succeeded",
                                "partial",
                                "failed",
                            }:
                                raise ValueError("invalid worker outcome")
                            self._stop(entry)
                            self._finish(
                                job_id, entry, result["job"]["state"], "", result
                            )
                            return
                        elif event["type"] == "error":
                            raise ValueError("worker failed")
                    else:
                        if process.poll() is None:
                            continue
                    if "state" in locals():
                        break
                if process.poll() is not None:
                    state, note = (
                        (
                            "timed_out",
                            "Search reached its deadline. Local work was stopped.",
                        )
                        if time.monotonic() >= deadline
                        else (
                            "failed",
                            "Search worker stopped before returning a result.",
                        )
                    )
                    break
            self._stop(entry)
            self._finish(job_id, entry, state, note)
        except Exception:
            self._stop(entry)
            self._finish(
                job_id,
                entry,
                "failed",
                "Search worker failed; no late result was accepted.",
            )
        finally:
            selector.close()
            entry["lock"].close()
            entry["done"].set()
            with self._guard:
                self._jobs.pop(job_id, None)


_SUPERVISORS = {}
_REGISTRY_LOCK = threading.Lock()


def supervisor_for_profile(store, *, home, identity):
    key = str(Path(identity).resolve())
    with _REGISTRY_LOCK:
        if key not in _SUPERVISORS:
            _SUPERVISORS[key] = SearchSupervisor(store, home=home)
        return _SUPERVISORS[key]


def stop_profile(identity):
    key = str(Path(identity).resolve())
    with _REGISTRY_LOCK:
        manager = _SUPERVISORS.pop(key, None)
    if manager is not None:
        with manager._guard:
            job_ids = list(manager._jobs)
        for job_id in job_ids:
            manager._context.copy().run(manager.cancel, job_id)
