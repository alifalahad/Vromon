"""road distances and times: a route cache, and the travel mode chosen for a leg (trip planner step 5)

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-18 21:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0009'
down_revision: Union[str, None] = '0008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'route_cache',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('provider', sa.String(length=20), nullable=False),
        sa.Column('profile', sa.String(length=20), nullable=False),
        sa.Column('from_lat', sa.Float(), nullable=False),
        sa.Column('from_lon', sa.Float(), nullable=False),
        sa.Column('to_lat', sa.Float(), nullable=False),
        sa.Column('to_lon', sa.Float(), nullable=False),
        sa.Column('distance_km', sa.Float(), nullable=True),
        sa.Column('duration_min', sa.Float(), nullable=True),
        sa.Column('geometry_json', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('profile', 'from_lat', 'from_lon', 'to_lat', 'to_lon', name='uq_route_cache_pair'),
    )
    with op.batch_alter_table('itinerary_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('travel_mode', sa.String(length=10), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('itinerary_items', schema=None) as batch_op:
        batch_op.drop_column('travel_mode')
    op.drop_table('route_cache')
