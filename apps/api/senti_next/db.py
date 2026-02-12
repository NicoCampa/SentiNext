"""Database engine configuration (SQLite)."""
from __future__ import annotations

import logging
import os
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Generator, Optional

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool

logger = logging.getLogger(__name__)

# Signals when init_db() and logging setup have completed.
# Checked by the health endpoint and startup gate middleware.
startup_complete = threading.Event()

_engine: Optional[Engine] = None


def _default_sqlite_path() -> str:
    """Return the default SQLite database path using platformdirs."""
    try:
        from platformdirs import user_data_dir
        data_dir = Path(user_data_dir("SentiNext", "SentiNext"))
    except ImportError:
        # Fallback if platformdirs is not installed
        data_dir = Path.home() / ".sentinext" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return str(data_dir / "sentinext.db")


def get_database_url() -> str:
    """Get SQLite database URL.

    Environment variables:
        DATABASE_URL: Full sqlite:/// URL (optional, defaults to platformdirs location)
    """
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        if database_url.startswith("sqlite"):
            return database_url
        raise RuntimeError(
            "DATABASE_URL must be a SQLite URL (sqlite:///...). "
            "PostgreSQL is no longer supported — SentiNext uses SQLite for all deployments."
        )

    db_path = _default_sqlite_path()
    logger.info("No DATABASE_URL set, defaulting to SQLite: %s", db_path)
    return f"sqlite:///{db_path}"


def get_engine() -> Engine:
    """Get or create the SQLAlchemy engine."""
    global _engine
    if _engine is not None:
        return _engine

    url = get_database_url()

    _engine = create_engine(
        url,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
        echo=os.getenv("SENTINEXT_DB_ECHO", "").lower() in ("1", "true"),
    )

    # Enable WAL mode and foreign keys for better concurrency
    @event.listens_for(_engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    logger.info("Using SQLite database")
    return _engine


def is_sqlite() -> bool:
    """Check if using SQLite backend. Always True."""
    return True


@contextmanager
def get_connection() -> Generator:
    """Get a database connection from the pool.

    Usage:
        with get_connection() as conn:
            result = conn.execute(text("SELECT 1"))
    """
    engine = get_engine()
    connection = engine.connect()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_db() -> None:
    """Initialize the SQLite database schema."""
    with get_connection() as conn:
        # Reviews table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_id INTEGER NOT NULL,
                review_id TEXT NOT NULL UNIQUE,
                data TEXT NOT NULL,
                timestamp_created INTEGER,
                timestamp_updated INTEGER,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_reviews_app_id ON reviews(app_id)
        """))

        # FTS5 virtual table for full-text search
        conn.execute(text("""
            CREATE VIRTUAL TABLE IF NOT EXISTS reviews_fts USING fts5(
                review_id,
                review_text,
                tokenize='unicode61'
            )
        """))

        # Review labels table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS review_labels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_id INTEGER NOT NULL,
                review_id TEXT NOT NULL,
                model TEXT,
                prompt_version TEXT,
                review_hash TEXT,
                payload TEXT,
                updated_at TEXT DEFAULT (datetime('now')),
                UNIQUE(app_id, review_id)
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_review_labels_app_id ON review_labels(app_id)
        """))

        # Analysis results table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS analysis_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                app_id INTEGER NOT NULL,
                status TEXT DEFAULT 'pending',
                run_id TEXT,
                snapshot_hash TEXT,
                context_hash TEXT,
                stale INTEGER DEFAULT 0,
                stale_reason TEXT,
                metadata TEXT,
                insights TEXT,
                reviews TEXT,
                error TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                UNIQUE(user_id, app_id)
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_analysis_results_user_app
            ON analysis_results(user_id, app_id)
        """))

        # Progress table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                app_id INTEGER NOT NULL,
                processed INTEGER DEFAULT 0,
                total INTEGER DEFAULT 0,
                phase TEXT DEFAULT 'fetching',
                fetched_count INTEGER DEFAULT 0,
                cancelled INTEGER DEFAULT 0,
                updated_at TEXT DEFAULT (datetime('now')),
                UNIQUE(user_id, app_id)
            )
        """))

        # Starred games table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS starred_games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                app_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                metadata TEXT,
                insights TEXT,
                sample TEXT,
                genres TEXT,
                categories TEXT,
                is_favorite INTEGER DEFAULT 0,
                updated_at TEXT DEFAULT (datetime('now')),
                UNIQUE(user_id, app_id)
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_starred_games_user_id ON starred_games(user_id)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_starred_games_favorite
            ON starred_games(is_favorite) WHERE is_favorite = 1
        """))

        # Chat messages table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                session_id TEXT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id
            ON chat_messages(user_id, created_at DESC)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_chat_messages_session
            ON chat_messages(user_id, session_id, created_at DESC)
        """))

        # LLM usage table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS llm_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                operation TEXT NOT NULL,
                model TEXT,
                prompt_tokens INTEGER,
                response_tokens INTEGER,
                total_tokens INTEGER,
                cached_tokens INTEGER,
                tool_use_prompt_tokens INTEGER,
                thoughts_tokens INTEGER,
                traffic_type TEXT,
                app_id INTEGER,
                session_id TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_llm_usage_user ON llm_usage(user_id, created_at DESC)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_llm_usage_operation ON llm_usage(operation, created_at DESC)
        """))

        # Chat context table (arrays stored as JSON text)
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS chat_context (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                app_ids TEXT DEFAULT '[]',
                last_intent TEXT,
                last_subcategories TEXT DEFAULT '[]',
                accumulated_facts TEXT DEFAULT '{}',
                game_names TEXT DEFAULT '{}',
                turn_count INTEGER DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_chat_context_user ON chat_context(user_id, updated_at DESC)
        """))

        # Citation feedback table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS citation_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                review_id TEXT NOT NULL,
                helpful INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_citation_feedback_user
            ON citation_feedback(user_id, session_id, created_at DESC)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_citation_feedback_review ON citation_feedback(review_id)
        """))

        # Chat sessions table (app_ids stored as JSON text)
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS chat_sessions (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT,
                app_ids TEXT DEFAULT '[]',
                first_user_message TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id, updated_at DESC)
        """))

        # Comparison summaries table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS comparison_summaries (
                cache_key TEXT PRIMARY KEY,
                app_ids TEXT NOT NULL,
                comparison_type TEXT NOT NULL,
                category TEXT,
                subcategory TEXT,
                summary_data TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                expires_at TEXT NOT NULL,
                user_id TEXT NOT NULL
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_comparison_expires ON comparison_summaries(expires_at)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_comparison_user ON comparison_summaries(user_id)
        """))

        logger.info("SQLite schema initialized")


def check_db_health() -> bool:
    """Check if the database is reachable by executing SELECT 1."""
    try:
        with get_connection() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def close_engine() -> None:
    """Close the database engine and dispose of connection pool."""
    global _engine
    if _engine is not None:
        _engine.dispose()
        _engine = None
        logger.info("Database engine closed")
