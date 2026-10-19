"""imported destinations: where data comes from, and unknown prices, hours and ratings (trip planner step 10)

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-20 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0012'
down_revision: Union[str, None] = '0011'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TRUE = sa.true()  # 'true' on PostgreSQL, 1 on SQLite


def _known(batch_op, *names):
    for n in names:
        batch_op.add_column(sa.Column(n, sa.Boolean(), server_default=TRUE, nullable=False))


def _source(batch_op, table):
    batch_op.add_column(sa.Column('source', sa.String(length=20), server_default='curated', nullable=False))
    batch_op.add_column(sa.Column('source_ref', sa.String(length=160), nullable=True))
    batch_op.add_column(sa.Column('checked', sa.Boolean(), server_default=TRUE, nullable=False))
    batch_op.create_index(f'ix_{table}_source_ref', ['source_ref'], unique=False)


def upgrade() -> None:
    with op.batch_alter_table('destinations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('attribution', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('sources_json', sa.Text(), server_default='[]', nullable=False))
        batch_op.add_column(sa.Column('checked', sa.Boolean(), server_default=TRUE, nullable=False))
        batch_op.add_column(sa.Column('data_version', sa.String(length=64), nullable=True))
    with op.batch_alter_table('places', schema=None) as batch_op:
        _known(batch_op, 'cost_known', 'hours_known', 'rating_known')
        _source(batch_op, 'places')
        batch_op.add_column(sa.Column('url', sa.String(length=500), nullable=True))
    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        _known(batch_op, 'cost_known', 'hours_known', 'rating_known')
        _source(batch_op, 'restaurants')
    with op.batch_alter_table('hotels', schema=None) as batch_op:
        _known(batch_op, 'price_known', 'rating_known')
        _source(batch_op, 'hotels')


def downgrade() -> None:
    with op.batch_alter_table('hotels', schema=None) as batch_op:
        batch_op.drop_index('ix_hotels_source_ref')
        for c in ('checked', 'source_ref', 'source', 'rating_known', 'price_known'):
            batch_op.drop_column(c)
    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        batch_op.drop_index('ix_restaurants_source_ref')
        for c in ('checked', 'source_ref', 'source', 'rating_known', 'hours_known', 'cost_known'):
            batch_op.drop_column(c)
    with op.batch_alter_table('places', schema=None) as batch_op:
        batch_op.drop_index('ix_places_source_ref')
        for c in ('url', 'checked', 'source_ref', 'source', 'rating_known', 'hours_known', 'cost_known'):
            batch_op.drop_column(c)
    with op.batch_alter_table('destinations', schema=None) as batch_op:
        for c in ('data_version', 'checked', 'sources_json', 'attribution'):
            batch_op.drop_column(c)
