"""The database: saved answers, viewer confirmations, and money spent.

A single SQLite file. Only the service's own Linux user can read or write it.
It never stores IP addresses or install IDs, only one-way codes made from them
(see http_api.py), which are enough to tell "same viewer" from "different".
"""
import json
import sqlite3
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS results (
    video_id        TEXT NOT NULL,
    transcript_hash TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('working', 'done', 'failed')),
    parts           TEXT NOT NULL DEFAULT '[]',  -- JSON list of {start, end, brand}
    held            INTEGER NOT NULL DEFAULT 0,  -- 1 = looks suspicious: never shared
    note            TEXT NOT NULL DEFAULT '',
    cost_usd        REAL NOT NULL DEFAULT 0,
    created_at      REAL NOT NULL,
    updated_at      REAL NOT NULL,
    PRIMARY KEY (video_id, transcript_hash)
);
CREATE TABLE IF NOT EXISTS votes (
    video_id        TEXT NOT NULL,
    transcript_hash TEXT NOT NULL,
    install_code    TEXT NOT NULL,
    network_code    TEXT NOT NULL,
    created_at      REAL NOT NULL,
    PRIMARY KEY (video_id, transcript_hash, install_code)
);
CREATE TABLE IF NOT EXISTS ai_runs (
    video_id TEXT NOT NULL,
    day      TEXT NOT NULL,
    runs     INTEGER NOT NULL,
    PRIMARY KEY (video_id, day)
);
CREATE TABLE IF NOT EXISTS spending (
    day  TEXT PRIMARY KEY,
    usd  REAL NOT NULL,
    runs INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS switches (
    name  TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

# Once an answer has this many confirmations, more add nothing; stop storing them.
MAX_VOTES_PER_ANSWER = 50


@dataclass(frozen=True)
class SavedResult:
    video_id: str
    transcript_hash: str
    status: str
    parts: list
    held: bool
    updated_at: float


class Store:
    def __init__(self, path, now=time.time):
        self._now = now
        self._lock = threading.Lock()
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.row_factory = sqlite3.Row
        with self._lock:
            self._db.execute("PRAGMA journal_mode=WAL")
            self._db.executescript(SCHEMA)

    def close(self):
        with self._lock:
            self._db.close()

    def _today(self):
        return datetime.fromtimestamp(self._now(), timezone.utc).strftime("%Y-%m-%d")

    def _run(self, sql, args=()):
        with self._lock:
            return self._db.execute(sql, args).fetchall()

    @staticmethod
    def _result(row):
        return SavedResult(video_id=row["video_id"], transcript_hash=row["transcript_hash"], status=row["status"],
                           parts=json.loads(row["parts"]), held=bool(row["held"]), updated_at=row["updated_at"])

    # --- answers -------------------------------------------------------------

    def result_for(self, video_id, transcript_hash):
        rows = self._run("SELECT * FROM results WHERE video_id = ? AND transcript_hash = ?", (video_id, transcript_hash))
        return self._result(rows[0]) if rows else None

    def shared_result(self, video_id, confirmations_needed):
        """The answer everyone may see: confirmed by enough different viewers.

        If several transcripts for one video are confirmed (for example after
        someone tried to plant a fake one), the one confirmed from the most
        different networks wins.
        """
        rows = self._run(
            """
            SELECT r.*, COUNT(DISTINCT v.install_code) AS installs, COUNT(DISTINCT v.network_code) AS networks
            FROM results r JOIN votes v ON v.video_id = r.video_id AND v.transcript_hash = r.transcript_hash
            WHERE r.video_id = ? AND r.status = 'done' AND r.held = 0
            GROUP BY r.transcript_hash
            HAVING installs >= ? AND networks >= ?
            ORDER BY networks DESC, r.updated_at DESC
            LIMIT 1
            """,
            (video_id, confirmations_needed, confirmations_needed))
        return self._result(rows[0]) if rows else None

    def start_job(self, video_id, transcript_hash):
        """Marks an AI check as running. False if one already exists for this transcript."""
        now = self._now()
        with self._lock:
            cursor = self._db.execute(
                """
                INSERT INTO results (video_id, transcript_hash, status, created_at, updated_at)
                VALUES (?, ?, 'working', ?, ?)
                ON CONFLICT (video_id, transcript_hash) DO UPDATE
                    SET status = 'working', note = '', updated_at = excluded.updated_at
                    WHERE results.status = 'failed'
                """,
                (video_id, transcript_hash, now, now))
            return cursor.rowcount == 1

    def finish_job(self, video_id, transcript_hash, parts, held, note, cost_usd):
        self._run(
            """
            UPDATE results SET status = 'done', parts = ?, held = ?, note = ?, cost_usd = cost_usd + ?, updated_at = ?
            WHERE video_id = ? AND transcript_hash = ?
            """,
            (json.dumps(parts), int(held), note[:300], cost_usd, self._now(), video_id, transcript_hash))

    def fail_job(self, video_id, transcript_hash, note, cost_usd):
        self._run(
            """
            UPDATE results SET status = 'failed', note = ?, cost_usd = cost_usd + ?, updated_at = ?
            WHERE video_id = ? AND transcript_hash = ?
            """,
            (note[:300], cost_usd, self._now(), video_id, transcript_hash))

    def forget_unfinished_jobs(self):
        """At start-up: jobs that were running when the server stopped will never finish."""
        self._run("UPDATE results SET status = 'failed', note = 'server restarted' WHERE status = 'working'")

    # --- confirmations -------------------------------------------------------

    def add_vote(self, video_id, transcript_hash, install_code, network_code):
        with self._lock:
            (count,) = self._db.execute(
                "SELECT COUNT(*) FROM votes WHERE video_id = ? AND transcript_hash = ?",
                (video_id, transcript_hash)).fetchone()
            if count >= MAX_VOTES_PER_ANSWER:
                return
            self._db.execute(
                "INSERT OR IGNORE INTO votes VALUES (?, ?, ?, ?, ?)",
                (video_id, transcript_hash, install_code, network_code, self._now()))

    # --- money and limits ----------------------------------------------------

    def ai_runs_today(self, video_id):
        rows = self._run("SELECT runs FROM ai_runs WHERE video_id = ? AND day = ?", (video_id, self._today()))
        return rows[0]["runs"] if rows else 0

    def count_ai_run(self, video_id):
        self._run(
            """
            INSERT INTO ai_runs VALUES (?, ?, 1)
            ON CONFLICT (video_id, day) DO UPDATE SET runs = runs + 1
            """,
            (video_id, self._today()))

    def spent_today(self):
        rows = self._run("SELECT usd FROM spending WHERE day = ?", (self._today(),))
        return rows[0]["usd"] if rows else 0.0

    def add_spending(self, usd):
        self._run(
            """
            INSERT INTO spending VALUES (?, ?, 1)
            ON CONFLICT (day) DO UPDATE SET usd = usd + excluded.usd, runs = runs + 1
            """,
            (self._today(), usd))

    # --- admin ---------------------------------------------------------------

    def ai_enabled(self):
        rows = self._run("SELECT value FROM switches WHERE name = 'ai_enabled'")
        return not rows or rows[0]["value"] != "off"

    def set_ai_enabled(self, enabled):
        self._run("INSERT OR REPLACE INTO switches VALUES ('ai_enabled', ?)", ("on" if enabled else "off",))

    def forget_video(self, video_id):
        """Deletes every saved answer and confirmation for one video."""
        with self._lock:
            self._db.execute("DELETE FROM results WHERE video_id = ?", (video_id,))
            self._db.execute("DELETE FROM votes WHERE video_id = ?", (video_id,))

    def summary(self):
        rows = self._run(
            """
            SELECT status, held, COUNT(*) AS answers FROM results GROUP BY status, held ORDER BY status, held
            """)
        days = self._run("SELECT * FROM spending ORDER BY day DESC LIMIT 7")
        return {
            "answers": [dict(row) for row in rows],
            "spending_last_7_days": [dict(row) for row in days],
            "ai_enabled": self.ai_enabled(),
        }
