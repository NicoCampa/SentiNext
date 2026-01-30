"""Simple SQLite storage for persisted Steam reviews."""
from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

from platformdirs import user_data_dir


def _render_disk_root() -> Path | None:
    candidate = Path("/var/data")
    if candidate.is_dir() and os.access(candidate, os.W_OK):
        return candidate
    return None


def _default_db_path() -> Path:
    """Resolve a stable path for the SQLite database."""
    env_path = os.getenv("SENTINEXT_DB_PATH")
    if env_path:
        return Path(env_path).expanduser()

    render_root = _render_disk_root()
    if render_root:
        return render_root / "senti_next.db"

    # Default to per-user application data so packaged desktop builds work cleanly.
    # Examples:
    # - macOS: ~/Library/Application Support/SentiNext/senti_next.db
    # - Windows: %APPDATA%\\SentiNext\\senti_next.db
    # - Linux: ~/.local/share/SentiNext/senti_next.db
    data_root = Path(user_data_dir(appname="SentiNext", appauthor=False))
    return data_root / "senti_next.db"


_DB_PATH = _default_db_path()
_FTS_ENABLED = True

def db_path() -> Path:
    return _DB_PATH


def _get_connection() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    global _FTS_ENABLED
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
        # Optional: full-text search index over review text for chat retrieval.
        try:
            desired_definition = (
                "CREATE VIRTUAL TABLE IF NOT EXISTS reviews_fts USING fts5("
                "review_id UNINDEXED, "
                "app_id UNINDEXED, "
                "language UNINDEXED, "
                "review_text, "
                "tokenize='porter'"
                ")"
            )
            fallback_definition = (
                "CREATE VIRTUAL TABLE IF NOT EXISTS reviews_fts USING fts5("
                "review_id UNINDEXED, "
                "app_id UNINDEXED, "
                "language UNINDEXED, "
                "review_text"
                ")"
            )

            try:
                existing = conn.execute(
                    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'reviews_fts'"
                ).fetchone()
            except sqlite3.OperationalError:
                existing = None

            def _supports_porter() -> bool:
                try:
                    conn.execute("DROP TABLE IF EXISTS _sentinext_fts_probe")
                    conn.execute("CREATE VIRTUAL TABLE _sentinext_fts_probe USING fts5(x, tokenize='porter')")
                    conn.execute("DROP TABLE IF EXISTS _sentinext_fts_probe")
                    return True
                except sqlite3.OperationalError:
                    try:
                        conn.execute("DROP TABLE IF EXISTS _sentinext_fts_probe")
                    except sqlite3.OperationalError:
                        pass
                    return False

            should_create = True
            porter_supported: Optional[bool] = None

            if existing is not None and existing["sql"]:
                existing_sql = (
                    str(existing["sql"])
                    .lower()
                    .replace(" ", "")
                    .replace("\n", "")
                    .replace("\t", "")
                    .replace("\r", "")
                )
                has_porter = "tokenize='porter'" in existing_sql or 'tokenize="porter"' in existing_sql
                if not has_porter:
                    porter_supported = _supports_porter()
                    if porter_supported:
                        conn.execute("DROP TABLE IF EXISTS reviews_fts")
                    else:
                        # Keep the existing FTS table (still better than disabling retrieval).
                        should_create = False

            if should_create:
                if porter_supported is None:
                    porter_supported = _supports_porter()
                conn.execute(desired_definition if porter_supported else fallback_definition)

            _FTS_ENABLED = True
        except sqlite3.OperationalError:
            _FTS_ENABLED = False
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
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS starred_games (
                app_id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                metadata TEXT NOT NULL,
                insights TEXT,
                sample TEXT,
                genres TEXT,
                categories TEXT,
                updated_at INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS analysis_results (
                app_id INTEGER PRIMARY KEY,
                metadata TEXT,
                insights TEXT,
                reviews TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                error TEXT,
                updated_at INTEGER NOT NULL,
                run_id TEXT,
                snapshot_hash TEXT,
                stale INTEGER DEFAULT 0,
                context_hash TEXT,
                stale_reason TEXT
            )
            """
        )
        # Backfill new columns if table existed
        for col in ["context_hash", "stale_reason"]:
            try:
                conn.execute(f"ALTER TABLE analysis_results ADD COLUMN {col} TEXT")
            except sqlite3.OperationalError:
                pass
        for col in ["run_id", "snapshot_hash", "stale"]:
            try:
                conn.execute(f"ALTER TABLE analysis_results ADD COLUMN {col} TEXT")
            except sqlite3.OperationalError:
                pass
        conn.commit()


def upsert_reviews(app_id: int, reviews: Iterable[dict]) -> int:
    """Insert or update the provided reviews. Returns number of upserts."""
    rows = list(reviews)
    if not rows:
        return 0

    with _get_connection() as conn:
        cursor = conn.cursor()
        fts_enabled = _FTS_ENABLED
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
            if fts_enabled:
                try:
                    review_text = str(review.get("review") or "")
                    review_language = str(review.get("language") or "").strip().lower()
                    cursor.execute("DELETE FROM reviews_fts WHERE review_id = ?", (review_id,))
                    cursor.execute(
                        "INSERT INTO reviews_fts (review_id, app_id, language, review_text) VALUES (?, ?, ?, ?)",
                        (review_id, int(app_id), review_language, review_text),
                    )
                except sqlite3.OperationalError:
                    fts_enabled = False
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


def load_reviews_by_ids(app_id: int, review_ids: Sequence[str]) -> List[dict]:
    ids = [str(item) for item in review_ids if item]
    if not ids:
        return []

    result_map: Dict[str, dict] = {}
    chunk_size = 900  # keep well under SQLite variable limit
    with _get_connection() as conn:
        for start in range(0, len(ids), chunk_size):
            chunk = ids[start : start + chunk_size]
            placeholders = ",".join(["?"] * len(chunk))
            query = f"SELECT review_id, data FROM reviews WHERE app_id = ? AND review_id IN ({placeholders})"
            params: list = [int(app_id), *chunk]
            rows = conn.execute(query, params).fetchall()
            for row in rows:
                try:
                    result_map[row["review_id"]] = json.loads(row["data"]) if row["data"] else {}
                except json.JSONDecodeError:
                    continue

    # Preserve ranking/order of the input ids.
    return [result_map[item] for item in ids if item in result_map]


def _rebuild_reviews_fts(conn: sqlite3.Connection, app_id: int) -> None:
    """Rebuild the FTS index for one app id using the canonical reviews table."""
    rows = conn.execute("SELECT review_id, data FROM reviews WHERE app_id = ?", (int(app_id),)).fetchall()
    conn.execute("DELETE FROM reviews_fts WHERE app_id = ?", (int(app_id),))
    for row in rows:
        review_id = row["review_id"]
        try:
            payload = json.loads(row["data"]) if row["data"] else {}
        except json.JSONDecodeError:
            payload = {}
        review_text = str(payload.get("review") or "")
        review_language = str(payload.get("language") or "").strip().lower()
        conn.execute(
            "INSERT INTO reviews_fts (review_id, app_id, language, review_text) VALUES (?, ?, ?, ?)",
            (review_id, int(app_id), review_language, review_text),
        )


def search_review_ids(app_id: int, query: str, *, limit: int = 200, language: Optional[str] = None) -> List[str]:
    """Return review ids matching the full-text query, ranked by relevance (best first).

    If FTS5 is unavailable, returns an empty list so callers can fall back to other strategies.
    """
    raw = (query or "").strip()
    if not raw:
        return []

    with _get_connection() as conn:
        try:
            conn.execute("SELECT 1 FROM reviews_fts LIMIT 1").fetchone()
        except sqlite3.OperationalError:
            return []

        try:
            fts_count = int(
                conn.execute("SELECT COUNT(*) FROM reviews_fts WHERE app_id = ?", (int(app_id),)).fetchone()[0]
            )
            review_count = int(
                conn.execute("SELECT COUNT(*) FROM reviews WHERE app_id = ?", (int(app_id),)).fetchone()[0]
            )
            if review_count and fts_count != review_count:
                _rebuild_reviews_fts(conn, app_id)
                conn.commit()
        except sqlite3.OperationalError:
            return []

        lang = (language or "").strip().lower()
        try:
            if lang and lang != "all":
                rows = conn.execute(
                    """
                    SELECT review_id
                    FROM reviews_fts
                    WHERE app_id = ? AND language = ? AND reviews_fts MATCH ?
                    ORDER BY bm25(reviews_fts)
                    LIMIT ?
                    """,
                    (int(app_id), lang, raw, int(limit)),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT review_id
                    FROM reviews_fts
                    WHERE app_id = ? AND reviews_fts MATCH ?
                    ORDER BY bm25(reviews_fts)
                    LIMIT ?
                    """,
                    (int(app_id), raw, int(limit)),
                ).fetchall()
        except sqlite3.OperationalError:
            return []

    return [str(row["review_id"]) for row in rows if row["review_id"]]


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


