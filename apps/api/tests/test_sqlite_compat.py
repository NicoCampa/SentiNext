"""SQLite compatibility integration tests.

Tests that the backend works correctly with SQLite as the database,
verifying schema creation, basic CRUD, FTS5 search, and dialect helpers.
"""
import json
import os
import sys
import time
from pathlib import Path

import pytest

# Ensure apps/api is on sys.path so `senti_next` package is importable
API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

# Force SQLite before any senti_next imports
os.environ["DATABASE_URL"] = "sqlite://"

from senti_next import db as db_module
from senti_next import dialect as d
from senti_next import storage


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _sqlite_env(monkeypatch):
    """Ensure every test uses in-memory SQLite."""
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    # Reset engine to pick up the new URL
    db_module.close_engine()
    db_module._engine = None
    db_module.init_db()
    yield
    db_module.close_engine()
    db_module._engine = None


# ---------------------------------------------------------------------------
# 1. Schema creation
# ---------------------------------------------------------------------------

class TestSchemaInit:
    def test_all_tables_created(self):
        """All expected tables exist after init_sqlite_schema."""
        expected = {
            "reviews", "reviews_fts", "review_labels", "analysis_results",
            "progress", "starred_games", "job_registry", "chat_messages",
            "llm_usage", "chat_context", "citation_feedback",
            "chat_sessions", "comparison_summaries",
        }
        with db_module.get_connection() as conn:
            from sqlalchemy import text
            rows = conn.execute(
                text("SELECT name FROM sqlite_master WHERE type IN ('table', 'vtable')")
            ).fetchall()
            tables = {r[0] for r in rows}

        assert expected.issubset(tables), f"Missing tables: {expected - tables}"

    def test_fts5_virtual_table(self):
        """reviews_fts is an FTS5 virtual table."""
        with db_module.get_connection() as conn:
            from sqlalchemy import text
            row = conn.execute(
                text("SELECT sql FROM sqlite_master WHERE name = 'reviews_fts'")
            ).fetchone()
        assert row is not None
        assert "fts5" in row[0].lower()


# ---------------------------------------------------------------------------
# 2. Reviews CRUD
# ---------------------------------------------------------------------------

class TestReviewsCRUD:
    def _insert_review(self, conn, app_id, review_id, voted_up=True, language="english", votes_up=5):
        from sqlalchemy import text
        data = json.dumps({
            "recommendationid": review_id,
            "voted_up": voted_up,
            "language": language,
            "votes_up": votes_up,
            "review": f"Test review {review_id}",
        })
        conn.execute(
            text("""
                INSERT OR IGNORE INTO reviews (app_id, review_id, data, timestamp_created)
                VALUES (:app_id, :review_id, :data, :ts)
            """),
            {"app_id": app_id, "review_id": review_id, "data": data, "ts": int(time.time())},
        )

    def test_insert_and_query(self):
        with db_module.get_connection() as conn:
            from sqlalchemy import text
            self._insert_review(conn, 730, "r1")
            row = conn.execute(
                text("SELECT data FROM reviews WHERE review_id = 'r1'")
            ).fetchone()
        assert row is not None
        parsed = json.loads(row[0])
        assert parsed["voted_up"] is True

    def test_json_extract(self):
        """Dialect json_extract helper works with SQLite."""
        with db_module.get_connection() as conn:
            from sqlalchemy import text
            self._insert_review(conn, 730, "r2", language="german")
            lang_col = d.json_extract("data", "language")
            row = conn.execute(
                text(f"SELECT {lang_col} FROM reviews WHERE review_id = 'r2'")
            ).fetchone()
        assert row[0] == "german"


# ---------------------------------------------------------------------------
# 3. FTS5 search
# ---------------------------------------------------------------------------

class TestFTS5:
    def _populate(self, conn):
        from sqlalchemy import text
        for i, (rid, review_text) in enumerate([
            ("fts1", "Great performance and smooth gameplay"),
            ("fts2", "Terrible bugs and crashes everywhere"),
            ("fts3", "Nice graphics but bad network lag"),
        ]):
            data = json.dumps({"recommendationid": rid, "review": review_text, "voted_up": True, "language": "english"})
            conn.execute(
                text("""
                    INSERT OR IGNORE INTO reviews (app_id, review_id, data, timestamp_created)
                    VALUES (100, :rid, :data, :ts)
                """),
                {"rid": rid, "data": data, "ts": int(time.time()) - i},
            )
            # Insert into FTS5
            conn.execute(
                text("INSERT INTO reviews_fts (review_id, review_text) VALUES (:rid, :txt)"),
                {"rid": rid, "txt": review_text},
            )

    def test_fts_match_helper(self):
        with db_module.get_connection() as conn:
            from sqlalchemy import text
            self._populate(conn)
            match_clause = d.fts_match("r", ":q")
            rows = conn.execute(
                text(f"SELECT r.review_id FROM reviews r WHERE {match_clause}"),
                {"q": "performance"},
            ).fetchall()
        assert len(rows) == 1
        assert rows[0][0] == "fts1"

    def test_fts_rank_helper(self):
        with db_module.get_connection() as conn:
            from sqlalchemy import text
            self._populate(conn)
            match_clause = d.fts_match("r", ":q")
            rank_expr = d.fts_rank("r", ":q")
            rows = conn.execute(
                text(f"SELECT r.review_id, {rank_expr} AS rank FROM reviews r WHERE {match_clause} ORDER BY rank"),
                {"q": "bugs crashes"},
            ).fetchall()
        assert len(rows) >= 1
        assert rows[0][0] == "fts2"


