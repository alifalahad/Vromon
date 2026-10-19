import {
  addMustSee,
  addSkip,
  defaultNewTrip,
  hotelLevel,
  tierBudget,
  timesBetween,
  toPayload,
  tripLength,
  update,
  whereWhenError,
  withTime,
} from '../features/trips/new/newTrip';
import { afterBusy, dayRulesOf, retime } from '../features/trips/plan/timeline';
import type { ItineraryItem, Trip } from '../types';

const TODAY = new Date('2026-10-18T10:00:00');

describe('the new-trip answers', () => {
  it('starts a week from today, three days, two travellers, a comfortable budget', () => {
    const t = defaultNewTrip(TODAY, "Cox's Bazar");
    expect(t.start).toBe('2026-10-25');
    expect(t.end).toBe('2026-10-27');
    expect(tripLength(t)).toBe(3);
    expect(t.budget).toBe(tierBudget('Comfort', 2, 3));
    expect(whereWhenError(t)).toBeNull();
    expect(whereWhenError(defaultNewTrip(TODAY))).toBe('destination');
  });

  it('keeps the budget in step with the level, travellers and days, until it is set by hand', () => {
    let t = defaultNewTrip(TODAY, "Cox's Bazar");
    t = update(t, { tier: 'Luxury' });
    expect(t.budget).toBe(48000);
    t = update(t, { travellers: 4 });
    expect(t.budget).toBe(96000);
    t = update(t, { end: '2026-10-25' }); // one day
    expect(t.budget).toBe(32000);
    t = update(t, { budget: 20000, budgetByHand: true });
    t = update(t, { travellers: 5 });
    expect(t.budget).toBe(20000);
  });

  it('chooses the hotel level from the budget', () => {
    const t = defaultNewTrip(TODAY, "Cox's Bazar");
    expect(hotelLevel(update(t, { tier: 'Budget' }))).toBe('Budget');
    expect(hotelLevel(t)).toBe('Standard');
    // ৳60,000 for 2 people and 3 days is ৳10,000 a person a day: luxury
    expect(hotelLevel({ ...t, budget: 60000, budgetByHand: true })).toBe('Luxury');
    expect(hotelLevel({ ...t, budget: 9000, budgetByHand: true })).toBe('Budget');
  });

  it('drops a day the trip no longer has from must-sees and busy times', () => {
    let t = defaultNewTrip(TODAY, "Cox's Bazar");
    t = { ...t, mustSees: [{ place_id: 4, day: 3, when: 'sunset', at: null }], busy: [{ day: 3, start: '18:00', end: '21:00', label: null }] };
    t = update(t, { end: '2026-10-26' });
    expect(t.mustSees).toEqual([{ place_id: 4, day: null, when: 'sunset', at: null }]);
    expect(t.busy).toEqual([]);
  });

  it('keeps must-sees and skipped places apart', () => {
    let t = addMustSee(defaultNewTrip(TODAY, "Cox's Bazar"), 4);
    t = addSkip(t, 4);
    expect(t.mustSees).toEqual([]);
    expect(t.skip).toEqual([4]);
    t = addMustSee(t, 4);
    expect(t.skip).toEqual([]);
    expect(addMustSee(t, 4)).toBe(t);
  });

  it('a time of day and an exact time replace each other', () => {
    const m = { place_id: 4, day: null, when: 'sunset' as const, at: null };
    expect(withTime(m, { at: '15:00' })).toEqual({ place_id: 4, day: null, when: null, at: '15:00' });
    expect(withTime({ ...m, when: null, at: '15:00' }, { when: 'morning' })).toEqual({ place_id: 4, day: null, when: 'morning', at: null });
    expect(withTime(m, { day: 2 })).toEqual({ ...m, day: 2 });
  });

  it('sends must-sees, busy times, arrival and leaving, and lets the pace set the stops a day', () => {
    const t = {
      ...defaultNewTrip(TODAY, "Cox's Bazar"),
      arrive: '14:00',
      leave: '11:00',
      pace: 'Packed' as const,
      mustSees: [{ place_id: 4, day: 1, when: 'sunset' as const, at: null }],
      busy: [{ day: 2, start: '18:00', end: '21:00', label: 'Wedding' }],
      skip: [25],
    };
    const p = toPayload(t);
    expect(p.preference).toMatchObject({ travel_style: 'Packed', arrive_time: '14:00', leave_time: '11:00', accommodation_preference: 'Standard' });
    expect(p.constraints).toEqual({ avoid_crowded: false, must_sees: t.mustSees, busy: t.busy, excluded_places: [25] });
    expect(p.constraints).not.toHaveProperty('max_activities_per_day');
  });

  it('lists half-hour times', () => {
    expect(timesBetween('18:00', '19:30')).toEqual(['18:00', '18:30', '19:00', '19:30']);
  });
});

describe('re-timing with busy times', () => {
  const stop = (id: number, start: string, minutes: number): ItineraryItem =>
    ({
      id,
      item_type: 'activity',
      title: `Stop ${id}`,
      start_time: start,
      end_time: start,
      duration_minutes: minutes,
      cost: 0,
      travel_time_to_next: 0,
      distance_to_next: 0,
      recommendation_score: 0,
      recommendation_reasons: [],
      order_index: 0,
    }) as unknown as ItineraryItem;

  it('waits until a busy time ends', () => {
    expect(afterBusy(12 * 60, 60, [[13 * 60, 15 * 60]])).toBe(12 * 60);
    expect(afterBusy(12 * 60 + 30, 60, [[13 * 60, 15 * 60]])).toBe(15 * 60);
    const out = retime([stop(1, '10:00', 120), stop(2, '12:00', 120)], 10 * 60, 0, [[12 * 60 + 30, 14 * 60]]);
    expect(out.map((i) => [i.start_time, i.end_time])).toEqual([
      ['10:00', '12:00'],
      ['14:00', '16:00'],
    ]);
  });

  it("takes the day's start from the arrival on day 1, and the busy times of that day", () => {
    const trip = {
      preference: { preferred_start_time: '09:00', arrive_time: '14:00' },
      constraints: { busy: [{ day: 2, start: '18:00', end: '21:00', label: null }] },
    } as unknown as Trip;
    expect(dayRulesOf(trip, 1)).toEqual({ start: '14:00', busy: [] });
    expect(dayRulesOf(trip, 2)).toEqual({ start: '09:00', busy: [[18 * 60, 21 * 60]] });
  });
});
