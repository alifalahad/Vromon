/**
 * Icons are skipped by screen readers (src/ui/icons.ts, friends and chat step 10): otherwise
 * TalkBack reads the icon font's glyph, as it did in menus and on cards. An icon that says
 * something itself still can.
 */

import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import '../ui/icons';

it('skips icons unless one says something itself', async () => {
  await render(
    <>
      <MaterialCommunityIcons name="magnify" testID="decoration" />
      <MaterialIcons name="search" testID="other-family" />
      <MaterialCommunityIcons name="check" importantForAccessibility="yes" accessibilityElementsHidden={false} accessibilityLabel="Done" testID="says" />
    </>,
  );
  // Hidden from screen readers, so only found when hidden elements are included
  expect(screen.queryByTestId('decoration')).toBeNull();
  expect(screen.getByTestId('decoration', { includeHiddenElements: true }).props.importantForAccessibility).toBe('no-hide-descendants');
  expect(screen.getByTestId('other-family', { includeHiddenElements: true }).props.importantForAccessibility).toBe('no-hide-descendants');
  expect(screen.getByTestId('says').props.importantForAccessibility).toBe('yes');
  expect(screen.getByLabelText('Done')).toBeTruthy();
});
