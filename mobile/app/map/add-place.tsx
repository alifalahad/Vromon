/**
 * Add place: the countries as flags, three to a row with the name under each; a flag opens that
 * country's regions, where the country itself can be marked too (or press and hold the flag).
 * One search finds a country (as its flag), a division of your home country or a city (the map
 * follows its zoom, so there's no view to match any more). Choose Visited / Want to visit /
 * Lived, optionally the first visit date, and save. Saving works offline (the edit is queued);
 * region and city search need a connection.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, BackHandler, FlatList, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../src/features/account/useMe';
import { flagEmoji } from '../../src/features/geo/countries';
import { mapCountries, mapCountryName } from '../../src/features/map/mapCountries';
import { STATUS_ORDER } from '../../src/features/map/style';
import { useMarkPlace } from '../../src/features/map/useMarkPlace';
import { statusOf, useVisits, type PlaceRef } from '../../src/features/map/visits';
import { readableOn } from '../../src/features/mapThemes/color';
import { StatusSwatch } from '../../src/features/mapThemes/StatusSwatch';
import { useMapTheme } from '../../src/features/mapThemes/useMapTheme';
import { regionWord } from '../../src/features/map/home';
import { usePreferences } from '../../src/features/preferences/store';
import { resolveLanguage } from '../../src/i18n';
import { geoApi } from '../../src/services/api';
import type { GeoRegion, VisitStatus } from '../../src/types';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { PressableScale } from '../../src/ui/PressableScale';
import { TextField } from '../../src/ui/TextField';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { notify } from '../../src/utils/dialogs';

type Candidate = PlaceRef & { name: string; detail: string; flag: string };

/** A line of the list: a heading, a row of flags, or one region or city */
type Line =
  | { kind: 'heading'; key: string; text: string }
  | { kind: 'flags'; key: string; countries: Candidate[] }
  | { kind: 'place'; key: string; place: Candidate };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Flags in a row */
