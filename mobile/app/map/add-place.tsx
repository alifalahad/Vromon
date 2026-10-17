/**
 * Add place: search a country, region or city (matching the map view), choose
 * Visited / Want to visit / Lived, optionally the first visit date, and save.
 * Saving works offline (the edit is queued); region and city search need a connection.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../src/features/account/useMe';
import { mapCountries, mapCountryName } from '../../src/features/map/mapCountries';
import { STATUS_ORDER } from '../../src/features/map/style';
import { useMarkPlace } from '../../src/features/map/useMarkPlace';
import { statusOf, useVisits, type PlaceRef } from '../../src/features/map/visits';
import { readableOn } from '../../src/features/mapThemes/color';
import { StatusSwatch } from '../../src/features/mapThemes/StatusSwatch';
import { useMapTheme } from '../../src/features/mapThemes/useMapTheme';
import { usePreferences, type MapView } from '../../src/features/preferences/store';
import { resolveLanguage } from '../../src/i18n';
import { geoApi } from '../../src/services/api';
import type { VisitStatus } from '../../src/types';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { PressableScale } from '../../src/ui/PressableScale';
import { TextField } from '../../src/ui/TextField';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { notify } from '../../src/utils/dialogs';

type Candidate = PlaceRef & { name: string; detail: string; flag: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function AddPlaceScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const mapTheme = useMapTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lang = resolveLanguage(usePreferences((s) => s.language));
  const params = useLocalSearchParams<{ view?: MapView }>();
  const view: MapView = params.view === 'regions' || params.view === 'cities' ? params.view : 'countries';

  const { data: me } = useMe();
  const { data: visits = [] } = useVisits(me?.id);
  const markPlace = useMarkPlace(me?.id ?? '', visits);

  const [query, setQuery] = useState('');
  const [regionCountry, setRegionCountry] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [status, setStatus] = useState<VisitStatus>('visited');
  const [firstVisited, setFirstVisited] = useState('');
  const q = query.trim().toLocaleLowerCase();
  const debounced = useDebounced(q, 300);

  const countries = useMemo(() => mapCountries(lang), [lang]);
  const regions = useQuery({
    queryKey: ['geo-regions', regionCountry],
    queryFn: () => geoApi.regions(regionCountry!),
    enabled: view === 'regions' && !!regionCountry,
    staleTime: Infinity,
  });
  const cities = useQuery({
    queryKey: ['geo-cities', debounced],
    queryFn: () => geoApi.cities(debounced),
    enabled: view === 'cities' && debounced.length >= 2,
    staleTime: 60_000,
  });

  const candidates: Candidate[] = useMemo(() => {
    const country = (code: string) => ({ place_type: 'country' as const, place_code: code, country_iso2: code });
    if (view === 'countries' || (view === 'regions' && !regionCountry)) {
      return countries
        .filter((c) => !q || c.name.toLocaleLowerCase().includes(q) || c.code.toLowerCase() === q)
        .map((c) => ({ ...country(c.code), name: c.name, detail: '', flag: c.flag }));
    }
    if (view === 'regions') {
      return (regions.data ?? [])
        .filter((r) => !q || r.name.toLocaleLowerCase().includes(q) || (r.name_bn ?? '').includes(query.trim()))
        .map((r) => ({
          place_type: 'region',
          place_code: r.code,
          country_iso2: r.country_iso2,
          name: (lang === 'bn' && r.name_bn) || r.name,
          detail: r.type ?? '',
          flag: '',
        }));
    }
    return (cities.data ?? []).map((c) => ({
      place_type: 'city',
      place_code: String(c.geonameid),
      country_iso2: c.country_iso2,
      name: c.name,
      detail: mapCountryName(c.country_iso2, lang),
      flag: '',
    }));
  }, [view, regionCountry, countries, q, query, regions.data, cities.data, lang]);

  const pick = (c: Candidate) => {
    haptics.selection();
    if (view === 'regions' && !regionCountry) {
      setRegionCountry(c.place_code);
      setQuery('');
      return;
    }
    setChosen(c);
    setStatus(statusOf(visits, c.place_type, c.place_code) ?? 'visited');
  };

  const save = () => {
    if (!chosen || !me) return;
    if (firstVisited && !DATE.test(firstVisited)) {
      haptics.error();
      return notify(t('common.error'), t('map.firstVisited'), 'error');
    }
    markPlace(chosen, status, firstVisited && status !== 'want' ? { first_visited_on: firstVisited } : {});
    router.back();
  };

  const searchLabel =
    view === 'cities' ? t('map.searchCities') : view === 'regions' && regionCountry ? t('map.searchRegions') : t('map.searchCountries');
  const loading = (view === 'regions' && regions.isFetching) || (view === 'cities' && cities.isFetching);
  const failed = (view === 'regions' && regions.isError) || (view === 'cities' && cities.isError);

  if (chosen) {
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
        <Stack.Screen options={{ title: t('map.addPlace') }} />
        <Text style={styles.chosen}>
          {chosen.flag ? `${chosen.flag} ` : ''}
          {chosen.name}
        </Text>
        {chosen.detail ? <Text style={styles.detail}>{chosen.detail}</Text> : null}
        <Text style={styles.label}>{t('map.chooseStatus', { name: chosen.name })}</Text>
        <View style={styles.segment} accessibilityRole="radiogroup">
          {STATUS_ORDER.map((s) => {
            const on = s === status;
            return (
              <PressableScale
                key={s}
                haptic="selection"
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={[styles.segmentItem, on && { backgroundColor: mapTheme.status[s], borderColor: mapTheme.outline[s] ?? mapTheme.status[s] }]}
                onPress={() => setStatus(s)}
                testID={`add-status-${s}`}
              >
                <StatusSwatch theme={mapTheme} status={s} />
                <Text style={[styles.segmentText, on && { color: readableOn(mapTheme.status[s]) }]}>{t(`map.status.${s}`)}</Text>
              </PressableScale>
            );
          })}
        </View>
        {status !== 'want' ? (
          <TextField label={t('map.firstVisited')} value={firstVisited} onChangeText={setFirstVisited} keyboardType="numbers-and-punctuation" placeholder="2025-12-31" maxLength={10} />
        ) : null}
        <View style={styles.spacer} />
        <Button label={t('map.save')} onPress={save} testID="add-place-save" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('map.addPlace') }} />
      {view === 'regions' && regionCountry ? (
        <PressableScale pressEffect="opacity" style={styles.crumb} onPress={() => setRegionCountry(null)} accessibilityLabel={t('map.pickCountryFirst')}>
          <MaterialCommunityIcons name="chevron-left" size={22} color={colors.link} />
          <Text style={styles.crumbText}>{mapCountryName(regionCountry, lang)}</Text>
        </PressableScale>
      ) : null}
      <View style={styles.search}>
        <MaterialCommunityIcons name="magnify" size={22} color={colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={searchLabel}
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel={searchLabel}
          style={styles.searchInput}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          testID="place-search"
        />
        {loading ? <ActivityIndicator color={colors.link} /> : null}
      </View>
      {view === 'regions' && !regionCountry ? <Text style={styles.hint}>{t('map.pickCountryFirst')}</Text> : null}
      {failed ? <Text style={styles.error}>{t('map.tilesUnavailable')}</Text> : null}
      <FlatList
        data={candidates}
        keyExtractor={(c) => `${c.place_type}-${c.place_code}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          !loading && (view !== 'cities' || debounced.length >= 2) ? <Text style={styles.hint}>{t('map.noResults')}</Text> : null
        }
        renderItem={({ item }) => {
          const s = statusOf(visits, item.place_type, item.place_code);
          return (
            <PressableScale pressEffect="opacity" haptic="none" style={styles.row} onPress={() => pick(item)} accessibilityLabel={item.name}>
              {item.flag ? <Text style={styles.flag}>{item.flag}</Text> : null}
              <View style={styles.rowText}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.detail ? <Text style={styles.rowDetail}>{item.detail}</Text> : null}
              </View>
              {s ? (
                <View accessible accessibilityLabel={t(`map.status.${s}`)}>
                  <StatusSwatch theme={mapTheme} status={s} />
                </View>
              ) : null}
            </PressableScale>
          );
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg, paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.md, gap: t.spacing.md },
  search: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, backgroundColor: t.colors.surface, borderRadius: t.radius.control, paddingHorizontal: t.spacing.md, minHeight: 48 },
  searchInput: { flex: 1, color: t.colors.textPrimary, fontSize: 16 },
  crumb: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  crumbText: { ...t.type.callout, fontWeight: '600', color: t.colors.link },
  hint: { ...t.type.callout, color: t.colors.textSecondary, paddingVertical: t.spacing.md },
  error: { ...t.type.callout, color: t.colors.danger },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 56, borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  flag: { fontSize: 24 },
  rowText: { flex: 1 },
  rowName: { ...t.type.body, color: t.colors.textPrimary },
  rowDetail: { ...t.type.footnote, color: t.colors.textSecondary },
  chosen: { ...t.type.title, color: t.colors.textPrimary },
  detail: { ...t.type.callout, color: t.colors.textSecondary, marginTop: -8 },
  label: { ...t.type.callout, color: t.colors.textSecondary, marginTop: t.spacing.md },
  segment: { flexDirection: 'row', backgroundColor: t.colors.surfaceInset, borderRadius: 16, padding: 4, gap: 4 },
  segmentItem: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 4 },
  segmentText: { ...t.type.footnote, fontWeight: '600', color: t.colors.textSecondary },
  spacer: { flex: 1 },
}));
