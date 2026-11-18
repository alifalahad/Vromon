/**
 * Explore (docs/ui-refresh step 12): the switch between your country and the world, a home country that isn't
 * Bangladesh (no districts, nothing invented), your marks on the cards and the hero's count, "Ready to plan",
 * and a district's page with and without a photo of its own.
 */

import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import ExploreScreen from '../../app/(tabs)/explore';
import DistrictScreen from '../../app/explore/district/[slug]';
import type { Bangladesh, CountryDetail, DistrictCard, DistrictDetail } from '../features/explore/api';
import { useExploreHalf } from '../features/explore/exploreState';
import { countriesBeenByContinent, countrySatellite, districtCode, districtOrder, planOrder } from '../features/explore/marks';
import { DEFAULT_PREFERENCES, usePreferences } from '../features/preferences/store';
import i18n from '../i18n';
import type { Visit } from '../types';

const visit = (place_type: Visit['place_type'], place_code: string, status: Visit['status']): Visit => ({
  place_type,
  place_code,
  status,
  first_visited_on: null,
  last_visited_on: null,
  note: null,
  updated_at: '2026-11-01T00:00:00Z',
});

const counts = (attractions: number, hotels = 0) => ({ attractions, gi_foods: 0, gi_products: 0, hotels, hotels_with_price: 0, restaurants: 0 });
const district = (slug: string, name: string, attractions: number, photo: DistrictCard['photo'] = null): DistrictCard => ({
  slug,
  name_en: name,
  name_bn: null,
  division_slug: 'bd-division-chattogram',
  division_en: 'Chattogram',
  division_bn: 'চট্টগ্রাম',
  centroid_lat: 22,
  centroid_lon: 92,
  area_km2: 4595,
  bbox: null,
  photo,
  counts: counts(attractions, 10),
});
const OWN_PHOTO = {
  kind: 'attraction' as const,
  caption: 'Bagakain Lake',
  url: 'https://u/b.jpg',
  thumb_url: null,
  page_url: 'p',
  license: 'CC BY-SA 4.0',
  attribution: 'Rocky Masum, CC BY-SA 4.0',
};
const SATELLITE = { kind: 'satellite' as const, url: 'https://esri/x.jpg', thumb_url: null, page_url: 'p', license: null, attribution: 'Esri, Vantor' };

const BANDARBAN = district('bd-district-bandarban', 'Bandarban', 38, OWN_PHOTO);
const RANGAMATI = district('bd-district-rangamati', 'Rangamati', 29);
const COX = district('bd-district-coxs-bazar', "Cox's Bazar", 25);
const mockBd: Bangladesh = {
  country: {
    iso2: 'BD',
    name: 'Bangladesh',
    name_bn: 'বাংলাদেশ',
    continent: 'Asia',
    un_member_or_observer: true,
    status: null,
    photo: null,
    facts: {
      capital_en: 'Dhaka',
      capital_bn: 'ঢাকা',
      population: 171466990,
      population_year: 2023,
      area_km2: 147570,
      currencies: [],
      languages: [],
      calling_codes: [],
      description_en: null,
      description_bn: null,
      wikidata_id: null,
    },
  },
  divisions: [{ slug: 'bd-division-chattogram', name_en: 'Chattogram', name_bn: 'চট্টগ্রাম', area_km2: null, districts: [COX, RANGAMATI, BANDARBAN] }],
  gi_foods: [
    {
      name_bn: 'বান্দরবানের কলা',
      name_en: 'Banana',
      district_slug: 'bd-district-bandarban',
      is_food: true,
      gi_registration_no: null,
      gi_application_date: null,
      source_url: null,
    },
  ],
  destinations: [
    { id: 1, name: "Cox's Bazar", district_slug: 'bd-district-coxs-bazar' },
    { id: 2, name: 'Bandarban', district_slug: 'bd-district-bandarban' },
    { id: 8, name: 'Rangamati', district_slug: 'bd-district-rangamati' },
  ],
  sources: ['Districts: geoBoundaries'],
};
const mockJapan: CountryDetail = {
  ...mockBd.country,
  iso2: 'JP',
  name: 'Japan',
  name_bn: 'জাপান',
  facts: { ...mockBd.country.facts!, capital_en: 'Tokyo', capital_bn: 'টোকিও', population: 124000000 },
  regions: 47,
  cities: [
    {
      geonameid: 1850147,
      name: 'Tokyo',
      country_iso2: 'JP',
      country_name: 'Japan',
      region: 'Tokyo',
      population: 8336599,
      latitude: 35.7,
      longitude: 139.7,
      photo: null,
    },
  ],
  label_lat: 36,
  label_lon: 138,
};

