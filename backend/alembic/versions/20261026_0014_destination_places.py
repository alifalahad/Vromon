"""destinations: country and region on the travel map (map home step 4)

The values are filled at startup by app.services.destination_places, which needs
the geo reference tables (seeded after migrations run).

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-26 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0014'
down_revision: Union[str, None] = '0013'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('destinations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('country_iso2', sa.String(length=2), nullable=True))
        batch_op.add_column(sa.Column('region_code', sa.String(length=20), nullable=True))
        batch_op.create_index('ix_destinations_country_iso2', ['country_iso2'], unique=False)
        batch_op.create_index('ix_destinations_region_code', ['region_code'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('destinations', schema=None) as batch_op:
        batch_op.drop_index('ix_destinations_region_code')
        batch_op.drop_index('ix_destinations_country_iso2')
        batch_op.drop_column('region_code')
        batch_op.drop_column('country_iso2')
