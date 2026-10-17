/**
 * Map theme catalog (prompt §7): complete Themes, status Colors and base-map Styles.
 *
 * Land, water and status values were sampled from the reference screenshots
 * (docs/design-reference/03–23, ±2 per channel). Border, label and halo colours
 * are tuned by us: the reference only describes them, and labels must pass the
 * contrast test in __tests__/mapThemes.test.ts. Values the screenshots cut off
 * are designed to fit the visible ones and listed in `derived` (decision D8);
 * the names of the two unnamed palettes and two unnamed styles are ours too.
 *
 * This file is pure data with no imports: scripts/map-themes/build.py loads it
 * to render the Style thumbnails and the water pattern tiles.
 */

export type Tier = 'free' | 'premium';
export type Pattern = 'hatch' | 'dots';

/** What the base map draws: land, water, borders and country labels. */
export type BaseMapColors = { land: string; water: string; border: string; label: string; labelHalo: string };

export type MapStyle = BaseMapColors & {
  id: string;
  name: string;
  tier: Tier;
  /** Water drawn with a pattern image (`fill-pattern`), e.g. Pencil's hatching */
  pattern?: Pattern;
  /** Hillshade from a raster-dem source (needs a connection) */
  terrain?: boolean;
  /** Borders drawn twice, the lower copy wide and blurred */
  borderGlow?: boolean;
  /** Dark-appearance variant: Default follows the Appearance setting */
  dark?: BaseMapColors;
  /** Fields designed to fit rather than sampled (decision D8) */
  derived?: readonly string[];
};

export type MapColors = {
  id: string;
  name: string;
  tier: Tier;
  visited: string;
  want: string;
  lived: string;
  derived?: readonly string[];
};

/** Friend comparison colours. `inCommon` renders at `inCommonOpacity` over land. */
export type CompareColors = { friend: string; inCommon: string; inCommonOpacity: number };

export type MapThemePreset = {
  id: string;
  name: string;
  tier: Tier;
  /** Card stripes, in order: land, water, visited/You, Friend, In common */
  swatches: readonly [string, string, string, string, string];
  /** What the preview renders (it differs from the stripes for the dark themes) */
  style: BaseMapColors & { dark?: BaseMapColors };
  /** Visited / You. Want to visit and Lived are derived from it (resolve.ts). */
  visited: string;
  visitedDark?: string;
  compare: CompareColors;
};

// ── Themes (03–07) ────────────────────────────────────────────────────────────

export const THEMES: readonly MapThemePreset[] = [
  {
    id: 'default',
    name: 'Default',
    tier: 'free',
    swatches: ['#D9D9D9', '#A6A7A9', '#F08E35', '#91C4BF', '#BDA5BD'],
    // Light appearance uses the stripe values; dark is what 04 renders
    style: {
      land: '#D9D9D9',
      water: '#A6A7A9',
      border: '#9E9E9E',
      label: '#262626',
      labelHalo: '#F2F2F2',
      dark: { land: '#303030', water: '#1A1A1A', border: '#4A4A4A', label: '#E6E6E6', labelHalo: '#1A1A1A' },
    },
    visited: '#F08E35',
    visitedDark: '#F1AD48',
    compare: { friend: '#91C4BF', inCommon: '#BDA5BD', inCommonOpacity: 0.6 },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    tier: 'premium',
    swatches: ['#1A1A1A', '#2B2B2B', '#866F43', '#636363', '#553F31'],
    style: { land: '#353229', water: '#24251F', border: '#1E1F1A', label: '#E8E2D0', labelHalo: '#1E1F1A' },
    visited: '#866F43',
    compare: { friend: '#636363', inCommon: '#553F31', inCommonOpacity: 0.6 },
  },
  {
    id: 'serenity',
    name: 'Serenity',
    tier: 'premium',
    swatches: ['#F1E5D5', '#AEBCC9', '#CFB5DC', '#7F8B8B', '#9C9C9C'],
    style: { land: '#EDEADB', water: '#A2B4C2', border: '#C4BEA8', label: '#3D3A33', labelHalo: '#FAF8F0' },
    visited: '#CFB5DC',
    compare: { friend: '#7F8B8B', inCommon: '#9C9C9C', inCommonOpacity: 0.6 },
  },
  {
    id: 'rustic',
    name: 'Rustic',
    tier: 'premium',
    swatches: ['#E8DEC3', '#DFCDA5', '#A28D78', '#587F6C', '#6B505F'],
    // 07 renders In common as #AB898A: #6B505F at about 60% over the land
    style: { land: '#EEE9D6', water: '#D4C7A4', border: '#C2B795', label: '#4A3F33', labelHalo: '#F7F3E6' },
    visited: '#A28D7A',
    compare: { friend: '#587F6C', inCommon: '#6B505F', inCommonOpacity: 0.6 },
  },
];

// ── Colors: status palettes (14–17), stripes Visited · Want to visit · Lived ──

