"""data platform: price_observations (hotel room rates, official tariffs, market food prices). New table only.

Revision ID: 0025
Revises: 0024
Create Date: 2026-11-05 05:20:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0025'
down_revision: Union[str, None] = '0024'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('price_observations',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('price_kind', sa.String(length=30), nullable=False),
    sa.Column('service_place_id', sa.Uuid(), nullable=True),
    sa.Column('item_key', sa.String(length=200), nullable=False),
    sa.Column('item_label', sa.String(length=200), nullable=False),
    sa.Column('unit', sa.String(length=60), nullable=True),
    sa.Column('amount_min', sa.Float(), nullable=False),
    sa.Column('amount_max', sa.Float(), nullable=True),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('district_id', sa.Uuid(), nullable=True),
    sa.Column('area_label', sa.String(length=400), nullable=True),
    sa.Column('observed_on', sa.Date(), nullable=False),
    sa.Column('source_id', sa.String(length=64), nullable=False),
    sa.Column('artifact_id', sa.Uuid(), nullable=True),
    sa.Column('source_url', sa.String(length=1000), nullable=True),
    sa.Column('context', sa.Text(), nullable=True),
    sa.Column('last_checked_at', sa.DateTime(), nullable=False),
    sa.Column('verification_method', sa.String(length=40), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('job_id', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['artifact_id'], ['source_artifacts.id'], ),
    sa.ForeignKeyConstraint(['district_id'], ['admin_units.id'], ),
    sa.ForeignKeyConstraint(['service_place_id'], ['service_places.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('price_observations', schema=None) as batch_op:
        batch_op.create_index('ix_price_observations_item', ['price_kind', 'item_key', 'observed_on'], unique=False)
        batch_op.create_index('ix_price_observations_place', ['service_place_id', 'status'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('price_observations', schema=None) as batch_op:
        batch_op.drop_index('ix_price_observations_place')
        batch_op.drop_index('ix_price_observations_item')
    op.drop_table('price_observations')
