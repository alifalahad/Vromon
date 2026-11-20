/**
 * The globe (docs/ui-refresh step 1): its projection, the hand-over to and from the flat map,
 * and which country a tap finds.
 */

import { countryAt } from '../features/map/globe/countryAt';
import {
  clampTilt,
  equivalentZoom,
  FLAT_MIN_ZOOM,
  globeViewOf,
  globeZoom,
  MAX_TILT,
  merc,
  MIN_SCALE,
  MORPH_ZOOMS,
  morphAt,
  morphView,
  nearestLon,
  project,
  projectMorph,
  restingView,
  unproject,
  unprojectMorph,
  viewCentre,
  wrapLon,
  type GlobeView,
} from '../features/map/globe/projection';

const RAD = Math.PI / 180;
const view = (lon0 = 0, lat0 = 0): GlobeView => ({ lon0: lon0 * RAD, lat0: lat0 * RAD, cx: 200, cy: 400, r: 150 });

describe('the projection', () => {
  it('puts the facing point at the centre, nearest the viewer', () => {
    const p = project(0, 0, view());
    expect(p.x).toBeCloseTo(200);
    expect(p.y).toBeCloseTo(400);
    expect(p.z).toBeCloseTo(1);
  });

  it('puts east to the right and north up', () => {
    expect(project(30, 0, view()).x).toBeGreaterThan(200);
    expect(project(0, 30, view()).y).toBeLessThan(400);
  });

  it('hides the far side', () => {
    expect(project(180, 0, view()).z).toBeCloseTo(-1);
    expect(project(100, 0, view()).z).toBeLessThan(0);
  });

  it('after a turn, the new facing point is at the centre (Dhaka, then from above the pole)', () => {
    const dhaka = project(90.4, 23.8, view(90.4, 23.8));
    expect(dhaka.x).toBeCloseTo(200);
    expect(dhaka.y).toBeCloseTo(400);
    expect(dhaka.z).toBeCloseTo(1);
    // Tilted to look at the north: the pole moves to the middle and the equator to the bottom edge
    const tilted = view(0, 60);
    expect(project(0, 60, tilted).y).toBeCloseTo(400);
    expect(project(0, 0, tilted).y).toBeGreaterThan(400);
  });

  it('turns a screen point back into the place under it, and nothing off the globe', () => {
    for (const v of [view(), view(90, 20), view(-120, -45)]) {
      for (const [lon, lat] of [
        [10, 5],
        [95, 30],
        [-130, -40],
      ]) {
        const p = project(lon, lat, v);
        if (p.z <= 0.05) continue;
        const back = unproject(p.x, p.y, v)!;
        expect(back[0]).toBeCloseTo(lon, 4);
        expect(back[1]).toBeCloseTo(lat, 4);
      }
    }
    expect(unproject(200 + 151, 400, view())).toBeNull();
  });

  it('keeps longitudes in range and the tilt short of the poles', () => {
    expect(wrapLon(Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2);
    expect(wrapLon(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2);
    expect(clampTilt(3)).toBe(MAX_TILT);
    expect(clampTilt(-3)).toBe(-MAX_TILT);
  });

  it('the globe at rest fits the screen, a little above the middle', () => {
    const r = restingView(390, 700);
    expect(r.r * 2).toBeLessThanOrEqual(390);
    expect(r.cy).toBeLessThan(350);
  });
});

describe('zooming out: the flat map curves into the globe (as Apple Maps does)', () => {
  // A phone's map area, the camera over Dhaka
  const W = 392;
  const H = 820;
  const zEnd = globeZoom(restingView(W, H).r);
  const zStart = zEnd + MORPH_ZOOMS;
  const at = (z: number, lon = 90.4, lat = 23.8, bearing = 0) => morphView(lon, lat, z, bearing, zEnd, W, H);
  // Where the flat map (Mercator, 512 dp at zoom 0) draws a place, for a camera at the centre of the screen
  const flat = (lon: number, lat: number, z: number, lon0 = 90.4, lat0 = 23.8) => {
    const rm = (512 * 2 ** z) / (2 * Math.PI);
    return { x: W / 2 + wrapLon((lon - lon0) * RAD) * rm, y: H / 2 - (merc(lat * RAD) - merc(lat0 * RAD)) * rm };
  };
  const places = [
    [90.4, 23.8],
    [88.4, 22.6],
    [77.2, 28.6],
    [100.5, 13.8],
    [103.8, 1.35],
    [114.2, 22.3],
    [55.3, 25.2],
  ] as const;

  it('ends with the globe at rest, as far out as the flat map goes', () => {
    expect(zEnd).toBeGreaterThanOrEqual(FLAT_MIN_ZOOM);
    const v = at(zEnd);
    expect(v.b).toBe(1);
    expect(v.r).toBeCloseTo(restingView(W, H).r, 5);
    expect(v.cy).toBeCloseTo(restingView(W, H).cy, 5);
    // At its smallest the flat world is still wider than a phone (512 dp at zoom 0)
    expect(512 * 2 ** zEnd).toBeGreaterThan(900);
    expect(MIN_SCALE).toBeLessThan(1);
  });

  it('starts exactly as the flat map, so the globe taking over can not be seen', () => {
    const v = at(zStart);
    expect(morphAt(zStart, zEnd).s).toBe(0);
    for (const [lon, lat] of places) {
      const p = projectMorph(lon, lat, v);
      const f = flat(lon, lat, zStart);
      expect(p.x).toBeCloseTo(f.x, 6);
      expect(p.y).toBeCloseTo(f.y, 6);
    }
  });

  it('is the globe itself at the end (same points as the globe always had)', () => {
    const v = at(zEnd);
    for (const [lon, lat] of places) {
      const p = projectMorph(lon, lat, v);
      const g = project(lon, lat, globeViewOf(v));
      expect(p.x).toBeCloseTo(g.x, 6);
      expect(p.y).toBeCloseTo(g.y, 6);
    }
  });

  it('moves every place a little at a time: no jump anywhere along the way, in or out', () => {
    const steps = 300;
    for (const [lon, lat] of places) {
      let prev = projectMorph(lon, lat, at(zStart + 0.2));
      for (let i = 1; i <= steps; i++) {
        const z = zStart + 0.2 - ((MORPH_ZOOMS + 0.4) * i) / steps;
        const p = projectMorph(lon, lat, at(z));
        // A 300th of the way never moves a place more than a few dp
        expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(6);
        prev = p;
      }
    }
  });

  it('turns the flat map back north-up as it becomes the globe', () => {
    expect(at(zStart, 90.4, 23.8, 40).rot).toBeCloseTo(40 * RAD);
    expect(at(zEnd, 90.4, 23.8, 40).rot).toBe(0);
    // Turned 90° (east up), a place east of the centre is above it on the flat map
    const p = projectMorph(100, 23.8, at(zStart, 90.4, 23.8, 90));
    expect(p.y).toBeLessThan(H / 2 - 50);
    expect(Math.abs(p.x - W / 2)).toBeLessThan(1);
  });

  it('draws what the screen shows: the shader finds the place under each point at every stage', () => {
    for (const z of [zStart, zStart - 0.15, zStart - 0.45, zStart - 0.8, zStart - 1.2, zEnd + 0.05, zEnd, zEnd - 0.4]) {
      for (const bearing of [0, 25]) {
        const v = at(z, 90.4, 23.8, bearing);
        const { a, b } = morphAt(z, zEnd);
        // Mid stage a the shader blends the two pictures in place (it's only passed through): close, not exact
        const exact = b > 0 || a === 0 || a === 1;
        for (const [lon, lat] of places) {
          const p = projectMorph(lon, lat, v);
          if (!p.visible || p.front < 0.2) continue;
          const back = unprojectMorph(p.x, p.y, v)!;
          expect(back).not.toBeNull();
          const err = Math.hypot(wrapLon((back[0] - lon) * RAD) / RAD, back[1] - lat);
          expect(err).toBeLessThan(exact ? 0.01 : 1.5);
        }
      }
    }
  });

  it('shows sky past the outline once it bulges, and nothing beyond the globe at the end', () => {
    const v = at(zEnd);
    expect(unprojectMorph(v.cx + v.r * 1.01, v.cy, v)).toBeNull();
    expect(unprojectMorph(v.cx + v.r * 0.99, v.cy, v)).not.toBeNull();
    // The far side of the world isn't drawn on the globe
    expect(projectMorph(-90, -23.8, v).visible).toBe(false);
  });

  it('finds the flat map centre from what it reports, whatever padding the camera keeps', () => {
    // A box around Dhaka, with the camera's own centre pushed down by a padding
    const [lon, lat] = viewCentre([90.4, 22], [85, 18, 95.8, 29.4]);
    expect(lon).toBeCloseTo(90.4);
    expect(merc(lat * RAD)).toBeCloseTo((merc(18 * RAD) + merc(29.4 * RAD)) / 2, 6);
    // Across the date line the box spans the world: the camera's centre is used
    expect(viewCentre([179, -17], [-180, -30, 180, -5])[0]).toBe(179);
  });

  it('turns the short way round', () => {
    expect(nearestLon(170, -170)).toBe(190);
    expect(nearestLon(-170, 170)).toBe(-190);
    expect(nearestLon(10, 20)).toBe(20);
  });

  it('the globe at rest is the flat map at its widest, scale for scale', () => {
    expect(equivalentZoom(restingView(W, H).r)).toBeCloseTo(zEnd, 6);
  });
});

describe('a tap on the globe', () => {
  it('finds the country under it', () => {
    expect(countryAt(90.4, 23.8)?.iso2).toBe('BD');
    expect(countryAt(134, -25)?.iso2).toBe('AU');
    expect(countryAt(-100, 40)?.iso2).toBe('US');
    expect(countryAt(2.3, 46.6)?.iso2).toBe('FR');
  });

  it('finds nothing over the sea', () => {
    expect(countryAt(-30, 0)).toBeNull();
    expect(countryAt(88, 15)).toBeNull();
  });

  it('a tap on the screen finds the country there', () => {
    const v = view(90, 20);
    const p = project(90.4, 23.8, v);
    const at = unproject(p.x, p.y, v)!;
    expect(countryAt(at[0], at[1])?.iso2).toBe('BD');
  });
});
