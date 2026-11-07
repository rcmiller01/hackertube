"""Clean-profile check for task 2.4 seed work.

Runs under the Hermes interpreter with a disposable HERMES_HOME, so
``hackertube_core.profile.open_profile_db`` really opens the profile through
``plugins.plugin_storage.plugin_db``. Two failure paths are exercised: a
malformed seed record, and a seed source that is down.
"""

import json
import sys
from pathlib import Path

REPO = Path("/Users/robert/Developer/hackertube-2.4")
HERMES = Path("/Users/robert/.hermes/hermes-agent")
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(HERMES))

from hackertube_core import outbound  # noqa: E402
from hackertube_core import demo_seed  # noqa: E402
from hackertube_core.catalog import load_catalog, load_seed  # noqa: E402
from hackertube_core.errors import RecordError  # noqa: E402
from hackertube_core.http import HttpError  # noqa: E402
from hackertube_core.profile import open_profile_db  # noqa: E402
from plugins.plugin_storage import plugin_data_dir  # noqa: E402

CAPTURED = REPO / "tests" / "fixtures" / "captured"
NOW = "2026-11-06T12:24:15Z"

print("hermes python:", sys.version.split()[0])
data_root = plugin_data_dir("hackertube")
print("plugin data root:", data_root)

# 1. The real build, through plugin_db.
outbound.reset()
doc, counts = demo_seed.freeze(CAPTURED)
print("build counts:", counts)
print("items/evidence/sources:", len(doc["items"]), len(doc["evidence"]), len(doc["sources"]))

# 2. The profile file the build opened through plugin_db.
db = Path(data_root) / "profile.db"
print("profile.db exists:", db.exists(), "bytes:", db.stat().st_size if db.exists() else 0)

# 3. A seeded read of the frozen catalog.
catalog = load_seed()
print("sections:", {s: len(catalog.section(s, NOW)) for s in ("videos", "podcasts", "books", "audiobooks")})
feed = catalog.feed(["jane austen"], NOW)
print("ranked feed:", len(feed.items), "personalized:", feed.personalized, "paid:", outbound.charged())

# 4. Failure path A: a malformed seed record is refused, not served.
bad = json.loads((REPO / "hackertube_core" / "seed" / "catalog.json").read_text())
bad["items"][0]["format"] = "hn"
try:
    load_catalog(bad)
    print("FAILURE A: a malformed record was accepted")
except RecordError as exc:
    print("FAILURE A refused a malformed seed record:", exc)

# 5. Failure path B: a seed source is down.
real_read_json = demo_seed.read_json


def down_itunes(url, **kwargs):
    if "itunes.apple.com" in url:
        raise HttpError("http 500")
    return real_read_json(url, **kwargs)


demo_seed.read_json = down_itunes
outbound.reset()
try:
    demo_seed.freeze(CAPTURED)
    print("FAILURE B: an incomplete seed was frozen")
except RecordError as exc:
    print("FAILURE B refused an incomplete seed:", exc)
print("FAILURE B counts:", outbound.counters())
demo_seed.read_json = real_read_json

# 6. A down source inside one ingestion pass is isolated, not fatal.
from hackertube_core import sources  # noqa: E402
from hackertube_core.profile import ProfileStore  # noqa: E402

store = ProfileStore(open_profile_db)
reads = demo_seed._Reads(CAPTURED)
fetchers = reads.fetchers()
fetchers["itunes"] = lambda query, now: (_ for _ in ()).throw(HttpError("http 500"))
report = sources.ingest(store, NOW, demo_seed.QUESTION, fetchers=fetchers, registry=demo_seed.SEED_REGISTRY)
rows = {row["source_id"]: row for row in report["sources"]}
print("FAILURE B isolation:", {k: (v["last_error"], v["last_success_at"]) for k, v in rows.items()})