# ---------------------------------------------------------------------------
# 4. Dialect helpers unit tests
# ---------------------------------------------------------------------------

class TestDialectHelpers:
    def test_is_sqlite(self):
        assert d.is_sqlite() is True
        assert d.is_postgresql() is False

    def test_cast_int(self):
        expr = d.cast_int("'42'")
        assert "CAST" in expr

    def test_cast_bool(self):
        expr = d.cast_bool("'true'")
        assert "CASE" in expr

    def test_count_filter(self):
        expr = d.count_filter("x > 0")
        assert "SUM(CASE" in expr

    def test_greatest(self):
        expr = d.greatest("a", "b")
        assert expr == "MAX(a, b)"

    def test_now(self):
        assert d.now() == "datetime('now')"

    def test_jsonb_merge(self):
        expr = d.jsonb_merge("col", ":param")
        assert "json_patch" in expr

    def test_any_array(self):
        params = {}
        sql, params = d.any_array("ids", [1, 2, 3], params)
        assert "IN" in sql
        assert len(params) == 3

    def test_serialize_deserialize_array(self):
        original = [1, 2, 3]
        serialized = d.serialize_array(original)
        assert isinstance(serialized, str)
        deserialized = d.deserialize_array(serialized)
        assert deserialized == original

    def test_deserialize_array_none(self):
        assert d.deserialize_array(None) == []

    def test_extract_year_month(self):
        year_expr, month_expr = d.extract_year_month("timestamp_created")
        assert "strftime" in year_expr
        assert "strftime" in month_expr

    def test_json_array_exists(self):
        expr = d.json_array_exists("rl.payload", "subcategories", "LOWER(subcat) LIKE '%test%'")
        assert "json_each" in expr

    def test_to_timestamp_expr(self):
        expr = d.to_timestamp_expr(":ts")
        assert "unixepoch" in expr


# ---------------------------------------------------------------------------
# 5. Chat context (array serialization round-trip)
# ---------------------------------------------------------------------------

class TestChatContext:
    def test_save_and_load_context(self):
        storage.save_chat_context(
            session_id="test-session-1",
            user_id="local",
            app_ids=[730, 570],
            last_intent="issue_report",
            last_subcategories=["technical/performance"],
            accumulated_facts={"key": "value"},
            game_names={730: "Counter-Strike 2", 570: "Dota 2"},
        )
        ctx = storage.load_chat_context("test-session-1")
        assert ctx is not None
        assert ctx["app_ids"] == [730, 570]
        assert ctx["last_subcategories"] == ["technical/performance"]
        assert ctx["accumulated_facts"] == {"key": "value"}
        assert ctx["game_names"] == {730: "Counter-Strike 2", 570: "Dota 2"}

    def test_save_and_load_session(self):
        storage.save_chat_session(
            session_id="test-session-2",
            user_id="local",
            title="Test session",
            app_ids=[730],
            first_user_message="Hello",
        )
        session = storage.get_chat_session("test-session-2")
        assert session is not None
        assert session["app_ids"] == [730]
        assert session["title"] == "Test session"

    def test_list_sessions(self):
        storage.save_chat_session(
            session_id="test-session-3",
            user_id="local",
            title="Session 3",
            app_ids=[730],
        )
        sessions = storage.list_chat_sessions_for_user("local")
        assert any(s["session_id"] == "test-session-3" for s in sessions)


# ---------------------------------------------------------------------------
# 6. Count filter + JSON extract in queries
# ---------------------------------------------------------------------------

class TestAggregateQueries:
    def _seed_reviews(self, conn):
        from sqlalchemy import text
        ts = int(time.time())
        for i, voted_up in enumerate([True, True, False, True, False]):
            rid = f"agg_{i}"
            data = json.dumps({
                "recommendationid": rid,
                "voted_up": voted_up,
                "language": "english",
                "votes_up": 10 - i,
                "review": f"Review {i}",
            })
            conn.execute(
                text("""
                    INSERT OR IGNORE INTO reviews (app_id, review_id, data, timestamp_created)
                    VALUES (999, :rid, :data, :ts)
                """),
                {"rid": rid, "data": data, "ts": ts - (i * 3600)},
            )

    def test_count_filter_in_query(self):
        """Verify COUNT FILTER replacement works in a real query."""
        with db_module.get_connection() as conn:
            from sqlalchemy import text
            self._seed_reviews(conn)

            voted_up = d.json_extract("data", "voted_up")
            rec = d.count_filter(f"{d.cast_bool(voted_up)} = 1")
            not_rec = d.count_filter(f"{d.cast_bool(voted_up)} = 0")

            row = conn.execute(
                text(f"""
                    SELECT {rec} as recommended, {not_rec} as not_recommended, COUNT(*) as total
                    FROM reviews
                    WHERE app_id = 999 AND {voted_up} IS NOT NULL
                """)
            ).fetchone()

        assert row is not None
        assert int(row[0]) == 3  # 3 positive
        assert int(row[1]) == 2  # 2 negative
        assert int(row[2]) == 5  # 5 total
