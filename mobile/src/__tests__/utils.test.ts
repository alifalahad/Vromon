import { ApiError, errorMessage } from '../services/api';
import type { ItineraryDay, ValidationReport } from '../types';
import { formatBDT, formatMinutes, nightsBetween, plural } from '../utils/format';
import {
  dayTabLabel,
  describeSolver,
  issuesForItem,
  itemCostLabel,
  mapStops,
  regionFor,
  statusLabel,
  summariseValidation,
} from '../utils/itinerary';

const place = (id: number, lat?: number, lng?: number) => ({
  id, name: `P${id}`, destination_name: 'X', category: 'Beach', latitude: lat, longitude: lng,
});

const day: ItineraryDay = {
  id: 1, trip_id: 1, day_number: 2, total_cost: 0, total_travel_time: 0,
  items: [
    { id: 10, item_type: 'activity', title: 'B', start_time: '13:00', end_time: '14:00', duration_minutes: 60, cost: 0,
      travel_time_to_next: 0, distance_to_next: 0, recommendation_score: 0.5, recommendation_reasons: [], currency: 'BDT', cost_source: 'data', order_index: 2,
      place: place(2, 21.5, 92.1) },
    { id: 11, item_type: 'meal', title: 'Lunch', start_time: '12:00', end_time: '13:00', duration_minutes: 60, cost: 300,
      travel_time_to_next: 0, distance_to_next: 0, recommendation_score: 0, recommendation_reasons: [], currency: 'BDT', cost_source: 'data', order_index: 1 },
    { id: 12, item_type: 'activity', title: 'A', start_time: '10:00', end_time: '11:00', duration_minutes: 60, cost: 0,
      travel_time_to_next: 12, distance_to_next: 6, recommendation_score: 0.9, recommendation_reasons: [], currency: 'BDT', cost_source: 'data', order_index: 0,
      place: place(1, 21.4, 92.0) },
    { id: 13, item_type: 'activity', title: 'NoCoords', start_time: '15:00', end_time: '16:00', duration_minutes: 60, cost: 0,
      travel_time_to_next: 0, distance_to_next: 0, recommendation_score: 0.4, recommendation_reasons: [], currency: 'BDT', cost_source: 'data', order_index: 3,
      place: place(3) },
  ],
};

describe('format', () => {
  it('formats taka with grouping and sign', () => {
    expect(formatBDT(1500)).toBe('৳1,500');
    expect(formatBDT(1234567.6)).toBe('৳1,234,568');
    expect(formatBDT(-2500)).toBe('-৳2,500');
    expect(formatBDT(0)).toBe('৳0');
  });
  it('formats minutes', () => {
    expect(formatMinutes(40)).toBe('40 min');
    expect(formatMinutes(95)).toBe('1 h 35 min');
    expect(formatMinutes(120)).toBe('2 h');
  });
  it('pluralises', () => {
    expect(plural(1, 'night')).toBe('1 night');
    expect(plural(0, 'night')).toBe('0 nights');
  });
  it('counts nights', () => {
    expect(nightsBetween('2026-11-01', '2026-11-03')).toBe(2);
    expect(nightsBetween('2026-11-03', '2026-11-01')).toBe(0);
  });
});

describe('map helpers', () => {
  it('returns activities with coordinates in visiting order, skipping meals', () => {
    const stops = mapStops(day);
    expect(stops.map((s) => s.title)).toEqual(['A', 'B']);
    expect(stops.map((s) => s.order)).toEqual([1, 2]);
    expect(stops[0].dayNumber).toBe(2);
  });
  it('computes a region that contains every stop', () => {
    const r = regionFor(mapStops(day))!;
    expect(r.latitude).toBeCloseTo(21.45);
    expect(r.latitudeDelta).toBeGreaterThanOrEqual(0.1);
    expect(regionFor([])).toBeNull();
  });
});

