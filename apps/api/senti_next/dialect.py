"""SQL dialect helpers (SQLite).

Provides helper functions that generate SQLite-specific SQL fragments
for use in storage.py and other modules.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import text


def is_sqlite() -> bool:
    """Always True — SentiNext uses SQLite exclusively."""
    return True


# ---------------------------------------------------------------------------
# JSON extraction
# ---------------------------------------------------------------------------

def json_extract(column: str, key: str) -> str:
    """Extract a text value from a JSON column."""
    return f"json_extract({column}, '$.{key}')"


def json_extract_path(column: str, *keys: str) -> str:
    """Extract a nested value from a JSON column."""
    path = ".".join(keys)
    return f"json_extract({column}, '$.{path}')"


def json_arrow(column: str, key: str) -> str:
    """Navigate into a JSON column (returns JSON, not text)."""
    return f"json_extract({column}, '$.{key}')"


# ---------------------------------------------------------------------------
# Type casts
# ---------------------------------------------------------------------------

def cast_int(expr: str) -> str:
    """Cast expression to integer."""
    return f"CAST({expr} AS INTEGER)"


def cast_bool(expr: str) -> str:
    """Cast expression to boolean for comparison.

    Wraps in a CASE that handles JSON boolean representations (0/1, 'true'/'false').
    """
    return f"(CASE WHEN {expr} IN ('true', '1', 1) THEN 1 ELSE 0 END)"


def coalesce_bool(expr: str, default: bool = False) -> str:
    """Boolean cast for voted_up checks."""
    return f"(CASE WHEN {expr} IN ('true', '1', 1) THEN 1 ELSE 0 END)"


# ---------------------------------------------------------------------------
# Aggregate functions
# ---------------------------------------------------------------------------

def count_filter(condition: str) -> str:
    """Filtered count aggregate using SUM(CASE ...)."""
    return f"SUM(CASE WHEN {condition} THEN 1 ELSE 0 END)"


# ---------------------------------------------------------------------------
# Array parameters
# ---------------------------------------------------------------------------

def any_array(param_name: str, values: list, params: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    """Handle array parameter binding with IN (:p0, :p1, ...) expansion."""
    placeholders = []
    for i, val in enumerate(values):
        key = f"{param_name}_{i}"
        params[key] = val
        placeholders.append(f":{key}")
    sql = f"IN ({', '.join(placeholders)})"
    return sql, params


# ---------------------------------------------------------------------------
# JSON array explosion (for subcategory queries)
# ---------------------------------------------------------------------------

def json_array_elements_join(table_alias: str, column: str, key: str, elem_alias: str) -> str:
    """JOIN clause for exploding a JSON array via json_each()."""
    return f"JOIN json_each(json_extract({table_alias}.{column}, '$.{key}')) AS {elem_alias}"


def json_array_element_value(elem_alias: str) -> str:
    """Reference the value from a json_each result."""
    return f"{elem_alias}.value"


def json_array_exists(column_expr: str, key: str, condition: str) -> str:
    """EXISTS subquery checking if a JSON array contains matching elements."""
    return f"EXISTS (SELECT 1 FROM json_each(json_extract({column_expr}, '$.{key}')) AS _jx WHERE {condition.replace('subcat', '_jx.value')})"


# ---------------------------------------------------------------------------
# Full-text search
# ---------------------------------------------------------------------------

def fts_match(table_alias: str, query_param: str = ":query") -> str:
    """Full-text search WHERE clause using FTS5."""
    return f"{table_alias}.review_id IN (SELECT review_id FROM reviews_fts WHERE reviews_fts MATCH {query_param})"


def fts_rank(table_alias: str, query_param: str = ":query") -> str:
    """Full-text search ranking expression for ORDER BY."""
    return f"(SELECT rank FROM reviews_fts WHERE reviews_fts.review_id = {table_alias}.review_id AND reviews_fts MATCH {query_param})"


# ---------------------------------------------------------------------------
# Miscellaneous SQL functions
# ---------------------------------------------------------------------------

def greatest(a: str, b: str) -> str:
    """MAX of two values."""
    return f"MAX({a}, {b})"


def now() -> str:
    """Current timestamp."""
    return "datetime('now')"


def to_timestamp_expr(unix_param: str) -> str:
    """Convert a Unix timestamp parameter to a datetime string."""
    return f"datetime({unix_param}, 'unixepoch')"


def extract_year_month(ts_expr: str) -> Tuple[str, str]:
    """Extract year and month from a Unix timestamp.

    Returns (year_expr, month_expr).
    """
    return (
        f"CAST(strftime('%Y', {ts_expr}, 'unixepoch') AS INTEGER)",
        f"CAST(strftime('%m', {ts_expr}, 'unixepoch') AS INTEGER)",
    )


def returning_clause(column: str) -> str:
    """RETURNING clause (supported in SQLite 3.35+)."""
    return f"RETURNING {column}"


def md5_fingerprint(column: str, separator: str = ",", order_column: str = "") -> str:
    """Aggregate concat of values (Python-side hashing)."""
    return f"GROUP_CONCAT({column}, '{separator}')"


def upsert_search_vector(review_ids_param: str, review_texts_param: str) -> str:
    """No-op for SQLite (FTS5 table is updated via triggers)."""
    return ""


def jsonb_merge(column: str, param: str) -> str:
    """Merge JSON objects using json_patch."""
    return f"json_patch({column}, {param})"


def on_conflict_partial_index(condition: str) -> str:
    """Partial index WHERE clause in CREATE INDEX (supported in SQLite 3.15+)."""
    return f"WHERE {condition}"


def try_advisory_lock(conn, lock_id: int) -> bool:
    """No-op on SQLite — always returns True."""
    return True


def advisory_unlock(conn, lock_id: int) -> None:
    """No-op on SQLite."""
    return


def serialize_array(values: Optional[list]) -> Any:
    """Serialize a Python list to JSON string for storage."""
    if values is None:
        return "[]"
    return json.dumps(values)


def deserialize_array(value: Any) -> list:
    """Deserialize a JSON string to a Python list."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, ValueError):
            return []
    return []
