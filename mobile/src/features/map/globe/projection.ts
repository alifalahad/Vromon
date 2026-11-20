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

/** How far out the flat map may go before its size is known (it's the globe's resting zoom after) */
export const FLAT_MIN_ZOOM = 1.0;
/** Zoom levels over which the flat map curves into the globe while zooming out (as Apple Maps does) */
export const MORPH_ZOOMS = 1.5;
/** The first part of the curve: the flat (Mercator) map turns azimuthal, the shape the globe grows from */
export const FLAT_STAGE = 0.3;
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
  'worklet';
  return { cx: width / 2, cy: height * 0.47, r: Math.max(80, Math.min(width / 2 - 8, height * 0.3)) };
}

/*
 * The zoom out, as in Apple Maps: one camera (centre and zoom) for the flat map and the globe, and
 * the picture curves from one into the other as the zoom goes down, so nothing pops or jumps.
 *
 * Zoomed in from `globeZoom + MORPH_ZOOMS` it's the flat map (MapLibre, Mercator). Below that the
 * globe's own picture is drawn over it, first exactly as the flat map (so the hand-over can't be
 * seen), then turning azimuthal (still flat, now round about the centre: stage a), then bulging
 * into the sphere (stage b) until, at `globeZoom`, it's the globe at rest. Pinching out further
 * shrinks the globe; pinching in plays it all backwards and hands the flat map back where it was.
 */

/** The flat map's zoom at which the globe is its resting size (its circumference is the world's width). */
export function globeZoom(restRadius: number): number {
  'worklet';
  return Math.max(FLAT_MIN_ZOOM, equivalentZoom(restRadius));
}

export type Morph = {
  /** 0: the flat map … 1: the globe */
  s: number;
  /** Mercator → azimuthal */
  a: number;
  /** Azimuthal → the sphere */
  b: number;
};

