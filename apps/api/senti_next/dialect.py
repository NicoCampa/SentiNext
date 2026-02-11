"""SQL dialect abstraction for PostgreSQL and SQLite compatibility.

Provides helper functions that generate dialect-specific SQL fragments,
allowing storage.py to work with both PostgreSQL and SQLite databases.
"""
from __future__ import annotations

import hashlib
import os
from typing import Any, Dict, List, Optional, Tuple


def _get_db_url() -> str:
    """Get the database URL from environment (cached)."""
    return os.getenv("DATABASE_URL", "")


def is_sqlite() -> bool:
    """Check if using SQLite backend."""
    url = _get_db_url()
    return url.startswith("sqlite") or not url


def is_postgresql() -> bool:
    """Check if using PostgreSQL backend."""
    url = _get_db_url()
    return url.startswith("postgresql")


# ---------------------------------------------------------------------------
# JSON extraction
# ---------------------------------------------------------------------------

def json_extract(column: str, key: str) -> str:
    """Extract a text value from a JSON/JSONB column.

    PostgreSQL: column->>'key'
    SQLite:     json_extract(column, '$.key')
    """
    if is_sqlite():
        return f"json_extract({column}, '$.{key}')"
    return f"{column}->>'{key}'"


def json_extract_path(column: str, *keys: str) -> str:
    """Extract a nested value from a JSON/JSONB column.

    PostgreSQL: column->'k1'->>'k2'
    SQLite:     json_extract(column, '$.k1.k2')
    """
    if is_sqlite():
        path = ".".join(keys)
        return f"json_extract({column}, '$.{path}')"
    if len(keys) == 1:
        return f"{column}->>'{keys[0]}'"
    intermediate = "->".join(f"'{k}'" for k in keys[:-1])
    return f"{column}->{intermediate}->>'{keys[-1]}'"


def json_arrow(column: str, key: str) -> str:
    """Navigate into a JSON/JSONB column (returns JSON, not text).

    PostgreSQL: column->'key'
    SQLite:     json_extract(column, '$.key')
    """
    if is_sqlite():
        return f"json_extract({column}, '$.{key}')"
    return f"{column}->'{key}'"


# ---------------------------------------------------------------------------
# Type casts
# ---------------------------------------------------------------------------

def cast_int(expr: str) -> str:
    """Cast expression to integer.

    PostgreSQL: (expr)::int
    SQLite:     CAST(expr AS INTEGER)
    """
    if is_sqlite():
        return f"CAST({expr} AS INTEGER)"
    return f"({expr})::int"


def cast_bool(expr: str) -> str:
    """Cast expression to boolean for comparison.

    PostgreSQL: (expr)::boolean
    SQLite:     Direct comparison (json_extract returns 0/1 or 'true'/'false')

    For SQLite, wraps in a CASE that handles JSON boolean representations.
    """
    if is_sqlite():
        return f"(CASE WHEN {expr} IN ('true', '1', 1) THEN 1 ELSE 0 END)"
    return f"({expr})::boolean"


def coalesce_bool(expr: str, default: bool = False) -> str:
    """COALESCE + boolean cast pattern used for voted_up checks.

    PostgreSQL: COALESCE((data->>'voted_up')::boolean, false)
    SQLite:     (CASE WHEN json_extract(data,'$.voted_up') IN ('true','1',1) THEN 1 ELSE 0 END)
    """
    default_val = "1" if default else "0"
    if is_sqlite():
        return f"(CASE WHEN {expr} IN ('true', '1', 1) THEN 1 ELSE 0 END)"
    default_pg = "true" if default else "false"
    return f"COALESCE(({expr})::boolean, {default_pg})"


# ---------------------------------------------------------------------------
# Aggregate functions
# ---------------------------------------------------------------------------

def count_filter(condition: str) -> str:
    """Filtered count aggregate.

    PostgreSQL: COUNT(*) FILTER (WHERE condition)
    SQLite:     SUM(CASE WHEN condition THEN 1 ELSE 0 END)
    """
    if is_sqlite():
        return f"SUM(CASE WHEN {condition} THEN 1 ELSE 0 END)"
    return f"COUNT(*) FILTER (WHERE {condition})"


