"""LIB01, LIB02, LIB03, and PREF01. Profile rows survive a new store and a catalog reread."""

import importlib.util
import socket
import sqlite3
import sys
import types
from pathlib import Path

import pytest

from hackertube_core.catalog import load_seed
from hackertube_core.errors import ProfileError, RecordError
from hackertube_core.profile import SCHEMA, ProfileStore, apply_action, open_profile_db
from hackertube_core.records import INTEREST_MAX, Interest

ITEM = "ol:OL66554W"
NOW = "2026-11-06T12:24:15Z"
OPENED = "2026-11-06T15:00:00Z"
OPENED_AGAIN = "2026-11-06T15:05:00Z"
ROOT = Path(__file__).resolve().parents[1]
VIEW = ROOT / "hackertube" / "dashboard" / "catalog_view.py"
_BANNED_COLUMNS = ("title", "destination", "excerpt", "username", "thumbnail", "oembed", "channel", "art_url")


def _view():
    spec = importlib.util.spec_from_file_location("hackertube_catalog_view_profile", VIEW)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _saved(snapshot):
    return [row for row in snapshot["items"] if row["saved"] and row["item_id"] == ITEM]


def local_connect(root):
    """Test opener. It is not the production path and it does not set WAL."""
    path = Path(root) / "profile.db"
    path.parent.mkdir(parents=True, exist_ok=True)

    def connect():
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    return connect


def store_at(root, clock=None):
    return ProfileStore(local_connect(root), clock=clock)


def test_lib01_save_twice_stores_one_record(tmp_path):
    store = store_at(tmp_path)
    known = {ITEM}
    status, first = apply_action(store, "save", {"item_id": ITEM}, known)
    assert status == 200
    status, second = apply_action(store, "save", {"item_id": ITEM}, known)
    assert status == 200
    assert second == first
    assert len(_saved(second)) == 1
    assert second["items"][0]["completed"] is False
    assert second["items"][0]["opens"] == []
    conn = sqlite3.connect(tmp_path / "profile.db")
    try:
        assert conn.execute("SELECT COUNT(*) FROM item_state").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM item_state WHERE saved = 1").fetchone()[0] == 1
    finally:
        conn.close()


def test_lib02_restart_keeps_saved_item_and_open_event(tmp_path):
    store = store_at(tmp_path)
    known = {ITEM}
    store.save_item(ITEM, known_ids=known)
    store.record_open(ITEM, known_ids=known, opened_at=OPENED)
    restarted = store_at(tmp_path)
    row = _saved(restarted.snapshot())[0]
    assert row["saved"] is True
    assert row["opens"] == [OPENED]
    assert row["completed"] is False
    assert row["dismissed"] is False


def test_lib02_catalog_refresh_keeps_saved_item_and_open_event(tmp_path):
    store = store_at(tmp_path)
    known = {ITEM}
    store.save_item(ITEM, known_ids=known)
    store.record_open(ITEM, known_ids=known, opened_at=OPENED)
    before = store.snapshot()
    first = load_seed()
    second = load_seed()
    assert [item.item_id for item in first.items] == [item.item_id for item in second.items]
    view = _view()
    assert view.catalog_dict() == view.catalog_dict()
    assert store_at(tmp_path).snapshot() == before


def test_lib03_open_action_ignores_a_client_timestamp(tmp_path):
    store = store_at(tmp_path, clock=lambda: OPENED)
    status, body = apply_action(
        store,
        "open",
        {"item_id": ITEM, "opened_at": "1999-01-01T00:00:00Z"},
        {ITEM},
    )
    assert status == 200
    assert body["items"][0]["opens"] == [OPENED]
    assert body["items"][0]["completed"] is False
    assert body["items"][0]["saved"] is False


