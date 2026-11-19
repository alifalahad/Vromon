import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import BudgetScreen from '../../app/trip/budget/[id]';
import { daySummaryText } from '../features/trips/plan/daySummary';
import i18n from '../i18n';
import { tripsApi } from '../services/api';
import type { BudgetBreakdown, Trip } from '../types';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '5' }),
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({
  haptic: jest.fn(),
  haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn(), medium: jest.fn() },
}));
const mockMe = { data: { id: 'me' } };
jest.mock('../features/account/useMe', () => ({ ME_QUERY_KEY: ['me'], useMe: () => mockMe }));
jest.mock('../services/api', () => ({
  ApiError: class ApiError extends Error {},
  tripsApi: { get: jest.fn(), budget: jest.fn(), saveBudget: jest.fn(), aiBudget: jest.fn(), update: jest.fn(), notNowStaySuggestion: jest.fn(), dismissStaySuggestion: jest.fn() },
}));

const api = tripsApi as unknown as Record<string, jest.Mock>;
const clients: QueryClient[] = [];
function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
afterEach(() => clients.splice(0).forEach((c) => c.clear()));
beforeEach(() => {
  jest.clearAllMocks();
  mockMe.data = { id: 'me' };
});

const TRIP = { id: 5, user_id: 'me', num_days: 3, num_travelers: 2, destination: "Cox's Bazar" } as Trip;

// A better hotel in the same town for the whole stay (the stay advisor, trip upgrades step 4)
const ADVICE = {
  id: 6, first_night: 1, last_night: 2, nights: 2, day_number: 1,
  hotel: { id: 8, name: 'Coral Reef Guest House', destination_name: "Cox's Bazar", price_per_night: 800, currency: 'BDT', rating: 3.5, rating_known: false, latitude: 21.4, longitude: 92 },
  current: { id: 4, name: 'Sea Crown Hotel', price_per_night: 3500, rating: null },
  money_saved: 5400, minutes_saved: 0, extra_moves: 0, ratings: null,
  parts: { rooms: 1, nights: 2, price_now: 3500, price_then: 800, stay_now: 7000, stay_then: 1600, road_now: 30, road_then: 30,
    fares_now: 900, fares_then: 900, transfer_minutes: 0, transfer_cost: 0, hassle_minutes: 0, days: [1, 2], time_value: 5 },
};
const STAY_ACTION = { kind: 'stay_advice' as const, suggestion_id: 6 };

const BUDGET = {
  trip_id: 5,
  currency: 'BDT',
  num_travelers: 2,
  nights: 2,
  total_budget: 25000,
  total: 24060,
  low: 23000,
  high: 25600,
  left: 940,
  status: 'close',
  estimated_total: 24060,
  parts: [
    { key: 'getting_there', known: true, amount: 6400, low: 5440, high: 8000, estimate: true,
      detail: { mode: 'bus', from: 'Dhaka', to: "Cox's Bazar", fare_per: 'person', count: 2 } },
    { key: 'stay', known: true, amount: 7000, low: 7000, high: 7000, estimate: false,
      detail: { hotel: 'Sea Crown Hotel', nights: 2, rooms: 1, per_night: 3500, rating: null } },
    { key: 'food', known: true, amount: 5960, low: 5960, high: 5960, estimate: false, detail: { days: 3, travellers: 2, placeholder_meals: 0 } },
    { key: 'tickets', known: true, amount: 3300, low: 3300, high: 3300, estimate: false, detail: { paid: 4, free: 2, unknown: 0 } },
    { key: 'local', known: true, amount: 1400, low: 1120, high: 1820, estimate: true, detail: { legs: 9, modes: ['cng', 'rickshaw'] } },
  ],
  by_day: [
    { day_number: 1, date: '2026-10-19', amount: 4060, food: 2000, tickets: 1600, local: 460, estimate: true },
    { day_number: 2, date: '2026-10-20', amount: 3500, food: 2000, tickets: 1000, local: 500, estimate: true },
  ],
  saves: [
    { key: 'stay', saving: 5400, estimate: true, action: STAY_ACTION, detail: ADVICE },
    { key: 'skip', saving: 1000, estimate: false, action: { kind: 'skip', item_id: 44 }, detail: { title: 'Sunset Boat Ride', day_number: 2, item_id: 44 } },
    { key: 'rickshaw', saving: 300, estimate: true, action: { kind: 'modes', modes: { '12': 'rickshaw' } }, detail: { legs: 3, extra_min: 12 } },
  ],
} as unknown as BudgetBreakdown;

