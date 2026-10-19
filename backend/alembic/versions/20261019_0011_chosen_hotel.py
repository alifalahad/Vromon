"""the hotel the traveller chose for a trip (trip planner step 7: "ways to save")

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-19 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0011'
down_revision: Union[str, None] = '0010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('trip_preferences', schema=None) as batch_op:
        batch_op.add_column(sa.Column('hotel_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_trip_preferences_hotel_id', 'hotels', ['hotel_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    with op.batch_alter_table('trip_preferences', schema=None) as batch_op:
        batch_op.drop_constraint('fk_trip_preferences_hotel_id', type_='foreignkey')
        batch_op.drop_column('hotel_id')
