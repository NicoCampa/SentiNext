"""Database storage for persisted Steam reviews.

PostgreSQL-only backend using SQLAlchemy.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence

from sqlalchemy import text

logger = logging.getLogger(__name__)


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
    """Initialize PostgreSQL database schema."""
    from . import db as db_module
    db_module.init_postgresql_schema()
    logger.info("Initialized PostgreSQL backend")


def upsert_reviews(app_id: int, reviews: Iterable[dict]) -> int:
    """Insert or update the provided reviews. Returns number of upserts."""
    rows = list(reviews)
    if not rows:
        return 0

    from . import db as db_module

    count = 0
    with db_module.get_connection() as conn:
        for review in rows:
            review_id = str(review.get("recommendationid"))
            if not review_id:
                continue
            payload = json.dumps(review)
            timestamp_created = review.get("timestamp_created")
            timestamp_updated = review.get("timestamp_updated")

            result = conn.execute(
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

            # Update search vector for full-text search
            review_text = str(review.get("review") or "")
            if review_text:
                conn.execute(
                    text("""
                        UPDATE reviews
                        SET search_vector = to_tsvector('english', :review_text)
                        WHERE review_id = :review_id
                    """),
                    {"review_text": review_text, "review_id": review_id},
                )

        conn.commit()
    return count


def load_reviews(app_id: int, limit: Optional[int] = None) -> List[dict]:
    """Load reviews for an app, ordered by creation time (newest first)."""
    from . import db as db_module

    query = "SELECT data FROM reviews WHERE app_id = :app_id ORDER BY timestamp_created DESC"
    params = {"app_id": app_id}

    if limit is not None:
        query += " LIMIT :limit"
        params["limit"] = limit

    with db_module.get_connection() as conn:
        result = conn.execute(text(query), params)
        rows = result.fetchall()

    return [_parse_json_field(row[0], {}) for row in rows]


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
            # PostgreSQL supports ANY with array parameter
            result = conn.execute(
                text("""
                    SELECT review_id, data
                    FROM reviews
                    WHERE app_id = :app_id AND review_id = ANY(:review_ids)
                """),
                {"app_id": int(app_id), "review_ids": chunk},
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

    # Convert search query to tsquery format
    # Simple approach: split on spaces and join with &
    query_terms = raw.split()
    ts_query = " & ".join(query_terms)

    lang = (language or "").strip().lower()

    with db_module.get_connection() as conn:
        if lang and lang != "all":
            # Filter by language using JSONB
            result = conn.execute(
                text("""
                    SELECT review_id
                    FROM reviews
                    WHERE app_id = :app_id
                      AND data->>'language' = :language
                      AND search_vector @@ to_tsquery('english', :query)
                    ORDER BY ts_rank(search_vector, to_tsquery('english', :query)) DESC
                    LIMIT :limit
                """),
                {"app_id": int(app_id), "language": lang, "query": ts_query, "limit": int(limit)},
            )
        else:
            result = conn.execute(
                text("""
                    SELECT review_id
                    FROM reviews
                    WHERE app_id = :app_id
                      AND search_vector @@ to_tsquery('english', :query)
                    ORDER BY ts_rank(search_vector, to_tsquery('english', :query)) DESC
                    LIMIT :limit
                """),
                {"app_id": int(app_id), "query": ts_query, "limit": int(limit)},
            )

        rows = result.fetchall()

    return [str(row[0]) for row in rows if row[0]]


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
        conn.commit()


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


def reset_progress(user_id: str, app_id: int, total: int) -> None:
    """Reset progress tracking for an app."""
    from . import db as db_module

    timestamp = datetime.now(timezone.utc)
    with db_module.get_connection() as conn:
        conn.execute(
            text("""
                INSERT INTO progress (user_id, app_id, total, processed, updated_at)
                VALUES (:user_id, :app_id, :total, 0, :updated_at)
                ON CONFLICT(user_id, app_id) DO UPDATE SET
                    total = EXCLUDED.total,
                    processed = EXCLUDED.processed,
                    updated_at = EXCLUDED.updated_at
            """),
            {"user_id": user_id, "app_id": app_id, "total": int(total), "updated_at": timestamp},
        )
        conn.commit()


def update_progress(user_id: str, app_id: int, processed: int, total: Optional[int] = None) -> None:
    """Update progress for classification."""
    from . import db as db_module

    timestamp = datetime.now(timezone.utc)
    new_total = int(total) if total is not None else None

    with db_module.get_connection() as conn:
        conn.execute(
            text("""
                UPDATE progress
                SET processed = :processed,
                    updated_at = :updated_at,
                    total = COALESCE(:total, total)
                WHERE user_id = :user_id AND app_id = :app_id
            """),
            {
                "processed": int(processed),
                "updated_at": timestamp,
                "total": new_total,
                "user_id": user_id,
                "app_id": app_id,
            },
        )
        conn.commit()


def clear_progress(user_id: str, app_id: int) -> None:
    """Clear progress tracking for an app."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        conn.execute(
            text("DELETE FROM progress WHERE user_id = :user_id AND app_id = :app_id"),
            {"user_id": user_id, "app_id": app_id},
        )
        conn.commit()


