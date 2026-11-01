import { todayBounds, todayGeoJSON } from '../features/map/todayGeo';
import { todayState } from '../features/trips/today/today';
import type { ItineraryDay, ItineraryItem } from '../types';

const item = (id: number, start: string, end: string, lat: number, lon: number, title: string): ItineraryItem =>
  ({ id, item_type: 'activity', title, start_time: start, end_time: end, order_index: id, place: { latitude: lat, longitude: lon } }) as unknown as ItineraryItem;

const DAY = {
  id: 1,
  day_number: 2,
  day_date: '2026-10-26',
  items: [
    item(1, '09:00', '10:00', 24.89, 91.87, 'Sylhet'),
    item(2, '10:30', '11:15', 25.0, 91.93, 'Ratargul'),
    item(3, '12:00', '13:00', 25.17, 91.88, 'Bisnakandi'),
    item(4, '14:30', '16:00', 25.16, 92.02, 'Jaflong'),
  ],
} as unknown as ItineraryDay;

const at = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

describe("today's route on the map", () => {
  it('marks legs done, next and later from the time of day', () => {
    const { legs, pins } = todayGeoJSON(DAY, todayState(DAY, at('11:20')), null);
    expect(legs.features.map((f) => f.properties?.kind)).toEqual(['done', 'next', 'later']);
    expect(pins.features.map((f) => f.properties?.kind)).toEqual(['done', 'done', 'next', 'later']);
    expect(pins.features[2].properties).toMatchObject({ n: '3', label: 'Bisnakandi · 12:00' });
  });

  it('starts the next leg where you are when location is on', () => {
    const { legs } = todayGeoJSON(DAY, todayState(DAY, at('11:20')), { lat: 24.95, lon: 91.9 });
    expect(legs.features[1].geometry.coordinates[0]).toEqual([91.9, 24.95]);
  });

  it('frames the stops, and you', () => {
    const [w, s, e, n] = todayBounds(DAY, { lat: 24.5, lon: 91.5 })!;
    expect(w).toBeLessThan(91.5);
    expect(s).toBeLessThan(24.5);
    expect(e).toBeGreaterThan(92.02);
    expect(n).toBeGreaterThan(25.17);
    expect(todayBounds(null, null)).toBeNull();
  });
});
