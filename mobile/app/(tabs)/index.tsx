/**
 * Vromon Mobile — Map tab (map home redesign, step 2; mockups 1 and 8).
 *
 * Full-bleed map that opens framed on the home country. Over it, at most four
 * floating things: the story capsule (top-left), the Map button (top-right: what
 * to show and the theme, MapSheet), a right-hand column (home ⇄ world, and + to
 * mark a place), and the dock above the tab bar (Dock: today's trip, the next
 * trip, an idea from the Want list, or a nudge). Tap a place for its sheet.
 * Re-tapping the Map tab flies back home.
 */

import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../src/features/account/useMe';
import { mapPlaceCard } from '../../src/features/chat/share';
import { useFootprints, useFriends } from '../../src/features/friends/queries';
import { DestinationSheet } from '../../src/features/map/DestinationSheet';
import { Dock } from '../../src/features/map/Dock';
import { FriendLayers } from '../../src/features/map/FriendLayers';
import { footprintsGeoJSON, friendsAt } from '../../src/features/map/friendGeo';
import { pickDockState } from '../../src/features/map/dockState';
import { countryLabelPoint, HOME_DISTRICT_AREAS, HOME_REGIONS, homeDistrictName, homeRegionName } from '../../src/features/map/geoData';
import { countriesVisited, DEFAULT_HOME, homeRegionProgress, regionWord } from '../../src/features/map/home';
import { MapSheet } from '../../src/features/map/MapSheet';
import { mapCountryName } from '../../src/features/map/mapCountries';
import { PlaceSheet } from '../../src/features/map/PlaceSheet';
import { PosterPreview } from '../../src/features/map/Poster';
import { QuickMark } from '../../src/features/map/QuickMark';
import { StoryCapsule } from '../../src/features/map/StoryCapsule';
import { StoryPanel } from '../../src/features/map/StoryPanel';
import { TodayLayers } from '../../src/features/map/TodayLayers';
import { todayBounds, todayGeoJSON } from '../../src/features/map/todayGeo';
import { destinationsGeoJSON, homePoint, trailsGeoJSON, upcomingGeoJSON } from '../../src/features/map/tripGeo';
import { TripLayers, type TripLayerData } from '../../src/features/map/TripLayers';
import { useMarkPlace } from '../../src/features/map/useMarkPlace';
import { clearVisit, statusOf, useTravelStats, useVisitOutbox, useVisits } from '../../src/features/map/visits';
import { useTripToday } from '../../src/features/map/useTripToday';
import { WorldMap, type MapScope, type PressedPlace, type WorldMapHandle } from '../../src/features/map/WorldMap';
import { useMapTheme } from '../../src/features/mapThemes/useMapTheme';
import { usePreferences, type MapView } from '../../src/features/preferences/store';
import { localToday } from '../../src/features/trips/dates';
import { useTrips, useTripStats } from '../../src/features/trips/queries';
import { usePlanFormat } from '../../src/features/trips/plan/usePlanFormat';
import { useTodaySettings } from '../../src/features/trips/today/settings';
import { pointOf } from '../../src/features/trips/today/today';
import { useHere } from '../../src/features/trips/today/useHere';
import { resolveLanguage } from '../../src/i18n';
import { destinationsApi } from '../../src/services/api';
import type { Destination } from '../../src/types';
import { glass } from '../../src/ui/GlassSurface';
import { haptics } from '../../src/ui/haptics';
import { PressableScale } from '../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../src/ui/theme';

