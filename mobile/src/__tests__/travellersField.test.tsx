/**
 * New trip, where and when (docs/ui-refresh step 4): the number of travellers you can type, and
 * the weekday alone under each date.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React, { useState } from 'react';

import { DateRangeFields } from '../features/trips/new/DateRangeFields';
import { MAX_TRAVELLERS } from '../features/trips/new/newTrip';
import { settleTravellers, TravellersField, typedTravellers } from '../features/trips/new/TravellersField';
import i18n from '../i18n';

function Harness({ start = 2, spy }: { start?: number; spy: jest.Mock }) {
  const [n, setN] = useState(start);
  return (
    <TravellersField
      value={n}
      onChange={(v) => {
        spy(v);
        setN(v);
      }}
    />
  );
}

const field = () => screen.getByTestId('travellers-value');
const typeIn = async (text: string) => {
  await fireEvent(field(), 'focus');
  await fireEvent.changeText(field(), text);
};
const leave = () => fireEvent(field(), 'blur');

beforeEach(async () => {
  await act(() => i18n.changeLanguage('en'));
});

describe('what a typed number means', () => {
  it('counts 1 to the largest at once, and waits on anything else', () => {
    expect(typedTravellers('12')).toBe(12);
    expect(typedTravellers('১২')).toBe(12);
    expect(typedTravellers(String(MAX_TRAVELLERS))).toBe(MAX_TRAVELLERS);
    expect(typedTravellers('0')).toBeNull();
    expect(typedTravellers('99')).toBeNull();
    expect(typedTravellers('')).toBeNull();
  });

  it('goes to the nearest allowed number when the field is left, and says why', () => {
    expect(settleTravellers('12', 2)).toEqual({ value: 12, note: null });
    expect(settleTravellers('0', 2)).toEqual({ value: 1, note: 'tooFew' });
    expect(settleTravellers('99', 2)).toEqual({ value: MAX_TRAVELLERS, note: 'tooMany' });
    expect(settleTravellers('', 4)).toEqual({ value: 4, note: 'kept' });
  });
});

describe('the travellers field', () => {
  it('is a labelled number field with its limits', async () => {
    await render(<Harness spy={jest.fn()} />);
    expect(field()).toHaveDisplayValue('2');
    expect(field().props.keyboardType).toBe('number-pad');
    expect(field().props.selectTextOnFocus).toBe(true);
    expect(field().props.accessibilityLabel).toBe('Travellers, from 1 to 50');
  });

  it('typing 12 counts at once', async () => {
    const spy = jest.fn();
    await render(<Harness spy={spy} />);
    await typeIn('12');
    expect(spy).toHaveBeenLastCalledWith(12);
    await leave();
    expect(field()).toHaveDisplayValue('12');
    expect(screen.queryByTestId('travellers-note')).toBeNull();
  });

  it('0 becomes 1 and 99 becomes 50 when the field is left, with a line saying so', async () => {
    const spy = jest.fn();
    await render(<Harness start={3} spy={spy} />);
    await typeIn('0');
    expect(spy).not.toHaveBeenCalled();
    await leave();
    expect(field()).toHaveDisplayValue('1');
    expect(screen.getByTestId('travellers-note')).toHaveTextContent('At least 1 traveller: set to 1');

    await typeIn('99');
    await leave();
    expect(field()).toHaveDisplayValue('50');
    expect(screen.getByTestId('travellers-note')).toHaveTextContent('At most 50 travellers: set to 50');
  });

  it('takes Bangla digits, and keeps the number when nothing is typed', async () => {
    const spy = jest.fn();
    await render(<Harness start={4} spy={spy} />);
    await typeIn('১২');
    expect(spy).toHaveBeenLastCalledWith(12);
    await leave();
    expect(field()).toHaveDisplayValue('12');

    await typeIn('');
    await leave();
    expect(field()).toHaveDisplayValue('12');
    expect(screen.getByTestId('travellers-note')).toHaveTextContent('Nothing typed: still 12');
  });

  it('− and + work after typing, from what was typed', async () => {
    const spy = jest.fn();
    await render(<Harness spy={spy} />);
    await typeIn('12');
    await fireEvent.press(screen.getByTestId('travellers-more'));
    expect(spy).toHaveBeenLastCalledWith(13);
    expect(field()).toHaveDisplayValue('13');

    // Out of range while typing: − counts down from the nearest allowed number
    await fireEvent.changeText(field(), '99');
    await fireEvent.press(screen.getByTestId('travellers-less'));
    expect(spy).toHaveBeenLastCalledWith(MAX_TRAVELLERS - 1);
    await leave();
    expect(field()).toHaveDisplayValue('49');
    expect(screen.queryByTestId('travellers-note')).toBeNull();
  });

  it('shows Bangla digits in Bangla', async () => {
    await act(() => i18n.changeLanguage('bn'));
    await render(<Harness start={12} spy={jest.fn()} />);
    expect(field()).toHaveDisplayValue('১২');
    expect(field().props.accessibilityLabel).toBe('ভ্রমণকারী, ১ থেকে ৫০ জন');
  });
});

describe('the weekday under each date', () => {
  const dates = <DateRangeFields start="2026-11-20" end="2026-11-22" today="2026-11-15" onChange={jest.fn()} />;

  it('is the weekday alone, in English', async () => {
    await render(dates);
    expect(screen.getByTestId('date-start-weekday')).toHaveTextContent(/^Friday$/);
    expect(screen.getByTestId('date-end-weekday')).toHaveTextContent(/^Sunday$/);
  });

  it('and in Bangla', async () => {
    await act(() => i18n.changeLanguage('bn'));
    await render(dates);
    expect(screen.getByTestId('date-start-weekday')).toHaveTextContent(/^শুক্রবার$/);
    expect(screen.getByTestId('date-end-weekday')).toHaveTextContent(/^রবিবার$/);
  });
});