let mockHome: string | null = 'BD';
let mockVisits: Visit[] = [];
let mockDistrict: DistrictDetail | undefined;
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), dismissAll: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useScrollToTop: () => undefined,
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({ haptic: jest.fn(), haptics: { success: jest.fn(), selection: jest.fn(), light: jest.fn(), medium: jest.fn() } }));
jest.mock('../features/account/useMe', () => ({ useMe: () => ({ data: { id: 'u1', username: 'tester', home_country_iso2: mockHome } }) }));
jest.mock('../features/map/visits', () => ({ ...jest.requireActual('../features/map/visits'), useVisits: () => ({ data: mockVisits }) }));
jest.mock('../features/map/TravelKit', () => ({
  useTravelKit: () => ({ visits: mockVisits, name: (v: { place_code: string }) => ({ '1850147': 'Tokyo', '1853909': 'Osaka' })[v.place_code] ?? v.place_code }),
}));
jest.mock('../features/explore/api', () => ({
  ...jest.requireActual('../features/explore/api'),
  useBangladesh: () => ({ data: mockBd }),
  useCountry: (iso2: string) => ({ data: iso2 === 'JP' ? mockJapan : undefined }),
  useContinents: () => ({
    data: [
      { name: 'Asia', countries: 48, un_members_and_observers: 47, population: null, largest: [] },
      { name: 'Oceania', countries: 24, un_members_and_observers: 14, population: null, largest: [] },
    ],
  }),
  useCountries: () => ({
    data: [{ ...mockBd.country }, { ...mockJapan, continent: 'Asia' }, { ...mockBd.country, iso2: 'AU', name: 'Australia', continent: 'Oceania' }],
  }),
  useCities: () => ({ data: [] }),
  useExploreSearch: () => ({ data: undefined }),
  useDistrict: () => ({ data: mockDistrict }),
  useDistrictMaps: () => ({ data: undefined }),
  useDistrictPlaces: () => ({ data: undefined, isFetching: false, fetchNextPage: jest.fn() }),
}));

const render = (ui: React.ReactElement) => rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(async () => {
  await act(() => i18n.changeLanguage('en'));
  usePreferences.setState({ ...DEFAULT_PREFERENCES, language: 'en' });
  useExploreHalf.setState({ half: 'country' });
  mockHome = 'BD';
  mockVisits = [];
  mockPush.mockClear();
  mockParams = {};
});

describe('your marks in Explore', () => {
  it("a catalogue district is the map's district", () => {
    expect(districtCode('bd-district-coxs-bazar')).toBe('BD-coxs-bazar');
  });

  it('a division: the most sights first, the first one large', () => {
    expect(districtOrder([COX, RANGAMATI, BANDARBAN]).map((d) => d.name_en)).toEqual(['Bandarban', 'Rangamati', "Cox's Bazar"]);
  });

  it('"Ready to plan": where you want to go first, then the most sights', () => {
    const all = new Map([BANDARBAN, RANGAMATI, COX].map((d) => [d.slug, d]));
    expect(planOrder(mockBd.destinations, all, []).map((p) => p.id)).toEqual([2, 8, 1]);
    expect(planOrder(mockBd.destinations, all, [visit('district', 'BD-coxs-bazar', 'want')]).map((p) => p.id)).toEqual([1, 2, 8]);
  });

  it('countries visited, by continent', () => {
    const map = countriesBeenByContinent(
      [visit('country', 'AU', 'visited'), visit('country', 'JP', 'want')],
      [{ ...mockBd.country, iso2: 'AU', continent: 'Oceania' }],
    );
    expect([...map]).toEqual([['Oceania', 1]]);
  });

  it("the hero's picture is the country itself, not one map tile", () => {
    const url = countrySatellite('BD')!;
    const [x0, y0, x1, y1] = /bbox=([^&]+)/.exec(url)![1].split(',').map(Number);
    // Bangladesh lies within about 88–92.7°E, 20.6–26.6°N: the picture holds it and not much of India and Nepal
    expect(x0).toBeLessThan(88.1);
    expect(x1).toBeGreaterThan(92.6);
    expect(y0).toBeLessThan(20.8);
    expect(y1).toBeGreaterThan(26.6);
    expect(y1 - y0).toBeLessThan(7.5);
    expect(countrySatellite('XX')).toBeNull();
  });
});