export const COLORS: readonly MapColors[] = [
  { id: 'default', name: 'Default', tier: 'free', visited: '#B7268B', want: '#4094F6', lived: '#4712A2' },
  { id: 'wonder', name: 'Wonder', tier: 'premium', visited: '#3C87AE', want: '#B5BC9B', lived: '#89C591' },
  { id: 'calm', name: 'Calm', tier: 'premium', visited: '#BAB7D6', want: '#C8E5ED', lived: '#EABBB1' },
  { id: 'bright', name: 'Bright', tier: 'premium', visited: '#D95763', want: '#66E2E4', lived: '#7EE464' },
  { id: 'sunrise', name: 'Sunrise', tier: 'premium', visited: '#F4F47A', want: '#D779CD', lived: '#63D08C' },
  // Only the Lived stripe and "…st" are visible in 16; name and the other stripes are ours
  { id: 'forest', name: 'Forest', tier: 'premium', visited: '#2F6B4F', want: '#C9A95C', lived: '#972A49', derived: ['name', 'visited', 'want'] },
  { id: 'adrenaline', name: 'Adrenaline', tier: 'premium', visited: '#6BD771', want: '#4C3ADE', lived: '#EB9D38' },
  { id: 'sky', name: 'Sky', tier: 'premium', visited: '#72DDED', want: '#193972', lived: '#F5C451', derived: ['lived'] },
  { id: 'intrepid', name: 'Intrepid', tier: 'premium', visited: '#B5532F', want: '#777A43', lived: '#404179', derived: ['visited'] },
  { id: 'burst', name: 'Burst', tier: 'premium', visited: '#611A84', want: '#A7F377', lived: '#4091E3' },
  // The card after Burst (17): Visited and a purple edge of Want are visible
  { id: 'cobalt', name: 'Cobalt', tier: 'premium', visited: '#3068DF', want: '#5B1AA0', lived: '#F2A541', derived: ['name', 'want', 'lived'] },
];

// ── Styles: base maps (18–23) ─────────────────────────────────────────────────

export const STYLES: readonly MapStyle[] = [
  {
    id: 'default',
    name: 'Default',
    tier: 'free',
    // Light: the background map of 14–23 (water is an estimate). Dark: 02.
    land: '#EAECDE',
    water: '#A5D8F5',
    border: '#A3A797',
    label: '#2F3A40',
    labelHalo: '#F7F8F0',
    dark: { land: '#303030', water: '#1A1A1A', border: '#5A5A5A', label: '#E0E0E0', labelHalo: '#1A1A1A' },
  },
  { id: 'carbon', name: 'Carbon', tier: 'premium', land: '#242424', water: '#D6F6F3', border: '#9A9A9A', label: '#F0F0F0', labelHalo: '#141414' },
  { id: 'pencil', name: 'Pencil', tier: 'premium', land: '#E1E1E1', water: '#B3B3B3', border: '#8C8C8C', label: '#2B2B2B', labelHalo: '#F2F2F2', pattern: 'hatch' },
  { id: 'sahara', name: 'Sahara', tier: 'premium', land: '#FAF6DD', water: '#F2E5B8', border: '#D6C48E', label: '#5A4521', labelHalo: '#FFFDF2' },
  { id: 'azure', name: 'Azure', tier: 'premium', land: '#CADAF1', water: '#ADC6E5', border: '#8EA4C6', label: '#1F3150', labelHalo: '#EAF1FB' },
  { id: 'glow', name: 'Glow', tier: 'premium', land: '#1E4F60', water: '#18303A', border: '#8FDDE6', label: '#E6F8FA', labelHalo: '#122630', borderGlow: true },
  { id: 'bubble', name: 'Bubble', tier: 'premium', land: '#FAF8F9', water: '#DEDEEA', border: '#D3B3C4', label: '#4A3E4C', labelHalo: '#FFFFFF' },
  { id: 'glacier', name: 'Glacier', tier: 'premium', land: '#DEF3F8', water: '#FFFFFF', border: '#97B4BF', label: '#24434D', labelHalo: '#FFFFFF' },
  { id: 'blackout', name: 'Blackout', tier: 'premium', land: '#000000', water: '#212E25', border: '#41574A', label: '#D2D8D3', labelHalo: '#000000' },
  { id: 'treasure', name: 'Treasure', tier: 'premium', land: '#EEE8D8', water: '#ABCBCA', border: '#9A8AA8', label: '#4A3A28', labelHalo: '#F8F4EA', pattern: 'dots' },
  { id: 'midnight', name: 'Midnight', tier: 'premium', land: '#1F2636', water: '#0D1215', border: '#4A5672', label: '#D0D7E5', labelHalo: '#0D1215' },
  { id: 'odyssey', name: 'Odyssey', tier: 'premium', land: '#CCDCB8', water: '#DEF3F8', border: '#8DA176', label: '#2F3D24', labelHalo: '#F3F8EC', terrain: true },
  { id: 'rose', name: 'Rose', tier: 'premium', land: '#F7F6FB', water: '#E1D4DE', border: '#CDA9BE', label: '#57404F', labelHalo: '#FFFFFF' },
  // Two partly visible cards; names, borders and Ivory's water are ours
  { id: 'sage', name: 'Sage', tier: 'premium', land: '#EEF3EF', water: '#DFE6DE', border: '#AEBDB1', label: '#2E3C33', labelHalo: '#FFFFFF', derived: ['name', 'border'] },
  { id: 'ivory', name: 'Ivory', tier: 'premium', land: '#F4F5EF', water: '#CFDDE3', border: '#BABDAE', label: '#3A3D33', labelHalo: '#FFFFFF', derived: ['name', 'water', 'border'] },
];