export default function MapScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const map = useRef<WorldMapHandle>(null);
  const mapTheme = useMapTheme();

  const { data: me } = useMe();
  const home = me?.home_country_iso2 ?? DEFAULT_HOME;
  const { data: visits = [] } = useVisits(me?.id);
  const pending = useVisitOutbox((s) => (s.userId === me?.id ? s.ops.length : 0));
  const view = usePreferences((s) => s.mapView);
  const setView = usePreferences((s) => s.setMapView);
  const language = usePreferences((s) => s.language);
  const [place, setPlace] = useState<PressedPlace | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scope, setScope] = useState<MapScope>('home');
  const [storyOpen, setStoryOpen] = useState(false);
  // The poster (step 10): its map picture is taken with location and friends off
  const [poster, setPoster] = useState<{ uri: string | null } | null>(null);
  const { data: stats } = useTravelStats(me?.id);
  const { data: trips } = useTrips();
  const { data: tripStats } = useTripStats();
  const { data: destinations } = useQuery({ queryKey: ['destinations'], queryFn: destinationsApi.list });
  const today = localToday();
  const mapLayers = usePreferences((s) => s.mapLayers);
  // Friends on the map (step 9): fetched only with the layer on, or for an open place's sheet
  const { data: friendsList } = useFriends(!!me);
  const hasFriends = (friendsList?.length ?? 0) > 0;
  const friendsOn = mapLayers.friends && hasFriends && !poster;
  const layerType = view === 'countries' ? 'country' : view === 'regions' ? 'region' : null;
  const { data: footprints } = useFootprints(layerType, friendsOn);
  // Friends' footprints are by country and region (no districts)
  const placeType = place && (place.place_type === 'country' || place.place_type === 'region') ? place.place_type : null;
  const { data: placeFootprints } = useFootprints(placeType, hasFriends && !!place);
  const dock = useMemo(
    () => pickDockState(trips ?? [], visits, destinations ?? [], today, friendsOn ? (footprints?.[0] ?? null) : null),
    [trips, visits, destinations, today, friendsOn, footprints],
  );
  const plannableNames = useMemo(() => (mapLayers.plannable ? (destinations ?? []).map((d) => d.name) : []), [mapLayers.plannable, destinations]);
  const friendData = useMemo(() => footprintsGeoJSON(friendsOn ? (footprints ?? []) : []), [friendsOn, footprints]);
  const [dockHeight, setDockHeight] = useState(0);
  const [destination, setDestination] = useState<Destination | null>(null);
  const f = usePlanFormat();
  const queryClient = useQueryClient();
  const markPlace = useMarkPlace(me?.id ?? '', visits);

  // Press and hold to mark (step 8), and its one-time hint
  const [quick, setQuick] = useState<{ place: PressedPlace; point: [number, number] } | null>(null);
  const hintSeen = usePreferences((s) => s.markHintSeen);
  const setHintSeen = usePreferences((s) => s.setMarkHintSeen);
  useEffect(() => {
    if (hintSeen) return;
    const timer = setTimeout(setHintSeen, 8000);
    return () => clearTimeout(timer);
  }, [hintSeen, setHintSeen]);

  // On a trip today (step 7): the day's route, you (Today mode's location setting), the day in the capsule
  const todayTrip = dock.kind === 'today' ? dock.trip : null;
  const useLocation = useTodaySettings((s) => s.useLocation);
  const { here } = useHere(!!todayTrip && useLocation);
  const tripToday = useTripToday(todayTrip, here);
  const todayData = useMemo(
    () => (tripToday.day && tripToday.state ? todayGeoJSON(tripToday.day, tripToday.state, here) : null),
    [tripToday.day, tripToday.state, here],
  );
  const framed = useRef<string | null>(null);
  // Until the user moves the map, keep home framed clear of the dock as it changes size
  const userMoved = useRef(false);
  const dockBucket = Math.round(dockHeight / 40);
  useEffect(() => {
    if (!todayTrip && dockBucket > 0 && !userMoved.current) map.current?.home();
  }, [dockBucket, todayTrip]);
  useEffect(() => {
    // Framed once the dock has its height (again when it grows as the trip's details load), so no stop hides under it
    const key = todayTrip && tripToday.day && dockHeight ? `${todayTrip.id}-${tripToday.day.id}-${Math.round(dockHeight / 40)}` : null;
    if (key && framed.current !== key) {
      const b = todayBounds(tripToday.day, here);
      if (b) map.current?.fit(b, { top: insets.top + 96, bottom: dockHeight + 40, left: 32, right: 80 });
      framed.current = key;
    } else if (!key && framed.current) {
      framed.current = null;
      map.current?.home(); // the trip moment is over
    }
  }, [todayTrip, tripToday.day, here, dockHeight, insets.top]);
  const todayStops = tripToday.day ? tripToday.day.items.filter((i) => pointOf(i)).length : 0;
  const todayDone = tripToday.state ? tripToday.state.done.filter((i) => pointOf(i)).length : 0;
  // The trip day while zoomed in; zoomed out, the capsule is your story again
  const capsuleToday =
    dock.kind === 'today' && scope === 'home'
      ? {
          title: t('map.todayCapsule', { day: f.n(dock.day), days: f.n(dock.days), place: dock.trip.title || dock.trip.destination }),
          subtitle: todayStops ? t('map.dock.stopsDone', { done: f.n(todayDone), total: f.n(todayStops) }) : null,
          value: dock.day,
          fraction: dock.day / dock.days,
        }
      : undefined;

  const layerData: TripLayerData = useMemo(() => {
    const upcomingTrip = dock.kind === 'upcoming' ? dock.trip : null;
    const lived = visits.find((v) => v.place_type === 'region' && v.status === 'lived' && (v.country_iso2 ?? v.place_code.slice(0, 2)) === home);
    const upcoming = upcomingGeoJSON(upcomingTrip, destinations ?? [], homePoint(lived?.place_code ?? null, home));
    const wantPoints = visits.flatMap((v): GeoJSON.Feature<GeoJSON.Point>[] => {
      if (v.status !== 'want') return [];
      const point =
        v.place_type === 'region'
          ? HOME_REGIONS.features.find((f) => f.properties.code === v.place_code)?.properties.label
          : v.place_type === 'country'
            ? countryLabelPoint(v.place_code)
            : undefined;
      return point ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: point } }] : [];
    });
    return {
      trails: trailsGeoJSON(trips ?? [], today),
      upcomingLine: upcoming.line,
      upcomingPin: upcoming.pin,
      destinations: destinationsGeoJSON(destinations ?? [], upcomingTrip?.destination),
      wants: { type: 'FeatureCollection', features: wantPoints },
    };
  }, [dock, visits, destinations, trips, today, home]);

  // Short crossfade when the view changes
  const opacity = useSharedValue(1);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const changeView = (next: MapView) => {
    if (next === view) return;
    opacity.set(withSequence(withTiming(0.35, { duration: 120 }), withTiming(1, { duration: 220 })));
    setView(next);
  };

  // Re-tapping the Map tab flies back home
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress' as never, () => {
      if (navigation.isFocused()) {
        userMoved.current = false;
        map.current?.home();
      }
    });
    return unsubscribe;
  }, [navigation]);

  // Take the poster's map picture framed on home, once the friend, location and destination layers are off
  useEffect(() => {
    if (!poster || poster.uri) return;
    let alive = true;
    map.current?.home();
    const timer = setTimeout(async () => {
      const uri = (await map.current?.snapshot()) ?? null;
      if (alive) setPoster(uri ? { uri } : null);
    }, 1100);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [poster]);
  const progress = homeRegionProgress(visits, home);
  const countries = countriesVisited(visits);
  const countriesText = t('map.storyCountries', { count: countries, n: f.n(countries) });
  const posterHeadline = progress
    ? t(regionWord(home) === 'divisions' ? 'map.storyDivisions' : 'map.storyRegions', { done: f.n(progress.done), total: f.n(progress.total) })
    : countriesText;
  const posterDetail = progress
    ? stats
      ? `${countriesText} · ${t('map.story.worldPercent', { pct: f.n(stats.world_percent) })}`
      : countriesText
    : stats
      ? t('map.story.worldPercent', { pct: f.n(stats.world_percent) })
      : null;

  const homeName = mapCountryName(home, resolveLanguage(language));
  const top = insets.top + 12;

  return (
    <View style={styles.container} testID="map-screen">
      <Animated.View style={[styles.map, fade]}>
        <WorldMap
          ref={map}
          view={view}
          visits={visits}
          theme={mapTheme}
          home={home}
          onScopeChange={setScope}
          onUserMove={() => (userMoved.current = true)}
          bottomInset={dockHeight + DOCK_GAP}
          selected={place ?? quick?.place ?? null}
          namedPlaces={plannableNames}
          onLongPressPlace={(p, point) => {
            if (!me) return;
            haptics.medium();
            setPlace(null);
            setQuick({ place: p, point });
            if (!hintSeen) setHintSeen();
          }}
          onPressPlace={(p) => {
            haptics.light();
            setPlace(p);
          }}
        >
          <TripLayers
            data={layerData}
            show={poster ? { trails: mapLayers.trails, plannable: false } : mapLayers}
            base={mapTheme.base}
            dark={theme.scheme === 'dark'}
            onPressDestination={(id) => {
              haptics.light();
              setPlace(null);
              setDestination(destinations?.find((d) => d.id === id) ?? null);
            }}
          />
          {friendsOn ? (
            <FriendLayers
              data={friendData}
              base={mapTheme.base}
              onPressPlace={(placeType, code) => {
                haptics.light();
                setPlace({
                  place_type: placeType,
                  place_code: code,
                  country_iso2: placeType === 'country' ? code : code.slice(0, 2),
                  name: placeType === 'region' ? (homeRegionName(code, 'en') ?? code) : mapCountryName(code, 'en'),
                });
              }}
            />
          ) : null}
          {todayData ? (
            <TodayLayers legs={todayData.legs} pins={todayData.pins} here={poster ? null : here} base={mapTheme.base} dark={theme.scheme === 'dark'} />
          ) : null}
        </WorldMap>
      </Animated.View>

      <View style={[styles.topLeft, { top }]} pointerEvents="box-none">
        <StoryCapsule
          visits={visits}
          home={home}
          scope={scope}
          stats={stats}
          today={capsuleToday}
          onPress={() => {
            setPlace(null);
            if (capsuleToday && todayTrip) router.push(`/trip/today/${todayTrip.id}`);
            else setStoryOpen(true);
          }}
        />
        {pending > 0 ? (
          <View style={styles.pending} accessibilityLiveRegion="polite">
            <MaterialCommunityIcons name="cloud-sync-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.pendingText}>{t('map.pending', { count: pending })}</Text>
          </View>
        ) : null}
      </View>

      <PressableScale
        style={[styles.round, styles.mapButton, { top: top + 4 }]}
        onPress={() => {
          setPlace(null); // one sheet at a time
          setSheetOpen(true);
        }}
        accessibilityLabel={t('map.sheetButton')}
        testID="map-sheet-button"
      >
        <MaterialCommunityIcons name="layers-outline" size={24} color={theme.colors.textPrimary} />
      </PressableScale>

      <View style={[styles.column, { bottom: DOCK_GAP + (dockHeight ? dockHeight + DOCK_GAP : 6) }]} pointerEvents="box-none">
        {todayTrip && here ? (
          <PressableScale
            style={styles.round}
            onPress={() => map.current?.focus([here.lon, here.lat])}
            accessibilityLabel={t('map.centreOnMe')}
            testID="map-centre-me"
          >
            <MaterialIcons name="near-me" size={24} color={theme.colors.link} />
          </PressableScale>
        ) : null}
        <PressableScale
          style={styles.round}
          onPress={() => {
            if (scope === 'home') map.current?.world();
            else {
              userMoved.current = false;
              map.current?.home();
            }
          }}
          accessibilityLabel={scope === 'home' ? t('map.showWorld') : t('map.showHome', { country: homeName })}
          testID="map-home-toggle"
        >
          {scope === 'home' ? (
            <MaterialCommunityIcons name="earth" size={24} color={theme.colors.textPrimary} />
          ) : (
            <MaterialIcons name="home" size={24} color={theme.colors.textPrimary} />
          )}
        </PressableScale>
        <PressableScale
          haptic="medium"
          style={[styles.round, styles.mark]}
          onPress={() => router.push({ pathname: '/map/add-place', params: { view } })}
          accessibilityLabel={t('map.addPlace')}
          testID="add-place-fab"
        >
          <MaterialIcons name="add" size={28} color={theme.colors.textPrimary} />
        </PressableScale>
      </View>

      {!hintSeen ? (
        <View style={[styles.hint, { bottom: DOCK_GAP + (dockHeight ? dockHeight + DOCK_GAP : 6) }]} pointerEvents="none" testID="mark-hint">
          <MaterialCommunityIcons name="gesture-tap-hold" size={18} color={theme.colors.textPrimary} />
          <Text style={styles.hintText}>{t('map.markHint')}</Text>
        </View>
      ) : null}

      <Dock state={dock} here={here} style={styles.dock} onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)} />

      <MapSheet
        open={sheetOpen}
        home={home}
        view={view}
        onSelectView={changeView}
        onAllThemes={() => {
          setSheetOpen(false);
          router.push('/map/theme');
        }}
        onClose={() => setSheetOpen(false)}
        layers={hasFriends ? ['trails', 'plannable', 'friends'] : ['trails', 'plannable']}
      />
      <DestinationSheet
        destination={destination}
        onClose={() => setDestination(null)}
        onPlan={(d) => {
          setDestination(null);
          router.push({ pathname: '/trip/new', params: { destination: d.name } });
        }}
        onOpen={(d) => {
          setDestination(null);
          router.push(`/destination/${d.id}`);
        }}
      />
      {me ? (
        <PlaceSheet
          place={place}
          userId={me.id}
          visits={visits}
          trips={trips}
          destinations={destinations}
          friends={place ? friendsAt(placeFootprints, place.place_type, place.place_code) : []}
          onOpenFriend={(id) => {
            setPlace(null);
            router.push(`/friends/compare/${id}`);
          }}
          onClose={() => setPlace(null)}
          onPlan={(d) => {
            setPlace(null);
            router.push(d ? { pathname: '/trip/new', params: { destination: d.name } } : '/trip/new');
          }}
          onOpenTrip={(id) => {
            setPlace(null);
            router.push(`/trip/${id}`);
          }}
          onSend={(p, name) => {
            setPlace(null);
            // A district goes as its division's card (cards have no districts)
            const division = p.place_type === 'district' ? HOME_DISTRICT_AREAS.features.find((f) => f.properties.code === p.place_code)?.properties.region : undefined;
            const card =
              p.place_type === 'district'
                ? mapPlaceCard('region', division ?? 'BD', name, { country: 'BD' })
                : mapPlaceCard(p.place_type, p.place_code, name, { country: p.country_iso2 ?? undefined });
            router.push({ pathname: '/share/send', params: { card: JSON.stringify(card) } });
          }}
        />
      ) : null}
      {quick && me ? (
        <QuickMark
          name={
            quick.place.place_type === 'region'
              ? (homeRegionName(quick.place.place_code, resolveLanguage(language)) ?? quick.place.name)
              : quick.place.place_type === 'district'
                ? (homeDistrictName(quick.place.place_code, resolveLanguage(language)) ?? quick.place.name)
                : quick.place.place_type === 'country'
                ? mapCountryName(quick.place.place_code, resolveLanguage(language))
                : quick.place.name
          }
          point={quick.point}
          status={statusOf(visits, quick.place.place_type, quick.place.place_code)}
          topInset={insets.top}
          onCancel={() => setQuick(null)}
          onPick={(choice) => {
            const ref = { place_type: quick.place.place_type, place_code: quick.place.place_code, country_iso2: quick.place.country_iso2 };
            if (choice === 'clear') clearVisit(queryClient, me.id, ref);
            else markPlace(ref, choice);
            setQuick(null);
          }}
        />
      ) : null}
      <StoryPanel
        open={storyOpen}
        onClose={() => setStoryOpen(false)}
        visits={visits}
        home={home}
        tripsPlanned={trips?.length}
        tripStats={tripStats}
        onReplay={() => {
          setStoryOpen(false);
          router.push('/map/replay');
        }}
        onPoster={() => {
          setStoryOpen(false);
          setPoster({ uri: null });
        }}
      />
      {poster ? (
        <PosterPreview
          mapUri={poster.uri}
          title={t('map.replay.posterTitle')}
          headline={posterHeadline}
          detail={posterDetail}
          onClose={() => setPoster(null)}
        />
      ) : null}
    </View>
  );
}

