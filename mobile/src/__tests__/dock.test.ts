import { ideasFrom, pickDockState } from '../features/map/dockState';
import type { Destination, Trip, Visit } from '../types';

const trip = (id: number, destination: string, start_date: string, end_date: string): Trip =>
  ({ id, destination, start_date, end_date, num_travelers: 2, total_budget: 20000, currency: 'BDT', status: 'planned', num_days: 3, created_at: '2026-10-01' }) as Trip;
const dest = (id: number, name: string, region_code: string, country_iso2 = 'BD'): Destination => ({ id, name, country: 'Bangladesh', region_code, country_iso2 });
const want = (place_type: Visit['place_type'], place_code: string, updated_at = '2026-10-01T00:00:00Z'): Visit => ({
  place_type,
  place_code,
  status: 'want',
  first_visited_on: null,
  last_visited_on: null,
  note: null,
  updated_at,
});

const DESTS = [dest(1, "Cox's Bazar", 'BD-B'), dest(2, 'Bandarban', 'BD-B'), dest(5, 'Khulna', 'BD-D'), dest(10, 'Sylhet', 'BD-G')];

describe('the dock follows the moment', () => {
  it('shows today’s trip, on its first and last day', () => {
    const t = trip(7, 'Sylhet', '2026-10-25', '2026-10-27');
    expect(pickDockState([t], [], DESTS, '2026-10-25')).toEqual({ kind: 'today', trip: t, day: 1, days: 3 });
    expect(pickDockState([t], [], DESTS, '2026-10-27')).toMatchObject({ kind: 'today', day: 3 });
  });

  it('shows the soonest trip within 30 days, with days to go', () => {
    const later = trip(8, 'Bandarban', '2026-11-20', '2026-11-22');
    const sooner = trip(9, "Cox's Bazar", '2026-10-29', '2026-10-31');
    expect(pickDockState([later, sooner], [], DESTS, '2026-10-23')).toEqual({ kind: 'upcoming', trip: sooner, daysAway: 6 });
    // 2026-10-20 → 11-20 is 31 days away: too far for the dock
    expect(pickDockState([later], [], DESTS, '2026-10-20').kind).toBe('empty');
    expect(pickDockState([later], [], DESTS, '2026-10-21')).toMatchObject({ kind: 'upcoming', daysAway: 30 });
  });

  it('ignores past trips and trips more than 30 days away', () => {
    const past = trip(1, 'Sylhet', '2026-09-01', '2026-09-03');
    const far = trip(2, 'Khulna', '2027-01-10', '2027-01-12');
    expect(pickDockState([past, far], [], DESTS, '2026-10-26').kind).toBe('empty');
  });

  it('suggests Want-list places Vromon can plan, newest wish first', () => {
    const visits = [want('region', 'BD-D', '2026-10-01T00:00:00Z'), want('region', 'BD-B', '2026-10-20T00:00:00Z'), want('region', 'BD-F')];
    const state = pickDockState([], visits, DESTS, '2026-10-26');
    expect(state.kind).toBe('idea');
    if (state.kind !== 'idea') return;
    expect(state.ideas.map((i) => i.destination.name)).toEqual(["Cox's Bazar", 'Bandarban', 'Khulna']); // Rangpur (BD-F) has none
  });

  it('matches a wanted country to its destinations, and skips destinations already planned', () => {
    const ideas = ideasFrom([want('country', 'BD')], DESTS, [trip(3, 'Sylhet', '2026-12-01', '2026-12-03')], '2026-10-26');
    expect(ideas.map((i) => i.destination.name)).toEqual(["Cox's Bazar", 'Bandarban', 'Khulna']);
  });

  it("shows a friend's newest place when the Friends layer is on, but never over a trip", () => {
    const fp = { place_type: 'country' as const, place_code: 'TH', count: 2, latest_at: '2026-10-25T00:00:00Z', friends: [{ id: 'n', username: 'nadia', display_name: 'Nadia', avatar_url: null }] };
    expect(pickDockState([], [want('region', 'BD-B')], DESTS, '2026-10-26', fp)).toEqual({ kind: 'social', footprint: fp });
    const soon = trip(9, "Cox's Bazar", '2026-10-29', '2026-10-31');
    expect(pickDockState([soon], [], DESTS, '2026-10-26', fp).kind).toBe('upcoming');
  });

  it('is empty with nothing to show', () => {
    expect(pickDockState([], [], DESTS, '2026-10-26')).toEqual({ kind: 'empty' });
  });
});
