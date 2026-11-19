"""trips.not_taken: "This trip didn't happen" (docs/ui-refresh step 16, D19)

When the owner said a finished trip wasn't taken (a date and time, UTC); NULL for every trip until then.
Such a trip isn't counted in trip stats, isn't offered for rating or for the map, and stays in the list
marked "Not taken". Saying "It did happen" sets it back to NULL.

Revision ID: 0037
Revises: 0036
Create Date: 2026-11-19 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0037'
down_revision: Union[str, None] = '0036'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('trips') as batch:
        batch.add_column(sa.Column('not_taken', sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('trips') as batch:
        batch.drop_column('not_taken')
