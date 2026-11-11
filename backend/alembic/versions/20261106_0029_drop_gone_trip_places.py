"""trip_constraints: drop must-sees and skipped places that are no longer in the catalog.

The sample places were removed when the 64 districts got real data; trips made before
still pointed at them (shown as "···", and every change to such a trip was refused with
"Place ID(s) ... do not exist"). Data only: no schema change, and not undone on downgrade.

Revision ID: 0029
Revises: 0028
Create Date: 2026-11-06 22:15:00

"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0029'
down_revision: Union[str, None] = '0028'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _load(text):
    try:
        value = json.loads(text or "[]")
    except ValueError:
        return []
    return value if isinstance(value, list) else []


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT c.id, t.destination, c.must_sees_json, c.excluded_places_json "
        "FROM trip_constraints c JOIN trips t ON t.id = c.trip_id"
    )).fetchall()
    for cid, destination, must_json, skip_json in rows:
        must, skip = _load(must_json), _load(skip_json)
        ids = {m.get("place_id") for m in must if isinstance(m, dict)} | set(skip)
        if not ids:
            continue
        live = {pid for (pid,) in conn.execute(
            sa.text("SELECT id FROM places WHERE destination_name = :d AND is_active = :t"), {"d": destination, "t": True}
        )}
        if ids <= live:
            continue
        conn.execute(
            sa.text("UPDATE trip_constraints SET must_sees_json = :m, excluded_places_json = :s WHERE id = :id"),
            {"m": json.dumps([m for m in must if isinstance(m, dict) and m.get("place_id") in live]),
             "s": json.dumps([p for p in skip if p in live]), "id": cid},
        )


def downgrade() -> None:
    pass
