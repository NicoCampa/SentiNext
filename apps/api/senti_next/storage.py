"""Database storage for persisted Steam reviews.

PostgreSQL-only backend using SQLAlchemy.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Iterable, List, Optional, Sequence

from sqlalchemy import text

from . import dialect as d

logger = logging.getLogger(__name__)



def _format_ts(val: Any) -> Optional[str]:
    """Format a timestamp value to ISO string.

    Handles both datetime objects (PostgreSQL) and strings (SQLite).
    """
    if val is None:
        return None
    if isinstance(val, str):
        return val
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _parse_json_field(val: Any, default: Any = None) -> Any:
    """Parse a JSON field (PostgreSQL JSONB returns dict/list directly)."""
    if val is None:
        return default
    if isinstance(val, (dict, list)):
        return val
    # Fallback for any string values
    if isinstance(val, str):
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            return default
    return default


def _timestamp_to_int(val: Any) -> Optional[int]:
    """Convert a timestamp value to integer (Unix timestamp)."""
    if val is None:
        return None
    if isinstance(val, int):
        return val
    if isinstance(val, datetime):
        return int(val.timestamp())
    # Try to parse string
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _get_timestamp() -> int:
    """Get current Unix timestamp."""
    return int(datetime.now(timezone.utc).timestamp())


_DEFAULT_USER_ID = "local"


def init_db() -> None:
    """Initialize database schema (PostgreSQL or SQLite)."""
    from . import db as db_module
    db_module.init_db()
    logger.info("Initialized database backend")


def log_llm_usage(
    *,
    operation: str,
    model: Optional[str],
    prompt_tokens: Optional[int],
    response_tokens: Optional[int],
    total_tokens: Optional[int],
    cached_tokens: Optional[int] = None,
    tool_use_prompt_tokens: Optional[int] = None,
    thoughts_tokens: Optional[int] = None,
    traffic_type: Optional[str] = None,
    app_id: Optional[int] = None,
    session_id: Optional[str] = None,
) -> None:
    """Persist LLM token usage metrics (best-effort)."""
    from . import db as db_module

    try:
        with db_module.get_connection() as conn:
            conn.execute(
                text("""
                    INSERT INTO llm_usage
                    (user_id, operation, model, prompt_tokens, response_tokens, total_tokens,
                     cached_tokens, tool_use_prompt_tokens, thoughts_tokens, traffic_type,
                     app_id, session_id, created_at)
                    VALUES (:user_id, :operation, :model, :prompt_tokens, :response_tokens, :total_tokens,
                            :cached_tokens, :tool_use_prompt_tokens, :thoughts_tokens, :traffic_type,
                            :app_id, :session_id, :created_at)
                """),
                {
                    "user_id": _DEFAULT_USER_ID,
                    "operation": operation,
                    "model": model,
                    "prompt_tokens": prompt_tokens,
                    "response_tokens": response_tokens,
                    "total_tokens": total_tokens,
                    "cached_tokens": cached_tokens,
                    "tool_use_prompt_tokens": tool_use_prompt_tokens,
                    "thoughts_tokens": thoughts_tokens,
                    "traffic_type": traffic_type,
                    "app_id": app_id,
                    "session_id": session_id,
                    "created_at": datetime.now(timezone.utc),
                },
            )
    except Exception as exc:  # best-effort logging
        logger.debug("Failed to log LLM usage: %s", exc)


def get_llm_usage_summary(
    *,
    days: int = 30,
    app_id: Optional[int] = None,
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Aggregate LLM usage metrics over a time window (admin use)."""
    from . import db as db_module

    safe_days = max(1, min(int(days or 30), 365))
    since = datetime.now(timezone.utc) - timedelta(days=safe_days)

    where_clause = """
        WHERE created_at >= :since
          AND user_id = :user_id
          AND (:app_id IS NULL OR app_id = :app_id)
          AND (:session_id IS NULL OR session_id = :session_id)
    """
    params = {
        "since": since,
        "user_id": _DEFAULT_USER_ID,
        "app_id": app_id,
        "session_id": session_id,
    }

    with db_module.get_connection() as conn:
        totals = conn.execute(
            text(f"""
                SELECT
                    COUNT(*) as calls,
                    COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
                    COALESCE(SUM(response_tokens), 0) as response_tokens,
                    COALESCE(SUM(total_tokens), 0) as total_tokens,
                    COALESCE(SUM(cached_tokens), 0) as cached_tokens,
                    COALESCE(SUM(tool_use_prompt_tokens), 0) as tool_use_prompt_tokens,
                    COALESCE(SUM(thoughts_tokens), 0) as thoughts_tokens
                FROM llm_usage
                {where_clause}
            """),
            params,
        ).mappings().fetchone()

        by_operation = conn.execute(
            text(f"""
                SELECT
                    operation,
                    COUNT(*) as calls,
                    COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
                    COALESCE(SUM(response_tokens), 0) as response_tokens,
                    COALESCE(SUM(total_tokens), 0) as total_tokens,
                    COALESCE(SUM(cached_tokens), 0) as cached_tokens,
                    COALESCE(SUM(tool_use_prompt_tokens), 0) as tool_use_prompt_tokens,
                    COALESCE(SUM(thoughts_tokens), 0) as thoughts_tokens
                FROM llm_usage
                {where_clause}
                GROUP BY operation
                ORDER BY calls DESC
            """),
            params,
        ).mappings().fetchall()

        by_model = conn.execute(
            text(f"""
                SELECT
                    model,
                    COUNT(*) as calls,
                    COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
                    COALESCE(SUM(response_tokens), 0) as response_tokens,
                    COALESCE(SUM(total_tokens), 0) as total_tokens,
                    COALESCE(SUM(cached_tokens), 0) as cached_tokens,
                    COALESCE(SUM(tool_use_prompt_tokens), 0) as tool_use_prompt_tokens,
                    COALESCE(SUM(thoughts_tokens), 0) as thoughts_tokens
                FROM llm_usage
                {where_clause}
                GROUP BY model
                ORDER BY calls DESC
            """),
            params,
        ).mappings().fetchall()

    return {
        "since": since.isoformat(),
        "days": safe_days,
        "total_calls": int(totals["calls"] or 0) if totals else 0,
        "prompt_tokens": int(totals["prompt_tokens"] or 0) if totals else 0,
        "response_tokens": int(totals["response_tokens"] or 0) if totals else 0,
        "total_tokens": int(totals["total_tokens"] or 0) if totals else 0,
        "cached_tokens": int(totals["cached_tokens"] or 0) if totals else 0,
        "tool_use_prompt_tokens": int(totals["tool_use_prompt_tokens"] or 0) if totals else 0,
        "thoughts_tokens": int(totals["thoughts_tokens"] or 0) if totals else 0,
        "by_operation": [dict(row) for row in by_operation],
        "by_model": [dict(row) for row in by_model],
    }


def upsert_reviews(app_id: int, reviews: Iterable[dict]) -> int:
    """Insert or update the provided reviews. Returns number of upserts."""
    rows = list(reviews)
    if not rows:
        return 0

    from . import db as db_module

    count = 0
    search_vector_updates: list[dict] = []

    with db_module.get_connection() as conn:
        for review in rows:
            review_id = str(review.get("recommendationid"))
            if not review_id:
                continue
            payload = json.dumps(review)
            timestamp_created = review.get("timestamp_created")
            timestamp_updated = review.get("timestamp_updated")

            conn.execute(
                text("""
                    INSERT INTO reviews (review_id, app_id, data, timestamp_created, timestamp_updated)
                    VALUES (:review_id, :app_id, :data, :timestamp_created, :timestamp_updated)
                    ON CONFLICT(review_id) DO UPDATE SET
                        data = EXCLUDED.data,
                        timestamp_updated = EXCLUDED.timestamp_updated
                """),
                {
                    "review_id": review_id,
                    "app_id": app_id,
                    "data": payload,
                    "timestamp_created": timestamp_created,
                    "timestamp_updated": timestamp_updated,
                },
            )
            count += 1

            review_text = str(review.get("review") or "")
            if review_text:
                search_vector_updates.append({"review_id": review_id, "review_text": review_text})

        # Bulk update search vectors after all inserts
        if search_vector_updates:
            if d.is_sqlite():
                for item in search_vector_updates:
                    conn.execute(
                        text("""
                            INSERT INTO reviews_fts(review_id, review_text)
                            VALUES (:review_id, :review_text)
                        """),
                        item,
                    )
            else:
                conn.execute(
                    text("""
                        UPDATE reviews
                        SET search_vector = to_tsvector('simple', batch.review_text)
                        FROM (SELECT unnest(:review_ids) AS review_id, unnest(:review_texts) AS review_text) AS batch
                        WHERE reviews.review_id = batch.review_id
                    """),
                    {
                        "review_ids": [item["review_id"] for item in search_vector_updates],
                        "review_texts": [item["review_text"] for item in search_vector_updates],
                    },
                )

    return count


def enforce_review_limit(app_id: int, max_reviews: int = 0) -> int:
    """Delete oldest reviews beyond the limit for a game.

    Keeps the most recent `max_reviews` reviews based on timestamp_created.
    Also deletes associated labels for removed reviews.
    Uses atomic CTE-based DELETEs to avoid races with concurrent inserts.

    When max_reviews is 0 (unlimited), no reviews are deleted.

    Returns number of reviews deleted.
    """
    if max_reviews == 0:
        return 0

    from . import db as db_module

    with db_module.get_connection() as conn:
        # Atomically delete labels for excess reviews
        conn.execute(
            text("""
                WITH excess AS (
                    SELECT review_id FROM reviews
                    WHERE app_id = :app_id
                    ORDER BY timestamp_created DESC
                    OFFSET :max_reviews
                )
                DELETE FROM review_labels WHERE review_id IN (SELECT review_id FROM excess)
            """),
            {"app_id": app_id, "max_reviews": max_reviews},
        )

        # Atomically delete excess reviews
        result = conn.execute(
            text("""
                WITH excess AS (
                    SELECT review_id FROM reviews
                    WHERE app_id = :app_id
                    ORDER BY timestamp_created DESC
                    OFFSET :max_reviews
                )
                DELETE FROM reviews WHERE review_id IN (SELECT review_id FROM excess)
            """),
            {"app_id": app_id, "max_reviews": max_reviews},
        )
        deleted_count = result.rowcount

        if deleted_count > 0:
            logger.info(f"Enforced review limit for app {app_id}: deleted {deleted_count} old reviews")

        return deleted_count


def load_reviews(app_id: int, limit: Optional[int] = None) -> List[dict]:
    """Load reviews for an app, ordered by creation time (newest first).

    Ensures timestamp_created is always present by using the database column as fallback.
    """
    from . import db as db_module

    query = "SELECT data, timestamp_created FROM reviews WHERE app_id = :app_id ORDER BY timestamp_created DESC"
    params = {"app_id": app_id}

    if limit is not None:
        query += " LIMIT :limit"
        params["limit"] = limit

    with db_module.get_connection() as conn:
        result = conn.execute(text(query), params)
        rows = result.fetchall()

    reviews = []
    for row in rows:
        review = _parse_json_field(row[0], {})
        # Ensure timestamp_created is set (fallback to database column)
        if not review.get("timestamp_created") and row[1] is not None:
            review["timestamp_created"] = int(row[1]) if isinstance(row[1], (int, float)) else row[1]
        reviews.append(review)
    return reviews


def load_reviews_by_ids(app_id: int, review_ids: Sequence[str]) -> List[dict]:
    """Load reviews by their IDs, preserving input order."""
    ids = [str(item) for item in review_ids if item]
    if not ids:
        return []

    from . import db as db_module

    result_map: Dict[str, dict] = {}
    chunk_size = 1000

    with db_module.get_connection() as conn:
        for start in range(0, len(ids), chunk_size):
            chunk = ids[start : start + chunk_size]
            arr_sql, params = d.any_array("review_ids", chunk, {"app_id": int(app_id)})
            result = conn.execute(
                text(f"""
                    SELECT review_id, data
                    FROM reviews
                    WHERE app_id = :app_id AND review_id {arr_sql}
                """),
                params,
            )
            rows = result.fetchall()
            for row in rows:
                try:
                    result_map[row[0]] = _parse_json_field(row[1], {}) if row[1] else {}
                except json.JSONDecodeError:
                    continue

    # Preserve ranking/order of the input ids
    return [result_map[item] for item in ids if item in result_map]


