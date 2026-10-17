import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { act, renderHook } from '@testing-library/react-native';

import { useSheetPresentation } from '../ui/useSheetPresentation';

function setup(initial: boolean) {
  const sheet = { present: jest.fn(), dismiss: jest.fn() };
  const ref = { current: sheet as unknown as BottomSheetModal };
  const onClosed = jest.fn();
  return { sheet, onClosed, render: () => renderHook(({ open }: { open: boolean }) => useSheetPresentation(ref, open, onClosed), { initialProps: { open: initial } }) };
}

describe('useSheetPresentation', () => {
  it('never dismisses a sheet that was not opened (that breaks later presents)', async () => {
    const { sheet, render } = setup(false);
    const hook = await render();
    expect(sheet.dismiss).not.toHaveBeenCalled();
    await hook.rerender({ open: true });
    expect(sheet.present).toHaveBeenCalledTimes(1);
  });

  it('dismisses an open sheet when closed from outside', async () => {
    const { sheet, render } = setup(false);
    const hook = await render();
    await hook.rerender({ open: true });
    await hook.rerender({ open: false });
    expect(sheet.dismiss).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss again after the user swiped the sheet away', async () => {
    const { sheet, onClosed, render } = setup(false);
    const hook = await render();
    await hook.rerender({ open: true });
    await act(async () => hook.result.current()); // the modal's onDismiss
    expect(onClosed).toHaveBeenCalled();
    await hook.rerender({ open: false });
    expect(sheet.dismiss).not.toHaveBeenCalled();
    await hook.rerender({ open: true });
    expect(sheet.present).toHaveBeenCalledTimes(2);
  });
});
