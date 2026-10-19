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
  tripsApi: { get: jest.fn(), budget: jest.fn(), saveBudget: jest.fn() },
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

const TRIP = { id: 5, user_id: 'me', num_days: 3, num_travelers: 2 } as Trip;

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
      detail: { hotel: 'Sea Crown Hotel', nights: 2, rooms: 1, per_night: 3500, rating: 4.2 } },
    { key: 'food', known: true, amount: 5960, low: 5960, high: 5960, estimate: false, detail: { days: 3, travellers: 2, placeholder_meals: 0 } },
    { key: 'tickets', known: true, amount: 3300, low: 3300, high: 3300, estimate: false, detail: { paid: 4, free: 2 } },
    { key: 'local', known: true, amount: 1400, low: 1120, high: 1820, estimate: true, detail: { legs: 9, modes: ['cng', 'rickshaw'] } },
  ],
  by_day: [
    { day_number: 1, date: '2026-10-19', amount: 4060, food: 2000, tickets: 1600, local: 460, estimate: true },
    { day_number: 2, date: '2026-10-20', amount: 3500, food: 2000, tickets: 1000, local: 500, estimate: true },
  ],
  saves: [
    { key: 'hotel', saving: 5400, estimate: false, action: { kind: 'hotel', hotel_id: 8 },
      detail: { from: 'Sea Crown Hotel', from_rating: 4.2, to: 'Coral Reef Guest House', to_rating: 3.7, per_night: 800 } },
    { key: 'skip', saving: 1000, estimate: false, action: { kind: 'skip', item_id: 44 }, detail: { title: 'Sunset Boat Ride', day_number: 2, item_id: 44 } },
    { key: 'rickshaw', saving: 300, estimate: true, action: { kind: 'modes', modes: { '12': 'rickshaw' } }, detail: { legs: 3, extra_min: 12 } },
  ],
} as unknown as BudgetBreakdown;

function setUp(budget = BUDGET) {
  api.get.mockResolvedValue(TRIP);
  api.budget.mockResolvedValue(budget);
}

describe('Trip budget screen', () => {
  it('shows the total, each part (estimates marked ≈) and the warning before it goes over', async () => {
    setUp();
    await renderWithQuery(<BudgetScreen />);
    expect(await screen.findByTestId('budget-total')).toHaveTextContent(/≈ ৳24,060of ৳25,000/);
    expect(screen.getByTestId('budget-status')).toHaveTextContent(/Only ৳940 left\. Prices with ≈ are estimates\.$/);
    expect(screen.getByTestId('budget-part-getting_there')).toHaveTextContent("Getting thereBus, Dhaka ⇄ Cox's Bazar, 2 seats≈ ৳6,400");
    expect(screen.getByTestId('budget-part-stay')).toHaveTextContent('StaySea Crown Hotel · 2 nights × ৳3,500৳7,000');
    expect(screen.getByTestId('budget-part-food')).toHaveTextContent(/Meals for 3 days, both of you৳5,960$/);
    expect(screen.getByTestId('budget-part-tickets')).toHaveTextContent(/Entry and activities · 2 stops are free৳3,300$/);
    expect(screen.getByTestId('budget-part-local')).toHaveTextContent('Local travelCNG and rickshaw, to and from your hotel≈ ৳1,400');
    expect(screen.getByText('Likely ৳23,000 to ৳25,600')).toBeTruthy();
  });

  it('says when the plan is over, and what is not known', async () => {
    setUp({
      ...BUDGET,
      total: 27000,
      left: -2000,
      status: 'over',
      parts: BUDGET.parts.map((p) => (p.key === 'getting_there' ? { ...p, known: false, amount: null, low: null, high: null, estimate: false, detail: { reason: 'no_origin' } } : p)),
    });
    await renderWithQuery(<BudgetScreen />);
    expect(await screen.findByTestId('budget-status')).toHaveTextContent(/৳2,000 over your budget/);
    expect(screen.getByTestId('budget-part-getting_there')).toHaveTextContent('Getting thereAdd where you start from to see thisNot known');
  });

  it('applies a way to save and undoes it', async () => {
    setUp();
    const after = { ...BUDGET, total: 18660, left: 6340, status: 'ok', saves: BUDGET.saves.slice(1) };
    api.saveBudget
      .mockResolvedValueOnce({ message: 'ok', undo: { kind: 'hotel', hotel_id: null }, budget: after, days: [], validation: {} })
      .mockResolvedValueOnce({ message: 'ok', undo: { kind: 'hotel', hotel_id: 8 }, budget: BUDGET, days: [], validation: {} });
    await renderWithQuery(<BudgetScreen />);
    expect(await screen.findByText('Coral Reef Guest House instead of Sea Crown Hotel')).toBeTruthy();
    expect(screen.getByText('Save ৳5,400')).toBeTruthy();
    expect(screen.getByText('Save about ৳300')).toBeTruthy();

    fireEvent.press(screen.getByTestId('budget-apply-hotel'));
    await waitFor(() => expect(api.saveBudget).toHaveBeenCalledWith(5, { kind: 'hotel', hotel_id: 8 }));
    expect(await screen.findByTestId('budget-snackbar')).toHaveTextContent(/^Staying at Coral Reef Guest House\.Undo$/);
    await waitFor(() => expect(screen.getByTestId('budget-status')).toHaveTextContent(/৳6,340 left/));
    expect(screen.queryByTestId('budget-save-hotel')).toBeNull();

    fireEvent.press(screen.getByTestId('budget-snackbar-action'));
    await waitFor(() => expect(api.saveBudget).toHaveBeenLastCalledWith(5, { kind: 'hotel', hotel_id: null }));
    expect(await screen.findByTestId('budget-snackbar')).toHaveTextContent(/^Changed back\.$/);
    expect(await screen.findByTestId('budget-save-hotel')).toBeTruthy();
  });

  it('says what is not known: a hotel without a price, stops without one', async () => {
    setUp({
      ...BUDGET,
      parts: BUDGET.parts.map((p) =>
        p.key === 'stay'
          ? { ...p, known: false, amount: null, low: null, high: null, detail: { reason: 'no_price', hotel: 'Hotel Golden City', nights: 2 } }
          : p.key === 'tickets'
            ? { ...p, detail: { paid: 1, free: 0, unknown: 3 } }
            : p,
      ),
    });
    await renderWithQuery(<BudgetScreen />);
    expect(await screen.findByTestId('budget-part-stay')).toHaveTextContent('StayHotel Golden City · price not knownNot known');
    expect(screen.getByTestId('budget-part-tickets')).toHaveTextContent(/Entry and activities · 3 prices unknown/);
  });

  it("a friend's trip shows the budget without Apply", async () => {
    setUp();
    mockMe.data = { id: 'someone-else' };
    await renderWithQuery(<BudgetScreen />);
    expect(await screen.findByTestId('budget-save-hotel')).toBeTruthy();
    expect(screen.queryByTestId('budget-apply-hotel')).toBeNull();
  });

  it('uses Bangla words and digits', async () => {
    setUp();
    await i18n.changeLanguage('bn');
    try {
      await renderWithQuery(<BudgetScreen />);
      expect(await screen.findByTestId('budget-status')).toHaveTextContent(/মাত্র ৳৯৪০ বাকি।/);
      expect(screen.getByTestId('budget-part-stay')).toHaveTextContent(/Sea Crown Hotel · ২ রাত × ৳৩,৫০০/);
    } finally {
      await i18n.changeLanguage('en');
    }
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
