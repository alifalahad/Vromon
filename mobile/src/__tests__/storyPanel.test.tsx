import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';

import { StoryPanel } from '../features/map/StoryPanel';
import { DEFAULT_PREFERENCES, usePreferences } from '../features/preferences/store';
import i18n from '../i18n';
import type { TripStats, Visit } from '../types';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

const visit = (place_type: Visit['place_type'], place_code: string, status: Visit['status'], first_visited_on: string | null = null): Visit => ({
  place_type,
  place_code,
  status,
  first_visited_on,
  last_visited_on: null,
  note: null,
  updated_at: '2026-10-26T00:00:00Z',
  country_iso2: place_type === 'country' ? place_code : 'BD',
});

const VISITS = [
  visit('region', 'BD-C', 'lived', '2022-01-01'),
  visit('region', 'BD-B', 'visited', `${new Date().getFullYear()}-02-01`),
  visit('region', 'BD-G', 'visited'),
  visit('region', 'BD-D', 'want'),
  visit('country', 'BD', 'lived'),
  visit('country', 'NP', 'visited'),
];
const STATS = { total_days: 17 } as TripStats;

beforeEach(async () => {
  usePreferences.setState(DEFAULT_PREFERENCES);
  await act(() => i18n.changeLanguage('en'));
});

describe('Your story', () => {
  it('lists every division with its status as a word', async () => {
    await render(<StoryPanel open onClose={jest.fn()} visits={VISITS} home="BD" tripsPlanned={6} tripStats={STATS} />);
    expect(screen.getByText('Your Bangladesh')).toBeTruthy();
    expect(screen.getByText('3 of 8 divisions')).toBeTruthy();
    expect(screen.getByTestId('story-region-BD-C').props.accessibilityLabel).toBe('Dhaka, Lived');
    expect(screen.getByTestId('story-region-BD-D').props.accessibilityLabel).toBe('Khulna, Want to visit');
    expect(screen.getByTestId('story-region-BD-H').props.accessibilityLabel).toBe('Mymensingh');
  });

  it('shows figures from real data only, and leaves out what has not loaded', async () => {
    await render(<StoryPanel open onClose={jest.fn()} visits={VISITS} home="BD" tripsPlanned={6} tripStats={STATS} />);
    expect(within(screen.getByTestId('story-countries')).getByText('2')).toBeTruthy();
    expect(within(screen.getByTestId('story-trips')).getByText('6')).toBeTruthy();
    expect(within(screen.getByTestId('story-days')).getByText('17')).toBeTruthy();
    expect(within(screen.getByTestId('story-want')).getByText('1')).toBeTruthy();

    await render(<StoryPanel open onClose={jest.fn()} visits={VISITS} home="BD" />);
    expect(screen.queryByTestId('story-trips')).toBeNull();
    expect(screen.queryByTestId('story-days')).toBeNull();
  });

  it('counts new places per year and notes the undated ones', async () => {
    await render(<StoryPanel open onClose={jest.fn()} visits={VISITS} home="BD" />);
    expect(screen.getByTestId('story-years').props.accessibilityLabel).toContain('2022, 1');
    expect(screen.getByText(/3 places have no date yet/)).toBeTruthy();
  });

  it('closes', async () => {
    const onClose = jest.fn();
    await render(<StoryPanel open onClose={onClose} visits={VISITS} home="BD" />);
    await fireEvent.press(screen.getByTestId('story-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when closed', async () => {
    await render(<StoryPanel open={false} onClose={jest.fn()} visits={VISITS} home="BD" />);
    expect(screen.queryByTestId('story-panel')).toBeNull();
  });

  it('speaks Bangla with Bangla digits', async () => {
    await act(() => i18n.changeLanguage('bn'));
    usePreferences.setState({ language: 'bn' });
    await render(<StoryPanel open onClose={jest.fn()} visits={VISITS} home="BD" tripsPlanned={6} />);
    expect(screen.getByText('আপনার বাংলাদেশ')).toBeTruthy();
    expect(screen.getByText('৮টির মধ্যে ৩টি বিভাগ')).toBeTruthy();
    expect(screen.getByText('ময়মনসিংহ বিভাগ')).toBeTruthy();
  });
});
