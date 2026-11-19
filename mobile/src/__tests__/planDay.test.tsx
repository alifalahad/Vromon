/**
 * The plan, redesigned (docs/ui-refresh step 14, frames 28–30): the trip's phase chip, the budget row,
 * the day tabs' sky, the day in a line, each row of the day's timeline, the stop sheet with and
 * without a forecast, a price and hours, "Not quite right?", "About this trip", and a friend's view.
 */

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { planPhase } from '../features/trips/dates';
import { AboutTrip, staysText } from '../features/trips/plan/AboutTrip';
import { ChangePlan } from '../features/trips/plan/ChangePlan';
import { FreeRow, LegRow, StopCard } from '../features/trips/plan/PlanRows';
import { BudgetRow, DayLine, DayTabs, PhaseChip } from '../features/trips/plan/PlanTop';
import { StopSheet } from '../features/trips/plan/StopSheet';
import { backAt, dayCounts, leaveAt, planRows } from '../features/trips/plan/timeline';
import { TonightRow, tonightLine } from '../features/trips/stays/TonightRow';
import i18n from '../i18n';
import type { BudgetBreakdown, ConditionsDay, ItineraryDay, ItineraryItem, Stay, Stays, Trip } from '../types';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({
  haptic: jest.fn(),
  haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn(), medium: jest.fn() },
}));
jest.mock('../features/photos/PhotoStrip', () => ({ PhotoStrip: () => null }));
jest.mock('../features/photos/queries', () => ({ usePhotos: () => ({ data: [] }) }));
jest.mock('../components/FeedbackForm', () => ({ FeedbackForm: () => null }));
jest.mock('../services/api', () => ({ placesApi: { list: jest.fn(() => Promise.resolve([{ id: 31, name: 'Kolatoli Beach' }])) } }));

const t = i18n.t.bind(i18n) as (key: string, options?: Record<string, unknown>) => string;

beforeEach(async () => {
  mockPush.mockClear();
  await act(() => i18n.changeLanguage('en'));
});
afterAll(async () => {
  await act(() => i18n.changeLanguage('en'));
});

function item(extra: Partial<ItineraryItem>): ItineraryItem {
  return {
    id: 1,
    item_type: 'activity',
    title: 'Laboni Beach',
    start_time: '09:00',
    end_time: '10:30',
    duration_minutes: 90,
    cost: 0,
    travel_time_to_next: 0,
    distance_to_next: 0,
    recommendation_score: 0.7,
    recommendation_reasons: [],
    order_index: 0,
    category: 'Beach',
    currency: 'BDT',
    cost_source: 'data',
    ...extra,
  };
}

const HIMCHARI = item({
  id: 7,
  title: 'Himchari National Park',
  start_time: '11:05',
  end_time: '12:35',
  cost: 100,
  category: 'Nature',
  recommendation_reasons: ['Matches your interest in nature', 'Fits your pace: medium activity'],
  place: {
    id: 9,
    name: 'Himchari National Park',
    destination_name: "Cox's Bazar",
    category: 'Nature',
    latitude: 21.36,
    longitude: 92.03,
    opening_time: '09:00',
    closing_time: '17:00',
    crowd_level: 'High',
    source: 'wikidata',
    checked: true,
  },
});