def search_review_ids(app_id: int, query: str, *, limit: int = 200, language: Optional[str] = None) -> List[str]:
    """Return review ids matching the full-text query using PostgreSQL full-text search.

    Uses PostgreSQL's tsvector and tsquery for full-text search with ranking.
    """
    raw = (query or "").strip()
    if not raw:
        return []

    from . import db as db_module

    lang = (language or "").strip().lower()

    fts_where = d.fts_match("reviews")
    fts_order = d.fts_rank("reviews")
    lang_col = d.json_extract("data", "language")

    with db_module.get_connection() as conn:
        if lang and lang != "all":
            result = conn.execute(
                text(f"""
                    SELECT review_id
                    FROM reviews
                    WHERE app_id = :app_id
                      AND {lang_col} = :language
                      AND {fts_where}
                    ORDER BY {fts_order} DESC
                    LIMIT :limit
                """),
                {"app_id": int(app_id), "language": lang, "query": raw, "limit": int(limit)},
            )
        else:
            result = conn.execute(
                text(f"""
                    SELECT review_id
                    FROM reviews
                    WHERE app_id = :app_id
                      AND {fts_where}
                    ORDER BY {fts_order} DESC
                    LIMIT :limit
                """),
                {"app_id": int(app_id), "query": raw, "limit": int(limit)},
            )

        rows = result.fetchall()

    return [str(row[0]) for row in rows if row[0]]


def get_reviews_fingerprint(app_id: int) -> Optional[str]:
    """Fast SQL-only fingerprint of current review IDs for an app.

    Returns an MD5 hash of the sorted review IDs, or None if no reviews exist.
    Used to detect when the review pool has changed (e.g. another user refreshed).
    """
    from . import db as db_module

    with db_module.get_connection() as conn:
        if d.is_sqlite():
            result = conn.execute(
                text("SELECT GROUP_CONCAT(review_id, ',') FROM (SELECT review_id FROM reviews WHERE app_id = :app_id ORDER BY review_id)"),
                {"app_id": app_id},
            )
            row = result.fetchone()
            if row and row[0]:
                import hashlib
                return hashlib.md5(row[0].encode()).hexdigest()
            return None
        else:
            result = conn.execute(
                text("""
                    SELECT md5(string_agg(review_id, ',' ORDER BY review_id))
                    FROM reviews WHERE app_id = :app_id
                """),
                {"app_id": app_id},
            )
            row = result.fetchone()
            return row[0] if row and row[0] else None


def count_reviews(app_id: int) -> int:
    """Count total reviews for an app."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("SELECT COUNT(*) FROM reviews WHERE app_id = :app_id"),
            {"app_id": app_id},
        )
        row = result.fetchone()
    return int(row[0]) if row else 0


def upsert_review_label(
    app_id: int,
    review_id: str,
    review_hash: str,
    payload: Dict,
    model: str,
    prompt_version: str,
) -> None:
    """Insert or update a review label."""
    from . import db as db_module

    serialized = json.dumps(payload, separators=(",", ":"))
    timestamp = datetime.now(timezone.utc)

    with db_module.get_connection() as conn:
        conn.execute(
            text("""
                INSERT INTO review_labels (review_id, app_id, model, prompt_version, review_hash, payload, updated_at)
                VALUES (:review_id, :app_id, :model, :prompt_version, :review_hash, :payload, :updated_at)
                ON CONFLICT(app_id, review_id) DO UPDATE SET
                    model = EXCLUDED.model,
                    prompt_version = EXCLUDED.prompt_version,
                    review_hash = EXCLUDED.review_hash,
                    payload = EXCLUDED.payload,
                    updated_at = EXCLUDED.updated_at
            """),
            {
                "review_id": review_id,
                "app_id": app_id,
                "model": model,
                "prompt_version": prompt_version,
                "review_hash": review_hash,
                "payload": serialized,
                "updated_at": timestamp,
            },
        )


def bulk_upsert_review_labels(items: List[Dict[str, Any]]) -> None:
    """Bulk insert or update review labels in a single transaction.

    Args:
        items: List of dicts with keys: app_id, review_id, review_hash,
               payload, model, prompt_version
    """
    if not items:
        return

    from . import db as db_module

    timestamp = datetime.now(timezone.utc)

    with db_module.get_connection() as conn:
        for item in items:
            serialized = json.dumps(item["payload"], separators=(",", ":"))
            conn.execute(
                text("""
                    INSERT INTO review_labels (review_id, app_id, model, prompt_version, review_hash, payload, updated_at)
                    VALUES (:review_id, :app_id, :model, :prompt_version, :review_hash, :payload, :updated_at)
                    ON CONFLICT(app_id, review_id) DO UPDATE SET
                        model = EXCLUDED.model,
                        prompt_version = EXCLUDED.prompt_version,
                        review_hash = EXCLUDED.review_hash,
                        payload = EXCLUDED.payload,
                        updated_at = EXCLUDED.updated_at
                """),
                {
                    "review_id": item["review_id"],
                    "app_id": item["app_id"],
                    "model": item["model"],
                    "prompt_version": item["prompt_version"],
                    "review_hash": item["review_hash"],
                    "payload": serialized,
                    "updated_at": timestamp,
                },
            )


def load_review_labels(app_id: int) -> Dict[str, Dict]:
    """Load all review labels for an app."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("""
                SELECT review_id, model, prompt_version, review_hash, payload
                FROM review_labels
                WHERE app_id = :app_id
            """),
            {"app_id": app_id},
        )
        rows = result.fetchall()

    labels: Dict[str, Dict] = {}
    for row in rows:
        labels[row[0]] = {
            "model": row[1],
            "prompt_version": row[2],
            "review_hash": row[3],
            "payload": _parse_json_field(row[4], {}),
        }
    return labels


def reset_progress(app_id: int, total: int, phase: str = "classifying") -> None:
    """Reset progress tracking for an app."""
    from . import db as db_module

    timestamp = datetime.now(timezone.utc)
    with db_module.get_connection() as conn:
        conn.execute(
            text("""
                INSERT INTO progress (user_id, app_id, total, processed, phase, fetched_count, updated_at)
                VALUES (:user_id, :app_id, :total, 0, :phase, 0, :updated_at)
                ON CONFLICT(user_id, app_id) DO UPDATE SET
                    total = EXCLUDED.total,
                    processed = EXCLUDED.processed,
                    phase = EXCLUDED.phase,
                    fetched_count = EXCLUDED.fetched_count,
                    updated_at = EXCLUDED.updated_at
            """),
            {"user_id": _DEFAULT_USER_ID, "app_id": app_id, "total": int(total), "phase": phase, "updated_at": timestamp},
        )


def update_fetch_progress(app_id: int, fetched_count: int) -> None:
    """Update fetch progress during Steam review fetching.

    Uses UPSERT to create/update the progress row with fetch count.
    """
    from . import db as db_module

    timestamp = datetime.now(timezone.utc)
    greatest_fetched = d.greatest("progress.fetched_count", "EXCLUDED.fetched_count")
    with db_module.get_connection() as conn:
        conn.execute(
            text(f"""
                INSERT INTO progress (user_id, app_id, total, processed, phase, fetched_count, updated_at)
                VALUES (:user_id, :app_id, 0, 0, 'fetching', :fetched_count, :updated_at)
                ON CONFLICT(user_id, app_id) DO UPDATE SET
                    fetched_count = {greatest_fetched},
                    phase = 'fetching',
                    updated_at = EXCLUDED.updated_at
            """),
            {
                "user_id": _DEFAULT_USER_ID,
                "app_id": app_id,
                "fetched_count": int(fetched_count),
                "updated_at": timestamp,
            },
        )


def update_progress(app_id: int, processed: int, total: Optional[int] = None) -> None:
    """Update progress for classification.

    Progress updates are monotonic - only increases are applied to prevent
    race conditions when multiple batches complete out of order.
    Uses UPSERT to handle cases where the progress row doesn't exist yet.
    """
    from . import db as db_module

    timestamp = datetime.now(timezone.utc)
    new_total = int(total) if total is not None else None
    processed_int = int(processed)

    greatest_processed = d.greatest("progress.processed", "EXCLUDED.processed")
    with db_module.get_connection() as conn:
        # Use UPSERT with GREATEST to ensure progress only increases (monotonic).
        # Preserve the current phase — don't overwrite phases like 'building_insights'
        # that were set by update_progress_phase().
        conn.execute(
            text(f"""
                INSERT INTO progress (user_id, app_id, total, processed, phase, updated_at)
                VALUES (:user_id, :app_id, COALESCE(:total, 0), :processed, 'classifying', :updated_at)
                ON CONFLICT(user_id, app_id) DO UPDATE SET
                    processed = {greatest_processed},
                    updated_at = EXCLUDED.updated_at,
                    total = COALESCE(EXCLUDED.total, progress.total)
            """),
            {
                "processed": processed_int,
                "updated_at": timestamp,
                "total": new_total,
                "user_id": _DEFAULT_USER_ID,
                "app_id": app_id,
            },
        )


def clear_progress(app_id: int) -> None:
    """Clear progress tracking for an app."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        conn.execute(
            text("DELETE FROM progress WHERE user_id = :user_id AND app_id = :app_id"),
            {"user_id": _DEFAULT_USER_ID, "app_id": app_id},
        )


def update_progress_phase(app_id: int, phase: str) -> None:
    """Update only the phase of progress tracking.

    Used to signal phase transitions like 'building_insights' without changing
    the processed/total counters.
    """
    from . import db as db_module

    timestamp = datetime.now(timezone.utc)
    with db_module.get_connection() as conn:
        conn.execute(
            text("""
                UPDATE progress
                SET phase = :phase, updated_at = :updated_at
                WHERE user_id = :user_id AND app_id = :app_id
            """),
            {"phase": phase, "updated_at": timestamp, "user_id": _DEFAULT_USER_ID, "app_id": app_id},
        )


def cancel_progress(app_id: int) -> bool:
    """Mark a progress entry as cancelled. Returns True if there was an active job to cancel."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("""
                UPDATE progress
                SET cancelled = TRUE, updated_at = :updated_at
                WHERE user_id = :user_id AND app_id = :app_id
                RETURNING id
            """),
            {"user_id": _DEFAULT_USER_ID, "app_id": app_id, "updated_at": datetime.now(timezone.utc)},
        )
        row = result.fetchone()
        return row is not None


def is_cancelled(app_id: int) -> bool:
    """Check if a job has been cancelled."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("SELECT cancelled FROM progress WHERE user_id = :user_id AND app_id = :app_id"),
            {"user_id": _DEFAULT_USER_ID, "app_id": app_id},
        )
        row = result.fetchone()

    if row is None:
        return False
    return bool(row[0])


def load_progress(app_id: int) -> Optional[Dict[str, Any]]:
    """Load progress tracking for an app."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("SELECT total, processed, updated_at, phase, fetched_count FROM progress WHERE user_id = :user_id AND app_id = :app_id"),
            {"user_id": _DEFAULT_USER_ID, "app_id": app_id},
        )
        row = result.fetchone()

    if row is None:
        return None

    return {
        "total": int(row[0] or 0),
        "processed": int(row[1] or 0),
        "updated_at": _timestamp_to_int(row[2]) or 0,
        "phase": row[3] or "classifying",
        "fetched_count": int(row[4] or 0),
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
    """Save or update a starred game."""
    from . import db as db_module

    payload_metadata = json.dumps(metadata)
    payload_insights = json.dumps(insights) if insights is not None else None
    payload_sample = json.dumps(sample) if sample is not None else None
    payload_genres = json.dumps(genres) if genres is not None else None
    payload_categories = json.dumps(categories) if categories is not None else None
    timestamp = datetime.now(timezone.utc)

    with db_module.get_connection() as conn:
        conn.execute(
            text("""
                INSERT INTO starred_games (user_id, app_id, name, metadata, insights, sample, genres, categories, updated_at)
                VALUES (:user_id, :app_id, :name, :metadata, :insights, :sample, :genres, :categories, :updated_at)
                ON CONFLICT(user_id, app_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    metadata = EXCLUDED.metadata,
                    insights = EXCLUDED.insights,
                    sample = EXCLUDED.sample,
                    genres = EXCLUDED.genres,
                    categories = EXCLUDED.categories,
                    updated_at = EXCLUDED.updated_at
            """),
            {
                "user_id": _DEFAULT_USER_ID,
                "app_id": app_id,
                "name": name,
                "metadata": payload_metadata,
                "insights": payload_insights,
                "sample": payload_sample,
                "genres": payload_genres,
                "categories": payload_categories,
                "updated_at": timestamp,
            },
        )


def delete_starred_game(app_id: int) -> None:
    """Delete a starred game."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        conn.execute(
            text("DELETE FROM starred_games WHERE user_id = :user_id AND app_id = :app_id"),
            {"user_id": _DEFAULT_USER_ID, "app_id": app_id},
        )


