import { ASSET_FINGERPRINT, STYLE_THUMBNAILS, WATER_PATTERNS } from '../features/mapThemes/assets.generated';
import { COLORS, STYLES, THEMES, type BaseMapColors, type MapStyle } from '../features/mapThemes/catalog';
import { contrast, darken, HEX, mix } from '../features/mapThemes/color';
import { EUROPE, previewBounds } from '../features/mapThemes/preview';
import {
  DEFAULT_USER_MAP_THEME,
  LIVED_DARKEN,
  mapThemeName,
  normalizeUserMapTheme,
  resolveMapTheme,
  selectColors,
  selectionTier,
  selectStyle,
  selectTheme,
  WANT_FILL_OPACITY,
} from '../features/mapThemes/resolve';

/** Same as fingerprint() in scripts/map-themes/build.py. */
function assetFingerprint(styles: readonly MapStyle[]): string {
  const parts = styles.map((s) =>
    [
      s.id,
      s.land,
      s.water,
      s.border,
      s.pattern ?? '',
      s.borderGlow ? 'glow' : '',
      s.dark ? `${s.dark.land}/${s.dark.water}/${s.dark.border}` : '',
    ].join(','),
  );
  // FNV-1a, 32-bit (the strings are ASCII, so char codes are the UTF-8 bytes)
  let h = 0x811c9dc5;
  for (const ch of parts.join(';')) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const near = (a: string, b: string, tolerance: number) => channels(a).every((v, i) => Math.abs(v - channels(b)[i]) <= tolerance);

// Every base map a user can end up with: the styles, the presets' own maps, and their dark variants
const BASE_MAPS: [string, BaseMapColors][] = [
  ...STYLES.flatMap((s): [string, BaseMapColors][] => [[`style ${s.id}`, s], ...(s.dark ? [[`style ${s.id} (dark)`, s.dark] as [string, BaseMapColors]] : [])]),
  ...THEMES.flatMap((t): [string, BaseMapColors][] => [
    [`theme ${t.id}`, t.style],
    ...(t.style.dark ? [[`theme ${t.id} (dark)`, t.style.dark] as [string, BaseMapColors]] : []),
  ]),
];

describe('map theme catalog', () => {
  it('uses valid 6-digit hex colours everywhere', () => {
    const colours: string[] = [
      ...THEMES.flatMap((t) => [...t.swatches, t.visited, t.visitedDark ?? t.visited, t.compare.friend, t.compare.inCommon]),
      ...COLORS.flatMap((c) => [c.visited, c.want, c.lived]),
      ...BASE_MAPS.flatMap(([, b]) => [b.land, b.water, b.border, b.label, b.labelHalo]),
    ];
    expect(colours.filter((c) => !HEX.test(c))).toEqual([]);
  });

  it.each([
    ['themes', THEMES],
    ['colors', COLORS],
    ['styles', STYLES],
  ] as const)('%s have unique ids the server accepts', (_, items) => {
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_-]{1,32}$/);
  });

  it('keeps the sampled reference values (prompt §7)', () => {
    expect(THEMES.map((t) => t.name)).toEqual(['Default', 'Midnight', 'Serenity', 'Rustic']);
    expect(THEMES.find((t) => t.id === 'rustic')).toMatchObject({
      swatches: ['#E8DEC3', '#DFCDA5', '#A28D78', '#587F6C', '#6B505F'],
      style: { land: '#EEE9D6', water: '#D4C7A4' },
    });
    expect(THEMES.find((t) => t.id === 'midnight')).toMatchObject({ style: { land: '#353229', water: '#24251F' }, visited: '#866F43' });
    expect(COLORS[0]).toMatchObject({ id: 'default', visited: '#B7268B', want: '#4094F6', lived: '#4712A2' });
    expect(COLORS.find((c) => c.id === 'burst')).toMatchObject({ visited: '#611A84', want: '#A7F377', lived: '#4091E3' });
    expect(STYLES.find((s) => s.id === 'pencil')).toMatchObject({ land: '#E1E1E1', water: '#B3B3B3', pattern: 'hatch' });
    expect(STYLES.find((s) => s.id === 'treasure')).toMatchObject({ pattern: 'dots' });
    expect(STYLES.find((s) => s.id === 'glow')).toMatchObject({ land: '#1E4F60', borderGlow: true });
    expect(STYLES.find((s) => s.id === 'odyssey')).toMatchObject({ terrain: true });
    expect(STYLES[0].dark).toMatchObject({ land: '#303030', water: '#1A1A1A' });
  });

  it('flags every value that was designed rather than sampled (decision D8)', () => {
    const derived = [...COLORS, ...STYLES].filter((i) => i.derived?.length).map((i) => i.id);
    expect(derived.sort()).toEqual(['cobalt', 'forest', 'intrepid', 'ivory', 'sage', 'sky']);
  });

  it('only Default is free (the lock UI is hidden behind a flag, decision D2)', () => {
    for (const items of [THEMES, COLORS, STYLES]) {
      expect(items.filter((i) => i.tier === 'free').map((i) => i.id)).toEqual(['default']);
    }
  });

  it.each(BASE_MAPS)('%s: labels meet WCAG AA against their halo and stay legible on land', (_, b) => {
    expect(contrast(b.label, b.labelHalo)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(b.label, b.land)).toBeGreaterThanOrEqual(3);
  });

  it('has a thumbnail for every style and a pattern image for every patterned style', () => {
    for (const s of STYLES) {
      expect(STYLE_THUMBNAILS[s.id]?.light).toBeDefined();
      if (s.dark) expect(STYLE_THUMBNAILS[s.id]?.dark).toBeDefined();
      if (s.pattern) expect(WATER_PATTERNS[`water-${s.id}`]).toBeDefined();
    }
  });

  it('generated assets match the catalog (run scripts/map-themes/build.py after changing a style)', () => {
    expect(assetFingerprint(STYLES)).toBe(ASSET_FINGERPRINT);
  });
});

