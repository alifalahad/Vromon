/**
 * "About this trip" at the bottom of the plan sheet (docs/ui-refresh step 14, frame 29), in place of the
 * old "Trip details": one list, each row with what's set now, opening the screen or sheet that changes
 * it: your must-dos, where you stay, meals, planning together, the route, photos (shown in place) and
 * your preferences. A friend's trip shows the same rows to read, without the ones only the owner sees.
 * The plan feedback form stays at the end, and "How was your trip?" where it was (until step 16).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { FeedbackForm } from '../../../components/FeedbackForm';
import { placesApi } from '../../../services/api';
import type { Conversation, Stays, Trip } from '../../../types';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { PhotoStrip } from '../../photos/PhotoStrip';
import { usePhotos } from '../../photos/queries';
import { localToday } from '../dates';
import { planSummary } from '../meals/meals';
import { useMustDoText } from '../new/useMustDoText';
import { canRate } from '../review/review';
import { TripReviewCard } from '../review/TripReviewCard';
import { pickName, picksFromStays } from '../stays/stays';
import { usePlanFormat } from './usePlanFormat';

type T = (k: string, o?: Record<string, unknown>) => string;

/** "Hotel Beach Way, both nights", "Hotel X, all 4 nights", "2 places: Hotel X, Uncle's house" */
export function staysText(stays: Stays, t: T, n: (v: number) => string): string | null {
  if (!stays.nights || !stays.stays.length) return null;
  const names = [...new Set(picksFromStays(stays.stays, stays.nights).map((p) => pickName(p, t)))];
  if (names.length > 1) return t('about.stayMany', { n: n(names.length), list: names.join(', ') });
  if (stays.nights === 1) return t('about.stayOne', { place: names[0] });
  return stays.nights === 2 ? t('about.stayBoth', { place: names[0] }) : t('about.stayAll', { place: names[0], n: n(stays.nights) });
}

