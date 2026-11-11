"""Put one real YouTube video item into a clean profile's HackerTube catalog.

The frozen seed has no video item, so a fresh dashboard never renders a compact
YouTube row and the Watch link's ring cannot be measured there at all. This
writes a video item through the plugin's own validated write path
(``ProfileStore.remember_catalog`` — the same call a completed Search uses), so
the real host page renders the row from its own stored catalog. No fixture and
no test harness: the dashboard server reads this over its own route.

    HERMES_HOME=<clean profile> ~/.hermes/hermes-agent/venv/bin/python3 \
        docs/receipts/post39/seed_video_item.py
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(REPO, "hackertube"))
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-agent"))

from hackertube_core.catalog import load_seed, load_catalog            # noqa: E402
from hackertube_core.catalog_store import document                     # noqa: E402
from hackertube_core.privacy import VERSION                            # noqa: E402
from hackertube_core.profile import ProfileStore, open_profile_db      # noqa: E402

now = datetime.now(timezone.utc).replace(microsecond=0)
stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
refresh = (now + timedelta(days=29)).strftime("%Y-%m-%dT%H:%M:%SZ")

VIDEO_ID = "LCEmiRjPEtQ"
item = {
    "item_id": "youtube:" + VIDEO_ID,
    "format": "video",
    "title": "Jane Austen introduction",
    "destination": "https://www.youtube.com/watch?v=" + VIDEO_ID,
    "contributors": ["A channel"],
    "duration_seconds": 420,
    "availability": None,
    "identifiers": ["youtube:" + VIDEO_ID],
    "show_id": None,
    "capture_order": 1,
    "captured_at": stamp,
    "art_url": "https://i.ytimg.com/vi/" + VIDEO_ID + "/hqdefault.jpg",
    "art_hotlink": True,
    "art_cache": False,
    "art_reason": "Official YouTube thumbnail, hotlinked only after a free 200 status check.",
    "art_checked_at": stamp,
    "art_http_status": 200,
}
evidence = {
    "evidence_id": "youtube:" + VIDEO_ID,
    "item_id": "youtube:" + VIDEO_ID,
    "source_id": "youtube",
    "retrieved_at": stamp,
    "destination": "https://www.youtube.com/watch?v=" + VIDEO_ID,
    "excerpt": None,
    "endorsement": "not_applicable",
    "kind": "catalog",
    "display_line": None,
    "refresh_after": refresh,
}

seed = load_seed()
doc = document(seed)
doc["items"] = doc["items"] + [dict(item, capture_order=len(doc["items"]) + 1)]
doc["evidence"] = doc["evidence"] + [evidence]
catalog = load_catalog(doc)

store = ProfileStore(open_profile_db)
store.accept_privacy(VERSION)
store.remember_catalog(catalog)

reloaded = store.catalog(load_seed())
ids = [row.item_id for row in reloaded.items]
print(json.dumps({
    "hermes_home": os.environ.get("HERMES_HOME"),
    "privacy_accepted": store.privacy_accepted(),
    "video_items": [i for i in ids if i.startswith("youtube:")],
    "total_items": len(ids),
}, indent=2))