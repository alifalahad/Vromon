import {
  buildIndex,
  destinationName,
  didYouMean,
  editDistance,
  matchRange,
  normalize,
  searchDestinations,
  MAX_RESULTS,
} from '../features/trips/new/whereSearch';
import type { Destination, Place } from '../types';

const dest = (id: number, name: string, lat: number, lon: number, region_code: string): Destination => ({
  id,
  name,
  country: 'Bangladesh',
  latitude: lat,
  longitude: lon,
  region_code,
  country_iso2: 'BD',
  place_count: 10,
});

const DESTS = [
  dest(1, "Cox's Bazar", 21.43, 92.01, 'BD-B'),
  dest(2, 'Bandarban', 22.2, 92.22, 'BD-B'),
  dest(3, 'Chattogram', 22.36, 91.78, 'BD-B'),
  dest(4, 'Dhaka', 23.71, 90.41, 'BD-C'),
  dest(6, 'Kuakata', 21.82, 90.12, 'BD-A'),
  dest(9, 'Sreemangal', 24.31, 91.73, 'BD-G'),
  dest(10, 'Sylhet', 24.89, 91.87, 'BD-G'),
];
const PLACES = [
  { id: 1, name: 'Ratargul Swamp Forest', destination_name: 'Sylhet', category: 'Nature' },
  { id: 2, name: 'Himchari Waterfall', destination_name: "Cox's Bazar", category: 'Nature' },
  { id: 3, name: 'Lawachara National Park', destination_name: 'Sreemangal', category: 'Nature' },
] as Place[];
const DISTRICTS = [
  { name: 'Moulvibazar', name_bn: 'মৌলভীবাজার', lon: 91.77, lat: 24.42 },
  { name: 'Patuakhali', name_bn: 'পটুয়াখালী', lon: 90.32, lat: 22.27 },
  { name: 'Sylhet', name_bn: 'সিলেট', lon: 91.9, lat: 24.95 }, // the destination matches itself
  { name: 'Thakurgaon', name_bn: 'ঠাকুরগাঁও', lon: 88.35, lat: 26.0 }, // nothing within reach
];
const DIVISIONS = [{ code: 'BD-A', name: 'Barishal', name_bn: 'বরিশাল বিভাগ', lon: 90.25, lat: 22.46 }];

const index = buildIndex(DESTS, PLACES, DISTRICTS, DIVISIONS);
const names = (q: string) => searchDestinations(index, q).map((h) => h.destination.name);

describe('where-to search', () => {
  it('finds a destination by the start of its name, best first', () => {
    expect(names('syl')[0]).toBe('Sylhet');
    expect(names('ban')[0]).toBe('Bandarban');
  });

  it('understands other spellings and Bangla', () => {
    expect(names('chittagong')[0]).toBe('Chattogram');
    expect(names('coxs')[0]).toBe("Cox's Bazar");
    expect(names("cox's bazar")[0]).toBe("Cox's Bazar");
    expect(names('srimangal')[0]).toBe('Sreemangal');
    expect(names('কক্স')[0]).toBe("Cox's Bazar");
    expect(names('সিলেট')[0]).toBe('Sylhet');
  });

  it('forgives a typo', () => {
    expect(names('sylet')[0]).toBe('Sylhet');
    expect(names('bandarbon')[0]).toBe('Bandarban');
    expect(names('sreemongal')[0]).toBe('Sreemangal');
  });

  it('finds the destination of an attraction', () => {
    const [hit] = searchDestinations(index, 'ratargul');
    expect(hit).toMatchObject({ kind: 'place', label: 'Ratargul Swamp Forest', category: 'Nature' });
    expect(hit.destination.name).toBe('Sylhet');
  });

  it('suggests the nearest destination for a district, with the distance', () => {
    const [hit] = searchDestinations(index, 'moulvi');
    expect(hit).toMatchObject({ kind: 'district', label: 'Moulvibazar' });
    expect(hit.destination.name).toBe('Sreemangal');
    expect(hit.km).toBeLessThan(20);
    expect(names('মৌলভী')[0]).toBe('Sreemangal');
    expect(names('thakurgaon')).toEqual([]); // nothing Vromon can plan nearby
  });

  it('finds the destinations in a division', () => {
    const [hit] = searchDestinations(index, 'barishal');
    expect(hit).toMatchObject({ kind: 'division', label: 'Barishal' });
    expect(hit.destination.name).toBe('Kuakata');
  });

  it('puts a destination in the division before one near the district of the same name', () => {
    // Barishal is a division and a district; Khulna is the destination nearest the district (81 km)
    const both = buildIndex(
      [dest(6, 'Kuakata', 21.82, 90.12, 'BD-A'), dest(5, 'Khulna', 22.82, 89.55, 'BD-D')],
      [],
      [{ name: 'Barishal', name_bn: 'বরিশাল', lon: 90.35, lat: 22.7 }],
      DIVISIONS,
    );
    const hits = searchDestinations(both, 'barishal');
    expect(hits.map((h) => [h.destination.name, h.kind])).toEqual([
      ['Kuakata', 'division'],
      ['Khulna', 'district'],
    ]);
  });

  it('lists each destination once, under its best match', () => {
    const hits = searchDestinations(index, 'sylhet');
    expect(hits.filter((h) => h.destination.name === 'Sylhet')).toHaveLength(1);
    expect(hits[0]).toMatchObject({ kind: 'destination', label: 'Sylhet' });
  });

  it('shows at most 8 rows', () => {
    const many = Array.from({ length: 12 }, (_, i) => dest(100 + i, `Test town ${i}`, 23, 90, 'BD-C'));
    const big = buildIndex(many, [], [], []);
    expect(searchDestinations(big, 'test')).toHaveLength(MAX_RESULTS);
  });

  it('marks the typed text for bold, when it appears as typed', () => {
    expect(matchRange('Sylhet', 'syl')).toEqual([0, 3]);
    expect(matchRange('Ratargul Swamp Forest', 'swamp')).toEqual([9, 14]);
    expect(matchRange('Sylhet', 'sylet')).toBeNull();
  });

  it('finds nothing for nonsense, and suggests a close name when there is one', () => {
    expect(names('qqqq')).toEqual([]);
    expect(didYouMean(DESTS, 'qqqq')).toBeNull();
    expect(didYouMean(DESTS, 'kuakataa')?.name).toBe('Kuakata');
    // Too far off to list (two edits in five letters), close enough to offer: three edits from the start, two from the whole name
    expect(names('silet')).toEqual([]);
    expect(didYouMean(DESTS, 'silet')?.name).toBe('Sylhet');
  });

  it('normalizes accents, apostrophes and case', () => {
    expect(normalize("Cox’s Bāzār")).toBe('coxs bazar');
    expect(editDistance('sylhet', 'sylet')).toBe(1);
  });

  it('shows Bangla names in Bangla', () => {
    expect(destinationName('Sylhet', 'bn')).toBe('সিলেট');
    expect(destinationName('Sylhet', 'en')).toBe('Sylhet');
    expect(destinationName('Nowhere', 'bn')).toBe('Nowhere');
  });
});
