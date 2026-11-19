/**
 * Semantic colour, shape and type tokens.
 *
 * The values are the look approved on 2026-11-13 (docs/ui-refresh/prompts.md, "The look"):
 * navy text and hero cards, one blue for actions, one marigold highlight, white cards on a
 * cool grey ground. Every text and background pair used is checked in contrast.test.ts.
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
  /** The 1px line around a picture (theme thumbnails), so a pale one keeps its edge on any ground */
  hairline: string;
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
  /** The one dark card a screen leads with (the next trip, "Now", a total), with `onHero` text */
  hero: string;
  onHero: string;
  /** Second lines on the hero card */
  onHeroSecondary: string;
  /** Marigold, the one highlight (countdowns, "On now"): on the hero card or as a fill, never as text on white */
  highlight: string;
  /** Text on a marigold fill ("ON NOW") */
  onHighlight: string;
  /** On the hero card (UI refresh step 9, frames 15–17): the dashed line, a quiet button's ring, the budget meter and its track */
  heroLine: string;
  heroOutline: string;
  heroMeter: string;
  heroTrack: string;
  /** The hero card's white button and its text */
  heroButton: string;
  onHeroButton: string;
  /** A label over the picture at the top of the hero card */
  heroChip: string;
  /** The solid blue tint (the pill behind the selected tab, quiet blue buttons), with `onAccentSoft` text */
  accentTint: string;
  /** The Map tab's globe (UI refresh step 1, frame 2): the sky behind it, the glow at its rim, its shadow */
  globeSky: string;
  globeGlow: string;
  globeShadow: string;
  /** Explore (UI refresh step 12, frames 22–25): the "Your country | The world" switch's track */
  segmentTrack: string;
  /** A place you've marked, as a chip ("Visited", "Lived"): the warm tint and its text; the text also on a card */
  markTint: string;
  onMarkTint: string;
  /** Over a photo (Explore's cards and a district's picture): the shade at its foot, the text and second lines on it */
  photoShade: string;
  onPhoto: string;
  onPhotoSecondary: string;
  /** Link text on a white button over a photo or a map ("Open the map"), in both appearances */
  linkOnWhite: string;
  /** Settings (UI refresh step 13, frame 26): the panel of travel numbers on the hero card, and the lines between them */
  heroInset: string;
  heroInsetLine: string;
  /** On the trip (UI refresh step 15, frames 31 and 32): a link on the hero card ("Today ›"), and late words on it */
  heroLink: string;
  heroWarning: string;
  /** After the trip (UI refresh step 16, frame 33): a quiet button on the hero card ("Edit"), with `onHero` text */
  heroQuiet: string;
  /** Conditions (UI refresh step 17, frames 34 and 35): behind the next rain on the hero card, with `heroWarning` text */
  heroWarningTint: string;
  /** "By the hour" (frame 34): the temperature's line; the chance of rain under 60% (likely hours are `accent`) */
  chartTemp: string;
  chartRainSoft: string;
  /** Budget's five parts (UI refresh step 18, "The look"), always in this order, never by size, only for Budget */
  partGettingThere: string;
  partStay: string;
  partFood: string;
  partTickets: string;
  partLocal: string;
  /** Words inside a piece of the Budget bar: on getting there's blue, and on the other four */
  onPartGettingThere: string;
  onPart: string;
  /** On Budget's hero card (frame 37): the meter and its track; "left" in green and "over by" in coral, each with an icon */
  heroBar: string;
  heroBarTrack: string;
  heroGood: string;
  heroDanger: string;
};

/** Names over other people's bubbles in a trip room, one per person; each 4.5:1 on `bubbleTheirs` (contrast.test.ts) */
export const SENDER_NAMES = {
  dark: ['#7FD6BE', '#D7A6F0', '#F2B13C', '#8AB4F8', '#F4978E', '#A5D67F'],
  light: ['#0B6650', '#7A3B9C', '#7A5000', '#1F55B8', '#A8352A', '#3A6420'],
} as const;

