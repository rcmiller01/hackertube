"""Release gates: all owned metadata copies expire; Apple destinations stay distinct."""
import json

import pytest

from hackertube_core.catalog import load_seed
from hackertube_core.profile import ProfileStore
from hackertube_core.search import StubProvider, interpret_question, result_set, run_search
from test_search import build, connect_at, evidence, item, profile, source


def stored_video(tmp_path):
    clock = ["2026-11-01T00:00:00Z"]
    connect = connect_at(tmp_path)
    store = ProfileStore(connect, clock=lambda: clock[0])
    video = item("youtube:LCEmiRjPEtQ", "video", "AI retention sentinel title",
                 destination="https://www.youtube.com/watch?v=LCEmiRjPEtQ", captured_at=clock[0])
    cat = build([video], [evidence("yt", video["item_id"], "youtube",
        retrieved_at=clock[0], refresh_after="2026-12-01T00:00:00Z")], [source("youtube", "YouTube")])
    store.remember_catalog(cat)
    result = run_search(store, "retention videos", catalog=cat, profile=store.snapshot(),
        now=clock[0], provider=StubProvider(), disclosure_accepted=True)
    assert result["results"]
    with connect() as conn:
        conn.execute("INSERT INTO search_result VALUES (?,?)", (result["job"]["job_id"], json.dumps(result)))
    store.save_item(video["item_id"], {video["item_id"]})
    return store, connect, clock, result


@pytest.mark.parametrize("access", ["job_result", "catalog", "reopen"])
def test_expiry_cleans_catalog_and_durable_search_copies(tmp_path, access):
    store, connect, clock, result = stored_video(tmp_path)
    clock[0] = "2026-12-01T00:00:00Z"  # exact 30-day boundary
    if access == "reopen":
        store = ProfileStore(connect, clock=lambda: clock[0])
    elif access == "catalog":
        store.catalog(load_seed())
    else:
        store.job_result(result["job"]["job_id"])
    with connect() as conn:
        raw = " ".join(row[0] for row in conn.execute("SELECT document FROM search_result UNION ALL SELECT document FROM retrieved_catalog"))
    assert "AI retention sentinel title" not in raw
    assert store.snapshot()["items"][0]["saved"] is True
    redacted = store.job_result(result["job"]["job_id"])
    assert redacted["results"] == []
    assert redacted["usage"] == result["usage"], "expiry must retain truthful usage"
    assert redacted["job"]["state"] == result["job"]["state"]
    assert redacted["retention_expired"] is True


def test_recent_search_metadata_is_preserved(tmp_path):
    store, connect, clock, result = stored_video(tmp_path)
    clock[0] = "2026-11-30T23:59:59Z"
    assert store.job_result(result["job"]["job_id"])["results"] == result["results"]


@pytest.mark.parametrize("fmt,destination,label", [
    ("audiobook", "https://books.apple.com/us/audiobook/test/id123", "Apple Books"),
    ("podcast_show", "https://podcasts.apple.com/us/podcast/test/id123", "Apple Podcasts"),
])
@pytest.mark.parametrize("surface", ["search", "catalog"])
def test_apple_result_label_follows_the_actual_store(fmt, destination, label, surface):
    row = item("itunes:123", fmt, "AI introduction", destination=destination)
    cat = build([row], [evidence("itunes:123", row["item_id"], "itunes")],
        [source("itunes", "Apple Podcasts")])  # historical cached registry label
    if surface == "catalog":
        from hackertube_core.boundaries import explain_item
        result = explain_item(cat.items[0], cat.evidence, {x.source_id:x for x in cat.sources})
        assert result["retrievals"][0]["source_name"] == label
    else:
        result = result_set(cat, profile(), interpret_question("introduction"), "2026-11-07T12:00:00Z")
        assert result["results"][0]["source"]["label"] == label


def test_later_search_cannot_extend_age_of_copied_metadata(tmp_path):
    store, connect, clock, result = stored_video(tmp_path)
    with connect() as conn:
        conn.execute("UPDATE search_job SET created_at=?,ended_at=?", ("2026-11-30T00:00:00Z", "2026-11-30T00:00:00Z"))
    clock[0] = "2026-12-01T00:00:00Z"
    response = store.job_result(result["job"]["job_id"])
    assert response["results"] == [], "A new job timestamp must not renew old API metadata"


def test_release_ignore_blocks_local_credentials_but_keeps_safe_examples(tmp_path):
    import subprocess
    from pathlib import Path

    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    (tmp_path / ".gitignore").write_text((Path(__file__).parents[1] / ".gitignore").read_text())
    private = [".env", ".env.local", "auth.json", "credentials.json", "profile.db", "entry-form.private.json", "private-key.pem"]
    public = [".env.example", ".env.production.example", "docs/README.md", "public-key.pub", "tests/fixtures/config.json"]
    for value in private + public:
        found = subprocess.run(["git", "-c", "core.excludesFile=/dev/null", "-C", str(tmp_path), "check-ignore", "--no-index", value], capture_output=True).returncode == 0
        assert found == (value in private), value


def test_source_controls_identify_both_apple_stores(tmp_path):
    from hackertube_core.sources import source_snapshot
    store = ProfileStore(connect_at(tmp_path))
    apple = next(x for x in source_snapshot(store)["sources"] if x["source_id"] == "itunes")
    assert "Apple Books" in apple["name"]
    assert "Apple Podcasts" in apple["name"]


def test_openlibrary_contact_is_sent_only_to_openlibrary(tmp_path, monkeypatch):
    from hackertube_core.retrieval import SourceRetriever, Budget
    from hackertube_core.search import LIVE_LIMITS
    seen = []
    def read(url, **kwargs):
        seen.append((url, kwargs.get("headers", {})))
        if "openlibrary.org" in url:
            return {"docs":[]}
        if "itunes.apple.com" in url:
            return {"results":[]}
        if "librivox.org" in url:
            return {"books":[]}
        return {"hits":[]}
    monkeypatch.setattr("hackertube_core.retrieval.read_json", read)
    store = ProfileStore(connect_at(tmp_path))
    contact = "operator@example.invalid"
    SourceRetriever(store, get_secret=lambda name: contact if name=="OPENLIBRARY_CONTACT" else None)(interpret_question("gardening books"), "2026-11-08T00:00:00Z", Budget(LIVE_LIMITS))
    specific = [(u,h) for u,h in seen if "openlibrary.org" in u]
    assert specific and contact in specific[0][1].get("User-Agent", "")
    assert all(contact not in str(h) for u,h in seen if "openlibrary.org" not in u)
    assert all(contact not in u for u,h in seen)


def test_legacy_refresh_also_uses_the_scoped_openlibrary_contact(tmp_path, monkeypatch):
    from hackertube_core import sources
    seen = []
    monkeypatch.setattr(sources.openlibrary, "fetch_search", lambda query, **kwargs: seen.append(kwargs.get("contact")) or {"docs":[]})
    store = ProfileStore(connect_at(tmp_path))
    for source_id in ("hn", "itunes", "librivox"):
        store.set_source_enabled(source_id, False)
    sources.ingest(store, "2026-11-08T00:00:00Z", "gardening", get_secret=lambda name: "operator@example.invalid" if name=="OPENLIBRARY_CONTACT" else None)
    assert seen == ["operator@example.invalid"]