def update_favorite_status(app_id: int, is_favorite: bool) -> bool:
    """Update the favorite status of a starred game. Returns True if updated, False if not found."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("""
                UPDATE starred_games
                SET is_favorite = :is_favorite
                WHERE user_id = :user_id AND app_id = :app_id
            """),
            {"user_id": _DEFAULT_USER_ID, "app_id": app_id, "is_favorite": is_favorite},
        )
        return result.rowcount > 0


def load_favorite_games() -> list[Dict[str, Any]]:
    """Load all favorite games for a user."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("""
                SELECT app_id, name, metadata, insights, sample, genres, categories, updated_at, is_favorite
                FROM starred_games
                WHERE user_id = :user_id AND is_favorite = TRUE
                ORDER BY updated_at DESC
            """),
            {"user_id": _DEFAULT_USER_ID},
        )
        rows = result.fetchall()

    results: list[Dict[str, Any]] = []
    for row in rows:
        results.append(
            {
                "app_id": int(row[0]),
                "name": row[1],
                "metadata": _parse_json_field(row[2], {}),
                "insights": _parse_json_field(row[3], None),
                "sample": _parse_json_field(row[4], []),
                "genres": _parse_json_field(row[5], []),
                "categories": _parse_json_field(row[6], []),
                "updated_at": _timestamp_to_int(row[7]) or 0,
                "is_favorite": True,
            }
        )

    return results


def delete_all_game_data(app_id: int) -> None:
    """Delete all data associated with a game: reviews, labels, progress, and starred entry."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        conn.execute(text("DELETE FROM reviews WHERE app_id = :app_id"), {"app_id": app_id})
        conn.execute(text("DELETE FROM review_labels WHERE app_id = :app_id"), {"app_id": app_id})
        conn.execute(text("DELETE FROM progress WHERE app_id = :app_id"), {"app_id": app_id})
        conn.execute(text("DELETE FROM starred_games WHERE app_id = :app_id"), {"app_id": app_id})
        conn.execute(text("DELETE FROM analysis_results WHERE app_id = :app_id"), {"app_id": app_id})


def get_database_stats() -> Dict[str, Any]:
    """Get database statistics: counts of games, reviews, labels."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(text("""
            SELECT COUNT(DISTINCT app_id) FROM (
                SELECT app_id FROM reviews
                UNION
                SELECT app_id FROM starred_games
            ) AS combined
        """))
        games_count = result.fetchone()[0]

        result = conn.execute(text("SELECT COUNT(*) FROM reviews"))
        reviews_count = result.fetchone()[0]

        result = conn.execute(text("SELECT COUNT(*) FROM review_labels"))
        labels_count = result.fetchone()[0]

        main_cat_expr = d.json_extract("payload", "main_category")
        result = conn.execute(text(f"""
            SELECT COUNT(*) FROM review_labels
            WHERE {main_cat_expr} IS NOT NULL
        """))
        new_schema_count = result.fetchone()[0]

        old_schema_count = labels_count - new_schema_count

        result = conn.execute(text("SELECT COUNT(*) FROM starred_games"))
        starred_count = result.fetchone()[0]

        return {
            "games": int(games_count),
            "reviews": int(reviews_count),
            "labels": int(labels_count),
            "labels_new_schema": int(new_schema_count),
            "labels_old_schema": int(old_schema_count),
            "starred_games": int(starred_count),
        }


def clear_all_labels() -> int:
    """Delete all labels. Returns count of deleted labels."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(text("SELECT COUNT(*) FROM review_labels"))
        count = result.fetchone()[0]
        conn.execute(text("DELETE FROM review_labels"))
        return count


def clear_old_schema_labels() -> int:
    """Delete labels with old schema (missing main_category field). Returns count of deleted labels."""
    from . import db as db_module

    main_cat_expr = d.json_extract("payload", "main_category")
    with db_module.get_connection() as conn:
        result = conn.execute(text(f"""
            DELETE FROM review_labels
            WHERE {main_cat_expr} IS NULL
        """))
        count = result.rowcount
        return count


def clear_entire_database() -> Dict[str, int]:
    """Clear all data from database. Returns counts of deleted records."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(text("SELECT COUNT(*) FROM reviews"))
        reviews_count = result.fetchone()[0]

        result = conn.execute(text("SELECT COUNT(*) FROM review_labels"))
        labels_count = result.fetchone()[0]

        result = conn.execute(text("SELECT COUNT(*) FROM progress"))
        progress_count = result.fetchone()[0]

        result = conn.execute(text("SELECT COUNT(*) FROM starred_games"))
        starred_count = result.fetchone()[0]

        result = conn.execute(text("SELECT COUNT(*) FROM analysis_results"))
        analysis_count = result.fetchone()[0]

        conn.execute(text("DELETE FROM reviews"))
        conn.execute(text("DELETE FROM review_labels"))
        conn.execute(text("DELETE FROM progress"))
        conn.execute(text("DELETE FROM starred_games"))
        conn.execute(text("DELETE FROM analysis_results"))

        return {
            "reviews": reviews_count,
            "labels": labels_count,
            "progress": progress_count,
            "starred_games": starred_count,
            "analysis_results": analysis_count,
        }


def load_starred_games() -> list[Dict[str, Any]]:
    """Load all starred games for a user."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("""
                SELECT app_id, name, metadata, insights, sample, genres, categories, updated_at, is_favorite
                FROM starred_games
                WHERE user_id = :user_id
                ORDER BY updated_at DESC
            """),
            {"user_id": _DEFAULT_USER_ID},
        )
        rows = result.fetchall()

    results: list[Dict[str, Any]] = []
    for row in rows:
        results.append(
            {
                "app_id": int(row[0]),
                "name": row[1],
                "metadata": _parse_json_field(row[2], {}),
                "insights": _parse_json_field(row[3], None),
                "sample": _parse_json_field(row[4], []),
                "genres": _parse_json_field(row[5], []),
                "categories": _parse_json_field(row[6], []),
                "updated_at": _timestamp_to_int(row[7]) or 0,
                "is_favorite": bool(row[8]) if row[8] is not None else False,
            }
        )

    return results


def load_user_app_ids() -> List[int]:
    """Load all app IDs for a user's starred games."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("SELECT app_id FROM starred_games WHERE user_id = :user_id"),
            {"user_id": _DEFAULT_USER_ID},
        )
        rows = result.fetchall()
    return [int(row[0]) for row in rows if row[0] is not None]


def count_starred_games() -> int:
    """Count how many games a user has analyzed/starred."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("SELECT COUNT(*) FROM starred_games WHERE user_id = :user_id"),
            {"user_id": _DEFAULT_USER_ID},
        )
        row = result.fetchone()
    return int(row[0]) if row else 0


def user_has_game(app_id: int) -> bool:
    """Check if a user has starred a game."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("SELECT 1 FROM starred_games WHERE user_id = :user_id AND app_id = :app_id LIMIT 1"),
            {"user_id": _DEFAULT_USER_ID, "app_id": int(app_id)},
        )
        row = result.fetchone()
    return row is not None


def list_database_games_all() -> List[Dict[str, Any]]:
    """List all games in the database (starred or with reviews)."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(text("SELECT DISTINCT app_id FROM reviews ORDER BY app_id"))
        review_rows = result.fetchall()

        result = conn.execute(text("SELECT app_id, name FROM starred_games"))
        starred_rows = result.fetchall()

    name_map = {
        int(row[0]): row[1]
        for row in starred_rows
        if row[0] is not None
    }
    review_ids = {int(row[0]) for row in review_rows if row[0] is not None}
    starred_ids = {int(row[0]) for row in starred_rows if row[0] is not None}
    all_ids = sorted(review_ids | starred_ids)
    return [{"app_id": app_id, "name": name_map.get(app_id)} for app_id in all_ids]


def get_top_games_by_review_count(
    limit: int = 5,
    language: Optional[str] = None,
    query: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return top games by review count using SQL GROUP BY.

    Args:
        limit: Maximum number of games to return.
        language: Optional language filter (e.g. "english").
        query: Optional full-text search query.

    Returns:
        List of dicts with keys: app_id, count.
    """
    from . import db as db_module

    where_parts: List[str] = []
    params: Dict[str, Any] = {"limit": int(limit)}
    lang = (language or "").strip().lower()
    raw_query = (query or "").strip()

    if raw_query:
        where_parts.append(d.fts_match("reviews"))
        params["query"] = raw_query
    if lang and lang != "all":
        where_parts.append(f"{d.json_extract('data', 'language')} = :lang")
        params["lang"] = lang

    where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

    with db_module.get_connection() as conn:
        rows = conn.execute(
            text(f"""
                SELECT app_id, COUNT(*) AS cnt
                FROM reviews
                {where_clause}
                GROUP BY app_id
                ORDER BY cnt DESC
                LIMIT :limit
            """),
            params,
        ).fetchall()

    return [{"app_id": int(row[0]), "count": int(row[1])} for row in rows]


