"""must-dos: must-sees with a day and time, busy times, arrival and leaving times (trip planner step 4)

The plain must-visit id list becomes must-sees with no day or time, so old trips
keep their must-visit places.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-18 18:00:00

"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0008'
down_revision: Union[str, None] = '0007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

constraints = sa.table(
    'trip_constraints',
    sa.column('id', sa.Integer),
    sa.column('must_visit_json', sa.Text),
    sa.column('must_sees_json', sa.Text),
)


def _ids(raw):
    try:
        value = json.loads(raw or '[]')
    except ValueError:
        return []
    return [int(v) for v in value if isinstance(v, int) or (isinstance(v, str) and v.isdigit())]


def upgrade() -> None:
    with op.batch_alter_table('trip_preferences', schema=None) as batch_op:
        batch_op.add_column(sa.Column('arrive_time', sa.String(length=5), nullable=True))
        batch_op.add_column(sa.Column('leave_time', sa.String(length=5), nullable=True))
    with op.batch_alter_table('trip_constraints', schema=None) as batch_op:
        batch_op.add_column(sa.Column('must_sees_json', sa.Text(), server_default='[]', nullable=False))
        batch_op.add_column(sa.Column('busy_json', sa.Text(), server_default='[]', nullable=False))

    conn = op.get_bind()
    for row in conn.execute(sa.select(constraints.c.id, constraints.c.must_visit_json)).fetchall():
        musts = [{'place_id': pid, 'day': None, 'when': None, 'at': None} for pid in dict.fromkeys(_ids(row.must_visit_json))]
        conn.execute(constraints.update().where(constraints.c.id == row.id).values(must_sees_json=json.dumps(musts)))

    with op.batch_alter_table('trip_constraints', schema=None) as batch_op:
        batch_op.drop_column('must_visit_json')


def downgrade() -> None:
    with op.batch_alter_table('trip_constraints', schema=None) as batch_op:
        batch_op.add_column(sa.Column('must_visit_json', sa.Text(), server_default='[]', nullable=False))

    conn = op.get_bind()
    for row in conn.execute(sa.select(constraints.c.id, constraints.c.must_sees_json)).fetchall():
        try:
            ids = [m['place_id'] for m in json.loads(row.must_sees_json or '[]')]
        except (ValueError, KeyError, TypeError):
            ids = []
        conn.execute(constraints.update().where(constraints.c.id == row.id).values(must_visit_json=json.dumps(ids)))

    with op.batch_alter_table('trip_constraints', schema=None) as batch_op:
        batch_op.drop_column('busy_json')
        batch_op.drop_column('must_sees_json')
    with op.batch_alter_table('trip_preferences', schema=None) as batch_op:
        batch_op.drop_column('leave_time')
        batch_op.drop_column('arrive_time')