def test_lib03_open_records_an_event_and_leaves_completion_unchanged(tmp_path):
    store = store_at(tmp_path)
    known = {ITEM}
    store.save_item(ITEM, known_ids=known)
    before = _saved(store.snapshot())[0]
    assert before["completed"] is False
    assert before["opens"] == []
    store.record_open(ITEM, known_ids=known, opened_at=OPENED)
    opened = _saved(store.snapshot())[0]
    assert opened["opens"] == [OPENED]
    assert opened["completed"] is False
    assert opened["saved"] is True
    conn = sqlite3.connect(tmp_path / "profile.db")
    try:
        conn.execute("UPDATE item_state SET completed = 1 WHERE item_id = ?", (ITEM,))
        conn.commit()
    finally:
        conn.close()
    store.record_open(ITEM, known_ids=known, opened_at=OPENED_AGAIN)
    again = store_at(tmp_path).snapshot()["items"][0]
    assert again["completed"] is True
    assert again["saved"] is True
    assert again["opens"] == [OPENED, OPENED_AGAIN]


def test_pref01_gardening_interest_persists_across_restart_and_is_available_for_ranking(tmp_path, monkeypatch):
    from hackertube_core import outbound

    outbound.install_guard(monkeypatch)
    outbound.reset()
    store = store_at(tmp_path)
    store.add_interest(" gardening ")
    store.add_interest("gardening")
    restarted = store_at(tmp_path)
    interests = restarted.interest_texts()
    assert interests == ("gardening",)
    assert restarted.snapshot()["interests"] == ["gardening"]
    feed = load_seed().feed(interests, NOW)
    assert feed.personalized is True
    assert outbound.counters() == {"free": 0, "paid": 0, "metered": 0}


def test_pref01_interest_is_not_limited_to_technology(tmp_path):
    store = store_at(tmp_path)
    store.add_interest("gardening")
    status, body = apply_action(store, "interest", {"text": "gardening"}, set())
    assert status == 200
    assert body["interests"] == ["gardening"]
    with pytest.raises(ProfileError):
        store.add_interest("<b>gardening</b>")
    with pytest.raises(ProfileError):
        store.add_interest("   ")
    assert store.interest_texts() == ("gardening",)


def test_profile_schema_stores_ids_flags_and_events_only(tmp_path):
    store = store_at(tmp_path)
    store.save_item(ITEM, known_ids={ITEM})
    store.record_open(ITEM, known_ids={ITEM}, opened_at=OPENED)
    store.add_interest("gardening")
    conn = sqlite3.connect(tmp_path / "profile.db")
    try:
        tables = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND sql IS NOT NULL"
        ).fetchall()
        schema = " ".join(row[0].lower() for row in tables)
        for column in _BANNED_COLUMNS:
            assert column not in schema
        assert conn.execute("SELECT value FROM profile_meta WHERE key = 'schema'").fetchone()[0] == SCHEMA
        item = conn.execute(
            "SELECT item_id, saved, dismissed, completed, saved_order FROM item_state"
        ).fetchone()
        assert item == (ITEM, 1, 0, 0, 1)
        event = conn.execute("SELECT item_id, opened_at FROM open_event").fetchone()
        assert event == (ITEM, OPENED)
        assert conn.execute("SELECT text FROM interests").fetchone()[0] == "gardening"
    finally:
        conn.close()
    body = store.snapshot()
    assert set(body) == {"schema", "interests", "items"}
    assert set(body["items"][0]) == {
        "item_id",
        "saved",
        "dismissed",
        "completed",
        "saved_order",
        "opens",
    }


def test_save_rejects_an_id_outside_the_catalog(tmp_path):
    store = store_at(tmp_path)
    with pytest.raises(ProfileError):
        store.save_item("not-in-catalog", known_ids={ITEM})
    assert store.snapshot()["items"] == []
    status, body = apply_action(store, "save", {"item_id": "not-in-catalog"}, {ITEM})
    assert status == 400
    assert body == {"error": "item"}
    assert store.snapshot()["items"] == []


def test_dismissed_flag_persists_across_restart(tmp_path):
    store = store_at(tmp_path)
    store.dismiss_item(ITEM, known_ids={ITEM})
    store.dismiss_item(ITEM, known_ids={ITEM})
    restarted = store_at(tmp_path)
    row = restarted.snapshot()["items"][0]
    assert row["dismissed"] is True
    assert row["saved"] is False
    assert row["completed"] is False
    assert len(restarted.snapshot()["items"]) == 1