def list_database_games() -> List[Dict[str, Any]]:
    """List games for a specific user."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("SELECT app_id, name FROM starred_games WHERE user_id = :user_id ORDER BY app_id"),
            {"user_id": _DEFAULT_USER_ID},
        )
        starred_rows = result.fetchall()

    return [
        {"app_id": int(row[0]), "name": row[1]}
        for row in starred_rows
        if row[0] is not None
    ]


def get_review_by_id(review_id: str) -> Optional[Dict[str, Any]]:
    """
    Get a single review by its review_id.
    Returns the review row with labels or None if not found.
    """
    from . import db as db_module
    with db_module.get_connection() as conn:
        query_sql = """
            SELECT reviews.review_id, reviews.app_id, reviews.data, reviews.timestamp_created,
                   review_labels.payload AS label_payload
            FROM reviews
            LEFT JOIN review_labels
              ON reviews.review_id = review_labels.review_id AND reviews.app_id = review_labels.app_id
            WHERE reviews.review_id = :review_id
            LIMIT 1
        """
        result = conn.execute(text(query_sql), {"review_id": review_id}).mappings().fetchone()
        if result:
            return dict(result)
        return None


def load_database_reviews(
    limit: int,
    offset: int,
    app_id: Optional[int] = None,
    language: Optional[str] = None,
    query: Optional[str] = None,
    app_ids: Optional[Sequence[int]] = None,
) -> tuple[List[Dict[str, Any]], int]:
    limit = max(1, min(int(limit), 500))
    offset = max(0, int(offset))
    lang = (language or "").strip().lower()
    raw_query = (query or "").strip()

    allowed_ids: Optional[List[int]] = None
    if app_ids is not None:
        allowed_ids = [int(item) for item in app_ids if item is not None]
        if not allowed_ids:
            return [], 0

    from . import db as db_module
    with db_module.get_connection() as conn:
        if raw_query:
            where_parts = [d.fts_match("reviews")]
            params: Dict[str, Any] = {"query": raw_query}
            if app_id:
                if allowed_ids is not None and int(app_id) not in allowed_ids:
                    return [], 0
                where_parts.append("reviews.app_id = :app_id")
                params["app_id"] = int(app_id)
            elif allowed_ids is not None:
                placeholders = ",".join([f":app_id_{i}" for i in range(len(allowed_ids))])
                where_parts.append(f"reviews.app_id IN ({placeholders})")
                for i, aid in enumerate(allowed_ids):
                    params[f"app_id_{i}"] = aid
            if lang and lang != "all":
                where_parts.append(f"{d.json_extract('reviews.data', 'language')} = :lang")
                params["lang"] = lang
            where_sql = " AND ".join(where_parts)

            params["limit"] = limit
            params["offset"] = offset

            total_query = f"""
                SELECT COUNT(*)
                FROM reviews
                WHERE {where_sql}
            """
            total = conn.execute(text(total_query), params).fetchone()[0]

            fts_order = d.fts_rank("reviews")
            query_sql = f"""
                SELECT reviews.review_id, reviews.app_id, reviews.data, reviews.timestamp_created,
                       review_labels.payload AS label_payload
                FROM reviews
                LEFT JOIN review_labels
                  ON reviews.review_id = review_labels.review_id AND reviews.app_id = review_labels.app_id
                WHERE {where_sql}
                ORDER BY {fts_order} DESC
                LIMIT :limit OFFSET :offset
            """
            rows = conn.execute(text(query_sql), params).mappings().fetchall()
        else:
            where_parts = []
            params: Dict[str, Any] = {}
            if app_id:
                if allowed_ids is not None and int(app_id) not in allowed_ids:
                    return [], 0
                where_parts.append("reviews.app_id = :app_id")
                params["app_id"] = int(app_id)
            elif allowed_ids is not None:
                placeholders = ",".join([f":app_id_{i}" for i in range(len(allowed_ids))])
                where_parts.append(f"reviews.app_id IN ({placeholders})")
                for i, aid in enumerate(allowed_ids):
                    params[f"app_id_{i}"] = aid
            if lang and lang != "all":
                where_parts.append(f"{d.json_extract('reviews.data', 'language')} = :lang")
                params["lang"] = lang
            where_sql = " AND ".join(where_parts)
            where_clause = f"WHERE {where_sql}" if where_sql else ""

            params["limit"] = limit
            params["offset"] = offset

            total_query = f"SELECT COUNT(*) FROM reviews {where_clause}"
            total = conn.execute(text(total_query), params).fetchone()[0]

            query_sql = f"""
                SELECT reviews.review_id, reviews.app_id, reviews.data, reviews.timestamp_created,
                       review_labels.payload AS label_payload
                FROM reviews
                LEFT JOIN review_labels
                  ON reviews.review_id = review_labels.review_id AND reviews.app_id = review_labels.app_id
                {where_clause}
                ORDER BY reviews.timestamp_created DESC
                LIMIT :limit OFFSET :offset
            """
            rows = conn.execute(text(query_sql), params).mappings().fetchall()

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
    timestamp = _get_timestamp()
    from . import db as db_module
    ts_expr = d.to_timestamp_expr(":updated_at") if not d.is_sqlite() else ":updated_at"
    updated_at_val = datetime.fromtimestamp(timestamp, tz=timezone.utc) if d.is_sqlite() else timestamp
    with db_module.get_connection() as conn:
        from sqlalchemy import text
        conn.execute(
            text(f"""
            INSERT INTO analysis_results (user_id, app_id, metadata, insights, reviews, status, error, updated_at, run_id, snapshot_hash, stale, context_hash, stale_reason)
            VALUES (:user_id, :app_id, :metadata, :insights, :reviews, :status, :error, {ts_expr}, :run_id, :snapshot_hash, :stale, :context_hash, :stale_reason)
            ON CONFLICT(user_id, app_id) DO UPDATE SET
                metadata = EXCLUDED.metadata,
                insights = EXCLUDED.insights,
                reviews = EXCLUDED.reviews,
                status = EXCLUDED.status,
                error = EXCLUDED.error,
                run_id = EXCLUDED.run_id,
                snapshot_hash = EXCLUDED.snapshot_hash,
                stale = EXCLUDED.stale,
                context_hash = EXCLUDED.context_hash,
                stale_reason = EXCLUDED.stale_reason,
                updated_at = EXCLUDED.updated_at
            """),
            {
                "user_id": _DEFAULT_USER_ID,
                "app_id": app_id,
                "metadata": payload_metadata,
                "insights": payload_insights,
                "reviews": payload_reviews,
                "status": status,
                "error": error,
                "updated_at": updated_at_val,
                "run_id": run_id,
                "snapshot_hash": snapshot_hash,
                "stale": stale,
                "context_hash": context_hash,
                "stale_reason": stale_reason,
            },
        )


def has_running_analysis(exclude_app_id: Optional[int] = None) -> Optional[int]:
    """Check if the user has any analysis currently running.

    Returns the app_id of the running analysis, or None if none is running.
    Optionally excludes a specific app_id (for re-run checks).
    """
    from . import db as db_module

    with db_module.get_connection() as conn:
        if exclude_app_id is not None:
            row = conn.execute(
                text("""
                    SELECT app_id FROM analysis_results
                    WHERE user_id = :user_id AND status = 'running' AND app_id != :exclude_app_id
                    LIMIT 1
                """),
                {"user_id": _DEFAULT_USER_ID, "exclude_app_id": exclude_app_id},
            ).fetchone()
        else:
            row = conn.execute(
                text("""
                    SELECT app_id FROM analysis_results
                    WHERE user_id = :user_id AND status = 'running'
                    LIMIT 1
                """),
                {"user_id": _DEFAULT_USER_ID},
            ).fetchone()

    return int(row[0]) if row else None


def load_analysis_result(app_id: int) -> Optional[Dict[str, Any]]:
    from . import db as db_module
    with db_module.get_connection() as conn:
        row = conn.execute(
            text("""
            SELECT metadata, insights, reviews, status, error, updated_at, run_id, snapshot_hash, stale, context_hash, stale_reason
            FROM analysis_results
            WHERE user_id = :user_id AND app_id = :app_id
            """),
            {"user_id": _DEFAULT_USER_ID, "app_id": app_id},
        ).mappings().fetchone()

    if row is None:
        return None

    return {
        "metadata": _parse_json_field(row["metadata"], None),
        "insights": _parse_json_field(row["insights"], None),
        "reviews": _parse_json_field(row["reviews"], []),
        "status": row["status"],
        "error": row["error"],
        "updated_at": _timestamp_to_int(row["updated_at"]) or 0,
        "run_id": row["run_id"],
        "snapshot_hash": row["snapshot_hash"],
        "stale": bool(row["stale"]),
        "context_hash": row["context_hash"],
        "stale_reason": row["stale_reason"],
    }


# Job Registry Functions

def create_job_registry(
    job_id: str,
    app_id: int,
    job_type: str = "analysis",
    metadata: Optional[Dict] = None,
) -> None:
    """Create a new job registry entry."""
    timestamp = _get_timestamp()
    metadata_json = json.dumps(metadata) if metadata else None
    from . import db as db_module
    ts_expr = d.to_timestamp_expr(":created_at") if not d.is_sqlite() else ":created_at"
    created_at_val = datetime.fromtimestamp(timestamp, tz=timezone.utc) if d.is_sqlite() else timestamp
    with db_module.get_connection() as conn:
        from sqlalchemy import text
        conn.execute(
            text(f"""
            INSERT INTO job_registry (job_id, user_id, app_id, job_type, status, created_at, metadata)
            VALUES (:job_id, :user_id, :app_id, :job_type, 'pending', {ts_expr}, :metadata)
            ON CONFLICT(job_id) DO UPDATE SET
                status = 'pending',
                created_at = EXCLUDED.created_at,
                metadata = EXCLUDED.metadata
            """),
            {
                "job_id": job_id,
                "user_id": _DEFAULT_USER_ID,
                "app_id": app_id,
                "job_type": job_type,
                "created_at": created_at_val,
                "metadata": metadata_json,
            },
        )


def update_job_registry(
    job_id: str,
    status: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    """Update job registry entry status."""
    timestamp = _get_timestamp()
    from . import db as db_module
    ts_val = datetime.fromtimestamp(timestamp, tz=timezone.utc) if d.is_sqlite() else timestamp
    with db_module.get_connection() as conn:
        from sqlalchemy import text
        if status == "running":
            ts_expr = ":started_at" if d.is_sqlite() else d.to_timestamp_expr(":started_at")
            conn.execute(
                text(f"UPDATE job_registry SET status = :status, started_at = {ts_expr} WHERE job_id = :job_id"),
                {"status": status, "started_at": ts_val, "job_id": job_id},
            )
        elif status in ("completed", "failed"):
            ts_expr = ":completed_at" if d.is_sqlite() else d.to_timestamp_expr(":completed_at")
            conn.execute(
                text(f"UPDATE job_registry SET status = :status, completed_at = {ts_expr}, error = :error WHERE job_id = :job_id"),
                {"status": status, "completed_at": ts_val, "error": error, "job_id": job_id},
            )
        elif status:
            conn.execute(
                text("UPDATE job_registry SET status = :status WHERE job_id = :job_id"),
                {"status": status, "job_id": job_id},
            )


def get_job_registry(job_id: str) -> Optional[Dict[str, Any]]:
    """Get job registry entry by ID."""
    from . import db as db_module
    with db_module.get_connection() as conn:
        row = conn.execute(
            text("""
            SELECT job_id, user_id, app_id, job_type, status, created_at, started_at, completed_at, error, metadata
            FROM job_registry
            WHERE job_id = :job_id
            """),
            {"job_id": job_id},
        ).fetchone()

    if row is None:
        return None

    return {
        "job_id": row["job_id"],
        "user_id": row["user_id"],
        "app_id": int(row["app_id"]),
        "job_type": row["job_type"],
        "status": row["status"],
        "created_at": _timestamp_to_int(row["created_at"]) or 0,
        "started_at": _timestamp_to_int(row["started_at"]),
        "completed_at": _timestamp_to_int(row["completed_at"]),
        "error": row["error"],
        "metadata": _parse_json_field(row["metadata"], None),
    }


def find_interrupted_jobs(age_minutes: int = 10) -> List[Dict[str, Any]]:
    """Find jobs that are stuck in 'running' status for longer than age_minutes."""
    cutoff = _get_cutoff_timestamp(age_minutes * 60)
    from . import db as db_module
    with db_module.get_connection() as conn:
        rows = conn.execute(
            text("""
            SELECT job_id, user_id, app_id, job_type, status, created_at, started_at
            FROM job_registry
            WHERE status = 'running' AND started_at < :cutoff
            """),
            {"cutoff": cutoff},
        ).fetchall()

    return [
        {
            "job_id": row["job_id"],
            "user_id": row["user_id"],
            "app_id": int(row["app_id"]),
            "job_type": row["job_type"],
            "status": row["status"],
            "created_at": _timestamp_to_int(row["created_at"]) or 0,
            "started_at": _timestamp_to_int(row["started_at"]),
        }
        for row in rows
    ]


def cleanup_old_jobs(age_days: int = 7) -> int:
    """Delete completed/failed jobs older than age_days. Returns count deleted."""
    cutoff = _get_cutoff_timestamp(age_days * 24 * 3600)
    from . import db as db_module
    with db_module.get_connection() as conn:
        cursor = conn.execute(
            text("""
            DELETE FROM job_registry
            WHERE status IN ('completed', 'failed') AND completed_at < :cutoff
            """),
            {"cutoff": cutoff},
        )
        count = cursor.rowcount
    return count


# Chat Message Functions

def save_chat_message(role: str, content: str, session_id: str = None) -> None:
    """Save a chat message to the database."""
    from . import db as db_module
    logger.debug(f"Saving chat message: user_id={_DEFAULT_USER_ID}, session_id={session_id}, role={role}, content_length={len(content)}")
    with db_module.get_connection() as conn:
        conn.execute(
            text("""
            INSERT INTO chat_messages (user_id, session_id, role, content)
            VALUES (:user_id, :session_id, :role, :content)
            """),
            {
                "user_id": _DEFAULT_USER_ID,
                "session_id": session_id,
                "role": role,
                "content": content,
            },
        )
    logger.debug(f"Successfully saved chat message for user_id={_DEFAULT_USER_ID}, session_id={session_id}")


def load_chat_history(limit: int = 50, session_id: str = None) -> List[Dict[str, Any]]:
    """Load chat history for a user, optionally filtered by session."""
    from . import db as db_module
    logger.debug(f"Loading chat history for user_id={_DEFAULT_USER_ID}, session_id={session_id}, limit={limit}")
    with db_module.get_connection() as conn:
        if session_id:
            rows = conn.execute(
                text("""
                SELECT role, content, created_at, session_id
                FROM chat_messages
                WHERE user_id = :user_id AND session_id = :session_id
                ORDER BY created_at DESC
                LIMIT :limit
                """),
                {"user_id": _DEFAULT_USER_ID, "session_id": session_id, "limit": limit},
            ).mappings().fetchall()
        else:
            # Load latest session or all messages if no sessions
            rows = conn.execute(
                text("""
                SELECT role, content, created_at, session_id
                FROM chat_messages
                WHERE user_id = :user_id AND (
                    session_id = (
                        SELECT session_id FROM chat_messages
                        WHERE user_id = :user_id AND session_id IS NOT NULL
                        ORDER BY created_at DESC LIMIT 1
                    ) OR session_id IS NULL
                )
                ORDER BY created_at DESC
                LIMIT :limit
                """),
                {"user_id": _DEFAULT_USER_ID, "limit": limit},
            ).mappings().fetchall()

    # Reverse to get chronological order (oldest first)
    messages = []
    for row in reversed(rows):
        messages.append({
            "role": row["role"],
            "content": row["content"],
            "timestamp": _format_ts(row["created_at"]),
            "session_id": row.get("session_id"),
        })
    logger.debug(f"Loaded {len(messages)} messages for user_id={_DEFAULT_USER_ID}, session_id={session_id}")
    return messages


def get_chat_sessions() -> List[Dict[str, Any]]:
    """Get all chat sessions for a user."""
    from . import db as db_module
    with db_module.get_connection() as conn:
        rows = conn.execute(
            text("""
            SELECT
                cm.session_id,
                COUNT(*) as message_count,
                MIN(cm.created_at) as started_at,
                MAX(cm.created_at) as last_message_at,
                (
                    SELECT content
                    FROM chat_messages
                    WHERE session_id = cm.session_id AND role = 'user' AND user_id = :user_id
                    ORDER BY created_at ASC
                    LIMIT 1
                ) as first_user_message
            FROM chat_messages cm
            WHERE cm.user_id = :user_id AND cm.session_id IS NOT NULL
            GROUP BY cm.session_id
            ORDER BY last_message_at DESC
            """),
            {"user_id": _DEFAULT_USER_ID},
        ).mappings().fetchall()

    sessions = []
    for row in rows:
        sessions.append({
            "session_id": row["session_id"],
            "message_count": row["message_count"],
            "started_at": _format_ts(row["started_at"]),
            "last_message_at": _format_ts(row["last_message_at"]),
            "first_user_message": row["first_user_message"],
        })
    return sessions


def clear_chat_history(session_id: str = None) -> int:
    """Clear chat history for a user. If session_id provided, only clears that session."""
    from . import db as db_module
    with db_module.get_connection() as conn:
        if session_id:
            cursor = conn.execute(
                text("""
                DELETE FROM chat_messages
                WHERE user_id = :user_id AND session_id = :session_id
                """),
                {"user_id": _DEFAULT_USER_ID, "session_id": session_id},
            )
        else:
            cursor = conn.execute(
                text("""
                DELETE FROM chat_messages
                WHERE user_id = :user_id
                """),
                {"user_id": _DEFAULT_USER_ID},
            )
        count = cursor.rowcount
    return count


def _parse_date_filter(date_filter: str) -> Optional[int]:
    """Convert date filter string to days. Returns None for 'all'."""
    if not date_filter or date_filter == "all":
        return None
    mapping = {
        "30d": 30,
        "90d": 90,
        "365d": 365,
        "1y": 365,
    }
    return mapping.get(date_filter.lower())


def search_reviews_with_date_filter(
    app_id: int,
    query: str,
    date_filter: str = "all",
    limit: int = 50,
    order_by: str = "votes_up",
    offset: int = 0,
    sentiment: Optional[str] = None,
    language: Optional[str] = None,
) -> List[dict]:
    """Search reviews using PostgreSQL FTS with date filtering.

    Args:
        app_id: The Steam app ID to search
        query: Search query string (will be converted to tsquery)
        date_filter: One of "30d", "90d", "365d", "all"
        limit: Maximum number of results (default 50)
        order_by: Order by column - "votes_up" (default) or "timestamp_created"
        offset: Number of results to skip (for pagination)
        sentiment: Optional sentiment filter ("positive" or "negative")
        language: Optional language filter (e.g., "english", "german")

    Returns:
        List of review dicts ordered by votes_up DESC
    """
    _ALLOWED_ORDER_BY = {"votes_up", "timestamp_created"}
    if order_by not in _ALLOWED_ORDER_BY:
        raise ValueError(f"Invalid order_by value: {order_by!r}")

    from . import db as db_module
    import time

    raw = (query or "").strip()
    max_days = _parse_date_filter(date_filter)
    offset = max(0, int(offset or 0))

    sentiment_value = (sentiment or "").strip().lower()
    sentiment_filter = None
    if sentiment_value in {"positive", "negative"}:
        sentiment_filter = sentiment_value == "positive"

    language_value = (language or "").strip().lower()

    with db_module.get_connection() as conn:
        # Build WHERE clauses
        where_parts = ["r.app_id = :app_id"]
        params: Dict[str, Any] = {
            "app_id": int(app_id),
            "limit": int(limit),
            "offset": offset,
        }

        if raw:
            where_parts.append(d.fts_match("r"))
            params["query"] = raw

        if max_days is not None:
            cutoff = int(time.time()) - (max_days * 24 * 60 * 60)
            where_parts.append("r.timestamp_created > :cutoff")
            params["cutoff"] = cutoff

        if sentiment_filter is not None:
            voted_up_expr = d.json_extract("r.data", "voted_up")
            where_parts.append(f"{d.coalesce_bool(voted_up_expr)} = :is_positive")
            params["is_positive"] = 1 if d.is_sqlite() and sentiment_filter else (0 if d.is_sqlite() and not sentiment_filter else sentiment_filter)

        if language_value and language_value != "all":
            where_parts.append(f"LOWER(COALESCE({d.json_extract('r.data', 'language')}, '')) = :language")
            params["language"] = language_value

        where_sql = " AND ".join(where_parts)
        order_clause = f"ORDER BY {d.cast_int(d.json_extract('r.data', 'votes_up'))} DESC NULLS LAST"
        if order_by == "timestamp_created":
            order_clause = "ORDER BY r.timestamp_created DESC NULLS LAST"

        result = conn.execute(
            text(f"""
                SELECT r.data
                FROM reviews r
                WHERE {where_sql}
                {order_clause}
                LIMIT :limit OFFSET :offset
            """),
            params,
        )

        rows = result.fetchall()

    return [_parse_json_field(row[0], {}) for row in rows]


def get_subcategory_label_counts(
    app_id: int,
    label_key: str,
    date_filter: str = "all",
    *,
    category: Optional[str] = None,
    limit: Optional[int] = 10,
    subcategories: Optional[Sequence[str]] = None,
    sentiment: Optional[str] = None,
    language: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Aggregate counts for a label array (subcategories/issues/requests).

    Args:
        app_id: The Steam app ID
        label_key: One of "subcategories", "issue_subcategories", "request_subcategories"
        date_filter: One of "30d", "90d", "365d", "all"
        category: Optional main category filter (e.g., "technical")
        limit: Optional max results (None for no limit)
        subcategories: Optional list to restrict to specific subcategories
        sentiment: Optional sentiment filter ("positive" or "negative")
        language: Optional language filter (e.g., "english", "german")

    Returns:
        List of dicts with subcategory, count, positive_count
    """
    if label_key not in {"subcategories", "issue_subcategories", "request_subcategories"}:
        raise ValueError(f"Unsupported label_key: {label_key}")

    from . import db as db_module
    import time

    max_days = _parse_date_filter(date_filter)
    category_filter = (category or "").strip().lower()
    sentiment_value = (sentiment or "").strip().lower()
    sentiment_filter = None
    if sentiment_value in {"positive", "negative"}:
        sentiment_filter = sentiment_value == "positive"
    language_value = (language or "").strip().lower()

    params: Dict[str, Any] = {
        "app_id": int(app_id),
    }
    where_parts = [
        "r.app_id = :app_id",
        "rl.payload IS NOT NULL",
    ]

    if max_days is not None:
        cutoff = int(time.time()) - (max_days * 24 * 60 * 60)
        where_parts.append("r.timestamp_created > :cutoff")
        params["cutoff"] = cutoff

    voted_up_expr = d.json_extract("r.data", "voted_up")
    if sentiment_filter is not None:
        where_parts.append(f"{d.coalesce_bool(voted_up_expr)} = :is_positive")
        params["is_positive"] = 1 if d.is_sqlite() and sentiment_filter else (0 if d.is_sqlite() and not sentiment_filter else sentiment_filter)

    if language_value and language_value != "all":
        where_parts.append(f"LOWER(COALESCE({d.json_extract('r.data', 'language')}, '')) = :language")
        params["language"] = language_value

    subcat_val = d.json_array_element_value("subcat")
    if category_filter:
        params["subcategory_pattern"] = f"{category_filter}/%"
        where_parts.append(f"LOWER({subcat_val}) LIKE :subcategory_pattern")

    if subcategories:
        subcats = [s.lower() for s in subcategories if s]
        if not subcats:
            return []
        arr_sql, params = d.any_array("subcategories", subcats, params)
        where_parts.append(f"LOWER({subcat_val}) {arr_sql}")

    where_sql = " AND ".join(where_parts)
    limit_clause = ""
    if limit is not None:
        params["limit"] = int(limit)
        limit_clause = "LIMIT :limit"

    lateral_join = d.json_array_elements_join("rl", "payload", label_key, "subcat")
    positive_expr = d.coalesce_bool(voted_up_expr)

    query_sql = f"""
        SELECT LOWER({subcat_val}) AS subcat_key,
               MIN({subcat_val}) AS subcategory,
               COUNT(*) AS count,
               SUM(CASE WHEN {positive_expr} THEN 1 ELSE 0 END) AS positive_count
        FROM reviews r
        JOIN review_labels rl ON r.review_id = rl.review_id AND r.app_id = rl.app_id
        {lateral_join}
        WHERE {where_sql}
        GROUP BY subcat_key
        ORDER BY COUNT(*) DESC
        {limit_clause}
    """

    def _run_query() -> List[Any]:
        with db_module.get_connection() as conn:
            return conn.execute(text(query_sql), params).fetchall()

    try:
        rows = _run_query()
    except Exception as exc:
        if "deadlock detected" in str(exc).lower():
            time.sleep(0.2)
            rows = _run_query()
        else:
            raise

    return [
        {
            "subcategory": row[1],
            "count": int(row[2] or 0),
            "positive_count": int(row[3] or 0),
        }
        for row in rows
    ]


