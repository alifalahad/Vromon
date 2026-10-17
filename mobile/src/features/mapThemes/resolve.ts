/**
 * The user's map theme selection, and what it resolves to on screen.
 *
 * A selection names three parts: a base-map style, a status palette and the
 * friend-comparison colours. Picking a Theme sets all three from one preset
 * (`theme:<id>` refers to that preset's own style or colours). Picking a Color or
 * Style afterwards replaces that part only and the selection becomes "Custom"
 * (prompt §6.6). The selection is stored on the account (`map_theme` in
 * /me/settings) by id, so catalog fixes reach existing users.
 */

import type { VisitStatus } from '../../types';
import type { ColorScheme } from '../../ui/theme';
import { COLORS, STYLES, THEMES, type BaseMapColors, type MapThemePreset, type Pattern, type Tier } from './catalog';
import { darken, mix } from './color';

export const THEME_REF = 'theme:';

export type UserMapTheme = {
  v: 1;
  /** Set while the selection is exactly a preset; absent = Custom */
  themeId?: string;
  /** A style id, or `theme:<id>` for a preset's own base map */
  styleId: string;
  /** A palette id, or `theme:<id>` for a preset's own status colours */
  colorsId: string;
  /** The preset whose comparison colours apply */
  compareId: string;
};

export type ResolvedBase = BaseMapColors & { pattern?: Pattern; terrain?: boolean; borderGlow?: boolean; patternImage?: string };

export type ResolvedMapTheme = {
  base: ResolvedBase;
  /** Fill colour per status, as drawn on land */
  status: Record<VisitStatus, string>;
  /** Statuses also drawn with an outline (the presets' Want to visit) */
  outline: Partial<Record<VisitStatus, string>>;
  /** Friend comparison fills: In common is already blended over land */
  compare: { you: string; friend: string; inCommon: string };
};

/** Presets: Want to visit = the visited colour at 35% over land plus an outline; Lived = 20% darker. */
export const WANT_FILL_OPACITY = 0.35;
export const LIVED_DARKEN = 0.2;

const preset = (id: string): MapThemePreset | undefined => THEMES.find((t) => t.id === id);
const presetRef = (ref: string) => (ref.startsWith(THEME_REF) ? preset(ref.slice(THEME_REF.length)) : undefined);

export function selectTheme(id: string): UserMapTheme {
  return { v: 1, themeId: id, styleId: THEME_REF + id, colorsId: THEME_REF + id, compareId: id };
}

export function selectColors(current: UserMapTheme, id: string): UserMapTheme {
  const { themeId: _theme, ...rest } = current;
  return { ...rest, colorsId: id };
}

export function selectStyle(current: UserMapTheme, id: string): UserMapTheme {
  const { themeId: _theme, ...rest } = current;
  return { ...rest, styleId: id };
}

export const DEFAULT_USER_MAP_THEME: UserMapTheme = selectTheme('default');

const validStyle = (ref: unknown) => typeof ref === 'string' && (!!presetRef(ref) || STYLES.some((s) => s.id === ref));
const validColors = (ref: unknown) => typeof ref === 'string' && (!!presetRef(ref) || COLORS.some((c) => c.id === ref));

/**
 * A stored selection (server or device) made safe: unknown ids, e.g. from a newer
 * app version's catalog, fall back to the Default theme's part.
 */
export function normalizeUserMapTheme(value: unknown): UserMapTheme {
  if (!value || typeof value !== 'object') return DEFAULT_USER_MAP_THEME;
  const v = value as Record<string, unknown>;
  if (typeof v.themeId === 'string' && preset(v.themeId)) return selectTheme(v.themeId);
  const fallback = DEFAULT_USER_MAP_THEME;
  const parts: UserMapTheme = {
    v: 1,
    styleId: validStyle(v.styleId) ? (v.styleId as string) : fallback.styleId,
    colorsId: validColors(v.colorsId) ? (v.colorsId as string) : fallback.colorsId,
    compareId: typeof v.compareId === 'string' && preset(v.compareId) ? v.compareId : fallback.compareId,
  };
  // All three parts from one preset is that preset, not Custom
  const whole = THEME_REF + parts.compareId;
  return parts.styleId === whole && parts.colorsId === whole ? selectTheme(parts.compareId) : parts;
}

export function sameMapTheme(a: UserMapTheme, b: UserMapTheme): boolean {
  return a.themeId === b.themeId && a.styleId === b.styleId && a.colorsId === b.colorsId && a.compareId === b.compareId;
}

function resolveBase(styleId: string, scheme: ColorScheme): ResolvedBase {
  const fromPreset = presetRef(styleId);
  if (fromPreset) {
    const { dark, ...light } = fromPreset.style;
    return scheme === 'dark' && dark ? dark : light;
  }
  const style = STYLES.find((s) => s.id === styleId) ?? STYLES[0];
  const { dark, land, water, border, label, labelHalo, pattern, terrain, borderGlow } = style;
  const colors = scheme === 'dark' && dark ? dark : { land, water, border, label, labelHalo };
  return { ...colors, pattern, terrain, borderGlow, patternImage: pattern ? `water-${style.id}` : undefined };
}

const visitedOf = (p: MapThemePreset, scheme: ColorScheme) => (scheme === 'dark' && p.visitedDark ? p.visitedDark : p.visited);

export function resolveMapTheme(selection: UserMapTheme, scheme: ColorScheme): ResolvedMapTheme {
  const base = resolveBase(selection.styleId, scheme);

  let status: Record<VisitStatus, string>;
  let outline: ResolvedMapTheme['outline'] = {};
  const colorsPreset = presetRef(selection.colorsId);
  if (colorsPreset) {
    const visited = visitedOf(colorsPreset, scheme);
    status = { visited, want: mix(base.land, visited, WANT_FILL_OPACITY), lived: darken(visited, LIVED_DARKEN) };
    outline = { want: visited };
  } else {
    const palette = COLORS.find((c) => c.id === selection.colorsId) ?? COLORS[0];
    status = { visited: palette.visited, want: palette.want, lived: palette.lived };
  }

  const comparePreset = preset(selection.compareId) ?? THEMES[0];
  const { friend, inCommon, inCommonOpacity } = comparePreset.compare;
  return {
    base,
    status,
    outline,
    compare: { you: visitedOf(comparePreset, scheme), friend, inCommon: mix(base.land, inCommon, inCommonOpacity) },
  };
}

/** The preset's name, or null for a Custom selection. */
export function mapThemeName(selection: UserMapTheme): string | null {
  return (selection.themeId && preset(selection.themeId)?.name) || null;
}

/** Highest tier among the selected parts (for the premium lock, decision D2). */
export function selectionTier(selection: UserMapTheme): Tier {
  const tiers: (Tier | undefined)[] = [
    presetRef(selection.styleId)?.tier ?? STYLES.find((s) => s.id === selection.styleId)?.tier,
    presetRef(selection.colorsId)?.tier ?? COLORS.find((c) => c.id === selection.colorsId)?.tier,
    preset(selection.compareId)?.tier,
  ];
  return tiers.includes('premium') ? 'premium' : 'free';
}
