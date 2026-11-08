"""Bundled, versioned policy available before any API-client functionality."""
from pathlib import Path

VERSION = "2026-11-08.1"

def policy():
    return {"version": VERSION, "text": Path(__file__).with_name("privacy-policy.txt").read_text(encoding="utf-8")}


def start_housekeeping(interval=3600):
    """Only local deletion, using the profile context captured at registration.

    No inference, credentials or discovery. An offline app resumes cleanup at
    ProfileStore opening before metadata is returned to any caller.
    """
    import contextvars
    import threading
    from hackertube_core.profile import ProfileStore, open_profile_db
    stop = threading.Event()
    context = contextvars.copy_context()
    def clean():
        while not stop.wait(interval):
            try:
                context.run(ProfileStore, open_profile_db)
            except Exception:
                # Failed cleanup never initiates a remote fallback; all access
                # boundaries still retry and refuse malformed local data.
                continue
    thread = threading.Thread(target=clean, name="hackertube-retention", daemon=True)
    thread.start()
    return stop.set
