/**
 * The travel map (MapLibre Native).
 *
 * - Opens framed on the home country; `home()` / `world()` move between the two.
 * - Countries: bundled GeoJSON (works offline from first launch), filled by status.
 * - Regions / Cities: PMTiles served by the backend (needs a connection), except the
 *   bundled home regions (Bangladesh's divisions), which draw offline with their own
 *   inner borders and labels and are left out of the tiles.
 * - One map for every zoom (levels.ts; it had a Countries / Divisions / Cities switch): zoomed out,
 *   a country is coloured when you marked it or anything in it, and a tap marks the country. At a
 *   country's zoom its divisions (regions elsewhere) take over, closer in Bangladesh's districts,
 *   and closest every city's dot; a tap marks what's showing there. A country you marked with
 *   nothing marked inside keeps its colour all the way in.
 * - Zoomed out past the world, a globe (docs/ui-refresh step 1). MapLibre draws it (MAP_STYLE's
 *   projection, docs/smooth-zoom): one map at every zoom that curves into the globe as you zoom
 *   out, as in Apple Maps, with MapLibre's own gestures, momentum and taps all the way. The earth
 *   button flies out to the globe facing the home country, the home button flies back in.
 * Colours come from the active map theme. Status colours are paint expressions
 * rebuilt from the visit list, so marking a place repaints one property instead
 * of reloading data, and switching a theme repaints without reloading the style.
 */

import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import { Camera, GeoJSONSource, Layer, Map, VectorSource, type CameraRef, type LngLatBounds, type MapRef } from '@maplibre/maplibre-react-native';
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { tilesUrl } from '../../services/api';
import type { Visit } from '../../types';
import { makeStyles } from '../../ui/theme';
import { useReduceMotion } from '../../ui/useReduceMotion';
import type { ResolvedMapTheme } from '../mapThemes/resolve';
import { countryLabelPoint, HOME_DISTRICT_AREAS, HOME_DISTRICTS, HOME_REGION_BORDERS, HOME_REGION_LABELS, HOME_REGIONS } from './geoData';
import { globeRestZoom } from './globe/projection';
import { BUNDLED_HOMES, countryBounds } from './home';
import { CountryLabels, CountryLayers, LAYER, TerrainLayer, WaterLayers, type FeaturePress } from './layers';
import { CITIES_FROM, DISTRICTS_TAP_FROM, fadeInFrom, GLOBE_UNTIL, levelAt, REGIONS_FROM, type MapLevel } from './levels';
import { countriesWithNothingInside, DISTRICTS_FROM, LABEL_FONT, MAP_STYLE, markedCodes, PLACE_NAME_SIZE, placeNamePaint, statusColorExpression, withImpliedCountries } from './style';
import type { MapTarget } from './travelPlaces';
import type { PlaceRef } from './visits';

export type PressedPlace = PlaceRef & { name: string };

export type WorldMapHandle = {
  home: () => void;
  world: () => void;
  /** Frame a box (today's stops), clear of what floats over the map */
  fit: (bounds: LngLatBounds, padding?: { top: number; bottom: number; left: number; right: number }) => void;
  /** Centre on a point, close up ("Centre on me") */
  focus: (center: [number, number]) => void;
  /** Frame a place from "Your travels" ("Show on map"): a box, or a point at a zoom */
  show: (target: MapTarget) => void;
  /** A picture of the map as it is now (a file URI), for the poster */
  snapshot: () => Promise<string | null>;
};

export type MapScope = 'home' | 'world';

// Closer than this counts as "home" (the toggle then offers the world)
const HOME_SCOPE_ZOOM = 3.5;
// Room for the story capsule above and the round buttons below
const HOME_PADDING = { top: 96, bottom: 110, left: 28, right: 28 };
const FALLBACK: LngLatBounds = [88.0, 20.6, 92.7, 26.6]; // Bangladesh

