#!/usr/bin/env bash
# Vromon geo pipeline: downloads Natural Earth (Bangladesh point of view, decision D5),
# geoBoundaries (Bangladesh's divisions) and GeoNames, then builds the bundled countries layer, the lookup tables and the
# PMTiles for regions and cities. Sources and licences: docs/data-sources.md.
#
# Needs: curl, unzip, node (npx mapshaper), python3, tippecanoe (brew install tippecanoe).
# Usage: scripts/geo/build.sh   (re-running reuses the downloads in data/geo/raw)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RAW="$ROOT/data/geo/raw"
BUILD="$ROOT/data/geo/build"
MAPSHAPER="npx -y mapshaper@0.6"
mkdir -p "$RAW" "$BUILD"

fetch() { [ -s "$RAW/$(basename "$1")" ] || curl -fsSL -m 600 -o "$RAW/$(basename "$1")" "$1"; }

echo "1/4 Downloading sources"
fetch https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries_bdg.zip
fetch https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip
fetch https://download.geonames.org/export/dump/cities15000.zip
fetch https://raw.githubusercontent.com/mledoze/countries/master/countries.json
# Bangladesh's 8 divisions (Natural Earth has 7); geoBoundaries gbOpen, CC0, pinned to a release commit
mkdir -p "$RAW/gb"
[ -s "$RAW/gb/geoBoundaries-BGD-ADM1.geojson" ] || curl -fsSL -m 600 -o "$RAW/gb/geoBoundaries-BGD-ADM1.geojson" \
  https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/BGD/ADM1/geoBoundaries-BGD-ADM1.geojson
# ...and its 64 districts (BBS / OCHA via geoBoundaries, CC BY 3.0 IGO)
[ -s "$RAW/gb/geoBoundaries-BGD-ADM2.geojson" ] || curl -fsSL -m 600 -o "$RAW/gb/geoBoundaries-BGD-ADM2.geojson" \
  https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/BGD/ADM2/geoBoundaries-BGD-ADM2.geojson
[ -s "$RAW/mledoze-countries.json" ] || cp "$RAW/countries.json" "$RAW/mledoze-countries.json"
unzip -oq "$RAW/ne_10m_admin_0_countries_bdg.zip" -d "$RAW/ne0"
unzip -oq "$RAW/ne_10m_admin_1_states_provinces.zip" -d "$RAW/ne1"
unzip -oq "$RAW/cities15000.zip" -d "$RAW/gn"

echo "2/4 Converting shapefiles"
A0_FIELDS=ISO_A2,ISO_A2_EH,ISO_A3,ISO_A3_EH,NAME,NAME_EN,NAME_BN,CONTINENT,TYPE,LABEL_X,LABEL_Y,MIN_LABEL
$MAPSHAPER "$RAW"/ne0/*.shp -filter-fields $A0_FIELDS -o "$BUILD/countries-full.geojson" format=geojson
# The bundled offline layer: simplified, coordinates rounded (~100 m)
$MAPSHAPER "$RAW"/ne0/*.shp -filter-fields $A0_FIELDS -simplify 6% keep-shapes -o "$BUILD/countries-simple.geojson" format=geojson precision=0.001
$MAPSHAPER "$RAW"/ne1/*.shp -filter-fields iso_3166_2,iso_a2,adm1_code,name,name_en,name_bn,type_en,gn_a1_code,latitude,longitude -o "$BUILD/regions-full.geojson" format=geojson

# Bangladesh's districts: simplified (46 MB → ~165 KB, shared borders kept aligned) and a label point inside each
$MAPSHAPER "$RAW/gb/geoBoundaries-BGD-ADM2.geojson" -simplify 1% keep-shapes -o "$BUILD/bd-districts.geojson" format=geojson precision=0.001
$MAPSHAPER "$BUILD/bd-districts.geojson" -points inner -o "$BUILD/bd-district-points.geojson" format=geojson precision=0.0001

echo "3/4 Building lookup tables and the bundled countries layer"
python3 "$ROOT/scripts/geo/prepare.py"

echo "4/4 Building PMTiles"
tippecanoe -o "$BUILD/regions.pmtiles" --force -l regions -Z0 -z8 \
  --detect-shared-borders --coalesce-densest-as-needed --extend-zooms-if-still-dropping \
  --attribution="Natural Earth; geoBoundaries" "$BUILD/regions-tiles.geojson"
tippecanoe -o "$BUILD/cities.pmtiles" --force -l cities -Z0 -z10 -r1 --buffer=16 \
  --drop-densest-as-needed --maximum-tile-bytes=1000000 \
  --attribution="GeoNames (CC BY 4.0)" "$BUILD/cities-tiles.geojson"

ls -lh "$BUILD"/*.pmtiles "$ROOT/mobile/assets/geo/countries.json" "$ROOT/mobile/assets/geo/home-regions.json" "$ROOT"/data/geo/*.json
echo "Done. If the tiles changed, bump TILES_VERSION in mobile/src/services/api.ts so phones stop using cached tiles."
