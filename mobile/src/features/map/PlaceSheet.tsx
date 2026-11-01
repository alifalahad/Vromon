/**
 * Sheet for one place (tap a country, region or city; map home step 6, mockup 6):
 *
 * - its name (Bangla for the bundled home regions in Bangla) and what it is
 *   ("Division of Bangladesh");
 * - status as text and colour (never colour alone): Visited · Want · Lived ·
 *   Clear, a check on the chosen one;
 * - for countries, how many of its regions and cities are visited;
 * - your trips there (each opens the trip), friends who've been (step 9);
 * - your photos there (a country's include those of its regions and cities);
 * - "Plan a trip to …" when Vromon has a destination in the region; for a country
 *   with destinations, "Plan a trip in …" (the wizard, nothing chosen yet).
 */

import { MaterialIcons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveLanguage } from '../../i18n';
import type { Destination, Trip, Visit, VisitStatus } from '../../types';
import { Avatar } from '../../ui/Avatar';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { useSheetPresentation } from '../../ui/useSheetPresentation';
import { flagEmoji } from '../geo/countries';
import { readableOn } from '../mapThemes/color';
import { useMapTheme } from '../mapThemes/useMapTheme';
import { PhotoStrip } from '../photos/PhotoStrip';
import { usePreferences } from '../preferences/store';
import { friendlyRange } from '../trips/plan/timeline';
import { usePlanFormat } from '../trips/plan/usePlanFormat';
import { durationDays, localToday } from '../trips/dates';
import { homeRegionName } from './geoData';
import { regionWord } from './home';
import { mapCountryName } from './mapCountries';
import { useMarkPlace } from './useMarkPlace';
import { STATUS_ORDER } from './style';
import { clearVisit, statusOf, type PlaceRef } from './visits';
import type { PressedPlace } from './WorldMap';

const VISITED: VisitStatus[] = ['visited', 'lived'];

export type FriendHere = { id: string; name: string; username?: string | null };

export function insideCountry(visits: readonly Visit[], iso2: string) {
  const inside = visits.filter((v) => v.country_iso2 === iso2 && VISITED.includes(v.status));
  return { regions: inside.filter((v) => v.place_type === 'region').length, cities: inside.filter((v) => v.place_type === 'city').length };
}

/** Your trips that went to the place: by their stops, or by their destination. */
export function tripsAt(place: PlaceRef, trips: readonly Trip[], destinations: readonly Destination[]): Trip[] {
  const destOf = (t: Trip) => destinations.find((d) => d.name === t.destination);
  return trips
    .filter((t) => {
      const stops = t.stops ?? [];
      if (place.place_type === 'city') return stops.some((s) => String(s.city_geonameid) === place.place_code);
      if (place.place_type === 'region') return stops.some((s) => s.region_code === place.place_code) || destOf(t)?.region_code === place.place_code;
      return stops.some((s) => s.country_iso2 === place.place_code) || destOf(t)?.country_iso2 === place.place_code;
    })
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
}

/** The destination to suggest for a region: the one with the most places to plan from. */
export function destinationFor(place: PlaceRef, destinations: readonly Destination[]): Destination | null {
  if (place.place_type !== 'region') return null;
  const matches = destinations.filter((d) => d.region_code === place.place_code);
  return matches.sort((a, b) => (b.place_count ?? 0) - (a.place_count ?? 0))[0] ?? null;
}

