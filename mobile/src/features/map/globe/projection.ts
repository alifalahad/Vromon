/**
 * The globe's maths (docs/ui-refresh step 1). The globe is a sphere seen from far away
 * (orthographic): the longitude `lon0` and latitude `lat0` face the viewer, and a point's
 * screen position is its rotated x and y times the radius. The shader in Globe.tsx does the same
 * rotation backwards, per pixel, to find which point of the flat world picture to show.
 *
 * Functions here run on the UI thread too (gestures, labels), so they're worklets.
 */

export type GlobeView = {
  /** Longitude facing the viewer, radians */
  lon0: number;
  /** Latitude facing the viewer, radians (north up) */
  lat0: number;
  /** Centre of the globe on screen, dp */
  cx: number;
  cy: number;
  /** Radius on screen, dp */
  r: number;
};

export type Projected = { x: number; y: number; /** towards the viewer: 1 at the centre, 0 at the rim */ z: number };

const RAD = Math.PI / 180;

/** Flat map zoom below which the map becomes the globe (while pinching out) */
export const GLOBE_FROM_ZOOM = 1.25;
/** How far out the flat map may go: still filling the screen, so no edge ever shows */
export const FLAT_MIN_ZOOM = 1.0;
/** The flat map's zoom when the globe hands back to it */
export const FLAT_FROM_GLOBE_ZOOM = 2.1;
/** The globe hands back to the flat map once it's this much bigger than at rest */
export const HAND_BACK_SCALE = 1.6;
/** The smallest the globe gets, as a share of its size at rest */
export const MIN_SCALE = 0.6;
/** The most the globe tilts, so north stays up-ish: about 80° */
export const MAX_TILT = 1.4;

export function clampTilt(lat0: number): number {
  'worklet';
  return Math.max(-MAX_TILT, Math.min(MAX_TILT, lat0));
}

/** Keeps a longitude in -π…π. */
export function wrapLon(lon: number): number {
  'worklet';
  const twoPi = Math.PI * 2;
  return ((((lon + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

/** A point given in degrees, on screen. `z` ≤ 0: on the far side. */
export function project(lonDeg: number, latDeg: number, v: GlobeView): Projected {
  'worklet';
  const lon = lonDeg * RAD - v.lon0;
  const lat = latDeg * RAD;
  // On the unit sphere, with the facing longitude turned to the front (z towards the viewer)
  const x = Math.cos(lat) * Math.sin(lon);
  const y = Math.sin(lat);
  const z = Math.cos(lat) * Math.cos(lon);
  // Tilt so lat0 comes to the centre
  const c = Math.cos(v.lat0);
  const s = Math.sin(v.lat0);
  const y2 = y * c - z * s;
  const z2 = y * s + z * c;
  return { x: v.cx + v.r * x, y: v.cy - v.r * y2, z: z2 };
}

/** The point under a screen position, in degrees, or null when it's off the globe. */
export function unproject(px: number, py: number, v: GlobeView): [number, number] | null {
  'worklet';
  const x = (px - v.cx) / v.r;
  const y = -(py - v.cy) / v.r;
  const d = x * x + y * y;
  if (d > 1) return null;
  const z = Math.sqrt(1 - d);
  // Undo the tilt
  const c = Math.cos(v.lat0);
  const s = Math.sin(v.lat0);
  const y1 = y * c + z * s;
  const z1 = -y * s + z * c;
  const lat = Math.asin(Math.max(-1, Math.min(1, y1)));
  const lon = wrapLon(Math.atan2(x, z1) + v.lon0);
  return [lon / RAD, lat / RAD];
}

/**
 * The flat map's zoom that shows land at the same scale: the globe's circumference is the width
 * of the whole flat world (512 dp at zoom 0). Used to pick which country names fit.
 */
export function equivalentZoom(radius: number): number {
  'worklet';
  return Math.log2((2 * Math.PI * radius) / 512);
}

/** The globe's place and size at rest, for a map area of this size: centred a little high, as in frame 2. */
export function restingView(width: number, height: number): { cx: number; cy: number; r: number } {
  return { cx: width / 2, cy: height * 0.47, r: Math.max(80, Math.min(width / 2 - 8, height * 0.3)) };
}
