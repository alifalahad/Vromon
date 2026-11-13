"""trip_stays: where the traveller sleeps, night by night (docs/trip-upgrades, step 1)

Backfill: every trip that has a plan and at least one night gets one hotel stay over all its
nights, with the hotel it uses today (the chosen one, else the one the old rule picks: the
trip's accommodation level, a priced one first, then the first listed). So existing plans keep
their hotel; the new picking rule (decision D11) applies to trips planned from now on.

Revision ID: 0030
Revises: 0029
Create Date: 2026-11-12 10:00:00

"""
from datetime import date, datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0030'
down_revision: Union[str, None] = '0029'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _as_date(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def upgrade() -> None:
    op.create_table('trip_stays',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('trip_id', sa.Integer(), nullable=False),
    sa.Column('first_night', sa.Integer(), nullable=False),
    sa.Column('last_night', sa.Integer(), nullable=False),
    sa.Column('kind', sa.String(length=10), nullable=False),
    sa.Column('hotel_id', sa.Integer(), nullable=True),
    sa.Column('label', sa.String(length=80), nullable=True),
    sa.Column('lat', sa.Float(), nullable=True),
    sa.Column('lon', sa.Float(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['hotel_id'], ['hotels.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('trip_stays', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_trip_stays_trip_id'), ['trip_id'], unique=False)

    conn = op.get_bind()
    trips = conn.execute(sa.text(
        "SELECT t.id, t.destination, t.start_date, t.end_date, p.hotel_id, p.accommodation_preference "
        "FROM trips t LEFT JOIN trip_preferences p ON p.trip_id = t.id "
        "WHERE EXISTS (SELECT 1 FROM itineraries i WHERE i.trip_id = t.id)"
    )).fetchall()
    now = datetime.utcnow()
    for trip_id, destination, start, end, chosen, level in trips:
        nights = (_as_date(end) - _as_date(start)).days
        if nights < 1:
            continue
        hotel_id = None
        if chosen is not None:
            hotel_id = conn.execute(sa.text(
                "SELECT id FROM hotels WHERE id = :h AND destination_name = :d AND is_active = :t"
            ), {"h": chosen, "d": destination, "t": True}).scalar()
        if hotel_id is None:
            hotel_id = conn.execute(sa.text(
                "SELECT id FROM hotels WHERE destination_name = :d AND category = :c AND is_active = :t "
                "ORDER BY price_known DESC, id LIMIT 1"
            ), {"d": destination, "c": level or "Standard", "t": True}).scalar()
        if hotel_id is None:
            hotel_id = conn.execute(sa.text(
                "SELECT id FROM hotels WHERE destination_name = :d AND is_active = :t ORDER BY price_known DESC, id LIMIT 1"
            ), {"d": destination, "t": True}).scalar()
        if hotel_id is None:
            continue
        conn.execute(sa.text(
            "INSERT INTO trip_stays (trip_id, first_night, last_night, kind, hotel_id, created_at, updated_at) "
            "VALUES (:t, 1, :n, 'hotel', :h, :now, :now)"
        ), {"t": trip_id, "n": nights, "h": hotel_id, "now": now})


def downgrade() -> None:
    with op.batch_alter_table('trip_stays', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_trip_stays_trip_id'))
    op.drop_table('trip_stays')
