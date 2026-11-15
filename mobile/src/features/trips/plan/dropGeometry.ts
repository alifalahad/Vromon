/**
 * Where a dragged stop can go to another day (docs/ui-refresh step 8, frames 13 and 14): the strip of
 * day chips at the top, the same height for any trip length.
 *
 * - When every chip fits side by side, they share the width (frame 13). Otherwise they keep their width
 *   and the strip scrolls (frame 14).
 * - The chips move while the strip scrolls, so which chip is under the finger is worked out from the
 *   strip's own place and how far it has scrolled, not from places measured once.
 * - A far day is as easy as a near one (D8): resting the finger at an edge scrolls the strip, faster
 *   the longer it stays; and the track under the chips is a fast lane, its length standing for the
 *   whole trip.
 */

/** A chip's width when the strip scrolls (frame 14), and the gap between chips */
export const CHIP_WIDTH = 64;
export const CHIP_GAP = 8;
/** A finger this close to the strip's left or right side scrolls it */
export const EDGE = 44;
/** Scrolling at an edge: px per frame at first, and at most */
const EDGE_START = 4;
const EDGE_MAX = 28;

export type StripGeometry = {
  count: number;
  /** The chips don't all fit: the strip scrolls (and has the fast lane) */
  scrolls: boolean;
  /** One chip's width */
  chip: number;
  gap: number;
  /** All the chips, side by side */
  content: number;
  /** What's visible */
  viewport: number;
};

/** The strip for `count` days in a `viewport` this wide; chips grow with large text (`scale`) */
export function stripGeometry(count: number, viewport: number, scale = 1): StripGeometry {
  const least = Math.round(CHIP_WIDTH * Math.max(1, scale));
  const fits = count * least + (count - 1) * CHIP_GAP <= viewport;
  const chip = fits ? (viewport - (count - 1) * CHIP_GAP) / count : least;
  return { count, scrolls: !fits, chip, gap: CHIP_GAP, content: count * chip + (count - 1) * CHIP_GAP, viewport };
}

export function maxOffset(g: StripGeometry): number {
  return Math.max(0, g.content - g.viewport);
}

export function clampOffset(g: StripGeometry, offset: number): number {
  return Math.min(maxOffset(g), Math.max(0, offset));
}

/**
 * The chip under a point `x` from the strip's left side, with the strip scrolled by `offset`. A point
 * in a gap belongs to the nearer chip, so the choice doesn't flicker between chips; outside the strip,
 * none.
 */
export function chipAt(g: StripGeometry, x: number, offset: number): number | null {
  if (x < 0 || x > g.viewport) return null;
  const at = x + offset;
  if (at < 0 || at > g.content) return null;
  return Math.min(g.count - 1, Math.max(0, Math.floor((at + g.gap / 2) / (g.chip + g.gap))));
}

/** How far to scroll so chip `i` is in the middle (as far as the ends allow) */
export function offsetFor(g: StripGeometry, i: number): number {
  return clampOffset(g, i * (g.chip + g.gap) + g.chip / 2 - g.viewport / 2);
}

/** The fast lane: a point `x` along a track `width` long stands for a day, the first at its left end and the last at its right */
export function trackDay(count: number, x: number, width: number): number {
  if (width <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor((x / width) * count)));
}

/** The part of the track that stands for what's in view */
export function trackThumb(g: StripGeometry, offset: number, width: number): { left: number; width: number } {
  if (g.content <= 0) return { left: 0, width };
  return { left: (offset / g.content) * width, width: Math.min(1, g.viewport / g.content) * width };
}

/** How far the strip scrolls each frame while the finger rests at an edge: slowly at first, faster the longer it stays */
export function edgeStep(ms: number): number {
  return Math.min(EDGE_MAX, EDGE_START + Math.max(0, ms) / 60);
}

/** Which way a finger at `x` from the strip's left side scrolls it: −1 back, 1 on, 0 not at all */
export function edgeDirection(g: StripGeometry, x: number, offset: number): -1 | 0 | 1 {
  if (!g.scrolls || x < 0 || x > g.viewport) return 0;
  if (x < EDGE && offset > 0) return -1;
  if (x > g.viewport - EDGE && offset < maxOffset(g)) return 1;
  return 0;
}
