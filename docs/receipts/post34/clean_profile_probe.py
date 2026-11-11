"""Clean-profile probe for the post-#34 follow-ups (backend half).

A fresh HERMES_HOME, the plugin enabled by the real `hermes plugins enable`, and
the plugin's own shipped assets. Checks the enabled profile's bundle and
stylesheet carry this branch's layout (the media column first in the DOM, the
plain `row` at 768, the 430px media column, the 192px unaltered thumbnail), the
real routes load and answer, and three failure paths are exercised:

  * a FRESH profile with no ``profile.db`` at startup: loading the plugin must
    not create it;
  * expired YouTube data present at startup is purged by the startup
    housekeeping (which now runs off the registration thread and logs a warning
    rather than swallowing a failure);
  * a thumbnail URL on a look-alike host (suffix or prefix of ``i.ytimg.com``)
    is never stored by the adapter.

The browser half (a look-alike host and a failed image both fall back to the
linked Icon, rendered from the installed assets) is clean_profile_render.js.
"""
import importlib.util
import json
import os
import sys
import time
from pathlib import Path

HOME = Path(os.environ["HERMES_HOME"])
sys.path.insert(0, "/Users/robert/.hermes/hermes-agent")
sys.path.insert(0, str(HOME / "plugins" / "hackertube"))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from plugins import plugin_storage

record: dict = {"home": str(HOME), "storage": plugin_storage.__file__}

dist = HOME / "plugins" / "hackertube" / "dashboard" / "dist"
js = (dist / "index.js").read_text(encoding="utf-8")
css = (dist / "style.css").read_text(encoding="utf-8")
NOTE = "Metadata from YouTube. Explanations and library actions are HackerTube\u2019s."

# --- The installed bundle and stylesheet carry this branch ------------------
assert NOTE in js, "the short note is missing from the enabled profile"
assert "ht-youtube-compact" in js, "the compact attribution block is missing"
# DOM order: the media (thumbnail + Watch link) is the first child, text after.
assert 'h("div", { className: "ht-compact-side" }, art),\n' \
       '                h("div", { className: "ht-compact-main" }, text))' in js, (
    "the compact row does not put its media before the text in the DOM"
)
assert 'YOUTUBE_THUMBNAIL_HOSTS = ["i.ytimg.com", "img.youtube.com"]' in js, (
    "the render-time thumbnail host allowlist is missing"
)
assert "thumbnailDecision(item.art_url)" in js, "renderThumbnail does not use the host check"
assert "YOUTUBE_THUMBNAIL_HOSTS.indexOf(host) === -1" in js, (
    "the render-time host check is no longer an exact match"
)

assert "@media (min-width: 768px)" in css, "the 768px media-column breakpoint is missing"
assert "@media (min-width: 640px)" not in css, "the superseded 640px breakpoint is still present"
assert "flex-direction: row-reverse" not in css, "the media column is still painted in reverse DOM order"
assert ".hackertube .ht-compact-side { flex: 0 0 430px; }" in css, "the fixed media column is missing"
assert ".hackertube .ht-thumb-compact { width: 192px; flex: 0 0 auto; }" in css, (
    "the compact thumbnail is not drawn at 192px"
)
assert "height: 186px" in css, "the Icon is not drawn at 186px"

link_rule = css[css.index(".hackertube .ht-youtube-compact a {"):]
link_rule = link_rule[: link_rule.index("}")]
assert "padding: 0;" in link_rule, "the compact link still pads the Icon box"
assert "min-height: 44px" in link_rule and "min-width: 44px" in link_rule, "the tap target lost its 44px floor"

thumb_rule = css[css.index(".hackertube .ht-thumb {"):]
thumb_rule = thumb_rule[: thumb_rule.index("}")]
assert "object-fit: cover" not in thumb_rule, "the thumbnail rule must never crop"
assert "height: auto" in thumb_rule, "the thumbnail keeps its own aspect ratio"
assert "border-radius" not in thumb_rule, "a corner radius would clip the official thumbnail"