def test_store_keeps_delete_journal_mode_and_profile_rows(tmp_path):
    path = tmp_path / "profile.db"
    first = sqlite3.connect(path)
    first.execute("PRAGMA journal_mode=DELETE")
    first.commit()
    first.close()

    def connect():
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    store = ProfileStore(connect)
    store.save_item(ITEM, known_ids={ITEM})
    store.record_open(ITEM, known_ids={ITEM}, opened_at=OPENED)
    store.add_interest("gardening")
    probe = sqlite3.connect(path)
    try:
        mode = probe.execute("PRAGMA journal_mode").fetchone()[0]
    finally:
        probe.close()
    assert str(mode).lower() == "delete"
    again = ProfileStore(connect)
    row = again.snapshot()["items"][0]
    assert row["saved"] is True
    assert row["completed"] is False
    assert row["opens"] == [OPENED]
    assert again.interest_texts() == ("gardening",)


def test_open_profile_db_calls_plugin_db_not_sqlite_connect(tmp_path, monkeypatch):
    source = Path(open_profile_db.__code__.co_filename).read_text(encoding="utf-8")
    assert "sqlite3.connect" not in source
    assert "journal_mode" not in source
    assert "busy_timeout" not in source
    assert "PRAGMA" not in source
    assert 'plugin_db("hackertube", filename=DB_NAME)' in source
    api = (ROOT / "hackertube" / "dashboard" / "plugin_api.py").read_text(encoding="utf-8")
    assert "open_profile_db" in api
    assert "sqlite3.connect" not in api
    ready = sqlite3.connect(tmp_path / "profile.db")
    calls = []

    def fake(name, filename="data.db"):
        calls.append((name, filename))
        return ready

    storage = types.ModuleType("plugins.plugin_storage")
    storage.plugin_db = fake
    package = types.ModuleType("plugins")
    package.plugin_storage = storage
    monkeypatch.setitem(sys.modules, "plugins", package)
    monkeypatch.setitem(sys.modules, "plugins.plugin_storage", storage)

    def explode(*args, **kwargs):
        raise AssertionError("sqlite3.connect")

    monkeypatch.setattr(sqlite3, "connect", explode)
    conn = open_profile_db()
    assert conn is ready
    assert calls == [("hackertube", "profile.db")]
    assert conn.row_factory is sqlite3.Row
    ready.close()


def test_profile_store_and_plugin_db_opener_do_not_resolve_dns(tmp_path, monkeypatch):
    lookups = []

    def refuse(*args, **kwargs):
        lookups.append(args)
        raise AssertionError("live DNS is disabled in tests")

    monkeypatch.setattr(socket, "getaddrinfo", refuse)
    store = store_at(tmp_path)
    store.save_item(ITEM, known_ids={ITEM})
    store.record_open(ITEM, known_ids={ITEM}, opened_at=OPENED)
    store.add_interest("gardening")
    assert store.interest_texts() == ("gardening",)
    ready = sqlite3.connect(tmp_path / "helper.db")
    calls = []

    def fake(name, filename="data.db"):
        calls.append((name, filename))
        return ready

    storage = types.ModuleType("plugins.plugin_storage")
    storage.plugin_db = fake
    package = types.ModuleType("plugins")
    package.plugin_storage = storage
    monkeypatch.setitem(sys.modules, "plugins", package)
    monkeypatch.setitem(sys.modules, "plugins.plugin_storage", storage)
    conn = open_profile_db()
    assert conn is ready
    assert calls == [("hackertube", "profile.db")]
    assert lookups == []
    ready.close()


def test_interest_limits_match_code_points_and_reject_controls():
    assert Interest("a" * INTEREST_MAX).text == "a" * INTEREST_MAX
    with pytest.raises(RecordError):
        Interest("a" * (INTEREST_MAX + 1))
    plants = "🌱" * INTEREST_MAX
    assert Interest(plants).text == plants
    with pytest.raises(RecordError):
        Interest("🌱" * (INTEREST_MAX + 1))
    with pytest.raises(RecordError):
        Interest("gardening\nbeds")
    with pytest.raises(RecordError):
        Interest("gardening\rbeds")
    assert Interest("&lt;b&gt;").text == "&lt;b&gt;"
    with pytest.raises(RecordError):
        Interest("<b>gardening</b>")
