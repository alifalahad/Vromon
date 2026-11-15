/**
 * "A time you're busy" (docs/ui-refresh step 6): From and To typed at any minute (TimeField), mistakes
 * said in words, "All day", the button saying what it will do, and a busy time changed after it's added.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ALL_DAY, BusySheet, busyProblem } from '../features/trips/new/BusySheet';
import i18n from '../i18n';
import type { BusyTime } from '../types';
import { timeOf } from '../ui/TimeField';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

const WINDOW = { start: '09:00', end: '22:00' };

async function renderSheet(initial: BusyTime | null = null) {
  const onSave = jest.fn();
  await render(<BusySheet visible startDate="2026-11-20" days={3} initial={initial} dayWindow={() => WINDOW} onSave={onSave} onClose={jest.fn()} />);
  return onSave;
}

const type = async (field: 'from' | 'to', hh: string, mm: string) => {
  await fireEvent.changeText(screen.getByTestId(`busy-${field}-h`), hh);
  await fireEvent.changeText(screen.getByTestId(`busy-${field}-m`), mm);
};
const button = () => screen.getByTestId('busy-save');

beforeEach(async () => {
  await act(() => i18n.changeLanguage('en'));
});

describe('a typed time', () => {
  it('reads hours and minutes, any minute, and knows an impossible one', () => {
    expect(timeOf({ h: '16', m: '10' })).toBe('16:10');
    expect(timeOf({ h: '7', m: '05' })).toBe('07:05');
    expect(timeOf({ h: '25', m: '70' })).toBe('invalid');
    expect(timeOf({ h: '23', m: '60' })).toBe('invalid');
    expect(timeOf({ h: '16', m: '' })).toBeNull();
    expect(timeOf({ h: '16', m: '1' })).toBeNull();
  });

  it('a mistake is said: impossible, ends before it starts, outside the day', () => {
    expect(busyProblem('16:10', '17:25', WINDOW)).toBeNull();
    expect(busyProblem('invalid', '17:25', WINDOW)).toBe('invalid');
    expect(busyProblem('18:00', '17:00', WINDOW)).toBe('endsBefore');
    expect(busyProblem('18:00', '18:00', WINDOW)).toBe('endsBefore');
    expect(busyProblem('22:30', '23:30', WINDOW)).toBe('outside');
    expect(busyProblem('06:00', '09:00', WINDOW)).toBe('outside');
    // Partly outside is fine: the part inside the day is kept free
    expect(busyProblem('21:00', '23:30', WINDOW)).toBeNull();
    expect(busyProblem('16:10', null, WINDOW)).toBeNull();
  });
});

describe('the busy time sheet', () => {
  it('types From and To at any minute, says how long, and the button says what it will do', async () => {
    const onSave = await renderSheet();
    await type('from', '16', '10');
    await type('to', '21', '45');
    expect(screen.getByTestId('busy-length')).toHaveTextContent('5 h 35 min');
    expect(button()).toHaveTextContent('Keep Day 1, 16:10 to 21:45 free');
    await fireEvent.changeText(screen.getByTestId('busy-label'), ' Wedding ');
    await fireEvent.press(button());
    expect(onSave).toHaveBeenCalledWith({ day: 1, start: '16:10', end: '21:45', label: 'Wedding' });
  });

  it('25:70 is said to be impossible, and nothing is saved', async () => {
    const onSave = await renderSheet();
    await type('from', '25', '70');
    expect(screen.getByTestId('busy-problem')).toHaveTextContent("That time doesn't exist");
    expect(button().props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(button());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('To before From is said in words', async () => {
    await renderSheet();
    await type('from', '18', '00');
    await type('to', '17', '00');
    expect(screen.getByTestId('busy-problem')).toHaveTextContent('It ends before it starts');
    expect(button().props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('outside the day is said, with the day’s hours', async () => {
    await renderSheet();
    await type('from', '22', '30');
    await type('to', '23', '30');
    expect(screen.getByTestId('busy-problem')).toHaveTextContent("That's outside your day (09:00–22:00): nothing is planned then anyway");
  });

  it('takes Bangla digits', async () => {
    const onSave = await renderSheet();
    await type('from', '১৬', '১০');
    await type('to', '১৭', '২৫');
    await fireEvent.press(button());
    expect(onSave).toHaveBeenCalledWith({ day: 1, start: '16:10', end: '17:25', label: null });
  });

  it('All day keeps the whole day free', async () => {
    const onSave = await renderSheet();
    await fireEvent.press(screen.getByTestId('busy-day-2'));
    await fireEvent(screen.getByTestId('busy-all-day'), 'valueChange', true);
    expect(button()).toHaveTextContent('Keep Day 2 free');
    await fireEvent.press(button());
    expect(onSave).toHaveBeenCalledWith({ day: 2, ...ALL_DAY, label: null });
  });

  it('opens on a busy time already added, to change it', async () => {
    const onSave = await renderSheet({ day: 2, start: '16:10', end: '17:25', label: 'Wedding' });
    expect(screen.getByTestId('busy-from-h')).toHaveDisplayValue('16');
    expect(screen.getByTestId('busy-to-m')).toHaveDisplayValue('25');
    expect(screen.getByTestId('busy-label')).toHaveDisplayValue('Wedding');
    expect(screen.getByTestId('busy-day-2').props.accessibilityState).toMatchObject({ selected: true });
    await type('to', '18', '40');
    await fireEvent.press(button());
    expect(onSave).toHaveBeenCalledWith({ day: 2, start: '16:10', end: '18:40', label: 'Wedding' });
  });

  it('speaks Bangla, in Bangla digits', async () => {
    await act(() => i18n.changeLanguage('bn'));
    await renderSheet({ day: 1, start: '16:10', end: '21:45', label: null });
    expect(screen.getByTestId('busy-from-h')).toHaveDisplayValue('১৬');
    expect(button()).toHaveTextContent('দিন ১, ১৬:১০ থেকে ২১:৪৫ ফাঁকা রাখুন');
  });
});
