/**
 * Vromon Mobile — a friend's profile (prompt §6.4): their map (read-only, in your
 * theme), travel stats, photos, trips, Compare maps, and Remove / Block in the overflow menu.
 * Everything here is read-only and comes from routes the server only opens to friends.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, Text, View } from 'react-native';

import { friendKeys } from '../../src/features/friends/queries';
import { useFriendActions } from '../../src/features/friends/useFriendActions';
import { countryLabelPoint } from '../../src/features/map/geoData';
import { useVisits } from '../../src/features/map/visits';
import { previewBounds } from '../../src/features/mapThemes/preview';
import { ThemePreviewMap } from '../../src/features/mapThemes/ThemePreviewMap';
import { useMapTheme } from '../../src/features/mapThemes/useMapTheme';
import { PhotoGrid } from '../../src/features/photos/PhotoStrip';
import { friendsApi, visitsApi } from '../../src/services/api';
import { Avatar } from '../../src/ui/Avatar';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { PressableScale } from '../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../src/ui/theme';

const NO_FILTER = {};

export default function FriendScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const mapTheme = useMapTheme();
  const actions = useFriendActions();

  const profile = useQuery({ queryKey: friendKeys.profile(id), queryFn: () => friendsApi.profile(id), retry: false });
  const visits = useVisits(profile.data ? id : undefined);
  const stats = useQuery({ queryKey: friendKeys.stats(id), queryFn: () => visitsApi.stats(id), enabled: !!profile.data });
  const trips = useQuery({ queryKey: friendKeys.trips(id), queryFn: () => friendsApi.trips(id), enabled: !!profile.data });

  const countries = useMemo(() => (visits.data ?? []).filter((v) => v.place_type === 'country'), [visits.data]);
  const bounds = useMemo(
    () => previewBounds(countries.map((v) => countryLabelPoint(v.place_code)).filter((p): p is [number, number] => !!p)),
    [countries],
  );

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
        <Avatar name={name} size={72} />
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          {p ? <Text style={styles.username}>@{p.username}</Text> : null}
          {p?.friends_since ? <Text style={styles.meta}>{t('friends.friendsSince', { date: date(p.friends_since) })}</Text> : null}
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
          <View key={key} style={styles.tile}>
            <Text style={styles.tileValue}>{value ?? '–'}</Text>
            <Text style={styles.tileLabel}>{t(`friends.stats.${key}`)}</Text>
          </View>
        ))}
      </View>

      <Button label={t('friends.compare')} haptic="medium" icon="compare-horizontal" onPress={() => router.push(`/friends/compare/${id}`)} style={styles.compare} testID="compare-maps" />

      {p ? (
        <View style={styles.photos}>
          <PhotoGrid ownerId={id} filter={NO_FILTER} />
        </View>
      ) : null}

      <Text style={styles.sectionTitle} accessibilityRole="header">
        {t('friends.stats.trips')}
      </Text>
      {trips.data?.length ? (
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
  map: { height: 240, marginHorizontal: t.spacing.lg + 2, borderRadius: t.radius.card, overflow: 'hidden', backgroundColor: t.colors.surface },
  tiles: { flexDirection: 'row', gap: t.spacing.sm, margin: t.spacing.lg + 2 },
  tile: { flex: 1, alignItems: 'center', paddingVertical: t.spacing.md, borderRadius: 16, backgroundColor: t.colors.surface, gap: 2 },
  tileValue: { ...t.type.title, color: t.colors.textPrimary },
  tileLabel: { ...t.type.caption, color: t.colors.textSecondary },
  compare: { marginHorizontal: t.spacing.lg + 2, marginBottom: t.spacing.xxl },
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
