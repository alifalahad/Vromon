/**
 * The globe (docs/ui-refresh step 1): its projection, the hand-over to and from the flat map,
 * and which country a tap finds.
 */

import { countryAt } from '../features/map/globe/countryAt';
import {
  clampTilt,
  equivalentZoom,
  FLAT_FROM_GLOBE_ZOOM,
  FLAT_MIN_ZOOM,
  GLOBE_FROM_ZOOM,
  HAND_BACK_SCALE,
  MAX_TILT,
  MIN_SCALE,
  project,
  restingView,
  unproject,
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

describe('the hand-over between the flat map and the globe', () => {
  it('opens the globe before the flat map runs out, and hands back closer in than that', () => {
    expect(FLAT_MIN_ZOOM).toBeLessThan(GLOBE_FROM_ZOOM);
    expect(GLOBE_FROM_ZOOM).toBeLessThan(FLAT_FROM_GLOBE_ZOOM);
    // At its smallest the flat world is still wider than a phone (512 dp at zoom 0)
    expect(512 * 2 ** FLAT_MIN_ZOOM).toBeGreaterThan(900);
  });

  it('the globe can shrink and grow, and hands back at its largest', () => {
    expect(MIN_SCALE).toBeLessThan(1);
    expect(HAND_BACK_SCALE).toBeGreaterThan(1);
    // Handing back, the land is shown at about the flat map's scale
    expect(equivalentZoom(restingView(390, 700).r * HAND_BACK_SCALE)).toBeLessThan(FLAT_FROM_GLOBE_ZOOM);
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