def get_subcategory_label_counts_range(
    app_id: int,
    label_key: str,
    start_ts: int,
    end_ts: int,
    *,
    category: Optional[str] = None,
    limit: Optional[int] = 10,
    subcategories: Optional[Sequence[str]] = None,
    sentiment: Optional[str] = None,
    language: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Aggregate counts for a label array within a specific time range.

    Args:
        app_id: The Steam app ID
        label_key: One of "subcategories", "issue_subcategories", "request_subcategories"
        start_ts: Start timestamp (inclusive, Unix seconds)
        end_ts: End timestamp (exclusive, Unix seconds)
        category: Optional main category filter (e.g., "technical")
        limit: Optional max results (None for no limit)
        subcategories: Optional list to restrict to specific subcategories
        sentiment: Optional sentiment filter ("positive" or "negative")
        language: Optional language filter (e.g., "english", "german")

    Returns:
        List of dicts with subcategory, count, positive_count
    """
    if label_key not in {"subcategories", "issue_subcategories", "request_subcategories"}:
        raise ValueError(f"Unsupported label_key: {label_key}")

    from . import db as db_module

    category_filter = (category or "").strip().lower()
    sentiment_value = (sentiment or "").strip().lower()
    sentiment_filter = None
    if sentiment_value in {"positive", "negative"}:
        sentiment_filter = sentiment_value == "positive"
    language_value = (language or "").strip().lower()

    params: Dict[str, Any] = {
        "app_id": int(app_id),
        "start_ts": int(start_ts),
        "end_ts": int(end_ts),
    }
    where_parts = [
        "r.app_id = :app_id",
        "rl.payload IS NOT NULL",
        "r.timestamp_created >= :start_ts",
        "r.timestamp_created < :end_ts",
    ]

    if category_filter:
        params["subcategory_pattern"] = f"{category_filter}/%"
        where_parts.append("LOWER(subcat) LIKE :subcategory_pattern")

    if subcategories:
        subcats = [s.lower() for s in subcategories if s]
        if not subcats:
            return []
        arr_sql, params = d.any_array("subcategories", subcats, params)
        subcat_val = d.json_array_element_value("subcat")
        where_parts.append(f"LOWER({subcat_val}) {arr_sql}")

    voted_up_expr = d.json_extract("r.data", "voted_up")
    if sentiment_filter is not None:
        where_parts.append(f"{d.coalesce_bool(voted_up_expr)} = :is_positive")
        params["is_positive"] = (1 if sentiment_filter else 0) if d.is_sqlite() else sentiment_filter

    if language_value and language_value != "all":
        where_parts.append(f"LOWER(COALESCE({d.json_extract('r.data', 'language')}, '')) = :language")
        params["language"] = language_value

    where_sql = " AND ".join(where_parts)
    limit_clause = ""
    if limit is not None:
        params["limit"] = int(limit)
        limit_clause = "LIMIT :limit"

    lateral_join = d.json_array_elements_join("rl", "payload", label_key, "subcat")
    subcat_val = d.json_array_element_value("subcat")
    positive_expr = d.coalesce_bool(voted_up_expr)

    query_sql = f"""
        SELECT LOWER({subcat_val}) AS subcat_key,
               MIN({subcat_val}) AS subcategory,
               COUNT(*) AS count,
               SUM(CASE WHEN {positive_expr} THEN 1 ELSE 0 END) AS positive_count
        FROM reviews r
        JOIN review_labels rl ON r.review_id = rl.review_id AND r.app_id = rl.app_id
        {lateral_join}
        WHERE {where_sql}
        GROUP BY subcat_key
        ORDER BY COUNT(*) DESC
        {limit_clause}
    """

    def _run_query() -> List[Any]:
        with db_module.get_connection() as conn:
            return conn.execute(text(query_sql), params).fetchall()

    try:
        rows = _run_query()
    except Exception as exc:
        if "deadlock detected" in str(exc).lower():
            import time as _time
            _time.sleep(0.2)
            rows = _run_query()
        else:
            raise

    return [
        {
            "subcategory": row[1],
            "count": int(row[2] or 0),
            "positive_count": int(row[3] or 0),
        }
        for row in rows
    ]


def load_game_metadata_for_chat(app_ids: List[int]) -> List[Dict[str, Any]]:
    """Load game metadata for chat context.

    Args:
        app_ids: List of app IDs (max 2 recommended)

    Returns:
        List of dicts with app_id, name, genres, categories, and short_description
    """
    if not app_ids:
        return []

    from . import db as db_module

    ids_list = [int(aid) for aid in app_ids]
    params: Dict[str, Any] = {"user_id": _DEFAULT_USER_ID}
    arr_sql, params = d.any_array("app_ids", ids_list, params)

    with db_module.get_connection() as conn:
        result = conn.execute(
            text(f"""
                SELECT app_id, name, metadata, genres, categories
                FROM starred_games
                WHERE user_id = :user_id AND app_id {arr_sql}
            """),
            params,
        )
        rows = result.fetchall()

    games = []
    for row in rows:
        metadata = _parse_json_field(row[2], {})
        games.append({
            "app_id": int(row[0]),
            "name": row[1] or str(row[0]),
            "genres": _parse_json_field(row[3], []),
            "categories": _parse_json_field(row[4], []),
            "short_description": metadata.get("short_description", ""),
            "header_image": metadata.get("header_image", ""),
        })

    return games


def get_recommendation_split(
    app_id: int,
    date_filter: str = "all",
) -> Dict[str, int]:
    """Get recommendation split (recommended/not recommended counts) using SQL aggregation.

    This is for ANALYTICAL questions about recommendation rates, not content search.
    Uses the Steam voted_up field from the reviews.data JSONB column.

    Args:
        app_id: The Steam app ID
        date_filter: One of "30d", "90d", "365d", "all"

    Returns:
        Dict with keys:
            - recommended: Count of reviews with voted_up=true
            - not_recommended: Count of reviews with voted_up=false
            - total: Total count
            - definition: Description of what's being measured
            - date_filter: The applied date filter
            - cutoff_timestamp: Unix timestamp of cutoff (if date filter applied)

    Example:
        >>> get_recommendation_split(1091500, "30d")
        {
            "recommended": 742,
            "not_recommended": 258,
            "total": 1000,
            "definition": "Steam recommendation (voted_up field)",
            "date_filter": "30d",
            "cutoff_timestamp": 1234567890
        }
    """
    from . import db as db_module
    import time

    max_days = _parse_date_filter(date_filter)
    cutoff = None

    voted_up_col = d.json_extract("data", "voted_up")
    rec_filter = d.count_filter(f"{voted_up_col} IN ('true', '1', 1)")
    not_rec_filter = d.count_filter(f"{voted_up_col} NOT IN ('true', '1', 1)")

    with db_module.get_connection() as conn:
        if max_days is not None:
            cutoff = int(time.time()) - (max_days * 24 * 60 * 60)
            result = conn.execute(
                text(f"""
                    SELECT
                        {rec_filter} as recommended,
                        {not_rec_filter} as not_recommended,
                        COUNT(*) as total
                    FROM reviews
                    WHERE app_id = :app_id
                      AND timestamp_created > :cutoff
                      AND {voted_up_col} IS NOT NULL
                """),
                {"app_id": int(app_id), "cutoff": cutoff},
            )
        else:
            result = conn.execute(
                text(f"""
                    SELECT
                        {rec_filter} as recommended,
                        {not_rec_filter} as not_recommended,
                        COUNT(*) as total
                    FROM reviews
                    WHERE app_id = :app_id
                      AND {voted_up_col} IS NOT NULL
                """),
                {"app_id": int(app_id)},
            )

        row = result.fetchone()

    if not row:
        return {
            "recommended": 0,
            "not_recommended": 0,
            "total": 0,
            "definition": "Steam recommendation (voted_up field)",
            "date_filter": date_filter,
            "cutoff_timestamp": cutoff,
        }

    return {
        "recommended": int(row[0]) if row[0] else 0,
        "not_recommended": int(row[1]) if row[1] else 0,
        "total": int(row[2]) if row[2] else 0,
        "definition": "Steam recommendation (voted_up field)",
        "date_filter": date_filter,
        "cutoff_timestamp": cutoff,
    }


def get_time_period_comparison(
    app_id: int,
    days_ago_start: int,
    days_ago_end: int,
    num_periods: int = 2,
) -> List[Dict[str, Any]]:
    """Compare recommendation rates across multiple time periods.

    Args:
        app_id: The Steam app ID
        days_ago_start: Start of the time window (days ago from now)
        days_ago_end: End of the time window (days ago from now, usually 0 for "now")
        num_periods: Number of equal periods to divide the time window into

    Returns:
        List of dicts, one per period, with:
            - period_label: Human-readable label (e.g., "Days 1-15", "Days 16-30")
            - start_date: ISO date string
            - end_date: ISO date string
            - recommended: Count of positive reviews
            - not_recommended: Count of negative reviews
            - total: Total reviews
            - recommendation_rate: Float 0-1

    Example:
        >>> get_time_period_comparison(1091500, days_ago_start=30, days_ago_end=0, num_periods=2)
        [
            {
                "period_label": "Days 1-15 (most recent)",
                "recommended": 450,
                "not_recommended": 50,
                "total": 500,
                "recommendation_rate": 0.9,
                ...
            },
            {
                "period_label": "Days 16-30",
                "recommended": 380,
                "not_recommended": 120,
                "total": 500,
                "recommendation_rate": 0.76,
                ...
            }
        ]
    """
    from . import db as db_module
    import time
    from datetime import datetime, timedelta

    now = time.time()
    window_start = now - (days_ago_start * 24 * 60 * 60)
    window_end = now - (days_ago_end * 24 * 60 * 60)
    total_window = window_end - window_start
    period_length = total_window / num_periods

    results = []

    with db_module.get_connection() as conn:
        for i in range(num_periods):
            # Most recent period first
            period_end = window_end - (i * period_length)
            period_start = period_end - period_length

            voted_up = d.json_extract("data", "voted_up")
            rec_count = d.count_filter(f"{d.cast_bool(voted_up)} = {1 if d.is_sqlite() else 'true'}")
            not_rec_count = d.count_filter(f"{d.cast_bool(voted_up)} = {0 if d.is_sqlite() else 'false'}")

            result = conn.execute(
                text(f"""
                    SELECT
                        {rec_count} as recommended,
                        {not_rec_count} as not_recommended,
                        COUNT(*) as total
                    FROM reviews
                    WHERE app_id = :app_id
                      AND timestamp_created >= :start_ts
                      AND timestamp_created < :end_ts
                      AND {voted_up} IS NOT NULL
                """),
                {
                    "app_id": int(app_id),
                    "start_ts": int(period_start),
                    "end_ts": int(period_end),
                },
            )

            row = result.fetchone()
            recommended = int(row[0]) if row[0] else 0
            not_recommended = int(row[1]) if row[1] else 0
            total = int(row[2]) if row[2] else 0
            rec_rate = (recommended / total) if total > 0 else 0.0

            # Calculate day ranges
            days_from_end_start = int((window_end - period_end) / (24 * 60 * 60))
            days_from_end_end = int((window_end - period_start) / (24 * 60 * 60))

            if i == 0:
                period_label = f"Days {days_from_end_start + 1}-{days_from_end_end} (most recent)"
            else:
                period_label = f"Days {days_from_end_start + 1}-{days_from_end_end}"

            results.append({
                "period_label": period_label,
                "start_date": datetime.fromtimestamp(period_start).isoformat(),
                "end_date": datetime.fromtimestamp(period_end).isoformat(),
                "recommended": recommended,
                "not_recommended": not_recommended,
                "total": total,
                "recommendation_rate": rec_rate,
            })

    return results


def get_language_breakdown(
    app_id: int,
    date_filter: str = "all",
    limit: int = 15,
) -> List[Dict[str, Any]]:
    """Get breakdown of reviews by language with recommendation rates.

    Args:
        app_id: The Steam app ID
        date_filter: One of "30d", "90d", "365d", "all"
        limit: Maximum number of languages to return

    Returns:
        List of dicts with keys:
            - language: Language code (e.g., "english", "german")
            - count: Total reviews in this language
            - recommended: Count with voted_up=true
            - not_recommended: Count with voted_up=false
            - recommendation_rate: Percentage recommended (0.0-1.0)
            - issue_count: Count with issues (from labels)
    """
    from . import db as db_module
    import time

    max_days = _parse_date_filter(date_filter)
    cutoff = None

    with db_module.get_connection() as conn:
        lang_col = d.json_extract("data", "language")
        voted_up = d.json_extract("data", "voted_up")
        rec_count = d.count_filter(f"{d.cast_bool(voted_up)} = {1 if d.is_sqlite() else 'true'}")
        not_rec_count = d.count_filter(f"{d.cast_bool(voted_up)} = {0 if d.is_sqlite() else 'false'}")

        if max_days is not None:
            cutoff = int(time.time()) - (max_days * 24 * 60 * 60)
            result = conn.execute(
                text(f"""
                    SELECT
                        COALESCE({lang_col}, 'unknown') as language,
                        COUNT(*) as total,
                        {rec_count} as recommended,
                        {not_rec_count} as not_recommended
                    FROM reviews
                    WHERE app_id = :app_id
                      AND timestamp_created > :cutoff
                      AND {voted_up} IS NOT NULL
                    GROUP BY COALESCE({lang_col}, 'unknown')
                    ORDER BY total DESC
                    LIMIT :limit
                """),
                {"app_id": int(app_id), "cutoff": cutoff, "limit": limit},
            )
        else:
            result = conn.execute(
                text(f"""
                    SELECT
                        COALESCE({lang_col}, 'unknown') as language,
                        COUNT(*) as total,
                        {rec_count} as recommended,
                        {not_rec_count} as not_recommended
                    FROM reviews
                    WHERE app_id = :app_id
                      AND {voted_up} IS NOT NULL
                    GROUP BY COALESCE({lang_col}, 'unknown')
                    ORDER BY total DESC
                    LIMIT :limit
                """),
                {"app_id": int(app_id), "limit": limit},
            )

        rows = result.fetchall()

    results = []
    for row in rows:
        language = row[0] or "unknown"
        total = int(row[1]) if row[1] else 0
        recommended = int(row[2]) if row[2] else 0
        not_recommended = int(row[3]) if row[3] else 0
        rec_rate = (recommended / total) if total > 0 else 0.0

        results.append({
            "language": language,
            "count": total,
            "recommended": recommended,
            "not_recommended": not_recommended,
            "recommendation_rate": rec_rate,
        })

    return results


def sample_reviews_by_sentiment(
    app_id: int,
    sentiment: str,
    date_filter: str = "all",
    limit: int = 5,
) -> List[dict]:
    """Sample top reviews by sentiment (for evidence after SQL aggregation).

    This is NOT keyword search. This samples by voted_up label + votes_up ranking.

    Args:
        app_id: The Steam app ID
        sentiment: "positive" or "negative"
        date_filter: One of "30d", "90d", "365d", "all"
        limit: Maximum number of samples

    Returns:
        List of review dicts, ordered by votes_up DESC
    """
    from . import db as db_module
    import time

    max_days = _parse_date_filter(date_filter)
    voted_up_value = sentiment == "positive"

    voted_up_col = d.cast_bool(d.json_extract("data", "voted_up"))
    votes_up_col = d.cast_int(d.json_extract("data", "votes_up"))
    # For SQLite, compare to 1/0; for PostgreSQL, compare to boolean param
    if d.is_sqlite():
        voted_up_param_val = 1 if voted_up_value else 0
    else:
        voted_up_param_val = voted_up_value

    with db_module.get_connection() as conn:
        if max_days is not None:
            cutoff = int(time.time()) - (max_days * 24 * 60 * 60)
            result = conn.execute(
                text(f"""
                    SELECT data
                    FROM reviews
                    WHERE app_id = :app_id
                      AND {voted_up_col} = :voted_up
                      AND timestamp_created > :cutoff
                    ORDER BY {votes_up_col} DESC NULLS LAST
                    LIMIT :limit
                """),
                {
                    "app_id": int(app_id),
                    "voted_up": voted_up_param_val,
                    "cutoff": cutoff,
                    "limit": int(limit),
                },
            )
        else:
            result = conn.execute(
                text(f"""
                    SELECT data
                    FROM reviews
                    WHERE app_id = :app_id
                      AND {voted_up_col} = :voted_up
                    ORDER BY {votes_up_col} DESC NULLS LAST
                    LIMIT :limit
                """),
                {
                    "app_id": int(app_id),
                    "voted_up": voted_up_param_val,
                    "limit": int(limit),
                },
            )

        rows = result.fetchall()

    return [_parse_json_field(row[0], {}) for row in rows]


def get_reviews_by_subcategory(
    app_id: int,
    subcategory: str,
    date_filter: str = "all",
    limit: int = 50,
    order_by: str = "votes_up",
    offset: int = 0,
    sentiment: Optional[str] = None,
    language: Optional[str] = None,
) -> List[dict]:
    """Get reviews that were labeled with a specific subcategory.

    This retrieves reviews based on LLM classification labels, not keyword search.
    Used when user asks about topics (bugs, AI, performance) rather than entities.

    Args:
        app_id: The Steam app ID
        subcategory: The subcategory to filter by (e.g., "technical/bugs", "gameplay/mechanics")
                     Can be partial match (e.g., "bugs" matches "technical/bugs")
        date_filter: One of "30d", "90d", "365d", "all"
        limit: Maximum number of results
        order_by: Order by column - "votes_up" (default) or "timestamp_created"
        offset: Number of results to skip (for pagination)
        sentiment: Optional sentiment filter ("positive" or "negative")
        language: Optional language filter (e.g., "english", "german")

    Returns:
        List of review dicts that have this subcategory label

    Example:
        >>> get_reviews_by_subcategory(1091500, "bugs", "30d", 10)
        # Returns reviews labeled with technical/bugs from last 30 days
    """
    _ALLOWED_ORDER_BY = {"votes_up", "timestamp_created"}
    if order_by not in _ALLOWED_ORDER_BY:
        raise ValueError(f"Invalid order_by value: {order_by!r}")

    from . import db as db_module
    import time

    max_days = _parse_date_filter(date_filter)

    # Normalize subcategory search (handle partial matches)
    # If user says "bugs", match "technical/bugs"
    # If user says "technical/bugs", match exactly
    subcategory_lower = subcategory.lower().strip()

    offset = max(0, int(offset or 0))
    sentiment_value = (sentiment or "").strip().lower()
    sentiment_filter = None
    if sentiment_value in {"positive", "negative"}:
        sentiment_filter = sentiment_value == "positive"

    language_value = (language or "").strip().lower()

    params: Dict[str, Any] = {
        "app_id": int(app_id),
        "subcategory_pattern": f"%{subcategory_lower}%",
        "limit": int(limit),
        "offset": offset,
    }

    # Build subcategory EXISTS clauses (dialect-aware)
    subcat_exists_1 = d.json_array_exists("rl.payload", "subcategories", "LOWER(subcat) LIKE :subcategory_pattern")
    subcat_exists_2 = d.json_array_exists("rl.payload", "issue_subcategories", "LOWER(subcat) LIKE :subcategory_pattern")
    subcat_exists_3 = d.json_array_exists("rl.payload", "request_subcategories", "LOWER(subcat) LIKE :subcategory_pattern")

    where_parts = [
        "r.app_id = :app_id",
        "rl.payload IS NOT NULL",
        f"({subcat_exists_1} OR {subcat_exists_2} OR {subcat_exists_3})",
    ]

    if max_days is not None:
        cutoff = int(time.time()) - (max_days * 24 * 60 * 60)
        where_parts.append("r.timestamp_created > :cutoff")
        params["cutoff"] = cutoff

    if sentiment_filter is not None:
        voted_up = d.json_extract("r.data", "voted_up")
        where_parts.append(f"{d.coalesce_bool(voted_up)} = :is_positive")
        params["is_positive"] = (1 if sentiment_filter else 0) if d.is_sqlite() else sentiment_filter

    if language_value and language_value != "all":
        lang_col = d.json_extract("r.data", "language")
        where_parts.append(f"LOWER(COALESCE({lang_col}, '')) = :language")
        params["language"] = language_value

    where_sql = " AND ".join(where_parts)
    votes_up_col = d.cast_int(d.json_extract("r.data", "votes_up"))
    order_clause = f"ORDER BY {votes_up_col} DESC NULLS LAST"
    if order_by == "timestamp_created":
        order_clause = "ORDER BY r.timestamp_created DESC NULLS LAST"

    with db_module.get_connection() as conn:
        result = conn.execute(
            text(f"""
                SELECT r.data
                FROM reviews r
                JOIN review_labels rl ON r.review_id = rl.review_id AND r.app_id = rl.app_id
                WHERE {where_sql}
                {order_clause}
                LIMIT :limit OFFSET :offset
            """),
            params,
        )
        rows = result.fetchall()

    return [_parse_json_field(row[0], {}) for row in rows]


# Chat Context Functions (for agentic conversation memory)

def save_chat_context(
    session_id: str,
    user_id: str,
    app_ids: List[int],
    last_intent: Optional[str] = None,
    last_subcategories: Optional[List[str]] = None,
    accumulated_facts: Optional[Dict[str, Any]] = None,
    game_names: Optional[Dict[int, str]] = None,
    turn_count: int = 0,
) -> None:
    """Save or update chat context for a session.

    Args:
        session_id: Unique session identifier
        user_id: User ID
        app_ids: List of game app IDs in context
        last_intent: Last detected intent
        last_subcategories: Last discussed subcategories
        accumulated_facts: Key facts established in conversation
        game_names: Mapping of app_id to game name
        turn_count: Number of conversation turns
    """
    from . import db as db_module

    facts_json = json.dumps(accumulated_facts) if accumulated_facts else "{}"
    names_json = json.dumps({str(k): v for k, v in (game_names or {}).items()})
    timestamp = datetime.now(timezone.utc)

    with db_module.get_connection() as conn:
        conn.execute(
            text("""
                INSERT INTO chat_context (
                    session_id, user_id, app_ids, last_intent, last_subcategories,
                    accumulated_facts, game_names, turn_count, created_at, updated_at
                )
                VALUES (
                    :session_id, :user_id, :app_ids, :last_intent, :last_subcategories,
                    :accumulated_facts, :game_names, :turn_count, :created_at, :updated_at
                )
                ON CONFLICT(session_id) DO UPDATE SET
                    app_ids = EXCLUDED.app_ids,
                    last_intent = EXCLUDED.last_intent,
                    last_subcategories = EXCLUDED.last_subcategories,
                    accumulated_facts = EXCLUDED.accumulated_facts,
                    game_names = EXCLUDED.game_names,
                    turn_count = EXCLUDED.turn_count,
                    updated_at = EXCLUDED.updated_at
            """),
            {
                "session_id": session_id,
                "user_id": user_id,
                "app_ids": d.serialize_array(app_ids or []),
                "last_intent": last_intent,
                "last_subcategories": d.serialize_array(last_subcategories or []),
                "accumulated_facts": facts_json,
                "game_names": names_json,
                "turn_count": turn_count,
                "created_at": timestamp,
                "updated_at": timestamp,
            },
        )


def load_chat_context(session_id: str) -> Optional[Dict[str, Any]]:
    """Load chat context for a session.

    Returns:
        Dict with context fields, or None if session doesn't exist
    """
    from . import db as db_module

    with db_module.get_connection() as conn:
        row = conn.execute(
            text("""
                SELECT user_id, app_ids, last_intent, last_subcategories,
                       accumulated_facts, game_names, turn_count, created_at, updated_at
                FROM chat_context
                WHERE session_id = :session_id
            """),
            {"session_id": session_id},
        ).mappings().fetchone()

    if row is None:
        return None

    game_names_raw = _parse_json_field(row["game_names"], {})
    game_names = {int(k): v for k, v in game_names_raw.items()}

    return {
        "session_id": session_id,
        "user_id": row["user_id"],
        "app_ids": d.deserialize_array(row["app_ids"]),
        "last_intent": row["last_intent"],
        "last_subcategories": d.deserialize_array(row["last_subcategories"]),
        "accumulated_facts": _parse_json_field(row["accumulated_facts"], {}),
        "game_names": game_names,
        "turn_count": int(row["turn_count"]) if row["turn_count"] else 0,
        "created_at": _format_ts(row["created_at"]),
        "updated_at": _format_ts(row["updated_at"]),
    }


def update_chat_context_turn(
    session_id: str,
    last_intent: Optional[str] = None,
    last_subcategories: Optional[List[str]] = None,
    new_facts: Optional[Dict[str, Any]] = None,
) -> None:
    """Update chat context after a conversation turn.

    Args:
        session_id: Session to update
        last_intent: New intent to set
        last_subcategories: New subcategories to set
        new_facts: Facts to merge into accumulated_facts
    """
    from . import db as db_module

    timestamp = datetime.now(timezone.utc)

    with db_module.get_connection() as conn:
        if new_facts:
            # Merge new facts into existing accumulated_facts
            facts_merge = d.jsonb_merge("accumulated_facts", ":new_facts")
            conn.execute(
                text(f"""
                    UPDATE chat_context
                    SET last_intent = COALESCE(:last_intent, last_intent),
                        last_subcategories = COALESCE(:last_subcategories, last_subcategories),
                        accumulated_facts = {facts_merge},
                        turn_count = turn_count + 1,
                        updated_at = :updated_at
                    WHERE session_id = :session_id
                """),
                {
                    "session_id": session_id,
                    "last_intent": last_intent,
                    "last_subcategories": last_subcategories,
                    "new_facts": json.dumps(new_facts),
                    "updated_at": timestamp,
                },
            )
        else:
            conn.execute(
                text("""
                    UPDATE chat_context
                    SET last_intent = COALESCE(:last_intent, last_intent),
                        last_subcategories = COALESCE(:last_subcategories, last_subcategories),
                        turn_count = turn_count + 1,
                        updated_at = :updated_at
                    WHERE session_id = :session_id
                """),
                {
                    "session_id": session_id,
                    "last_intent": last_intent,
                    "last_subcategories": last_subcategories,
                    "updated_at": timestamp,
                },
            )


def delete_chat_context(session_id: str) -> None:
    """Delete chat context for a session."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        conn.execute(
            text("DELETE FROM chat_context WHERE session_id = :session_id"),
            {"session_id": session_id},
        )