def save_starred_game(
    app_id: int,
    name: str,
    metadata: Dict,
    insights: Optional[Dict],
    sample: Optional[list],
    genres: Optional[List[str]] = None,
    categories: Optional[List[str]] = None,
) -> None:
    payload_metadata = json.dumps(metadata)
    payload_insights = json.dumps(insights) if insights is not None else None
    payload_sample = json.dumps(sample) if sample is not None else None
    payload_genres = json.dumps(genres) if genres is not None else None
    payload_categories = json.dumps(categories) if categories is not None else None
    timestamp = int(time.time())
    with _get_connection() as conn:
        conn.execute(
            """
            INSERT INTO starred_games (app_id, name, metadata, insights, sample, genres, categories, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(app_id) DO UPDATE SET
                name = excluded.name,
                metadata = excluded.metadata,
                insights = excluded.insights,
                sample = excluded.sample,
                genres = excluded.genres,
                categories = excluded.categories,
                updated_at = excluded.updated_at
            """,
            (app_id, name, payload_metadata, payload_insights, payload_sample, payload_genres, payload_categories, timestamp),
        )
        conn.commit()


def delete_starred_game(app_id: int) -> None:
    with _get_connection() as conn:
        conn.execute("DELETE FROM starred_games WHERE app_id = ?", (app_id,))
        conn.commit()