source = (HOME / "plugins" / "hackertube" / "hackertube_core")
assert "evidence_is_current" in (source / "records.py").read_text(encoding="utf-8"), (
    "the shared expiry predicate is missing from the installed core"
)
privacy_source = (source / "privacy.py").read_text(encoding="utf-8")
assert "_profile_db_path" in privacy_source, "the missing-database guard is missing from privacy.py"
assert "logger.warning(" in privacy_source, "the purge failure is no longer logged"
assert "while not stop.wait(interval):" in privacy_source, "the interval loop is missing"
assert "purge()\n        while not stop.wait(interval):" in privacy_source, (
    "the startup purge does not run on the background thread before the interval loop"
)

record["assets"] = {
    "note": True,
    "compact_attribution": True,
    "dom_media_before_text": True,
    "breakpoint_768": True,
    "superseded_breakpoint_640_absent": True,
    "media_column_fixed_width_430": True,
    "compact_thumbnail_192px": True,
    "compact_link_padding_zero": True,
    "tap_target_44px": True,
    "render_time_host_allowlist_exact": True,
    "thumbnail_rule_uncropped": True,
    "expiry_predicate": True,
    "startup_purge_on_thread": True,
    "purge_logs_warning": True,
    "missing_db_guard": True,
}

# ===========================================================================
# Failure path 1: a FRESH profile has no profile database, and loading the
# plugin (the startup housekeeping the registration triggers) must not make one.
# This runs before any route or store access, or the store would create the file.
# ===========================================================================
from hackertube_core.privacy import _profile_db_path, start_housekeeping

db_path = _profile_db_path()
record["fresh_profile"] = {"db_path": None if db_path is None else str(db_path),
                           "exists_before": None if db_path is None else db_path.exists()}
assert db_path is not None, "the plugin-data path must resolve inside Hermes"
assert not db_path.exists(), "the fresh profile must start with no profile database"
stop = start_housekeeping(interval=3600)
try:
    time.sleep(0.75)  # let the background thread run its startup pass
finally:
    stop()
record["fresh_profile"]["exists_after_start_housekeeping"] = db_path.exists()
assert not db_path.exists(), "loading the plugin must not create the profile database"