# ---------------------------------------------------------------------------
# Array parameters
# ---------------------------------------------------------------------------

def any_array(param_name: str, values: list, params: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    """Handle array parameter binding.

    PostgreSQL: column = ANY(:param_name) with list param
    SQLite:     column IN (:p0, :p1, ...) with expanded params

    Returns (sql_fragment, updated_params).
    """
    if is_sqlite():
        placeholders = []
        for i, val in enumerate(values):
            key = f"{param_name}_{i}"
            params[key] = val
            placeholders.append(f":{key}")
        sql = f"IN ({', '.join(placeholders)})"
        return sql, params
    params[param_name] = values
    return f"= ANY(:{param_name})", params


# ---------------------------------------------------------------------------
# JSON array explosion (for subcategory queries)
# ---------------------------------------------------------------------------

def json_array_elements_join(table_alias: str, column: str, key: str, elem_alias: str) -> str:
    """JOIN clause for exploding a JSON array.

    PostgreSQL: JOIN LATERAL jsonb_array_elements_text(rl.payload->'key') AS alias ON true
    SQLite:     JOIN json_each(json_extract(rl.payload, '$.key')) AS alias
    """
    if is_sqlite():
        return f"JOIN json_each(json_extract({table_alias}.{column}, '$.{key}')) AS {elem_alias}"
    return f"JOIN LATERAL jsonb_array_elements_text({table_alias}.{column}->'{key}') AS {elem_alias} ON true"


def json_array_element_value(elem_alias: str) -> str:
    """Reference the value from a json_each / jsonb_array_elements_text.

    PostgreSQL: alias (the alias IS the value in LATERAL)
    SQLite:     alias.value
    """
    if is_sqlite():
        return f"{elem_alias}.value"
    return elem_alias


def json_array_exists(column_expr: str, key: str, condition: str) -> str:
    """EXISTS subquery checking if a JSON array contains matching elements.

    PostgreSQL: EXISTS (SELECT 1 FROM jsonb_array_elements_text(col->'key') AS x WHERE condition(x))
    SQLite:     EXISTS (SELECT 1 FROM json_each(json_extract(col, '$.key')) AS x WHERE condition(x.value))
    """
    if is_sqlite():
        return f"EXISTS (SELECT 1 FROM json_each(json_extract({column_expr}, '$.{key}')) AS _jx WHERE {condition.replace('subcat', '_jx.value')})"
    return f"EXISTS (SELECT 1 FROM jsonb_array_elements_text({column_expr}->'{key}') AS subcat WHERE {condition})"


# ---------------------------------------------------------------------------
# Full-text search
# ---------------------------------------------------------------------------

def fts_match(table_alias: str, query_param: str = ":query") -> str:
    """Full-text search WHERE clause.

    PostgreSQL: table.search_vector @@ plainto_tsquery('simple', :query)
    SQLite:     table.review_id IN (SELECT review_id FROM reviews_fts WHERE reviews_fts MATCH :query)
    """
    if is_sqlite():
        return f"{table_alias}.review_id IN (SELECT review_id FROM reviews_fts WHERE reviews_fts MATCH {query_param})"
    return f"{table_alias}.search_vector @@ plainto_tsquery('simple', {query_param})"


def fts_rank(table_alias: str, query_param: str = ":query") -> str:
    """Full-text search ranking expression for ORDER BY.

    PostgreSQL: ts_rank(table.search_vector, plainto_tsquery('simple', :query))
    SQLite:     (SELECT rank FROM reviews_fts WHERE reviews_fts.review_id = table.review_id AND reviews_fts MATCH :query)
    """
    if is_sqlite():
        return f"(SELECT rank FROM reviews_fts WHERE reviews_fts.review_id = {table_alias}.review_id AND reviews_fts MATCH {query_param})"
    return f"ts_rank({table_alias}.search_vector, plainto_tsquery('simple', {query_param}))"


# ---------------------------------------------------------------------------
# Miscellaneous SQL functions
# ---------------------------------------------------------------------------

def greatest(a: str, b: str) -> str:
    """GREATEST of two values.

    PostgreSQL: GREATEST(a, b)
    SQLite:     MAX(a, b)
    """
    if is_sqlite():
        return f"MAX({a}, {b})"
    return f"GREATEST({a}, {b})"


def now() -> str:
    """Current timestamp.

    PostgreSQL: NOW()
    SQLite:     datetime('now')
    """
    if is_sqlite():
        return "datetime('now')"
    return "NOW()"


def to_timestamp_expr(unix_param: str) -> str:
    """Convert a Unix timestamp parameter to a timestamp.

    PostgreSQL: to_timestamp(:param)
    SQLite:     datetime(:param, 'unixepoch')
    """
    if is_sqlite():
        return f"datetime({unix_param}, 'unixepoch')"
    return f"to_timestamp({unix_param})"


def extract_year_month(ts_expr: str) -> Tuple[str, str]:
    """Extract year and month from a Unix timestamp.

    PostgreSQL: EXTRACT(YEAR FROM to_timestamp(col))::int, EXTRACT(MONTH FROM to_timestamp(col))::int
    SQLite:     CAST(strftime('%Y', col, 'unixepoch') AS INTEGER), CAST(strftime('%m', col, 'unixepoch') AS INTEGER)

    Returns (year_expr, month_expr).
    """
    if is_sqlite():
        return (
            f"CAST(strftime('%Y', {ts_expr}, 'unixepoch') AS INTEGER)",
            f"CAST(strftime('%m', {ts_expr}, 'unixepoch') AS INTEGER)",
        )
    return (
        f"EXTRACT(YEAR FROM to_timestamp({ts_expr}))::int",
        f"EXTRACT(MONTH FROM to_timestamp({ts_expr}))::int",
    )


def returning_clause(column: str) -> str:
    """RETURNING clause (supported by both PG and SQLite 3.35+).

    Both support RETURNING, so this is dialect-neutral but kept for clarity.
    """
    return f"RETURNING {column}"


def md5_fingerprint(column: str, separator: str = ",", order_column: str = "") -> str:
    """Aggregate hash fingerprint of values.

    PostgreSQL: md5(string_agg(column, separator ORDER BY order_column))
    SQLite:     GROUP_CONCAT with Python-side hashing (returns raw concat for Python to hash)
    """
    if is_sqlite():
        if order_column:
            return f"GROUP_CONCAT({column}, '{separator}')"
        return f"GROUP_CONCAT({column}, '{separator}')"
    if order_column:
        return f"md5(string_agg({column}, '{separator}' ORDER BY {order_column}))"
    return f"md5(string_agg({column}, '{separator}'))"


def upsert_search_vector(review_ids_param: str, review_texts_param: str) -> str:
    """Bulk update search vectors after review insert.

    PostgreSQL: UPDATE reviews SET search_vector = to_tsvector(...) FROM unnest arrays
    SQLite:     No-op (FTS5 table is updated via triggers)
    """
    if is_sqlite():
        # SQLite FTS5 is updated via triggers set up in init_sqlite_schema
        return ""
    return f"""
        UPDATE reviews
        SET search_vector = to_tsvector('simple', batch.review_text)
        FROM (SELECT unnest({review_ids_param}) AS review_id, unnest({review_texts_param}) AS review_text) AS batch
        WHERE reviews.review_id = batch.review_id
    """


def jsonb_merge(column: str, param: str) -> str:
    """Merge/concatenate JSON objects.

    PostgreSQL: column || :param  (JSONB concatenation)
    SQLite:     json_patch(column, :param)
    """
    if is_sqlite():
        return f"json_patch({column}, {param})"
    return f"{column} || {param}"


def on_conflict_partial_index(condition: str) -> str:
    """Partial index WHERE clause in CREATE INDEX.

    PostgreSQL: WHERE condition
    SQLite:     WHERE condition (supported in SQLite 3.15+)
    """
    return f"WHERE {condition}"


def serialize_array(values: Optional[list]) -> Any:
    """Serialize a Python list for array column storage.

    PostgreSQL: Pass list directly (native array type)
    SQLite:     JSON-encode to string
    """
    import json
    if values is None:
        if is_sqlite():
            return "[]"
        return []
    if is_sqlite():
        return json.dumps(values)
    return values


def deserialize_array(value: Any) -> list:
    """Deserialize an array column value.

    PostgreSQL: Returns list directly
    SQLite:     JSON-decode from string
    """
    import json
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