export function PlaceSheet({
  place,
  userId,
  visits,
  trips = [],
  destinations = [],
  friends = [],
  onClose,
  onPlan,
  onOpenTrip,
  onOpenFriend,
  onSend,
}: {
  place: PressedPlace | null;
  userId: string;
  visits: readonly Visit[];
  trips?: readonly Trip[];
  destinations?: readonly Destination[];
  /** Friends who've been there (step 9) */
  friends?: readonly FriendHere[];
  onClose: () => void;
  /** A destination, or null for "somewhere in this country" */
  onPlan?: (d: Destination | null) => void;
  onOpenTrip?: (id: number) => void;
  onOpenFriend?: (id: string) => void;
  /** "Send to a friend": the place as a card (friends-chat step 4), with its name as shown here */
  onSend?: (place: PressedPlace, name: string) => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const mapTheme = useMapTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const markPlace = useMarkPlace(userId, visits);
  const lang = resolveLanguage(usePreferences((s) => s.language));

  const handleDismiss = useSheetPresentation(ref, !!place, onClose);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.3} pressBehavior="close" />,
    [],
  );

  const status = place ? statusOf(visits, place.place_type, place.place_code) : null;
  const counts = place?.place_type === 'country' ? insideCountry(visits, place.place_code) : null;
  const ref_: PlaceRef | null = place ? { place_type: place.place_type, place_code: place.place_code, country_iso2: place.country_iso2 } : null;
  const photoTarget = useMemo(() => (place ? { place_type: place.place_type, place_code: place.place_code } : null), [place]);
  const here = useMemo(() => (ref_ ? tripsAt(ref_, trips, destinations) : []), [ref_?.place_type, ref_?.place_code, trips, destinations]); // eslint-disable-line react-hooks/exhaustive-deps
  const destination = ref_ ? destinationFor(ref_, destinations) : null;
  const plansInCountry = place?.place_type === 'country' && destinations.some((d) => d.country_iso2 === place.place_code);

  const name =
    place?.place_type === 'region'
      ? (homeRegionName(place.place_code, lang) ?? place.name)
      : place?.place_type === 'country'
        ? mapCountryName(place.place_code, lang)
        : place?.name;
  const country = place?.country_iso2 ? mapCountryName(place.country_iso2, lang) : '';
  const kind =
    place?.place_type === 'region' && place.country_iso2
      ? t(regionWord(place.country_iso2) === 'divisions' ? 'map.place.divisionOf' : 'map.place.regionOf', { country })
      : place?.place_type === 'city' && country
        ? t('map.place.cityIn', { country })
        : place
          ? t(`map.placeType.${place.place_type}`)
          : '';
  const today = localToday();

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      stackBehavior="replace"
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} testID="place-sheet">
        {place && ref_ ? (
          <>
            <View style={styles.header}>
              {place.place_type === 'country' && place.country_iso2 ? <Text style={styles.flag}>{flagEmoji(place.country_iso2)}</Text> : null}
              <View style={styles.titles}>
                <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
                  {name}
                </Text>
                <Text style={styles.subtitle}>
                  {kind}
                  {status ? ` · ${t(`map.status.${status}`)}` : ''}
                </Text>
              </View>
              <PressableScale style={styles.close} onPress={() => ref.current?.dismiss()} accessibilityLabel={t('common.close')}>
                <MaterialIcons name="close" size={24} color={colors.textPrimary} />
              </PressableScale>
            </View>

            <View style={styles.segment} accessibilityRole="radiogroup">
              {STATUS_ORDER.map((s) => {
                const on = s === status;
                const fill = mapTheme.status[s];
                return (
                  <PressableScale
                    key={s}
                    haptic="none"
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={t(`map.status.${s}`)}
                    testID={`status-${s}`}
                    style={[styles.segmentItem, on && { backgroundColor: fill, borderColor: mapTheme.outline[s] ?? fill }]}
                    onPress={() => {
                      if (!on) markPlace(ref_, s);
                    }}
                  >
                    {on ? <MaterialIcons name="check" size={16} color={readableOn(fill)} /> : null}
                    <Text style={[styles.segmentText, on && { color: readableOn(fill) }]} numberOfLines={1}>
                      {t(`map.statusShort.${s}`)}
                    </Text>
                  </PressableScale>
                );
              })}
              <PressableScale
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel={t('map.clear')}
                accessibilityState={{ disabled: !status }}
                disabled={!status}
                style={[styles.segmentItem, styles.clearItem]}
                onPress={() => clearVisit(queryClient, userId, ref_)}
                testID="status-clear"
              >
                <Text style={[styles.segmentText, !status && styles.dim]}>{t('map.clear')}</Text>
              </PressableScale>
            </View>

            {counts ? (
              <Text style={styles.counts}>
                {t('map.insideCountry', {
                  regions: t('map.regionsCount', { count: counts.regions, n: f.n(counts.regions) }),
                  cities: t('map.citiesCount', { count: counts.cities, n: f.n(counts.cities) }),
                })}
              </Text>
            ) : null}

            {here.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.heading}>{t('map.place.yourTrips')}</Text>
                {here.slice(0, 3).map((trip) => (
                  <PressableScale
                    key={trip.id}
                    style={styles.trip}
                    onPress={() => onOpenTrip?.(trip.id)}
                    accessibilityRole="button"
                    testID={`place-trip-${trip.id}`}
                  >
                    <View style={styles.tripIcon}>
                      <MaterialIcons name="route" size={22} color={colors.link} />
                    </View>
                    <View style={styles.tripText}>
                      <Text style={styles.tripName} numberOfLines={1}>
                        {trip.title || trip.destination}
                      </Text>
                      <Text style={styles.tripWhen}>
                        {`${friendlyRange(trip.start_date, trip.end_date, i18n.language, today)} · ${t('trips.durationDays', {
                          count: durationDays(trip.start_date, trip.end_date),
                        })}`}
                      </Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
                  </PressableScale>
                ))}
              </View>
            ) : null}

            {friends.length > 0 ? (
              <PressableScale style={styles.friends} onPress={() => onOpenFriend?.(friends[0].id)} accessibilityRole="button" testID="place-friends">
                <View style={styles.avatars}>
                  {friends.slice(0, 3).map((fr, i) => (
                    <View key={fr.id} style={[styles.avatarWrap, i > 0 && { marginLeft: -10 }]}>
                      <Avatar name={fr.name} id={fr.id} size={30} />
                    </View>
                  ))}
                </View>
                <Text style={styles.friendsText} numberOfLines={2}>
                  {friendsLine(friends, t, f.n)}
                </Text>
              </PressableScale>
            ) : null}

            <PhotoStrip ownerId={userId} filter={{ place_type: place.place_type, place_code: place.place_code }} target={photoTarget} canEdit />

            {onPlan && (destination || plansInCountry) ? (
              <PressableScale style={styles.plan} onPress={() => onPlan(destination)} testID="place-plan">
                <Text style={styles.planText}>
                  {destination
                    ? t(here.length ? 'map.place.planAnother' : 'map.place.plan', { name: destination.name })
                    : t('map.place.planIn', { name })}
                </Text>
              </PressableScale>
            ) : null}

            {onSend && name ? (
              <PressableScale
                style={styles.send}
                onPress={() => onSend(place, name)}
                accessibilityRole="button"
                accessibilityLabel={t('chat.share.sendPlace', { place: name })}
                testID="place-send"
              >
                <MaterialIcons name="send" size={20} color={colors.textPrimary} />
                <Text style={styles.sendText}>{t('chat.share.sendToFriend')}</Text>
              </PressableScale>
            ) : null}
          </>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