describe('the Explore tab', () => {
  it('opens on your country; the world is one tap away, and the choice stays while the app is open', async () => {
    await render(<ExploreScreen />);
    expect(screen.getByTestId('explore-bangladesh')).toBeTruthy();
    expect(screen.queryByText('Bangladesh')).toBeTruthy(); // the card names the country
    expect(screen.getByText('YOUR COUNTRY')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('explore-switch-world'));
    expect(screen.getByTestId('explore-world')).toBeTruthy();
    expect(screen.queryByTestId('explore-bangladesh')).toBeNull();
    expect(useExploreHalf.getState().half).toBe('world');
    await screen.unmount();
    await render(<ExploreScreen />);
    expect(screen.getByTestId('explore-world')).toBeTruthy();
  });

  it('the hero counts the districts you have been to, and the cards carry your marks', async () => {
    mockVisits = [visit('district', 'BD-rangamati', 'visited'), visit('district', 'BD-bandarban', 'lived'), visit('district', 'BD-coxs-bazar', 'want')];
    await render(<ExploreScreen />);
    expect(screen.getByTestId('explore-bangladesh-count')).toHaveTextContent("You've been to 2 of 3 districts");
    expect(screen.getByTestId('district-card-bd-district-bandarban').props.accessibilityLabel).toBe('Bandarban, 38 sights · 10 hotels, Lived, You can plan it');
    expect(screen.getByTestId('district-card-bd-district-rangamati').props.accessibilityLabel).toContain('Visited');
    expect(screen.getByTestId('district-card-bd-district-coxs-bazar').props.accessibilityLabel).toContain('Want to go');
    // The large card says you can plan it; Ready to plan puts where you want to go first
    expect(screen.getByText('You can plan it')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('plan-trip-1'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/trip/new', params: { destination: "Cox's Bazar" } });
    // Marking a district changes the count
    mockVisits = [...mockVisits, visit('district', 'BD-coxs-bazar', 'visited')].filter((v) => !(v.place_code === 'BD-coxs-bazar' && v.status === 'want'));
    await screen.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ExploreScreen />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('explore-bangladesh-count')).toHaveTextContent("You've been to 3 of 3 districts");
  });

  it('the world: how many countries you have been to, and the continents you have visited', async () => {
    useExploreHalf.setState({ half: 'world' });
    mockVisits = [visit('country', 'BD', 'lived'), visit('country', 'AU', 'visited')];
    await render(<ExploreScreen />);
    expect(screen.getByTestId('explore-world-count')).toHaveTextContent("You've been to 2");
    expect(screen.getByTestId('continent-oceania').props.accessibilityLabel).toBe('Oceania, 24 countries · 1 visited');
    expect(screen.getByTestId('country-row-AU').props.accessibilityLabel).toContain('Visited');
    await fireEvent.press(screen.getByTestId('explore-world'));
    expect(mockPush).toHaveBeenCalledWith('/map/dashboard');
  });

  it('another home country: that country, its cities and your marks there; no districts, nothing invented', async () => {
    mockHome = 'JP';
    mockVisits = [visit('city', '1850147', 'visited'), visit('city', '1853909', 'want')].map((v) => ({ ...v, country_iso2: 'JP' }));
    await render(<ExploreScreen />);
    expect(screen.getByText('Japan')).toBeTruthy();
    expect(screen.queryByText('Bangladesh')).toBeNull();
    expect(screen.queryByTestId('explore-bangladesh')).toBeNull();
    expect(screen.queryByText('Districts by division')).toBeNull();
    expect(screen.queryByText('Ready to plan')).toBeNull();
    expect(screen.getByTestId('explore-home-country-count')).toHaveTextContent("You've been to 1 city here");
    expect(screen.getByTestId('marked-city-1853909').props.accessibilityLabel).toBe('Osaka, Want to go');
    expect(screen.getByTestId('home-city-1850147').props.accessibilityLabel).toContain('Visited');
    await fireEvent.press(screen.getByTestId('explore-home-country'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/map/country/[iso2]', params: { iso2: 'JP' } });
  });
});

describe("a district's page", () => {
  const detail = (photo: DistrictCard['photo'], dests: DistrictDetail['trip_destinations']): DistrictDetail => ({
    ...BANDARBAN,
    photo,
    name_bn: 'বান্দরবান',
    counts: { ...counts(2, 1), restaurants: 1 },
    geometry: null,
    neighbors: [{ slug: 'bd-district-rangamati', name_en: 'Rangamati', name_bn: null }],
    subdistricts: [{ slug: 'u1', name_en: 'Thanchi', name_bn: null }],
    foods: [],
    attractions: [
      {
        slug: 'a1',
        name_en: 'Nilgiri',
        name_bn: null,
        category: 'hill_mountain',
        latitude: null,
        longitude: null,
        short_description_en: null,
        photo: OWN_PHOTO,
      },
      { slug: 'a2', name_en: 'Boga Lake', name_bn: null, category: 'lake', latitude: null, longitude: null, short_description_en: null, photo: null },
    ],
    hotels: [
      {
        slug: 'h1',
        name_en: 'Hill Inn',
        name_bn: null,
        category: 'hotel',
        latitude: null,
        longitude: null,
        address: null,
        website: null,
        official_star_rating: null,
        price: { from_amount: 2500, currency: 'BDT', room: 'Twin', source_url: null, checked_at: '2026-11-05T06:00:00' },
      },
    ],
    restaurants: [
      {
        slug: 'r1',
        name_en: 'Hill Cafe',
        name_bn: null,
        category: 'cafe',
        latitude: null,
        longitude: null,
        address: null,
        website: null,
        official_star_rating: null,
        price: null,
      },
    ],
    trip_destinations: dests,
  });

  it('with a photo: its credit, the counts, the sections, and "Plan a trip here"', async () => {
    mockParams = { slug: 'bd-district-bandarban' };
    mockDistrict = detail(OWN_PHOTO, [{ id: 2, name: 'Bandarban' }]);
    await render(<DistrictScreen />);
    expect(screen.getByTestId('district-photo-credit')).toHaveTextContent('Bagakain Lake · Rocky Masum, CC BY-SA 4.0');
    expect(screen.getByText('বান্দরবান')).toBeTruthy();
    expect(screen.getByTestId('count-sights').props.accessibilityLabel).toBe('2 Sights');
    expect(screen.getByTestId('count-stays').props.accessibilityLabel).toBe('1 Stays');
    expect(screen.getByTestId('count-eat').props.accessibilityLabel).toBe('1 Places to eat');
    expect(screen.getByText('Nilgiri')).toBeTruthy();
    expect(screen.getByText('Boga Lake')).toBeTruthy();
    expect(screen.getByText('Hotel · from ৳2,500 a night · checked 5 Nov 2026')).toBeTruthy();
    expect(screen.getByText('Café')).toBeTruthy();
    expect(screen.getByText('Thanchi')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('district-plan-trip'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/trip/new', params: { destination: 'Bandarban' } });
  });

  it('without a photo: the satellite picture, credited; nothing to plan, so only "Mark"', async () => {
    mockParams = { slug: 'bd-district-bandarban' };
    mockDistrict = detail(SATELLITE, []);
    mockVisits = [visit('district', 'BD-bandarban', 'visited')];
    await render(<DistrictScreen />);
    expect(screen.getByTestId('district-photo-credit')).toHaveTextContent('Satellite picture: Esri');
    expect(screen.queryByTestId('district-plan-trip')).toBeNull();
    expect(screen.queryByTestId('district-send')).toBeNull();
    expect(screen.getByTestId('district-mark').props.accessibilityLabel).toContain('Visited');
  });
});
