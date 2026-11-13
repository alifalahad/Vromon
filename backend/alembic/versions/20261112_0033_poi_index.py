"""poi_index: every kind of place in Bangladesh but hotels and restaurants, for "search anything" (docs/trip-upgrades, step 5)

Bulk-loaded by the data platform (connector `overture_pois`), never edited by the API.

Revision ID: 0033
Revises: 0032
Create Date: 2026-11-12 23:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0033'
down_revision: Union[str, None] = '0032'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('poi_index',
    sa.Column('id', sa.String(length=64), nullable=False),
    sa.Column('source', sa.String(length=20), nullable=False),
    sa.Column('name', sa.String(length=300), nullable=False),
    sa.Column('name_bn', sa.String(length=300), nullable=True),
    sa.Column('category', sa.String(length=80), nullable=True),
    sa.Column('kind', sa.String(length=30), nullable=False),
    sa.Column('lat', sa.Float(), nullable=False),
    sa.Column('lon', sa.Float(), nullable=False),
    sa.Column('district_id', sa.Uuid(), nullable=True),
    sa.Column('confidence', sa.Float(), nullable=True),
    sa.Column('name_key', sa.String(length=300), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['district_id'], ['admin_units.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('poi_index', schema=None) as batch_op:
        batch_op.create_index('ix_poi_index_district_kind', ['district_id', 'kind'], unique=False)
        batch_op.create_index('ix_poi_index_name_key', ['name_key'], unique=False)
        batch_op.create_index('ix_poi_index_source', ['source'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('poi_index', schema=None) as batch_op:
        batch_op.drop_index('ix_poi_index_source')
        batch_op.drop_index('ix_poi_index_name_key')
        batch_op.drop_index('ix_poi_index_district_kind')
    op.drop_table('poi_index')
