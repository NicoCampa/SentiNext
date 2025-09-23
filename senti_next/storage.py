"""Simple SQLite storage for persisted Steam reviews."""
from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Dict, Iterable, List, Optional


_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "senti_next.db"


def _get_connection() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS reviews (
                review_id TEXT PRIMARY KEY,
                app_id INTEGER NOT NULL,
                data TEXT NOT NULL,
                timestamp_created INTEGER,
                timestamp_updated INTEGER
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_reviews_app_id_created
            ON reviews (app_id, timestamp_created DESC)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS review_labels (
                review_id TEXT PRIMARY KEY,
                app_id INTEGER NOT NULL,
                model TEXT NOT NULL,
                prompt_version TEXT NOT NULL,
                review_hash TEXT NOT NULL,
                payload TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_review_labels_app
            ON review_labels (app_id)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS classification_progress (
                app_id INTEGER PRIMARY KEY,
                total INTEGER NOT NULL,
                processed INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )
        conn.commit()


def upsert_reviews(app_id: int, reviews: Iterable[dict]) -> int:
    """Insert or update the provided reviews. Returns number of upserts."""
    rows = list(reviews)
    if not rows:
        return 0

    with _get_connection() as conn:
        cursor = conn.cursor()
        for review in rows:
            review_id = str(review.get("recommendationid"))
            if not review_id:
                continue
            payload = json.dumps(review)
            timestamp_created = review.get("timestamp_created")
            timestamp_updated = review.get("timestamp_updated")
            cursor.execute(
                """
                INSERT INTO reviews (review_id, app_id, data, timestamp_created, timestamp_updated)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(review_id) DO UPDATE SET
                    data = excluded.data,
                    timestamp_updated = excluded.timestamp_updated
                """,
                (review_id, app_id, payload, timestamp_created, timestamp_updated),
            )
        conn.commit()
        return cursor.rowcount or 0


def load_reviews(app_id: int, limit: Optional[int] = None) -> List[dict]:
    query = "SELECT data FROM reviews WHERE app_id = ? ORDER BY timestamp_created DESC"
    params: list = [app_id]
    if limit is not None:
        query += " LIMIT ?"
        params.append(limit)

    with _get_connection() as conn:
        rows = conn.execute(query, params).fetchall()

    return [json.loads(row["data"]) for row in rows]


def count_reviews(app_id: int) -> int:
    with _get_connection() as conn:
        result = conn.execute("SELECT COUNT(*) FROM reviews WHERE app_id = ?", (app_id,)).fetchone()
    return int(result[0]) if result else 0


def upsert_review_label(
    app_id: int,
    review_id: str,
    review_hash: str,
    payload: Dict,
    model: str,
    prompt_version: str,
) -> None:
    serialized = json.dumps(payload, separators=(",", ":"))
    timestamp = int(time.time())
    with _get_connection() as conn:
        conn.execute(
            """
            INSERT INTO review_labels (review_id, app_id, model, prompt_version, review_hash, payload, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(review_id) DO UPDATE SET
                model = excluded.model,
                prompt_version = excluded.prompt_version,
                review_hash = excluded.review_hash,
                payload = excluded.payload,
                updated_at = excluded.updated_at
            """,
            (review_id, app_id, model, prompt_version, review_hash, serialized, timestamp),
        )
        conn.commit()


def load_review_labels(app_id: int) -> Dict[str, Dict]:
    with _get_connection() as conn:
        rows = conn.execute(
            """
            SELECT review_id, model, prompt_version, review_hash, payload
            FROM review_labels
            WHERE app_id = ?
            """,
            (app_id,),
        ).fetchall()

    labels: Dict[str, Dict] = {}
    for row in rows:
        try:
            payload = json.loads(row["payload"]) if row["payload"] else {}
        except json.JSONDecodeError:
            payload = {}
        labels[row["review_id"]] = {
            "model": row["model"],
            "prompt_version": row["prompt_version"],
            "review_hash": row["review_hash"],
            "payload": payload,
        }
    return labels


def reset_progress(app_id: int, total: int) -> None:
    timestamp = int(time.time())
    with _get_connection() as conn:
        conn.execute(
            """
            INSERT INTO classification_progress (app_id, total, processed, updated_at)
            VALUES (?, ?, 0, ?)
            ON CONFLICT(app_id) DO UPDATE SET
                total = excluded.total,
                processed = excluded.processed,
                updated_at = excluded.updated_at
            """,
            (app_id, int(total), timestamp),
        )
        conn.commit()


def update_progress(app_id: int, processed: int, total: Optional[int] = None) -> None:
    timestamp = int(time.time())
    query = """
        UPDATE classification_progress
        SET processed = ?,
            updated_at = ?,
            total = COALESCE(?, total)
        WHERE app_id = ?
    """
    new_total = int(total) if total is not None else None
    with _get_connection() as conn:
        conn.execute(query, (int(processed), timestamp, new_total, app_id))
        conn.commit()


def clear_progress(app_id: int) -> None:
    with _get_connection() as conn:
        conn.execute("DELETE FROM classification_progress WHERE app_id = ?", (app_id,))
        conn.commit()


def load_progress(app_id: int) -> Optional[Dict[str, int]]:
    with _get_connection() as conn:
        row = conn.execute(
            "SELECT total, processed, updated_at FROM classification_progress WHERE app_id = ?",
            (app_id,),
        ).fetchone()

    if row is None:
        return None

    return {
        "total": int(row["total"] or 0),
        "processed": int(row["processed"] or 0),
        "updated_at": int(row["updated_at"] or 0),
    }
