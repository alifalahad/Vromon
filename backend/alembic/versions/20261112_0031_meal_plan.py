"""meal plan: per meal, a restaurant (default), your own food or where you stay (docs/trip-upgrades, step 3)

- trip_preferences.meals_json: the trip's plan, {"Breakfast": "restaurant"|"own"|"stay", "Lunch": …,
  "Dinner": …, "own_cost_per_person": number|null}. NULL = every meal at a restaurant (as before).
- itineraries.meals_json: one day's override, the same shape. NULL = the trip's plan.
- itinerary_items.meal_source: restaurant / own / stay for meals, NULL for anything else. Every meal
  planned so far was at a restaurant (or a placeholder for one), so they become "restaurant".

Revision ID: 0031
Revises: 0030
Create Date: 2026-11-12 18:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0031'
down_revision: Union[str, None] = '0030'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('trip_preferences', schema=None) as batch_op:
        batch_op.add_column(sa.Column('meals_json', sa.Text(), nullable=True))
    with op.batch_alter_table('itineraries', schema=None) as batch_op:
        batch_op.add_column(sa.Column('meals_json', sa.Text(), nullable=True))
    with op.batch_alter_table('itinerary_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('meal_source', sa.String(length=10), nullable=True))
    op.execute("UPDATE itinerary_items SET meal_source = 'restaurant' WHERE item_type = 'meal'")


def downgrade() -> None:
    with op.batch_alter_table('itinerary_items', schema=None) as batch_op:
        batch_op.drop_column('meal_source')
    with op.batch_alter_table('itineraries', schema=None) as batch_op:
        batch_op.drop_column('meals_json')
    with op.batch_alter_table('trip_preferences', schema=None) as batch_op:
        batch_op.drop_column('meals_json')
