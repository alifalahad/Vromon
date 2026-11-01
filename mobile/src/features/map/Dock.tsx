/**
 * The dock (map home step 4, mockups 1–3): one glass card above the tab bar that
 * follows the moment (dock.ts): on a trip today, a trip coming up, an idea from
 * the Want list, or a nudge to start marking. Figures come from the trip's own
 * data (itinerary, budget) and the same helpers as Today mode; what hasn't
 * loaded is left out, never guessed. Crossfades between moments.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';

import { tripsApi } from '../../services/api';
import type { FriendFootprint, Trip } from '../../types';
import { glass } from '../../ui/GlassSurface';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { SUNSET_CARD } from '../../ui/theme/cards';
import { resolveLanguage } from '../../i18n';
import { usePreferences } from '../preferences/store';
import { friendlyRange, stopTitle } from '../trips/plan/timeline';
import { usePlanFormat } from '../trips/plan/usePlanFormat';
import { directionsUrl, pointOf, type Point } from '../trips/today/today';
import { localToday } from '../trips/dates';
import type { DockState, Idea } from './dockState';
import { friendColor } from './friendGeo';
import { initials } from '../../ui/Avatar';
import { homeRegionName } from './geoData';
import { mapCountryName } from './mapCountries';
import { useTripToday } from './useTripToday';

const MOTION = ReduceMotion.System;

export function Dock({
  state,
  here = null,
  onLayout,
  style,
}: {
  state: DockState;
  /** Where you are (Today mode's location setting), for "leave by" */
  here?: Point | null;
  onLayout?: (e: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const key = state.kind === 'today' || state.kind === 'upcoming' ? `${state.kind}-${state.trip.id}` : state.kind;
  return (
    <Animated.View
      key={key}
      entering={FadeIn.duration(180).reduceMotion(MOTION)}
      exiting={FadeOut.duration(120).reduceMotion(MOTION)}
      style={[styles.dock, style]}
      onLayout={onLayout}
      testID={`dock-${state.kind}`}
    >
      {state.kind === 'today' ? <TodayCard trip={state.trip} day={state.day} days={state.days} here={here} /> : null}
      {state.kind === 'upcoming' ? <UpcomingCard trip={state.trip} daysAway={state.daysAway} /> : null}
      {state.kind === 'social' ? <SocialCard footprint={state.footprint} /> : null}
      {state.kind === 'idea' ? <IdeaCard ideas={state.ideas} /> : null}
      {state.kind === 'empty' ? <EmptyCard /> : null}
    </Animated.View>
  );
}

// ── On a trip today ──────────────────────────────────────────────────────────

