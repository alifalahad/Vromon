/**
 * Search anything in free time (docs/trip-upgrades, step 6): the "Add a stop" sheet's grouped results with
 * their distance and "Not checked" badge, the address search only when wanted (its own spinner), "Did you
 * mean" and "Colleges near you", always "Put a pin on the map", what each pick sends, and the badge on a
 * private stop's card, its stop sheet ("Suggest this place to Vromon") and its map pin.
 */

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import { isPrivatePlace, kindIcon, kindLabel } from '../features/places/kinds';
import { AddStopSheet, type AddChoice, type AddTarget } from '../features/trips/plan/AddStopSheet';
import { StopCard } from '../features/trips/plan/PlanRows';
import { StopSheet } from '../features/trips/plan/StopSheet';
import i18n from '../i18n';
import { tripsApi } from '../services/api';
import type { ItineraryItem, SearchResponse, SearchResult } from '../types';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({
  haptic: jest.fn(),
  haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn(), medium: jest.fn() },
}));
jest.mock('@maplibre/maplibre-react-native', () => {
  const R = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const Pass = ({ children }: { children?: React.ReactNode }) => R.createElement(View, null, children);
  return { Map: Pass, Camera: () => null, GeoJSONSource: Pass, RasterDEMSource: Pass, RasterSource: Pass, VectorSource: Pass, Layer: () => null, Marker: Pass };
});
jest.mock('../services/api', () => ({
  ApiError: class ApiError extends Error {},
  tripsApi: { suggestions: jest.fn(), search: jest.fn() },
  placesApi: { list: jest.fn(() => Promise.resolve([])), suggest: jest.fn() },
  geoApi: { cities: jest.fn(() => Promise.resolve([])) },
}));

const api = tripsApi as unknown as Record<string, jest.Mock>;
const t = i18n.t.bind(i18n) as (key: string, options?: Record<string, unknown>) => string;

beforeEach(async () => {
  jest.clearAllMocks();
  await act(() => i18n.changeLanguage('en'));
  api.suggestions.mockResolvedValue([]);
});

const result = (id: string, name: string, extra: Partial<SearchResult> = {}): SearchResult => ({
  id,
  ref: { poi_id: id },
  group: 'other',
  source: 'poi',
  name,
  kind: 'college',
  lat: 22.86,
  lon: 89.53,
  distance_km: 2.4,
  checked: false,
  score: 88,
  ...extra,
});

const response = (extra: Partial<SearchResponse> = {}): SearchResponse => ({
  query: 'BL College',
  kind: 'college',
  near: { name: 'Rupsha Bridge', lat: 22.82, lon: 89.55 },
  groups: [],
  did_you_mean: [],
  kind_results: null,
  pin: true,
  addresses_wanted: false,
  geocoder: 'skipped',
  retry_after: null,
  ...extra,
});

const TARGET: AddTarget = { dayId: 11, position: 2, nearItemId: 4 };

async function renderSheet(onAdd = jest.fn<void, [AddChoice, AddTarget]>()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={client}>
      <BottomSheetModalProvider>
        <AddStopSheet tripId={5} destination="Khulna" target={TARGET} center={{ lat: 22.82, lon: 89.55 }} onClose={jest.fn()} onAdd={onAdd} />
      </BottomSheetModalProvider>
    </QueryClientProvider>,
  );
  return onAdd;
}

async function type(text: string) {
  await act(async () => fireEvent.changeText(screen.getByTestId('add-search'), text));
  // the search waits for a pause in typing
  await act(() => new Promise((resolve) => setTimeout(resolve, 350)));
}

describe('kinds', () => {
  it('names and draws every kind, and knows a private stop', () => {
    expect(kindLabel('college', t)).toBe('College');
    expect(kindLabel('college', t, 2)).toBe('Colleges');
    expect(kindLabel('no_such_kind', t)).toBeNull();
    expect(kindIcon('hospital')).toBe('hospital-building');
    expect(kindIcon(undefined)).toBe('map-marker-outline');
    expect(isPrivatePlace({ listed: false })).toBe(true);
    expect(isPrivatePlace({ listed: true })).toBe(false);
    expect(isPrivatePlace(undefined)).toBe(false);
  });

  it('has Bangla words for every kind, one and many', async () => {
    await act(() => i18n.changeLanguage('bn'));
    expect(kindLabel('college', t)).toBe('কলেজ');
    expect(kindLabel('bus_station', t, 2)).toBe('বাসস্ট্যান্ড');
  });
});

