"""trip stops (Android Phase 7, decision D7) and the mark-as-visited answer

Existing trips get one stop: their destination, as the nearest GeoNames city in
the destination's country (skipped when the geography tables are empty).

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-17 09:50:20.182047

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0006'
down_revision: Union[str, None] = '0005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('trip_stops',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('trip_id', sa.Integer(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('city_geonameid', sa.Integer(), nullable=True),
    sa.Column('country_iso2', sa.String(length=2), nullable=False),
    sa.Column('transport_mode', sa.String(length=10), nullable=True),
    sa.Column('arrive_on', sa.Date(), nullable=True),
    sa.Column('depart_on', sa.Date(), nullable=True),
    sa.ForeignKeyConstraint(['city_geonameid'], ['cities.geonameid'], ),
    sa.ForeignKeyConstraint(['country_iso2'], ['countries.iso2'], ),
    sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('trip_id', 'position', name='uq_trip_stops_position')
    )
    with op.batch_alter_table('trip_stops', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_trip_stops_trip_id'), ['trip_id'], unique=False)

    with op.batch_alter_table('trips', schema=None) as batch_op:
        batch_op.add_column(sa.Column('visited_prompt', sa.String(length=10), nullable=True))

    _backfill_destination_stops()


def _backfill_destination_stops() -> None:
    conn = op.get_bind()
    destinations = conn.execute(sa.text(
        "SELECT d.name, c.iso2, d.latitude, d.longitude FROM destinations d JOIN countries c ON c.name = d.country"
    )).all()
    for name, iso2, lat, lon in destinations:
        city = conn.execute(sa.text(
            "SELECT geonameid FROM cities WHERE country_iso2 = :iso2 "
            "AND lat BETWEEN :lat - 0.5 AND :lat + 0.5 AND lon BETWEEN :lon - 0.5 AND :lon + 0.5 "
            "ORDER BY (lat - :lat) * (lat - :lat) + (lon - :lon) * (lon - :lon) LIMIT 1"
        ), {"iso2": iso2, "lat": lat, "lon": lon}).scalar()
        conn.execute(sa.text(
            "INSERT INTO trip_stops (trip_id, position, city_geonameid, country_iso2) "
            "SELECT t.id, 0, :city, :iso2 FROM trips t WHERE t.destination = :name "
            "AND NOT EXISTS (SELECT 1 FROM trip_stops s WHERE s.trip_id = t.id)"
        ), {"city": city, "iso2": iso2, "name": name})


def downgrade() -> None:
    with op.batch_alter_table('trips', schema=None) as batch_op:
        batch_op.drop_column('visited_prompt')

    with op.batch_alter_table('trip_stops', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_trip_stops_trip_id'))

    op.drop_table('trip_stops')