def save_session_context(
    session_id: str,
    last_topic: Optional[str] = None,
    last_search_results: Optional[List[Dict[str, Any]]] = None,
    last_tool_calls: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """Save extended session context for follow-up queries.

    This supplements chat_context with data needed for "same question but X" scenarios.

    Args:
        session_id: Session identifier
        last_topic: Last discussed subcategory (e.g., "technical/performance")
        last_search_results: Cached search results for "show more"
        last_tool_calls: Tool calls from last turn for reuse
    """
    from . import db as db_module

    # Store in accumulated_facts as JSON
    extended_context = {}
    if last_topic:
        extended_context["last_topic"] = last_topic
    if last_search_results:
        # Store only first 10 to limit size
        extended_context["last_search_results"] = last_search_results[:10]
    if last_tool_calls:
        extended_context["last_tool_calls"] = last_tool_calls[:5]

    if not extended_context:
        return

    timestamp = datetime.now(timezone.utc)

    with db_module.get_connection() as conn:
        # Merge into existing accumulated_facts
        facts_merge = d.jsonb_merge("accumulated_facts", ":new_facts")
        conn.execute(
            text(f"""
                UPDATE chat_context
                SET accumulated_facts = {facts_merge},
                    updated_at = :updated_at
                WHERE session_id = :session_id
            """),
            {
                "session_id": session_id,
                "new_facts": json.dumps(extended_context),
                "updated_at": timestamp,
            },
        )


def load_session_context(session_id: str) -> Dict[str, Any]:
    """Load extended session context for follow-up queries.

    Returns:
        Dict with last_topic, last_search_results, last_tool_calls
    """
    context = load_chat_context(session_id)
    if not context:
        return {
            "last_topic": None,
            "last_search_results": [],
            "last_tool_calls": [],
        }

    facts = context.get("accumulated_facts", {})
    return {
        "last_topic": facts.get("last_topic"),
        "last_search_results": facts.get("last_search_results", []),
        "last_tool_calls": facts.get("last_tool_calls", []),
    }


# Citation Feedback Functions

def save_citation_feedback(
    session_id: str,
    review_id: str,
    helpful: bool,
) -> None:
    """Save user feedback on a citation.

    Args:
        session_id: Chat session where citation appeared
        review_id: ID of the review being rated
        helpful: True if user found citation helpful, False otherwise
    """
    from . import db as db_module

    with db_module.get_connection() as conn:
        conn.execute(
            text("""
                INSERT INTO citation_feedback (user_id, session_id, review_id, helpful)
                VALUES (:user_id, :session_id, :review_id, :helpful)
            """),
            {
                "user_id": _DEFAULT_USER_ID,
                "session_id": session_id,
                "review_id": review_id,
                "helpful": helpful,
            },
        )


def get_citation_feedback_stats(review_id: str) -> Dict[str, int]:
    """Get feedback statistics for a review citation.

    Returns:
        Dict with helpful_count, not_helpful_count, total keys
    """
    from . import db as db_module

    helpful_count = d.count_filter("helpful = 1" if d.is_sqlite() else "helpful = true")
    not_helpful_count = d.count_filter("helpful = 0" if d.is_sqlite() else "helpful = false")

    with db_module.get_connection() as conn:
        result = conn.execute(
            text(f"""
                SELECT
                    {helpful_count} as helpful_count,
                    {not_helpful_count} as not_helpful_count,
                    COUNT(*) as total
                FROM citation_feedback
                WHERE review_id = :review_id
            """),
            {"review_id": review_id},
        )
        row = result.fetchone()

    if not row:
        return {"helpful_count": 0, "not_helpful_count": 0, "total": 0}

    return {
        "helpful_count": int(row[0]) if row[0] else 0,
        "not_helpful_count": int(row[1]) if row[1] else 0,
        "total": int(row[2]) if row[2] else 0,
    }


def get_user_citation_feedback(
    session_id: str,
) -> Dict[str, bool]:
    """Get all citation feedback from a user in a session.

    Returns:
        Dict mapping review_id to helpful boolean
    """
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("""
                SELECT review_id, helpful
                FROM citation_feedback
                WHERE user_id = :user_id AND session_id = :session_id
            """),
            {"user_id": _DEFAULT_USER_ID, "session_id": session_id},
        )
        rows = result.fetchall()

    return {row[0]: row[1] for row in rows}


