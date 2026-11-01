/**
 * The travel map (MapLibre Native).
 *
 * - Opens framed on the home country; `home()` / `world()` move between the two.
 * - Countries: bundled GeoJSON (works offline from first launch), filled by status.
 * - Regions / Cities: PMTiles served by the backend (needs a connection), except the
 *   bundled home regions (Bangladesh's divisions), which draw offline with their own
 *   inner borders and labels and are left out of the tiles.
 * Colours come from the active map theme. Status colours are paint expressions
 * rebuilt from the visit list, so marking a place repaints one property instead
 * of reloading data, and switching a theme repaints without reloading the style.
 */

import { Camera, GeoJSONSource, Layer, Map, VectorSource, type CameraRef, type LngLatBounds, type MapRef } from '@maplibre/maplibre-react-native';
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';

import { tilesUrl } from '../../services/api';
import type { Visit } from '../../types';
import type { ResolvedMapTheme } from '../mapThemes/resolve';
import type { MapView } from '../preferences/store';
import { HOME_DISTRICTS, HOME_REGION_BORDERS, HOME_REGION_LABELS, HOME_REGIONS } from './geoData';
import { BUNDLED_HOMES, countryBounds } from './home';
import { CLOSE_UP_FADE, CountryLabels, CountryLayers, LAYER, TerrainLayer, WaterLayers, type FeaturePress } from './layers';
import { DISTRICTS_FROM, LABEL_FONT, MAP_STYLE, markedCodes, PLACE_NAME_SIZE, placeNamePaint, statusColorExpression } from './style';
import type { PlaceRef } from './visits';

export type PressedPlace = PlaceRef & { name: string };

export type WorldMapHandle = {
  home: () => void;
  world: () => void;
  /** Frame a box (today's stops), clear of what floats over the map */
  fit: (bounds: LngLatBounds, padding?: { top: number; bottom: number; left: number; right: number }) => void;
  /** Centre on a point, close up ("Centre on me") */
  focus: (center: [number, number]) => void;
  /** A picture of the map as it is now (a file URI), for the poster */
  snapshot: () => Promise<string | null>;
};

export type MapScope = 'home' | 'world';

const WORLD_ZOOM = 1.6;
// Closer than this counts as "home" (the toggle then offers the world)
const HOME_SCOPE_ZOOM = 3.5;
// Room for the story capsule above and the round buttons below
const HOME_PADDING = { top: 96, bottom: 110, left: 28, right: 28 };
const FALLBACK: LngLatBounds = [88.0, 20.6, 92.7, 26.6]; // Bangladesh

type Props = {
  view: MapView;
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
  /** Press and hold (step 8): the place under the finger at the current view, and where on screen */
  onLongPressPlace?: (place: PressedPlace, point: [number, number]) => void;
};

// What a long press can mark, per view
const PLACE_LAYERS: Record<MapView, string[]> = {
  countries: [LAYER.countryFill],
  regions: ['home-region-fill', 'region-fill'],
  cities: ['city-dot-marked', 'city-dot'],
};

/** A place from a feature of one of the place layers. */
function placeOf(view: MapView, p: Record<string, unknown>): PressedPlace | null {
  if (view === 'countries' && p.iso2) return { place_type: 'country', place_code: String(p.iso2), country_iso2: String(p.iso2), name: String(p.name) };
  if (view === 'regions' && p.code) return { place_type: 'region', place_code: String(p.code), country_iso2: String(p.country), name: String(p.name) };
  if (view === 'cities' && p.id) return { place_type: 'city', place_code: String(p.id), country_iso2: String(p.country), name: String(p.name) };
  return null;
}

const centre = (b: LngLatBounds): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

// Tile features of countries whose regions come from the bundled file
const NOT_BUNDLED = ['!', ['in', ['get', 'country'], ['literal', BUNDLED_HOMES]]];

function firstProps(e: FeaturePress): Record<string, unknown> | null {
  return (e.nativeEvent.features?.[0]?.properties as Record<string, unknown> | undefined) ?? null;
}