export const darkColors: ThemeColors = {
  bg: '#0B111A',
  surface: '#141C28',
  surfaceRaised: '#1F2A3A',
  surfaceInset: '#1C2634',
  segmentThumb: '#33415A',
  border: '#253142',
  divider: '#253142',
  hairline: '#2E3B4F',
  accent: '#2F6BE6',
  accentSoft: 'rgba(47, 107, 230, 0.18)',
  onAccent: '#FFFFFF',
  link: '#8AB4F8',
  onAccentSoft: '#8AB4F8',
  textPrimary: '#EEF2F7',
  textSecondary: '#A9B4C3',
  textTertiary: '#8794A7',
  success: '#4CC38A',
  successBg: 'rgba(76, 195, 138, 0.16)',
  warning: '#F2B13C',
  warningBg: 'rgba(242, 177, 60, 0.16)',
  danger: '#F07A72',
  dangerBg: 'rgba(240, 122, 114, 0.16)',
  scrim: 'rgba(0, 0, 0, 0.6)',
  glass: 'rgba(15, 22, 33, 0.92)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  accentStrong: '#2F6BE6',
  bubbleMine: '#2F6BE6',
  bubbleTheirs: '#1C2634',
  cardMine: '#17284A',
  cardMineText2: '#B9C6DA',
  cardEyebrowMine: '#8AB4F8',
  cardButtonMine: 'rgba(255, 255, 255, 0.12)',
  switchOff: '#6E7C91',
  shadow: '#000000',
  hero: '#16233A',
  onHero: '#FFFFFF',
  onHeroSecondary: '#B9C6DA',
  highlight: '#FFB547',
  onHighlight: '#3B1E00',
  heroLine: '#3A4C69',
  heroOutline: '#5A6C8A',
  heroMeter: '#4CC38A',
  heroTrack: '#2A3B57',
  heroButton: '#FFFFFF',
  onHeroButton: '#0F1B2D',
  heroChip: 'rgba(11, 17, 26, 0.8)',
  accentTint: '#17284A',
  globeSky: '#070C15',
  globeGlow: '#4F7FD9',
  globeShadow: 'rgba(0, 0, 0, 0)',
  segmentTrack: '#1C2634',
  markTint: '#3D2A10',
  onMarkTint: '#FFC97A',
  photoShade: '#0F1B2D',
  onPhoto: '#FFFFFF',
  onPhotoSecondary: '#E3E9F2',
  linkOnWhite: '#1D4BB8',
  heroInset: '#1F3050',
  heroInsetLine: '#34496B',
  heroLink: '#8AB4F8',
  heroWarning: '#FFD08A',
  heroQuiet: 'rgba(255, 255, 255, 0.12)',
  heroWarningTint: 'rgba(255, 181, 71, 0.14)',
  chartTemp: '#EE8150',
  chartRainSoft: '#3D5F9E',
  partGettingThere: '#4C86F0',
  partStay: '#E0703C',
  partFood: '#1FA98C',
  partTickets: '#C98500',
  partLocal: '#D9628F',
  // White on this lighter blue is only 3.4:1 for the bar's small words: navy instead (contrast.test.ts)
  onPartGettingThere: '#0F1B2D',
  onPart: '#0F1B2D',
  heroBar: '#6FA0FF',
  heroBarTrack: 'rgba(111, 160, 255, 0.26)',
  heroGood: '#7BD8A5',
  heroDanger: '#FF9F96',
};

