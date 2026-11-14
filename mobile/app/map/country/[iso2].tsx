/**
 * A country on "Your travels" (docs/ui-refresh step 2, frame 4): what you've visited inside it.
 * A small map of the country drawn from the bundled shapes (Bangladesh's divisions in their status
 * colours, your cities as dots), its status, "Show on map", then tabs: its divisions or regions,
 * districts (Bangladesh), cities, and the places of your finished trips there.
 *
 * Not Explore's country page: that one is reference facts from Wikidata and needs a connection;
 * this one is your own marks and works offline.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueries } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { flagEmoji } from '../../../src/features/geo/countries';
import { COUNTRIES, HOME_REGIONS } from '../../../src/features/map/geoData';
import { regionWord } from '../../../src/features/map/home';
import { useMapRequest } from '../../../src/features/map/mapRequest';
import { RegionList, useTravelKit } from '../../../src/features/map/TravelKit';
import { Card, EmptyList, StatusChip, TravelRow } from '../../../src/features/map/TravelParts';
import { placeName, targetOf } from '../../../src/features/map/travelPlaces';
import { beenCities, beenDistricts, beenRegions, bundledDistricts, bundledRegions, finishedTripsIn } from '../../../src/features/map/travels';
import { statusOf } from '../../../src/features/map/visits';
import { useMapTheme } from '../../../src/features/mapThemes/useMapTheme';
import { usePlanFormat } from '../../../src/features/trips/plan/usePlanFormat';
import { tripsApi } from '../../../src/services/api';
import type { Visit } from '../../../src/types';
import { PressableScale } from '../../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../../src/ui/theme';

type Tab = 'regions' | 'districts' | 'cities' | 'places';

export default function TravelCountry() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { iso2 = 'BD' } = useLocalSearchParams<{ iso2: string }>();
  const kit = useTravelKit();
  const { visits, trips, lookup, today, name, year, mapButton } = kit;
  const ask = useMapRequest((s) => s.ask);
  const words = regionWord(iso2);
  const status = statusOf(visits, 'country', iso2);
  const countryName = placeName({ place_type: 'country', place_code: iso2 }, kit.lang, lookup) ?? iso2;

  const regionsAll = bundledRegions(iso2);
  const regions = beenRegions(visits, iso2);
  const districts = iso2 === 'BD' ? beenDistricts(visits) : [];
  const cities = beenCities(visits, { country: iso2 });
  const tripList = finishedTripsIn(trips, today, iso2);

  // The places of your finished trips here, from their plans (cached; the tab's number needs them)
  const [tab, setTab] = useState<Tab>('regions');
  const plans = useQueries({
    queries: tripList.map((trip) => ({ queryKey: ['itinerary', trip.id], queryFn: () => tripsApi.getItinerary(trip.id), staleTime: 5 * 60_000 })),
  });
  const places = useMemo(() => {
    const seen = new Map<string, { key: string; name: string; lat: number; lon: number; line: string }>();
    plans.forEach((q, i) => {
      const trip = tripList[i];
      for (const day of q.data?.days ?? []) {
        for (const item of day.items) {
          const p = item.place;
          if (item.item_type !== 'activity' || !p || p.latitude == null || p.longitude == null) continue;
          const key = String(item.place_id ?? p.name);
          if (!seen.has(key)) seen.set(key, { key, name: p.name, lat: p.latitude, lon: p.longitude, line: t('travels.placeLine', { trip: trip.title || trip.destination, day: f.n(day.day_number) }) });
        }
      }
    });
    return [...seen.values()];
  }, [plans, tripList, t, f]);
  const placesLoading = plans.some((q) => q.isPending);

  const tabs: { key: Tab; label: string; count: string }[] = [
    { key: 'regions', label: t(`travels.${words}`), count: regionsAll ? `${f.n(regions.length)}/${f.n(regionsAll.length)}` : f.n(regions.length) },
    ...(iso2 === 'BD' ? [{ key: 'districts' as Tab, label: t('travels.districts'), count: `${f.n(districts.length)}/${f.n(bundledDistricts().length)}` }] : []),
    { key: 'cities', label: t('travels.cities'), count: f.n(cities.length) },
    { key: 'places', label: t('travels.places'), count: placesLoading ? '…' : f.n(places.length) },
  ];

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: `${flagEmoji(iso2)}  ${countryName}` }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} testID="travels-country">
        <View style={styles.mapCard}>
          <CountryMap iso2={iso2} visits={visits} cities={cities.map((v) => lookup.cities.get(v.place_code)).filter((c) => c?.lat != null) as { lat: number; lon: number }[]} />
          {status ? (
            <View style={styles.statusPill}>
              <StatusChip status={status} here />
            </View>
          ) : null}
          {targetOf({ place_type: 'country', place_code: iso2 }, lookup) ? (
            <PressableScale
              haptic="selection"
              onPress={() => kit.showOnMap({ place_type: 'country', place_code: iso2 })}
              style={styles.showButton}
              accessibilityRole="button"
              accessibilityLabel={t('travels.showOnMapA11y', { name: countryName })}
              testID="country-show-on-map"
            >
              <MaterialCommunityIcons name="map-outline" size={18} color={colors.onAccentSoft} />
              <Text style={styles.showText}>{t('travels.showOnMap')}</Text>
            </PressableScale>
          ) : null}
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          {tabs.map((x) => {
            const on = x.key === tab;
            return (
              <PressableScale
                key={x.key}
                pressEffect="opacity"
                haptic="selection"
                onPress={() => setTab(x.key)}
                style={[styles.tab, on && styles.tabOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${x.label}, ${x.count}`}
                testID={`country-tab-${x.key}`}
              >
                <Text style={[styles.tabLabel, on && styles.tabLabelOn]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {x.label}
                </Text>
                <Text style={styles.tabCount} maxFontSizeMultiplier={1.3}>
                  {x.count}
                </Text>
              </PressableScale>
            );
          })}
        </View>

        {tab === 'regions' ? (
          regionsAll ? (
            <RegionList country={iso2} kit={kit} />
          ) : regions.length ? (
            <Card>
              {regions.map((v, i) => (
                <TravelRow key={v.place_code} name={name(v)} sub={year(v)} status={v.status} right={<><StatusChip status={v.status} />{mapButton(v, name(v))}</>} last={i === regions.length - 1} />
              ))}
            </Card>
          ) : (
            <EmptyList icon="view-grid-outline" title={t('travels.empty.regions.title')} body={t('travels.empty.regions.body')} action={t('travels.openMap')} onAction={() => router.dismissAll()} />
          )
        ) : null}

        {tab === 'districts' ? (
          districts.length ? (
            <Card>
              {districts.map((v, i) => (
                <TravelRow key={v.place_code} name={name(v)} sub={year(v)} status={v.status} right={<><StatusChip status={v.status} />{mapButton(v, name(v))}</>} last={i === districts.length - 1} />
              ))}
            </Card>
          ) : (
            <EmptyList icon="hexagon-outline" title={t('travels.empty.districts.title')} body={t('travels.empty.districts.body')} action={t('travels.openMap')} onAction={() => router.dismissAll()} />
          )
        ) : null}

        {tab === 'cities' ? (
          cities.length ? (
            <Card>
              {cities.map((v, i) => (
                <TravelRow key={v.place_code} name={name(v)} sub={year(v)} status={v.status} right={<><StatusChip status={v.status} />{mapButton(v, name(v))}</>} last={i === cities.length - 1} />
              ))}
            </Card>
          ) : (
            <EmptyList icon="city-variant-outline" title={t('travels.empty.cities.title')} body={t('travels.empty.cities.body')} action={t('travels.openMap')} onAction={() => router.dismissAll()} />
          )
        ) : null}

        {tab === 'places' ? (
          placesLoading ? null : places.length ? (
            <Card>
              {places.map((p, i) => (
                <TravelRow
                  key={p.key}
                  name={p.name}
                  sub={p.line}
                  right={
                    <PressableScale
                      pressEffect="opacity"
                      haptic="selection"
                      onPress={() => {
                        ask({ kind: 'show', target: { center: [p.lon, p.lat], zoom: 12 } });
                        router.dismissAll();
                      }}
                      style={styles.mapButton}
                      accessibilityRole="button"
                      accessibilityLabel={t('travels.showOnMapA11y', { name: p.name })}
                    >
                      <MaterialCommunityIcons name="map-marker-outline" size={22} color={colors.onAccentSoft} />
                    </PressableScale>
                  }
                  last={i === places.length - 1}
                />
              ))}
            </Card>
          ) : (
            <EmptyList icon="map-marker-path" title={t('travels.empty.places.title')} body={t('travels.empty.places.body')} />
          )
        ) : null}
      </ScrollView>
      {kit.sheet}
    </View>
  );
}

/** The country drawn from the bundled shapes, its divisions in their status colours (Bangladesh), your cities as dots. */
function CountryMap({ iso2, visits, cities }: { iso2: string; visits: readonly Visit[]; cities: { lat: number; lon: number }[] }) {
  const styles = useStyles();
  const { base, status } = useMapTheme();
  const [size, setSize] = useState({ w: 0, h: 172 });
  const shape = useMemo(() => {
    const feature = COUNTRIES.features.filter((x) => x.properties?.iso2 === iso2);
    const polygons = feature.flatMap((x) => (x.geometry.type === 'Polygon' ? [x.geometry.coordinates] : x.geometry.type === 'MultiPolygon' ? x.geometry.coordinates : [])) as number[][][][];
    // Frame the largest part, so far-off islands don't shrink the country to a dot
    const area = (p: number[][][]) => {
      const xs = p[0].map((c) => c[0]);
      const ys = p[0].map((c) => c[1]);
      return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    };
    const main = [...polygons].sort((a, b) => area(b) - area(a))[0];
    if (!main) return null;
    const xs = main[0].map((c) => c[0]);
    const ys = main[0].map((c) => c[1]);
    return { polygons, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const };
  }, [iso2]);
  if (!shape) return <View style={styles.mapFill} />;
  const [x0, y0, x1, y1] = shape.box;
  const k = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
  const pad = 18;
  const scale = size.w ? Math.min((size.w - pad * 2) / ((x1 - x0) * k || 1), (size.h - pad * 2) / (y1 - y0 || 1)) : 0;
  const ox = (size.w - (x1 - x0) * k * scale) / 2;
  const oy = (size.h - (y1 - y0) * scale) / 2;
  const px = (lon: number) => ox + (lon - x0) * k * scale;
  const py = (lat: number) => oy + (y1 - lat) * scale;
  const d = (rings: number[][][]) => rings.map((r) => r.map(([lon, lat], i) => `${i ? 'L' : 'M'}${px(lon).toFixed(1)} ${py(lat).toFixed(1)}`).join('') + 'Z').join('');
  const countryStatus = statusOf(visits, 'country', iso2);
  const regions = HOME_REGIONS.features.filter((x) => x.properties.country === iso2);
  return (
    <View style={styles.mapFill} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {scale ? (
        <Svg width={size.w} height={size.h}>
          {shape.polygons.map((p, i) => (
            <Path key={i} d={d(p)} fill={regions.length ? base.land : countryStatus ? status[countryStatus] : base.land} stroke={base.border} strokeWidth={1} />
          ))}
          {regions.map((r) => {
            const s = statusOf(visits, 'region', r.properties.code);
            const g = r.geometry;
            const parts = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as number[][][][];
            return parts.map((p, i) => <Path key={`${r.properties.code}-${i}`} d={d(p)} fill={s ? status[s] : base.land} stroke={base.border} strokeWidth={0.8} />);
          })}
          {cities.map((c, i) => (
            <Circle key={i} cx={px(c.lon)} cy={py(c.lat)} r={4.5} fill={status.visited} stroke={base.labelHalo} strokeWidth={1.5} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  content: { padding: t.spacing.lg, paddingTop: t.spacing.sm, gap: 14 },
  mapCard: { height: 172, borderRadius: 24, overflow: 'hidden' },
  mapFill: { flex: 1, backgroundColor: t.colors.globeSky },
  statusPill: { position: 'absolute', left: 12, top: 12 },
  showButton: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingLeft: 12,
    paddingRight: 14,
    borderRadius: 20,
    backgroundColor: t.colors.glass,
    ...t.depth.raised,
  },
  showText: { ...t.type.footnote, fontSize: 14, fontWeight: '500', color: t.colors.onAccentSoft },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16, backgroundColor: t.colors.surfaceInset },
  tab: { flex: 1, minHeight: t.sizes.minTouch, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  tabOn: { backgroundColor: t.colors.segmentThumb, ...t.depth.card },
  tabLabel: { ...t.type.footnote, fontSize: 13.5, fontWeight: '500', color: t.colors.textSecondary },
  tabLabelOn: { fontWeight: '700', color: t.colors.textPrimary },
  tabCount: { ...t.type.caption, fontSize: 11.5, color: t.colors.textSecondary },
  mapButton: { width: 44, height: t.sizes.minTouch, alignItems: 'center', justifyContent: 'center' },
}));
