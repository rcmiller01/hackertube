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

import json
import uuid
import re
from datetime import datetime, timezone, timedelta

from hackertube_core.errors import ProfileError, RecordError
from hackertube_core.records import Interest, UserItemState
from hackertube_core.text import canon_time

SCHEMA = "hackertube.profile/1"
DB_NAME = "profile.db"
_SOURCE_ID = re.compile(r"^[a-z0-9_]{1,40}$")

#: Persistent states for inline offline work and supervised searches.
JOB_STATES = (
    "queued",
    "running",
    "cancelling",
    "timed_out",
    "succeeded",
    "partial",
    "failed",
    "cancelled",
    "interrupted",
)
JOB_QUESTION_MAX = 200


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _fail(code):
    raise ProfileError(code)


def _source_id(value):
    if not isinstance(value, str) or not _SOURCE_ID.fullmatch(value):
        _fail("source_id")
    return value


def _stamp(value):
    try:
        return canon_time(value)
    except RecordError:
        _fail("time")


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
            self._purge_metadata(conn)
            conn.commit()
        finally:
            conn.close()

    def _ensure(self, conn):
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS retrieved_catalog (
                key TEXT PRIMARY KEY,
                document TEXT NOT NULL
            );
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
            CREATE TABLE IF NOT EXISTS source_setting (
                source_id TEXT PRIMARY KEY,
                enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS source_status (
                source_id TEXT PRIMARY KEY,
                last_attempt_at TEXT,
                last_success_at TEXT,
                last_error TEXT
            );
            CREATE TABLE IF NOT EXISTS search_job (
                job_id TEXT PRIMARY KEY,
                sequence INTEGER NOT NULL UNIQUE,
                kind TEXT NOT NULL,
                state TEXT NOT NULL,
                question TEXT NOT NULL,
                provider TEXT NOT NULL,
                limits TEXT NOT NULL,
                requests_used INTEGER NOT NULL,
                result_count INTEGER NOT NULL,
                cost_usd REAL,
                cost_known INTEGER NOT NULL CHECK (cost_known IN (0, 1)),
                coverage TEXT NOT NULL,
                created_at TEXT NOT NULL,
                ended_at TEXT
            );
            CREATE TABLE IF NOT EXISTS search_result (job_id TEXT PRIMARY KEY, document TEXT NOT NULL);
            """
        )
        conn.execute(
            "INSERT INTO profile_meta(key, value) VALUES ('schema', ?) "
            "ON CONFLICT(key) DO NOTHING",
            (SCHEMA,),
        )

    def catalog(self, base):
        from hackertube_core.catalog import load_catalog
        from hackertube_core.catalog_store import merge
        def read(conn):
            row = conn.execute("SELECT document FROM retrieved_catalog WHERE key='catalog'").fetchone()
            if row is None:
                return base
            stored = load_catalog(json.loads(row['document']))
            return merge(base, stored)  # _write_result purged all owned copies first.
        return self._write_result(read)

    def remember_catalog(self, catalog):
        from hackertube_core.catalog import load_catalog
        from hackertube_core.catalog_store import document, merge, without_expired
        # Validate before a write and store only normalized records, never raw provider output.
        catalog = load_catalog(document(catalog))
        def save(conn):
            row = conn.execute("SELECT document FROM retrieved_catalog WHERE key='catalog'").fetchone()
            combined = merge(load_catalog(json.loads(row['document'])), catalog) if row else catalog
            combined = without_expired(combined, self.clock())
            conn.execute("INSERT INTO retrieved_catalog(key,document) VALUES ('catalog',?) "
                         "ON CONFLICT(key) DO UPDATE SET document=excluded.document", (json.dumps(document(combined)),))
        self._write_result(save)

    def privacy_accepted(self):
        from hackertube_core.privacy import VERSION
        return self._privacy_version() == VERSION

    def _privacy_version(self):
        def read(conn):
            row = conn.execute("SELECT value FROM profile_meta WHERE key='privacy_version'").fetchone()
            return row[0] if row else None
        return self._write_result(read)

    def accept_privacy(self, version):
        from hackertube_core.privacy import VERSION
        if version != VERSION:
            raise RecordError("privacy_version")
        self._write_result(lambda conn: conn.execute(
            "INSERT INTO profile_meta(key,value) VALUES ('privacy_version',?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (VERSION,)))

    def clear_data(self):
        """Caller owns the exclusive Search lease; credentials are host-owned."""
        def clear(conn):
            for table in ("open_event", "item_state", "interests", "source_setting", "source_status", "retrieved_catalog", "search_result", "search_job", "profile_meta"):
                conn.execute(f"DELETE FROM {table}")
            conn.execute("INSERT INTO profile_meta VALUES ('schema',?)", (SCHEMA,))
        self._write_result(clear)

    def invalidate_youtube(self, item_ids):
        """Remove superseded/unavailable YouTube metadata from both owned copies."""
        ids = {value for value in item_ids if value.startswith("youtube:")}
        if not ids:
            return
        from dataclasses import replace
        from hackertube_core.catalog import load_catalog
        from hackertube_core.catalog_store import document
        def remove(conn):
            row = conn.execute("SELECT document FROM retrieved_catalog WHERE key='catalog'").fetchone()
            if row:
                catalog = load_catalog(json.loads(row[0]))
                items = tuple(replace(x, capture_order=i) for i,x in enumerate((x for x in catalog.items if x.item_id not in ids),1))
                catalog = replace(catalog, items=items, evidence=tuple(x for x in catalog.evidence if x.item_id not in ids))
                conn.execute("UPDATE retrieved_catalog SET document=? WHERE key='catalog'", (json.dumps(document(catalog)),))
            for job_id, raw in conn.execute("SELECT job_id,document FROM search_result").fetchall():
                value = json.loads(raw)
                if any(x.get("item_id") in ids for x in value.get("results", [])):
                    value = self._expired_result(value, "Earlier YouTube metadata was superseded or is unavailable. Start a new Search for current results.")
                    conn.execute("UPDATE search_result SET document=? WHERE job_id=?", (json.dumps(value),job_id))
        self._write_result(remove)

    @staticmethod
    def _expired_result(value, note):
        retained = {key:value[key] for key in ("schema", "job", "question", "provider", "usage", "request_counts", "disclosure") if key in value}
        retained.update(results=[], sections={}, sources=[], retention_expired=True,
            coverage={"verified":0, "notes":[note], "limit_reached":False})
        return retained

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

    def remove_interest(self, text):
        try:
            cleaned = Interest(text).text
        except RecordError:
            _fail("interest")
        return self._write(lambda conn: conn.execute("DELETE FROM interests WHERE text = ?", (cleaned,)))

    def source_settings(self):
        """Stored source choices. A source with no row uses its default."""
        conn = self._connect()
        try:
            return {
                row["source_id"]: bool(row["enabled"])
                for row in conn.execute("SELECT source_id, enabled FROM source_setting")
            }
        finally:
            conn.close()

    def set_source_enabled(self, source_id, enabled, updated_at=None):
        """Persist one source choice. The caller checks the source is supported."""
        _source_id(source_id)
        if type(enabled) is not bool:
            _fail("enabled")
        stamp = _stamp(self.clock() if updated_at is None else updated_at)
        return self._write(lambda conn: self._set_source_enabled(conn, source_id, enabled, stamp))

    def record_source_result(self, source_id, *, ok, at=None, error=None):
        """Record one ingestion attempt. A success clears the current error."""
        _source_id(source_id)
        if type(ok) is not bool:
            _fail("ok")
        if ok and error is not None:
            _fail("error")
        if not ok and not (isinstance(error, str) and error.strip()):
            _fail("error")
        stamp = _stamp(self.clock() if at is None else at)
        return self._write(lambda conn: self._record_source_result(conn, source_id, ok, stamp, error))

    def source_statuses(self):
        conn = self._connect()
        try:
            return {
                row["source_id"]: {
                    "last_attempt_at": row["last_attempt_at"],
                    "last_success_at": row["last_success_at"],
                    "last_error": row["last_error"],
                }
                for row in conn.execute(
                    "SELECT source_id, last_attempt_at, last_success_at, last_error FROM source_status"
                )
            }
        finally:
            conn.close()

    def record_job(self, job, *, unique=False):
        """Append one bounded job and return the id the store assigned.

        A job is a search or a refresh this profile ran. It is written
        through ``plugin_db`` like every other row here; this module never
        opens a database of its own.
        """
        fields = _job_fields(job)
        return self._write_result(lambda conn: self._insert_job(conn, fields, unique=unique))

    def latest_job(self):
        """The most recent job row, or ``None``. Reads the profile store only."""
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT * FROM search_job ORDER BY sequence DESC LIMIT 1"
            ).fetchone()
        finally:
            conn.close()
        return _job_dict(row) if row is not None else None

    def job(self, job_id):
        conn = self._connect()
        try:
            row = conn.execute("SELECT * FROM search_job WHERE job_id=?", (job_id,)).fetchone()
            return _job_dict(row) if row else None
        finally:
            conn.close()

    def job_result(self, job_id):
        def read(conn):
            row = conn.execute("SELECT document FROM search_result WHERE job_id=?", (job_id,)).fetchone()
            return json.loads(row[0]) if row else None
        return self._write_result(read)

    def _purge_metadata(self, conn):
        """One local retention boundary for catalog and duplicated job payloads.

        Runs at store opening and transactional access; makes no remote call.
        Library flags and truthful job accounting are independent of metadata.
        """
        from hackertube_core.catalog import load_catalog
        from hackertube_core.catalog_store import document, without_expired

        now = self.clock()
        row = conn.execute("SELECT document FROM retrieved_catalog WHERE key='catalog'").fetchone()
        if row:
            catalog = load_catalog(json.loads(row[0]))
            active = without_expired(catalog, now)
            if active != catalog:
                conn.execute("UPDATE retrieved_catalog SET document=? WHERE key='catalog'", (json.dumps(document(active)),))
        cutoff = (datetime.fromisoformat(now.replace("Z", "+00:00")) - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
        rows = conn.execute("SELECT r.job_id,r.document,j.created_at FROM search_result r JOIN search_job j ON j.job_id=r.job_id WHERE j.ended_at IS NOT NULL").fetchall()
        for job_id, raw, created_at in rows:
            value = json.loads(raw)
            if value.get("retention_expired"):
                continue
            # A later search cannot reset the age of copied source metadata.
            stamps = [created_at]
            for result in value.get("results", []):
                stamp = result.get("metadata_retrieved_at") or (result.get("source") or {}).get("retrieved_at")
                if stamp:
                    stamps.append(canon_time(stamp))
            if min(stamps) > cutoff:
                continue
            retained = self._expired_result(value, "Stored Search results expired after 30 days. Start a new explicit Search for current metadata.")
            conn.execute("UPDATE search_result SET document=? WHERE job_id=?", (json.dumps(retained), job_id))

    def update_job(self, job_id, job, result=None):
        fields = _job_fields(job)
        allowed = ("queued", "running", "cancelling") if fields["state"] in {"cancelled", "interrupted"} else ("queued", "running")
        def update(conn):
            row = conn.execute("SELECT state FROM search_job WHERE job_id=?", (job_id,)).fetchone()
            if not row or row[0] not in allowed:
                return False
            values = dict(fields)
            values["limits"] = json.dumps(values["limits"])
            values["coverage"] = json.dumps(values["coverage"])
            conn.execute("UPDATE search_job SET " + ",".join(k + "=?" for k in values) + " WHERE job_id=?", (*values.values(), job_id))
            if result is not None:
                conn.execute("INSERT INTO search_result VALUES (?,?) ON CONFLICT(job_id) DO UPDATE SET document=excluded.document", (job_id, json.dumps(result)))
            return True
        return self._write_result(update)

    def cancel_job(self, job_id):
        def cancel(conn):
            conn.execute("UPDATE search_job SET state='cancelling' WHERE job_id=? AND state IN ('queued','running')", (job_id,))
        self._write_result(cancel)
        return self.job(job_id)

    def recover_jobs(self):
        def recover(conn):
            conn.execute("UPDATE search_job SET state='interrupted', ended_at=?, cost_usd=NULL, cost_known=0, coverage=? WHERE state IN ('queued','running','cancelling')", (utc_now(), json.dumps(["Search was interrupted. It will not resume automatically."])))
        self._write_result(recover)

    def job_count(self):
        conn = self._connect()
        try:
            return conn.execute("SELECT COUNT(*) FROM search_job").fetchone()[0]
        finally:
            conn.close()

    def _write_result(self, mutate):
        """Run one write and return its own value. Used where a caller needs
        the assigned key rather than the profile snapshot."""
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            self._purge_metadata(conn)
            result = mutate(conn)
            conn.commit()
            return result
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _insert_job(self, conn, fields, *, unique=False):
        sequence = conn.execute(
            "SELECT COALESCE(MAX(sequence), 0) + 1 FROM search_job"
        ).fetchone()[0]
        job_id = f"job:{sequence}" + (":" + uuid.uuid4().hex if unique else "")
        conn.execute(
            "INSERT INTO search_job(job_id, sequence, kind, state, question, provider, "
            "limits, requests_used, result_count, cost_usd, cost_known, coverage, "
            "created_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                job_id,
                sequence,
                fields["kind"],
                fields["state"],
                fields["question"],
                fields["provider"],
                json.dumps(fields["limits"]),
                fields["requests_used"],
                fields["result_count"],
                fields["cost_usd"],
                1 if fields["cost_known"] else 0,
                json.dumps(fields["coverage"]),
                fields["created_at"],
                fields["ended_at"],
            ),
        )
        return job_id

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

    def _set_source_enabled(self, conn, source_id, enabled, stamp):
        conn.execute(
            "INSERT INTO source_setting(source_id, enabled, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(source_id) DO UPDATE SET "
            "enabled = excluded.enabled, updated_at = excluded.updated_at",
            (source_id, 1 if enabled else 0, stamp),
        )

    def _record_source_result(self, conn, source_id, ok, stamp, error):
        conn.execute(
            "INSERT INTO source_status(source_id, last_attempt_at, last_success_at, last_error) "
            "VALUES (?, ?, ?, ?) "
            "ON CONFLICT(source_id) DO UPDATE SET "
            "last_attempt_at = excluded.last_attempt_at, "
            "last_success_at = COALESCE(excluded.last_success_at, source_status.last_success_at), "
            "last_error = excluded.last_error",
            (source_id, stamp, stamp if ok else None, None if ok else error),
        )

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


def _job_fields(job):
    """Validate one job row and return the fields the insert binds.

    A bad job is refused with a short code rather than written partly.
    """
    if not isinstance(job, dict):
        _fail("job")
    kind = job.get("kind")
    state = job.get("state")
    question = job.get("question")
    provider = job.get("provider")
    limits = job.get("limits")
    coverage = job.get("coverage")
    if kind != "search":
        _fail("kind")
    if state not in JOB_STATES:
        _fail("state")
    if not isinstance(question, str) or not question.strip() or len(question) > JOB_QUESTION_MAX:
        _fail("question")
    if not isinstance(provider, str) or not provider.strip():
        _fail("provider")
    if not isinstance(limits, dict) or set(limits) != {"max_hits", "max_requests", "deadline_seconds"}:
        _fail("limits")
    requests_used = job.get("requests_used")
    result_count = job.get("result_count")
    for value in (requests_used, result_count):
        if type(value) is not int or value < 0:
            _fail("counts")
    cost_usd = job.get("cost_usd")
    if cost_usd is not None and (isinstance(cost_usd, bool) or not isinstance(cost_usd, (int, float)) or cost_usd < 0):
        _fail("cost")
    cost_known = job.get("cost_known")
    if type(cost_known) is not bool or cost_known != (cost_usd is not None):
        _fail("cost")
    if not isinstance(coverage, (list, tuple)) or any(not isinstance(note, str) for note in coverage):
        _fail("coverage")
    ended_at = job.get("ended_at")
    return {
        "kind": kind,
        "state": state,
        "question": question.strip(),
        "provider": provider.strip(),
        "limits": limits,
        "requests_used": requests_used,
        "result_count": result_count,
        "cost_usd": None if cost_usd is None else float(cost_usd),
        "cost_known": cost_known,
        "coverage": list(coverage),
        "created_at": _stamp(job.get("created_at")),
        "ended_at": None if ended_at is None else _stamp(ended_at),
    }


def _job_dict(row):
    return {
        "job_id": row["job_id"],
        "sequence": row["sequence"],
        "kind": row["kind"],
        "state": row["state"],
        "question": row["question"],
        "provider": row["provider"],
        "limits": json.loads(row["limits"]),
        "requests_used": row["requests_used"],
        "result_count": row["result_count"],
        "cost_usd": row["cost_usd"],
        "cost_known": bool(row["cost_known"]),
        "coverage": json.loads(row["coverage"]),
        "created_at": row["created_at"],
        "ended_at": row["ended_at"],
    }


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
            if "remove" in body and not isinstance(body["remove"], bool):
                return 400, {"error": "remove"}
            if body.get("remove") is True:
                store.remove_interest(body.get("text"))
            else:
                store.add_interest(body.get("text"))
        else:
            return 404, {"error": "action"}
    except ProfileError as exc:
        return 400, {"error": str(exc)}
    return 200, store.snapshot()