export const lightColors: ThemeColors = {
  bg: '#F3F5F9',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceInset: '#EEF1F6',
  segmentThumb: '#FFFFFF',
  border: '#E1E6EE',
  divider: '#E1E6EE',
  hairline: '#D5DCE7',
  accent: '#2459D6',
  accentSoft: 'rgba(36, 89, 214, 0.11)',
  onAccent: '#FFFFFF',
  link: '#1D4BB8',
  onAccentSoft: '#1D4BB8',
  textPrimary: '#0F1B2D',
  textSecondary: '#46546A',
  textTertiary: '#5F6C82',
  success: '#137A48', // the look's #157F4B is 4.45:1 on surfaceInset
  successBg: 'rgba(19, 122, 72, 0.12)',
  warning: '#8A5300',
  warningBg: 'rgba(178, 106, 0, 0.14)',
  danger: '#B3261E',
  dangerBg: 'rgba(179, 38, 30, 0.09)',
  scrim: 'rgba(15, 27, 45, 0.45)',
  glass: 'rgba(255, 255, 255, 0.94)',
  glassBorder: 'rgba(15, 27, 45, 0.06)',
  accentStrong: '#2459D6',
  bubbleMine: '#2459D6',
  // White bubbles would melt into the light background
  bubbleTheirs: '#E6EAF1',
  cardMine: '#E7EEFC',
  cardMineText2: '#46546A',
  cardEyebrowMine: '#1D4BB8',
  cardButtonMine: '#FFFFFF',
  switchOff: '#7C899C',
  shadow: '#0F1B2D',
  hero: '#0F1B2D',
  onHero: '#FFFFFF',
  onHeroSecondary: '#B9C6DA',
  highlight: '#FFB547',
  onHighlight: '#3B1E00',
  heroLine: '#3A4C69',
  heroOutline: '#5A6C8A',
  heroMeter: '#4CC38A',
  heroTrack: '#2A3B57',
  heroButton: '#FFFFFF',
  onHeroButton: '#0F1B2D',
  heroChip: 'rgba(15, 27, 45, 0.78)',
  accentTint: '#E7EEFC',
  globeSky: '#E9F1FA',
  globeGlow: '#FFFFFF',
  globeShadow: 'rgba(15, 27, 45, 0.16)',
  segmentTrack: '#E6EAF1',
  markTint: '#FFF1D9',
  onMarkTint: '#7A4300',
  photoShade: '#0F1B2D',
  onPhoto: '#FFFFFF',
  onPhotoSecondary: '#E3E9F2',
  linkOnWhite: '#1D4BB8',
  heroInset: '#1A2A42',
  heroInsetLine: '#2E405C',
  heroLink: '#8AB4F8',
  heroWarning: '#FFD08A',
  heroQuiet: 'rgba(255, 255, 255, 0.12)',
  heroWarningTint: 'rgba(255, 181, 71, 0.14)',
  chartTemp: '#E8703A',
  chartRainSoft: '#A9C0F0',
  partGettingThere: '#2459D6',
  partStay: '#E8703A',
  partFood: '#14A38B',
  partTickets: '#EDA100',
  partLocal: '#D9628F',
  onPartGettingThere: '#FFFFFF',
  onPart: '#0F1B2D',
  heroBar: '#6FA0FF',
  heroBarTrack: 'rgba(111, 160, 255, 0.26)',
  heroGood: '#7BD8A5',
  heroDanger: '#FF9F96',
};

export const radius = {
  card: 22,
  /** Sheets and the hero card */
  sheet: 28,
  hero: 28,
  control: 16,
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

/**
 * Anek Bangla Bold for titles and large numbers, in English and Bangla (D14). The file is bundled
 * and loaded in app/_layout.tsx before the splash screen leaves. Body text stays the phone's font.
 *
 * The file is already bold, so a style that uses it keeps `fontWeight: 'normal'`: on Android a
 * font loaded at run time has no bold variant, and asking for one falls back to the phone's font.
 */
export const fonts = { title: 'AnekBangla_700Bold' } as const;

export const type = {
  /** A tab's title ("Trips") */
  largeTitle: { fontSize: 32, fontWeight: 'normal' as const, fontFamily: fonts.title },
  /** A pushed screen's title, in the header */
  screenTitle: { fontSize: 24, fontWeight: 'normal' as const, fontFamily: fonts.title },
  /** A sheet's or a section's title */
  title: { fontSize: 22, fontWeight: 'normal' as const, fontFamily: fonts.title },
  /** The one large number a screen leads with */
  hero: { fontSize: 44, fontWeight: 'normal' as const, fontFamily: fonts.title },
  headline: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  callout: { fontSize: 15, fontWeight: '400' as const },
  footnote: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  tabLabel: { fontSize: 12.5, fontWeight: '500' as const },
};

export const sizes = {
  fab: 64,
  mapButton: 64,
  tabIcon: 24,
  minTouch: 48,
  /** A main button's height (fully round) */
  button: 52,
} as const;

/** Cards barely lift; things over a map and hero cards lift clearly */
export const depth = {
  card: { shadowColor: '#0F1B2D', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  raised: { shadowColor: '#0F1B2D', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
} as const;

export type Theme = {
  scheme: ColorScheme;
  colors: ThemeColors;
  radius: typeof radius;
  spacing: typeof spacing;
  type: typeof type;
  sizes: typeof sizes;
  depth: typeof depth;
};

export const darkTheme: Theme = { scheme: 'dark', colors: darkColors, radius, spacing, type, sizes, depth };
export const lightTheme: Theme = { scheme: 'light', colors: lightColors, radius, spacing, type, sizes, depth };