function TodayCard({ trip, day, days, here }: { trip: Trip; day: number; days: number; here: Point | null }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const today = useTripToday(trip, here);
  const next = today.state?.next ?? null;
  const items = today.day ? today.day.items.filter((i) => pointOf(i)) : [];
  const done = today.state ? today.state.done.filter((i) => pointOf(i)).length : 0;
  const to = next ? pointOf(next) : null;
  const leave = today.leave;

  return (
    <View style={styles.body}>
      {items.length > 0 ? (
        <View style={styles.segments} accessible accessibilityLabel={t('map.dock.stopsDone', { done: f.n(done), total: f.n(items.length) })}>
          {items.map((item, i) => (
            <View key={item.id} style={[styles.segment, i < done ? styles.segmentDone : item === next ? styles.segmentNext : null]} />
          ))}
        </View>
      ) : null}
      <View style={styles.row}>
        <View style={styles.texts}>
          <Text style={[styles.eyebrow, styles.eyebrowBlue]}>
            {next ? t('map.dock.nextAt', { time: f.time(next.start_time) }) : t('map.dock.dayOf', { day: f.n(day), days: f.n(days) })}
          </Text>
          <Text style={styles.title} numberOfLines={2}>
            {next ? stopTitle(next) : trip.title || trip.destination}
          </Text>
          <Text style={styles.line} numberOfLines={1}>
            {next && leave
              ? leave.source === 'road' && leave.km
                ? t('today.travelRoad', { mode: t(`plan.modes.${leave.mode}`), time: f.duration(leave.minutes), km: f.km(leave.km) })
                : t('today.travelAbout', { mode: t(`plan.modes.${leave.mode}`), time: f.duration(leave.minutes) })
              : today.state
                ? t('today.noNext')
                : t('map.dock.dayOf', { day: f.n(day), days: f.n(days) })}
          </Text>
        </View>
        {next && today.leaveIn != null ? (
          <View style={styles.leave} testID="dock-leave">
            <Text style={styles.leaveLabel}>{today.leaveIn > 0 ? t('map.dock.leaveIn') : ' '}</Text>
            <Text style={styles.leaveValue}>{today.leaveIn > 0 ? f.duration(today.leaveIn) : t('today.leaveNow')}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.buttons}>
        {to && leave ? (
          <PressableScale style={styles.primary} onPress={() => void Linking.openURL(directionsUrl(to, leave.mode))} testID="dock-directions">
            <Text style={styles.primaryText}>{t('today.directions')}</Text>
          </PressableScale>
        ) : (
          <PressableScale style={styles.primary} onPress={() => router.push(`/trip/today/${trip.id}`)} testID="dock-open-today">
            <Text style={styles.primaryText}>{t('map.dock.openToday')}</Text>
          </PressableScale>
        )}
        {next ? (
          <PressableScale style={styles.secondary} onPress={() => router.push({ pathname: '/trip/today/[id]', params: { id: String(trip.id), late: '1' } })} testID="dock-late">
            <Text style={styles.secondaryText}>{t('map.dock.runningLate')}</Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

// ── A trip coming up ─────────────────────────────────────────────────────────

function UpcomingCard({ trip, daysAway }: { trip: Trip; daysAway: number }) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const built = trip.status !== 'draft';
  const itinerary = useQuery({ queryKey: ['itinerary', trip.id], queryFn: () => tripsApi.getItinerary(trip.id), enabled: built });
  const budget = useQuery({ queryKey: ['budget', trip.id], queryFn: () => tripsApi.budget(trip.id), enabled: built });
  const stops = itinerary.data ? itinerary.data.days.reduce((n, d) => n + d.items.filter((i) => i.item_type === 'activity').length, 0) : null;
  const name = trip.title || trip.destination;
  const range = friendlyRange(trip.start_date, trip.end_date, i18n.language, localToday());

  return (
    <View style={styles.body}>
      <View style={styles.row}>
        <View style={styles.texts}>
          <Text style={[styles.eyebrow, styles.eyebrowSunset]}>{t('map.dock.nextTrip')}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.line} numberOfLines={1}>
            {range}
          </Text>
        </View>
        <View
          style={styles.countdown}
          accessible
          accessibilityLabel={daysAway === 0 ? t('trips.next.today') : t('map.dock.inDays', { count: daysAway, n: f.n(daysAway) })}
          testID="dock-countdown"
        >
          <Text style={styles.countdownValue}>{f.n(daysAway)}</Text>
          <Text style={styles.countdownLabel}>{t('map.dock.days', { count: daysAway })}</Text>
        </View>
      </View>
      <View style={styles.chips}>
        <View style={styles.chip}>
          <View style={[styles.chipDot, { backgroundColor: built ? '#5BC27A' : '#9C9C9C' }]} />
          <Text style={styles.chipText}>{built ? t('map.dock.planReady') : t('trips.next.notBuilt')}</Text>
        </View>
        {stops != null ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{t('map.dock.stops', { count: stops, n: f.n(stops) })}</Text>
          </View>
        ) : null}
        {budget.data ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{`≈ ${f.money(budget.data.estimated_total)}`}</Text>
          </View>
        ) : null}
      </View>
      <PressableScale style={styles.primary} onPress={() => router.push(`/trip/${trip.id}`)} testID="dock-open-trip">
        <Text style={styles.primaryText}>{t('map.dock.openTrip')}</Text>
      </PressableScale>
    </View>
  );
}

// ── An idea from the Want list ───────────────────────────────────────────────

function IdeaCard({ ideas }: { ideas: Idea[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const lang = resolveLanguage(usePreferences((s) => s.language));
  const [index, setIndex] = useState(0);
  const idea = ideas[index % ideas.length];
  // At most 5 dots; with more ideas they show roughly where you are
  const dotCount = Math.min(5, ideas.length);
  const activeDot = ideas.length <= 5 ? index % ideas.length : Math.round(((index % ideas.length) / (ideas.length - 1)) * (dotCount - 1));
  const { destination, place } = idea;
  const placeName =
    place.place_type === 'region' ? (homeRegionName(place.place_code, lang) ?? place.place_code) : mapCountryName(place.place_code, lang);

  return (
    <View style={styles.body}>
      <View style={styles.row}>
        <View style={styles.texts}>
          <Text style={[styles.eyebrow, styles.eyebrowBlue]}>{t('map.dock.fromWant')}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {destination.name}
          </Text>
          <Text style={styles.line} numberOfLines={1}>
            {destination.checked === false ? `${placeName} · ${t('map.dock.unchecked')}` : placeName}
          </Text>
        </View>
        {ideas.length > 1 ? (
          <View style={styles.dots} accessible accessibilityLabel={t('map.dock.ideaOf', { i: f.n(index % ideas.length + 1), n: f.n(ideas.length) })}>
            {Array.from({ length: dotCount }, (_, i) => (
              <View key={i} style={[styles.dot, i === activeDot ? { width: 16, backgroundColor: colors.textPrimary } : null]} />
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.buttons}>
        <PressableScale
          style={styles.primary}
          onPress={() => router.push({ pathname: '/trip/new', params: { destination: destination.name } })}
          testID="dock-plan"
        >
          <Text style={styles.primaryText}>{t('map.dock.planHere')}</Text>
        </PressableScale>
        {ideas.length > 1 ? (
          <PressableScale style={styles.secondary} haptic="selection" onPress={() => setIndex((i) => (i + 1) % ideas.length)} testID="dock-next-idea">
            <Text style={styles.secondaryText}>{t('map.dock.nextIdea')}</Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

// ── From your friends (Friends layer on) ─────────────────────────────────────

function SocialCard({ footprint }: { footprint: FriendFootprint }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const lang = resolveLanguage(usePreferences((s) => s.language));
  const setMapLayer = usePreferences((s) => s.setMapLayer);
  const friend = footprint.friends[0];
  const name = friend.display_name || friend.username;
  const place =
    footprint.place_type === 'region'
      ? (homeRegionName(footprint.place_code, lang) ?? footprint.place_code)
      : mapCountryName(footprint.place_code, lang);

  return (
    <View style={styles.body}>
      <View style={styles.socialRow}>
        <View style={[styles.socialAvatar, { backgroundColor: friendColor(friend.id) }]}>
          <Text style={styles.socialInitials}>{initials(name)}</Text>
        </View>
        <View style={styles.texts}>
          <Text style={[styles.eyebrow, styles.eyebrowPink]}>{t('map.dock.fromFriends')}</Text>
          <Text style={styles.socialTitle} numberOfLines={2}>
            {t('map.dock.friendMarked', { name, place })}
          </Text>
          {footprint.count > 1 ? (
            <Text style={styles.line}>{t('map.dock.friendsBeen', { count: footprint.count, n: f.n(footprint.count) })}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.buttons}>
        <PressableScale style={styles.primary} onPress={() => router.push(`/friends/compare/${friend.id}`)} testID="dock-compare">
          <Text style={styles.primaryText}>{t('map.dock.compare')}</Text>
        </PressableScale>
        <PressableScale style={styles.secondary} onPress={() => setMapLayer('friends', false)} testID="dock-hide-friends">
          <Text style={styles.secondaryText}>{t('map.dock.hideFriends')}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

// ── Nothing yet ──────────────────────────────────────────────────────────────

function EmptyCard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.body, styles.emptyRow]}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name="gesture-tap-hold" size={22} color={colors.textPrimary} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.emptyTitle}>{t('map.dock.emptyTitle')}</Text>
        <Text style={styles.line}>{t('map.dock.emptyBody')}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  dock: { ...glass(t), borderRadius: 28, padding: 18, paddingBottom: 16 },
  body: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: t.spacing.md },
  texts: { flex: 1, gap: 3 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase' },
  eyebrowBlue: { color: t.colors.link },
  eyebrowSunset: { color: t.scheme === 'dark' ? '#F5A06B' : SUNSET_CARD },
  title: { fontSize: 24, lineHeight: 29, fontWeight: '800', color: t.colors.textPrimary },
  line: { ...t.type.footnote, color: t.colors.textSecondary },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 5, borderRadius: 3, backgroundColor: t.colors.glassBorder },
  segmentDone: { backgroundColor: SUNSET_CARD },
  segmentNext: { backgroundColor: t.colors.link },
  leave: { alignItems: 'flex-end' },
  leaveLabel: { ...t.type.caption, fontWeight: '600', color: t.colors.textSecondary },
  leaveValue: { fontSize: 24, fontWeight: '800', color: t.scheme === 'dark' ? '#F5A06B' : SUNSET_CARD },
  countdown: { minWidth: 64, alignItems: 'center', paddingVertical: 6, borderRadius: 18, backgroundColor: 'rgba(240, 138, 75, 0.14)' },
  countdownValue: { fontSize: 32, lineHeight: 36, fontWeight: '800', color: t.scheme === 'dark' ? '#F5A06B' : SUNSET_CARD },
  countdownLabel: { ...t.type.caption, fontWeight: '600', color: t.scheme === 'dark' ? '#F5A06B' : SUNSET_CARD },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: t.colors.glassBorder },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { ...t.type.footnote, fontWeight: '500', color: t.colors.textPrimary },
  buttons: { flexDirection: 'row', gap: 10 },
  primary: { flex: 1, minHeight: 52, borderRadius: 26, backgroundColor: t.colors.accentStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { ...t.type.headline, fontSize: 16, color: t.colors.onAccent },
  secondary: { minHeight: 52, borderRadius: 26, backgroundColor: t.colors.glassBorder, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  secondaryText: { ...t.type.callout, fontWeight: '600', color: t.colors.textPrimary },
  dots: { flexDirection: 'row', gap: 5, paddingTop: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.colors.textTertiary },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  eyebrowPink: { color: t.scheme === 'dark' ? '#F2B8D2' : '#A3306B' },
  socialRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  socialAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  socialInitials: { ...t.type.headline, color: '#11151B' },
  socialTitle: { fontSize: 18, lineHeight: 23, fontWeight: '700', color: t.colors.textPrimary },
  emptyIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.colors.glassBorder, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { ...t.type.headline, color: t.colors.textPrimary },
}));