describe('the "Add a stop" sheet', () => {
  it('keeps the suggestions while the box is empty, and always offers a pin', async () => {
    await renderSheet();
    await waitFor(() => expect(api.suggestions).toHaveBeenCalledWith(5, 11, { near_item_id: 4 }));
    expect(api.search).not.toHaveBeenCalled();
    expect(screen.getByTestId('search-pin')).toHaveTextContent(/Put a pin on the map/);
  });

  it('groups the results under headings, with the distance from the stop before and "Not checked"', async () => {
    api.search.mockResolvedValue(
      response({
        groups: [
          {
            key: 'vromon',
            results: [
              result('place_id:8', 'Rupsha Ghat Park', {
                group: 'vromon',
                source: 'vromon',
                ref: { place_id: 8 },
                kind: null,
                category: 'Nature',
                checked: true,
                distance_km: 0.8,
              }),
            ],
          },
          {
            key: 'nearby',
            results: [
              result('restaurant_id:3', 'Kacchi Bhai', {
                group: 'nearby',
                source: 'restaurant',
                ref: { restaurant_id: 3 },
                kind: 'restaurant',
                checked: true,
                distance_km: 1.1,
              }),
            ],
          },
          { key: 'other', results: [result('poi_id:o1', 'Govt. B.L College, Khulna')] },
        ],
        // the server's fallbacks stay hidden once anything was found
        did_you_mean: ['Govt. Brajalal College'],
      }),
    );
    const onAdd = await renderSheet();
    await type('BL College');
    expect(api.search).toHaveBeenCalledWith(5, 11, { q: 'BL College', near_item_id: 4, part: 'places' });
    const college = await screen.findByTestId('search-result-poi_id:o1');
    const titles = screen.getAllByRole('header').map((h) => h.props.children);
    expect(titles).toEqual(expect.arrayContaining(['Vromon’s places', 'More nearby', 'Other places (not checked)']));
    expect(college).toHaveTextContent(/College · 2\.4 km from Rupsha Bridge/);
    expect(within(college).getByTestId('search-unchecked-poi_id:o1')).toHaveTextContent('Not checked');
    expect(college.props.accessibilityLabel).toMatch(/Govt\. B\.L College, Khulna\. College · 2\.4 km from Rupsha Bridge\. Not checked by Vromon/);
    // Vromon's own place: no badge
    expect(screen.queryByTestId('search-unchecked-place_id:8')).toBeNull();
    expect(screen.queryByTestId('did-you-mean-Govt. Brajalal College')).toBeNull();
    // no address search: the places found enough
    expect(api.search).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.press(college));
    expect(onAdd).toHaveBeenCalledWith({ name: 'Govt. B.L College, Khulna', ref: { poi_id: 'poi_id:o1' } }, TARGET);
  });

  it('asks for addresses only when the places found little, with a spinner for that part', async () => {
    let answer: (r: SearchResponse) => void = () => {};
    api.search.mockImplementation((_trip: number, _day: number, params: { part: string }) =>
      params.part === 'places'
        ? Promise.resolve(response({ query: 'KDA Avenue', kind: null, addresses_wanted: true }))
        : new Promise<SearchResponse>((resolve) => (answer = resolve)),
    );
    const onAdd = await renderSheet();
    await type('KDA Avenue');
    expect(await screen.findByTestId('search-addresses-loading')).toHaveTextContent(/Looking up addresses/);
    expect(api.search).toHaveBeenLastCalledWith(5, 11, { q: 'KDA Avenue', near_item_id: 4, part: 'addresses' });
    const street = result('geocode:7.0', 'KDA Avenue', {
      group: 'addresses',
      source: 'geocode',
      ref: { geocode: '7.0' },
      kind: 'street',
      address: 'KDA Avenue, Khulna, Bangladesh',
    });
    await act(async () => answer(response({ query: 'KDA Avenue', geocoder: 'used', groups: [{ key: 'addresses', results: [street] }] })));
    await waitFor(() => expect(screen.queryByTestId('search-addresses-loading')).toBeNull());
    expect(await screen.findByTestId('search-group-addresses')).toHaveTextContent(/Addresses/);
    expect(screen.getByTestId('search-result-geocode:7.0')).toHaveTextContent(/Street · 2\.4 km from Rupsha Bridge.*KDA Avenue, Khulna, Bangladesh/);
    await act(async () => fireEvent.press(screen.getByTestId('search-result-geocode:7.0')));
    expect(onAdd).toHaveBeenCalledWith({ name: 'KDA Avenue', ref: { geocode: '7.0' } }, TARGET);
  });

  it('is never a dead end: "Did you mean", the kind near you, and a pin', async () => {
    api.search.mockImplementation((_trip: number, _day: number, params: { q: string; part: string }) =>
      Promise.resolve(
        params.q === 'Govt. Brajalal College'
          ? response({ query: params.q, groups: [{ key: 'other', results: [result('poi_id:o2', 'Govt. Brajalal College')] }] })
          : response({
              query: params.q,
              did_you_mean: ['Govt. Brajalal College', 'Brojomohun School'],
              kind_results: { kind: 'college', results: [result('poi_id:o3', 'BSL Azam Khan Commerce College', { distance_km: 0.9 })] },
            }),
      ),
    );
    await renderSheet();
    await type('zqx colege');
    expect(await screen.findByText('Nothing called “zqx colege” nearby.')).toBeTruthy();
    expect(screen.getByTestId('search-kind-results')).toHaveTextContent(/Colleges near you.*BSL Azam Khan Commerce College/);
    expect(screen.getByTestId('search-pin')).toBeTruthy();
    // "Did you mean" searches for that name
    await act(async () => fireEvent.press(screen.getByTestId('did-you-mean-Govt. Brajalal College')));
    await waitFor(() => expect(api.search).toHaveBeenLastCalledWith(5, 11, { q: 'Govt. Brajalal College', near_item_id: 4, part: 'places' }));
    expect(await screen.findByTestId('search-result-poi_id:o2')).toBeTruthy();
    expect(screen.getByTestId('add-search').props.defaultValue).toBe('Govt. Brajalal College');
  });

  it('puts a pin on the map and names it, with a name of its own when none is given', async () => {
    const onAdd = await renderSheet();
    await act(async () => fireEvent.press(screen.getByTestId('search-pin')));
    await act(async () => fireEvent.changeText(await screen.findByTestId('place-picker-name'), "Aunt's office"));
    await act(async () => fireEvent.press(screen.getByTestId('place-picker-use')));
    expect(onAdd).toHaveBeenCalledWith({ name: "Aunt's office", ref: { pin: { lat: 22.82, lon: 89.55, name: "Aunt's office" } } }, TARGET);

    onAdd.mockClear();
    await act(async () => fireEvent.press(screen.getByTestId('search-pin')));
    await act(async () => fireEvent.press(await screen.findByTestId('place-picker-use')));
    expect(onAdd).toHaveBeenCalledWith({ name: 'My pin', ref: { pin: { lat: 22.82, lon: 89.55, name: 'My pin' } } }, TARGET);
  });
});

