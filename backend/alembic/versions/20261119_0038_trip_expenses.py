"""trip_expenses: what you spent (docs/ui-refresh step 19, D18)

One row per amount the traveller noted: the trip (deleted with it), who noted it (the trip's owner), the
day (from the day before the trip to the day after it), the amount for the whole group in the trip's
currency (more than 0), the part (getting_there, stay, food, tickets, local, shopping, other) and a note
(80 characters at most, may be empty). A note made from the plan keeps what it pays for: item_id, the stop
(emptied when the stop is removed; the note stays), and ride: "to" that stop, "back" to where you sleep,
or "move" to the next stay, for a ride. Private to the owner.

Revision ID: 0038
Revises: 0037
Create Date: 2026-11-19 21:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0038'
down_revision: Union[str, None] = '0037'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('trip_expenses',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('trip_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('day', sa.Date(), nullable=False),
    sa.Column('amount', sa.Float(), nullable=False),
    sa.Column('part', sa.String(length=16), nullable=False),
    sa.Column('note', sa.String(length=80), server_default='', nullable=False),
    sa.Column('item_id', sa.Integer(), nullable=True),
    sa.Column('ride', sa.String(length=8), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint('amount > 0', name='ck_trip_expenses_amount'),
    sa.CheckConstraint("part IN ('getting_there', 'stay', 'food', 'tickets', 'local', 'shopping', 'other')", name='ck_trip_expenses_part'),
    sa.CheckConstraint("ride IS NULL OR ride IN ('to', 'back', 'move')", name='ck_trip_expenses_ride'),
    sa.ForeignKeyConstraint(['item_id'], ['itinerary_items.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('trip_expenses', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_trip_expenses_item_id'), ['item_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_trip_expenses_trip_id'), ['trip_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_trip_expenses_user_id'), ['user_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('trip_expenses', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_trip_expenses_user_id'))
        batch_op.drop_index(batch_op.f('ix_trip_expenses_trip_id'))
        batch_op.drop_index(batch_op.f('ix_trip_expenses_item_id'))
    op.drop_table('trip_expenses')