function setUp(budget = BUDGET) {
  api.get.mockResolvedValue(TRIP);
  api.budget.mockResolvedValue(budget);
}
const withPart = (key: string, over: object) => ({ ...BUDGET, parts: BUDGET.parts.map((p) => (p.key === key ? { ...p, ...over } : p)) }) as BudgetBreakdown;

describe('Trip budget screen (docs/ui-refresh step 18, frame 37)', () => {
  it('first what the plan costs and whether it fits: ≈, the budget with Change, the status, each, the guesses', async () => {
    setUp();
    await renderWithQuery(<BudgetScreen />);
    const hero = await screen.findByTestId('budget-total');
    expect(hero).toHaveTextContent(/^THE PLAN COSTS ABOUT≈ ৳24,060of your ৳25,000 budgetChange/);
    // (the status's icon is a glyph before its words)
    expect(screen.getByTestId('budget-status')).toHaveTextContent(/Only ৳940 left · likely ৳23,000 to ৳25,600$/);
    expect(hero).toHaveTextContent(/Each≈ ৳12,030Of it, estimated≈ ৳7,800$/);
    expect(screen.getByLabelText('96 percent of your budget')).toBeTruthy();
    expect(screen.getByText("Cox's Bazar · 2 travellers · 2 days · 2 nights")).toBeTruthy();
  });

  it.each([
    ['ok', { status: 'ok', total: 18000, left: 7000, low: 17000, high: 19000 }, '৳7,000 left · likely ৳17,000 to ৳19,000'],
    ['close: only a little left', { status: 'close', total: 23500, left: 1500, low: 23000, high: 24000 }, 'Only ৳1,500 left · likely ৳23,000 to ৳24,000'],
    ['close: the guesses could go over', { status: 'close', total: 20000, left: 5000, low: 18000, high: 26000 }, '৳5,000 left · could reach ৳26,000'],
    ['over', { status: 'over', total: 27000, left: -2000, low: 26000, high: 28500 }, 'Over by ৳2,000 · likely ৳26,000 to ৳28,500'],
  ])('the status when %s', async (_name, over, line) => {
    setUp({ ...BUDGET, ...over } as BudgetBreakdown);
    await renderWithQuery(<BudgetScreen />);
    expect(await screen.findByTestId('budget-status')).toHaveTextContent(new RegExp(`${line}$`));
  });

  it('nothing guessed: no ≈ and no "Of it, estimated"', async () => {
    setUp({ ...BUDGET, low: 24060, high: 24060, parts: BUDGET.parts.map((p) => ({ ...p, estimate: false })) } as BudgetBreakdown);
    await renderWithQuery(<BudgetScreen />);
    const hero = await screen.findByTestId('budget-total');
    expect(hero).toHaveTextContent(/^THE PLAN COSTS৳24,060of your/);
    expect(hero).not.toHaveTextContent(/Of it, estimated/);
    expect(screen.getByTestId('budget-status')).toHaveTextContent(/Only ৳940 left$/);
  });

  it('where it goes: one bar in pieces in their order, the share inside when it fits, and the parts as its key', async () => {
    setUp();
    await renderWithQuery(<BudgetScreen />);
    const bar = await screen.findByTestId('budget-bar');
    expect(bar.props.accessibilityLabel).toBe('Getting there 27 percent, stay 29 percent, food 25 percent, tickets 14 percent, local travel 6 percent');
    for (const [key, share] of [['getting_there', '27%'], ['stay', '29%'], ['food', '25%'], ['tickets', '14%']]) {
      expect(screen.getByTestId(`budget-piece-${key}`)).toHaveTextContent(share);
    }
    // Too narrow for its 6%: nothing written
    expect(screen.getByTestId('budget-piece-local')).toHaveTextContent('');
    expect(screen.getByTestId('budget-part-getting_there')).toHaveTextContent("Getting thereBus, Dhaka ⇄ Cox's Bazar, 2 seats≈ ৳6,400");
    expect(screen.getByTestId('budget-part-stay')).toHaveTextContent('StaySea Crown Hotel · 2 nights × ৳3,500৳7,000');
    expect(screen.getByTestId('budget-part-food')).toHaveTextContent('FoodMeals for 3 days, both of you৳5,960');
    expect(screen.getByTestId('budget-part-tickets')).toHaveTextContent('Tickets2 places are free৳3,300');
    expect(screen.getByTestId('budget-part-local')).toHaveTextContent('Local travelCNG and rickshaw, 9 rides≈ ৳1,400');
  });

  it('a part that is not known says why, has no colour and no piece; guessed meals are counted', async () => {
    const parts = BUDGET.parts.map((p) =>
      p.key === 'getting_there'
        ? { ...p, known: false, amount: null, low: null, high: null, estimate: false, detail: { reason: 'no_origin' } }
        : p.key === 'stay'
          ? { ...p, known: false, amount: null, low: null, high: null, detail: { reason: 'no_price', hotel: 'Hotel Golden City', nights: 2 } }
          : p.key === 'tickets'
            ? { ...p, known: false, amount: null, low: null, high: null, detail: { reason: 'no_price', places: 11, paid: 0, free: 0, unknown: 11 } }
            : p.key === 'food'
              ? { ...p, estimate: true, low: 4770, high: 7750, detail: { ...p.detail, placeholder_meals: 4 } }
              : p,
    );
    setUp({ ...BUDGET, parts } as BudgetBreakdown);
    await renderWithQuery(<BudgetScreen />);
    expect(await screen.findByTestId('budget-part-getting_there')).toHaveTextContent('Getting thereAdd where you start from to see thisNot known');
    expect(screen.getByTestId('budget-part-stay')).toHaveTextContent('StayHotel Golden City · price not knownNot known');
    expect(screen.getByTestId('budget-part-tickets')).toHaveTextContent("TicketsEntry prices aren't known for 11 placesNot known");
    expect(screen.getByTestId('budget-part-food')).toHaveTextContent('FoodMeals for 3 days, both of you · 4 prices are guesses≈ ৳5,960');
    for (const key of ['getting_there', 'stay', 'tickets']) expect(screen.queryByTestId(`budget-piece-${key}`)).toBeNull();
    expect(screen.getByTestId('budget-piece-food')).toBeTruthy();
  });

  it('a few tickets unknown, and meals where you stay', async () => {
    setUp({
      ...withPart('tickets', { detail: { paid: 1, free: 5, unknown: 1 } }),
      parts: withPart('tickets', { detail: { paid: 1, free: 5, unknown: 1 } }).parts.map((p) =>
        p.key === 'food' ? { ...p, detail: { ...p.detail, by_source: { restaurant: 5, stay: 3 } } } : p,
      ),
    } as BudgetBreakdown);
    await renderWithQuery(<BudgetScreen />);
    expect(await screen.findByTestId('budget-part-tickets')).toHaveTextContent('Tickets5 places are free · 1 price not known৳3,300');
    expect(screen.getByTestId('budget-part-food')).toHaveTextContent('Food5 at restaurants · 3 where you stay৳5,960');
  });

  it('by day: a bar a day with its amount, and what is counted there', async () => {
    setUp();
    await renderWithQuery(<BudgetScreen />);
    expect(await screen.findByTestId('budget-day-1')).toHaveTextContent('Mon 19≈ ৳4,060');
    expect(screen.getByLabelText('Tue 20: ≈ ৳3,500')).toBeTruthy();
    expect(screen.getByText('Food, tickets and local travel. Getting there and the stay are counted once above.')).toBeTruthy();
  });

  it('ways to save: one kind of card each, applied and undone', async () => {
    setUp();
    const after = { ...BUDGET, total: 18660, left: 6340, status: 'ok', saves: BUDGET.saves.slice(1) };
    const undo = { kind: 'stays', stays: [] };
    api.saveBudget
      .mockResolvedValueOnce({ message: 'ok', undo, budget: after, days: [], validation: {} })
      .mockResolvedValueOnce({ message: 'ok', undo: null, budget: BUDGET, days: [], validation: {} });
    await renderWithQuery(<BudgetScreen />);
    expect(await screen.findByTestId('budget-save-stay')).toHaveTextContent('Coral Reef Guest House instead of Sea Crown Hotel৳800 a nightSave about ৳5,400Apply');
    expect(screen.getByTestId('budget-save-skip')).toHaveTextContent('Skip Sunset Boat RideDay 2Save ৳1,000Apply');
    expect(screen.getByTestId('budget-save-rickshaw')).toHaveTextContent('Rickshaw instead of CNG for 3 short ridesAbout 12 min slower in allSave about ৳300Apply');

    await fireEvent.press(screen.getByTestId('budget-apply-stay'));
    await waitFor(() => expect(api.saveBudget).toHaveBeenCalledWith(5, STAY_ACTION));
    expect(await screen.findByTestId('budget-snackbar')).toHaveTextContent(/^Staying at Coral Reef Guest HouseUndo$/);
    await waitFor(() => expect(screen.getByTestId('budget-status')).toHaveTextContent(/৳6,340 left/));
    expect(screen.queryByTestId('budget-save-stay')).toBeNull();

    await fireEvent.press(screen.getByTestId('budget-snackbar-action'));
    await waitFor(() => expect(api.saveBudget).toHaveBeenLastCalledWith(5, undo));
    expect(await screen.findByTestId('budget-snackbar')).toHaveTextContent(/^Changed back\.$/);
    expect(await screen.findByTestId('budget-save-stay')).toBeTruthy();
  });

  it('a cheaper stay shows the two ratings only when both are known', async () => {
    setUp({ ...BUDGET, saves: [{ ...BUDGET.saves[0], detail: { ...ADVICE, ratings: { to: 4.4, from: 3.9 } } }] } as BudgetBreakdown);
    await renderWithQuery(<BudgetScreen />);
    expect(await screen.findByTestId('budget-save-stay')).toHaveTextContent(/৳800 a night · rated 4\.4 \(now 3\.9\)/);
  });

  it('another town for some nights: what it costs in time and moves', async () => {
    const town = {
      ...ADVICE, id: 7, first_night: 2, last_night: 2, nights: 1, money_saved: 2400, minutes_saved: 104, extra_moves: 1,
      hotel: { ...ADVICE.hotel, id: 9, name: 'Hotel Pashur', destination_name: 'Bagerhat', price_per_night: 2800 },
    };
    setUp({ ...BUDGET, saves: [{ key: 'stay', saving: 2400, estimate: true, action: { kind: 'stay_advice', suggestion_id: 7 }, detail: town }] } as unknown as BudgetBreakdown);
    await renderWithQuery(<BudgetScreen />);
    expect(await screen.findByTestId('budget-save-stay')).toHaveTextContent(
      'Sleep in Bagerhat for night 2৳2,800 a night · 1 h 44 min less on the road · one more check-out and check-inSave about ৳2,400Apply',
    );
  });

  it('"Change": the budget in the sheet from New trip, saved through the trip', async () => {
    setUp();
    api.update.mockResolvedValue({ ...TRIP, total_budget: 20000 });
    await renderWithQuery(<BudgetScreen />);
    await fireEvent.press(await screen.findByTestId('budget-change'));
    expect(screen.getByTestId('budget-change-save')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('budget-change-amount'), '20000');
    await fireEvent.press(screen.getByTestId('budget-change-save'));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(5, { total_budget: 20000 }));
    expect(await screen.findByTestId('budget-snackbar')).toHaveTextContent('Your budget is now ৳20,000');
    expect(api.budget.mock.calls.length).toBeGreaterThan(1);
    // Budget, Comfort and Luxury for these travellers and days
    await fireEvent.press(screen.getByTestId('budget-change'));
    await fireEvent.press(screen.getByTestId('tier-Budget'));
    await fireEvent.press(screen.getByTestId('budget-change-save'));
    await waitFor(() => expect(api.update).toHaveBeenLastCalledWith(5, { total_budget: 9000 }));
  });

  it("a friend's trip is read-only: no Change, no Apply", async () => {
    setUp();
    mockMe.data = { id: 'someone-else' };
    await renderWithQuery(<BudgetScreen />);
    expect(await screen.findByTestId('budget-save-stay')).toBeTruthy();
    expect(screen.queryByTestId('budget-apply-stay')).toBeNull();
    expect(screen.queryByTestId('budget-change')).toBeNull();
  });

  it('uses Bangla words and digits', async () => {
    setUp();
    await i18n.changeLanguage('bn');
    try {
      await renderWithQuery(<BudgetScreen />);
      expect(await screen.findByTestId('budget-status')).toHaveTextContent(/মাত্র ৳৯৪০ বাকি/);
      expect(screen.getByTestId('budget-part-stay')).toHaveTextContent(/Sea Crown Hotel · ২ রাত × ৳৩,৫০০/);
      expect(screen.getByTestId('budget-piece-stay')).toHaveTextContent('২৯%');
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});

describe('The AI estimate', () => {
  const AI = {
    total: 21500, low: 18000, high: 26000, per_person: 10750, confidence: 'medium', start_known: true,
    model: 'gemini-test', made_on: '2026-11-06', facts_used: { room_rates: 18, market_prices: 30, sights: 3, ways_there: 4 },
    categories: [
      { key: 'stay', amount: 7000, low: 6000, high: 9000, basis: 'Median room rate, 2 nights' },
      { key: 'other', amount: 700, low: 400, high: 1200, basis: 'Snacks and tips' },
    ],
    assumptions: ['A meal costs about ৳300'],
  };

  it('is asked for on a tap, explained, and can become the budget', async () => {
    setUp();
    api.aiBudget.mockResolvedValue(AI);
    api.update.mockResolvedValue({ ...TRIP, total_budget: 21500 });
    await renderWithQuery(<BudgetScreen />);
    fireEvent.press(await screen.findByTestId('ai-budget-run'));
    expect(api.aiBudget).toHaveBeenCalledWith(5, 'en');
    expect(await screen.findByTestId('ai-budget-total')).toHaveTextContent('≈ ৳21,500');
    expect(screen.getByTestId('ai-budget-stay')).toHaveTextContent(/StayMedian room rate, 2 nights৳7,000৳6,000–৳9,000/);
    expect(screen.getByTestId('ai-budget-other')).toHaveTextContent(/Other \(snacks, tips\)/);
    expect(screen.getByText('A meal costs about ৳300')).toBeTruthy();
    fireEvent.press(screen.getByTestId('ai-budget-use'));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(5, { total_budget: 21500 }));
    expect(await screen.findByText('Your budget is now ৳21,500')).toBeTruthy();
  });

  it("says when it isn't set up, and a friend can't take it as the budget", async () => {
    mockMe.data = { id: 'someone-else' };
    setUp();
    api.aiBudget.mockResolvedValue(AI);
    await renderWithQuery(<BudgetScreen />);
    fireEvent.press(await screen.findByTestId('ai-budget-run'));
    await screen.findByTestId('ai-budget-total');
    expect(screen.queryByTestId('ai-budget-use')).toBeNull();
  });
});

describe('The day in a line', () => {
  const t = i18n.t.bind(i18n);

  it('reads the parts of the day in order', () => {
    expect(
      daySummaryText([{ part: 'morning', what: 'beach' }, { part: 'afternoon', what: 'scenic' }, { part: 'sunset', place: 'Inani Beach' }], t),
    ).toBe('Beach morning, views afternoon, sunset at Inani Beach');
  });

  it("doesn't say sunset twice", () => {
    expect(daySummaryText([{ part: 'morning', what: 'beach' }, { part: 'sunset', place: 'Sunset Boat Ride' }], t)).toBe(
      'Beach morning, Sunset Boat Ride',
    );
  });

  it('says a free day, and nothing for an older server', () => {
    expect(daySummaryText([], t)).toBe('A free day');
    expect(daySummaryText(undefined, t)).toBeNull();
  });

  it('in Bangla', async () => {
    await i18n.changeLanguage('bn');
    try {
      expect(daySummaryText([{ part: 'morning', what: 'beach' }, { part: 'sunset', place: 'Inani Beach' }], i18n.t.bind(i18n))).toBe(
        'সকালে সৈকত, Inani Beach-এ সূর্যাস্ত',
      );
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});