# Chat Session Functions

def save_chat_session(
    session_id: str,
    user_id: str,
    title: Optional[str] = None,
    app_ids: Optional[List[int]] = None,
    first_user_message: Optional[str] = None,
) -> None:
    """Save or update a chat session metadata.

    Args:
        session_id: Unique session identifier
        user_id: User ID
        title: Optional session title
        app_ids: List of game app IDs
        first_user_message: First message from user (for preview)
    """
    from . import db as db_module

    timestamp = datetime.now(timezone.utc)

    with db_module.get_connection() as conn:
        conn.execute(
            text("""
                INSERT INTO chat_sessions (
                    session_id, user_id, title, app_ids, first_user_message,
                    created_at, updated_at
                )
                VALUES (
                    :session_id, :user_id, :title, :app_ids, :first_user_message,
                    :created_at, :updated_at
                )
                ON CONFLICT(session_id) DO UPDATE SET
                    title = COALESCE(EXCLUDED.title, chat_sessions.title),
                    app_ids = COALESCE(EXCLUDED.app_ids, chat_sessions.app_ids),
                    first_user_message = COALESCE(EXCLUDED.first_user_message, chat_sessions.first_user_message),
                    updated_at = EXCLUDED.updated_at
            """),
            {
                "session_id": session_id,
                "user_id": user_id,
                "title": title,
                "app_ids": d.serialize_array(app_ids or []),
                "first_user_message": first_user_message,
                "created_at": timestamp,
                "updated_at": timestamp,
            },
        )