def load_progress(user_id: str, app_id: int) -> Optional[Dict[str, int]]:
    """Load progress tracking for an app."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("SELECT total, processed, updated_at FROM progress WHERE user_id = :user_id AND app_id = :app_id"),
            {"user_id": user_id, "app_id": app_id},
        )
        row = result.fetchone()

    if row is None:
        return None

    return {
        "total": int(row[0] or 0),
        "processed": int(row[1] or 0),
        "updated_at": _timestamp_to_int(row[2]) or 0,
    }


def save_starred_game(
    user_id: str,
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
                "user_id": user_id,
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
        conn.commit()


def delete_starred_game(user_id: str, app_id: int) -> None:
    """Delete a starred game."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        conn.execute(
            text("DELETE FROM starred_games WHERE user_id = :user_id AND app_id = :app_id"),
            {"user_id": user_id, "app_id": app_id},
        )
        conn.commit()


def delete_all_game_data(app_id: int) -> None:
    """Delete all data associated with a game: reviews, labels, progress, and starred entry."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        conn.execute(text("DELETE FROM reviews WHERE app_id = :app_id"), {"app_id": app_id})
        conn.execute(text("DELETE FROM review_labels WHERE app_id = :app_id"), {"app_id": app_id})
        conn.execute(text("DELETE FROM progress WHERE app_id = :app_id"), {"app_id": app_id})
        conn.execute(text("DELETE FROM starred_games WHERE app_id = :app_id"), {"app_id": app_id})
        conn.execute(text("DELETE FROM analysis_results WHERE app_id = :app_id"), {"app_id": app_id})
        conn.commit()


def get_database_stats(user_id: Optional[str] = None) -> Dict[str, Any]:
    """Get database statistics: counts of games, reviews, labels."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        if not user_id:
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

            # PostgreSQL JSONB syntax: payload->>'main_category'
            result = conn.execute(text("""
                SELECT COUNT(*) FROM review_labels
                WHERE payload->>'main_category' IS NOT NULL
            """))
            new_schema_count = result.fetchone()[0]

            old_schema_count = labels_count - new_schema_count

            result = conn.execute(text("SELECT COUNT(*) FROM starred_games"))
            starred_count = result.fetchone()[0]
        else:
            result = conn.execute(
                text("SELECT app_id FROM starred_games WHERE user_id = :user_id"),
                {"user_id": user_id},
            )
            app_rows = result.fetchall()
            app_ids = [int(row[0]) for row in app_rows]

            if not app_ids:
                return {
                    "games": 0,
                    "reviews": 0,
                    "labels": 0,
                    "labels_new_schema": 0,
                    "labels_old_schema": 0,
                    "starred_games": 0,
                }

            result = conn.execute(
                text("SELECT COUNT(*) FROM reviews WHERE app_id = ANY(:app_ids)"),
                {"app_ids": app_ids},
            )
            reviews_count = result.fetchone()[0]

            result = conn.execute(
                text("SELECT COUNT(*) FROM review_labels WHERE app_id = ANY(:app_ids)"),
                {"app_ids": app_ids},
            )
            labels_count = result.fetchone()[0]

            result = conn.execute(
                text("""
                    SELECT COUNT(*) FROM review_labels
                    WHERE app_id = ANY(:app_ids)
                      AND payload->>'main_category' IS NOT NULL
                """),
                {"app_ids": app_ids},
            )
            new_schema_count = result.fetchone()[0]

            old_schema_count = labels_count - new_schema_count
            starred_count = len(app_ids)
            games_count = starred_count

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
        conn.commit()
        return count


def clear_old_schema_labels() -> int:
    """Delete labels with old schema (missing main_category field). Returns count of deleted labels."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        # PostgreSQL JSONB syntax
        result = conn.execute(text("""
            DELETE FROM review_labels
            WHERE payload->>'main_category' IS NULL
        """))
        count = result.rowcount
        conn.commit()
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
        conn.commit()

        return {
            "reviews": reviews_count,
            "labels": labels_count,
            "progress": progress_count,
            "starred_games": starred_count,
            "analysis_results": analysis_count,
        }


def load_starred_games(user_id: str) -> list[Dict[str, Any]]:
    """Load all starred games for a user."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("""
                SELECT app_id, name, metadata, insights, sample, genres, categories, updated_at
                FROM starred_games
                WHERE user_id = :user_id
                ORDER BY updated_at DESC
            """),
            {"user_id": user_id},
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
            }
        )

    return results


def load_user_app_ids(user_id: str) -> List[int]:
    """Load all app IDs for a user's starred games."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("SELECT app_id FROM starred_games WHERE user_id = :user_id"),
            {"user_id": user_id},
        )
        rows = result.fetchall()
    return [int(row[0]) for row in rows if row[0] is not None]


