/**
 * Moving a stop to another day (docs/ui-refresh step 8): the strip of days for 2, 7 and 30 days, which
 * chip a point lands on while the strip is scrolled, the fast lane, scrolling at an edge, and the stop
 * sheet's day picker for a 30-day trip.
 */

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Dimensions } from 'react-native';

import { chipAt, edgeDirection, edgeStep, maxOffset, offsetFor, stripGeometry, trackDay } from '../features/trips/plan/dropGeometry';
import { DropStrip, type StripDay } from '../features/trips/plan/DropStrip';
import { StopSheet } from '../features/trips/plan/StopSheet';
import type { DropTarget } from '../features/trips/plan/useStopDrag';
import i18n from '../i18n';
import type { ItineraryItem } from '../types';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../ui/haptics', () => ({
  haptic: jest.fn(),
  haptics: { success: jest.fn(), error: jest.fn(), light: jest.fn(), warning: jest.fn(), selection: jest.fn(), medium: jest.fn() },
}));

/** A trip from Fri 20 Nov, `n` days long (day 12 is Tue 1 Dec, as in frame 14) */
const trip = (n: number): StripDay[] =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 10, 20 + i));
    return { id: 100 + i + 1, day_number: i + 1, day_date: d.toISOString().slice(0, 10) };
  });

// A 390-wide phone at normal text size: the strip's chips are 342 wide in all
const PHONE = { width: 390, height: 844, scale: 3, fontScale: 1 };
const VIEW = 390 - 2 * 12 - 2 * 12;

beforeAll(() => Dimensions.set({ window: PHONE, screen: PHONE }));
beforeEach(async () => {
  await act(() => i18n.changeLanguage('en'));
});

describe('the strip, worked out', () => {
  it('2 days share the width; 7 and 30 days keep their width and scroll', () => {
    const two = stripGeometry(2, VIEW);
    expect(two.scrolls).toBe(false);
    expect(two.chip).toBe((VIEW - 8) / 2);
    expect(stripGeometry(4, VIEW).scrolls).toBe(false);
    const seven = stripGeometry(7, VIEW);
    expect(seven).toMatchObject({ scrolls: true, chip: 64, content: 7 * 64 + 6 * 8 });
    const thirty = stripGeometry(30, VIEW);
    expect(thirty).toMatchObject({ scrolls: true, chip: 64, content: 30 * 64 + 29 * 8 });
    // Large text: wider chips
    expect(stripGeometry(30, VIEW, 1.3).chip).toBe(83);
  });

  it('which chip a point lands on while the strip is scrolled', () => {
    const g = stripGeometry(30, VIEW);
    expect(chipAt(g, 10, 0)).toBe(0);
    // Scrolled by 400: the point 10 from the left is 410 along the chips, on day 6 (5 × 72 = 360 … 424)
    expect(chipAt(g, 10, 400)).toBe(5);
    // In the gap between two chips: the nearer one
    expect(chipAt(g, 66, 0)).toBe(0);
    expect(chipAt(g, 69, 0)).toBe(1);
    // Outside the strip: none
    expect(chipAt(g, -1, 0)).toBeNull();
    expect(chipAt(g, VIEW + 1, 0)).toBeNull();
    // Scrolled to the end, the last day sits at the right
    expect(chipAt(g, VIEW - 5, maxOffset(g))).toBe(29);
  });

  it('opens with the current day in the middle, as far as the ends allow', () => {
    const g = stripGeometry(30, VIEW);
    expect(offsetFor(g, 0)).toBe(0);
    expect(offsetFor(g, 14)).toBe(14 * 72 + 32 - VIEW / 2);
    expect(offsetFor(g, 29)).toBe(maxOffset(g));
  });

  it('the fast lane: the track stands for the whole trip', () => {
    expect(trackDay(30, 0, 300)).toBe(0);
    expect(trackDay(30, 95, 300)).toBe(9);
    expect(trackDay(30, 300, 300)).toBe(29);
    expect(trackDay(30, -20, 300)).toBe(0);
  });

  it('at an edge it scrolls, faster the longer the finger stays', () => {
    const g = stripGeometry(30, VIEW);
    expect(edgeDirection(g, VIEW - 10, 0)).toBe(1);
    expect(edgeDirection(g, 10, 0)).toBe(0); // already at the start
    expect(edgeDirection(g, 10, 100)).toBe(-1);
    expect(edgeDirection(g, VIEW / 2, 100)).toBe(0);
    expect(edgeDirection(stripGeometry(3, VIEW), VIEW - 10, 0)).toBe(0); // three days don't scroll
    expect(edgeStep(0)).toBeLessThan(edgeStep(500));
    expect(edgeStep(500)).toBeLessThan(edgeStep(1000));
    expect(edgeStep(60_000)).toBe(28);
  });
});

