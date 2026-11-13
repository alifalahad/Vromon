/**
 * "How was your trip?" (docs/trip-upgrades, step 7; D7-D9): the card from the trip's first day (one tap
 * rates), "Rate things one by one" (Mark all, then change a few; only what changed is sent; leaving with
 * changes asks), and the Trips tab's one-time card the day after a trip ends.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import TripReviewScreen from '../../app/trip/review/[id]';
import { usePreferences } from '../features/preferences/store';
import { TripDetails } from '../features/trips/plan/TripDetails';
import { RateTripReminder } from '../features/trips/review/RateTripReminder';
import { canRate, changes, draftOf, markAll, reminderTrip, sections, toggle } from '../features/trips/review/review';
import { TripReviewCard } from '../features/trips/review/TripReviewCard';
import i18n from '../i18n';
import { tripsApi } from '../services/api';
import type { ReviewThing, Trip, TripReviewIn, TripReviewResponse } from '../types';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockDispatch = jest.fn();
const mockGuard: { enabled: boolean; onLeave: ((e: { data: { action: unknown } }) => void) | null } = { enabled: false, onLeave: null };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({ id: '5' }),
  useNavigation: () => ({ dispatch: mockDispatch }),
}));
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (enabled: boolean, onLeave: (e: { data: { action: unknown } }) => void) => {
    mockGuard.enabled = enabled;
    mockGuard.onLeave = onLeave;
  },
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({
  haptic: jest.fn(),
  haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn(), medium: jest.fn() },
}));
jest.mock('../features/photos/PhotoStrip', () => ({ PhotoStrip: () => null }));
jest.mock('../components/FeedbackForm', () => ({ FeedbackForm: () => null }));
jest.mock('../services/api', () => ({
  ApiError: class ApiError extends Error {},
  tripsApi: { get: jest.fn(), review: jest.fn(), saveReview: jest.fn() },
  placesApi: { list: jest.fn(() => Promise.resolve([])) },
}));

const api = tripsApi as unknown as Record<string, jest.Mock>;

// "Today" is 5 Dec 2026 (only the date is fixed; timers stay real)
beforeAll(() => {
  jest.useFakeTimers({
    doNotFake: [
      'setTimeout',
      'setInterval',
      'clearTimeout',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'nextTick',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
    now: new Date(2026, 11, 5, 10, 0),
  });
});
afterAll(() => jest.useRealTimers());
beforeEach(async () => {
  jest.clearAllMocks();
  mockGuard.enabled = false;
  mockGuard.onLeave = null;
  usePreferences.setState({ rateReminderDismissed: [] });
  await act(() => i18n.changeLanguage('en'));
});

const trip = (extra: Partial<Trip> = {}): Trip =>
  ({
    id: 5,
    destination: 'Khulna',
    title: 'Khulna Trip',
    start_date: '2026-12-04',
    end_date: '2026-12-07',
    num_travelers: 2,
    total_budget: 30000,
    currency: 'BDT',
    status: 'generated',
    num_days: 4,
    created_at: '2026-11-01T00:00:00',
    user_id: 'me',
    stops: [],
    ...extra,
  }) as Trip;

const thing = (key: string, extra: Partial<ReviewThing>): ReviewThing => ({
  key,
  target_type: 'place',
  target_id: 1,
  item_id: 1,
  name: 'A place',
  day: 1,
  time: '09:00',
  meal: null,
  first_night: null,
  last_night: null,
  mode: null,
  verdict: null,
  comment: null,
  ...extra,
});

const ITEMS: ReviewThing[] = [
  thing('journey:2:', { target_type: 'journey', target_id: 2, item_id: null, name: 'Dhaka → Khulna', day: null, time: null, mode: 'bus' }),
  thing('place:11:101', { target_id: 11, item_id: 101, name: 'Shahid Hadis Park' }),
  thing('restaurant:7:102', { target_type: 'restaurant', target_id: 7, item_id: 102, name: 'Food Studio', meal: 'Lunch', time: '12:30' }),
  thing('place:12:201', { target_id: 12, item_id: 201, name: 'Rupsha Bridge', day: 2, time: '10:00' }),
  thing('hotel:3:', {
    target_type: 'hotel',
    target_id: 3,
    item_id: null,
    name: 'Hotel Royal',
    day: null,
    time: null,
    first_night: 1,
    last_night: 3,
    verdict: 'good',
    comment: 'Clean',
  }),
];
const REVIEW = (extra: Partial<TripReviewResponse> = {}): TripReviewResponse => ({ trip_id: 5, opens_on: '2026-12-04', review: null, items: ITEMS, ...extra });

async function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('the rules', () => {
  it('opens on the first day and stays open', () => {
    expect(canRate(trip(), '2026-12-03')).toBe(false);
    expect(canRate(trip(), '2026-12-04')).toBe(true);
    expect(canRate(trip(), '2027-03-01')).toBe(true);
  });

  it('"Mark all" sets only what isn\'t rated; tapping the chosen one again clears it', () => {
    const d = markAll(draftOf(ITEMS), 'good');
    expect(Object.values(d).map((x) => x.verdict)).toEqual(['good', 'good', 'good', 'good', 'good']);
    expect(d['hotel:3:'].comment).toBe('Clean');
    expect(markAll(draftOf(ITEMS), 'bad')['hotel:3:'].verdict).toBe('good');
    const t2 = toggle(toggle(d, 'place:11:101', 'bad'), 'place:11:101', 'bad');
    expect(t2['place:11:101'].verdict).toBeNull();
  });

  it('sends only what changed', () => {
    let d = markAll(draftOf(ITEMS), 'good');
    d = toggle(d, 'restaurant:7:102', 'bad');
    d = { ...d, 'restaurant:7:102': { ...d['restaurant:7:102'], comment: '  Cold food ' } };
    const sent = changes(ITEMS, d);
    expect(sent.map((s) => [s.target_type, s.target_id, s.item_id, s.verdict, s.comment])).toEqual([
      ['journey', 2, null, 'good', null],
      ['place', 11, 101, 'good', null],
      ['restaurant', 7, 102, 'bad', 'Cold food'],
      ['place', 12, 201, 'good', null],
    ]); // the hotel was already good: not sent
    // clearing the hotel sends it with nothing
    expect(changes(ITEMS, toggle(draftOf(ITEMS), 'hotel:3:', 'good'))).toEqual([
      { target_type: 'hotel', target_id: 3, item_id: null, verdict: null, comment: null },
    ]);
    expect(changes(ITEMS, draftOf(ITEMS))).toEqual([]);
  });

  it('groups getting there, each day, and where you stayed', () => {
    expect(sections(ITEMS).map((s) => [s.kind, s.day, s.items.length])).toEqual([
      ['journey', null, 1],
      ['day', 1, 2],
      ['day', 2, 1],
      ['stays', null, 1],
    ]);
  });

  it('the Trips tab asks the day after a trip ends, for two weeks, once', () => {
    const ended = trip({ end_date: '2026-12-04' });
    expect(reminderTrip([ended], '2026-12-04', [])).toBeNull(); // the last day itself: not yet
    expect(reminderTrip([ended], '2026-12-05', [])?.id).toBe(5); // the day after
    expect(reminderTrip([ended], '2026-12-18', [])?.id).toBe(5); // two weeks on
    expect(reminderTrip([ended], '2026-12-19', [])).toBeNull(); // then it stops asking
    expect(reminderTrip([ended], '2026-12-05', [5])).toBeNull(); // "Not now"
    expect(reminderTrip([trip({ end_date: '2026-12-04', status: 'draft' })], '2026-12-05', [])).toBeNull();
    const later = trip({ id: 6, end_date: '2026-12-03', destination: 'Sylhet' });
    expect(reminderTrip([later, ended], '2026-12-05', [])?.id).toBe(5); // the one that ended last
  });
});

describe('"How was your trip?" on the plan', () => {
  it("shows from the trip's first day only, for whoever went", async () => {
    api.review.mockResolvedValue(REVIEW());
    const view = await wrap(<TripDetails trip={trip({ start_date: '2026-12-06', end_date: '2026-12-08' })} ownerId="me" mine hasPlan />);
    await act(async () => {});
    expect(screen.queryByTestId('trip-review-card')).toBeNull(); // starts tomorrow
    await view.unmount();
    await wrap(<TripDetails trip={trip()} ownerId="me" mine hasPlan />);
    expect(await screen.findByTestId('trip-review-card')).toHaveTextContent(/How was your trip\?/);
    expect(api.review).toHaveBeenCalledWith(5, '2026-12-05');
  });

  it("a friend reading the trip (not in its room) doesn't get it", async () => {
    api.review.mockResolvedValue(REVIEW());
    await wrap(<TripDetails trip={trip()} ownerId="her" mine={false} hasPlan went={false} />);
    await act(async () => {});
    expect(screen.queryByTestId('trip-review-card')).toBeNull();
    expect(api.review).not.toHaveBeenCalled();
  });

  it('one tap rates the trip; then Edit adds a comment; "Rate things one by one" opens the list', async () => {
    api.review.mockResolvedValue(REVIEW());
    api.saveReview.mockImplementation((_id: number, body: { rating?: number; comment?: string | null }) =>
      Promise.resolve(REVIEW({ review: { rating: body.rating ?? 4, comment: body.comment ?? null, created_at: 'x', updated_at: 'y' } })),
    );
    await wrap(<TripReviewCard trip={trip()} />);
    await act(async () => fireEvent.press(await screen.findByTestId('trip-review-star-4')));
    expect(api.saveReview).toHaveBeenCalledWith(5, { rating: 4 }, '2026-12-05');
    const summary = await screen.findByTestId('trip-review-summary');
    expect(summary).toHaveTextContent(/Very good/);
    expect(screen.getByTestId('trip-review-card')).toHaveTextContent(/Only you see your rating/);
    expect(screen.getByTestId('trip-review-one-by-one')).toHaveTextContent(/Rate things one by one.*1 rated/); // the hotel

    await act(async () => fireEvent.press(screen.getByTestId('trip-review-edit')));
    await act(async () => fireEvent.press(screen.getByTestId('trip-review-edit-star-5')));
    await act(async () => fireEvent.changeText(screen.getByTestId('trip-review-comment'), ' The sea at sunset '));
    await act(async () => fireEvent.press(screen.getByTestId('trip-review-save')));
    expect(api.saveReview).toHaveBeenLastCalledWith(5, { rating: 5, comment: 'The sea at sunset' }, '2026-12-05');
    expect(await screen.findByTestId('trip-review-summary')).toHaveTextContent(/“The sea at sunset”/);

    await act(async () => fireEvent.press(screen.getByTestId('trip-review-one-by-one')));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/trip/review/[id]', params: { id: 5 } });
  });

  it('the stars are one adjustable control for screen readers', async () => {
    api.review.mockResolvedValue(REVIEW({ review: { rating: 3, comment: null, created_at: 'x', updated_at: 'y' } }));
    await wrap(<TripReviewCard trip={trip()} />);
    await act(async () => fireEvent.press(await screen.findByTestId('trip-review-edit')));
    const stars = screen.getByTestId('trip-review-edit-star');
    expect(stars.props.accessibilityRole).toBe('adjustable');
    expect(stars.props.accessibilityValue).toEqual({ min: 0, max: 5, now: 3, text: '3 of 5 stars, Good' });
    await act(async () => fireEvent(stars, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }));
    expect(screen.getByTestId('trip-review-edit-star').props.accessibilityValue.now).toBe(4);
  });
});

describe('Rate things one by one', () => {
  async function open(data = REVIEW()) {
    api.get.mockResolvedValue(trip());
    api.review.mockResolvedValue(data);
    await wrap(<TripReviewScreen />);
    return screen.findByTestId('review-save');
  }

  it('by day, with Good and Bad as a labelled pair', async () => {
    await open();
    expect(screen.getByText('Getting there')).toBeTruthy();
    expect(screen.getByText('Day 1 · Fri 4')).toBeTruthy();
    expect(screen.getByText('Day 2 · Sat 5')).toBeTruthy();
    expect(screen.getByText('Where you stayed')).toBeTruthy();
    expect(screen.getByTestId('review-row-journey:2:')).toHaveTextContent(/Dhaka → Khulna.*Bus/);
    expect(screen.getByTestId('review-row-restaurant:7:102')).toHaveTextContent(/Food Studio.*Lunch · 12:30/);
    expect(screen.getByTestId('review-row-hotel:3:')).toHaveTextContent(/Hotel Royal.*Nights 1–3/);
    const good = screen.getByTestId('review-good-hotel:3:');
    expect(good.props.accessibilityRole).toBe('radio');
    expect(good.props.accessibilityState).toEqual({ checked: true });
    expect(good.props.accessibilityHint).toBe('Tap again to clear');
    // its saved comment is open
    expect(screen.getByTestId('review-comment-hotel:3:').props.value).toBe('Clean');
    // nothing changed yet: nothing to save, nothing to ask when leaving
    expect(screen.getByTestId('review-save')).toBeDisabled();
    expect(mockGuard.enabled).toBe(false);
  });

  it('Mark all good, change two to bad with a comment: only what changed is sent', async () => {
    await open();
    await act(async () => fireEvent.press(screen.getByTestId('review-mark-good')));
    await act(async () => fireEvent.press(screen.getByTestId('review-bad-journey:2:')));
    await act(async () => fireEvent.press(screen.getByTestId('review-add-comment-journey:2:')));
    await act(async () => fireEvent.changeText(screen.getByTestId('review-comment-journey:2:'), 'The bus was late'));
    await act(async () => fireEvent.press(screen.getByTestId('review-bad-restaurant:7:102')));
    await act(async () => fireEvent.press(screen.getByTestId('review-star-4')));
    expect(mockGuard.enabled).toBe(true);
    // like the server: what was sent is saved, with a new time
    api.saveReview.mockImplementation((_id: number, body: TripReviewIn) =>
      Promise.resolve(
        REVIEW({
          review: { rating: body.rating ?? null, comment: null, created_at: 'x', updated_at: 'saved' },
          items: ITEMS.map((i) => {
            const c = body.items?.find((x) => x.target_type === i.target_type && x.target_id === i.target_id && x.item_id === i.item_id);
            return c ? { ...i, verdict: c.verdict, comment: c.comment ?? null } : i;
          }),
        }),
      ),
    );
    await act(async () => fireEvent.press(screen.getByTestId('review-save')));
    expect(api.saveReview).toHaveBeenCalledWith(
      5,
      {
        rating: 4,
        items: [
          { target_type: 'journey', target_id: 2, item_id: null, verdict: 'bad', comment: 'The bus was late' },
          { target_type: 'place', target_id: 11, item_id: 101, verdict: 'good', comment: null },
          { target_type: 'restaurant', target_id: 7, item_id: 102, verdict: 'bad', comment: null },
          { target_type: 'place', target_id: 12, item_id: 201, verdict: 'good', comment: null },
        ],
      },
      '2026-12-05',
    ); // the hotel (already good, "Clean") and the trip's comment weren't touched: not sent
    // stays on the screen, saved (going back at that moment crashed react-native-screens on the phone)
    expect(await screen.findByTestId('review-saved')).toBeTruthy();
    expect(screen.getByText('Saved. Only you see it.')).toBeTruthy();
    expect(screen.getByTestId('review-save')).toBeDisabled(); // nothing left to save
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('leaving with changes asks once; Leave goes on', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await open();
    await act(async () => fireEvent.press(screen.getByTestId('review-good-place:11:101')));
    expect(mockGuard.enabled).toBe(true);
    await act(async () => mockGuard.onLeave?.({ data: { action: { type: 'GO_BACK' } } }));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe('Leave without saving?');
    buttons.find((b: { text: string }) => b.text === 'Leave').onPress();
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
    alert.mockRestore();
  });

  it('before the first day, says when it opens', async () => {
    api.get.mockResolvedValue(trip());
    api.review.mockRejectedValue(new Error('You can rate this trip from its first day, 4 Dec.'));
    await wrap(<TripReviewScreen />);
    expect(await screen.findByTestId('review-error')).toHaveTextContent('You can rate this trip from its first day, 4 Dec.');
  });
});

describe('the Trips tab, the day after a trip ends', () => {
  const ENDED = trip({ end_date: '2026-12-04' });

  it('asks once: Rate opens the list; Not now never asks again', async () => {
    api.review.mockResolvedValue(REVIEW());
    const view = await wrap(<RateTripReminder trips={[ENDED]} today="2026-12-05" />);
    expect(await screen.findByTestId('rate-reminder')).toHaveTextContent(/Rate your trip to Khulna\?/);
    await act(async () => fireEvent.press(screen.getByTestId('rate-reminder-rate')));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/trip/review/[id]', params: { id: 5 } });
    await act(async () => fireEvent.press(screen.getByTestId('rate-reminder-dismiss')));
    expect(screen.queryByTestId('rate-reminder')).toBeNull();
    expect(usePreferences.getState().rateReminderDismissed).toEqual([5]);
    await view.unmount();
    await wrap(<RateTripReminder trips={[ENDED]} today="2026-12-06" />);
    await act(async () => {});
    expect(screen.queryByTestId('rate-reminder')).toBeNull();
  });

  it('not on the last day, not after two weeks, not for a trip already rated', async () => {
    api.review.mockResolvedValue(REVIEW());
    const a = await wrap(<RateTripReminder trips={[ENDED]} today="2026-12-04" />);
    await act(async () => {});
    expect(screen.queryByTestId('rate-reminder')).toBeNull();
    await a.unmount();
    const b = await wrap(<RateTripReminder trips={[ENDED]} today="2026-12-19" />);
    await act(async () => {});
    expect(screen.queryByTestId('rate-reminder')).toBeNull();
    await b.unmount();
    api.review.mockResolvedValue(REVIEW({ review: { rating: 5, comment: null, created_at: 'x', updated_at: 'y' } }));
    await wrap(<RateTripReminder trips={[ENDED]} today="2026-12-05" />);
    await act(async () => {});
    expect(screen.queryByTestId('rate-reminder')).toBeNull();
  });
});