def user_has_game(user_id: str, app_id: int) -> bool:
    """Check if a user has starred a game."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("SELECT 1 FROM starred_games WHERE user_id = :user_id AND app_id = :app_id LIMIT 1"),
            {"user_id": user_id, "app_id": int(app_id)},
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


def list_database_games(user_id: str) -> List[Dict[str, Any]]:
    """List games for a specific user."""
    from . import db as db_module

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("SELECT app_id, name FROM starred_games WHERE user_id = :user_id ORDER BY app_id"),
            {"user_id": user_id},
        )
        starred_rows = result.fetchall()

    return [
        {"app_id": int(row[0]), "name": row[1]}
        for row in starred_rows
        if row[0] is not None
    ]


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
            where_parts = ["reviews.search_vector @@ plainto_tsquery('english', :query)"]
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
                where_parts.append("reviews.data->>'language' = :lang")
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

            query_sql = f"""
                SELECT reviews.review_id, reviews.app_id, reviews.data, reviews.timestamp_created,
                       review_labels.payload AS label_payload
                FROM reviews
                LEFT JOIN review_labels
                  ON reviews.review_id = review_labels.review_id AND reviews.app_id = review_labels.app_id
                WHERE {where_sql}
                ORDER BY ts_rank(reviews.search_vector, plainto_tsquery('english', :query)) DESC
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
                where_parts.append("reviews.data->>'language' = :lang")
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
    user_id: str,
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
    with db_module.get_connection() as conn:
        from sqlalchemy import text
        conn.execute(
            text("""
            INSERT INTO analysis_results (user_id, app_id, metadata, insights, reviews, status, error, updated_at, run_id, snapshot_hash, stale, context_hash, stale_reason)
            VALUES (:user_id, :app_id, :metadata, :insights, :reviews, :status, :error, to_timestamp(:updated_at), :run_id, :snapshot_hash, :stale, :context_hash, :stale_reason)
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
                "user_id": user_id,
                "app_id": app_id,
                "metadata": payload_metadata,
                "insights": payload_insights,
                "reviews": payload_reviews,
                "status": status,
                "error": error,
                "updated_at": timestamp,
                "run_id": run_id,
                "snapshot_hash": snapshot_hash,
                "stale": stale,
                "context_hash": context_hash,
                "stale_reason": stale_reason,
            },
        )


def load_analysis_result(user_id: str, app_id: int) -> Optional[Dict[str, Any]]:
    from . import db as db_module
    with db_module.get_connection() as conn:
        row = conn.execute(
            text("""
            SELECT metadata, insights, reviews, status, error, updated_at, run_id, snapshot_hash, stale, context_hash, stale_reason
            FROM analysis_results
            WHERE user_id = :user_id AND app_id = :app_id
            """),
            {"user_id": user_id, "app_id": app_id},
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
    user_id: str,
    app_id: int,
    job_type: str = "analysis",
    metadata: Optional[Dict] = None,
) -> None:
    """Create a new job registry entry."""
    timestamp = _get_timestamp()
    metadata_json = json.dumps(metadata) if metadata else None
    from . import db as db_module
    with db_module.get_connection() as conn:
        from sqlalchemy import text
        conn.execute(
            text("""
            INSERT INTO job_registry (job_id, user_id, app_id, job_type, status, created_at, metadata)
            VALUES (:job_id, :user_id, :app_id, :job_type, 'pending', to_timestamp(:created_at), :metadata)
            ON CONFLICT(job_id) DO UPDATE SET
                status = 'pending',
                created_at = EXCLUDED.created_at,
                metadata = EXCLUDED.metadata
            """),
            {
                "job_id": job_id,
                "user_id": user_id,
                "app_id": app_id,
                "job_type": job_type,
                "created_at": timestamp,
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
    with db_module.get_connection() as conn:
        from sqlalchemy import text
        if status == "running":
            conn.execute(
                text("UPDATE job_registry SET status = :status, started_at = to_timestamp(:started_at) WHERE job_id = :job_id"),
                {"status": status, "started_at": timestamp, "job_id": job_id},
            )
        elif status in ("completed", "failed"):
            conn.execute(
                text("UPDATE job_registry SET status = :status, completed_at = to_timestamp(:completed_at), error = :error WHERE job_id = :job_id"),
                {"status": status, "completed_at": timestamp, "error": error, "job_id": job_id},
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
        conn.commit()
    return count