/** Lays the strip out as on a 390-wide phone: the card at (12, 48), the chips 42 into it, the track under them */
async function strip(days: StripDay[], currentId: number) {
  let target: DropTarget | null = null;
  const attach = jest.fn((t: DropTarget | null) => {
    target = t;
  });
  const view = await render(<DropStrip top={48} days={days} currentId={currentId} attach={attach} />);
  const layout = (id: string, l: { x: number; y: number; width: number; height: number }) =>
    fireEvent(screen.getByTestId(id), 'layout', { nativeEvent: { layout: l } });
  await act(async () => {
    layout('drop-days', { x: 12, y: 48, width: 366, height: 144 });
    layout('drop-chips', { x: 12, y: 42, width: VIEW, height: 66 });
    if (screen.queryByTestId('drop-track')) {
      layout('drop-track', { x: 12, y: 118, width: VIEW, height: 16 });
      layout('drop-track-bar', { x: 40, y: 6, width: 262, height: 4 });
    }
  });
  const get = () => target as unknown as DropTarget;
  return { get, attach, unmount: async () => view.unmount() };
}
// On screen: the chips run from x 24 to 366 at y 90–156; the track bar from x 64 to 326 at y ~166–182
const CHIPS_Y = 120;
const TRACK_Y = 172;
const trackX = (day: number) => 64 + ((day - 1 + 0.5) / 30) * 262;

