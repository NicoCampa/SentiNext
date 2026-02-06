"""initial schema baseline

Revision ID: d0087513cf86
Revises:
Create Date: 2026-02-06 17:30:05.701650

This is a baseline migration capturing the existing schema.
For EXISTING databases: run `alembic stamp head` to mark as current.
For NEW databases: run `alembic upgrade head` to create all tables.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'd0087513cf86'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- reviews ---
    op.create_table(
        'reviews',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('app_id', sa.Integer, nullable=False),
        sa.Column('review_id', sa.Text, nullable=False, unique=True),
        sa.Column('data', postgresql.JSONB, nullable=False),
        sa.Column('timestamp_created', sa.BigInteger),
        sa.Column('timestamp_updated', sa.BigInteger),
        sa.Column('search_vector', postgresql.TSVECTOR),
        sa.Column('created_at', sa.DateTime, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('idx_reviews_app_id', 'reviews', ['app_id'])
    op.create_index('idx_reviews_search', 'reviews', ['search_vector'], postgresql_using='gin')

    # --- review_labels ---
    op.create_table(
        'review_labels',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('app_id', sa.Integer, nullable=False),
        sa.Column('review_id', sa.Text, nullable=False),
        sa.Column('model', sa.Text),
        sa.Column('prompt_version', sa.Text),
        sa.Column('review_hash', sa.Text),
        sa.Column('payload', postgresql.JSONB),
        sa.Column('updated_at', sa.DateTime, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint('app_id', 'review_id'),
    )
    op.create_index('idx_review_labels_app_id', 'review_labels', ['app_id'])

    # --- analysis_results ---
    op.create_table(
        'analysis_results',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Text, nullable=False),
        sa.Column('app_id', sa.Integer, nullable=False),
        sa.Column('status', sa.Text, server_default='pending'),
        sa.Column('run_id', sa.Text),
        sa.Column('snapshot_hash', sa.Text),
        sa.Column('context_hash', sa.Text),
        sa.Column('stale', sa.Boolean, server_default='false'),
        sa.Column('stale_reason', sa.Text),
        sa.Column('metadata', postgresql.JSONB),
        sa.Column('insights', postgresql.JSONB),
        sa.Column('reviews', postgresql.JSONB),
        sa.Column('error', sa.Text),
        sa.Column('created_at', sa.DateTime, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint('user_id', 'app_id'),
    )
    op.create_index('idx_analysis_results_user_app', 'analysis_results', ['user_id', 'app_id'])

    # --- progress ---
    op.create_table(
        'progress',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Text, nullable=False),
        sa.Column('app_id', sa.Integer, nullable=False),
        sa.Column('processed', sa.Integer, server_default='0'),
        sa.Column('total', sa.Integer, server_default='0'),
        sa.Column('phase', sa.Text, server_default='fetching'),
        sa.Column('fetched_count', sa.Integer, server_default='0'),
        sa.Column('cancelled', sa.Boolean, server_default='false'),
        sa.Column('updated_at', sa.DateTime, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint('user_id', 'app_id'),
    )

    # --- starred_games ---
    op.create_table(
        'starred_games',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Text, nullable=False),
        sa.Column('app_id', sa.Integer, nullable=False),
        sa.Column('name', sa.Text, nullable=False),
        sa.Column('metadata', postgresql.JSONB),
        sa.Column('insights', postgresql.JSONB),
        sa.Column('sample', postgresql.JSONB),
        sa.Column('genres', postgresql.JSONB),
        sa.Column('categories', postgresql.JSONB),
        sa.Column('is_favorite', sa.Boolean, server_default='false'),
        sa.Column('updated_at', sa.DateTime, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint('user_id', 'app_id'),
    )
    op.create_index('idx_starred_games_user_id', 'starred_games', ['user_id'])
    op.create_index('idx_starred_games_favorite', 'starred_games', ['is_favorite'],
                     postgresql_where=sa.text('is_favorite = TRUE'))

    # --- job_registry ---
    op.create_table(
        'job_registry',
        sa.Column('job_id', sa.Text, primary_key=True),
        sa.Column('user_id', sa.Text, nullable=False),
        sa.Column('app_id', sa.Integer, nullable=False),
        sa.Column('job_type', sa.Text, nullable=False, server_default='analysis'),
        sa.Column('status', sa.Text, nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('started_at', sa.DateTime),
        sa.Column('completed_at', sa.DateTime),
        sa.Column('error', sa.Text),
        sa.Column('metadata', postgresql.JSONB),
    )
    op.create_index('idx_job_registry_status', 'job_registry', ['status'])

    # --- chat_messages ---
    op.create_table(
        'chat_messages',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Text, nullable=False),
        sa.Column('session_id', sa.Text),
        sa.Column('role', sa.Text, nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('idx_chat_messages_user_id', 'chat_messages', ['user_id', 'created_at'])
    op.create_index('idx_chat_messages_session', 'chat_messages', ['user_id', 'session_id', 'created_at'])

    # --- chat_sessions ---
    op.create_table(
        'chat_sessions',
        sa.Column('session_id', sa.Text, primary_key=True),
        sa.Column('user_id', sa.Text, nullable=False),
        sa.Column('title', sa.Text),
        sa.Column('app_ids', postgresql.ARRAY(sa.Integer), server_default='{}'),
        sa.Column('first_user_message', sa.Text),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('idx_chat_sessions_user', 'chat_sessions', ['user_id', 'updated_at'])

    # --- chat_context ---
    op.create_table(
        'chat_context',
        sa.Column('session_id', sa.Text, primary_key=True),
        sa.Column('user_id', sa.Text, nullable=False),
        sa.Column('app_ids', postgresql.ARRAY(sa.Integer), server_default='{}'),
        sa.Column('last_intent', sa.Text),
        sa.Column('last_subcategories', postgresql.ARRAY(sa.Text)),
        sa.Column('accumulated_facts', postgresql.JSONB, server_default='{}'),
        sa.Column('game_names', postgresql.JSONB, server_default='{}'),
        sa.Column('turn_count', sa.Integer, server_default='0'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('idx_chat_context_user', 'chat_context', ['user_id', 'updated_at'])

    # --- citation_feedback ---
    op.create_table(
        'citation_feedback',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Text, nullable=False),
        sa.Column('session_id', sa.Text, nullable=False),
        sa.Column('review_id', sa.Text, nullable=False),
        sa.Column('helpful', sa.Boolean, nullable=False),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('idx_citation_feedback_user', 'citation_feedback', ['user_id', 'session_id', 'created_at'])
    op.create_index('idx_citation_feedback_review', 'citation_feedback', ['review_id'])

    # --- support_messages ---
    op.create_table(
        'support_messages',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('thread_id', sa.Text, nullable=False),
        sa.Column('user_id', sa.Text, nullable=False),
        sa.Column('sender_id', sa.Text, nullable=False),
        sa.Column('sender_role', sa.Text, nullable=False),
        sa.Column('message', sa.Text, nullable=False),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('read_by_admin', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('read_by_user', sa.Boolean, nullable=False, server_default='false'),
    )
    op.create_index('idx_support_messages_user', 'support_messages', ['user_id', 'created_at'])
    op.create_index('idx_support_messages_thread', 'support_messages', ['thread_id', 'created_at'])
    op.create_index('idx_support_messages_admin_unread', 'support_messages', ['created_at'],
                     postgresql_where=sa.text('read_by_admin = FALSE'))
    op.create_index('idx_support_messages_user_unread', 'support_messages', ['created_at'],
                     postgresql_where=sa.text('read_by_user = FALSE'))

    # --- user_subscriptions ---
    op.create_table(
        'user_subscriptions',
        sa.Column('user_id', sa.Text, primary_key=True),
        sa.Column('tier', sa.Text, nullable=False, server_default='free'),
        sa.Column('credits_balance', sa.Integer, nullable=False, server_default='500'),
        sa.Column('credits_monthly_limit', sa.Integer, nullable=False, server_default='500'),
        sa.Column('credits_used_this_period', sa.Integer, nullable=False, server_default='0'),
        sa.Column('current_period_start', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('current_period_end', sa.DateTime, nullable=False, server_default=sa.text("NOW() + INTERVAL '1 month'")),
        sa.Column('stripe_customer_id', sa.Text),
        sa.Column('stripe_subscription_id', sa.Text),
        sa.Column('stripe_price_id', sa.Text),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
    )

    # --- credit_transactions ---
    op.create_table(
        'credit_transactions',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Text, nullable=False),
        sa.Column('amount', sa.Integer, nullable=False),
        sa.Column('operation', sa.Text, nullable=False),
        sa.Column('description', sa.Text),
        sa.Column('app_id', sa.Integer),
        sa.Column('session_id', sa.Text),
        sa.Column('balance_after', sa.Integer, nullable=False),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('idx_credit_transactions_user', 'credit_transactions', ['user_id', 'created_at'])

    # --- llm_usage ---
    op.create_table(
        'llm_usage',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Text, nullable=False),
        sa.Column('operation', sa.Text, nullable=False),
        sa.Column('model', sa.Text),
        sa.Column('prompt_tokens', sa.Integer),
        sa.Column('response_tokens', sa.Integer),
        sa.Column('total_tokens', sa.Integer),
        sa.Column('cached_tokens', sa.Integer),
        sa.Column('tool_use_prompt_tokens', sa.Integer),
        sa.Column('thoughts_tokens', sa.Integer),
        sa.Column('traffic_type', sa.Text),
        sa.Column('app_id', sa.Integer),
        sa.Column('session_id', sa.Text),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('idx_llm_usage_user', 'llm_usage', ['user_id', 'created_at'])
    op.create_index('idx_llm_usage_operation', 'llm_usage', ['operation', 'created_at'])

    # --- api_requests ---
    op.create_table(
        'api_requests',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Text),
        sa.Column('method', sa.Text, nullable=False),
        sa.Column('path', sa.Text, nullable=False),
        sa.Column('status_code', sa.Integer),
        sa.Column('duration_ms', sa.Integer),
        sa.Column('app_id', sa.Integer),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('idx_api_requests_user', 'api_requests', ['user_id', 'created_at'])
    op.create_index('idx_api_requests_path', 'api_requests', ['path', 'created_at'])

    # --- comparison_summaries ---
    op.create_table(
        'comparison_summaries',
        sa.Column('cache_key', sa.String(64), primary_key=True),
        sa.Column('app_ids', postgresql.ARRAY(sa.Integer), nullable=False),
        sa.Column('comparison_type', sa.String(32), nullable=False),
        sa.Column('category', sa.String(64)),
        sa.Column('subcategory', sa.String(128)),
        sa.Column('summary_data', postgresql.JSONB, nullable=False),
        sa.Column('created_at', sa.DateTime, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('expires_at', sa.DateTime, nullable=False),
        sa.Column('user_id', sa.String(255), nullable=False),
    )
    op.create_index('idx_comparison_expires', 'comparison_summaries', ['expires_at'])
    op.create_index('idx_comparison_user', 'comparison_summaries', ['user_id'])

    # --- processed_stripe_events ---
    op.create_table(
        'processed_stripe_events',
        sa.Column('event_id', sa.Text, primary_key=True),
        sa.Column('processed_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
    )


def downgrade() -> None:
    op.drop_table('processed_stripe_events')
    op.drop_table('comparison_summaries')
    op.drop_table('api_requests')
    op.drop_table('llm_usage')
    op.drop_table('credit_transactions')
    op.drop_table('user_subscriptions')
    op.drop_table('support_messages')
    op.drop_table('citation_feedback')
    op.drop_table('chat_context')
    op.drop_table('chat_sessions')
    op.drop_table('chat_messages')
    op.drop_table('job_registry')
    op.drop_table('starred_games')
    op.drop_table('progress')
    op.drop_table('analysis_results')
    op.drop_table('review_labels')
    op.drop_table('reviews')