describe("the trip's phase (one rule, the server's too)", () => {
  it('in N days, tomorrow, day X of Y, finished', async () => {
    expect(planPhase('2026-11-20', '2026-11-22', '2026-11-14')).toEqual({ kind: 'before', days: 6 });
    expect(planPhase('2026-11-20', '2026-11-22', '2026-11-19')).toEqual({ kind: 'before', days: 1 });
    expect(planPhase('2026-11-20', '2026-11-22', '2026-11-21')).toEqual({ kind: 'on', day: 2, of: 3 });
    expect(planPhase('2026-11-20', '2026-11-22', '2026-11-23')).toEqual({ kind: 'after' });

    const cases: [string, string][] = [
      ['2026-11-14', 'In 6 days'],
      ['2026-11-19', 'Tomorrow'],
      ['2026-11-20', 'Day 1 of 3'],
      ['2026-11-22', 'Day 3 of 3'],
      ['2026-11-23', 'Finished'],
    ];
    for (const [today, words] of cases) {
      const view = await render(<PhaseChip start="2026-11-20" end="2026-11-22" today={today} />);
      // (after it, a tick before the words: step 16)
      expect(screen.getByTestId('trip-phase')).toHaveTextContent(new RegExp(`^.?${words}$`, 'u'));
      await view.unmount();
    }
    // A trip that didn't happen (step 16, D19)
    await render(<PhaseChip start="2026-11-20" end="2026-11-22" today="2026-11-23" notTaken />);
    expect(screen.getByTestId('trip-phase')).toHaveTextContent(/^.?Not taken$/u);
  });

  it('in Bangla, with Bangla digits', async () => {
    await act(() => i18n.changeLanguage('bn'));
    await render(<PhaseChip start="2026-11-20" end="2026-11-22" today="2026-11-21" />);
    expect(screen.getByTestId('trip-phase')).toHaveTextContent('দিন ২/৩');
  });
});

const BUDGET = (extra: Partial<BudgetBreakdown> = {}) =>
  ({
    total_budget: 25000,
    estimated_total: 20540,
    total: 20540,
    low: 19800,
    high: 21900,
    left: 4460,
    status: 'ok',
    parts: [],
    by_day: [],
    ...extra,
  }) as unknown as BudgetBreakdown;

describe('the budget row (frame 28)', () => {
  it("the plan against the budget, what's left, and it opens Budget", async () => {
    const onPress = jest.fn();
    await render(<BudgetRow data={BUDGET()} onPress={onPress} />);
    const row = screen.getByTestId('trip-budget');
    expect(row).toHaveTextContent(/≈ ৳20,540 of ৳25,000৳4,460 left/);
    expect(row.props.accessibilityLabel).toBe('Budget: ≈ ৳20,540 of ৳25,000, ৳4,460 left. Opens the budget.');
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalled();
  });

  it('close to it and over it say so in words, not only in colour', async () => {
    const view = await render(<BudgetRow data={BUDGET({ total: 23800, left: 1200, status: 'close' })} onPress={jest.fn()} />);
    expect(screen.getByTestId('trip-budget-left')).toHaveTextContent('Only ৳1,200 left');
    await view.unmount();
    await render(<BudgetRow data={BUDGET({ total: 27000, left: -2000, status: 'over' })} onPress={jest.fn()} />);
    expect(screen.getByTestId('trip-budget-left')).toHaveTextContent('৳2,000 over');
  });

  it('exact numbers have no "≈"', async () => {
    await render(<BudgetRow data={BUDGET({ low: 20540, high: 20540 })} onPress={jest.fn()} />);
    expect(screen.getByTestId('trip-budget')).toHaveTextContent(/^\S*৳20,540 of ৳25,000/);
  });
});

const day = (n: number, date: string, extra: Partial<ItineraryDay> = {}): ItineraryDay =>
  ({ id: 100 + n, trip_id: 5, day_number: n, day_date: date, theme: '', total_cost: 0, total_travel_time: 0, items: [], ...extra }) as ItineraryDay;

