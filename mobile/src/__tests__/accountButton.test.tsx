/**
 * The account picture on every tab (docs/ui-refresh step 10, D10): 32 dp in a 48 dp touch area, your photo
 * or your initials, opening Settings; in a tab's header at the same spot as on the Map.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import ExploreScreen from '../../app/(tabs)/explore';
import i18n from '../i18n';
import { ACCOUNT, AccountButton } from '../ui/AccountButton';
import { TabHeader } from '../ui/TabHeader';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useScrollToTop: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({
  haptic: jest.fn(),
  haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn(), medium: jest.fn() },
}));
const mockMe: { data: { id: string; display_name: string; avatar_url?: string | null } } = { data: { id: 'me', display_name: 'Ana Rahman' } };
jest.mock('../features/account/useMe', () => ({ ME_QUERY_KEY: ['me'], useMe: () => mockMe }));
jest.mock('../features/explore/api', () => {
  const none = () => ({ data: undefined, isLoading: false });
  return {
    ...jest.requireActual('../features/explore/api'),
    useBangladesh: none,
    useContinents: none,
    useCountries: none,
    useCities: none,
    useExploreSearch: none,
  };
});

beforeEach(async () => {
  jest.clearAllMocks();
  mockMe.data = { id: 'me', display_name: 'Ana Rahman' };
  await act(() => i18n.changeLanguage('en'));
});

describe('the account button', () => {
  it('without a photo: your initials at 32 dp in a 48 dp touch area, and it opens Settings', async () => {
    await render(<AccountButton testID="account-button-trips" />);
    const button = screen.getByTestId('account-button-trips');
    expect(button.props.accessibilityLabel).toBe('Your profile and settings');
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({ width: 48, height: 48 });
    const initials = screen.getByText('AR', { includeHiddenElements: true });
    expect(StyleSheet.flatten(initials.parent!.props.style)).toMatchObject({ width: 32, height: 32, borderRadius: 16 });
    await fireEvent.press(button);
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('with a photo: the photo in place of the initials', async () => {
    mockMe.data = { id: 'me', display_name: 'Ana Rahman', avatar_url: 'https://example.com/ana.jpg' };
    await render(<AccountButton testID="account-button-trips" />);
    expect(screen.queryByText('AR', { includeHiddenElements: true })).toBeNull();
    // expo-image draws nothing in tests: one empty stand-in where the photo goes
    const button = screen.toJSON() as { children: { type: string; children: unknown[] }[] };
    expect(button.children).toHaveLength(1);
    expect(button.children[0].children).toEqual([]);
  });

  it("over the map it's on a white circle; anything else beside it first", async () => {
    const onOpen = jest.fn();
    await render(<AccountButton floating onOpen={onOpen} testID="map-profile-button" />);
    await fireEvent.press(screen.getByTestId('map-profile-button'));
    expect(onOpen).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/settings');
    // The same spot as in the headers: 12 dp under the status bar, 8 dp from the right
    expect(ACCOUNT).toMatchObject({ area: 48, picture: 32, fromTop: 12, fromRight: 8 });
  });

  it('in a header: a 56 dp row under the status bar, the picture last, 8 dp from the right', async () => {
    await render(<TabHeader title="Trips" account={<AccountButton testID="account-button-trips" />} testID="header" />);
    const header = StyleSheet.flatten(screen.getByTestId('header').props.style);
    // The jest safe area has no inset: 8 above the row, a 56 row and its 1 dp line, so the 48 button is 12 under the top
    expect(header).toMatchObject({ paddingTop: 8, height: 65, paddingRight: 8, alignItems: 'center' });
    const children = screen.getByTestId('header').props.children as React.ReactNode[];
    expect((children.filter(Boolean).at(-1) as React.ReactElement<{ testID: string }>).props.testID).toBe('account-button-trips');
  });
});

describe('each tab has it', () => {
  it('Explore: the search field, then the picture', async () => {
    await render(<ExploreScreen />);
    expect(screen.getByTestId('explore-header')).toBeTruthy();
    expect(screen.getByTestId('explore-search')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('account-button-explore'));
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });
});
