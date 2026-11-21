/**
 * The globe's sizes (docs/ui-refresh step 1, docs/smooth-zoom).
 *
 * The Map tab's globe is MapLibre's own (MAP_STYLE's projection): one map at every zoom, which
 * curves into the globe as you zoom out, as in Apple Maps. GlobeImage (Globe.tsx) draws a still
 * one for "Your travels" and Explore.
 */

/** The most the globe tilts, so north stays up-ish: about 80° */
export const MAX_TILT = 1.4;

export function clampTilt(lat0: number): number {
  return Math.max(-MAX_TILT, Math.min(MAX_TILT, lat0));
}

/** The globe's place and size at rest, for a map area of this size: centred a little high, as in frame 2. */
export function restingView(width: number, height: number): { cx: number; cy: number; r: number } {
  return { cx: width / 2, cy: height * 0.47, r: Math.max(80, Math.min(width / 2 - 8, height * 0.3)) };
}

/**
 * The zoom at which MapLibre's globe is the size at rest (the earth button flies there). At zoom z
 * its radius is the flat world's width over 2π, 512·2^z / 2π dp, whatever latitude faces you; seen
 * in perspective it looks about 5% smaller (measured on the phone, 2026-11-22), which leaves a
 * margin either side.
 */
export function globeRestZoom(width: number, height: number): number {
  return Math.max(0, Math.log2((2 * Math.PI * restingView(width, height).r) / 512));
}
