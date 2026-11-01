import { BUNDLED_HOMES, countriesVisited, countryBounds, homeRegionProgress, regionWord } from '../features/map/home';
import type { Visit } from '../types';

const visit = (place_type: Visit['place_type'], place_code: string, status: Visit['status'], country_iso2?: string): Visit => ({
  place_type,
  place_code,
  status,
  first_visited_on: null,
  last_visited_on: null,
  note: null,
  updated_at: '2026-10-26T00:00:00Z',
  country_iso2,
});

describe('home country on the map', () => {
  it('frames Bangladesh around its mainland', () => {
    const [w, s, e, n] = countryBounds('BD')!;
    expect(w).toBeGreaterThan(87.5);
    expect(e).toBeLessThan(93);
    expect(s).toBeGreaterThan(20);
    expect(n).toBeLessThan(27);
  });

  it("frames a country with overseas parts around its largest part (France: not French Guiana)", () => {
    const [w] = countryBounds('FR')!;
    expect(w).toBeGreaterThan(-10);
  });

  it('has no bounds for an unknown code', () => {
    expect(countryBounds('ZZ')).toBeNull();
  });

  it('counts home divisions visited or lived in, out of 8', () => {
    const visits = [
      visit('region', 'BD-C', 'lived', 'BD'),
      visit('region', 'BD-G', 'visited', 'BD'),
      visit('region', 'BD-H', 'visited'), // queued offline, no country from the server yet
      visit('region', 'BD-D', 'want', 'BD'),
      visit('region', 'IN-WB', 'visited', 'IN'),
      visit('country', 'BD', 'lived', 'BD'),
    ];
    expect(homeRegionProgress(visits, 'BD')).toEqual({ done: 3, total: 8 });
    expect(homeRegionProgress(visits, 'IN')).toBeNull(); // India's regions aren't bundled
  });

  it('counts countries visited or lived in, not wanted', () => {
    expect(countriesVisited([visit('country', 'BD', 'lived'), visit('country', 'NP', 'visited'), visit('country', 'JP', 'want')])).toBe(2);
  });

  it("calls Bangladesh's regions divisions", () => {
    expect(BUNDLED_HOMES).toEqual(['BD']);
    expect(regionWord('BD')).toBe('divisions');
    expect(regionWord('IN')).toBe('regions');
  });
});
