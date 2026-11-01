import { placesPerYear, replaySteps, ringFraction, undatedCount, wantCount } from '../features/map/story';
import type { Visit } from '../types';

const visit = (status: Visit['status'], first_visited_on: string | null, code = 'X'): Visit => ({
  place_type: 'region',
  place_code: code,
  status,
  first_visited_on,
  last_visited_on: null,
  note: null,
  updated_at: '2026-10-26T00:00:00Z',
});

const NOW = new Date('2026-10-26T12:00:00');

describe('your story figures', () => {
  it('groups new places by the year first visited, last 5 years, empty years kept', () => {
    const visits = [
      visit('lived', '2022-03-01'),
      visit('visited', '2024-01-05'),
      visit('visited', '2024-12-31'),
      visit('visited', '2026-02-01'),
      visit('visited', '2019-05-05'), // too old for the 5 bars
      visit('want', '2025-01-01'), // a wish, not a visit
      visit('visited', null), // no date
    ];
    expect(placesPerYear(visits, NOW)).toEqual([
      { year: 2022, count: 1 },
      { year: 2023, count: 0 },
      { year: 2024, count: 2 },
      { year: 2025, count: 0 },
      { year: 2026, count: 1 },
    ]);
  });

  it('ignores dates in the future', () => {
    expect(placesPerYear([visit('visited', '2027-01-01')], NOW).every((y) => y.count === 0)).toBe(true);
  });

  it('counts undated places and the Want list', () => {
    const visits = [visit('visited', null), visit('lived', null), visit('visited', '2020-01-01'), visit('want', null)];
    expect(undatedCount(visits)).toBe(2);
    expect(wantCount(visits)).toBe(1);
  });

  it('keeps the ring between empty and full', () => {
    expect(ringFraction(3, 8)).toBe(0.375);
    expect(ringFraction(9, 8)).toBe(1);
    expect(ringFraction(0, 0)).toBe(0);
  });
});

describe('replay', () => {
  const visits = [
    visit('lived', '2022-03-01', 'BD-C'),
    visit('visited', '2024-01-05', 'BD-B'),
    visit('visited', null, 'BD-G'),
    visit('want', '2023-01-01', 'BD-D'),
  ];

  it('steps year by year from the first dated visit, then the undated places', () => {
    const steps = replaySteps(visits, NOW);
    expect(steps.map((s) => s.year)).toEqual([2022, 2023, 2024, 2025, 2026, null]);
    expect(steps[0].visits.map((v) => v.place_code)).toEqual(['BD-C']);
    expect(steps[1].added).toEqual([]); // a quiet year still gets its step
    expect(steps[2].visits.map((v) => v.place_code)).toEqual(['BD-C', 'BD-B']);
    expect(steps[5].visits.map((v) => v.place_code)).toEqual(['BD-C', 'BD-B', 'BD-G']);
  });

  it('never shows the Want list, and is empty without visits', () => {
    expect(replaySteps(visits, NOW).flatMap((s) => s.visits).some((v) => v.status === 'want')).toBe(false);
    expect(replaySteps([visit('want', '2023-01-01')], NOW)).toEqual([]);
  });
});
