"""trip_reviews and review_items: "How was your trip?" and things one by one (docs/trip-upgrades, step 7)

- trip_reviews: one per (trip, traveller): the owner and each trip-room member rate on their own (D8).
  rating 1-5 (NULL: only things rated one by one so far) and an optional comment (280 characters).
- review_items: a place, a meal at a restaurant, a hotel, a stay with family or friends, or getting there,
  marked good or bad (D9) with an optional comment. item_id is the itinerary item when there is one; it is
  kept as a plain number, so a verdict outlives a re-planned day.
Private to their author (D9). The old `feedback` table stays as "Rate this plan".

Revision ID: 0035
Revises: 0034
Create Date: 2026-11-13 14:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0035'
down_revision: Union[str, None] = '0034'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('trip_reviews',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('trip_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('rating', sa.Integer(), nullable=True),
    sa.Column('comment', sa.String(length=280), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint('rating IS NULL OR (rating >= 1 AND rating <= 5)', name='ck_trip_reviews_rating'),
    sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('trip_id', 'user_id', name='uq_trip_review'),
    )
    with op.batch_alter_table('trip_reviews', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_trip_reviews_trip_id'), ['trip_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_trip_reviews_user_id'), ['user_id'], unique=False)
    op.create_table('review_items',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('review_id', sa.Integer(), nullable=False),
    sa.Column('target_type', sa.String(length=12), nullable=False),
    sa.Column('target_id', sa.Integer(), nullable=True),
    sa.Column('item_id', sa.Integer(), nullable=True),
    sa.Column('verdict', sa.String(length=4), nullable=False),
    sa.Column('comment', sa.String(length=280), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("verdict IN ('good', 'bad')", name='ck_review_items_verdict'),
    sa.CheckConstraint("target_type IN ('place', 'restaurant', 'hotel', 'stay_home', 'journey')", name='ck_review_items_target'),
    sa.ForeignKeyConstraint(['review_id'], ['trip_reviews.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('review_items', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_review_items_review_id'), ['review_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('review_items', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_review_items_review_id'))
    op.drop_table('review_items')
    with op.batch_alter_table('trip_reviews', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_trip_reviews_user_id'))
        batch_op.drop_index(batch_op.f('ix_trip_reviews_trip_id'))
    op.drop_table('trip_reviews')
