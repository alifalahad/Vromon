"""photos (Android Phase 6): metadata for photos stored in the private bucket

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-17 08:54:56.333208

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0005'
down_revision: Union[str, None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('photos',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('storage_key', sa.String(length=100), nullable=False),
    sa.Column('thumb_key', sa.String(length=100), nullable=False),
    sa.Column('width', sa.Integer(), nullable=False),
    sa.Column('height', sa.Integer(), nullable=False),
    sa.Column('size_bytes', sa.Integer(), nullable=False),
    sa.Column('taken_on', sa.Date(), nullable=True),
    sa.Column('place_type', sa.String(length=10), nullable=True),
    sa.Column('place_code', sa.String(length=20), nullable=True),
    sa.Column('trip_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint('(place_type IS NULL) = (place_code IS NULL)', name='ck_photos_place_pair'),
    sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('photos', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_photos_trip_id'), ['trip_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_photos_user_id'), ['user_id'], unique=False)
        batch_op.create_index('ix_photos_user_place', ['user_id', 'place_type', 'place_code'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('photos', schema=None) as batch_op:
        batch_op.drop_index('ix_photos_user_place')
        batch_op.drop_index(batch_op.f('ix_photos_user_id'))
        batch_op.drop_index(batch_op.f('ix_photos_trip_id'))

    op.drop_table('photos')
