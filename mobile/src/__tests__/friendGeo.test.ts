import { FRIEND_COLORS, footprintsGeoJSON, friendColor, friendsAt } from '../features/map/friendGeo';
import type { FriendFootprint } from '../types';

const person = (id: string, display_name: string | null, username = id) => ({ id, username, display_name, avatar_url: null });
const FPS: FriendFootprint[] = [
  { place_type: 'country', place_code: 'TH', count: 3, latest_at: '2026-10-25', friends: [person('n', 'Nadia Islam'), person('t', 'Tanvir'), person('r', null, 'rafi')] },
  { place_type: 'region', place_code: 'BD-G', count: 1, latest_at: '2026-10-20', friends: [person('r', null, 'rafi')] },
  { place_type: 'region', place_code: 'IN-WB', count: 1, latest_at: '2026-10-19', friends: [person('r', null, 'rafi')] }, // no label point in the app
];

describe('friends on the map', () => {
  it('puts one marker per place: newest friend, +N more', () => {
    const fc = footprintsGeoJSON(FPS);
    expect(fc.features.map((f) => f.properties)).toEqual([
      expect.objectContaining({ place_code: 'TH', initials: 'NI', more: '+2' }),
      expect.objectContaining({ place_code: 'BD-G', initials: 'RA', more: '' }),
    ]);
  });

  it('gives a friend the same colour every time', () => {
    expect(friendColor('abc')).toBe(friendColor('abc'));
    expect(FRIEND_COLORS).toContain(friendColor('anything'));
  });

  it("names a place's friends for its sheet", () => {
    expect(friendsAt(FPS, 'country', 'TH').map((f) => f.name)).toEqual(['Nadia Islam', 'Tanvir', 'rafi']);
    expect(friendsAt(FPS, 'country', 'JP')).toEqual([]);
    expect(friendsAt(undefined, 'country', 'TH')).toEqual([]);
  });
});