export function AboutTrip({
  trip,
  ownerId,
  mine,
  hasPlan,
  went = mine,
  stays,
  room,
  onStays,
  onMeals,
  note,
}: {
  trip: Trip;
  ownerId: string | undefined;
  mine: boolean;
  hasPlan: boolean;
  /** The owner or a member of the trip's room: they rate it (trip upgrades step 7, D8) */
  went?: boolean;
  /** Where you stay (only the owner has it) */
  stays?: Stays | null;
  /** The trip's room, once someone was invited */
  room?: Conversation | null;
  onStays?: () => void;
  onMeals?: () => void;
  /** Where the plan's road times come from, under the list */
  note?: string | null;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const f = usePlanFormat();
  const text = useMustDoText();
  const photoTarget = useMemo(() => ({ trip_id: trip.id }), [trip.id]);
  const photos = usePhotos(ownerId, photoTarget);
  const [showPhotos, setShowPhotos] = useState(false);
  const pref = trip.preference;
  const cons = trip.constraints;
  const musts = cons?.must_sees ?? [];
  const busy = cons?.busy ?? [];
  const skip = cons?.excluded_places ?? [];
  const places = useQuery({
    queryKey: ['places', trip.destination],
    queryFn: () => placesApi.list({ destination: trip.destination }),
    enabled: musts.length + skip.length > 0,
  });
  const placeName = (id: number) => places.data?.find((p) => p.id === id)?.name ?? '…';

  const mustDos = [
    ...musts.map((m) => [placeName(m.place_id), text.wanted(m)].filter(Boolean).join(' ')),
    ...busy.map((b) => (b.label ? `${b.label} ${text.busyWhen(b, trip.start_date)}` : t('about.busyAt', { when: text.busyWhen(b, trip.start_date) }))),
    pref?.arrive_time ? t('mustDos.arrives', { time: f.time(pref.arrive_time) }) : null,
    pref?.leave_time ? t('mustDos.leaves', { time: f.time(pref.leave_time) }) : null,
    skip.length ? t('mustDos.skipList', { list: skip.map(placeName).join(', ') }) : null,
  ].filter(Boolean);
  const stayLine = mine && stays ? staysText(stays, t, f.n) : null;
  const photoCount = photos.data?.length ?? 0;
  const route = trip.stops?.length ? trip.stops.map((s) => s.city_name ?? s.country_name).join(' → ') : t('trips.noStops');
  const prefs = pref
    ? [
        pref.interests.map((i) => t(`interests.${i}`, { defaultValue: i })).join(', '),
        t(`newTrip.paces.${pref.travel_style}`, { defaultValue: pref.travel_style }),
        `${f.time(pref.preferred_start_time)}–${f.time(pref.preferred_end_time)}`,
        cons?.avoid_crowded ? t('plan.avoidCrowds') : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  const rows: { key: string; title: string; value: string; onPress?: () => void; testID: string; expanded?: boolean }[] = [];
  if (pref) {
    rows.push({
      key: 'must',
      title: t('mustDos.section'),
      value: mustDos.length ? mustDos.join(' · ') : t('about.noneYet'),
      onPress: mine ? () => router.push({ pathname: '/trip/must-dos/[id]', params: { id: trip.id } }) : undefined,
      testID: mine ? 'edit-must-dos' : 'trip-must-dos',
    });
  }
  if (stayLine) rows.push({ key: 'stay', title: t('about.stay'), value: stayLine, onPress: onStays, testID: 'about-stays' });
  if (pref && (mine || pref.meals)) {
    rows.push({ key: 'meals', title: t('meals.title'), value: planSummary(pref.meals, t), onPress: mine ? onMeals : undefined, testID: 'about-meals' });
  }
  if (mine) {
    const people = room?.members?.length ?? 0;
    rows.push({
      key: 'together',
      title: t('about.together'),
      value: people > 1 ? t('about.roomPeople', { count: people, n: f.n(people) }) : t('about.invite'),
      onPress: () => router.push({ pathname: '/trip/invite/[id]', params: { id: String(trip.id) } }),
      testID: 'about-together',
    });
  }
  rows.push({
    key: 'route',
    title: t('trips.route'),
    value: route,
    onPress: mine ? () => router.push({ pathname: '/trip/route/[id]', params: { id: trip.id } }) : undefined,
    testID: mine ? 'edit-route' : 'trip-route',
  });
  rows.push({
    key: 'photos',
    title: t('photos.title'),
    value: photoCount ? t('about.photos', { count: photoCount, n: f.n(photoCount) }) : t('about.noneYet'),
    // Shown here, in place: there's no screen of a trip's photos
    onPress: () => setShowPhotos((v) => !v),
    testID: 'about-photos',
    expanded: showPhotos,
  });
  if (prefs) rows.push({ key: 'prefs', title: t('about.prefs'), value: prefs, testID: 'about-prefs' });

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading} accessibilityRole="header">
        {t('plan.about')}
      </Text>
      <View style={styles.card}>
        {rows.map((r, i) => (
          <React.Fragment key={r.key}>
            {i > 0 ? <View style={styles.divider} /> : null}
            <Row title={r.title} value={r.value} onPress={r.onPress} expanded={r.expanded} testID={r.testID} />
            {r.key === 'photos' && showPhotos ? (
              <View style={styles.photos}>
                <PhotoStrip ownerId={ownerId} filter={photoTarget} target={photoTarget} canEdit={mine} title={null} />
              </View>
            ) : null}
          </React.Fragment>
        ))}
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}

      {mine && hasPlan && <FeedbackForm tripId={trip.id} />}

      {/* "How was your trip?" from its first day (trip upgrades step 7) */}
      {went && canRate(trip, localToday()) ? <TripReviewCard trip={trip} /> : null}
    </View>
  );
}

function Row({ title, value, onPress, expanded, testID }: { title: string; value: string; onPress?: () => void; expanded?: boolean; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const inside = (
    <>
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.value} numberOfLines={3}>
          {value}
        </Text>
      </View>
      {onPress ? (
        <MaterialCommunityIcons name={expanded == null ? 'chevron-right' : expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textTertiary} />
      ) : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={`${title}: ${value}`} testID={testID}>
        {inside}
      </View>
    );
  }
  return (
    <PressableScale
      pressEffect="opacity"
      haptic="selection"
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${value}`}
      accessibilityState={expanded == null ? undefined : { expanded }}
      testID={testID}
    >
      {inside}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.spacing.md, marginTop: 22 },
  heading: { ...t.type.title, fontSize: 19, lineHeight: 24, color: t.colors.textPrimary, paddingHorizontal: t.spacing.xs },
  card: { borderRadius: 22, borderWidth: 1, borderColor: t.colors.border, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: t.colors.divider },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 8, paddingLeft: 16, paddingRight: 10 },
  texts: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '500', color: t.colors.textPrimary },
  value: { fontSize: 13, color: t.colors.textSecondary },
  photos: { paddingHorizontal: 16, paddingBottom: 12 },
  note: { fontSize: 12.5, lineHeight: 18, color: t.colors.textSecondary, paddingHorizontal: t.spacing.xs },
}));
