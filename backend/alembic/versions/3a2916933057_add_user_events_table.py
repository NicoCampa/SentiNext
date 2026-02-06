"""add user_events table

Revision ID: 3a2916933057
Revises: d0087513cf86
Create Date: 2026-02-06 17:49:09.060794

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '3a2916933057'
down_revision: Union[str, Sequence[str], None] = 'd0087513cf86'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_events',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Text, nullable=False),
        sa.Column('event_name', sa.Text, nullable=False),
        sa.Column('event_category', sa.Text, nullable=False, server_default='interaction'),
        sa.Column('page', sa.Text),
        sa.Column('target', sa.Text),
        sa.Column('metadata', postgresql.JSONB, server_default='{}'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('idx_user_events_user', 'user_events', ['user_id', 'created_at'])
    op.create_index('idx_user_events_name', 'user_events', ['event_name', 'created_at'])
    op.create_index('idx_user_events_created', 'user_events', ['created_at'])


def downgrade() -> None:
    op.drop_table('user_events')
