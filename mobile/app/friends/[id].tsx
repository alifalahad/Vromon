/**
 * Vromon Mobile — a friend's profile (prompt §6.4): their map (read-only, in your
 * theme), travel stats, photos, trips, Message (friends-chat step 3), Compare maps,
 * and Remove / Block in the overflow menu. A chip says when they're on a trip or leaving
 * soon (step 6); someone who hides their trips from friends shows neither the chip nor
 * the trips.
 * Everything here is read-only and comes from routes the server only opens to friends.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, Text, View } from 'react-native';

import { chatName } from '../../src/features/chat/format';
import { openChatWith, useConversations } from '../../src/features/chat/queries';
import { tripLine } from '../../src/features/friends/onTheRoad';
import { friendKeys, useRoadTripOf } from '../../src/features/friends/queries';
import { useFriendActions } from '../../src/features/friends/useFriendActions';
import { countryLabelPoint } from '../../src/features/map/geoData';
import { useVisits } from '../../src/features/map/visits';
import { previewBounds } from '../../src/features/mapThemes/preview';
import { ThemePreviewMap } from '../../src/features/mapThemes/ThemePreviewMap';
import { useMapTheme } from '../../src/features/mapThemes/useMapTheme';
import { PhotoGrid } from '../../src/features/photos/PhotoStrip';
import { usePlanFormat } from '../../src/features/trips/plan/usePlanFormat';
import { friendsApi, visitsApi } from '../../src/services/api';
import { Avatar } from '../../src/ui/Avatar';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { PressableScale } from '../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { notify } from '../../src/utils/dialogs';

const NO_FILTER = {};

export default function FriendScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const mapTheme = useMapTheme();
  const actions = useFriendActions();
  const client = useQueryClient();
  const [opening, setOpening] = useState(false);

  // Always asked again on opening: what a friend shares (their trips) can change at any time
  const profile = useQuery({ queryKey: friendKeys.profile(id), queryFn: () => friendsApi.profile(id), retry: false, staleTime: 0 });
  const visits = useVisits(profile.data ? id : undefined);
  const stats = useQuery({ queryKey: friendKeys.stats(id), queryFn: () => visitsApi.stats(id), enabled: !!profile.data });
  const sharesTrips = profile.data?.shares_trips !== false;
  const trips = useQuery({ queryKey: friendKeys.trips(id), queryFn: () => friendsApi.trips(id), enabled: !!profile.data && sharesTrips, staleTime: 0 });
  // Hidden now: their trips mustn't stay in the cache (it's saved on the phone)
  useEffect(() => {
    if (!sharesTrips) client.removeQueries({ queryKey: friendKeys.trips(id) });
  }, [sharesTrips, client, id]);
  // Trip rooms you're both in (friends-chat step 7)
  const conversations = useConversations(!!profile.data);
  const together = (conversations.data ?? []).filter((c) => c.kind === 'trip' && !!c.trip && c.members?.some((m) => m.id === id));
  const onTrip = useRoadTripOf(profile.data && !profile.data.is_self && sharesTrips ? id : null);

  const countries = useMemo(() => (visits.data ?? []).filter((v) => v.place_type === 'country'), [visits.data]);
  const bounds = useMemo(() => previewBounds(countries.map((v) => countryLabelPoint(v.place_code)).filter((p): p is [number, number] => !!p)), [countries]);

  if (profile.isError) {
    // Unfriended or blocked meanwhile: the server answers 404 and nothing is shown
    return (
      <View style={[styles.container, styles.center]} testID="friend-unavailable">
        <Stack.Screen options={{ title: '' }} />
        <MaterialCommunityIcons name="account-off-outline" size={56} color={colors.textTertiary} />
        <Text style={styles.body}>{t('friends.unavailable')}</Text>
        <Button variant="secondary" label={t('common.back')} onPress={() => router.back()} />
      </View>
    );
  }

  const p = profile.data;
  const name = p ? (p.display_name ?? p.username) : '';
  const back = () => router.back();
  const openMenu = () => {
    haptics.light();
    Alert.alert(name, undefined, [
      { text: t('friends.remove'), onPress: () => actions.remove(id, name, back) },
      { text: t('friends.block'), style: 'destructive', onPress: () => actions.block(id, name, back) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };
  const s = stats.data;
  // Date-only strings are local dates; `new Date('2026-11-12')` would read them as UTC midnight
  const date = (iso: string) =>
    new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="friend-screen">
      <Stack.Screen
        options={{
          title: name,
          headerRight: () => (
            <PressableScale style={styles.menu} haptic="none" onPress={openMenu} accessibilityLabel={t('friends.more')} testID="friend-menu">
              <MaterialCommunityIcons name="dots-vertical" size={26} color={colors.textPrimary} />
            </PressableScale>
          ),
        }}
      />
      <View style={styles.header}>
        <Avatar name={name} id={id} size={72} />
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          {p ? <Text style={styles.username}>@{p.username}</Text> : null}
          {p?.friends_since ? <Text style={styles.meta}>{t('friends.friendsSince', { date: date(p.friends_since) })}</Text> : null}
          {onTrip ? (
            // One stop for screen readers: the pin is a glyph they'd read out (step 10)
            <View style={styles.chip} accessible accessibilityLabel={tripLine(onTrip, t, i18n.language, f.n)} testID="friend-trip-chip">
              <MaterialCommunityIcons name="map-marker-outline" size={15} color={colors.onAccentSoft} />
              <Text style={styles.chipText} numberOfLines={1}>
                {tripLine(onTrip, t, i18n.language, f.n)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.map} accessible accessibilityLabel={t('friends.mapLabel', { name, count: countries.length })}>
        <ThemePreviewMap theme={mapTheme} content={{ mode: 'map', visits: countries }} bounds={bounds} />
      </View>

      <View style={styles.tiles}>
        {(
          [
            ['countries', s?.countries],
            ['regions', s?.regions],
            ['cities', s?.cities],
            ['world', s ? `${s.world_percent}%` : undefined],
          ] as const
        ).map(([key, value]) => (
          // One stop each ("1 Countries"), and one line each that shrinks with large text
          // instead of breaking inside a word (step 10)
          <View key={key} style={styles.tile} accessible accessibilityLabel={`${value ?? '–'} ${t(`friends.stats.${key}`)}`}>
            <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {value ?? '–'}
            </Text>
            <Text style={styles.tileLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {t(`friends.stats.${key}`)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.buttons}>
        <Button
          label={t('chat.message')}
          icon="message-text-outline"
          loading={opening}
          onPress={async () => {
            setOpening(true);
            try {
              const chat = await openChatWith(client, id);
              router.push({ pathname: '/chat/[id]', params: { id: String(chat) } });
            } catch (e) {
              notify(t('common.error'), e instanceof Error ? e.message : '', 'error');
            } finally {
              setOpening(false);
            }
          }}
          style={styles.button}
          testID="friend-message"
        />
        <Button
          label={t('friends.compare')}
          variant="secondary"
          icon="compare-horizontal"
          onPress={() => router.push(`/friends/compare/${id}`)}
          style={styles.button}
          testID="compare-maps"
        />
      </View>

      {p ? (
        <View style={styles.photos}>
          <PhotoGrid ownerId={id} filter={NO_FILTER} />
        </View>
      ) : null}

      {together.length ? (
        <>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('tripRoom.together')}
          </Text>
          {together.map((room) => (
            <PressableScale
              key={room.id}
              pressEffect="opacity"
              style={styles.trip}
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: String(room.id) } })}
              accessibilityRole="button"
              accessibilityLabel={`${chatName(room, t)}, ${date(room.trip!.start_date)} – ${date(room.trip!.end_date)}`}
              testID={`together-${room.id}`}
            >
              <MaterialCommunityIcons name="forum-outline" size={22} color={colors.textSecondary} />
              <View style={styles.headerText}>
                <Text style={styles.tripName}>{chatName(room, t)}</Text>
                <Text style={styles.meta}>
                  {date(room.trip!.start_date)} – {date(room.trip!.end_date)}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textTertiary} />
            </PressableScale>
          ))}
        </>
      ) : null}

      {sharesTrips ? (
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t('friends.stats.trips')}
        </Text>
      ) : null}
      {!sharesTrips ? null : trips.data?.length ? (
        trips.data.map((trip) => (
          <PressableScale
            key={trip.id}
            pressEffect="opacity"
            style={styles.trip}
            onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })}
            accessibilityLabel={`${trip.destination}, ${date(trip.start_date)} – ${date(trip.end_date)}`}
            testID={`friend-trip-${trip.id}`}
          >
            <MaterialCommunityIcons name="calendar-range" size={22} color={colors.textSecondary} />
            <View style={styles.headerText}>
              <Text style={styles.tripName}>{trip.stops?.length ? trip.stops.map((st) => st.city_name ?? st.country_name).join(' → ') : trip.destination}</Text>
              <Text style={styles.meta}>
                {date(trip.start_date)} – {date(trip.end_date)}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textTertiary} />
          </PressableScale>
        ))
      ) : (
        <Text style={[styles.meta, styles.indent]}>{trips.isPending ? '' : t('friends.noTrips')}</Text>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  content: { paddingBottom: 48 },
  center: { alignItems: 'center', justifyContent: 'center', gap: t.spacing.lg, padding: t.spacing.xxl },
  menu: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg, padding: t.spacing.lg + 2 },
  headerText: { flex: 1, gap: 2 },
  name: { ...t.type.title, fontSize: 26, color: t.colors.textPrimary },
  body: { ...t.type.body, color: t.colors.textSecondary, textAlign: 'center' },
  username: { ...t.type.body, color: t.colors.textSecondary },
  meta: { ...t.type.footnote, color: t.colors.textSecondary },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: t.spacing.xs,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: t.colors.accentSoft,
  },
  chipText: { ...t.type.footnote, fontWeight: '600', color: t.colors.onAccentSoft, flexShrink: 1 },
  map: { height: 240, marginHorizontal: t.spacing.lg + 2, borderRadius: t.radius.card, overflow: 'hidden', backgroundColor: t.colors.surface },
  tiles: { flexDirection: 'row', gap: t.spacing.sm, margin: t.spacing.lg + 2 },
  tile: { flex: 1, alignItems: 'center', paddingVertical: t.spacing.md, paddingHorizontal: t.spacing.xs, borderRadius: 16, backgroundColor: t.colors.surface, gap: 2 },
  // As wide as the tile, so large text shrinks to fit it
  tileValue: { ...t.type.title, color: t.colors.textPrimary, alignSelf: 'stretch', textAlign: 'center' },
  tileLabel: { ...t.type.caption, color: t.colors.textSecondary, alignSelf: 'stretch', textAlign: 'center' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm, marginHorizontal: t.spacing.lg + 2, marginBottom: t.spacing.xxl },
  // Side by side; with large text they wrap onto two lines instead of cutting off
  button: { flexGrow: 1, flexBasis: 150 },
  photos: { paddingHorizontal: t.spacing.lg + 2, marginBottom: t.spacing.xxl },
  sectionTitle: {
    ...t.type.footnote,
    fontWeight: '600',
    color: t.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: t.spacing.lg + 2,
    marginBottom: t.spacing.sm,
  },
  trip: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg + 2, minHeight: 60 },
  tripName: { ...t.type.headline, color: t.colors.textPrimary },
  indent: { paddingHorizontal: t.spacing.lg + 2 },
}));