describe('the day tabs and the day in a line', () => {
  it("a tab has the day's sky when the forecast reaches it", async () => {
    const sunny = { day_id: 101, in_forecast: true, sunrise: '06:15', sunset: '17:08', code: 0, hours: [] } as unknown as ConditionsDay;
    const later = { day_id: 102, in_forecast: false, sunrise: '06:15', sunset: '17:08', code: 61, hours: [] } as unknown as ConditionsDay;
    await render(<DayTabs days={[day(1, '2026-11-20'), day(2, '2026-11-21')]} index={0} conditions={[sunny, later]} onPick={jest.fn()} />);
    expect(screen.getByTestId('day-tab-1').props.accessibilityLabel).toBe('Day 1, Fri 20, Clear');
    expect(screen.getByTestId('day-tab-1').props.accessibilityState).toMatchObject({ selected: true });
    // Beyond the forecast: no sky, never a guess
    expect(screen.getByTestId('day-tab-2').props.accessibilityLabel).toBe('Day 2, Sat 21');
  });

  it("the day's places and meals, Budget's money for it and the time on the road", async () => {
    const view = await render(
      <DayLine title="Beach morning, temples afternoon" places={4} meals={2} money={{ amount: 2780, estimate: true }} travellers={2} roadMinutes={120} />,
    );
    expect(screen.getByTestId('day-summary')).toHaveTextContent('Beach morning, temples afternoon');
    expect(screen.getByTestId('day-stats')).toHaveTextContent('4 places, 2 meals · ≈ ৳2,780 for 2 · 2 h on the road');
    await view.unmount();
    // One traveller; the budget not loaded yet (no money until it is)
    const one = await render(<DayLine title={null} places={1} meals={0} money={{ amount: 450, estimate: false }} travellers={1} roadMinutes={0} />);
    expect(screen.getByTestId('day-stats')).toHaveTextContent('1 place · ৳450 for you');
    await one.unmount();
    await render(<DayLine title={null} places={3} meals={1} money={null} travellers={2} roadMinutes={45} />);
    expect(screen.getByTestId('day-stats')).toHaveTextContent('3 places, 1 meal · 45 min on the road');
  });

  it('in Bangla', async () => {
    await act(() => i18n.changeLanguage('bn'));
    await render(<DayLine title={null} places={4} meals={2} money={{ amount: 2780, estimate: true }} travellers={2} roadMinutes={120} />);
    expect(screen.getByTestId('day-stats')).toHaveTextContent('৪টি জায়গা, ২ বেলা খাবার · ২ জনের ≈ ৳২,৭৮০ · পথে ২ ঘ');
  });

  it('counts places and meals from the rows, and the times you leave and are back, on the 5 minutes', () => {
    const d = day(1, '2026-11-20', {
      items: [
        item({ id: 1, start_time: '09:00', end_time: '10:30', order_index: 0 }),
        item({ id: 2, item_type: 'meal', title: 'Lunch at Mermaid Café', start_time: '13:10', end_time: '14:10', order_index: 1 }),
        item({ id: 3, start_time: '19:00', end_time: '19:58', order_index: 2 }),
      ],
      start_leg: { to_item_id: 1, minutes: 8, km: 0.6, mode: 'walk', cost: 0 },
      return_leg: { from_item_id: 3, minutes: 6, km: 0.4, mode: 'walk', cost: 0 },
    });
    expect(dayCounts(planRows(d))).toEqual({ places: 2, meals: 1 });
    expect(leaveAt(d)).toBe(8 * 60 + 50); // 08:52 → the mark before
    expect(backAt(d)).toBe(20 * 60 + 5); // 20:04 → the mark after
  });
});