// A stop from outside Vromon's list, in the plan
const PRIVATE: ItineraryItem = {
  id: 30,
  item_type: 'activity',
  title: 'Govt. B.L College, Khulna',
  start_time: '15:00',
  end_time: '16:00',
  duration_minutes: 60,
  cost: 0,
  travel_time_to_next: 0,
  distance_to_next: 0,
  recommendation_score: 0,
  recommendation_reasons: ['Added by you'],
  order_index: 3,
  currency: 'BDT',
  cost_source: 'placeholder',
  place_id: 77,
  place: {
    id: 77,
    name: 'Govt. B.L College, Khulna',
    destination_name: 'Khulna',
    category: 'Other',
    latitude: 22.86,
    longitude: 89.53,
    cost_known: false,
    hours_known: false,
    rating_known: false,
    source: 'poi',
    checked: false,
    listed: false,
    kind: 'college',
  },
};

describe('a private stop', () => {
  it('shows "Not checked" and its kind on its card', async () => {
    await render(<StopCard item={PRIVATE} n={3} kind="visit" issues={[]} selected={false} removable onPress={jest.fn()} onRemove={jest.fn()} />);
    const card = screen.getByTestId('stop-30');
    expect(card).toHaveTextContent(/College · Price unknown/);
    expect(screen.getByTestId('stop-unchecked-30')).toHaveTextContent('Not checked');
    expect(card.props.accessibilityHint).toMatch(/Not checked by Vromon/);
  });

  it("a stop of Vromon's has no badge", async () => {
    const item = { ...PRIVATE, place: { ...PRIVATE.place!, listed: true, kind: null, checked: true, source: 'curated' } };
    await render(<StopCard item={item} n={3} kind="visit" issues={[]} selected={false} removable onPress={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.queryByTestId('stop-unchecked-30')).toBeNull();
  });

  it('its sheet says whose it is and can suggest it to Vromon', async () => {
    const onSuggest = jest.fn();
    await render(
      <BottomSheetModalProvider>
        <StopSheet
          item={PRIVATE}
          issues={[]}
          editable
          onClose={jest.fn()}
          onExplain={jest.fn()}
          onSwap={jest.fn()}
          onRemove={jest.fn()}
          onSuggest={onSuggest}
        />
      </BottomSheetModalProvider>,
    );
    expect(await screen.findByTestId('stop-sheet-unchecked')).toHaveTextContent('Not checked');
    expect(screen.getByText(/Only you and your trip room see it/)).toBeTruthy();
    expect(screen.getByTestId('stop-source')).toHaveTextContent(/From open map data \(OpenStreetMap, Overture Maps\) · not checked yet/);
    expect(screen.queryByTestId('stop-explain')).toBeNull(); // nothing to explain, and its name isn't sent to the AI
    await act(async () => fireEvent.press(screen.getByTestId('stop-suggest')));
    expect(onSuggest).toHaveBeenCalledWith(PRIVATE);
  });

  it("a restaurant of Vromon's added from search is your own stop, but checked: no badge, nothing to suggest", async () => {
    const restaurant = {
      ...PRIVATE,
      title: 'New Azmiri Kacchi Kitchen',
      place: { ...PRIVATE.place!, name: 'New Azmiri Kacchi Kitchen', source: 'restaurant', kind: 'restaurant', checked: true },
    };
    await render(<StopCard item={restaurant} n={6} kind="visit" issues={[]} selected={false} removable onPress={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.getByTestId('stop-30')).toHaveTextContent(/Restaurant · Price unknown/);
    expect(screen.queryByTestId('stop-unchecked-30')).toBeNull();
    await render(
      <BottomSheetModalProvider>
        <StopSheet
          item={restaurant}
          issues={[]}
          editable
          onClose={jest.fn()}
          onExplain={jest.fn()}
          onSwap={jest.fn()}
          onRemove={jest.fn()}
          onSuggest={jest.fn()}
        />
      </BottomSheetModalProvider>,
    );
    expect(screen.queryByTestId('stop-sheet-unchecked')).toBeNull();
    expect(screen.queryByTestId('stop-suggest')).toBeNull();
  });

  it("someone else's view of the trip can't suggest it", async () => {
    await render(
      <BottomSheetModalProvider>
        <StopSheet
          item={PRIVATE}
          issues={[]}
          editable={false}
          onClose={jest.fn()}
          onExplain={jest.fn()}
          onSwap={jest.fn()}
          onRemove={jest.fn()}
          onSuggest={jest.fn()}
        />
      </BottomSheetModalProvider>,
    );
    expect(await screen.findByTestId('stop-sheet-unchecked')).toBeTruthy();
    expect(screen.queryByTestId('stop-suggest')).toBeNull();
  });
});
