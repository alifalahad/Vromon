"""hotels.kind: what sort of place to stay (docs/ui-refresh step 11)

hotel, resort, guest_house, rest_house, motel, cottage, bed_and_breakfast or hostel, from the data platform's
listing (its category, and words in its name). NULL for the hand-made demo hotels, which only have a level.

Revision ID: 0036
Revises: 0035
Create Date: 2026-11-16 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0036'
down_revision: Union[str, None] = '0035'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('hotels') as batch:
        batch.add_column(sa.Column('kind', sa.String(length=30), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('hotels') as batch:
        batch.drop_column('kind')
