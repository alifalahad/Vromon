/**
 * What you spent (docs/ui-refresh step 19, frames 38–40): the sheet (a suggestion, typed, changed, deleted), Budget on
 * the trip and after it with and without notes, a friend's trip, the full list, the plan's budget row and a finished
 * day's line, and the rules behind them.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Dimensions } from 'react-native';

import BudgetScreen from '../../app/trip/budget/[id]';
import NotedScreen from '../../app/trip/budget/noted/[id]';
import { AddSpentSheet } from '../features/trips/budget/AddSpentSheet';
import {
  againstPlan,
  dayRows,
  forGroup,
  noteDays,
  notesByDay,
  noteTime,
  partsAgainstPlan,
  planAndSpent,
  planDifference,
  shortRange,
  suggestionWords,
  typedAmount,
} from '../features/trips/budget/spent';
import { addDays, localToday } from '../features/trips/dates';
import { BudgetRow, DayLine } from '../features/trips/plan/PlanTop';
import i18n from '../i18n';
import { tripsApi } from '../services/api';
import type { BudgetBreakdown, Expense, ExpenseSuggestion, Trip } from '../types';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '5' }),
  useRouter: () => ({ push: mockPush }),
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
  tripsApi: {
    get: jest.fn(),
    budget: jest.fn(),
    saveBudget: jest.fn(),
    aiBudget: jest.fn(),
    update: jest.fn(),
    expenses: jest.fn(),
    expenseSuggestions: jest.fn(),
    addExpense: jest.fn(),
    changeExpense: jest.fn(),
    deleteExpense: jest.fn(),
  },
}));

const api = tripsApi as unknown as Record<string, jest.Mock>;
// A phone at its usual text size (Jest's window is 2×, the large-text layout); one test sets 1.6×
const PHONE = { width: 390, height: 844, scale: 3, fontScale: 1 };
beforeEach(() => Dimensions.set({ window: PHONE, screen: PHONE }));
const clients: QueryClient[] = [];
function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
afterEach(async () => {
  clients.splice(0).forEach((c) => c.clear());
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  jest.clearAllMocks();
  mockMe.data = { id: 'me' };
});

const TODAY = localToday();
const YESTERDAY = addDays(TODAY, -1);
const TOMORROW = addDays(TODAY, 1);
const weekdayDay = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return `${d.toLocaleDateString('en', { weekday: 'short' })} ${d.toLocaleDateString('en', { day: 'numeric' })}`;
};

// On the trip: day 2 of 3 is today (the frames' example, Cox's Bazar for two, ৳25,000)
const ON_TRIP = { id: 5, user_id: 'me', num_days: 3, num_travelers: 2, destination: "Cox's Bazar", start_date: YESTERDAY, end_date: TOMORROW } as Trip;
const AFTER_TRIP = { ...ON_TRIP, start_date: addDays(TODAY, -5), end_date: addDays(TODAY, -3) } as Trip;

const PLAN = {
  trip_id: 5,
  currency: 'BDT',
  num_travelers: 2,
  nights: 2,
  total_budget: 25000,
  total: 20540,
  low: 19000,
  high: 22500,
  left: 4460,
  status: 'ok',
  estimated_total: 20540,
  parts: [
    {
      key: 'getting_there',
      known: true,
      amount: 4820,
      low: 4100,
      high: 6000,
      estimate: true,
      detail: { mode: 'bus', from: 'Dhaka', to: "Cox's Bazar", fare_per: 'person', count: 2 },
    },
    {
      key: 'stay',
      known: true,
      amount: 8000,
      low: 8000,
      high: 8000,
      estimate: false,
      detail: { hotel: 'Hotel Beach Way', nights: 2, rooms: 1, per_night: 4000, rating: null },
    },
    { key: 'food', known: true, amount: 4000, low: 4000, high: 4000, estimate: false, detail: { days: 3, travellers: 2, placeholder_meals: 0 } },
    { key: 'tickets', known: true, amount: 200, low: 200, high: 200, estimate: false, detail: { paid: 1, free: 3, unknown: 0 } },
    { key: 'local', known: true, amount: 3520, low: 2800, high: 4600, estimate: true, detail: { legs: 9, modes: ['cng'] } },
  ],
  by_day: [
    { day_number: 1, date: YESTERDAY, amount: 2780, food: 1500, tickets: 0, local: 1280, estimate: true },
    { day_number: 2, date: TODAY, amount: 3640, food: 1800, tickets: 200, local: 1640, estimate: true },
    { day_number: 3, date: TOMORROW, amount: 1300, food: 700, tickets: 0, local: 600, estimate: true },
  ],
  saves: [{ key: 'rickshaw', saving: 300, estimate: true, action: { kind: 'modes', modes: { '12': 'rickshaw' } }, detail: { legs: 3, extra_min: 12 } }],
  spent: null,
  to_come: null,
  projected: null,
} as unknown as BudgetBreakdown;

// Frame 38: ৳10,160 spent by 11:30 on day 2
const ON_TRIP_SPENT = {
  ...PLAN,
  spent: {
    total: 10160,
    by_part: { getting_there: 2400, stay: 4000, food: 2360, tickets: 200, local: 1200, shopping: 0, other: 0 },
    by_day: [
      { date: YESTERDAY, amount: 2610 },
      { date: TODAY, amount: 1150 },
    ],
    today: 1150,
    count: 8,
  },
  to_come: 10210,
  projected: 20370,
} as BudgetBreakdown;

const note = (id: number, day: string, amount: number, part: Expense['part'], text: string, at?: string): Expense => ({
  id,
  day,
  amount,
  part,
  note: text,
  item_id: null,
  ride: null,
  created_at: at ? new Date(`${day}T${at}:00`).toISOString() : null,
});
const TODAYS_NOTES = [
  note(8, TODAY, 200, 'tickets', 'Himchari National Park, 2 tickets', '11:08'),
  note(7, TODAY, 300, 'local', 'CNG to Himchari', '10:38'),
  note(6, TODAY, 650, 'food', 'Breakfast · Handi', '08:55'),
  note(5, YESTERDAY, 2610, 'food', 'Yesterday'),
];

describe('Budget on the trip (frame 38)', () => {
  it('spent so far against your budget, what is left and what is still to come by the plan', async () => {
    api.get.mockResolvedValue(ON_TRIP);
    api.budget.mockResolvedValue(ON_TRIP_SPENT);
    api.expenses.mockResolvedValue([note(9, TODAY, 4000, 'stay', 'Hotel Beach Way', '09:30'), ...TODAYS_NOTES]);
    await renderWithQuery(<BudgetScreen />);
    expect(await screen.findByTestId('spent-total')).toHaveTextContent('৳10,160');
    expect(screen.getByTestId('spent-hero')).toHaveTextContent(/^SPENT SO FAR৳10,160of your ৳25,000 budget/);
    expect(screen.getByTestId('spent-status')).toHaveTextContent(/৳14,840 left$/);
    expect(screen.getByTestId('spent-to-come')).toHaveTextContent('By the plan, about ৳10,210 is still to come. That would end near ৳20,370.');
    expect(screen.getByLabelText('41 percent of your budget')).toBeTruthy();
    expect(screen.getByText(`Cox's Bazar · day 2 of 3 · 2 travellers`)).toBeTruthy();
    // Today: its notes against its plan, each opening the sheet, and "Add what you spent"
    const today = screen.getByTestId('spent-today');
    expect(today).toHaveTextContent(new RegExp(`^Today · ${weekdayDay(TODAY)}৳1,150 of ≈ ৳3,640`));
    expect(await screen.findByTestId('spent-note-6')).toHaveTextContent('08:55Breakfast · Handi৳650');
    // the stay is the trip's cost, not today's (not in today's ৳1,150): it says so
    expect(screen.getByTestId('spent-note-9')).toHaveTextContent('09:30Hotel Beach WayStay · for the whole trip৳4,000');
    expect(screen.queryByTestId('spent-note-5')).toBeNull();
    expect(screen.getByTestId('spent-add')).toBeTruthy();
    // Each part against its plan, ≈ for an estimate; by day, the plan as a mark and "Not yet" for tomorrow
    expect(screen.getByTestId('spent-part-getting_there')).toHaveTextContent(/Getting there৳2,400 of ≈ ৳4,820/);
    expect(screen.getByTestId('spent-part-tickets')).toHaveTextContent(/Tickets৳200 of ৳200/);
    expect(screen.getByTestId(`spent-day-${YESTERDAY}`)).toHaveTextContent(`${weekdayDay(YESTERDAY)}৳2,610plan ≈ ৳2,780`);
    expect(screen.getByTestId(`spent-day-${TODAY}`)).toHaveTextContent('Today৳1,150plan ≈ ৳3,640');
    expect(screen.getByTestId(`spent-day-${TOMORROW}`)).toHaveTextContent(`${weekdayDay(TOMORROW)}Not yetplan ≈ ৳1,300`);
    expect(screen.getByTestId('spent-all')).toHaveTextContent('Everything you noted8');
    // No ways to save and no AI estimate once the trip has started
    expect(screen.queryByTestId('budget-save-rickshaw')).toBeNull();
    expect(screen.queryByTestId('ai-budget')).toBeNull();
    await fireEvent.press(screen.getByTestId('spent-all'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/trip/budget/noted/[id]', params: { id: 5 } });
  });

  it('a part over its plan says by how much, with an icon; over the budget says so', async () => {
    api.get.mockResolvedValue(ON_TRIP);
    const over = {
      ...ON_TRIP_SPENT,
      spent: { ...ON_TRIP_SPENT.spent!, total: 26000, by_part: { ...ON_TRIP_SPENT.spent!.by_part, food: 4500 } },
      to_come: 3000,
      projected: 29000,
    } as BudgetBreakdown;
    api.budget.mockResolvedValue(over);
    api.expenses.mockResolvedValue(TODAYS_NOTES);
    await renderWithQuery(<BudgetScreen />);
    expect(await screen.findByTestId('spent-part-food')).toHaveTextContent(/Food৳4,500.*৳500 over/);
    expect(screen.getByTestId('spent-status')).toHaveTextContent(/Over by ৳1,000$/);
  });

  it('where the plan would end, over the budget, is a warning in words', async () => {
    api.get.mockResolvedValue(ON_TRIP);
    api.budget.mockResolvedValue({ ...ON_TRIP_SPENT, to_come: 16000, projected: 26160 } as BudgetBreakdown);
    api.expenses.mockResolvedValue(TODAYS_NOTES);
    await renderWithQuery(<BudgetScreen />);
    expect(await screen.findByText('That would be ৳1,160 over your budget.')).toBeTruthy();
    expect(screen.getByTestId('spent-status')).toHaveTextContent(/৳14,840 left$/);
  });

  it('nothing noted: the plan, said to be the plan, with "Add what you spent"; never "৳0 spent"', async () => {
    api.get.mockResolvedValue(ON_TRIP);
    api.budget.mockResolvedValue(PLAN);
    await renderWithQuery(<BudgetScreen />);
    const hero = await screen.findByTestId('budget-total');
    expect(hero).toHaveTextContent(/^THE PLAN COSTS ABOUT≈ ৳20,540of your ৳25,000 budget/);
    expect(hero).toHaveTextContent(/Add what you spent$/);
    expect(screen.queryByTestId('spent-hero')).toBeNull();
    expect(screen.queryByText(/৳0/)).toBeNull();
    expect(screen.queryByTestId('budget-save-rickshaw')).toBeNull();
    expect(screen.queryByTestId('ai-budget')).toBeNull();
    expect(api.expenses).not.toHaveBeenCalled();
  });

  it("a friend's trip: the plan only, nothing to add", async () => {
    mockMe.data = { id: 'someone-else' };
    api.get.mockResolvedValue(ON_TRIP);
    api.budget.mockResolvedValue(PLAN);
    await renderWithQuery(<BudgetScreen />);
    expect(await screen.findByTestId('budget-total')).toBeTruthy();
    expect(screen.queryByTestId('spent-add')).toBeNull();
    expect(screen.queryByTestId('budget-change')).toBeNull();
  });
});

// Frame 40: what the trip cost
const AFTER_SPENT = {
  ...PLAN,
  by_day: PLAN.by_day.map((d, i) => ({ ...d, date: addDays(AFTER_TRIP.start_date, i) })),
  spent: {
    total: 19870,
    by_part: { getting_there: 4800, stay: 8000, food: 3650, tickets: 200, local: 2870, shopping: 350, other: 0 },
    by_day: [
      { date: AFTER_TRIP.start_date, amount: 2610 },
      { date: addDays(AFTER_TRIP.start_date, 1), amount: 3420 },
      { date: AFTER_TRIP.end_date, amount: 1040 },
    ],
    today: 0,
    count: 21,
  },
  to_come: 0,
  projected: 19870,
} as BudgetBreakdown;

describe('Budget after the trip (frame 40)', () => {
  it('what it cost against your budget and the plan, the table, by day, the biggest costs', async () => {
    api.get.mockResolvedValue(AFTER_TRIP);
    api.budget.mockResolvedValue(AFTER_SPENT);
    api.expenses.mockResolvedValue([
      note(1, AFTER_TRIP.start_date, 8000, 'stay', 'Hotel Beach Way'),
      note(2, AFTER_TRIP.start_date, 950, 'food', 'Lunch · Mermaid Café'),
      note(3, addDays(AFTER_TRIP.start_date, -1), 4800, 'getting_there', ''),
      note(4, AFTER_TRIP.end_date, 350, 'shopping', 'Dried fish'),
    ]);
    await renderWithQuery(<BudgetScreen />);
    const hero = await screen.findByTestId('spent-hero');
    expect(hero).toHaveTextContent(/^THE TRIP COST৳19,870of your ৳25,000 budget/);
    expect(screen.getByTestId('spent-status')).toHaveTextContent(/৳5,130 under your budget$/);
    expect(hero).toHaveTextContent(/Each৳9,935Against the plan৳670 less$/);
    expect(screen.getByTestId('spent-row-getting_there')).toHaveTextContent('Getting there৳20 less≈ 4,8204,800');
    expect(screen.getByTestId('spent-row-stay')).toHaveTextContent('StayAs planned8,0008,000');
    expect(screen.getByTestId('spent-row-local')).toHaveTextContent('Local travel৳650 less≈ 3,5202,870');
    expect(screen.getByTestId('spent-row-unplanned')).toHaveTextContent('Not in the planShopping–350');
    expect(screen.getByTestId('spent-table')).toHaveTextContent(/All together≈ 20,54019,870$/);
    expect(screen.getByTestId(`spent-day-${AFTER_TRIP.end_date}`)).toHaveTextContent(/৳1,040plan ≈ ৳1,300$/);
    // the biggest three, largest first; a note without words says its part
    const big = await screen.findByTestId('spent-biggest');
    expect(big).toHaveTextContent(/^Hotel Beach WayStay · .*৳8,000Getting there[A-Z][a-z]{2} \d+ [A-Z][a-z]{2}৳4,800Lunch · Mermaid CaféFood · .*৳950$/);
    expect(screen.getByTestId('spent-all')).toHaveTextContent('Everything you noted21');
  });

  it('nothing noted: the plan\'s estimate, said to be the plan\'s, with "Add what you spent"', async () => {
    api.get.mockResolvedValue(AFTER_TRIP);
    api.budget.mockResolvedValue({ ...PLAN, by_day: AFTER_SPENT.by_day } as BudgetBreakdown);
    await renderWithQuery(<BudgetScreen />);
    const card = await screen.findByTestId('spent-by-plan');
    expect(card).toHaveTextContent("BY THE PLAN, ABOUT≈ ৳20,540You didn't note what you spent, so this is the plan's estimate.Add what you spent");
    expect(screen.queryByTestId('spent-hero')).toBeNull();
    expect(screen.queryByText(/৳0/)).toBeNull();
  });

  it('a trip that did not happen takes no notes', async () => {
    api.get.mockResolvedValue({ ...AFTER_TRIP, not_taken: '2026-11-19T10:00:00' } as Trip);
    api.budget.mockResolvedValue({ ...PLAN, by_day: AFTER_SPENT.by_day } as BudgetBreakdown);
    await renderWithQuery(<BudgetScreen />);
    expect(await screen.findByTestId('spent-by-plan')).toBeTruthy();
    expect(screen.queryByTestId('spent-add')).toBeNull();
  });
});

const SUGGESTIONS: ExpenseSuggestion[] = [
  {
    key: 'stop:41',
    kind: 'meal',
    item_id: 41,
    ride: null,
    part: 'food',
    amount: 900,
    estimate: true,
    title: 'Lunch at Mermaid Café',
    place: 'Mermaid Café',
    mode: null,
    meal_source: 'restaurant',
    count: 2,
  },
  {
    key: 'to:42',
    kind: 'ride',
    item_id: 42,
    ride: 'to',
    part: 'local',
    amount: 480,
    estimate: true,
    title: null,
    place: 'Inani Beach',
    mode: 'cng',
    meal_source: null,
    count: null,
  },
  {
    key: 'back',
    kind: 'ride',
    item_id: null,
    ride: 'back',
    part: 'local',
    amount: 800,
    estimate: true,
    title: null,
    place: 'Hotel Beach Way',
    mode: 'cng',
    meal_source: null,
    count: null,
  },
];

async function renderSheet(editing: Expense | null = null, onDone = jest.fn()) {
  await renderWithQuery(
    <AddSpentSheet visible tripId={5} start={YESTERDAY} end={TOMORROW} travellers={2} today={TODAY} editing={editing} onClose={jest.fn()} onDone={onDone} />,
  );
  return onDone;
}

describe('"What did you spend?" (frame 39)', () => {
  it("one tap on the day's plan fills the amount, what for and the note; all can still change; Save notes it", async () => {
    api.expenseSuggestions.mockResolvedValue(SUGGESTIONS);
    api.addExpense.mockResolvedValue(note(9, TODAY, 950, 'food', 'Lunch'));
    const onDone = await renderSheet();
    expect(screen.getByTestId('spent-sheet')).toHaveTextContent(/^What did you spend\?৳for both of you/);
    expect(screen.getByTestId('spent-save')).toBeDisabled();
    await fireEvent.press(await screen.findByTestId('spent-suggestion-stop:41'));
    expect(api.expenseSuggestions).toHaveBeenCalledWith(5, TODAY);
    expect(screen.getByText("From today's plan")).toBeTruthy();
    expect(screen.getByTestId('spent-suggestion-stop:41')).toHaveTextContent(/Lunch ≈ ৳900$/);
    expect(screen.getByTestId('spent-suggestion-to:42')).toHaveTextContent('CNG to Inani Beach ≈ ৳480');
    expect(screen.getByTestId('spent-suggestion-back')).toHaveTextContent('CNG back to Hotel Beach Way ≈ ৳800');
    expect(screen.getByTestId('spent-amount').props.value).toBe('900');
    expect(screen.getByTestId('spent-note').props.value).toBe('Lunch · Mermaid Café');
    expect(screen.getByTestId('spent-for-food')).toBeChecked();
    expect(screen.getByTestId('spent-day')).toHaveTextContent(/^Today, /);
    // the amount changed by hand keeps what it pays for
    await fireEvent.changeText(screen.getByTestId('spent-amount'), '950');
    expect(screen.getByTestId('spent-save')).toHaveTextContent('Save ৳950');
    await fireEvent.press(screen.getByTestId('spent-save'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ message: 'Noted ৳950' }));
    expect(api.addExpense).toHaveBeenCalledWith(5, { day: TODAY, amount: 950, part: 'food', note: 'Lunch · Mermaid Café', item_id: 41, ride: null });
  });

  it('typed by hand in Bangla digits, for another day of the trip, with no link to the plan', async () => {
    await i18n.changeLanguage('bn');
    api.expenseSuggestions.mockResolvedValue([]);
    api.addExpense.mockResolvedValue(note(9, YESTERDAY, 1250, 'shopping', ''));
    const onDone = await renderSheet();
    await fireEvent.changeText(screen.getByTestId('spent-amount'), '১২৫০');
    expect(screen.getByTestId('spent-amount').props.value).toBe('১২৫০');
    expect(screen.getByTestId('spent-save')).toBeDisabled(); // what for isn't chosen yet
    await fireEvent.press(screen.getByTestId('spent-for-shopping'));
    await fireEvent.press(screen.getByTestId('spent-day-change'));
    await fireEvent.press(screen.getByTestId(`spent-day-${YESTERDAY}`));
    expect(screen.getByTestId('spent-save')).toHaveTextContent('৳১,২৫০ রাখুন');
    await fireEvent.press(screen.getByTestId('spent-save'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.addExpense).toHaveBeenCalledWith(5, { day: YESTERDAY, amount: 1250, part: 'shopping', note: '', item_id: null, ride: null });
  });

  it('a note you made opens with what it says; Save sends the change only; Delete deletes it for Undo', async () => {
    api.expenseSuggestions.mockResolvedValue(SUGGESTIONS);
    api.changeExpense.mockResolvedValue({});
    api.deleteExpense.mockResolvedValue(undefined);
    const mine = { ...note(6, TODAY, 650, 'food', 'Breakfast · Handi'), item_id: 40 };
    const onDone = await renderSheet(mine);
    expect(screen.getByText('What you spent')).toBeTruthy();
    expect(screen.getByTestId('spent-amount').props.value).toBe('650');
    expect(screen.getByTestId('spent-note').props.value).toBe('Breakfast · Handi');
    await fireEvent.changeText(screen.getByTestId('spent-amount'), '700');
    await fireEvent.press(screen.getByTestId('spent-save'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ message: 'Changed' }));
    // what it pays for wasn't touched, so it isn't sent (the server keeps it)
    expect(api.changeExpense).toHaveBeenCalledWith(5, 6, { day: TODAY, amount: 700, part: 'food', note: 'Breakfast · Handi' });

    await fireEvent.press(screen.getByTestId('spent-delete'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ message: 'Deleted', deleted: mine }));
    expect(api.deleteExpense).toHaveBeenCalledWith(5, 6);
  });
});

describe('Large text (1.6×)', () => {
  it("a note's time goes into the line under it, the note whole", async () => {
    const big = { ...PHONE, fontScale: 1.6 };
    Dimensions.set({ window: big, screen: big });
    api.get.mockResolvedValue(ON_TRIP);
    api.expenses.mockResolvedValue(TODAYS_NOTES);
    await renderWithQuery(<NotedScreen />);
    expect(await screen.findByTestId('spent-note-8')).toHaveTextContent('Himchari National Park, 2 tickets11:08 · Tickets৳200');
  });
});

describe('Everything you noted', () => {
  it('by day, the newest first, with each day’s total; a note opens the sheet', async () => {
    api.get.mockResolvedValue(ON_TRIP);
    api.expenses.mockResolvedValue(TODAYS_NOTES);
    api.expenseSuggestions.mockResolvedValue([]);
    await renderWithQuery(<NotedScreen />);
    const today = await screen.findByTestId(`spent-list-day-${TODAY}`);
    // each with its part in the full list
    expect(today).toHaveTextContent(
      /^Today, .*৳1,150 that day11:08Himchari National Park, 2 ticketsTickets৳20010:38CNG to HimchariLocal travel৳30008:55Breakfast · HandiFood৳650$/,
    );
    expect(screen.getByTestId(`spent-list-day-${YESTERDAY}`)).toHaveTextContent(/৳2,610 that dayYesterdayFood৳2,610$/);
    await fireEvent.press(screen.getByTestId('spent-note-7'));
    expect(screen.getByTestId('spent-amount').props.value).toBe('300');
    expect(screen.getByTestId('spent-delete')).toBeTruthy();
  });
});

describe('The same numbers elsewhere (frames 31–33)', () => {
  it("the plan's budget row: spent so far on the trip, what it cost after it, the plan's estimate without notes", async () => {
    await render(<BudgetRow data={ON_TRIP_SPENT} phase="on" onPress={jest.fn()} />);
    expect(screen.getByTestId('trip-budget')).toHaveTextContent('৳10,160 spent of ৳25,000৳14,840 left');
    await screen.rerender(<BudgetRow data={PLAN} phase="on" onPress={jest.fn()} />);
    expect(screen.getByTestId('trip-budget')).toHaveTextContent('≈ ৳20,540 of ৳25,000৳4,460 left');
    await screen.rerender(<BudgetRow data={AFTER_SPENT} phase="after" onPress={jest.fn()} />);
    expect(screen.getByTestId('trip-budget')).toHaveTextContent('It cost ৳19,870 of ৳25,000৳5,130 under your budget');
    await screen.rerender(<BudgetRow data={{ ...AFTER_SPENT, spent: { ...AFTER_SPENT.spent!, total: 27000 } }} phase="after" onPress={jest.fn()} />);
    expect(screen.getByTestId('trip-budget-left')).toHaveTextContent('৳2,000 over your budget');
    await screen.rerender(<BudgetRow data={PLAN} phase="after" onPress={jest.fn()} />);
    expect(screen.getByTestId('trip-budget')).toHaveTextContent('By the plan ≈ ৳20,540 of ৳25,000≈ ৳4,460 under your budget');
  });

  it("a finished day's line says what was spent that day; without notes the plan's estimate stays", async () => {
    await render(<DayLine title={null} places={4} meals={2} money={{ amount: 2780, estimate: true }} spent={2610} travellers={2} roadMinutes={0} />);
    expect(screen.getByTestId('day-stats')).toHaveTextContent('4 places, 2 meals · ৳2,610 spent that day');
    await screen.rerender(<DayLine title={null} places={4} meals={2} money={{ amount: 2780, estimate: true }} spent={0} travellers={2} roadMinutes={0} />);
    expect(screen.getByTestId('day-stats')).toHaveTextContent('4 places, 2 meals · ≈ ৳2,780 for 2');
  });
});

describe('The rules (spent.ts)', () => {
  const t = (key: string, o?: Record<string, unknown>) => i18n.t(key, o) as string;
  const f = { n: (v: number) => String(v), money: (v: number) => `৳${Math.round(v).toLocaleString('en')}` };

  it('a note may be from the day before the trip to the day after it', () => {
    expect(noteDays('2026-11-20', '2026-11-22')).toEqual(['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23']);
  });

  it('typed amounts take Bangla digits and nothing else', () => {
    expect(typedAmount('১২৫০')).toBe(1250);
    expect(typedAmount('৳ 1,250')).toBe(1250);
    expect(typedAmount('')).toBeNull();
  });

  it('a suggestion in words: a meal, a ticket, rides to a stop, back and with the bags', () => {
    expect(suggestionWords(SUGGESTIONS[0], t, f)).toEqual({ label: 'Lunch', note: 'Lunch · Mermaid Café' });
    expect(suggestionWords({ ...SUGGESTIONS[0], kind: 'stop', part: 'tickets', title: 'Himchari', place: 'Himchari National Park' }, t, f)).toEqual({
      label: 'Himchari National Park',
      note: 'Himchari National Park, 2 tickets',
    });
    expect(suggestionWords({ ...SUGGESTIONS[0], meal_source: 'own', title: 'Packed lunch' }, t, f).label).toBe('Packed lunch (your own)');
    expect(suggestionWords(SUGGESTIONS[2], t, f).note).toBe('CNG back to Hotel Beach Way');
    expect(suggestionWords({ ...SUGGESTIONS[2], ride: 'move', place: null }, t, f).note).toBe('CNG with your bags to the next stay');
    expect(forGroup(1, t, f)).toBe('for you');
    expect(forGroup(4, t, f)).toBe('for all 4 of you');
  });

  it('parts against the plan, the days, the table and against the plan in words', () => {
    const parts = partsAgainstPlan({ ...ON_TRIP_SPENT, spent: { ...ON_TRIP_SPENT.spent!, by_part: { ...ON_TRIP_SPENT.spent!.by_part, food: 4500 } } });
    expect(parts.find((p) => p.key === 'food')).toMatchObject({ spent: 4500, planned: 4000, share: 1, over: 500 });
    expect(parts.find((p) => p.key === 'getting_there')).toMatchObject({ spent: 2400, planned: 4820, estimate: true, over: 0 });
    const days = dayRows(
      { ...ON_TRIP_SPENT, spent: { ...ON_TRIP_SPENT.spent!, by_day: [...ON_TRIP_SPENT.spent!.by_day, { date: addDays(YESTERDAY, -1), amount: 120 }] } },
      TODAY,
    );
    expect(days.map((d) => [d.date, d.spent, d.plan, d.when])).toEqual([
      [addDays(YESTERDAY, -1), 120, null, 'past'],
      [YESTERDAY, 2610, 2780, 'past'],
      [TODAY, 1150, 3640, 'today'],
      [TOMORROW, null, 1300, 'future'],
    ]);
    const table = planAndSpent(AFTER_SPENT);
    expect(table.unplanned).toEqual({ spent: 350, parts: ['shopping'] });
    expect([table.planTotal, table.planEstimate, table.spentTotal]).toEqual([20540, true, 19870]);
    expect(againstPlan(19870, 20540, t, f)).toBe('৳670 less');
    expect(againstPlan(4100, 4000, t, f)).toBe('৳100 more');
    expect(againstPlan(200, 200, t, f)).toBe('As planned');
    // against the plan: the noted parts and what no plan has; with every part noted, the totals' difference
    expect(planDifference(AFTER_SPENT)).toBe(19870 - 20540);
    const oneFare = {
      ...AFTER_SPENT,
      spent: { ...AFTER_SPENT.spent!, total: 4800, by_part: { ...AFTER_SPENT.spent!.by_part, stay: 0, food: 0, tickets: 0, local: 0, shopping: 0 } },
    };
    expect(planDifference(oneFare)).toBe(-20);
  });

  it('notes by day, newest first; the time only on the day it was noted; a short range without this year', () => {
    const days = notesByDay(TODAYS_NOTES);
    expect(days.map((d) => [d.day, d.total, d.notes.map((n) => n.id)])).toEqual([
      [TODAY, 1150, [8, 7, 6]],
      [YESTERDAY, 2610, [5]],
    ]);
    expect(noteTime(TODAYS_NOTES[2])).toBe('08:55');
    expect(noteTime({ day: YESTERDAY, created_at: TODAYS_NOTES[2].created_at })).toBeNull();
    const year = TODAY.slice(0, 4);
    expect(shortRange(`${year}-11-20`, `${year}-11-22`, 'en', TODAY)).toBe('20–22 Nov');
    expect(shortRange(`${year}-11-30`, `${year}-12-02`, 'en', TODAY)).toBe('30 Nov – 2 Dec');
  });
});
