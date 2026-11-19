/**
 * Line icons drawn as SVG strokes, exactly as the mockups draw them (docs/ui-refresh: frames 6 and 7,
 * and − and + from the new trip's frame): a 24 grid, round ends and corners, one stroke width per
 * icon. The icon font's glyphs are filled shapes of another weight, so where a frame draws its own
 * icon the app uses these. Hidden from screen readers, like every icon (icons.ts): the button
 * around one says what it does.
 */

import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type LineIconName =
  | 'trail'
  | 'pin'
  | 'friends'
  | 'check'
  | 'close'
  | 'chevronRight'
  | 'minus'
  | 'plus'
  | 'crosshair'
  | 'bus'
  | 'train'
  | 'plane'
  | 'car'
  | 'layers'
  | 'fullMap'
  | 'more'
  | 'cube'
  | 'fitDay'
  | 'grip'
  | 'arrowUp'
  | 'chevronLeft'
  | 'arrowRight'
  | 'invite'
  | 'calendar'
  | 'wallet';

/** Each icon's shapes and the stroke width its frame uses; `color` for the few filled parts */
const ICONS: Record<LineIconName, { width: number; draw: React.ReactNode | ((color: string) => React.ReactNode) }> = {
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
  // Getting there (frame NewTripGettingThere): where you start, and the ways there
  crosshair: {
    width: 2,
    draw: (color) => (
      <>
        <Circle cx={12} cy={12} r={6.5} />
        <Circle cx={12} cy={12} r={2} fill={color} />
        <Path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
      </>
    ),
  },
  bus: {
    width: 2,
    draw: (
      <>
        <Rect x={5} y={4} width={14} height={14} rx={3} />
        <Path d="M5 11h14M8 18v2M16 18v2M8.5 14.5h.01M15.5 14.5h.01" />
      </>
    ),
  },
  train: {
    width: 2,
    draw: (
      <>
        <Rect x={6} y={3} width={12} height={14} rx={3} />
        <Path d="M6 11h12M9 20l-2 2M15 20l2 2M9.5 14h.01M14.5 14h.01" />
      </>
    ),
  },
  plane: {
    width: 0,
    draw: (color) => (
      <Path
        fill={color}
        stroke="none"
        d="M12 3c.8 0 1.5.9 1.5 2.5V9l7 4v2l-7-2v4.5l2 1.5V21L12 20l-3.5 1v-2l2-1.5V13l-7 2v-2l7-4V5.5C10.5 3.9 11.2 3 12 3Z"
      />
    ),
  },
  car: { width: 2, draw: <Path d="M4 16h16v-3.5l-2-5A2 2 0 0 0 16.1 6H7.9A2 2 0 0 0 6 7.5l-2 5V16ZM5.5 16v2.5M18.5 16v2.5M4.5 12h15" /> },
  // The trip screen's row and its map options (frames 11 and 12)
  layers: { width: 1.9, draw: <Path d="M12 4l8 4.5-8 4.5-8-4.5L12 4ZM4 13l8 4.5 8-4.5" /> },
  fullMap: { width: 2, draw: <Path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /> },
  more: {
    width: 0,
    draw: (color) => (
      <>
        <Circle cx={12} cy={5} r={1.9} fill={color} stroke="none" />
        <Circle cx={12} cy={12} r={1.9} fill={color} stroke="none" />
        <Circle cx={12} cy={19} r={1.9} fill={color} stroke="none" />
      </>
    ),
  },
  cube: { width: 1.9, draw: <Path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5L12 12l8-4.5M12 12v9" /> },
  fitDay: {
    width: 1.9,
    draw: (
      <>
        <Path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
        <Circle cx={12} cy={12} r={2.5} />
      </>
    ),
  },
  // Six dots: a stop that can be moved (frames 13 and 14)
  grip: {
    width: 0,
    draw: (color) => (
      <>
        {[6, 12, 18].map((cy) => (
          <React.Fragment key={cy}>
            <Circle cx={9} cy={cy} r={1.7} fill={color} stroke="none" />
            <Circle cx={15} cy={cy} r={1.7} fill={color} stroke="none" />
          </React.Fragment>
        ))}
      </>
    ),
  },
  // "Release to move to …" (frames 13 and 14)
  arrowUp: { width: 2.2, draw: <Path d="M12 19V5m-6 6 6-6 6 6" /> },
  // The strip's left edge when it can scroll back (frame 14)
  chevronLeft: { width: 2.6, draw: <Path d="m15 6-6 6 6 6" /> },
  // "Open plan →" (frames 15 and 16)
  arrowRight: { width: 2.2, draw: <Path d="M5 12h14m-6-6 6 6-6 6" /> },
  // Invite friends to a trip: a person and a plus (frame 15)
  invite: {
    width: 1.9,
    draw: (
      <>
        <Circle cx={10} cy={8.5} r={3.2} />
        <Path d="M4 19c.6-3 3-4.7 6-4.7s5.4 1.7 6 4.7M19 7v6M16 10h6" />
      </>
    ),
  },
  // A day (frame 39, the day a cost was spent)
  calendar: {
    width: 1.9,
    draw: (
      <>
        <Rect x={4} y={5.5} width={16} height={14.5} rx={2.5} />
        <Path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
      </>
    ),
  },
  // The budget (frames 31–33: the budget row, "Spent today")
  wallet: {
    width: 1.9,
    draw: (
      <>
        <Path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3M4 7.5V17a2 2 0 0 0 2 2h14V8H6.5A2.5 2.5 0 0 1 4 7.5Z" />
        <Circle cx={16.5} cy={13.5} r={1.2} />
      </>
    ),
  },
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
      {typeof icon.draw === 'function' ? icon.draw(color) : icon.draw}
    </Svg>
  );
}
