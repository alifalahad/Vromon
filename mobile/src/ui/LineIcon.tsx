/**
 * Line icons drawn as SVG strokes, exactly as the mockups draw them (docs/ui-refresh: frames 6 and 7,
 * and − and + from the new trip's frame): a 24 grid, round ends and corners, one stroke width per
 * icon. The icon font's glyphs are filled shapes of another weight, so where a frame draws its own
 * icon the app uses these. Hidden from screen readers, like every icon (icons.ts): the button
 * around one says what it does.
 */

import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

export type LineIconName = 'trail' | 'pin' | 'friends' | 'check' | 'close' | 'chevronRight' | 'minus' | 'plus';

/** Each icon's shapes and the stroke width its frame uses */
const ICONS: Record<LineIconName, { width: number; draw: React.ReactNode }> = {
  // Two stops and the winding way between them (frame 6, Trip trails)
  trail: {
    width: 1.9,
    draw: (
      <>
        <Circle cx={6} cy={18} r={2.5} />
        <Circle cx={18} cy={6} r={2.5} />
        <Path d="M8.5 18H14a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h5.5" />
      </>
    ),
  },
  pin: {
    width: 1.9,
    draw: (
      <>
        <Path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21Z" />
        <Circle cx={12} cy={9.5} r={2.5} />
      </>
    ),
  },
  friends: {
    width: 1.9,
    draw: (
      <>
        <Circle cx={9} cy={8.5} r={3.2} />
        <Path d="M3 19c.6-3 3-4.7 6-4.7s5.4 1.7 6 4.7" />
        <Circle cx={17} cy={9.5} r={2.5} />
        <Path d="M17 14.4c2.2.3 3.7 1.7 4.1 4.1" />
      </>
    ),
  },
  check: { width: 3, draw: <Path d="M5 12.5l4.5 4.5L19 7.5" /> },
  close: { width: 2.2, draw: <Path d="M6 6l12 12M18 6L6 18" /> },
  chevronRight: { width: 2.2, draw: <Path d="M9 6l6 6-6 6" /> },
  minus: { width: 2.2, draw: <Path d="M6 12h12" /> },
  plus: { width: 2.2, draw: <Path d="M12 6v12M6 12h12" /> },
};

export function LineIcon({ name, size = 24, color, strokeWidth }: { name: LineIconName; size?: number; color: string; strokeWidth?: number }) {
  const icon = ICONS[name];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth ?? icon.width}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {icon.draw}
    </Svg>
  );
}
