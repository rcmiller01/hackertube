"""Profile-local interests and library state.

The catalog document does not hold this data. One SQLite file in the
serving profile's plugin data directory does. Rows store an item id,
flags, save order, and open-event times. They do not store titles,
destinations, art, excerpts, or account names.

The dashboard opens that file with Hermes ``plugin_db``. This module
does not connect and does not set journal mode, busy timeout, or
foreign keys. Those belong to the host helper.
"""

from __future__ import annotations

from datetime import datetime, timezone

from hackertube_core.errors import ProfileError, RecordError
from hackertube_core.records import Interest, UserItemState

SCHEMA = "hackertube.profile/1"
DB_NAME = "profile.db"


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _fail(code):
    raise ProfileError(code)


def open_profile_db():
    """Open the profile database through Hermes.

    ``plugins.plugin_storage.plugin_db`` (Hermes v0.23.0, line 36) calls
    ``hermes_cli.sqlite_util.open_db`` and owns journal mode, busy timeout,
    and foreign keys. The returned connection uses ``row_factory`` None, so
    this sets ``sqlite3.Row`` for named columns and does not change durability.
    """
    from plugins.plugin_storage import plugin_db

    conn = plugin_db("hackertube", filename=DB_NAME)
    import sqlite3

    conn.row_factory = sqlite3.Row
    return conn


