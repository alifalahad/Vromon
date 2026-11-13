"""stay_suggestions: "sleep somewhere else for nights a-b?" and what the traveller decided (docs/trip-upgrades, step 4)

One row per (trip, nights, hotel) the stay advisor has suggested: its numbers when last worked out,
the plan's fingerprint then, and the traveller's answer (open / accepted / not_now / dismissed).

Revision ID: 0032
Revises: 0031
Create Date: 2026-11-12 21:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0032'
down_revision: Union[str, None] = '0031'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('stay_suggestions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('trip_id', sa.Integer(), nullable=False),
    sa.Column('first_night', sa.Integer(), nullable=False),
    sa.Column('last_night', sa.Integer(), nullable=False),
    sa.Column('hotel_id', sa.Integer(), nullable=False),
    sa.Column('money_saved', sa.Float(), nullable=True),
    sa.Column('minutes_saved', sa.Integer(), nullable=False),
    sa.Column('extra_moves', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=10), nullable=False),
    sa.Column('fingerprint', sa.String(length=64), nullable=False),
    sa.Column('shown_numbers_json', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['hotel_id'], ['hotels.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('trip_id', 'first_night', 'last_night', 'hotel_id', name='uq_stay_suggestion'),
    )
    with op.batch_alter_table('stay_suggestions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_stay_suggestions_trip_id'), ['trip_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('stay_suggestions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_stay_suggestions_trip_id'))
    op.drop_table('stay_suggestions')
