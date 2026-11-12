"""Clean-profile probe for the post-#40 follow-up card.

Runs inside a FRESH, disposable ``HERMES_HOME`` whose plugin was enabled by the
real ``hermes plugins enable hackertube``, and checks two things against the
INSTALLED assets:

  * the installed stylesheet still takes the focus ring's colour from the host
    design token (``var(--color-ring)``) and declares no ring colour of its own
    — which is why the contrast test's fixture serves a host token block ahead
    of the plugin stylesheet, and why the colour mutations land in that block;
  * the one failure path: an ``ingest`` pass whose FIRST source raises
    ``OSError("connection refused")`` still returns, yields no items, and makes
    no outbound call.

The browser half of this card is not re-run here; the ring measurement itself is
the node suite's job (and the real-host probe in ``real_host_ring.js``), and this
probe is the clean-profile failure path the card asks for.
"""
import json
import os
import sys
from pathlib import Path

HOME = Path(os.environ["HERMES_HOME"])
sys.path.insert(0, "<hermes-home>/hermes-agent")
sys.path.insert(0, str(HOME / "plugins" / "hackertube"))
from plugins import plugin_storage  # noqa: E402

record: dict = {"home": str(HOME), "storage": plugin_storage.__file__}

# --- The installed stylesheet keeps the ring colour a host token ------------
dist = HOME / "plugins" / "hackertube" / "dashboard" / "dist"
css = (dist / "style.css").read_text(encoding="utf-8")
focus = css[css.index(".hackertube :focus,"):]
focus = focus[: focus.index("}")]
record["installed_ring_rule"] = focus
assert "outline: 2px solid var(--color-ring);" in focus, "the installed ring rule lost its host token"
assert "outline-offset: 2px;" in focus, "the installed ring rule lost its offset"
assert "--color-ring:" not in css, "the plugin stylesheet must not declare the host's ring token"
assert "#18181b" not in css, "the plugin stylesheet hardcodes a ring colour instead of the host token"

# --- Failure path: the first source is down; the pass still returns ---------
from hackertube_core import outbound  # noqa: E402
from hackertube_core.adapters.base import ParseResult  # noqa: E402
from hackertube_core.profile import ProfileStore, open_profile_db  # noqa: E402
from hackertube_core.sources import REGISTRY, ingest  # noqa: E402

NOW = "2026-11-10T20:00:00Z"
store = ProfileStore(open_profile_db, clock=lambda: NOW)


def source_down(query, now):
    raise OSError("connection refused")


def source_up(query, now):
    return ParseResult((), (), (), ())


fetchers = {source_id: (source_down if index == 0 else source_up)
            for index, source_id in enumerate(REGISTRY)}
outbound.reset()
report = ingest(store, NOW, "Jane Austen", fetchers=fetchers, registry=dict(REGISTRY))
record["source_outage"] = {
    "sources": len(report["sources"]),
    "items": len(report["items"]),
    "counts": outbound.counters(),
    "down_source": list(REGISTRY)[0],
}
assert len(report["items"]) == 0, "a down source must not yield items on this pass"
assert outbound.counters() == {"free": 0, "metered": 0, "paid": 0}, outbound.counters()
assert len(report["sources"]) == len(REGISTRY), "the pass must still account for every source"

print(json.dumps(record, indent=2))
