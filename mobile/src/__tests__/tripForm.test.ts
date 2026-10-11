import {
  cyclePlaceChoice,
  defaultTripForm,
  firstStepWithError,
  isCalendarDate,
  MAX_TRIP_DAYS,
  stepError,
  toTripPayload,
  tripFormSchema,
} from '../features/tripForm';

const valid = () => ({
  ...defaultTripForm(new Date('2026-11-01T00:00:00Z')),
  destination: "Cox's Bazar",
  interests: ['Beach'],
});

describe('tripFormSchema', () => {
  it('accepts a complete form and applies defaults', () => {
    const r = tripFormSchema.safeParse(valid());
    expect(r.success).toBe(true);
  });

  it('requires at least one interest', () => {
    const r = tripFormSchema.safeParse({ ...valid(), interests: [] });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0])).toContain('interests');
  });

  it('rejects an end date before the start date', () => {
    const r = tripFormSchema.safeParse({ ...valid(), start_date: '2026-11-05', end_date: '2026-11-01' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(['end_date']);
  });

  it('rejects a day that ends before it starts and malformed times', () => {
    expect(tripFormSchema.safeParse({ ...valid(), preferred_start_time: '18:00', preferred_end_time: '09:00' }).success).toBe(false);
    expect(tripFormSchema.safeParse({ ...valid(), preferred_start_time: '9am' }).success).toBe(false);
  });

  it('rejects a place that is both must-visit and excluded', () => {
    const r = tripFormSchema.safeParse({ ...valid(), must_visit: [3], excluded_places: [3] });
    expect(r.success).toBe(false);
  });

  it('coerces numeric text input and rejects zero budget', () => {
    expect(tripFormSchema.safeParse({ ...valid(), total_budget: '30000' }).success).toBe(true);
    expect(tripFormSchema.safeParse({ ...valid(), total_budget: 0 }).success).toBe(false);
  });

  it('rejects impossible calendar dates', () => {
    expect(isCalendarDate('2026-02-28')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-31')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    const r = tripFormSchema.safeParse({ ...valid(), start_date: '2026-02-31' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('Not a real date');
  });

  it('enforces the backend trip length limit', () => {
    expect(MAX_TRIP_DAYS).toBe(30);
    expect(tripFormSchema.safeParse({ ...valid(), start_date: '2026-11-01', end_date: '2026-11-30' }).success).toBe(true);
    const r = tripFormSchema.safeParse({ ...valid(), start_date: '2026-11-01', end_date: '2026-12-01' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(['end_date']);
  });

  it('can start with a destination already chosen', () => {
    expect(defaultTripForm(new Date('2026-11-01T00:00:00Z'), "Cox's Bazar").destination).toBe("Cox's Bazar");
    expect(defaultTripForm(new Date('2026-11-01T00:00:00Z')).destination).toBe('');
  });

  it('only allows travel styles the backend understands', () => {
    expect(tripFormSchema.safeParse({ ...valid(), travel_style: 'Active' }).success).toBe(false);
    expect(tripFormSchema.safeParse({ ...valid(), travel_style: 'Packed' }).success).toBe(true);
  });
});

describe('toTripPayload', () => {
  it('maps form values to the backend TripCreate shape', () => {
    const values = tripFormSchema.parse({ ...valid(), must_visit: [5], excluded_places: [1], avoid_crowded: true });
    const p = toTripPayload(values);
    expect(p.preference?.interests).toEqual(['Beach']);
    expect(p.preference?.preferred_start_time).toBe('09:00');
    expect(p.constraints).toEqual({
      max_activities_per_day: 4,
      max_daily_budget: 0,
      avoid_crowded: true,
      must_visit: [5],
      excluded_places: [1],
    });
  });
});

describe('cyclePlaceChoice', () => {
  it('cycles none → must → exclude → none and keeps lists disjoint', () => {
    let s = cyclePlaceChoice(7, [], []);
    expect(s).toEqual({ must_visit: [7], excluded_places: [], choice: 'must' });
    s = cyclePlaceChoice(7, s.must_visit, s.excluded_places);
    expect(s).toEqual({ must_visit: [], excluded_places: [7], choice: 'exclude' });
    s = cyclePlaceChoice(7, s.must_visit, s.excluded_places);
    expect(s).toEqual({ must_visit: [], excluded_places: [], choice: 'none' });
  });
});

describe('wizard step checks', () => {
  it('catches a reversed date range on the dates step', () => {
    expect(stepError(1, { start_date: '2026-11-05', end_date: '2026-11-01' })).toMatch(/End date/);
    expect(stepError(1, { start_date: '2026-11-01', end_date: '2026-11-01' })).toBeNull();
    expect(stepError(1, { start_date: '2026-11-01', end_date: '2026-12-15' })).toMatch(/at most 30 days/);
  });
  it('catches bad day hours and must/excluded overlap on the schedule step', () => {
    expect(stepError(4, { preferred_start_time: '20:00', preferred_end_time: '09:00' })).toMatch(/end after/);
    expect(stepError(4, { must_visit: [2], excluded_places: [2] })).toMatch(/both/);
    expect(stepError(4, { preferred_start_time: '09:00', preferred_end_time: '20:00', must_visit: [1], excluded_places: [2] })).toBeNull();
  });
  it('maps error fields back to their step', () => {
    expect(firstStepWithError(['interests'])).toBe(3);
    expect(firstStepWithError(['end_date', 'interests'])).toBe(1);
    expect(firstStepWithError([])).toBe(5);
  });
});