class ProfileStore:
    """Transactional profile store. Each call opens and closes its connection."""

    def __init__(self, connect, clock=None):
        self._connect = connect
        self.clock = clock or utc_now
        conn = self._connect()
        try:
            self._ensure(conn)
            conn.commit()
        finally:
            conn.close()

    def _ensure(self, conn):
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS profile_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS interests (
                text TEXT PRIMARY KEY,
                position INTEGER NOT NULL UNIQUE
            );
            CREATE TABLE IF NOT EXISTS item_state (
                item_id TEXT PRIMARY KEY,
                saved INTEGER NOT NULL CHECK (saved IN (0, 1)),
                dismissed INTEGER NOT NULL CHECK (dismissed IN (0, 1)),
                completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
                saved_order INTEGER
            );
            CREATE TABLE IF NOT EXISTS open_event (
                item_id TEXT NOT NULL,
                event_no INTEGER NOT NULL,
                opened_at TEXT NOT NULL,
                PRIMARY KEY (item_id, event_no),
                FOREIGN KEY (item_id) REFERENCES item_state(item_id)
            );
            """
        )
        conn.execute(
            "INSERT INTO profile_meta(key, value) VALUES ('schema', ?) "
            "ON CONFLICT(key) DO NOTHING",
            (SCHEMA,),
        )

    def interest_texts(self):
        return tuple(row["text"] for row in self._interest_rows())

    def snapshot(self):
        conn = self._connect()
        try:
            return self._snapshot_in(conn)
        finally:
            conn.close()

    def save_item(self, item_id, known_ids):
        self._require_known(item_id, known_ids)
        return self._write(lambda conn: self._save_item(conn, item_id))

    def dismiss_item(self, item_id, known_ids):
        self._require_known(item_id, known_ids)
        return self._write(lambda conn: self._dismiss_item(conn, item_id))

    def record_open(self, item_id, known_ids, opened_at=None):
        """Append one open event. Completion is not written."""
        self._require_known(item_id, known_ids)
        stamp = self.clock() if opened_at is None else opened_at
        try:
            stamp = UserItemState(
                item_id=item_id,
                saved=False,
                dismissed=False,
                completed=False,
                opens=(stamp,),
                saved_order=None,
            ).opens[0]
        except RecordError:
            _fail("time")
        return self._write(lambda conn: self._record_open(conn, item_id, stamp))

    def add_interest(self, text):
        try:
            cleaned = Interest(text).text
        except RecordError:
            _fail("interest")
        return self._write(lambda conn: self._add_interest(conn, cleaned))

    def _write(self, mutate):
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            mutate(conn)
            conn.commit()
            return self._snapshot_in(conn)
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _save_item(self, conn, item_id):
        row = _lock_item(conn, item_id)
        if row is not None and row["saved"]:
            return
        order = conn.execute("SELECT COALESCE(MAX(saved_order), 0) + 1 FROM item_state").fetchone()[0]
        if row is None:
            conn.execute(
                "INSERT INTO item_state(item_id, saved, dismissed, completed, saved_order) "
                "VALUES (?, 1, 0, 0, ?)",
                (item_id, order),
            )
            return
        conn.execute(
            "UPDATE item_state SET saved = 1, saved_order = ? WHERE item_id = ?",
            (order, item_id),
        )

    def _dismiss_item(self, conn, item_id):
        row = _lock_item(conn, item_id)
        if row is not None and row["dismissed"]:
            return
        if row is None:
            conn.execute(
                "INSERT INTO item_state(item_id, saved, dismissed, completed, saved_order) "
                "VALUES (?, 0, 1, 0, NULL)",
                (item_id,),
            )
            return
        conn.execute("UPDATE item_state SET dismissed = 1 WHERE item_id = ?", (item_id,))

    def _record_open(self, conn, item_id, stamp):
        row = _lock_item(conn, item_id)
        if row is None:
            conn.execute(
                "INSERT INTO item_state(item_id, saved, dismissed, completed, saved_order) "
                "VALUES (?, 0, 0, 0, NULL)",
                (item_id,),
            )
        event_no = conn.execute(
            "SELECT COALESCE(MAX(event_no), 0) + 1 FROM open_event WHERE item_id = ?",
            (item_id,),
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO open_event(item_id, event_no, opened_at) VALUES (?, ?, ?)",
            (item_id, event_no, stamp),
        )

    def _add_interest(self, conn, cleaned):
        existing = conn.execute("SELECT text FROM interests WHERE text = ?", (cleaned,)).fetchone()
        if existing is not None:
            return
        position = conn.execute("SELECT COALESCE(MAX(position), 0) + 1 FROM interests").fetchone()[0]
        conn.execute("INSERT INTO interests(text, position) VALUES (?, ?)", (cleaned, position))

    def _interest_rows(self):
        conn = self._connect()
        try:
            return conn.execute("SELECT text FROM interests ORDER BY position").fetchall()
        finally:
            conn.close()

    def _require_known(self, item_id, known_ids):
        if not isinstance(known_ids, (set, frozenset)) or item_id not in known_ids:
            _fail("item")
        try:
            UserItemState(
                item_id=item_id,
                saved=False,
                dismissed=False,
                completed=False,
                opens=(),
                saved_order=None,
            )
        except RecordError:
            _fail("item")

    def _snapshot_in(self, conn):
        items = []
        rows = conn.execute(
            "SELECT item_id, saved, dismissed, completed, saved_order FROM item_state ORDER BY rowid"
        ).fetchall()
        for row in rows:
            opens = tuple(
                event["opened_at"]
                for event in conn.execute(
                    "SELECT opened_at FROM open_event WHERE item_id = ? ORDER BY event_no",
                    (row["item_id"],),
                )
            )
            state = UserItemState(
                item_id=row["item_id"],
                saved=bool(row["saved"]),
                dismissed=bool(row["dismissed"]),
                completed=bool(row["completed"]),
                opens=opens,
                saved_order=row["saved_order"],
            )
            items.append(_item_dict(state))
        interests = [
            Interest(row["text"]).text
            for row in conn.execute("SELECT text FROM interests ORDER BY position")
        ]
        return {"schema": SCHEMA, "interests": interests, "items": items}


def _lock_item(conn, item_id):
    return conn.execute(
        "SELECT item_id, saved, dismissed, completed, saved_order FROM item_state WHERE item_id = ?",
        (item_id,),
    ).fetchone()


def _item_dict(state):
    return {
        "item_id": state.item_id,
        "saved": state.saved,
        "dismissed": state.dismissed,
        "completed": state.completed,
        "saved_order": state.saved_order,
        "opens": list(state.opens),
    }


def apply_action(store, action, body, known_ids):
    """Map one profile write to a status and a body. The body never echoes a rejected payload."""
    if not isinstance(body, dict):
        return 400, {"error": "body"}
    try:
        if action == "save":
            store.save_item(body.get("item_id"), known_ids=known_ids)
        elif action == "dismiss":
            store.dismiss_item(body.get("item_id"), known_ids=known_ids)
        elif action == "open":
            store.record_open(body.get("item_id"), known_ids=known_ids)
        elif action == "interest":
            store.add_interest(body.get("text"))
        else:
            return 404, {"error": "action"}
    except ProfileError as exc:
        return 400, {"error": str(exc)}
    return 200, store.snapshot()
