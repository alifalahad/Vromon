/**
 * Vromon Mobile — Compare maps (prompt §6.7, 07-theme-friends-compare-rustic.jpg).
 *
 * Legend (In common · You · Friend) in your theme's comparison colours, the map for
 * Countries / Regions / Cities, and the counts, each opening its list of places.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { CompareMap, type CompareMapHandle } from '../../../src/features/friends/CompareMap';
import { PosterPreview } from '../../../src/features/map/Poster';
import { friendKeys } from '../../../src/features/friends/queries';
import { flagEmoji } from '../../../src/features/geo/countries';
import { useMe } from '../../../src/features/account/useMe';
import { countryLabelPoint } from '../../../src/features/map/geoData';
import { regionWord } from '../../../src/features/map/home';
import type { MapLevel } from '../../../src/features/map/levels';
import { useMapTheme } from '../../../src/features/mapThemes/useMapTheme';
import { friendsApi } from '../../../src/services/api';
import type { ComparePlace } from '../../../src/types';
import { PressableScale } from '../../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../../src/ui/theme';

type Group = 'in_common' | 'only_me' | 'only_them';const BANGLADESH: [number, number] = [90.35, 23.7];

export default function CompareScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: me } = useMe();
  const theme = useMapTheme();
  // The lists follow the map's zoom: countries zoomed out, regions closer in, cities closest
  const [level, setLevel] = useState<MapLevel>('country');
  const view = level === 'country' ? 'countries' : level === 'city' ? 'cities' : 'regions';
  const [open, setOpen] = useState<Group | null>(null);
  // Export: a story-sized poster of the comparison map, to save or share
  const mapRef = useRef<CompareMapHandle>(null);
  const [poster, setPoster] = useState<{ uri: string | null } | null>(null);
  const exportPoster = async () => {
    setPoster({ uri: null });
    setPoster({ uri: (await mapRef.current?.snapshot()) ?? null });
  };

  const profile = useQuery({ queryKey: friendKeys.profile(id), queryFn: () => friendsApi.profile(id) });
  const compare = useQuery({ queryKey: friendKeys.compare(id), queryFn: () => friendsApi.compare(id) });
  const name = profile.data ? (profile.data.display_name ?? profile.data.username) : '';
  const data = compare.data?.[view];
  // Start over the first country you share, else theirs, else yours
  const firstCountry = compare.data?.countries.in_common[0] ?? compare.data?.countries.only_them[0] ?? compare.data?.countries.only_me[0];
  const center = (firstCountry && countryLabelPoint(firstCountry.code)) || BANGLADESH;

  const legend: [string, string][] = [
    [t('mapTheme.inCommon'), theme.compare.inCommon],
    [t('mapTheme.you'), theme.compare.you],
    [name || t('mapTheme.friend'), theme.compare.friend],
  ];
  const groups: [Group, string][] = data
    ? [
        ['in_common', t('friends.inCommonCount', { count: data.in_common.length })],
        ['only_me', t('friends.onlyYou', { count: data.only_me.length })],
        ['only_them', t('friends.onlyThem', { count: data.only_them.length, name })],
      ]
    : [];

  return (
    <View style={styles.container} testID="compare-screen">
      <Stack.Screen
        options={{
          title: t('friends.compare'),
          headerRight: () =>
            data ? (
              <PressableScale onPress={exportPoster} hitSlop={10} accessibilityLabel={t('friends.exportCompare')} testID="compare-export">
                <MaterialCommunityIcons name="export-variant" size={24} color={colors.textPrimary} />
              </PressableScale>
            ) : null,
        }}
      />
      <View style={styles.legend} testID="compare-legend">
        {legend.map(([label, color]) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: color }]} />
            <Text style={styles.legendText} numberOfLines={1}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.map}>
        {compare.data ? (
          <CompareMap
            ref={mapRef}
            theme={theme}
            data={compare.data}
            center={center}
            onLevelChange={(l) => {
              setLevel(l);
              setOpen(null);
            }}
          />
        ) : null}
      </View>

      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <Text style={styles.levelTitle} accessibilityRole="header" testID="compare-level">
          {t(`map.views.${view === 'regions' ? regionWord(me?.home_country_iso2 ?? 'BD') : view}`)}
        </Text>
        <Text style={styles.levelHint}>{t('friends.compareZoomHint')}</Text>
        {groups.map(([group, label]) => {
          const expanded = open === group;
          const places = data?.[group] ?? [];
          return (
            <View key={group}>
              <PressableScale
                pressEffect="opacity"
                haptic="selection"
                style={styles.groupRow}
                onPress={() => setOpen(expanded ? null : group)}
                accessibilityState={{ expanded }}
                disabled={places.length === 0}
                testID={`compare-${group}`}
              >
                <Text style={styles.groupLabel}>{label}</Text>
                {places.length ? <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={24} color={colors.textSecondary} /> : null}
              </PressableScale>
              {expanded ? places.map((p) => <PlaceLine key={p.code} place={p} />) : null}
            </View>
          );
        })}
      </ScrollView>
      {poster && data ? (
        <PosterPreview
          mapUri={poster.uri}
          title={t('friends.posterTitle', { name })}
          headline={t('friends.inCommonCount', { count: data.in_common.length })}
          detail={`${t('friends.onlyYou', { count: data.only_me.length })} · ${t('friends.onlyThem', { count: data.only_them.length, name })}`}
          onClose={() => setPoster(null)}
        />
      ) : null}
    </View>
  );
}

function PlaceLine({ place }: { place: ComparePlace }) {
  const styles = useStyles();
  return (
    <View style={styles.place}>
      <Text style={styles.flag}>{place.country_iso2 ? flagEmoji(place.country_iso2) : ''}</Text>
      <Text style={styles.placeName}>{place.name}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  legend: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: t.spacing.md, paddingVertical: t.spacing.md, gap: t.spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, flexShrink: 1 },
  swatch: { width: 20, height: 20, borderRadius: 5 },
  legendText: { ...t.type.body, color: t.colors.textPrimary, flexShrink: 1 },
  map: { flex: 1, minHeight: 260, backgroundColor: t.colors.surface },
  panel: { flexGrow: 0, maxHeight: '45%' },
  panelContent: { padding: t.spacing.lg + 2, gap: t.spacing.xs },
  levelTitle: { ...t.type.title, color: t.colors.textPrimary },
  levelHint: { ...t.type.footnote, color: t.colors.textSecondary, marginBottom: t.spacing.xs },
  groupRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52 },
  groupLabel: { ...t.type.headline, color: t.colors.textPrimary, flex: 1 },
  place: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 40, paddingLeft: t.spacing.sm },
  flag: { fontSize: 20, width: 28 },
  placeName: { ...t.type.body, color: t.colors.textSecondary },
}));
