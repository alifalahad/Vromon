/**
 * The new-trip inputs that work things out: typed dates, the trip's currency and the map's
 * zoom levels (what a tap marks).
 */

import { levelAt } from '../features/map/levels';
import { placeAt } from '../features/map/WorldMap';
import { currencyFor, formatMoney, fromTaka, roundShown, toTaka } from '../features/trips/new/currency';
import { isoOf, withStart } from '../features/trips/new/DateRangeFields';

jest.mock('@maplibre/maplibre-react-native', () => ({}));

describe('typed dates', () => {
  it('reads day / month / year, and knows unfinished from impossible', () => {
    expect(isoOf({ d: '5', m: '3', y: '2027' })).toBe('2027-03-05');
    expect(isoOf({ d: '29', m: '02', y: '2028' })).toBe('2028-02-29');
    expect(isoOf({ d: '29', m: '02', y: '2027' })).toBe('invalid');
    expect(isoOf({ d: '31', m: '11', y: '2026' })).toBe('invalid');
    expect(isoOf({ d: '12', m: '13', y: '2026' })).toBe('invalid');
    expect(isoOf({ d: '12', m: '11', y: '202' })).toBeNull();
    expect(isoOf({ d: '', m: '11', y: '2026' })).toBeNull();
  });

  it('a new first day after the last moves the last along, keeping the length', () => {
    expect(withStart({ start: '2026-11-18', end: '2026-11-20' }, '2026-11-25')).toEqual({ start: '2026-11-25', end: '2026-11-27' });
    // Still before the last day: the last day stays
    expect(withStart({ start: '2026-11-18', end: '2026-11-20' }, '2026-11-19')).toEqual({ start: '2026-11-19', end: '2026-11-20' });
  });
});

describe('the budget in another currency', () => {
  const rates = { BDT: 1, USD: 0.008, JPY: 1.27 };

  it("starts in the trip country's currency", () => {
    expect(currencyFor('BD')).toBe('BDT');
    expect(currencyFor('de')).toBe('EUR');
    expect(currencyFor('JP')).toBe('JPY');
    expect(currencyFor('ZZ')).toBe('BDT');
    expect(currencyFor(null)).toBe('BDT');
  });

  it('turns an amount into taka for the planner, and back', () => {
    expect(toTaka(300, 'USD', rates)).toBe(37500);
    expect(fromTaka(37500, 'USD', rates)).toBe(300);
    expect(toTaka(25000, 'BDT', undefined)).toBe(25000);
    // No rate yet: nothing to convert with
    expect(toTaka(300, 'EUR', rates)).toBeNull();
    expect(fromTaka(1000, 'USD', undefined)).toBeNull();
  });

  it('shows round amounts with the symbol first and the language’s digits', () => {
    expect(roundShown(200.6, 'USD')).toBe(201);
    expect(roundShown(31749, 'JPY')).toBe(31700);
    expect(roundShown(12510, 'BDT')).toBe(12500);
    expect(formatMoney(1250, 'USD', 'en')).toBe('$1,250');
    expect(formatMoney(450, 'AED', 'en')).toBe('AED 450');
    expect(formatMoney(25000, 'BDT', 'en')).toBe('৳25,000');
    expect(formatMoney(25000, 'BDT', 'bn')).toBe('৳২৫,০০০');
  });
});

describe('the map by zoom', () => {
  it('shows countries, then divisions, districts and cities as it zooms in', () => {
    expect(levelAt(1.6)).toBe('country');
    expect(levelAt(6.1)).toBe('region'); // Bangladesh framed on a phone
    expect(levelAt(7.2)).toBe('district');
    expect(levelAt(9)).toBe('city');
  });

  it('a long press marks what shows at that zoom, the smallest first', () => {
    const city = { id: 1185241, country: 'BD', name: 'Dhaka' };
    const district = { code: 'BD-13', region: 'BD-C', country: 'BD', name: 'Dhaka' };
    const division = { code: 'BD-C', country: 'BD', name: 'Dhaka' };
    const country = { iso2: 'BD', name: 'Bangladesh' };
    const all = [city, district, division, country];
    expect(placeAt(all, 9)).toMatchObject({ place_type: 'city', place_code: '1185241' });
    expect(placeAt([district, division, country], 7.2)).toMatchObject({ place_type: 'district', place_code: 'BD-13' });
    expect(placeAt([district, division, country], 6)).toMatchObject({ place_type: 'region', place_code: 'BD-C' });
    expect(placeAt([division, country], 2)).toMatchObject({ place_type: 'country', place_code: 'BD' });
    expect(placeAt([], 6)).toBeNull();
  });
});