describe('resolving a selection', () => {
  it('starts on the Default theme, named as in 13-settings-rows.jpg', () => {
    expect(DEFAULT_USER_MAP_THEME).toEqual(selectTheme('default'));
    expect(mapThemeName(DEFAULT_USER_MAP_THEME)).toBe('Default');
  });

  it('Default follows the appearance (04 in dark, the stripes in light)', () => {
    const dark = resolveMapTheme(DEFAULT_USER_MAP_THEME, 'dark');
    expect(dark.base).toMatchObject({ land: '#303030', water: '#1A1A1A' });
    expect(dark.status.visited).toBe('#F1AD48');
    const light = resolveMapTheme(DEFAULT_USER_MAP_THEME, 'light');
    expect(light.base).toMatchObject({ land: '#D9D9D9', water: '#A6A7A9' });
    expect(light.status.visited).toBe('#F08E35');
  });

  it('derives Want to visit (35% fill + outline) and Lived (darker) for the presets', () => {
    const r = resolveMapTheme(selectTheme('midnight'), 'dark');
    expect(r.status.visited).toBe('#866F43');
    expect(r.status.want).toBe(mix('#353229', '#866F43', WANT_FILL_OPACITY));
    expect(r.status.lived).toBe(darken('#866F43', LIVED_DARKEN));
    expect(r.outline).toEqual({ want: '#866F43' });
  });

  it('keeps every preset status distinguishable from land', () => {
    for (const t of THEMES) {
      for (const scheme of ['light', 'dark'] as const) {
        const r = resolveMapTheme(selectTheme(t.id), scheme);
        expect(r.status.visited).not.toBe(r.base.land);
        expect(r.status.lived).not.toBe(r.status.visited);
        expect(r.status.want).not.toBe(r.base.land);
      }
    }
  });

  it('renders Rustic "In common" as in 07 (about #AB898A)', () => {
    const r = resolveMapTheme(selectTheme('rustic'), 'light');
    expect(near(r.compare.inCommon, '#AB898A', 14)).toBe(true);
    expect(r.compare).toMatchObject({ you: '#A28D7A', friend: '#587F6C' });
  });

  it('a palette has its own three colours and no outline', () => {
    const r = resolveMapTheme(selectColors(DEFAULT_USER_MAP_THEME, 'wonder'), 'dark');
    expect(r.status).toEqual({ visited: '#3C87AE', want: '#B5BC9B', lived: '#89C591' });
    expect(r.outline).toEqual({});
  });

  it('picking a Color or Style after a Theme keeps the other parts and becomes Custom', () => {
    const rustic = selectTheme('rustic');
    const recoloured = selectColors(rustic, 'burst');
    expect(recoloured).toEqual({ v: 1, styleId: 'theme:rustic', colorsId: 'burst', compareId: 'rustic' });
    expect(mapThemeName(recoloured)).toBeNull();
    const restyled = selectStyle(recoloured, 'pencil');
    expect(restyled).toEqual({ v: 1, styleId: 'pencil', colorsId: 'burst', compareId: 'rustic' });
    const r = resolveMapTheme(restyled, 'light');
    expect(r.base).toMatchObject({ land: '#E1E1E1', pattern: 'hatch', patternImage: 'water-pencil' });
    expect(r.compare.friend).toBe('#587F6C');
  });

  it('makes stored selections safe', () => {
    expect(normalizeUserMapTheme(null)).toEqual(DEFAULT_USER_MAP_THEME);
    expect(normalizeUserMapTheme('rustic')).toEqual(DEFAULT_USER_MAP_THEME);
    expect(normalizeUserMapTheme({ themeId: 'serenity' })).toEqual(selectTheme('serenity'));
    // Unknown ids (a newer catalog) fall back part by part
    expect(normalizeUserMapTheme({ themeId: 'aurora', styleId: 'glow', colorsId: 'neon', compareId: 'rustic' })).toEqual({
      v: 1,
      styleId: 'glow',
      colorsId: 'theme:default',
      compareId: 'rustic',
    });
  });

  it('reports the highest tier in a selection', () => {
    expect(selectionTier(DEFAULT_USER_MAP_THEME)).toBe('free');
    expect(selectionTier(selectStyle(DEFAULT_USER_MAP_THEME, 'glow'))).toBe('premium');
    expect(selectionTier(selectTheme('midnight'))).toBe('premium');
  });
});

describe('preview framing', () => {
  it('shows Europe when there is nothing to frame', () => {
    expect(previewBounds([])).toEqual(EUROPE);
  });

  it('frames a single country with a minimum span', () => {
    const [w, s, e, n] = previewBounds([[90.3, 23.7]]);
    expect(e - w).toBeGreaterThanOrEqual(40);
    expect(n - s).toBeGreaterThanOrEqual(26);
    expect(w).toBeLessThan(90.3);
    expect(e).toBeGreaterThan(90.3);
  });

  it('stays inside the world', () => {
    const [w, s, e, n] = previewBounds([
      [-170, -50],
      [175, 70],
    ]);
    expect(w).toBeGreaterThanOrEqual(-180);
    expect(e).toBeLessThanOrEqual(180);
    expect(s).toBeGreaterThanOrEqual(-70);
    expect(n).toBeLessThanOrEqual(80);
  });
});