export function smoothstep(e0: number, e1: number, x: number): number {
  'worklet';
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** How far the morph has gone at this zoom, for a globe that rests at `zEnd`. */
export function morphAt(z: number, zEnd: number): Morph {
  'worklet';
  const s = Math.max(0, Math.min(1, (zEnd + MORPH_ZOOMS - z) / MORPH_ZOOMS));
  return { s, a: smoothstep(0, FLAT_STAGE, s), b: smoothstep(FLAT_STAGE, 1, s) };
}

/** Everything that draws the morph for one camera (angles in radians, lengths in dp). */
export type MorphView = {
  lon0: number;
  lat0: number;
  /** Where the centre of the picture is on screen */
  cx: number;
  cy: number;
  /** dp per radian at the centre (the globe's radius once it's a globe) */
  r: number;
  /** The flat map's dp per radian of longitude (Mercator) */
  rm: number;
  a: number;
  b: number;
  /** The flat map's turn (its bearing), fading out as it becomes the globe */
  rot: number;
};

const MAX_MERC = 85.0511 * RAD;

/** Mercator's y for a latitude (radians), clamped where the flat map ends. */
export function merc(lat: number): number {
  'worklet';
  const l = Math.max(-MAX_MERC, Math.min(MAX_MERC, lat));
  return Math.log(Math.tan(Math.PI / 4 + l / 2));
}

export function invMerc(y: number): number {
  'worklet';
  return 2 * Math.atan(Math.exp(y)) - Math.PI / 2;
}

/**
 * The morph's view for a camera: the flat map's centre (degrees), zoom and bearing, on a map area
 * of `width` × `height`. In Mercator the scale at the centre is `rm / cos(lat)`; the picture keeps
 * that while it's flat, then eases to the globe's own scale (`rm`, the same at every latitude).
 */
export function morphView(lonDeg: number, latDeg: number, z: number, bearingDeg: number, zEnd: number, width: number, height: number): MorphView {
  'worklet';
  const { a, b } = morphAt(z, zEnd);
  const rest = restingView(width, height);
  const lat0 = latDeg * RAD;
  const rm = (512 * Math.pow(2, z)) / (2 * Math.PI);
  const r = rm * Math.pow(1 / Math.max(0.05, Math.cos(lat0)), 1 - b);
  return {
    lon0: lonDeg * RAD,
    lat0,
    cx: width / 2 + (rest.cx - width / 2) * b,
    cy: height / 2 + (rest.cy - height / 2) * b,
    r,
    rm,
    a,
    b,
    rot: bearingDeg * RAD * (1 - b),
  };
}

/**
 * While the picture bulges (stage b), a point `c` radians from the centre is drawn
 * `r · ((1 − b)·c + b·sin c)` from it: c (azimuthal) at b = 0, sin c (the globe) at b = 1.
 * Beyond `cutOf(b)` that stops growing, so the picture ends there (its outline).
 */
export function cutOf(b: number): number {
  'worklet';
  return b <= 0.5 ? Math.PI : Math.acos(-(1 - b) / b);
}

/** The picture's outline in units of r (1 for the globe). */
export function rimOf(b: number): number {
  'worklet';
  const c = cutOf(b);
  return (1 - b) * c + b * Math.sin(c);
}

export type MorphPoint = {
  x: number;
  y: number;
  /** Drawn at all (false: past the outline) */
  visible: boolean;
  /** cos of the distance from the centre: 1 at the centre, 0 at the globe's rim, below 0 behind it */
  front: number;
};

/** A point given in degrees, on screen, at any stage of the morph (the globe: same as `project`). */
export function projectMorph(lonDeg: number, latDeg: number, v: MorphView): MorphPoint {
  'worklet';
  const lam = wrapLon(lonDeg * RAD - v.lon0);
  const phi = latDeg * RAD;
  const s0 = Math.sin(v.lat0);
  const c0 = Math.cos(v.lat0);
  const front = Math.max(-1, Math.min(1, s0 * Math.sin(phi) + c0 * Math.cos(phi) * Math.cos(lam)));
  const c = Math.acos(front);
  // Clockwise from north, as seen from the centre
  const az = Math.atan2(Math.cos(phi) * Math.sin(lam), c0 * Math.sin(phi) - s0 * Math.cos(phi) * Math.cos(lam));
  let ox: number;
  let oy: number;
  let visible = true;
  if (v.b <= 0) {
    // Stage a: the flat map, turning azimuthal
    const mx = lam * v.rm;
    const my = -(merc(phi) - merc(v.lat0)) * v.rm;
    const ex = c * v.r * Math.sin(az);
    const ey = -c * v.r * Math.cos(az);
    ox = mx + (ex - mx) * v.a;
    oy = my + (ey - my) * v.a;
  } else {
    visible = c < cutOf(v.b);
    const rho = v.r * ((1 - v.b) * c + v.b * Math.sin(c));
    ox = rho * Math.sin(az);
    oy = -rho * Math.cos(az);
  }
  // The flat map's turn: map → screen
  const cr = Math.cos(v.rot);
  const sr = Math.sin(v.rot);
  return { x: v.cx + ox * cr + oy * sr, y: v.cy - ox * sr + oy * cr, visible, front };
}

/**
 * The place under a screen point at any stage of the morph, in degrees, or null past the outline.
 * The same steps as the shader in Globe.tsx (which can't run in tests), kept line for line.
 */
export function unprojectMorph(px: number, py: number, v: MorphView): [number, number] | null {
  'worklet';
  const dx = px - v.cx;
  const dy = py - v.cy;
  const cr = Math.cos(v.rot);
  const sr = Math.sin(v.rot);
  const qx = dx * cr - dy * sr;
  const qy = dx * sr + dy * cr;
  const rho = Math.hypot(qx, qy) / v.r;
  const az = Math.atan2(qx, -qy);
  const s0 = Math.sin(v.lat0);
  const c0 = Math.cos(v.lat0);
  const destination = (c: number): [number, number] => {
    const lat = Math.asin(Math.max(-1, Math.min(1, s0 * Math.cos(c) + c0 * Math.sin(c) * Math.cos(az))));
    const lon = Math.atan2(Math.sin(az) * Math.sin(c) * c0, Math.cos(c) - s0 * Math.sin(lat));
    return [lon, lat];
  };
  let lon: number;
  let lat: number;
  if (v.b <= 0) {
    const ym = Math.log(Math.tan(Math.PI / 4 + v.lat0 / 2)) - qy / v.rm;
    const m: [number, number] = [qx / v.rm, invMerc(ym)];
    const e = destination(Math.min(rho, Math.PI));
    lon = m[0] + v.a * wrapLon(e[0] - m[0]);
    lat = m[1] + (e[1] - m[1]) * v.a;
  } else {
    const cut = cutOf(v.b);
    if (rho >= rimOf(v.b)) return null;
    let c: number;
    if (v.b >= 1) c = Math.asin(Math.min(rho, 1));
    else {
      c = rho;
      for (let i = 0; i < 10; i++) {
        const f = (1 - v.b) * c + v.b * Math.sin(c) - rho;
        const df = 1 - v.b + v.b * Math.cos(c);
        c = Math.min(c - f / Math.max(df, 0.0001), cut);
      }
    }
    [lon, lat] = destination(c);
  }
  return [wrapLon(lon + v.lon0) / RAD, lat / RAD];
}

/** The globe's view (for `project` / `unproject`) once the morph is done. */
export function globeViewOf(v: MorphView): GlobeView {
  'worklet';
  return { lon0: v.lon0, lat0: v.lat0, cx: v.cx, cy: v.cy, r: v.r };
}

/**
 * Where the flat map's centre is from what it reports: the middle of the visible box (in
 * Mercator), so a padding the camera keeps can't shift it. Falls back to the camera's centre
 * when the box crosses the date line (its longitudes then span the world).
 */
export function viewCentre(center: [number, number], bounds: [number, number, number, number]): [number, number] {
  const [w, s, e, n] = bounds;
  const lat = n > s ? invMerc((merc(n * RAD) + merc(s * RAD)) / 2) / RAD : center[1];
  const lon = e > w && e - w < 300 ? (w + e) / 2 : center[0];
  return [lon, lat];
}

/** `to` moved by whole turns so it's within half a turn of `from` (degrees): the short way round. */
export function nearestLon(from: number, to: number): number {
  'worklet';
  return to + 360 * Math.round((from - to) / 360);
}
