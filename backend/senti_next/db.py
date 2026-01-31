"""Database engine configuration supporting SQLite and PostgreSQL."""
from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from typing import Generator, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.pool import QueuePool, StaticPool

logger = logging.getLogger(__name__)

_engine: Optional[Engine] = None


def get_database_url() -> str:
    """Get PostgreSQL database URL from environment.

    Environment variables:
        DATABASE_URL: Full PostgreSQL URL (required)
        Or individual components:
        SENTINEXT_DB_HOST, SENTINEXT_DB_PORT, SENTINEXT_DB_NAME,
        SENTINEXT_DB_USER, SENTINEXT_DB_PASSWORD
    """
    # Check for explicit DATABASE_URL first (Render sets this)
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        # Render uses postgres:// but SQLAlchemy requires postgresql://
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        return database_url

    # Build PostgreSQL URL from components
    host = os.getenv("SENTINEXT_DB_HOST")
    port = os.getenv("SENTINEXT_DB_PORT", "5432")
    name = os.getenv("SENTINEXT_DB_NAME")
    user = os.getenv("SENTINEXT_DB_USER")
    password = os.getenv("SENTINEXT_DB_PASSWORD", "")

    if host and name and user:
        return f"postgresql://{user}:{password}@{host}:{port}/{name}"

    # No database configured
    raise RuntimeError(
        "DATABASE_URL is required. Set DATABASE_URL environment variable "
        "or provide SENTINEXT_DB_HOST, SENTINEXT_DB_NAME, and SENTINEXT_DB_USER."
    )


def get_engine() -> Engine:
    """Get or create the SQLAlchemy engine.

    Uses connection pooling for PostgreSQL, StaticPool for SQLite.
    """
    global _engine
    if _engine is not None:
        return _engine

    url = get_database_url()
    is_sqlite = url.startswith("sqlite")

    if is_sqlite:
        # SQLite: use StaticPool for thread safety with check_same_thread=False
        _engine = create_engine(
            url,
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
            echo=os.getenv("SENTINEXT_DB_ECHO", "").lower() in ("1", "true"),
        )
        logger.info("Using SQLite database")
    else:
        # PostgreSQL: use QueuePool with connection pooling
        _engine = create_engine(
            url,
            poolclass=QueuePool,
            pool_size=int(os.getenv("SENTINEXT_DB_POOL_SIZE", "5")),
            max_overflow=int(os.getenv("SENTINEXT_DB_MAX_OVERFLOW", "10")),
            pool_pre_ping=True,  # Verify connections before use
            pool_recycle=1800,   # Recycle connections after 30 minutes
            echo=os.getenv("SENTINEXT_DB_ECHO", "").lower() in ("1", "true"),
        )
        logger.info("Using PostgreSQL database with connection pooling")

    return _engine


def is_postgresql() -> bool:
    """Check if using PostgreSQL backend."""
    url = get_database_url()
    return url.startswith("postgresql")


def is_sqlite() -> bool:
    """Check if using SQLite backend."""
    url = get_database_url()
    return url.startswith("sqlite")


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


def init_postgresql_schema() -> None:
    """Initialize PostgreSQL schema with proper types.

    Creates tables with JSONB columns and appropriate indexes.
    """
    if not is_postgresql():
        return

    with get_connection() as conn:
        # Reviews table with JSONB
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS reviews (
                id SERIAL PRIMARY KEY,
                app_id INTEGER NOT NULL,
                review_id TEXT NOT NULL UNIQUE,
                data JSONB NOT NULL,
                timestamp_created BIGINT,
                timestamp_updated BIGINT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_reviews_app_id ON reviews(app_id)
        """))

        # Review labels table with JSONB
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS review_labels (
                id SERIAL PRIMARY KEY,
                app_id INTEGER NOT NULL,
                review_id TEXT NOT NULL,
                model_id TEXT,
                prompt_version TEXT,
                context_hash TEXT,
                label_payload JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(app_id, review_id)
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_review_labels_app_id ON review_labels(app_id)
        """))

        # Analysis results table with JSONB
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS analysis_results (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                app_id INTEGER NOT NULL,
                status TEXT DEFAULT 'pending',
                run_id TEXT,
                snapshot_hash TEXT,
                context_hash TEXT,
                stale BOOLEAN DEFAULT FALSE,
                metadata JSONB,
                insights JSONB,
                reviews JSONB,
                error TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                app_id INTEGER NOT NULL,
                processed INTEGER DEFAULT 0,
                total INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, app_id)
            )
        """))

        # Starred games table with JSONB
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS starred_games (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                app_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                metadata JSONB,
                insights JSONB,
                sample JSONB,
                genres JSONB,
                categories JSONB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, app_id)
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_starred_games_user_id
            ON starred_games(user_id)
        """))

        # Job registry table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS job_registry (
                job_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                app_id INTEGER NOT NULL,
                job_type TEXT NOT NULL DEFAULT 'analysis',
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                error TEXT,
                metadata JSONB
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_job_registry_status
            ON job_registry(status)
        """))

        # Full-text search using tsvector (PostgreSQL specific)
        conn.execute(text("""
            ALTER TABLE reviews
            ADD COLUMN IF NOT EXISTS search_vector tsvector
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_reviews_search
            ON reviews USING GIN(search_vector)
        """))

        # Migration: Add timestamp columns to reviews table
        conn.execute(text("""
            ALTER TABLE reviews
            ADD COLUMN IF NOT EXISTS timestamp_created BIGINT
        """))
        conn.execute(text("""
            ALTER TABLE reviews
            ADD COLUMN IF NOT EXISTS timestamp_updated BIGINT
        """))

        # Migration: Migrate data from created_at to timestamp_created
        conn.execute(text("""
            UPDATE reviews
            SET timestamp_created = EXTRACT(EPOCH FROM created_at)::BIGINT,
                timestamp_updated = EXTRACT(EPOCH FROM created_at)::BIGINT
            WHERE timestamp_created IS NULL AND created_at IS NOT NULL
        """))

        # Migration: Fix unique constraint on reviews
        # Drop old composite constraint if it exists
        conn.execute(text("""
            ALTER TABLE reviews
            DROP CONSTRAINT IF EXISTS reviews_app_id_review_id_key
        """))

        # Add unique constraint on review_id only (if not exists)
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_review_id_unique'
                ) THEN
                    ALTER TABLE reviews ADD CONSTRAINT reviews_review_id_unique UNIQUE (review_id);
                END IF;
            END $$;
        """))

        logger.info("PostgreSQL schema initialized and migrated")


def close_engine() -> None:
    """Close the database engine and dispose of connection pool."""
    global _engine
    if _engine is not None:
        _engine.dispose()
        _engine = None
        logger.info("Database engine closed")
