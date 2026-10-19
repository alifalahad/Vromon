import { render } from '@testing-library/react-native';
import React, { useRef } from 'react';
import { BackHandler } from 'react-native';

import { useSheetPresentation } from '../ui/useSheetPresentation';

function Sheet({ open, dismiss }: { open: boolean; dismiss: jest.Mock }) {
  const ref = useRef({ present: jest.fn(), dismiss } as never);
  useSheetPresentation(ref, open, () => undefined);
  return null;
}

describe("Android's Back with a sheet open", () => {
  it('closes the sheet instead of leaving the screen, and only while it is open', async () => {
    const handlers: (() => boolean)[] = [];
    const remove = jest.fn();
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handlers.push(h as () => boolean);
      return { remove };
    });
    const dismiss = jest.fn();
    const view = await render(<Sheet open dismiss={dismiss} />);
    expect(handlers).toHaveLength(1);
    expect(handlers[0]()).toBe(true); // handled: the screen stays
    expect(dismiss).toHaveBeenCalled();

    await view.rerender(<Sheet open={false} dismiss={dismiss} />);
    expect(remove).toHaveBeenCalled(); // closed: Back goes back to leaving the screen
  });
});
