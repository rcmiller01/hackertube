"""Bundled, versioned policy available before any API-client functionality."""
from pathlib import Path

VERSION = "2026-11-08.1"

def policy():
    return {"version": VERSION, "text": Path(__file__).with_name("privacy-policy.txt").read_text(encoding="utf-8")}


def start_housekeeping(interval=3600):
    """Only local deletion, using the profile context captured at registration.

    No inference, credentials or discovery. Expired records are purged once
    immediately, at plugin startup, and then on every interval: an offline or
    dormant profile does not keep expired YouTube metadata and thumbnail URLs on
    disk until HackerTube is opened (Developer Policies III.E.4.d). A failed
    cleanup never initiates a remote fallback.
    """
    import contextvars
    import threading
    from hackertube_core.profile import ProfileStore, open_profile_db
    stop = threading.Event()
    context = contextvars.copy_context()
    def purge():
        try:
            context.run(ProfileStore, open_profile_db)
        except Exception:
            # Failed cleanup never initiates a remote fallback; all access
            # boundaries still retry and refuse malformed local data.
            pass
    # Startup/load purge, before the interval loop: the same store opening that
    # runs at HackerTube open, run as soon as the plugin loads.
    purge()
    def clean():
        while not stop.wait(interval):
            purge()
    thread = threading.Thread(target=clean, name="hackertube-retention", daemon=True)
    thread.start()
    return stop.set
