/**
 * Vromon Mobile — Compare maps (prompt §6.7, 07-theme-friends-compare-rustic.jpg).
 *
 * Legend (In common · You · Friend) in your theme's comparison colours, the map for
 * Countries / Regions / Cities, and the counts, each opening its list of places.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { CompareMap } from '../../../src/features/friends/CompareMap';
import { friendKeys } from '../../../src/features/friends/queries';
import { flagEmoji } from '../../../src/features/geo/countries';
import { countryLabelPoint } from '../../../src/features/map/geoData';
import { useMapTheme } from '../../../src/features/mapThemes/useMapTheme';
import type { MapView } from '../../../src/features/preferences/store';
import { friendsApi } from '../../../src/services/api';
import type { ComparePlace } from '../../../src/types';
import { PressableScale } from '../../../src/ui/PressableScale';
import { SegmentedControl } from '../../../src/ui/SegmentedControl';
import { makeStyles, useTheme } from '../../../src/ui/theme';

type Group = 'in_common' | 'only_me' | 'only_them';
const VIEWS: MapView[] = ['countries', 'regions', 'cities'];
const BANGLADESH: [number, number] = [90.35, 23.7];

export default function CompareScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useMapTheme();
  const [view, setView] = useState<MapView>('countries');
  const [open, setOpen] = useState<Group | null>(null);

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
      <Stack.Screen options={{ title: t('friends.compare') }} />
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

      <View style={styles.map}>{data ? <CompareMap theme={theme} view={view} data={data} center={center} /> : null}</View>

      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <SegmentedControl<MapView>
          options={VIEWS.map((v) => ({ value: v, label: t(`map.views.${v}`) }))}
          value={view}
          onChange={(v) => {
            setView(v);
            setOpen(null);
          }}
          testID="compare-view"
        />
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
  groupRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52 },
  groupLabel: { ...t.type.headline, color: t.colors.textPrimary, flex: 1 },
  place: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 40, paddingLeft: t.spacing.sm },
  flag: { fontSize: 20, width: 28 },
  placeName: { ...t.type.body, color: t.colors.textSecondary },
}));