type Props = {
  visits: readonly Visit[];
  theme: ResolvedMapTheme;
  /** ISO 3166-1 alpha-2 of the user's home country */
  home: string;
  onPressPlace: (place: PressedPlace) => void;
  onScopeChange?: (scope: MapScope) => void;
  /** The user panned or zoomed the map themselves */
  onUserMove?: () => void;
  /** Height of what floats at the bottom (the dock), kept clear when framing home */
  bottomInset?: number;
  /** More layers (trips, friends, today's route), drawn over the places */
  children?: React.ReactNode;
  /** The place whose sheet is open: outlined */
  selected?: PlaceRef | null;
  /** Names drawn by another layer (places Vromon can plan): a district of the same name isn't labelled twice */
  namedPlaces?: readonly string[];
  /** Press and hold (step 8): the place under the finger at the current zoom, and where on screen */
  onLongPressPlace?: (place: PressedPlace, point: [number, number]) => void;
  /** What a tap marks now (country, region, district or city), as the zoom changes */
  onLevelChange?: (level: MapLevel) => void;
  /**
   * "texture" (the default) is a TextureView, drawn with the rest of the screen. MapLibre's own
   * default, a GLSurfaceView, is a separate layer: it ignores a screen's slide (closing Replay left a
   * black box over the screen under it), and with the globe library (docs/smooth-zoom) it stays black
   * after a screen that covered it closes, until the map moves.
   */
  androidView?: 'surface' | 'texture';
};

// Zoomed out past this the map is a globe you turn: the hint about turning it shows there
const GLOBE_BELOW = 2;

// What a long press can mark: whatever's showing under the finger, the smallest first
const PLACE_LAYERS = ['city-dot-marked', 'city-dot', 'home-district-area', 'home-region-fill', 'region-fill', LAYER.countryFill];

/** The place a long press marks at this zoom, from the features under the finger. */
export function placeAt(features: readonly Record<string, unknown>[], zoom: number): PressedPlace | null {
  const level = levelAt(zoom);
  const city = zoom >= REGIONS_FROM ? features.find((p) => p.id != null && p.country) : undefined;
  if (city) return { place_type: 'city', place_code: String(city.id), country_iso2: String(city.country), name: String(city.name) };
  // A district feature has its division as `region`
  const district = level === 'district' || level === 'city' ? features.find((p) => p.code && p.region) : undefined;
  if (district) return { place_type: 'district', place_code: String(district.code), country_iso2: String(district.country ?? 'BD'), name: String(district.name) };
  const region = level !== 'country' ? features.find((p) => p.code && !p.region) : undefined;
  if (region) return { place_type: 'region', place_code: String(region.code), country_iso2: String(region.country), name: String(region.name) };
  const country = features.find((p) => p.iso2);
  if (country) return { place_type: 'country', place_code: String(country.iso2), country_iso2: String(country.iso2), name: String(country.name) };
  return null;
}

const centre = (b: LngLatBounds): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

// Tile features of countries whose regions come from the bundled file
const NOT_BUNDLED = ['!', ['in', ['get', 'country'], ['literal', BUNDLED_HOMES]]];

function firstProps(e: FeaturePress): Record<string, unknown> | null {
  return (e.nativeEvent.features?.[0]?.properties as Record<string, unknown> | undefined) ?? null;
}