describe("the day's rows (frame 29)", () => {
  const card = (extra: Partial<React.ComponentProps<typeof StopCard>> = {}) => (
    <StopCard item={HIMCHARI} n={3} kind="visit" issues={[]} selected={false} removable={false} onPress={jest.fn()} onRemove={jest.fn()} {...extra} />
  );

  it('a stop: its time, how long, the weather when it starts, the badge, the name and an honest price', async () => {
    await render(card({ weather: { temp: 29.4, rain: 10, code: 2 } }));
    expect(screen.getByTestId('stop-7')).toHaveTextContent(/Himchari National Park.*Nature · ৳100 each/);
    // (the time column is read with the card: its time, length and weather are in the card's label and hint)
    expect(screen.getByTestId('stop-weather-7', { includeHiddenElements: true })).toHaveTextContent(/29°/);
    expect(screen.getByTestId('stop-7').props.accessibilityHint).toMatch(/^1 h 30 min\. 29°, Partly cloudy\. Nature · ৳100 each/);
    // Not draggable here: no grip
    expect(screen.queryByTestId('stop-grip-7', { includeHiddenElements: true })).toBeNull();
  });

  it('beyond the forecast, no weather; an unknown price says so', async () => {
    await render(card({ item: { ...HIMCHARI, place: { ...HIMCHARI.place!, cost_known: false } } }));
    expect(screen.queryByTestId('stop-weather-7', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId('stop-7')).toHaveTextContent(/Nature · Price not known/);
  });

  it('a must-do says so, and "keeps its time" only when it does', async () => {
    const view = await render(card({ mustDo: 'Your must-do at sunset' }));
    expect(screen.getByTestId('stop-keeps-7')).toHaveTextContent(/Your must-do at sunset$/);
    await view.unmount();
    await render(card({ mustDo: 'Your must-do at sunset', item: { ...HIMCHARI, pinned: true } }));
    expect(screen.getByTestId('stop-keeps-7')).toHaveTextContent(/Your must-do at sunset · keeps its time$/);
  });

  it('"For you", "Not checked yet" and a problem in words', async () => {
    await render(
      card({
        item: { ...HIMCHARI, recommendation_reasons: ['Matches your interest in nature'] },
        issues: [{ severity: 'soft', code: 'CLOSES_SOON', message: 'Closes at 17:00, soon after you get there' }],
      }),
    );
    expect(screen.getByText('For you: nature')).toBeTruthy();
    expect(screen.getByText('Closes at 17:00, soon after you get there')).toBeTruthy();
  });

  it('a ride: how, how long, how far and the fare; it opens the way sheet', async () => {
    const onPress = jest.fn();
    const view = await render(<LegRow minutes={35} km={16} mode="cng" fare={480} onPress={onPress} />);
    expect(screen.getByTestId('leg-row')).toHaveTextContent(/CNG · 35 min · 16 km.*≈ ৳480/);
    await fireEvent.press(screen.getByTestId('leg-row'));
    expect(onPress).toHaveBeenCalled();
    await view.unmount();
    // A walk is free; without road data it's the straight-line estimate, with no fare
    const walk = await render(<LegRow minutes={15} km={1} mode="walk" fare={0} />);
    expect(screen.getByText('Walk · 15 min · 1 km')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
    await walk.unmount();
    await render(<LegRow minutes={12} km={2.4} />);
    expect(screen.getByText('About 12 min · 2.4 km')).toBeTruthy();
    expect(screen.queryByText(/≈/)).toBeNull();
  });

  it('free time: a dashed row with Add, which adds a stop there; a friend has no Add', async () => {
    const onAdd = jest.fn();
    const view = await render(<FreeRow start="16:15" minutes={45} onAdd={onAdd} />);
    expect(screen.getByTestId('free-add')).toHaveTextContent(/^Free time · 45 min.*Add$/);
    expect(screen.getByTestId('free-add').props.accessibilityLabel).toBe('Free time from 16:15, 45 min. Add a stop here');
    await fireEvent.press(screen.getByTestId('free-add'));
    expect(onAdd).toHaveBeenCalled();
    await view.unmount();
    await render(<FreeRow start="16:15" minutes={45} />);
    expect(screen.queryByTestId('free-add')).toBeNull();
    expect(screen.getByText('Free time · 45 min')).toBeTruthy();
  });

  it('tonight: where you sleep, its price a night and which nights, and Change', async () => {
    const BEACH_WAY = { kind: 'hotel' as const, name: 'Hotel Beach Way', latitude: 21.43, longitude: 92.0, hotel_id: 4, estimate: false };
    const stay = {
      first_night: 1,
      last_night: 2,
      nights: 2,
      kind: 'hotel',
      hotel: { id: 4, name: 'Hotel Beach Way', price_per_night: 4000, price_known: true },
      label: null,
      lat: null,
      lon: null,
    } as unknown as Stay;
    const onChange = jest.fn();
    await render(<TonightRow day={day(1, '2026-11-20', { end_base: BEACH_WAY, start_base: BEACH_WAY })} lastDay={false} stay={stay} onChange={onChange} />);
    expect(screen.getByTestId('stays-tonight')).toHaveTextContent(/Tonight: Hotel Beach Way৳4,000 a night · nights 1 and 2Change$/);
    await fireEvent.press(screen.getByTestId('stays-tonight'));
    expect(onChange).toHaveBeenCalled();
    const f = { n: String, money: (v: number) => `৳${v.toLocaleString('en-US')}` } as never;
    expect(tonightLine({ ...stay, first_night: 3, last_night: 3 }, t, f)).toBe('৳4,000 a night · night 3');
    expect(tonightLine({ ...stay, last_night: 4 }, t, f)).toBe('৳4,000 a night · nights 1–4');
    expect(tonightLine({ ...stay, kind: 'home', hotel: null }, t, f)).toBe('No cost · nights 1 and 2');
  });
});

function sheet(props: Partial<React.ComponentProps<typeof StopSheet>> = {}) {
  return render(
    <BottomSheetModalProvider>
      <StopSheet
        item={HIMCHARI}
        issues={[]}
        editable
        days={[
          { id: 101, day_number: 1, day_date: '2026-11-20' },
          { id: 102, day_number: 2, day_date: '2026-11-21' },
        ]}
        currentDayId={102}
        onClose={jest.fn()}
        onExplain={jest.fn()}
        onSwap={jest.fn()}
        onRemove={jest.fn()}
        n={3}
        travellers={2}
        {...props}
      />
    </BottomSheetModalProvider>,
  );
}

describe('the stop sheet (frame 30)', () => {
  it('with a forecast, a price and hours: all of it, and the actions', async () => {
    await sheet({ weather: { temp: 29, rain: 10, code: 2 } });
    expect(await screen.findByTestId('stop-sheet')).toBeTruthy();
    expect(screen.getByText('Nature · Day 2, Sat 21 Nov')).toBeTruthy();
    expect(screen.getByText('11:05 – 12:35')).toBeTruthy();
    expect(screen.getByTestId('stay-value')).toHaveTextContent('1 h 30 there');
    expect(screen.getByTestId('stop-sheet-weather').props.accessibilityLabel).toBe('29° and partly cloudy then, rain unlikely');
    expect(screen.getByTestId('stop-sheet-price').props.accessibilityLabel).toBe('৳100 each, ৳200 for 2');
    expect(screen.getByTestId('stop-sheet-hours').props.accessibilityLabel).toBe('Open 09:00–17:00');
    expect(screen.getByTestId('stop-sheet-crowd').props.accessibilityLabel).toBe('Usually busy');
    expect(screen.getByText('Matches your interest in nature')).toBeTruthy();
    for (const id of ['stay-less', 'stay-more', 'stop-pin', 'stop-directions', 'stop-swap', 'stop-move-day', 'stop-remove'])
      expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.getByTestId('stop-source')).toHaveTextContent('From Wikidata · checked');
  });

  it('without a forecast, a known price or checked hours: nothing shown as known', async () => {
    await sheet({
      item: { ...HIMCHARI, place: { ...HIMCHARI.place!, cost_known: false, hours_known: false, rating: 4.6, rating_known: false } },
      weather: null,
    });
    expect(await screen.findByTestId('stop-sheet')).toBeTruthy();
    expect(screen.queryByTestId('stop-sheet-weather')).toBeNull();
    expect(screen.getByTestId('stop-sheet-price').props.accessibilityLabel).toBe('Price not known');
    expect(screen.getByTestId('stop-sheet-hours').props.accessibilityLabel).toBe('Hours not checked');
    expect(screen.queryByText(/★/)).toBeNull();
  });

  it("where the place comes from, by a name a traveller knows; a source without one isn't shown", async () => {
    const view = await sheet({ item: { ...HIMCHARI, place: { ...HIMCHARI.place!, source: 'catalog' } } });
    expect(await screen.findByTestId('stop-source')).toHaveTextContent('From Vromon’s list · checked');
    await view.unmount();
    await sheet({ item: { ...HIMCHARI, place: { ...HIMCHARI.place!, source: 'some_feed' } } });
    expect(await screen.findByTestId('stop-sheet')).toBeTruthy();
    expect(screen.queryByTestId('stop-source')).toBeNull();
  });

  it('a meal: its description stands alone, not as a reason', async () => {
    const meal = item({
      id: 8,
      item_type: 'meal',
      title: 'Dinner at Grace Restaurant',
      start_time: '19:00',
      end_time: '20:00',
      duration_minutes: 60,
      restaurant: { id: 3, name: 'Grace Restaurant', destination_name: "Cox's Bazar", description: 'Kolatoli Rd, Cox’s Bazar' } as never,
    });
    await sheet({ item: meal });
    expect(await screen.findByText('Kolatoli Rd, Cox’s Bazar')).toBeTruthy();
    expect(screen.queryByText('Why it’s here')).toBeNull();
  });

  it('rain likely, said with its chance', async () => {
    await sheet({ weather: { temp: 26, rain: 70, code: 61 } });
    expect((await screen.findByTestId('stop-sheet-weather')).props.accessibilityLabel).toBe('26° and rain then, rain likely (70%)');
  });

  it("a friend's stop: the facts and Directions, nothing to change", async () => {
    await sheet({ editable: false });
    expect(await screen.findByTestId('stop-sheet')).toBeTruthy();
    expect(screen.getByTestId('stay-value')).toHaveTextContent('1 h 30 there');
    expect(screen.getByTestId('stop-directions')).toBeTruthy();
    for (const id of ['stay-less', 'stay-more', 'stop-pin', 'stop-swap', 'stop-move-day', 'stop-remove']) expect(screen.queryByTestId(id)).toBeNull();
  });
});

describe('"Not quite right?"', () => {
  it('the whole trip, or only this day: the same actions as before', async () => {
    const onChange = jest.fn();
    const onNewIdeas = jest.fn();
    await render(<ChangePlan dayNumber={2} busy={false} onChange={onChange} onNewIdeas={onNewIdeas} />);
    expect(screen.getByTestId('change-plan')).toHaveTextContent(
      /Not quite right\?The whole trip.*Changes every day\. Your must-dos stay\.Only this day.*New ideas for day 2/,
    );
    await fireEvent.press(screen.getByTestId('change-reduce_budget'));
    expect(onChange).toHaveBeenCalledWith('reduce_budget');
    await fireEvent.press(screen.getByTestId('new-ideas'));
    expect(onNewIdeas).toHaveBeenCalled();
  });
});

const TRIP: Trip = {
  id: 5,
  destination: "Cox's Bazar",
  start_date: '2026-12-20',
  end_date: '2026-12-22',
  num_travelers: 2,
  total_budget: 25000,
  currency: 'BDT',
  status: 'generated',
  num_days: 3,
  created_at: '2026-11-01T00:00:00',
  user_id: 'me',
  stops: [{ position: 0, city_name: "Cox's Bazar", country_name: 'Bangladesh', country_iso2: 'BD' } as never],
  preference: {
    id: 1,
    interests: ['Beach', 'Nature'],
    travel_style: 'Balanced',
    activity_level: 'Medium',
    accommodation_preference: 'Standard',
    preferred_start_time: '09:00',
    preferred_end_time: '20:00',
    meals: { Breakfast: 'stay', Lunch: 'restaurant', Dinner: 'restaurant', own_cost_per_person: null },
  },
  constraints: { must_sees: [{ place_id: 31, day: null, when: 'sunset', at: null }], busy: [], excluded_places: [] } as never,
};
const STAYS: Stays = {
  trip_id: 5,
  nights: 2,
  chosen: true,
  stays: [
    {
      first_night: 1,
      last_night: 2,
      nights: 2,
      kind: 'hotel',
      hotel: { id: 4, name: 'Hotel Beach Way', price_per_night: 4000, price_known: true } as never,
      label: null,
      lat: null,
      lon: null,
    },
  ],
};

function about(props: Partial<React.ComponentProps<typeof AboutTrip>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <AboutTrip
        trip={TRIP}
        ownerId="me"
        mine
        hasPlan
        stays={STAYS}
        onStays={jest.fn()}
        onMeals={jest.fn()}
        note="Travel times are straight-line estimates, not road routes."
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('"About this trip" (in place of Trip details)', () => {
  it("one list, each row with what's set now, opening where it's changed", async () => {
    const onStays = jest.fn();
    const onMeals = jest.fn();
    await about({ onStays, onMeals });
    expect(screen.getByText('About this trip')).toBeTruthy();
    expect(await screen.findByText('Kolatoli Beach at sunset')).toBeTruthy();
    expect(screen.getByTestId('about-stays')).toHaveTextContent(/Where you stayHotel Beach Way, both nights/);
    expect(screen.getByTestId('about-meals')).toHaveTextContent(/^Meals/);
    expect(screen.getByTestId('about-together')).toHaveTextContent(/Planning togetherInvite friends to the trip room/);
    expect(screen.getByTestId('edit-route')).toHaveTextContent(/RouteCox's Bazar/);
    expect(screen.getByTestId('about-photos')).toHaveTextContent(/PhotosNone yet/);
    expect(screen.getByTestId('about-prefs')).toHaveTextContent(/Your preferencesBeach, Nature · Balanced · 09:00–20:00/);
    expect(screen.getByText('Travel times are straight-line estimates, not road routes.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('edit-must-dos'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/trip/must-dos/[id]', params: { id: 5 } });
    await fireEvent.press(screen.getByTestId('about-stays'));
    expect(onStays).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('about-meals'));
    expect(onMeals).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('about-together'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/trip/invite/[id]', params: { id: '5' } });
    await fireEvent.press(screen.getByTestId('edit-route'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/trip/route/[id]', params: { id: 5 } });
    // Photos open in place
    await fireEvent.press(screen.getByTestId('about-photos'));
    expect(screen.getByTestId('about-photos').props.accessibilityState).toMatchObject({ expanded: true });
  });

  it("a friend's trip: the rows to read, without the owner's", async () => {
    await about({ mine: false, stays: null, onStays: undefined, onMeals: undefined, ownerId: 'friend' });
    expect(await screen.findByText('Kolatoli Beach at sunset')).toBeTruthy();
    expect(screen.getByTestId('trip-must-dos')).toBeTruthy();
    expect(screen.getByTestId('trip-route')).toBeTruthy();
    for (const id of ['edit-must-dos', 'edit-route', 'about-stays', 'about-together']) expect(screen.queryByTestId(id)).toBeNull();
    // Read, not pressed: no button role
    expect(screen.getByTestId('trip-must-dos').props.accessibilityRole).toBeUndefined();
  });

  it('where you stay, in words', () => {
    const n = String;
    expect(staysText(STAYS, t, n)).toBe('Hotel Beach Way, both nights');
    expect(staysText({ ...STAYS, nights: 1, stays: [{ ...STAYS.stays[0], last_night: 1, nights: 1 }] }, t, n)).toBe('Hotel Beach Way, 1 night');
    expect(staysText({ ...STAYS, nights: 4, stays: [{ ...STAYS.stays[0], last_night: 4, nights: 4 }] }, t, n)).toBe('Hotel Beach Way, all 4 nights');
    expect(
      staysText(
        {
          ...STAYS,
          nights: 3,
          stays: [STAYS.stays[0], { first_night: 3, last_night: 3, nights: 1, kind: 'home', hotel: null, label: "Uncle's house", lat: 1, lon: 1 }],
        },
        t,
        n,
      ),
    ).toBe("2 places: Hotel Beach Way, Uncle's house");
  });
});