def mount(name):
    spec = importlib.util.spec_from_file_location(name, HOME / "plugins/hackertube/dashboard/plugin_api.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    app = FastAPI()
    app.include_router(module.router, prefix="/api/plugins/hackertube")
    return TestClient(app)


client = mount("post34_clean")

from hackertube_core import outbound

policy = client.get("/api/plugins/hackertube/privacy").json()
accepted = client.post(
    "/api/plugins/hackertube/privacy",
    json={"version": policy["version"], "accepted": True},
)
assert accepted.status_code == 200 and accepted.json()["accepted"]
record["policy_accepted"] = True

status = client.get("/api/plugins/hackertube/status")
assert status.status_code == 200, status.text
record["status"] = {"provider": status.json().get("provider"), "name": status.json().get("name")}

catalog = client.get("/api/plugins/hackertube/catalog")
assert catalog.status_code == 200, catalog.text
body = catalog.json()["catalog"]
record["catalog"] = {"status": catalog.status_code, "items": len(body["items"])}
assert "ytimg" not in json.dumps(body), "no seeded thumbnail URL is expected"

# --- Failure path 2: expired YouTube data present at startup ----------------
from hackertube_core.boundaries import active_evidence
from hackertube_core.catalog import load_catalog
from hackertube_core.catalog_store import document, without_expired
from hackertube_core.profile import ProfileStore, open_profile_db

NOW = "2026-11-10T20:00:00Z"
EXPIRED = "2026-11-09T00:00:00Z"
PAST_CLOCK = "2026-11-01T00:00:00Z"


def youtube_item(item_id, title, capture_order=1):
    return {
        "item_id": item_id, "format": "video", "title": title,
        "destination": "https://www.youtube.com/watch?v=LCEmiRjPEtQ",
        "contributors": ["A channel"], "duration_seconds": None, "availability": "public",
        "identifiers": [item_id], "show_id": None, "capture_order": capture_order, "captured_at": PAST_CLOCK,
        "art_url": None, "art_hotlink": False, "art_http_status": None, "art_checked_at": None,
        "art_cache": False, "art_reason": "no-art",
    }


def youtube_evidence(eid, item_id, refresh_after):
    return {
        "evidence_id": eid, "item_id": item_id, "source_id": "youtube",
        "retrieved_at": PAST_CLOCK, "destination": "https://www.youtube.com/watch?v=LCEmiRjPEtQ",
        "excerpt": None, "endorsement": "not_applicable", "kind": "catalog",
        "display_line": None, "refresh_after": refresh_after,
    }


def source_row(source_id="youtube", name="YouTube", role="catalog"):
    return {
        "source_id": source_id, "name": name, "role": role, "enabled": True,
        "blocked_reason": None, "attribution": "Attribution.", "retention": "30 days.",
        "refresh": "explicit", "deletion": "at the deadline", "refresh_after": None,
        "last_success_at": None, "last_error": None, "formats": ["video"],
    }


stale = load_catalog({
    "schema": "hackertube.catalog/1",
    "demo_question": "Jane Austen videos",
    "formats_may_be_empty": [],
    "unavailable_videos": [],
    "items": [youtube_item("youtube:LCEmiRjPEtQ", "Expired sentinel title", capture_order=1),
              youtube_item("youtube:ZZZZZZZZZZZ", "Undated sentinel title", capture_order=2)],
    "evidence": [youtube_evidence("youtube:LCEmiRjPEtQ", "youtube:LCEmiRjPEtQ", EXPIRED),
                 youtube_evidence("youtube:ZZZZZZZZZZZ", "youtube:ZZZZZZZZZZZ", None)],
    "sources": [source_row()],
    "editions": [],
})

store = ProfileStore(open_profile_db, clock=lambda: PAST_CLOCK)
with store._connect() as conn:
    conn.execute(
        "INSERT INTO retrieved_catalog(key, document) VALUES ('catalog', ?) "
        "ON CONFLICT(key) DO UPDATE SET document=excluded.document",
        (json.dumps(document(stale)),),
    )
    conn.commit()
    raw_before = conn.execute("SELECT document FROM retrieved_catalog WHERE key='catalog'").fetchone()[0]
assert "Expired sentinel title" in raw_before and "Undated sentinel title" in raw_before

# Plugin startup: the same call the plugin registration makes. It runs the
# startup pass on a background thread, so wait for the pass to complete.
stop = start_housekeeping(interval=3600)
try:
    raw_after = raw_before
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        with store._connect() as conn:
            raw_after = conn.execute("SELECT document FROM retrieved_catalog WHERE key='catalog'").fetchone()[0]
        if "Expired sentinel title" not in raw_after and "Undated sentinel title" not in raw_after:
            break
        time.sleep(0.1)
finally:
    stop()
record["startup_purge"] = {
    "expired_row_before": "Expired sentinel title" in raw_before,
    "undated_row_before": "Undated sentinel title" in raw_before,
    "expired_row_after": "Expired sentinel title" in raw_after,
    "undated_row_after": "Undated sentinel title" in raw_after,
}
assert record["startup_purge"]["expired_row_after"] is False, "the startup purge left expired metadata on disk"
assert record["startup_purge"]["undated_row_after"] is False, "an undated YouTube row survived the startup purge"

# The same rule at the read boundary, and the community row that must survive it.
from hackertube_core.records import evidence_is_current

rows = load_catalog({
    "schema": "hackertube.catalog/1",
    "demo_question": "q", "formats_may_be_empty": [], "unavailable_videos": [],
    "items": [youtube_item("youtube:LCEmiRjPEtQ", "Undated sentinel title")],
    "evidence": [youtube_evidence("youtube:LCEmiRjPEtQ", "youtube:LCEmiRjPEtQ", None),
                 {**youtube_evidence("hn:1", "youtube:LCEmiRjPEtQ", None), "source_id": "hn",
                  "kind": "community", "endorsement": "mention"}],
    "sources": [source_row(), source_row("hn", "Hacker News", "community")],
    "editions": [],
}).evidence
record["undated_rule"] = {
    "active_evidence_ids": [row.evidence_id for row in active_evidence(rows, NOW)],
    "youtube_undated_current": evidence_is_current([r for r in rows if r.source_id == "youtube"][0], NOW),
    "community_undated_current": evidence_is_current([r for r in rows if r.source_id == "hn"][0], NOW),
    "without_expired_items": len(without_expired(load_catalog({
        "schema": "hackertube.catalog/1",
        "demo_question": "q", "formats_may_be_empty": [], "unavailable_videos": [],
        "items": [youtube_item("youtube:LCEmiRjPEtQ", "Undated sentinel title")],
        "evidence": [youtube_evidence("youtube:LCEmiRjPEtQ", "youtube:LCEmiRjPEtQ", None)],
        "sources": [source_row()], "editions": [],
    }), NOW).items),
}
assert record["undated_rule"]["youtube_undated_current"] is False
assert record["undated_rule"]["community_undated_current"] is True
assert record["undated_rule"]["without_expired_items"] == 0

# --- Failure path 3: look-alike thumbnail hosts are never stored ------------
from hackertube_core.adapters import youtube

LOOKALIKE = "https://i.ytimg.com.evil.example/vi/LCEmiRjPEtQ/hqdefault.jpg"
SUFFIX = "https://xi.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg"
PREFIX = "https://evil-i.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg"
FOREIGN = "https://images.example.com/vi/LCEmiRjPEtQ/hqdefault.jpg"
record["lookalike_host"] = {
    "thumbnail_url_lookalike": youtube.thumbnail_url({"thumbnails": {"high": {"url": LOOKALIKE}}}),
    "thumbnail_url_suffix": youtube.thumbnail_url({"thumbnails": {"high": {"url": SUFFIX}}}),
    "thumbnail_url_prefix": youtube.thumbnail_url({"thumbnails": {"high": {"url": PREFIX}}}),
    "thumbnail_url_foreign": youtube.thumbnail_url({"thumbnails": {"high": {"url": FOREIGN}}}),
    "thumbnail_url_official": youtube.thumbnail_url(
        {"thumbnails": {"high": {"url": "https://i.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg"}}}
    ),
}
assert record["lookalike_host"]["thumbnail_url_lookalike"] is None
assert record["lookalike_host"]["thumbnail_url_suffix"] is None
assert record["lookalike_host"]["thumbnail_url_prefix"] is None
assert record["lookalike_host"]["thumbnail_url_foreign"] is None
assert record["lookalike_host"]["thumbnail_url_official"] == "https://i.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg"

parsed = youtube.parse_data_api(
    {"kind": "youtube#videoListResponse", "items": [{
        "id": "LCEmiRjPEtQ",
        "snippet": {"title": "Look-alike title", "channelTitle": "A channel",
                    "thumbnails": {"high": {"url": SUFFIX}}},
    }]},
    PAST_CLOCK,
    art_check=lambda url: True,
)
record["lookalike_host"]["stored_art_url"] = parsed.items[0].art_url
assert parsed.items[0].art_url is None, "a suffix look-alike host must never become stored artwork"

# --- Failure path: one source is down; the pass still returns ---------------
from hackertube_core.adapters.base import ParseResult
from hackertube_core.sources import REGISTRY, ingest


def source_down(query, now):
    raise OSError("connection refused")


def source_up(query, now):
    return ParseResult((), (), (), ())


fetchers = {source_id: (source_down if index == 0 else source_up) for index, source_id in enumerate(REGISTRY)}
outbound.reset()
report = ingest(store, NOW, "Jane Austen", fetchers=fetchers, registry=dict(REGISTRY))
record["source_outage"] = {"sources": len(report["sources"]), "items": len(report["items"]),
                           "counts": outbound.counters()}
assert outbound.counters() == {"free": 0, "metered": 0, "paid": 0}, outbound.counters()


class Opener:
    class Response:
        status = 200
        headers = {"Content-Type": "image/jpeg"}

        def read(self, *args):
            raise AssertionError("the image body must not be read")

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    def open(self, request, timeout=None):
        return Opener.Response()


outbound.reset()
cleared = youtube.thumbnail_is_display_clear(
    "https://i.ytimg.com/vi/LCEmiRjPEtQ/hqdefault.jpg",
    opener=Opener(),
    resolve=lambda host, port=None, *args, **kwargs: [(0, 0, 6, "", ("1.1.1.1", 0))],
)
record["thumbnail_display_check"] = {"cleared": cleared, "counts": outbound.counters()}
assert cleared is True
assert outbound.counters() == {"free": 1, "metered": 0, "paid": 0}, outbound.counters()

print(json.dumps(record, indent=2))