export const WorldMap = forwardRef<WorldMapHandle, Props>(function WorldMap({ view, visits, theme, home, onPressPlace, onScopeChange, onUserMove, children, selected, onLongPressPlace, bottomInset = 0, namedPlaces = [] }, ref) {
  const camera = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);
  const { base, status, outline } = theme;
  const homeBounds = countryBounds(home) ?? FALLBACK;
  const homePadding = { ...HOME_PADDING, bottom: Math.max(HOME_PADDING.bottom, bottomInset + 24) };

  useImperativeHandle(ref, () => ({
    home: () => camera.current?.fitBounds(homeBounds, { padding: homePadding, duration: 600 }),
    world: () => camera.current?.flyTo({ center: centre(homeBounds), zoom: WORLD_ZOOM, duration: 600 }),
    fit: (b, padding = HOME_PADDING) => camera.current?.fitBounds(b, { padding, duration: 600 }),
    focus: (center) => camera.current?.easeTo({ center, zoom: 13, duration: 500 }),
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

  // Statuses drawn with an outline (Want to visit in the preset themes)
  const outlined = Object.keys(outline) as (keyof typeof outline)[];
  const outlineColor = outlined.length ? outline[outlined[0]] : undefined;

  const countryFill = view === 'countries' ? statusColorExpression(visits, 'country', 'iso2', base.land, status) : base.land;
  const countryOutline = view === 'countries' ? markedCodes(visits, 'country', outlined) : [];
  const regionFill = statusColorExpression(visits, 'region', 'code', base.land, status);
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

  return (
    <Map
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      mapStyle={MAP_STYLE}
      attribution={false}
      logo={false}
      compass={false}
      touchPitch={false}
      onRegionDidChange={(e) => {
        onScopeChange?.(e.nativeEvent.zoom >= HOME_SCOPE_ZOOM ? 'home' : 'world');
        if (e.nativeEvent.userInteraction) onUserMove?.();
      }}
      onLongPress={
        onLongPressPlace
          ? async (e) => {
              const point = e.nativeEvent.point;
              const features = (await mapRef.current?.queryRenderedFeatures(point, { layers: PLACE_LAYERS[view] })) ?? [];
              const found = features.map((f) => placeOf(view, (f.properties ?? {}) as Record<string, unknown>)).find(Boolean);
              if (found) onLongPressPlace(found, [point[0], point[1]]);
            }
          : undefined
      }
    >
      <Camera ref={camera} initialViewState={{ bounds: homeBounds, padding: HOME_PADDING }} />

      <WaterLayers base={base} />
      <CountryLayers
        base={base}
        fill={countryFill}
        outlineCodes={countryOutline}
        outlineColor={outlineColor}
        selectedCode={view === 'countries' && selected?.place_type === 'country' ? selected.place_code : null}
        // Only in Countries view: MapLibre hands a tap to the topmost source with a press
        // handler, and the country borders sit above the region layers, so a handler here
        // would swallow every tap on a region
        onPress={
          view === 'countries'
            ? (e) => {
                const p = firstProps(e);
                if (p?.iso2) onPressPlace({ place_type: 'country', place_code: String(p.iso2), country_iso2: String(p.iso2), name: String(p.name) });
              }
            : undefined
        }
      />
      <TerrainLayer base={base} />

      {view === 'regions' ? (
        <VectorSource id="regions" url={tilesUrl('regions')} onPress={regionPress}>
          {/* Mounted after the map loads, so anchor below country borders and labels explicitly */}
          <Layer
            id="region-fill"
            type="fill"
            source-layer="regions"
            beforeId={belowBorders}
            filter={NOT_BUNDLED as never}
            paint={{ 'fill-color': regionFill as never, 'fill-opacity': CLOSE_UP_FADE }}
          />
          <Layer
            id="region-border"
            type="line"
            source-layer="regions"
            beforeId={belowBorders}
            filter={NOT_BUNDLED as never}
            paint={{ 'line-color': base.border, 'line-width': 0.5, 'line-opacity': 0.7 }}
          />
          <Layer
            id="region-status-outline"
            type="line"
            source-layer="regions"
            beforeId={belowBorders}
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
      ) : null}

      {view === 'regions' ? (
        <>
          {/* Home regions from the app bundle: offline, and their fill stays under the
              country border, which draws the outer edge (the two outlines differ slightly) */}
          <GeoJSONSource id="home-regions" data={HOME_REGIONS} onPress={regionPress}>
            <Layer id="home-region-fill" type="fill" beforeId={belowBorders} paint={{ 'fill-color': regionFill as never, 'fill-opacity': CLOSE_UP_FADE }} />
            <Layer
              id="home-region-status-outline"
              type="line"
              beforeId={belowBorders}
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
        </>
      ) : null}

      {/* Home country context in every view, like a real map: division lines and names at
          country zoom; zoomed into a division, its districts (dashed lines, names) instead */}
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
            'line-opacity': view === 'regions' ? 1 : 0.6,
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

      {view === 'cities' ? (
        <VectorSource
          id="cities"
          url={tilesUrl('cities')}
          onPress={(e: FeaturePress) => {
            const p = firstProps(e);
            if (p?.id) onPressPlace({ place_type: 'city', place_code: String(p.id), country_iso2: String(p.country), name: String(p.name) });
          }}
        >
          <Layer
            id="city-dot"
            type="circle"
            source-layer="cities"
            beforeId={LAYER.label}
            filter={['!', isMarkedCity] as never}
            paint={{ 'circle-color': base.border, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 1.5, 8, 3.5] as never }}
          />
          {/* Marked cities in their own layer above the rest, so nearby dots can't cover them */}
          <Layer
            id="city-dot-marked"
            type="circle"
            source-layer="cities"
            beforeId={LAYER.label}
            filter={isMarkedCity as never}
            paint={{
              'circle-color': cityColor as never,
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 5, 8, 7] as never,
              'circle-stroke-width': 1.5,
              'circle-stroke-color': cityStroke as never,
            }}
          />
        </VectorSource>
      ) : null}

      {/* Labels last so they sit on top of fills */}
      <CountryLabels base={base} />
      {children}
    </Map>
  );
});
