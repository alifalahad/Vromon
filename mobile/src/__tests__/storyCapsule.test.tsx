import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

import { StoryCapsule } from '../features/map/StoryCapsule';
import i18n from '../i18n';
import type { Visit } from '../types';

const visit = (place_type: Visit['place_type'], place_code: string, status: Visit['status']): Visit => ({
  place_type,
  place_code,
  status,
  first_visited_on: null,
  last_visited_on: null,
  note: null,
  updated_at: '2026-10-26T00:00:00Z',
  country_iso2: place_type === 'country' ? place_code : 'BD',
});

const VISITS = [
  visit('region', 'BD-C', 'lived'),
  visit('region', 'BD-B', 'visited'),
  visit('region', 'BD-G', 'visited'),
  visit('region', 'BD-D', 'want'),
  visit('country', 'BD', 'lived'),
  visit('country', 'NP', 'visited'),
];

describe('story capsule', () => {
  it('counts home divisions and countries', async () => {
    await act(() => i18n.changeLanguage('en'));
    await render(<StoryCapsule visits={VISITS} home="BD" />);
    expect(screen.getByText('3 of 8 divisions')).toBeTruthy();
    expect(screen.getByText('2 countries')).toBeTruthy();
    expect(screen.getByTestId('story-capsule').props.accessibilityLabel).toBe('3 of 8 divisions, 2 countries');
  });

  it('shows only countries when the home regions are not bundled', async () => {
    await act(() => i18n.changeLanguage('en'));
    await render(<StoryCapsule visits={[visit('country', 'IN', 'visited')]} home="IN" />);
    expect(screen.getByText('1 country')).toBeTruthy();
  });

  it('uses Bangla digits in Bangla', async () => {
    await act(() => i18n.changeLanguage('bn'));
    await render(<StoryCapsule visits={VISITS} home="BD" />);
    expect(screen.getByText('৮টির মধ্যে ৩টি বিভাগ')).toBeTruthy();
    expect(screen.getByText('২টি দেশ')).toBeTruthy();
  });
});
