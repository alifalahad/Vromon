/**
 * The globe (docs/ui-refresh step 1, docs/smooth-zoom). MapLibre draws the Map tab's globe; these
 * check what the app decides: the style asks for it, and where the earth button flies to.
 */

import { clampTilt, globeRestZoom, MAX_TILT, restingView } from '../features/map/globe/projection';
import { MAP_STYLE } from '../features/map/style';

describe('the globe', () => {
  it('is drawn by MapLibre: the style asks for the globe projection', () => {
    expect(MAP_STYLE.projection).toEqual({ type: 'globe' });
  });

  it('at rest fits the screen, a little above the middle', () => {
    const r = restingView(390, 700);
    expect(r.r * 2).toBeLessThanOrEqual(390);
    expect(r.cy).toBeLessThan(350);
  });

  it('the earth button flies to the zoom where MapLibre draws the globe at its size at rest', () => {
    // MapLibre's globe at zoom z: radius 512·2^z / 2π dp
    for (const [w, h] of [
      [327, 640],
      [390, 760],
      [800, 1200],
    ]) {
      const z = globeRestZoom(w, h);
      expect((512 * 2 ** z) / (2 * Math.PI)).toBeCloseTo(restingView(w, h).r, 6);
    }
    // A bigger screen, a bigger globe: further in
    expect(globeRestZoom(800, 1200)).toBeGreaterThan(globeRestZoom(327, 640));
  });

  it('never asks for a zoom below MapLibre’s smallest', () => {
    expect(globeRestZoom(100, 100)).toBeGreaterThanOrEqual(0);
  });

  it('keeps the still globe’s tilt short of the poles', () => {
    expect(clampTilt(3)).toBe(MAX_TILT);
    expect(clampTilt(-3)).toBe(-MAX_TILT);
    expect(clampTilt(0.5)).toBe(0.5);
  });
});