def delete_all_game_data(app_id: int) -> None:
    """Delete all data associated with a game: reviews, labels, progress, and starred entry."""
    with _get_connection() as conn:
        conn.execute("DELETE FROM reviews WHERE app_id = ?", (app_id,))
        if _FTS_ENABLED:
            try:
                conn.execute("DELETE FROM reviews_fts WHERE app_id = ?", (int(app_id),))
            except sqlite3.OperationalError:
                pass
        conn.execute("DELETE FROM review_labels WHERE app_id = ?", (app_id,))
        conn.execute("DELETE FROM classification_progress WHERE app_id = ?", (app_id,))
        conn.execute("DELETE FROM starred_games WHERE app_id = ?", (app_id,))
        conn.commit()


def get_database_stats() -> Dict[str, Any]:
    """Get database statistics: counts of games, reviews, labels."""
    with _get_connection() as conn:
        # Count unique games across all tables
        games_count = conn.execute(
            """
            SELECT COUNT(DISTINCT app_id) FROM (
                SELECT app_id FROM reviews
                UNION
                SELECT app_id FROM starred_games
            )
            """
        ).fetchone()[0]

        # Count total reviews
        reviews_count = conn.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]

        # Count total labels
        labels_count = conn.execute("SELECT COUNT(*) FROM review_labels").fetchone()[0]

        # Count labels with new schema (has main_category field)
        new_schema_count = conn.execute(
            """
            SELECT COUNT(*) FROM review_labels
            WHERE json_extract(payload, '$.main_category') IS NOT NULL
            """
        ).fetchone()[0]

        # Count labels with old schema (missing category field)
        old_schema_count = labels_count - new_schema_count

        # Count starred games
        starred_count = conn.execute("SELECT COUNT(*) FROM starred_games").fetchone()[0]

        return {
            "games": games_count,
            "reviews": reviews_count,
            "labels": labels_count,
            "labels_new_schema": new_schema_count,
            "labels_old_schema": old_schema_count,
            "starred_games": starred_count,
        }


def clear_all_labels() -> int:
    """Delete all labels. Returns count of deleted labels."""
    with _get_connection() as conn:
        count = conn.execute("SELECT COUNT(*) FROM review_labels").fetchone()[0]
        conn.execute("DELETE FROM review_labels")
        conn.commit()
        return count


def clear_old_schema_labels() -> int:
    """Delete labels with old schema (missing main_category field). Returns count of deleted labels."""
    with _get_connection() as conn:
        # Delete labels where main_category field is NULL
        cursor = conn.execute(
            """
            DELETE FROM review_labels
            WHERE json_extract(payload, '$.main_category') IS NULL
            """
        )
        count = cursor.rowcount
        conn.commit()
        return count


