/** Bundled map data (built by scripts/geo/build.sh), shared by the map layers and the theme preview. */

// The simplified Natural Earth countries (Bangladesh point of view); works offline
export const COUNTRIES = require('../../../assets/geo/countries.json') as GeoJSON.FeatureCollection;
// One label point per country (Natural Earth placement and minimum label zoom)
export const COUNTRY_LABELS = require('../../../assets/geo/country-labels.json') as GeoJSON.FeatureCollection;

type Ring = GeoJSON.Position[];

// Shoelace sum; the sign gives the ring's winding
const signedArea = (ring: Ring) => ring.reduce((sum, [x1, y1], i) => {
  const [x2, y2] = ring[(i + 1) % ring.length];
  return sum + (x1 * y2 - x2 * y1);
}, 0);

const wound = (ring: Ring, positive: boolean) => ((signedArea(ring) > 0) === positive ? ring : [...ring].reverse());

let ocean: GeoJSON.Feature<GeoJSON.Polygon> | null = null;

/**
 * The sea: a world-sized polygon with every country cut out. Drawn above terrain
 * shading so relief shows on land only (the elevation tiles include the sea floor).
 * Built on first use; holes wind opposite to the outer ring, as MapLibre expects.
 */
export function oceanMask(): GeoJSON.Feature<GeoJSON.Polygon> {
  if (ocean) return ocean;
  const world: Ring = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  const holes: Ring[] = [];
  for (const f of COUNTRIES.features) {
    const g = f.geometry;
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const p of polygons) holes.push(wound(p[0], false));
  }
  ocean = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [wound(world, true), ...holes] } };
  return ocean;
}

let labelPoints: Map<string, [number, number]> | null = null;

/** A country's label point (Natural Earth placement), for framing a map around countries. */
export function countryLabelPoint(iso2: string): [number, number] | undefined {
  labelPoints ??= new Map(
    COUNTRY_LABELS.features.map((f) => [String(f.properties?.iso2), (f.geometry as GeoJSON.Point).coordinates as [number, number]]),
  );
  return labelPoints.get(iso2);
}
