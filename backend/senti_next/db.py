"""Database engine configuration for PostgreSQL."""
from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from typing import Generator, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.pool import QueuePool

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
        if not database_url.startswith("postgresql://"):
            raise RuntimeError("DATABASE_URL must be a PostgreSQL URL (postgresql://...).")
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
    """Get or create the SQLAlchemy engine for PostgreSQL."""
    global _engine
    if _engine is not None:
        return _engine

    url = get_database_url()
    if not url.startswith("postgresql://"):
        raise RuntimeError("Only PostgreSQL is supported. Set DATABASE_URL to a postgresql:// URL.")

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
                model TEXT,
                prompt_version TEXT,
                review_hash TEXT,
                payload JSONB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(app_id, review_id)
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_review_labels_app_id ON review_labels(app_id)
        """))
        # Migrate review_labels column names to match storage expectations.
        conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'review_labels' AND column_name = 'model_id'
                ) AND NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'review_labels' AND column_name = 'model'
                ) THEN
                    ALTER TABLE review_labels RENAME COLUMN model_id TO model;
                END IF;

                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'review_labels' AND column_name = 'label_payload'
                ) AND NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'review_labels' AND column_name = 'payload'
                ) THEN
                    ALTER TABLE review_labels RENAME COLUMN label_payload TO payload;
                END IF;

                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'review_labels' AND column_name = 'context_hash'
                ) AND NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'review_labels' AND column_name = 'review_hash'
                ) THEN
                    ALTER TABLE review_labels RENAME COLUMN context_hash TO review_hash;
                END IF;

                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'review_labels' AND column_name = 'created_at'
                ) AND NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'review_labels' AND column_name = 'updated_at'
                ) THEN
                    ALTER TABLE review_labels RENAME COLUMN created_at TO updated_at;
                END IF;
            END $$;
        """))
        # Ensure updated_at exists and uses TIMESTAMP type.
        conn.execute(text("""
            ALTER TABLE review_labels
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        """))
        conn.execute(text("""
            DO $$
            DECLARE col_type TEXT;
            BEGIN
                SELECT data_type INTO col_type
                FROM information_schema.columns
                WHERE table_name = 'review_labels' AND column_name = 'updated_at';
                IF col_type = 'bigint' THEN
                    ALTER TABLE review_labels
                    ALTER COLUMN updated_at TYPE TIMESTAMP
                    USING to_timestamp(updated_at);
                END IF;
            END $$;
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
                stale_reason TEXT,
                metadata JSONB,
                insights JSONB,
                reviews JSONB,
                error TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, app_id)
            )
        """))
        # Ensure newer columns exist on older deployments.
        conn.execute(text("""
            ALTER TABLE IF EXISTS analysis_results
            ADD COLUMN IF NOT EXISTS stale_reason TEXT
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
                phase TEXT DEFAULT 'fetching',
                fetched_count INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, app_id)
            )
        """))

        # Add phase, fetched_count, and cancelled columns if they don't exist (migration)
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='progress' AND column_name='phase') THEN
                    ALTER TABLE progress ADD COLUMN phase TEXT DEFAULT 'fetching';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='progress' AND column_name='fetched_count') THEN
                    ALTER TABLE progress ADD COLUMN fetched_count INTEGER DEFAULT 0;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='progress' AND column_name='cancelled') THEN
                    ALTER TABLE progress ADD COLUMN cancelled BOOLEAN DEFAULT FALSE;
                END IF;
            END $$;
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

        # Add is_favorite column to starred_games (migration)
        conn.execute(text("""
            ALTER TABLE starred_games
            ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE
        """))
        # Partial index for efficient favorite lookups
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_starred_games_favorite
            ON starred_games(is_favorite) WHERE is_favorite = TRUE
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

        # Chat messages table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                session_id TEXT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            ALTER TABLE chat_messages
            ADD COLUMN IF NOT EXISTS session_id TEXT
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id
            ON chat_messages(user_id, created_at DESC)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_chat_messages_session
            ON chat_messages(user_id, session_id, created_at DESC)
        """))

        # Support messages table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS support_messages (
                id SERIAL PRIMARY KEY,
                thread_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                sender_role TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                read_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
                read_by_user BOOLEAN NOT NULL DEFAULT FALSE
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_support_messages_user
            ON support_messages(user_id, created_at DESC)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_support_messages_thread
            ON support_messages(thread_id, created_at DESC)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_support_messages_admin_unread
            ON support_messages(created_at DESC) WHERE read_by_admin = FALSE
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_support_messages_user_unread
            ON support_messages(created_at DESC) WHERE read_by_user = FALSE
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

        # User subscriptions table for credit tier system
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS user_subscriptions (
                user_id TEXT PRIMARY KEY,
                tier TEXT NOT NULL DEFAULT 'free',
                credits_balance INTEGER NOT NULL DEFAULT 500,
                credits_monthly_limit INTEGER NOT NULL DEFAULT 500,
                credits_used_this_period INTEGER NOT NULL DEFAULT 0,
                current_period_start TIMESTAMP NOT NULL DEFAULT NOW(),
                current_period_end TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '1 month',
                stripe_customer_id TEXT,
                stripe_subscription_id TEXT,
                stripe_price_id TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))

        # Credit transactions table for tracking usage
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS credit_transactions (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                amount INTEGER NOT NULL,
                operation TEXT NOT NULL,
                description TEXT,
                app_id INTEGER,
                session_id TEXT,
                balance_after INTEGER NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_credit_transactions_user
            ON credit_transactions(user_id, created_at DESC)
        """))

        # LLM usage table for token metrics
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS llm_usage (
                id SERIAL PRIMARY KEY,
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
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_llm_usage_user
            ON llm_usage(user_id, created_at DESC)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_llm_usage_operation
            ON llm_usage(operation, created_at DESC)
        """))

        # Chat context table for conversation memory
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS chat_context (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                app_ids INTEGER[] DEFAULT '{}',
                last_intent TEXT,
                last_subcategories TEXT[],
                accumulated_facts JSONB DEFAULT '{}',
                game_names JSONB DEFAULT '{}',
                turn_count INTEGER DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_chat_context_user
            ON chat_context(user_id, updated_at DESC)
        """))

        # Citation feedback table for learning from user interactions
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS citation_feedback (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                review_id TEXT NOT NULL,
                helpful BOOLEAN NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_citation_feedback_user
            ON citation_feedback(user_id, session_id, created_at DESC)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_citation_feedback_review
            ON citation_feedback(review_id)
        """))

        # Chat sessions table for managing chat history metadata
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS chat_sessions (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT,
                app_ids INTEGER[] DEFAULT '{}',
                first_user_message TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_chat_sessions_user
            ON chat_sessions(user_id, updated_at DESC)
        """))

        # Comparison summaries table for AI-powered game comparisons
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS comparison_summaries (
                cache_key VARCHAR(64) PRIMARY KEY,
                app_ids INTEGER[] NOT NULL,
                comparison_type VARCHAR(32) NOT NULL,
                category VARCHAR(64),
                subcategory VARCHAR(128),
                summary_data JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                user_id VARCHAR(255) NOT NULL
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_comparison_expires
            ON comparison_summaries(expires_at)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_comparison_user
            ON comparison_summaries(user_id)
        """))

        logger.info("PostgreSQL schema initialized and migrated")


def close_engine() -> None:
    """Close the database engine and dispose of connection pool."""
    global _engine
    if _engine is not None:
        _engine.dispose()
        _engine = None
        logger.info("Database engine closed")