const ROUND = 48;
const DOCK_GAP = 12;
const MARK = 56;

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  map: { flex: 1 },
  // Clear of the Map button on the right
  topLeft: { position: 'absolute', left: t.spacing.lg, right: t.spacing.lg + ROUND + t.spacing.md, alignItems: 'flex-start', gap: t.spacing.sm },
  round: {
    ...glass(t),
    width: ROUND,
    height: ROUND,
    borderRadius: ROUND / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapButton: { position: 'absolute', right: t.spacing.lg },
  // Bottom-right, just above the dock
  column: { position: 'absolute', right: t.spacing.lg, alignItems: 'center', gap: t.spacing.md },
  dock: { position: 'absolute', left: DOCK_GAP, right: DOCK_GAP, bottom: DOCK_GAP },
  mark: { width: MARK, height: MARK, borderRadius: MARK / 2 },
  pending: {
    ...glass(t),
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: t.radius.chip,
  },
  pendingText: { ...t.type.footnote, color: t.colors.textSecondary },
  hint: {
    ...glass(t),
    position: 'absolute',
    left: DOCK_GAP,
    right: DOCK_GAP + ROUND + t.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: 44,
    paddingHorizontal: t.spacing.md,
    borderRadius: 22,
  },
  hintText: { ...t.type.footnote, color: t.colors.textPrimary, flex: 1 },
}));
