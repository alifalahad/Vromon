import { arc, destinationsGeoJSON, homePoint, stopPoints, trailsGeoJSON, upcomingGeoJSON } from '../features/map/tripGeo';
import type { Destination, Trip, TripStop } from '../types';

const stop = (position: number, lat: number | null, lon: number | null): TripStop =>
  ({ position, lat, lon, city_geonameid: null, city_name: null, country_iso2: 'BD', country_name: 'Bangladesh', transport_mode: null, arrive_on: null, depart_on: null }) as TripStop;
const trip = (id: number, destination: string, start_date: string, end_date: string, stops: TripStop[] = []): Trip =>
  ({ id, destination, start_date, end_date, stops, num_travelers: 1, total_budget: 1, currency: 'BDT', status: 'planned', num_days: 2, created_at: '' }) as Trip;
const DESTS: Destination[] = [
  { id: 1, name: "Cox's Bazar", country: 'Bangladesh', latitude: 21.43, longitude: 92.0 },
  { id: 2, name: 'Nowhere', country: 'Bangladesh', latitude: 0, longitude: 0 },
];

describe('trips on the map', () => {
  it('draws an arc that starts and ends on the two points', () => {
    const line = arc([90.4, 23.8], [91.9, 24.9]);
    expect(line[0]).toEqual([90.4, 23.8]);
    expect(line[line.length - 1]).toEqual([91.9, 24.9]);
    expect(line.length).toBe(25);
  });

  it('orders stops and skips the unplaced ones', () => {
    expect(stopPoints(trip(1, 'x', '', '', [stop(1, 24.9, 91.9), stop(0, 23.8, 90.4), stop(2, null, null)]))).toEqual([
      [90.4, 23.8],
      [91.9, 24.9],
    ]);
  });

  it('trails only finished trips with two placed stops', () => {
    const trips = [
      trip(1, 'Sylhet', '2026-03-01', '2026-03-04', [stop(0, 23.8, 90.4), stop(1, 24.3, 91.7), stop(2, 24.9, 91.9)]),
      trip(2, 'Khulna', '2026-04-01', '2026-04-02', [stop(0, 22.8, 89.5)]), // one stop: nothing to join
      trip(3, 'Bandarban', '2026-12-01', '2026-12-03', [stop(0, 23.8, 90.4), stop(1, 22.2, 92.2)]), // not yet
    ];
    const trails = trailsGeoJSON(trips, '2026-10-26');
    expect(trails.features.map((f) => f.properties?.trip)).toEqual([1]);
    expect(trails.features[0].geometry.coordinates.length).toBe(49); // two arcs, the shared point once
  });

  it('arcs to the coming trip from its first stop, else from home', () => {
    const routed = upcomingGeoJSON(trip(3, 'Bandarban', '2026-11-01', '2026-11-03', [stop(0, 23.8, 90.4), stop(1, 22.2, 92.2)]), DESTS, [0, 0]);
    expect(routed.line.features[0].geometry.coordinates[0]).toEqual([90.4, 23.8]);
    expect(routed.pin.features[0].geometry.coordinates).toEqual([92.2, 22.2]);

    const fromHome = upcomingGeoJSON(trip(4, "Cox's Bazar", '2026-11-01', '2026-11-03'), DESTS, [90.25, 23.83]);
    expect(fromHome.line.features[0].geometry.coordinates[0]).toEqual([90.25, 23.83]);
    expect(fromHome.pin.features[0].properties?.name).toBe("Cox's Bazar");

    expect(upcomingGeoJSON(null, DESTS, null).pin.features).toEqual([]);
  });

  it('starts from the region you live in, else your country', () => {
    expect(homePoint('BD-C', 'BD')).toEqual([90.2523, 23.8298]);
    expect(homePoint(null, 'BD')).not.toBeNull();
  });

  it('dots every destination with a position, except one already pinned', () => {
    expect(destinationsGeoJSON(DESTS).features.map((f) => f.properties?.name)).toEqual(["Cox's Bazar"]);
    expect(destinationsGeoJSON(DESTS, "Cox's Bazar").features).toEqual([]);
  });
});