describe('the strip on screen', () => {
  it('2 days: both share the width; the current one says so and is not a target', async () => {
    const days = trip(2);
    const { get } = await strip(days, 101);
    expect(screen.getByTestId('drop-day-1')).toHaveTextContent("Day 1It's here now");
    expect(screen.getByTestId('drop-day-2')).toHaveTextContent('Day 2Sat 21');
    expect(screen.queryByTestId('drop-track')).toBeNull();
    expect(screen.getByTestId('drop-status')).toHaveTextContent('Drop on a day to move it there');
    // Over the current day: nothing; over day 2: "Release to move to Day 2 · Sat 21"
    let day: number | null = 0;
    await act(async () => {
      day = get().dayAt(24 + 40, CHIPS_Y);
    });
    expect(day).toBeNull();
    await act(async () => {
      get().move(24 + VIEW - 40, CHIPS_Y);
    });
    expect(screen.getByTestId('drop-status')).toHaveTextContent('Release to move to Day 2 · Sat 21');
    await act(async () => {
      day = get().dayAt(24 + VIEW - 40, CHIPS_Y);
    });
    expect(day).toBe(102);
  });

  it('7 days: one row that scrolls, with the track', async () => {
    await strip(trip(7), 101);
    for (let n = 1; n <= 7; n++) expect(screen.getByTestId(`drop-day-${n}`)).toBeTruthy();
    expect(screen.getByTestId('drop-day-1')).toHaveTextContent('Day 1Here now');
    expect(screen.getByTestId('drop-track')).toHaveTextContent('Day 1Day 7');
  });

  it('30 days: the fast lane reaches day 12 in one slide, and the chip under the finger follows the scroll', async () => {
    const days = trip(30);
    const { get } = await strip(days, 101);
    expect(screen.getByTestId('drop-track')).toHaveTextContent('Day 1Day 30');

    // Passing straight up through the track picks nothing…
    await act(async () => {
      expect(get().move(trackX(15), TRACK_Y + 8)).toBe(true);
      get().move(trackX(15) + 2, TRACK_Y);
    });
    expect(screen.getByTestId('drop-status')).toHaveTextContent('Drop on a day to move it there');
    // …sliding along it does
    await act(async () => {
      get().move(trackX(12), TRACK_Y);
    });
    expect(screen.getByTestId('drop-status')).toHaveTextContent('Release to move to Day 12 · Tue 1 Dec');
    expect(screen.getByTestId('drop-day-12')).toHaveTextContent('Day 12Tue 1');

    // Day 12 is now in the middle of the strip: up on the chips, the middle is day 12 and one chip to the right is day 13
    let day: number | null = null;
    await act(async () => {
      day = get().dayAt(24 + VIEW / 2, CHIPS_Y);
    });
    expect(day).toBe(112);
    await act(async () => {
      day = get().dayAt(24 + VIEW / 2 + 72, CHIPS_Y);
    });
    expect(day).toBe(113);
  });

  it('30 days: resting at the right side scrolls on by itself, faster and faster', async () => {
    jest.useFakeTimers();
    try {
      const { get } = await strip(trip(30), 101);
      const right = 24 + VIEW - 10;
      // The day the line names, while the finger stays
      const dayNow = async () => Number(/Day (\d+)/.exec(String(screen.getByTestId('drop-status').props.children))?.[1]);
      await act(async () => {
        get().move(right, CHIPS_Y);
      });
      // Day 5 is under the finger at first (4 × 72 = 288 … 352)
      expect(screen.getByTestId('drop-status')).toHaveTextContent(/^Release to move to Day 5 · /);
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      const half = await dayNow();
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      const second = await dayNow();
      // Half a second on: day 9; another half second: day 16, more days in the same time
      expect(half).toBe(9);
      expect(second).toBe(16);
      expect(second - half).toBeGreaterThan(half - 5);
      // Moving off the strip leaves nothing chosen
      await act(async () => {
        expect(get().move(200, 600)).toBe(false);
      });
      expect(screen.getByTestId('drop-status')).toHaveTextContent('Drop on a day to move it there');
    } finally {
      jest.useRealTimers();
    }
  });

  it('opens with the days around the current one in view', async () => {
    const { get } = await strip(trip(30), 115);
    let day: number | null = null;
    // Day 15 is the current one, in the middle; the chip to its right is day 16
    await act(async () => {
      day = get().dayAt(24 + VIEW / 2 + 72, CHIPS_Y);
    });
    expect(day).toBe(116);
    expect(screen.getByTestId('drop-day-15')).toHaveTextContent('Day 15Here now');
  });

  it('hands itself to the drag while shown', async () => {
    const { attach, unmount } = await strip(trip(3), 101);
    expect(attach).toHaveBeenCalledWith(expect.objectContaining({ move: expect.any(Function), dayAt: expect.any(Function) }));
    await act(async () => unmount());
    expect(attach).toHaveBeenLastCalledWith(null);
  });
});

describe("the stop sheet's day picker", () => {
  const STOP = {
    id: 7,
    item_type: 'activity',
    title: 'Himchari National Park',
    start_time: '10:00',
    end_time: '11:00',
    duration_minutes: 60,
    cost: 100,
    travel_time_to_next: 0,
    distance_to_next: 0,
    recommendation_score: 0.5,
    recommendation_reasons: [],
    order_index: 1,
    currency: 'BDT',
    cost_source: 'data',
  } as unknown as ItineraryItem;

  it('holds all 30 days with their dates; the stop’s own day is shown but not offered', async () => {
    const onMoveDay = jest.fn();
    await render(
      <BottomSheetModalProvider>
        <StopSheet
          item={STOP}
          issues={[]}
          editable
          days={trip(30) as { id: number; day_number: number; day_date: string }[]}
          currentDayId={101}
          onClose={jest.fn()}
          onExplain={jest.fn()}
          onSwap={jest.fn()}
          onRemove={jest.fn()}
          onMoveDay={onMoveDay}
        />
      </BottomSheetModalProvider>,
    );
    await act(async () => fireEvent.press(await screen.findByTestId('stop-move-day')));
    expect(screen.getByTestId('move-day-here')).toHaveTextContent('Day 1Here now');
    expect(screen.getByTestId('move-day-here').props.accessibilityState).toMatchObject({ disabled: true });
    for (let n = 2; n <= 30; n++) expect(screen.getByTestId(`move-to-day-${n}`)).toBeTruthy();
    expect(screen.getByTestId('move-to-day-12').props.accessibilityLabel).toBe('Day 12, Tue 1');
    await act(async () => fireEvent.press(screen.getByTestId('move-to-day-12')));
    expect(onMoveDay).toHaveBeenCalledWith(STOP, 112);
  });
});