def clear_entire_database() -> Dict[str, int]:
    """Clear all data from database. Returns counts of deleted records."""
    with _get_connection() as conn:
        reviews_count = conn.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]
        labels_count = conn.execute("SELECT COUNT(*) FROM review_labels").fetchone()[0]
        progress_count = conn.execute("SELECT COUNT(*) FROM classification_progress").fetchone()[0]
        starred_count = conn.execute("SELECT COUNT(*) FROM starred_games").fetchone()[0]
        analysis_count = conn.execute("SELECT COUNT(*) FROM analysis_results").fetchone()[0]

        conn.execute("DELETE FROM reviews")
        conn.execute("DELETE FROM review_labels")
        conn.execute("DELETE FROM classification_progress")
        conn.execute("DELETE FROM starred_games")
        conn.execute("DELETE FROM analysis_results")
        conn.commit()

        return {
            "reviews": reviews_count,
            "labels": labels_count,
            "progress": progress_count,
            "starred_games": starred_count,
            "analysis_results": analysis_count,
        }


def load_starred_games() -> list[Dict[str, Any]]:
    with _get_connection() as conn:
        rows = conn.execute(
            "SELECT app_id, name, metadata, insights, sample, genres, categories, updated_at FROM starred_games ORDER BY updated_at DESC"
        ).fetchall()

    results: list[Dict[str, Any]] = []
    for row in rows:
        try:
            metadata = json.loads(row["metadata"]) if row["metadata"] else {}
        except json.JSONDecodeError:
            metadata = {}
        try:
            insights = json.loads(row["insights"]) if row["insights"] else None
        except json.JSONDecodeError:
            insights = None
        try:
            sample = json.loads(row["sample"]) if row["sample"] else []
        except json.JSONDecodeError:
            sample = []
        try:
            genres = json.loads(row["genres"]) if row["genres"] else []
        except json.JSONDecodeError:
            genres = []
        try:
            categories = json.loads(row["categories"]) if row["categories"] else []
        except json.JSONDecodeError:
            categories = []

        results.append(
            {
                "app_id": int(row["app_id"]),
                "name": row["name"],
                "metadata": metadata,
                "insights": insights,
                "sample": sample,
                "genres": genres,
                "categories": categories,
                "updated_at": int(row["updated_at"] or 0),
            }
        )

    return results


def list_database_games() -> List[Dict[str, Any]]:
    with _get_connection() as conn:
        review_rows = conn.execute("SELECT DISTINCT app_id FROM reviews ORDER BY app_id").fetchall()
        starred_rows = conn.execute("SELECT app_id, name FROM starred_games").fetchall()

    name_map = {int(row["app_id"]): row["name"] for row in starred_rows if row["app_id"] is not None}
    return [{"app_id": int(row["app_id"]), "name": name_map.get(int(row["app_id"]))} for row in review_rows]


