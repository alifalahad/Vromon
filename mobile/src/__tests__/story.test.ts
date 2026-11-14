import { replaySteps, ringFraction } from '../features/map/story';
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

describe('the ring', () => {
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
