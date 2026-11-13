"""private places: a stop from outside Vromon's list (docs/trip-upgrades, step 6)

- places.owner_user_id: the traveller who added it (NULL for Vromon's own places). Deleted with the account.
- places.listed: false for a private place. Unlisted places are never ranked, suggested, published or
  shown to anyone but their owner and the trip's room members. Every place so far is Vromon's: listed.
- poi_index (lat, lon): search reads the places index around a point.
- geocode_cache: addresses from ORS geocoding, 7 days by (query, area); no user id. Today's rows are the
  daily cap's count, shared by every backend process.

Revision ID: 0034
Revises: 0033
Create Date: 2026-11-13 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0034'
down_revision: Union[str, None] = '0033'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('places', schema=None) as batch_op:
        batch_op.add_column(sa.Column('owner_user_id', sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column('listed', sa.Boolean(), nullable=False, server_default='1'))
        batch_op.create_index('ix_places_owner_user_id', ['owner_user_id'], unique=False)
        batch_op.create_foreign_key('fk_places_owner_user_id_users', 'users', ['owner_user_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_poi_index_lat_lon', 'poi_index', ['lat', 'lon'], unique=False)
    op.create_table('geocode_cache',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('query_key', sa.String(length=120), nullable=False),
    sa.Column('area_key', sa.String(length=24), nullable=False),
    sa.Column('results_json', sa.Text(), nullable=False),
    sa.Column('fetched_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('query_key', 'area_key', name='uq_geocode_cache_query_area')
    )
    op.create_index('ix_geocode_cache_fetched_at', 'geocode_cache', ['fetched_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_geocode_cache_fetched_at', table_name='geocode_cache')
    op.drop_table('geocode_cache')
    op.drop_index('ix_poi_index_lat_lon', table_name='poi_index')
    with op.batch_alter_table('places', schema=None) as batch_op:
        batch_op.drop_constraint('fk_places_owner_user_id_users', type_='foreignkey')
        batch_op.drop_index('ix_places_owner_user_id')
        batch_op.drop_column('listed')
        batch_op.drop_column('owner_user_id')
