"""itinerary items can be pinned ("keep this time", trip planner step 3)

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-18 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0007'
down_revision: Union[str, None] = '0006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('itinerary_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('pinned', sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('itinerary_items', schema=None) as batch_op:
        batch_op.drop_column('pinned')