def update_chat_session_timestamp(session_id: str) -> None:
    """Update the last activity timestamp for a session."""
    from . import db as db_module

    timestamp = datetime.now(timezone.utc)

    with db_module.get_connection() as conn:
        conn.execute(
            text("""
                UPDATE chat_sessions
                SET updated_at = :updated_at
                WHERE session_id = :session_id
            """),
            {"session_id": session_id, "updated_at": timestamp},
        )


def get_chat_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Get chat session metadata."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        row = conn.execute(
            text("""
                SELECT user_id, title, app_ids, first_user_message, created_at, updated_at
                FROM chat_sessions
                WHERE session_id = :session_id
            """),
            {"session_id": session_id},
        ).mappings().fetchone()

    if row is None:
        return None

    return {
        "session_id": session_id,
        "user_id": row["user_id"],
        "title": row["title"],
        "app_ids": d.deserialize_array(row["app_ids"]),
        "first_user_message": row["first_user_message"],
        "created_at": _format_ts(row["created_at"]),
        "updated_at": _format_ts(row["updated_at"]),
    }


def list_chat_sessions_for_user(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """List all chat sessions for a user, most recent first.

    Args:
        user_id: User ID
        limit: Maximum number of sessions to return

    Returns:
        List of session metadata dicts
    """
    from . import db as db_module

    with db_module.get_connection() as conn:
        rows = conn.execute(
            text("""
                SELECT session_id, title, app_ids, first_user_message, created_at, updated_at
                FROM chat_sessions
                WHERE user_id = :user_id
                ORDER BY updated_at DESC
                LIMIT :limit
            """),
            {"user_id": user_id, "limit": limit},
        ).mappings().fetchall()

    sessions = []
    for row in rows:
        sessions.append({
            "session_id": row["session_id"],
            "title": row["title"],
            "app_ids": d.deserialize_array(row["app_ids"]),
            "first_user_message": row["first_user_message"],
            "created_at": _format_ts(row["created_at"]),
            "updated_at": _format_ts(row["updated_at"]),
        })

    return sessions


def delete_chat_session(session_id: str) -> int:
    """Delete a chat session and all its messages.

    Returns:
        Number of messages deleted
    """
    from . import db as db_module

    with db_module.get_connection() as conn:
        # Delete messages
        result = conn.execute(
            text("DELETE FROM chat_messages WHERE session_id = :session_id"),
            {"session_id": session_id},
        )
        messages_deleted = result.rowcount

        # Delete context
        conn.execute(
            text("DELETE FROM chat_context WHERE session_id = :session_id"),
            {"session_id": session_id},
        )

        # Delete citation feedback
        conn.execute(
            text("DELETE FROM citation_feedback WHERE session_id = :session_id"),
            {"session_id": session_id},
        )

        # Delete session
        conn.execute(
            text("DELETE FROM chat_sessions WHERE session_id = :session_id"),
            {"session_id": session_id},
        )

    return messages_deleted


def _get_cutoff_timestamp(seconds_ago: int) -> datetime:
    """Get a datetime object for seconds ago from now."""
    return datetime.fromtimestamp(_get_timestamp() - seconds_ago, tz=timezone.utc)


def generate_comparison_cache_key(
    app_ids: List[int],
    comparison_type: str,
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
) -> str:
    """Generate deterministic cache key for comparison.

    Args:
        app_ids: List of Steam app IDs being compared
        comparison_type: "overview" | "category" | "subcategory"
        category: Main category for category/subcategory comparisons
        subcategory: Specific subcategory for subcategory comparisons

    Returns:
        SHA256 hash string (64 characters)
    """
    import hashlib

    # Sort app_ids for deterministic key
    sorted_ids = sorted(app_ids)

    # Build key components
    key_parts = [
        ",".join(str(aid) for aid in sorted_ids),
        comparison_type,
        category or "",
        subcategory or "",
    ]

    key_string = "|".join(key_parts)
    return hashlib.sha256(key_string.encode()).hexdigest()


def save_comparison_summary(
    app_ids: List[int],
    comparison_type: str,
    category: Optional[str],
    subcategory: Optional[str],
    summary_data: Dict[str, Any],
    ttl_days: int = 7,
) -> str:
    """Save comparison summary to cache.

    Args:
        app_ids: List of Steam app IDs being compared
        comparison_type: "overview" | "category" | "subcategory"
        category: Main category for category/subcategory comparisons
        subcategory: Specific subcategory for subcategory comparisons
        summary_data: The comparison result data
        ttl_days: Time-to-live in days (default 7)

    Returns:
        Cache key string
    """
    from . import db as db_module
    from datetime import timedelta

    cache_key = generate_comparison_cache_key(app_ids, comparison_type, category, subcategory)
    expires_at = datetime.now(timezone.utc) + timedelta(days=ttl_days)

    with db_module.get_connection() as conn:
        conn.execute(
            text("""
                INSERT INTO comparison_summaries (
                    cache_key, app_ids, comparison_type, category, subcategory,
                    summary_data, expires_at, user_id
                )
                VALUES (:cache_key, :app_ids, :comparison_type, :category, :subcategory,
                        :summary_data, :expires_at, :user_id)
                ON CONFLICT (cache_key) DO UPDATE SET
                    summary_data = EXCLUDED.summary_data,
                    expires_at = EXCLUDED.expires_at,
                    created_at = CURRENT_TIMESTAMP
            """),
            {
                "cache_key": cache_key,
                "app_ids": d.serialize_array(app_ids),
                "comparison_type": comparison_type,
                "category": category,
                "subcategory": subcategory,
                "summary_data": json.dumps(summary_data),
                "expires_at": expires_at,
                "user_id": _DEFAULT_USER_ID,
            },
        )

    logger.info(f"Saved comparison summary: cache_key={cache_key}, type={comparison_type}")
    return cache_key


def load_comparison_summary(cache_key: str) -> Optional[Dict[str, Any]]:
    """Load comparison summary from cache if not expired.

    Args:
        cache_key: The cache key to look up

    Returns:
        Summary data dict if found and not expired, None otherwise
    """
    from . import db as db_module

    with db_module.get_connection() as conn:
        row = conn.execute(
            text("""
                SELECT summary_data, expires_at
                FROM comparison_summaries
                WHERE cache_key = :cache_key
            """),
            {"cache_key": cache_key},
        ).mappings().fetchone()

        if not row:
            return None

        # Check if expired
        expires_at = row["expires_at"]
        if datetime.now(timezone.utc) > expires_at:
            logger.info(f"Comparison cache expired: {cache_key}")
            return None

        summary_data = _parse_json_field(row["summary_data"])
        return summary_data






