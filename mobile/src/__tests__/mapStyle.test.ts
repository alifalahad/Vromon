import { compareColorExpression, MAP_STYLE, markedCodes, statusColorExpression, usedStatuses } from '../features/map/style';
import { readableOn } from '../features/mapThemes/color';
import type { Visit } from '../types';

const visit = (place_type: Visit['place_type'], place_code: string, status: Visit['status']): Visit => ({
  place_type,
  place_code,
  status,
  first_visited_on: null,
  last_visited_on: null,
  note: null,
  updated_at: '2026-10-13T00:00:00',
});

// The "Default" status palette (prompt §7.3)
const STATUS_COLORS = { visited: '#B7268B', want: '#4094F6', lived: '#4712A2' };

const VISITS = [
  visit('country', 'BD', 'lived'),
  visit('country', 'NP', 'want'),
  visit('region', 'BD-C', 'visited'),
  visit('city', '1185241', 'visited'),
];

describe('visit-status style expression', () => {
  it('matches country codes to status colours with the land colour as fallback', () => {
    expect(statusColorExpression(VISITS, 'country', 'iso2', '#303030', STATUS_COLORS)).toEqual([
      'match', ['get', 'iso2'], 'BD', STATUS_COLORS.lived, 'NP', STATUS_COLORS.want, '#303030',
    ]);
  });

  it('only uses visits of the requested place type', () => {
    expect(statusColorExpression(VISITS, 'region', 'code', '#000', STATUS_COLORS)).toEqual(['match', ['get', 'code'], 'BD-C', STATUS_COLORS.visited, '#000']);
  });

  it('compares numeric city ids as strings', () => {
    expect(statusColorExpression(VISITS, 'city', 'id', '#000', STATUS_COLORS)).toEqual([
      'match', ['to-string', ['get', 'id']], '1185241', STATUS_COLORS.visited, '#000',
    ]);
  });

  it('is a plain colour when nothing is marked (a match needs at least one pair)', () => {
    expect(statusColorExpression([], 'country', 'iso2', '#303030', STATUS_COLORS)).toBe('#303030');
  });

  it('lists marked codes and used statuses in legend order', () => {
    expect(markedCodes(VISITS, 'country')).toEqual(['BD', 'NP']);
    expect(markedCodes(VISITS, 'country', ['want'])).toEqual(['NP']);
    expect(usedStatuses(VISITS)).toEqual(['visited', 'want', 'lived']);
    expect(usedStatuses([visit('country', 'IN', 'visited')])).toEqual(['visited']);
  });
});

describe('friend comparison expression', () => {
  const colors = { you: '#111111', friend: '#222222', inCommon: '#333333' };

  it('colours places in common, only mine and only theirs', () => {
    expect(compareColorExpression(['DE', 'NO'], ['DE', 'PT'], 'country', 'iso2', '#000000', colors)).toEqual([
      'match', ['get', 'iso2'], 'DE', '#333333', 'NO', '#111111', 'PT', '#222222', '#000000',
    ]);
  });

  it('is the land colour when neither has anything', () => {
    expect(compareColorExpression([], [], 'country', 'iso2', '#000000', colors)).toBe('#000000');
  });
});

describe('map style', () => {
  it('holds only glyphs: every layer is a React child, so themes repaint without a style reload', () => {
    expect(MAP_STYLE.layers).toEqual([]);
    expect(MAP_STYLE.glyphs).toContain('{fontstack}');
  });
});

describe('readable text on status colours', () => {
  it('picks the higher-contrast of black and white', () => {
    expect(readableOn(STATUS_COLORS.visited)).toBe('#FFFFFF'); // #B7268B
    expect(readableOn(STATUS_COLORS.lived)).toBe('#FFFFFF'); // #4712A2
    expect(readableOn(STATUS_COLORS.want)).toBe('#000000'); // #4094F6: white would be ~3.2:1
  });
});