export const WorldMap = forwardRef<WorldMapHandle, Props>(function WorldMap({ visits, theme, home, onPressPlace, onScopeChange, onUserMove, children, selected, onLongPressPlace, onLevelChange, bottomInset = 0, namedPlaces = [], androidView = 'texture' }, ref) {
  const { t } = useTranslation();
  const styles = useStyles();
  const reduceMotion = useReduceMotion();
  const camera = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);
  // The zoom decides what a tap marks: countries, then divisions/regions, districts, cities
  const [zoom, setZoom] = useState(5);
  const level = levelAt(zoom);
  const regionsUp = zoom >= REGIONS_FROM;
  const districtsUp = zoom >= DISTRICTS_TAP_FROM;
  const { base, status, outline } = theme;
  const homeBounds = countryBounds(home) ?? FALLBACK;
  const homePadding = { ...HOME_PADDING, bottom: Math.max(HOME_PADDING.bottom, bottomInset + 24) };
  const reported = useRef<MapLevel | null>(null);

  const homePoint = countryLabelPoint(home) ?? centre(homeBounds);

  // The size of the map's area: the earth button flies to the globe at its size at rest there
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);
  // "Drag to turn the globe…", until the first touch on the globe
  const [hint, setHint] = useState(true);

  const reportLevel = (now: MapLevel) => {
    if (now !== reported.current) {
      reported.current = now;
      onLevelChange?.(now);
    }
  };

  // The map came to rest at this zoom: what a tap marks, home or world
  const landed = (z: number) => {
    setZoom(z);
    onScopeChange?.(z >= HOME_SCOPE_ZOOM ? 'home' : 'world');
    reportLevel(levelAt(z));
  };

  useImperativeHandle(ref, () => ({
    home: () => camera.current?.fitBounds(homeBounds, { padding: homePadding, duration: 600 }),
    world: () => {
      // Out to the globe at rest, facing home: the map curves into it on the way
      const z = layout ? globeRestZoom(layout.width, layout.height) : 1;
      if (reduceMotion) camera.current?.jumpTo({ center: homePoint, zoom: z, bearing: 0 });
      else camera.current?.easeTo({ center: homePoint, zoom: z, bearing: 0, duration: 1100, easing: 'ease' });
    },
    fit: (b, padding = HOME_PADDING) => camera.current?.fitBounds(b, { padding, duration: 600 }),
    focus: (center) => camera.current?.easeTo({ center, zoom: 13, duration: 500 }),
    show: (target) => {
      if ('bounds' in target) camera.current?.fitBounds(target.bounds, { padding: homePadding, duration: 700 });
      else camera.current?.easeTo({ center: target.center, zoom: target.zoom, duration: 700 });
    },
    snapshot: async () => {
      const uri = await mapRef.current?.createStaticMapImage({ output: 'file' });
      if (!uri) return null;
      return uri.startsWith('/') ? `file://${uri}` : uri;
    },
  }));

  const selectedRegion = selected?.place_type === 'region' ? selected.place_code : '';

  const regionPress = (e: FeaturePress) => {
    const p = firstProps(e);
    if (p?.code) onPressPlace({ place_type: 'region', place_code: String(p.code), country_iso2: String(p.country), name: String(p.name) });
  };
  const cityPress = (e: FeaturePress) => {
    const p = firstProps(e);
    if (p?.id) onPressPlace({ place_type: 'city', place_code: String(p.id), country_iso2: String(p.country), name: String(p.name) });
  };

  // Statuses drawn with an outline (Want to visit in the preset themes)
  const outlined = Object.keys(outline) as (keyof typeof outline)[];
  const outlineColor = outlined.length ? outline[outlined[0]] : undefined;

  // A smooth change of colour with the zoom: the globe's colours, then only the countries marked with nothing inside
  const countryFill = [
    'interpolate',
    ['linear'],
    ['zoom'],
    GLOBE_UNTIL,
    statusColorExpression(withImpliedCountries(visits), 'country', 'iso2', base.land, status),
    REGIONS_FROM,
    statusColorExpression(countriesWithNothingInside(visits), 'country', 'iso2', base.land, status),
  ] as unknown as ExpressionSpecification;
  // Every division/region and district is drawn (an unmarked one almost clear), so a tap anywhere finds it
  const regionFill = statusColorExpression(visits, 'region', 'code', 'rgba(0,0,0,0.01)', status);
  const regionOpacity = fadeInFrom(REGIONS_FROM);
  const districtFill = statusColorExpression(visits, 'district', 'code', 'rgba(0,0,0,0.01)', status);
  const districtOpacity = fadeInFrom(DISTRICTS_TAP_FROM);
  const markedDistricts = markedCodes(visits, 'district');
  const selectedDistrict = selected?.place_type === 'district' ? selected.place_code : '';
  const districtPress = (e: FeaturePress) => {
    const p = firstProps(e);
    if (p?.code) onPressPlace({ place_type: 'district', place_code: String(p.code), country_iso2: 'BD', name: String(p.name) });
  };
  const countryOutline = markedCodes(visits, 'country', outlined);
  const regionOutline = markedCodes(visits, 'region', outlined);
  const cityColor = statusColorExpression(visits, 'city', 'id', base.border, status);
  const cityStroke = statusColorExpression(visits, 'city', 'id', base.labelHalo, {
    visited: base.labelHalo,
    lived: base.labelHalo,
    want: base.labelHalo,
    ...outline,
  });
  const isMarkedCity = ['in', ['to-string', ['get', 'id']], ['literal', markedCodes(visits, 'city')]];
  // Region layers sit under the terrain shading when there is one, else under the borders
  const belowBorders = base.terrain ? 'terrain-hillshade' : LAYER.glow;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== layout?.width || height !== layout?.height) setLayout({ width, height });
  };

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
    <Map
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      mapStyle={MAP_STYLE}
      androidView={androidView}
      attribution={false}
      logo={false}
      compass={false}
      touchPitch={false}
      onRegionIsChanging={(e) => {
        // The first touch on the globe: the hint about turning it has done its job
        if (hint && e.nativeEvent.userInteraction && e.nativeEvent.zoom < GLOBE_BELOW) setHint(false);
      }}
      onRegionDidChange={(e) => {
        if (e.nativeEvent.userInteraction) onUserMove?.();
        landed(e.nativeEvent.zoom);
      }}
      onLongPress={
        onLongPressPlace
          ? async (e) => {
              const point = e.nativeEvent.point;
              const features = (await mapRef.current?.queryRenderedFeatures(point, { layers: PLACE_LAYERS })) ?? [];
              const found = placeAt(
                features.map((f) => (f.properties ?? {}) as Record<string, unknown>),
                zoom,
              );
              if (found) onLongPressPlace(found, [point[0], point[1]]);
            }
          : undefined
      }
    >
      {/* As far out as the flat map goes is where the globe is at rest (it covers the map there) */}
      <Camera ref={camera} initialViewState={{ bounds: homeBounds, padding: HOME_PADDING }} />

      <WaterLayers base={base} />
      <CountryLayers
        base={base}
        fill={countryFill}
        outlineCodes={countryOutline}
        outlineColor={outlineColor}
        selectedCode={level === 'country' && selected?.place_type === 'country' ? selected.place_code : null}
        // Only zoomed out: MapLibre hands a tap to the topmost source with a press handler, and
        // the country borders sit above the region layers, so a handler here would swallow every
        // tap on a region
        onPress={
          level === 'country'
            ? (e) => {
                const p = firstProps(e);
                if (p?.iso2) onPressPlace({ place_type: 'country', place_code: String(p.iso2), country_iso2: String(p.iso2), name: String(p.name) });
              }
            : undefined
        }
      />
      <TerrainLayer base={base} />

      {/* Other countries' regions (tiles; Bangladesh's divisions come from the app bundle below) */}
      <VectorSource id="regions" url={tilesUrl('regions')} onPress={regionsUp ? regionPress : undefined}>
        {/* Mounted after the map loads, so anchor below country borders and labels explicitly */}
        <Layer
          id="region-fill"
          type="fill"
          source-layer="regions"
          beforeId={belowBorders}
          minzoom={REGIONS_FROM - 0.6}
          filter={NOT_BUNDLED as never}
          paint={{ 'fill-color': regionFill as never, 'fill-opacity': regionOpacity }}
        />
        <Layer
          id="region-border"
          type="line"
          source-layer="regions"
          beforeId={belowBorders}
          minzoom={REGIONS_FROM - 0.6}
          filter={NOT_BUNDLED as never}
          paint={{
            'line-color': base.border,
            'line-width': 0.5,
            'line-opacity': ['interpolate', ['linear'], ['zoom'], REGIONS_FROM - 0.6, 0, REGIONS_FROM, 0.7] as never,
          }}
        />
        <Layer
          id="region-status-outline"
          type="line"
          source-layer="regions"
          beforeId={belowBorders}
          minzoom={REGIONS_FROM - 0.6}
          layout={{ visibility: outlineColor && regionOutline.length ? 'visible' : 'none' }}
          filter={['all', NOT_BUNDLED, ['in', ['get', 'code'], ['literal', regionOutline]]] as never}
          paint={{ 'line-color': outlineColor ?? base.border, 'line-width': 1.5 }}
        />
        <Layer
          id="region-selected"
          type="line"
          source-layer="regions"
          beforeId={LAYER.label}
          layout={{ 'line-join': 'round' }}
          filter={['==', ['get', 'code'], selectedRegion] as never}
          paint={{ 'line-color': base.label, 'line-width': 2.5 }}
        />
      </VectorSource>

      {/* Home regions from the app bundle: offline, and their fill stays under the country border,
          which draws the outer edge (the two outlines differ slightly). Closer in, the districts
          above them take the taps */}
      <GeoJSONSource id="home-regions" data={HOME_REGIONS} onPress={regionsUp && !districtsUp ? regionPress : undefined}>
        <Layer
          id="home-region-fill"
          type="fill"
          beforeId={belowBorders}
          minzoom={REGIONS_FROM - 0.6}
          paint={{ 'fill-color': regionFill as never, 'fill-opacity': regionOpacity }}
        />
        <Layer
          id="home-region-status-outline"
          type="line"
          beforeId={belowBorders}
          minzoom={REGIONS_FROM - 0.6}
          layout={{ visibility: outlineColor && regionOutline.length ? 'visible' : 'none' }}
          filter={['in', ['get', 'code'], ['literal', regionOutline]] as never}
          paint={{ 'line-color': outlineColor ?? base.border, 'line-width': 1.5 }}
        />
        <Layer
          id="home-region-selected"
          type="line"
          beforeId={LAYER.label}
          layout={{ 'line-join': 'round' }}
          filter={['==', ['get', 'code'], selectedRegion] as never}
          paint={{ 'line-color': base.label, 'line-width': 2.5 }}
        />
      </GeoJSONSource>

      {/* Bangladesh's districts, close up: yours coloured by status, every one tappable. Above
          the country borders: inside Bangladesh, close up, the district is the topmost thing with
          a press handler, so it gets the tap; elsewhere the region does */}
      <GeoJSONSource id="home-district-areas" data={HOME_DISTRICT_AREAS} onPress={districtsUp ? districtPress : undefined}>
        <Layer
          id="home-district-area"
          type="fill"
          beforeId={LAYER.label}
          minzoom={DISTRICTS_TAP_FROM - 0.6}
          paint={{ 'fill-color': districtFill as never, 'fill-opacity': districtOpacity }}
        />
        <Layer
          id="home-district-marked-edge"
          type="line"
          beforeId={LAYER.label}
          minzoom={DISTRICTS_TAP_FROM - 0.6}
          filter={['in', ['get', 'code'], ['literal', markedDistricts]] as never}
          paint={{ 'line-color': base.label, 'line-width': 0.8, 'line-opacity': 0.5 }}
        />
        <Layer
          id="home-district-selected"
          type="line"
          beforeId={LAYER.label}
          layout={{ 'line-join': 'round' }}
          filter={['==', ['get', 'code'], selectedDistrict] as never}
          paint={{ 'line-color': base.label, 'line-width': 2.5 }}
        />
      </GeoJSONSource>

      {/* Home country context, like a real map: division lines and names at country zoom;
          zoomed into a division, its districts (dashed lines, names) instead */}
      <GeoJSONSource id="home-region-borders" data={HOME_REGION_BORDERS}>
        <Layer
          id="home-region-border"
          type="line"
          beforeId={belowBorders}
          minzoom={4}
          layout={{ 'line-join': 'round' }}
          paint={{
            'line-color': base.border,
            'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 8, 1.4] as never,
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.6, REGIONS_FROM, 1] as never,
          }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="home-districts" data={HOME_DISTRICTS}>
        <Layer
          id="home-district-border"
          type="line"
          beforeId={belowBorders}
          minzoom={DISTRICTS_FROM - 0.7}
          filter={['==', ['geometry-type'], 'LineString'] as never}
          layout={{ 'line-join': 'round' }}
          paint={{
            'line-color': base.border,
            'line-dasharray': [2, 2],
            'line-width': ['interpolate', ['linear'], ['zoom'], 6.3, 0.5, 11, 1.2] as never,
            'line-opacity': ['interpolate', ['linear'], ['zoom'], DISTRICTS_FROM - 0.7, 0, DISTRICTS_FROM, 0.85] as never,
          }}
        />
        <Layer
          id="home-district-label"
          type="symbol"
          beforeId={LAYER.label}
          minzoom={DISTRICTS_FROM}
          filter={['all', ['==', ['geometry-type'], 'Point'], ['!', ['in', ['get', 'name'], ['literal', namedPlaces]]]] as never}
          layout={{
            'text-field': ['get', 'name'] as never,
            'text-font': LABEL_FONT,
            'text-size': PLACE_NAME_SIZE as never,
            'text-max-width': 7,
          }}
          paint={placeNamePaint(base)}
        />
      </GeoJSONSource>
      <GeoJSONSource id="home-region-labels" data={HOME_REGION_LABELS}>
        <Layer
          id="home-region-label"
          type="symbol"
          beforeId={LAYER.label}
          minzoom={4.5}
          maxzoom={DISTRICTS_FROM + 0.5}
          layout={{
            'text-field': ['get', 'name'] as never,
            'text-font': LABEL_FONT,
            'text-transform': 'uppercase',
            'text-letter-spacing': 0.15,
            'text-size': ['interpolate', ['linear'], ['zoom'], 4.5, 9.5, DISTRICTS_FROM, 12] as never,
          }}
          paint={{
            'text-color': base.label,
            // Fades out as the districts come in
            'text-opacity': ['interpolate', ['linear'], ['zoom'], DISTRICTS_FROM - 0.5, 0.7, DISTRICTS_FROM + 0.5, 0] as never,
            'text-halo-color': base.labelHalo,
            'text-halo-width': 1.2,
            'text-halo-blur': 0.5,
          }}
        />
      </GeoJSONSource>

      {/* Cities: yours from a country's zoom, every one closest in. A dot is above everything
          else with a press handler, so tapping it marks the city; between dots, the district or
          region gets the tap */}
      <VectorSource id="cities" url={tilesUrl('cities')} onPress={regionsUp ? cityPress : undefined}>
        <Layer
          id="city-dot"
          type="circle"
          source-layer="cities"
          beforeId={LAYER.label}
          minzoom={CITIES_FROM - 0.5}
          filter={['!', isMarkedCity] as never}
          paint={{
            'circle-color': base.border,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], CITIES_FROM - 0.5, 1.5, 10, 4] as never,
            'circle-opacity': ['interpolate', ['linear'], ['zoom'], CITIES_FROM - 0.5, 0, CITIES_FROM, 1] as never,
          }}
        />
        {/* Marked cities in their own layer above the rest, so nearby dots can't cover them */}
        <Layer
          id="city-dot-marked"
          type="circle"
          source-layer="cities"
          beforeId={LAYER.label}
          minzoom={REGIONS_FROM - 0.6}
          filter={isMarkedCity as never}
          paint={{
            'circle-color': cityColor as never,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 8, 7] as never,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': cityStroke as never,
          }}
        />
      </VectorSource>

      {/* Labels last so they sit on top of fills */}
      <CountryLabels base={base} />
      {children}
    </Map>
    {zoom < GLOBE_BELOW && hint ? (
      <View style={[styles.hint, { bottom: bottomInset + 16 }]} pointerEvents="none">
        <Text style={styles.hintText}>{t('map.globeHint')}</Text>
      </View>
    ) : null}
    </View>
  );
});

const useStyles = makeStyles((t) => ({
  hint: {
    position: 'absolute',
    left: t.spacing.lg,
    right: 88,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.sm,
    borderRadius: 24,
    backgroundColor: t.colors.glass,
    ...t.depth.raised,
  },
  hintText: { ...t.type.footnote, color: t.colors.textPrimary },
}));
