"""Bundled, versioned policy available before any API-client functionality."""
import logging
from pathlib import Path

VERSION = "2026-11-08.1"

logger = logging.getLogger("hackertube.privacy")


def policy():
    return {"version": VERSION, "text": Path(__file__).with_name("privacy-policy.txt").read_text(encoding="utf-8")}


def _profile_db_path():
    """The profile database path, or ``None`` when it cannot be resolved.

    The host owns the plugin-data location (`plugins.plugin_storage`), so the
    path is only known inside Hermes. Outside it the import fails and the caller
    proceeds with the purge rather than guessing a location: with no resolvable
    path there is nothing this module could create by itself, and every store
    access still retries and refuses malformed local data.
    """
    try:
        from plugins.plugin_storage import plugin_data_dir
    except Exception:
        return None
    from hackertube_core.profile import DB_NAME

    return plugin_data_dir("hackertube") / DB_NAME


def start_housekeeping(interval=3600):
    """Only local deletion, using the profile context captured at registration.

    No inference, credentials or discovery. Expired records are purged once at
    plugin startup and then on every interval: an offline or dormant profile does
    not keep expired YouTube metadata and thumbnail URLs on disk until
    HackerTube is opened (Developer Policies III.E.4.d). A failed cleanup never
    initiates a remote fallback.

    Two rules keep the startup purge safe to run from ``register()``:

    * It runs on the background thread, never on the caller's. ``register()``
      must not block on store I/O, and the interval loop needs the same purge
      anyway.
    * It never opens -- and so never creates -- the profile database when that
      file does not exist yet. A fresh profile registers the plugin before any
      dashboard route runs, and creating an empty store there would leave a file
      behind just for loading the plugin.

    A failure is logged at ``warning`` and the loop continues; it is never
    swallowed silently, because a purge that quietly stopped running would leave
    expired YouTube metadata on disk with no signal.
    """
    import contextvars
    import threading
    from hackertube_core.profile import ProfileStore, open_profile_db

    stop = threading.Event()
    context = contextvars.copy_context()

    def purge():
        path = _profile_db_path()
        if path is not None and not path.exists():
            return
        try:
            context.run(ProfileStore, open_profile_db)
        except Exception:
            # Failed cleanup never initiates a remote fallback; all access
            # boundaries still retry and refuse malformed local data. Record it
            # and continue so a transient error cannot stop later passes.
            logger.warning("HackerTube retention purge failed; will retry", exc_info=True)

    def clean():
        # Startup pass first (the thread's very first action), then the interval
        # loop. The pass is not run on the caller's thread, so register() returns
        # without waiting for it.
        purge()
        while not stop.wait(interval):
            purge()

    # The startup purge runs on the background thread as soon as it is
    # scheduled, and register() returns without waiting for it.
    thread = threading.Thread(target=clean, name="hackertube-retention", daemon=True)
    thread.start()
    return stop.set