type T = ReturnType<typeof useTranslation>['t'];

/** "Rafi has been here", "Rafi and Nadia…", "Rafi, Nadia and 2 more…" */
export function friendsLine(friends: readonly FriendHere[], t: T, n: (v: number) => string): string {
  const [a, b] = friends;
  if (friends.length === 1) return t('map.place.friendsOne', { a: a.name });
  if (friends.length === 2) return t('map.place.friendsTwo', { a: a.name, b: b.name });
  return t('map.place.friendsMore', { a: a.name, b: b.name, count: friends.length - 2, n: n(friends.length - 2) });
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  content: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.sm, gap: t.spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  flag: { fontSize: 40 },
  titles: { flex: 1, gap: 2 },
  title: { ...t.type.title, fontSize: 26, fontWeight: '800', color: t.colors.textPrimary },
  subtitle: { ...t.type.callout, color: t.colors.textSecondary },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', backgroundColor: t.colors.surfaceInset, borderRadius: 16, padding: 4, gap: 4 },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  clearItem: { flex: 0, minWidth: 64 },
  segmentText: { ...t.type.footnote, fontWeight: '600', color: t.colors.textSecondary },
  dim: { opacity: 0.45 },
  counts: { ...t.type.callout, color: t.colors.textSecondary, textAlign: 'center' },
  section: { gap: t.spacing.sm },
  heading: { ...t.type.footnote, fontWeight: '600', color: t.colors.textSecondary },
  trip: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, padding: t.spacing.md, borderRadius: 18, backgroundColor: t.colors.surfaceInset },
  tripIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  tripText: { flex: 1, gap: 2 },
  tripName: { ...t.type.body, fontWeight: '600', color: t.colors.textPrimary },
  tripWhen: { ...t.type.footnote, color: t.colors.textSecondary },
  friends: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 48 },
  avatars: { flexDirection: 'row' },
  avatarWrap: { borderRadius: 17, borderWidth: 2, borderColor: t.colors.surface },
  friendsText: { ...t.type.callout, color: t.colors.textPrimary, flex: 1 },
  plan: { minHeight: 54, borderRadius: 27, backgroundColor: t.colors.accentStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  planText: { ...t.type.headline, fontSize: 16, color: t.colors.onAccent, textAlign: 'center' },
  send: { minHeight: 48, borderRadius: 24, backgroundColor: t.colors.surfaceRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  sendText: { ...t.type.callout, fontWeight: '600', color: t.colors.textPrimary },
}));
