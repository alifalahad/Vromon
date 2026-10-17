import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useRef, type RefObject } from 'react';

/**
 * Opens and closes a BottomSheetModal from a boolean (a `visible` flag or a
 * selected item), and returns the handler for the modal's `onDismiss`.
 *
 * @gorhom/bottom-sheet 5.2 must never be asked to dismiss a sheet that isn't
 * open: dismissing one that never opened (on mount) or that the user already
 * swiped away leaves it "dismissing", and every later present() is ignored.
 */
export function useSheetPresentation(ref: RefObject<BottomSheetModal | null>, open: boolean, onClosed: () => void) {
  const presented = useRef(false);

  useEffect(() => {
    if (open) {
      ref.current?.present();
      presented.current = true;
    } else if (presented.current) {
      ref.current?.dismiss();
      presented.current = false;
    }
  }, [open, ref]);

  return useCallback(() => {
    presented.current = false; // before the parent clears `open`
    onClosed();
  }, [onClosed]);
}
