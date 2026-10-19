"""live conditions: a weather/sea forecast cache, and warnings kept per stop (trip planner step 6)

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-19 09:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0010'
down_revision: Union[str, None] = '0009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'conditions_cache',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=False),
        sa.Column('lat', sa.Float(), nullable=False),
        sa.Column('lon', sa.Float(), nullable=False),
        sa.Column('payload_json', sa.Text(), nullable=False),
        sa.Column('fetched_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('kind', 'lat', 'lon', name='uq_conditions_cache_spot'),
    )
    with op.batch_alter_table('itinerary_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('kept_warnings_json', sa.Text(), server_default='[]', nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('itinerary_items', schema=None) as batch_op:
        batch_op.drop_column('kept_warnings_json')
    op.drop_table('conditions_cache')
