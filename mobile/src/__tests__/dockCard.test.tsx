import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { Dock } from '../features/map/Dock';
import type { DockState } from '../features/map/dockState';
import { DEFAULT_PREFERENCES, usePreferences } from '../features/preferences/store';
import i18n from '../i18n';
import type { Destination, Trip, Visit } from '../types';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('../ui/haptics', () => ({ haptics: { light: jest.fn(), selection: jest.fn(), success: jest.fn() }, haptic: jest.fn() }));
const mockItinerary = jest.fn();
const mockBudget = jest.fn();
jest.mock('../services/api', () => ({
  ...jest.requireActual('../services/api'),
  tripsApi: { getItinerary: (...a: unknown[]) => mockItinerary(...a), budget: (...a: unknown[]) => mockBudget(...a) },
}));

const clients: QueryClient[] = [];
function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
afterEach(() => clients.splice(0).forEach((c) => c.clear()));

const TRIP = { id: 9, destination: "Cox's Bazar", start_date: '2026-10-29', end_date: '2026-10-31', num_travelers: 2, status: 'planned', num_days: 3 } as Trip;
const dest = (id: number, name: string, checked = true): Destination => ({ id, name, country: 'Bangladesh', region_code: 'BD-B', country_iso2: 'BD', checked });
const want: Visit = { place_type: 'region', place_code: 'BD-B', status: 'want', first_visited_on: null, last_visited_on: null, note: null, updated_at: '2026-10-01' };

beforeEach(async () => {
  jest.clearAllMocks();
  usePreferences.setState(DEFAULT_PREFERENCES);
  await act(() => i18n.changeLanguage('en'));
});

describe('dock cards', () => {
  it('a trip coming up: countdown, stops and cost from the trip, Open trip', async () => {
    mockItinerary.mockResolvedValue({ days: [{ items: [{ item_type: 'activity' }, { item_type: 'meal' }, { item_type: 'activity' }] }] });
    mockBudget.mockResolvedValue({ estimated_total: 18400, total_budget: 25000 });
    const state: DockState = { kind: 'upcoming', trip: TRIP, daysAway: 6 };
    await renderWithClient(<Dock state={state} />);
    expect(screen.getByText("Cox's Bazar")).toBeTruthy();
    expect(screen.getByTestId('dock-countdown').props.accessibilityLabel).toBe('In 6 days');
    expect(await screen.findByText('2 stops')).toBeTruthy();
    expect(await screen.findByText('≈ ৳18,400')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('dock-open-trip'));
    expect(mockPush).toHaveBeenCalledWith('/trip/9');
  });

  it('an idea from the Want list: plans that destination, and cycles ideas', async () => {
    const state: DockState = { kind: 'idea', ideas: [{ destination: dest(1, "Cox's Bazar"), place: want }, { destination: dest(2, 'Bandarban', false), place: want }] };
    await renderWithClient(<Dock state={state} />);
    expect(screen.getByText("Cox's Bazar")).toBeTruthy();
    expect(screen.getByText('Chattogram')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('dock-next-idea'));
    expect(screen.getByText('Bandarban')).toBeTruthy();
    expect(screen.getByText('Chattogram · details not checked yet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('dock-plan'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/trip/new', params: { destination: 'Bandarban' } });
  });

  it('nothing yet: a nudge to start marking', async () => {
    await renderWithClient(<Dock state={{ kind: 'empty' }} />);
    expect(screen.getByText("Mark where you've been")).toBeTruthy();
  });
});