def load_database_reviews(
    limit: int,
    offset: int,
    app_id: Optional[int] = None,
    language: Optional[str] = None,
    query: Optional[str] = None,
) -> tuple[List[Dict[str, Any]], int]:
    limit = max(1, min(int(limit), 500))
    offset = max(0, int(offset))
    lang = (language or "").strip().lower()
    raw_query = (query or "").strip()

    with _get_connection() as conn:
        if raw_query:
            if not _FTS_ENABLED:
                return [], 0

            where_parts = ["reviews_fts MATCH ?"]
            params: list[Any] = [raw_query]
            if app_id:
                where_parts.append("reviews.app_id = ?")
                params.append(int(app_id))
            if lang and lang != "all":
                where_parts.append("reviews_fts.language = ?")
                params.append(lang)
            where_sql = " AND ".join(where_parts)

            total_query = f"""
                SELECT COUNT(*)
                FROM reviews
                JOIN reviews_fts ON reviews.review_id = reviews_fts.review_id
                WHERE {where_sql}
            """
            total = conn.execute(total_query, params).fetchone()[0]

            query_sql = f"""
                SELECT reviews.review_id, reviews.app_id, reviews.data, reviews.timestamp_created,
                       review_labels.payload AS label_payload
                FROM reviews
                JOIN reviews_fts ON reviews.review_id = reviews_fts.review_id
                LEFT JOIN review_labels
                  ON reviews.review_id = review_labels.review_id AND reviews.app_id = review_labels.app_id
                WHERE {where_sql}
                ORDER BY bm25(reviews_fts)
                LIMIT ? OFFSET ?
            """
            rows = conn.execute(query_sql, [*params, limit, offset]).fetchall()
        else:
            where_parts = []
            params = []
            if app_id:
                where_parts.append("reviews.app_id = ?")
                params.append(int(app_id))
            if lang and lang != "all":
                where_parts.append("json_extract(reviews.data, '$.language') = ?")
                params.append(lang)
            where_sql = " AND ".join(where_parts)
            where_clause = f"WHERE {where_sql}" if where_sql else ""

            total_query = f"SELECT COUNT(*) FROM reviews {where_clause}"
            total = conn.execute(total_query, params).fetchone()[0]

            query_sql = f"""
                SELECT reviews.review_id, reviews.app_id, reviews.data, reviews.timestamp_created,
                       review_labels.payload AS label_payload
                FROM reviews
                LEFT JOIN review_labels
                  ON reviews.review_id = review_labels.review_id AND reviews.app_id = review_labels.app_id
                {where_clause}
                ORDER BY reviews.timestamp_created DESC
                LIMIT ? OFFSET ?
            """
            rows = conn.execute(query_sql, [*params, limit, offset]).fetchall()

    items: List[Dict[str, Any]] = []
    for row in rows:
        items.append(
            {
                "review_id": row["review_id"],
                "app_id": row["app_id"],
                "data": row["data"],
                "timestamp_created": row["timestamp_created"],
                "label_payload": row["label_payload"],
            }
        )

    return items, int(total)


def save_analysis_result(
    app_id: int,
    metadata: Optional[Dict],
    insights: Optional[Dict],
    reviews: list,
    status: str,
    error: Optional[str] = None,
    run_id: Optional[str] = None,
    snapshot_hash: Optional[str] = None,
    stale: bool = False,
    context_hash: Optional[str] = None,
    stale_reason: Optional[str] = None,
) -> None:
    """Persist analysis output for async jobs."""
    payload_metadata = json.dumps(metadata) if metadata is not None else None
    payload_insights = json.dumps(insights) if insights is not None else None
    payload_reviews = json.dumps(reviews) if reviews is not None else None
    timestamp = int(time.time())
    with _get_connection() as conn:
        conn.execute(
            """
            INSERT INTO analysis_results (app_id, metadata, insights, reviews, status, error, updated_at, run_id, snapshot_hash, stale, context_hash, stale_reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(app_id) DO UPDATE SET
                metadata = excluded.metadata,
                insights = excluded.insights,
                reviews = excluded.reviews,
                status = excluded.status,
                error = excluded.error,
                run_id = excluded.run_id,
                snapshot_hash = excluded.snapshot_hash,
                stale = excluded.stale,
                context_hash = excluded.context_hash,
                stale_reason = excluded.stale_reason,
                updated_at = excluded.updated_at
            """,
            (app_id, payload_metadata, payload_insights, payload_reviews, status, error, timestamp, run_id, snapshot_hash, int(stale), context_hash, stale_reason),
        )
        conn.commit()


def load_analysis_result(app_id: int) -> Optional[Dict[str, Any]]:
    with _get_connection() as conn:
        row = conn.execute(
            """
            SELECT metadata, insights, reviews, status, error, updated_at, run_id, snapshot_hash, stale, context_hash, stale_reason
            FROM analysis_results
            WHERE app_id = ?
            """,
            (app_id,),
        ).fetchone()

    if row is None:
        return None

    try:
        metadata = json.loads(row["metadata"]) if row["metadata"] else None
    except json.JSONDecodeError:
        metadata = None
    try:
        insights = json.loads(row["insights"]) if row["insights"] else None
    except json.JSONDecodeError:
        insights = None
    try:
        reviews = json.loads(row["reviews"]) if row["reviews"] else []
    except json.JSONDecodeError:
        reviews = []

    return {
        "metadata": metadata,
        "insights": insights,
        "reviews": reviews,
        "status": row["status"],
        "error": row["error"],
        "updated_at": int(row["updated_at"] or 0),
        "run_id": row["run_id"],
        "snapshot_hash": row["snapshot_hash"],
        "stale": bool(row["stale"]),
        "context_hash": row["context_hash"],
        "stale_reason": row["stale_reason"],
    }