describe('validation summary', () => {
  const report = (violations: ValidationReport['violations']): ValidationReport => ({
    trip_id: 1, valid: !violations.some((v) => v.severity === 'hard'),
    hard_violation_count: 0, soft_violation_count: 0, violations,
  });
  it('is an error when any hard violation exists', () => {
    const s = summariseValidation(report([
      { severity: 'soft', code: 'AFTER_PREFERRED_END', message: 'late' },
      { severity: 'hard', code: 'MUST_VISIT_MISSING', message: 'missing' },
    ]));
    expect(s.tone).toBe('error');
    expect(s.messages[0]).toBe('missing');
  });
  it('keeps hard, soft and data notes apart, and info never makes a plan invalid', () => {
    const s = summariseValidation(report([
      { severity: 'info', code: 'ESTIMATED_TRAVEL_TIME', message: 'straight-line' },
      { severity: 'soft', code: 'NO_ACTIVITIES', message: 'empty day' },
      { severity: 'hard', code: 'EXCLUDED_PLACE_SCHEDULED', message: 'excluded' },
    ]));
    expect(s).toMatchObject({ hard: ['excluded'], soft: ['empty day'], info: ['straight-line'] });
    expect(s.title).toMatch(/^Not valid/);
    const infoOnly = summariseValidation(report([{ severity: 'info', code: 'ESTIMATED_TRAVEL_TIME', message: 'x' }]));
    expect(infoOnly.tone).toBe('ok');
  });
  it('is a warning for soft-only and ok for none', () => {
    expect(summariseValidation(report([{ severity: 'soft', code: 'X', message: 'late' }])).tone).toBe('warning');
    expect(summariseValidation(report([])).tone).toBe('ok');
    expect(summariseValidation(null).tone).toBe('warning');
  });
  it('never calls a FEASIBLE solver result optimal', () => {
    const base = { objective: 1, best_bound: 1.1, wall_time_s: 2, time_limit_s: 15, deterministic_limit: 5,
      reproducible: true, diagnostics: [] };
    expect(describeSolver({ ...base, status: 'FEASIBLE', optimality_gap: 0.05 })).toContain('not proven best');
    expect(describeSolver({ ...base, status: 'OPTIMAL', optimality_gap: 0 })).toContain('proven best');
    expect(describeSolver(null)).toBeNull();
  });
});

describe('api errors', () => {
  it('extracts messages from FastAPI error shapes', () => {
    expect(errorMessage('Not found', 'x')).toBe('Not found');
    expect(errorMessage([{ msg: 'field required' }, { msg: 'too short' }], 'x')).toBe('field required\ntoo short');
    expect(errorMessage({ message: 'No itinerary satisfies all hard constraints.', solver: {} }, 'x'))
      .toBe('No itinerary satisfies all hard constraints.');
    expect(errorMessage(undefined, 'fallback')).toBe('fallback');
  });
  it('names the field in FastAPI validation errors', () => {
    const detail = [
      { loc: ['body', 'end_date'], msg: 'Value error, end_date must be on or after start_date' },
      { loc: ['body', 'constraints', 'max_activities_per_day'], msg: 'Input should be less than or equal to 10' },
      { loc: ['body'], msg: 'Value error, trips can be at most 30 days long' },
    ];
    expect(errorMessage(detail, 'x')).toBe(
      'end date: end_date must be on or after start_date\n' +
        'max activities per day: Input should be less than or equal to 10\n' +
        'trips can be at most 30 days long',
    );
  });
  it('ApiError keeps status and detail', () => {
    const e = new ApiError('m', 422, { solver: { status: 'INFEASIBLE' } });
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(422);
  });
});

describe('itinerary display helpers', () => {
  it('never shows a placeholder price as a real cost or a missing cost as a number', () => {
    expect(itemCostLabel({ cost: 300, currency: 'BDT', cost_source: 'placeholder' })).toBe('Price unknown (est. ৳300)');
    expect(itemCostLabel({ cost: 0, currency: 'BDT', cost_source: 'data' })).toBe('Free');
    expect(itemCostLabel({ cost: 1500, currency: 'BDT', cost_source: 'data' })).toBe('৳1,500');
    expect(itemCostLabel({ cost: 12, currency: 'USD', cost_source: 'data' })).toBe('12 USD');
  });
  it('labels days with their date', () => {
    expect(dayTabLabel({ day_number: 2, day_date: '2026-11-02' })).toBe('Day 2 · 2 Nov');
    expect(dayTabLabel({ day_number: 1, day_date: undefined })).toBe('Day 1');
  });
  it('maps the backend status and finds issues for one item', () => {
    expect(statusLabel('invalid')).toBe('Has constraint problems');
    expect(statusLabel('valid_with_warnings')).toBe('Valid with warnings');
    expect(statusLabel(null)).toBe('Not generated');
    const rep: ValidationReport = {
      trip_id: 1, valid: false, hard_violation_count: 1, soft_violation_count: 0,
      violations: [
        { severity: 'hard', code: 'EXCLUDED_PLACE_SCHEDULED', message: 'a', item_id: 12 },
        { severity: 'info', code: 'ESTIMATED_TRAVEL_TIME', message: 'b' },
      ],
    };
    expect(issuesForItem(rep, 12).map((v) => v.message)).toEqual(['a']);
    expect(issuesForItem(rep, 99)).toEqual([]);
    expect(issuesForItem(null, 12)).toEqual([]);
  });
});
