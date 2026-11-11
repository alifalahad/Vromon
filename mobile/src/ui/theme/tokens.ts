/**
 * Semantic colour, shape and type tokens.
 *
 * Dark values come from the reference screenshots (prompt §5.1). Where a sampled
 * value fails WCAG AA as text, the token used for text is tuned and the sampled
 * value is kept in a comment. `accent` stays the sampled #3379F3 because it is a
 * fill colour (FAB, Apply, active tab); text-on-background uses `link`.
 */

export type ColorScheme = 'light' | 'dark';

export type ThemeColors = {
  bg: string;
  surface: string;
  surfaceRaised: string;
  surfaceInset: string;
  segmentThumb: string;
  border: string;
  divider: string;
  accent: string;
  /** Fill for selected chips/options behind accent-coloured content */
  accentSoft: string;
  /** Text and icons on an `accent` fill */
  onAccent: string;
  /** Accent-coloured text on bg/surface (AA) */
  link: string;
  /** Accent-coloured text on an `accentSoft` fill (Apply, small buttons, chips): AA over any surface */
  onAccentSoft: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
  /** Overlay behind sheets and dialogs */
  scrim: string;
  /** Floating controls over the map (capsule, round buttons, dock): translucent, see contrast.test.ts */
  glass: string;
  glassBorder: string;
  /** Filled buttons with white text: `accent` is only 4.1:1 under white in dark mode */
  accentStrong: string;
  /** Chat: your own bubbles, with `onAccent` text (white on `accent` would fail AA at 16 px) */
  bubbleMine: string;
  /** Chat: other people's bubbles, with `textPrimary` text */
  bubbleTheirs: string;
  /** Chat: cards you sent (trip, place, idea, poll), with `textPrimary` and `cardMineText2` text */
  cardMine: string;
  cardMineText2: string;
  /** The small capitals over a card you sent ("TRIP PLAN") */
  cardEyebrowMine: string;
  /** Buttons on a card you sent ("Open plan"), with `textPrimary` text */
  cardButtonMine: string;
  /** A switch's track when off: 3:1 against `surface` (and `bg`), so the white thumb shows on a card */
  switchOff: string;
  shadow: string;
};

/** Names over other people's bubbles in a trip room, one per person; each 4.5:1 on `bubbleTheirs` (contrast.test.ts) */
export const SENDER_NAMES = {
  dark: ['#7FD6BE', '#D7A6F0', '#F2B13C', '#8AB4F8', '#F4978E', '#A5D67F'],
  light: ['#0B6650', '#7A3B9C', '#7A5000', '#1F55B8', '#A8352A', '#3A6420'],
} as const;

export const darkColors: ThemeColors = {
  bg: '#262626',
  surface: '#333333',
  surfaceRaised: '#454545',
  surfaceInset: '#1F1F1F',
  segmentThumb: '#5E5E60',
  border: '#4A4A4A',
  divider: '#4A4A4A',
  accent: '#3379F3',
  accentSoft: 'rgba(51, 121, 243, 0.20)',
  onAccent: '#FFFFFF',
  link: '#6EA0F6',
  onAccentSoft: '#8AB4F8', // link is 3.9:1 on accentSoft over surface
  textPrimary: '#F2F2F2',
  textSecondary: '#B2B2B2',
  textTertiary: '#9C9C9C', // sampled #858585 is 3.4:1 on surface
  success: '#4CAF50',
  successBg: 'rgba(76, 175, 80, 0.16)',
  warning: '#F2B13C',
  warningBg: 'rgba(242, 177, 60, 0.16)',
  danger: '#F07A72',
  dangerBg: 'rgba(240, 122, 114, 0.16)',
  scrim: 'rgba(0, 0, 0, 0.6)',
  glass: 'rgba(23, 27, 34, 0.9)', // 0.86 (mockups) lets link text drop to 4.3:1 over a white map
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  accentStrong: '#2D6AE3',
  bubbleMine: '#2D6AE3',
  bubbleTheirs: '#333333',
  cardMine: '#2B3B5C',
  cardMineText2: '#C9D6EE',
  cardEyebrowMine: '#A9C6FA',
  cardButtonMine: 'rgba(255, 255, 255, 0.12)',
  switchOff: '#8A8A8A',
  shadow: '#000000',
};

export const lightColors: ThemeColors = {
  bg: '#F5F5F5',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceInset: '#E8E8EA',
  segmentThumb: '#FFFFFF',
  border: '#E0E0E0',
  divider: '#DADADA',
  accent: '#2563D9',
  accentSoft: 'rgba(37, 99, 217, 0.12)',
  onAccent: '#FFFFFF',
  link: '#245FD0',
  onAccentSoft: '#1F55C0', // link (#245FD0) is 4.1:1 on accentSoft over surfaceInset
  textPrimary: '#111111',
  textSecondary: '#5C5C5C',
  textTertiary: '#676767', // AA on surfaceInset too
  success: '#2B742E',
  successBg: 'rgba(43, 116, 46, 0.10)',
  warning: '#A74D08',
  warningBg: 'rgba(167, 77, 8, 0.10)',
  danger: '#C62828',
  dangerBg: 'rgba(198, 40, 40, 0.10)',
  scrim: 'rgba(0, 0, 0, 0.45)',
  glass: 'rgba(255, 255, 255, 0.92)',
  glassBorder: 'rgba(0, 0, 0, 0.08)',
  accentStrong: '#2563D9',
  bubbleMine: '#2563D9',
  // White bubbles would melt into the light background
  bubbleTheirs: '#E8E8EA',
  cardMine: '#E3EBFA',
  cardMineText2: '#5C5C5C',
  cardEyebrowMine: '#1F55C0',
  cardButtonMine: '#FFFFFF',
  switchOff: '#8E8E93',
  shadow: '#000000',
};

export const radius = {
  card: 24,
  sheet: 24,
  control: 12,
  chip: 999,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const },
  title: { fontSize: 22, fontWeight: '700' as const },
  headline: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  callout: { fontSize: 15, fontWeight: '400' as const },
  footnote: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  tabLabel: { fontSize: 14, fontWeight: '500' as const },
};

export const sizes = {
  fab: 64,
  mapButton: 64,
  tabIcon: 28,
  minTouch: 48,
} as const;

export type Theme = {
  scheme: ColorScheme;
  colors: ThemeColors;
  radius: typeof radius;
  spacing: typeof spacing;
  type: typeof type;
  sizes: typeof sizes;
};

export const darkTheme: Theme = { scheme: 'dark', colors: darkColors, radius, spacing, type, sizes };
export const lightTheme: Theme = { scheme: 'light', colors: lightColors, radius, spacing, type, sizes };
