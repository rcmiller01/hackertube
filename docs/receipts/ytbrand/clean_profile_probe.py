"""Clean-profile probe for the YouTube branding follow-ups.

A fresh HERMES_HOME, the plugin enabled by the real `hermes plugins enable`,
and the plugin's own shipped assets. Covers the backend half of this card:
the shipped bundle carries the compact attribution and thumbnail rules, the
routes load from the enabled profile, one source-outage path returns, and no
paid or metered request is dispatched. The browser half (a thumbnail URL that
fails to load falls back to the linked Icon) is clean_profile_render.js.
"""
import importlib.util
import json
import os
import sys
from pathlib import Path

HOME = Path(os.environ["HERMES_HOME"])
sys.path.insert(0, "<hermes-home>/hermes-agent")
sys.path.insert(0, str(HOME / "plugins" / "hackertube"))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from plugins import plugin_storage

record: dict = {"home": str(HOME), "storage": plugin_storage.__file__}

dist = HOME / "plugins" / "hackertube" / "dashboard" / "dist"
js = (dist / "index.js").read_text(encoding="utf-8")
css = (dist / "style.css").read_text(encoding="utf-8")
NOTE = "Metadata from YouTube. Explanations and library actions are HackerTube\u2019s."
assert NOTE in js, "the short note is missing from the enabled profile"
assert "ht-youtube-compact" in js, "the compact attribution block is missing"
assert "ht-thumb" in js, "the thumbnail presentation is missing"
assert "renderYouTubeBrand(item, true)" in js, "compact rows still skip the attribution"
assert ".hackertube .ht-youtube-compact a img" in css, "the compact Icon rule is missing from the enabled profile"
assert ".hackertube .ht-thumb {" in css, "the uncropped thumbnail rule is missing from the enabled profile"
thumb_rule = css[css.index(".hackertube .ht-thumb {"):]
thumb_rule = thumb_rule[: thumb_rule.index("}")]
assert "object-fit: cover" not in thumb_rule, "the thumbnail rule must never crop"
assert "height: auto" in thumb_rule, "the thumbnail keeps its own aspect ratio"
assert "border-radius" not in thumb_rule, "a corner radius would clip the official thumbnail"
assert ".hackertube :is(#videos,#books,#audiobooks) .ht-compact .ht-format { display: none; }" in css
record["assets"] = {
    "note": True,
    "compact_attribution": True,
    "thumbnail_rule_uncropped": True,
    "compact_badge_scope": True,
}


def mount(name):
    spec = importlib.util.spec_from_file_location(name, HOME / "plugins/hackertube/dashboard/plugin_api.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    app = FastAPI()
    app.include_router(module.router, prefix="/api/plugins/hackertube")
    return TestClient(app)


client = mount("ytbrand_clean")

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
record["status"] = status.json()

catalog = client.get("/api/plugins/hackertube/catalog")
assert catalog.status_code == 200, catalog.text
body = catalog.json()["catalog"]
record["catalog"] = {
    "status": catalog.status_code,
    "items": len(body["items"]),
    "unavailable_videos": len(body["unavailable_videos"]),
    # The frozen seed still carries no displayable YouTube artwork.
    "ytimg_in_seed": "ytimg" in json.dumps(body),
}
assert record["catalog"]["ytimg_in_seed"] is False

# Failure path: one source is down; the pass still returns.
from hackertube_core.adapters.base import ParseResult
from hackertube_core.profile import ProfileStore, open_profile_db
from hackertube_core.sources import REGISTRY, ingest


def source_down(query, now):
    raise OSError("connection refused")


def source_up(query, now):
    return ParseResult((), (), (), ())


store = ProfileStore(open_profile_db)
fetchers = {source_id: (source_down if index == 0 else source_up) for index, source_id in enumerate(REGISTRY)}
outbound.reset()
report = ingest(store, "2026-11-10T20:00:00Z", "Jane Austen", fetchers=fetchers, registry=dict(REGISTRY))
record["source_outage"] = {
    "sources": len(report["sources"]),
    "items": len(report["items"]),
    "counts": outbound.counters(),
}
assert outbound.counters() == {"free": 0, "metered": 0, "paid": 0}, outbound.counters()

# A thumbnail display check is a FREE public image read, never metered or paid.
from hackertube_core.adapters import youtube


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
