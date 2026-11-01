"""Bangladesh's 8 divisions: add Mymensingh (BD-H), fix Bangla names, link cities (map home step 1)

The geo reference tables are seeded only when empty, so databases seeded from the old
Natural Earth data (7 divisions) are updated here. A new database is seeded from
data/geo/regions.json, which already has all 8; then this migration changes nothing.

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-26 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0013'
down_revision: Union[str, None] = '0012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

countries = sa.table('countries', sa.column('iso2', sa.String))
regions = sa.table(
    'regions',
    sa.column('code', sa.String), sa.column('country_iso2', sa.String), sa.column('name', sa.String),
    sa.column('name_bn', sa.String), sa.column('type', sa.String), sa.column('lat', sa.Float), sa.column('lon', sa.Float),
)
cities = sa.table('cities', sa.column('geonameid', sa.Integer), sa.column('region_code', sa.String))

# From data/geo/regions.json (geoBoundaries BGD ADM1, label point = centroid of the largest part)
DIVISIONS = [
    ('BD-A', 'Barishal', 'বরিশাল বিভাগ', 22.4598, 90.2537),
    ('BD-B', 'Chattogram', 'চট্টগ্রাম বিভাগ', 22.7081, 91.774),
    ('BD-C', 'Dhaka', 'ঢাকা বিভাগ', 23.8298, 90.2523),
    ('BD-D', 'Khulna', 'খুলনা বিভাগ', 22.8786, 89.3049),
    ('BD-E', 'Rajshahi', 'রাজশাহী বিভাগ', 24.5774, 89.0575),
    ('BD-F', 'Rangpur', 'রংপুর বিভাগ', 25.7672, 89.0534),
    ('BD-G', 'Sylhet', 'সিলেট বিভাগ', 24.7301, 91.6714),
    ('BD-H', 'Mymensingh', 'ময়মনসিংহ বিভাগ', 24.85, 90.4105),
]
# Natural Earth values replaced above (for downgrade)
OLD_DIVISIONS = [
    ('BD-A', 'Barisal', 'বরিশাল বিভাগ', 22.4351, 90.2369),
    ('BD-B', 'Chattogram', 'চট্টগ্রাম বিভাগ', 22.4245, 92.1333),
    ('BD-C', 'Dhaka', 'ঢাকা বিভাগ', 24.1653, 90.4053),
    ('BD-D', 'Khulna', 'খুলনা জেলা', 22.9179, 89.3708),
    ('BD-E', 'Rajshahi', 'রাজশাহী জেলা', 24.6664, 89.0438),
    ('BD-F', 'Rangpur', 'রংপুর জেলা', 25.7571, 89.112),
    ('BD-G', 'Sylhet', 'সিলেট বিভাগ', 24.6452, 91.7033),
]
# GeoNames cities whose division changed: geonameid -> (old, new)
CITY_LINKS = {
    1185106: (None, 'BD-H'),     # Jamalpur
    1185116: (None, 'BD-H'),     # Netrakona
    1185162: (None, 'BD-H'),     # Mymensingh
    1185164: (None, 'BD-H'),     # Muktagacha
    1185218: (None, 'BD-H'),     # Gafargaon
    1188569: (None, 'BD-H'),     # Sarishabari
    1337248: (None, 'BD-H'),     # Sherpur
    1205481: ('BD-D', 'BD-A'),   # Uttar Char Fasson (Bhola, Barishal division)
    7475889: ('BD-D', 'BD-A'),   # Taluker Char Doani (Barishal division)
}


def _seeded(conn) -> bool:
    return conn.execute(sa.select(countries.c.iso2).where(countries.c.iso2 == 'BD')).first() is not None


def upgrade() -> None:
    conn = op.get_bind()
    if not _seeded(conn):
        return  # empty reference tables: the seeder loads the new data
    existing = set(conn.execute(sa.select(regions.c.code).where(regions.c.country_iso2 == 'BD')).scalars())
    for code, name, name_bn, lat, lon in DIVISIONS:
        values = dict(name=name, name_bn=name_bn, type='Division', lat=lat, lon=lon)
        if code in existing:
            conn.execute(regions.update().where(regions.c.code == code).values(**values))
        else:
            conn.execute(regions.insert().values(code=code, country_iso2='BD', **values))
    for geonameid, (_, new) in CITY_LINKS.items():
        conn.execute(cities.update().where(cities.c.geonameid == geonameid).values(region_code=new))


def downgrade() -> None:
    conn = op.get_bind()
    if not _seeded(conn):
        return
    for geonameid, (old, _) in CITY_LINKS.items():
        conn.execute(cities.update().where(cities.c.geonameid == geonameid).values(region_code=old))
    conn.execute(regions.delete().where(regions.c.code == 'BD-H'))
    for code, name, name_bn, lat, lon in OLD_DIVISIONS:
        conn.execute(regions.update().where(regions.c.code == code).values(name=name, name_bn=name_bn, lat=lat, lon=lon))