const PER_ROW = 3;

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

  const { data: me } = useMe();
  const home = me?.home_country_iso2 ?? 'BD';
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
  // Your home country's divisions are always searched; another country's regions once it's opened
  const regionsOf = regionCountry ?? home;
  const regions = useQuery({
    queryKey: ['geo-regions', regionsOf],
    queryFn: () => geoApi.regions(regionsOf),
    staleTime: Infinity,
  });
  const cities = useQuery({
    queryKey: ['geo-cities', debounced],
    queryFn: () => geoApi.cities(debounced),
    enabled: !regionCountry && debounced.length >= 2,
    staleTime: 60_000,
  });

  const lines: Line[] = useMemo(() => {
    const region = (r: GeoRegion): Candidate => ({
      place_type: 'region',
      place_code: r.code,
      country_iso2: r.country_iso2,
      name: (lang === 'bn' && r.name_bn) || r.name,
      detail: [r.type, mapCountryName(r.country_iso2, lang)].filter(Boolean).join(' · '),
      flag: '',
    });
    const place = (c: Candidate): Line => ({ kind: 'place', key: `${c.place_type}-${c.place_code}`, place: c });
    const regionHits = (regions.data ?? []).filter((r) => !q || r.name.toLocaleLowerCase().includes(q) || (r.name_bn ?? '').includes(query.trim()));
    if (regionCountry) return regionHits.map((r) => place(region(r)));

    const out: Line[] = [];
    // Searching: your home country's divisions first, then countries, then cities, each under its name
    if (q && regionHits.length) {
      out.push({ kind: 'heading', key: 'h-regions', text: t(`map.views.${regionWord(home)}`) });
      out.push(...regionHits.map((r) => place(region(r))));
    }
    const countryHits = countries
      .filter((c) => !q || c.name.toLocaleLowerCase().includes(q) || c.code.toLowerCase() === q)
      .map((c): Candidate => ({ place_type: 'country', place_code: c.code, country_iso2: c.code, name: c.name, detail: '', flag: c.flag }));
    if (countryHits.length) {
      if (q) out.push({ kind: 'heading', key: 'h-countries', text: t('map.views.countries') });
      for (let i = 0; i < countryHits.length; i += PER_ROW) {
        const row = countryHits.slice(i, i + PER_ROW);
        out.push({ kind: 'flags', key: `flags-${row[0].place_code}`, countries: row });
      }
    }
    const cityHits = q
      ? (cities.data ?? []).map(
          (c): Candidate => ({
            place_type: 'city',
            place_code: String(c.geonameid),
            country_iso2: c.country_iso2,
            name: c.name,
            detail: mapCountryName(c.country_iso2, lang),
            flag: '',
          }),
        )
      : [];
    if (cityHits.length) {
      out.push({ kind: 'heading', key: 'h-cities', text: t('map.views.cities') });
      out.push(...cityHits.map(place));
    }
    return out;
  }, [regionCountry, countries, q, query, regions.data, cities.data, lang, home, t]);

  const pick = (c: Candidate) => {
    haptics.selection();
    setChosen(c);
    setStatus(statusOf(visits, c.place_type, c.place_code) ?? 'visited');
  };
  const openRegions = (code: string) => {
    haptics.selection();
    setRegionCountry(code);
    setQuery('');
  };
  // The country whose regions are open, as a place to mark (the country itself)
  const openCountry: Candidate | null = regionCountry
    ? { place_type: 'country', place_code: regionCountry, country_iso2: regionCountry, name: mapCountryName(regionCountry, lang), detail: '', flag: flagEmoji(regionCountry) }
    : null;

  // Android's Back goes from a country's regions back to the flags first
  useEffect(() => {
    if (!regionCountry || chosen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setRegionCountry(null);
      return true;
    });
    return () => sub.remove();
  }, [regionCountry, chosen]);

  const save = () => {
    if (!chosen || !me) return;
    if (firstVisited && !DATE.test(firstVisited)) {
      haptics.error();
      return notify(t('common.error'), t('map.firstVisited'), 'error');
    }
    markPlace(chosen, status, firstVisited && status !== 'want' ? { first_visited_on: firstVisited } : {});
    router.back();
  };

  const searchLabel = regionCountry ? t('map.searchRegions') : t('map.searchAll');
  const loading = regions.isFetching || cities.isFetching;
  const failed = (!!regionCountry && regions.isError) || cities.isError;

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
      {regionCountry ? (
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
          // Short enough for one line on a narrow phone (the full wording is the label read out)
          placeholder={regionCountry ? searchLabel : t('map.searchAllHint')}
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
      {failed ? <Text style={styles.error}>{t('map.tilesUnavailable')}</Text> : null}
      <FlatList
        data={lines}
        keyExtractor={(l) => l.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        // A country's regions start with the country itself, to mark it as a whole
        ListHeaderComponent={
          openCountry ? (
            <View style={styles.countryCard}>
              {/* The name gets the whole width (long ones too), the button its own line under it */}
              <View style={styles.countryCardTop}>
                <Text style={styles.countryCardFlag} accessible={false}>
                  {openCountry.flag}
                </Text>
                <View style={styles.rowText}>
                  <Text style={styles.countryCardName} numberOfLines={2} accessibilityRole="header">
                    {openCountry.name}
                  </Text>
                  {(() => {
                    const s = statusOf(visits, 'country', openCountry.place_code);
                    return s ? (
                      <View style={styles.countryCardStatus}>
                        <StatusSwatch theme={mapTheme} status={s} />
                        <Text style={styles.rowDetail}>{t(`map.status.${s}`)}</Text>
                      </View>
                    ) : null;
                  })()}
                </View>
              </View>
              <PressableScale
                haptic="selection"
                style={styles.markCountry}
                onPress={() => pick(openCountry)}
                accessibilityLabel={t('map.markCountry', { name: openCountry.name })}
                testID="add-place-mark-country"
              >
                <Text style={styles.markCountryText} numberOfLines={2}>
                  {t('map.markCountry', { name: openCountry.name })}
                </Text>
              </PressableScale>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !loading && !openCountry ? <Text style={styles.hint}>{t('map.noResults')}</Text> : null
        }
        renderItem={({ item: line }) => {
          if (line.kind === 'heading') {
            return (
              <Text style={styles.heading} accessibilityRole="header">
                {line.text}
              </Text>
            );
          }
          if (line.kind === 'flags') {
            return (
              <View style={styles.flagRow}>
                {line.countries.map((c) => {
                  const s = statusOf(visits, 'country', c.place_code);
                  const regionsLabel = t(`map.views.${regionWord(c.place_code)}`);
                  return (
                    <PressableScale
                      key={c.place_code}
                      haptic="none"
                      style={styles.flagTile}
                      onPress={() => openRegions(c.place_code)}
                      // A shortcut: press and hold marks the country itself
                      onLongPress={() => pick(c)}
                      accessibilityLabel={[c.name, s ? t(`map.status.${s}`) : null, regionsLabel].filter(Boolean).join(', ')}
                      accessibilityHint={t('map.flagHint', { name: c.name })}
                      testID={`add-place-flag-${c.place_code}`}
                    >
                      <View style={[styles.flagBox, s ? { borderColor: mapTheme.outline[s] ?? mapTheme.status[s] } : null]}>
                        <Text style={styles.flagBig} allowFontScaling={false}>
                          {c.flag}
                        </Text>
                        {s ? (
                          <View style={styles.flagBadge}>
                            <StatusSwatch theme={mapTheme} status={s} size={14} />
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.flagName} numberOfLines={2}>
                        {c.name}
                      </Text>
                    </PressableScale>
                  );
                })}
                {/* Keeps the last row's flags the same size as the others */}
                {Array.from({ length: PER_ROW - line.countries.length }, (_, i) => (
                  <View key={`gap-${i}`} style={styles.flagTile} />
                ))}
              </View>
            );
          }
          const item = line.place;
          const s = statusOf(visits, item.place_type, item.place_code);
          return (
            <PressableScale pressEffect="opacity" haptic="none" style={styles.row} onPress={() => pick(item)} accessibilityLabel={item.name}>
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
  rowText: { flex: 1 },
  rowName: { ...t.type.body, color: t.colors.textPrimary },
  rowDetail: { ...t.type.footnote, color: t.colors.textSecondary },
  heading: { ...t.type.footnote, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: t.colors.textSecondary, paddingTop: t.spacing.lg, paddingBottom: t.spacing.sm },
  // Three flags to a row, the name under each
  flagRow: { flexDirection: 'row', gap: t.spacing.md, paddingVertical: t.spacing.sm },
  flagTile: { flex: 1, alignItems: 'center', gap: 6 },
  flagBox: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagBig: { fontSize: 46, lineHeight: 56 },
  flagBadge: { position: 'absolute', top: 6, right: 6, padding: 2, borderRadius: 10, backgroundColor: t.colors.bg },
  flagName: { ...t.type.footnote, fontWeight: '500', color: t.colors.textPrimary, textAlign: 'center', minHeight: 34 },
  countryCard: {
    gap: t.spacing.md,
    padding: t.spacing.md,
    marginBottom: t.spacing.sm,
    borderRadius: 18,
    backgroundColor: t.colors.surface,
  },
  countryCardTop: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  countryCardFlag: { fontSize: 40, lineHeight: 48 },
  countryCardName: { ...t.type.headline, color: t.colors.textPrimary },
  countryCardStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  markCountry: { minHeight: 44, paddingHorizontal: t.spacing.md, borderRadius: 22, backgroundColor: t.colors.accentStrong, alignItems: 'center', justifyContent: 'center' },
  markCountryText: { ...t.type.footnote, fontWeight: '700', color: t.colors.onAccent, textAlign: 'center' },
  chosen: { ...t.type.title, color: t.colors.textPrimary },
  detail: { ...t.type.callout, color: t.colors.textSecondary, marginTop: -8 },
  label: { ...t.type.callout, color: t.colors.textSecondary, marginTop: t.spacing.md },
  segment: { flexDirection: 'row', backgroundColor: t.colors.surfaceInset, borderRadius: 16, padding: 4, gap: 4 },
  segmentItem: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 4 },
  segmentText: { ...t.type.footnote, fontWeight: '600', color: t.colors.textSecondary },
  spacer: { flex: 1 },
}));
