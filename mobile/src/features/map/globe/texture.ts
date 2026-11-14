/**
 * The flat picture the globe is wrapped in (docs/ui-refresh step 1): the whole world in
 * longitude and latitude (equirectangular), drawn once on the phone from the bundled country
 * shapes in the map theme's colours, the countries you marked in theirs. It's drawn again only
 * when a mark or the theme changes; turning the globe never redraws it.
 */

import { drawAsImageFromPicture, createPicture, PaintStyle, Skia, StrokeJoin, type SkImage } from '@shopify/react-native-skia';

import type { Visit } from '../../../types';
import type { ResolvedMapTheme } from '../../mapThemes/resolve';
import { COUNTRIES } from '../geoData';
import { withImpliedCountries } from '../style';

/** 4096 × 2048: sharp enough at the largest globe (about 1.6 times its size at rest) */
export const TEXTURE = { width: 4096, height: 2048 } as const;

const x = (lon: number) => ((lon + 180) / 360) * TEXTURE.width;
const y = (lat: number) => ((90 - lat) / 180) * TEXTURE.height;

/** Each country's fill: its status colour when it, or anything in it, is marked (as the flat map zoomed out). */
export function countryFills(visits: readonly Visit[], theme: ResolvedMapTheme): Map<string, string> {
  const fills = new Map<string, string>();
  for (const v of withImpliedCountries(visits)) {
    // The first mark of a country wins, as in the flat map's `match`
    if (v.place_type === 'country' && !fills.has(v.place_code)) fills.set(v.place_code, theme.status[v.status]);
  }
  return fills;
}

/** The countries drawn with an outline too (Want to visit in the preset themes), and its colour. */
function outlined(visits: readonly Visit[], theme: ResolvedMapTheme): { codes: Set<string>; color?: string } {
  const statuses = Object.keys(theme.outline) as (keyof typeof theme.outline)[];
  if (!statuses.length) return { codes: new Set() };
  const codes = new Set(visits.filter((v) => v.place_type === 'country' && statuses.includes(v.status)).map((v) => v.place_code));
  return { codes, color: theme.outline[statuses[0]] };
}

let cache: { key: string; image: SkImage } | null = null;

/** The world picture for these marks and this theme (kept until they change). */
export function worldTexture(visits: readonly Visit[], theme: ResolvedMapTheme): SkImage | null {
  const fills = countryFills(visits, theme);
  const outline = outlined(visits, theme);
  const key = JSON.stringify([theme.base, [...fills], [...outline.codes], outline.color]);
  if (cache?.key === key) return cache.image;

  const picture = createPicture((canvas) => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color(theme.base.water));
    canvas.drawRect(Skia.XYWHRect(0, 0, TEXTURE.width, TEXTURE.height), paint);

    const borders = Skia.PathBuilder.Make();
    const edges = Skia.PathBuilder.Make();
    const fill = Skia.Paint();
    fill.setAntiAlias(true);
    for (const f of COUNTRIES.features) {
      const g = f.geometry;
      const polygons = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      const iso2 = String(f.properties?.iso2 ?? '');
      const builder = Skia.PathBuilder.Make();
      for (const polygon of polygons) {
        for (const ring of polygon) {
          ring.forEach(([lon, lat], i) => (i === 0 ? builder.moveTo(x(lon), y(lat)) : builder.lineTo(x(lon), y(lat))));
          builder.close();
        }
      }
      const path = builder.detach();
      fill.setColor(Skia.Color(fills.get(iso2) ?? theme.base.land));
      canvas.drawPath(path, fill);
      borders.addPath(path);
      if (outline.codes.has(iso2)) edges.addPath(path);
    }

    const line = Skia.Paint();
    line.setAntiAlias(true);
    line.setStyle(PaintStyle.Stroke);
    line.setStrokeJoin(StrokeJoin.Round);
    line.setStrokeWidth(1.6);
    line.setColor(Skia.Color(theme.base.border));
    canvas.drawPath(borders.detach(), line);
    if (outline.color) {
      line.setStrokeWidth(4);
      line.setColor(Skia.Color(outline.color));
      canvas.drawPath(edges.detach(), line);
    }
  }, TEXTURE);

  const image = drawAsImageFromPicture(picture, TEXTURE);
  if (image) cache = { key, image };
  return image;
}
