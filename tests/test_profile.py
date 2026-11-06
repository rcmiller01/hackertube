"""LIB01, LIB02, LIB03, and PREF01. Profile rows survive a new store and a catalog reread."""

import importlib.util
import sqlite3
from pathlib import Path

import pytest

from hackertube_core.catalog import load_seed
from hackertube_core.errors import ProfileError
from hackertube_core.profile import SCHEMA, ProfileStore, apply_action

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


def test_lib01_save_twice_stores_one_record(tmp_path):
    store = ProfileStore(tmp_path)
    known = {ITEM}
    status, first = apply_action(store, "save", {"item_id": ITEM}, known)
    assert status == 200
    status, second = apply_action(store, "save", {"item_id": ITEM}, known)
    assert status == 200
    assert second == first
    assert len(_saved(second)) == 1
    assert second["items"][0]["completed"] is False
    assert second["items"][0]["opens"] == []
    conn = sqlite3.connect(store.path)
    try:
        assert conn.execute("SELECT COUNT(*) FROM item_state").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM item_state WHERE saved = 1").fetchone()[0] == 1
    finally:
        conn.close()


def test_lib02_restart_keeps_saved_item_and_open_event(tmp_path):
    store = ProfileStore(tmp_path)
    known = {ITEM}
    store.save_item(ITEM, known_ids=known)
    store.record_open(ITEM, known_ids=known, opened_at=OPENED)
    restarted = ProfileStore(tmp_path)
    row = _saved(restarted.snapshot())[0]
    assert row["saved"] is True
    assert row["opens"] == [OPENED]
    assert row["completed"] is False
    assert row["dismissed"] is False


def test_lib02_catalog_refresh_keeps_saved_item_and_open_event(tmp_path):
    store = ProfileStore(tmp_path)
    known = {ITEM}
    store.save_item(ITEM, known_ids=known)
    store.record_open(ITEM, known_ids=known, opened_at=OPENED)
    before = store.snapshot()
    first = load_seed()
    second = load_seed()
    assert [item.item_id for item in first.items] == [item.item_id for item in second.items]
    view = _view()
    assert view.catalog_dict() == view.catalog_dict()
    assert ProfileStore(tmp_path).snapshot() == before


def test_lib03_open_action_ignores_a_client_timestamp(tmp_path):
    store = ProfileStore(tmp_path, clock=lambda: OPENED)
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
    store = ProfileStore(tmp_path)
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
    conn = sqlite3.connect(store.path)
    try:
        conn.execute("UPDATE item_state SET completed = 1 WHERE item_id = ?", (ITEM,))
        conn.commit()
    finally:
        conn.close()
    store.record_open(ITEM, known_ids=known, opened_at=OPENED_AGAIN)
    again = ProfileStore(tmp_path).snapshot()["items"][0]
    assert again["completed"] is True
    assert again["saved"] is True
    assert again["opens"] == [OPENED, OPENED_AGAIN]


def test_pref01_gardening_interest_persists_across_restart_and_is_available_for_ranking(tmp_path):
    store = ProfileStore(tmp_path)
    store.add_interest(" gardening ")
    store.add_interest("gardening")
    restarted = ProfileStore(tmp_path)
    interests = restarted.interest_texts()
    assert interests == ("gardening",)
    assert restarted.snapshot()["interests"] == ["gardening"]
    feed = load_seed().feed(interests, NOW)
    assert feed.personalized is True
    assert feed.paid_calls == 0


def test_pref01_interest_is_not_limited_to_technology(tmp_path):
    store = ProfileStore(tmp_path)
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
    store = ProfileStore(tmp_path)
    store.save_item(ITEM, known_ids={ITEM})
    store.record_open(ITEM, known_ids={ITEM}, opened_at=OPENED)
    store.add_interest("gardening")
    conn = sqlite3.connect(store.path)
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
    store = ProfileStore(tmp_path)
    with pytest.raises(ProfileError):
        store.save_item("not-in-catalog", known_ids={ITEM})
    assert store.snapshot()["items"] == []
    status, body = apply_action(store, "save", {"item_id": "not-in-catalog"}, {ITEM})
    assert status == 400
    assert body == {"error": "item"}
    assert store.snapshot()["items"] == []


def test_dismissed_flag_persists_across_restart(tmp_path):
    store = ProfileStore(tmp_path)
    store.dismiss_item(ITEM, known_ids={ITEM})
    store.dismiss_item(ITEM, known_ids={ITEM})
    restarted = ProfileStore(tmp_path)
    row = restarted.snapshot()["items"][0]
    assert row["dismissed"] is True
    assert row["saved"] is False
    assert row["completed"] is False
    assert len(restarted.snapshot()["items"]) == 1
