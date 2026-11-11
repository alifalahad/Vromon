/**
 * Vromon Mobile — a country in Explore: its photo with flag and name, Wikidata's facts (capital,
 * population with its year, area, currencies, official languages, calling code, UN membership),
 * and its largest cities. Bangladesh links to its districts.
 */

import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { CONTINENT_KEYS, compactNumber, fullNumber, useCountry } from '../../../src/features/explore/api';
import { PhotoCard, PhotoCredits } from '../../../src/features/explore/PhotoCard';
import { flagEmoji } from '../../../src/features/geo/countries';
import { localDigits } from '../../../src/features/trips/plan/usePlanFormat';
import { PressableScale } from '../../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../../src/ui/theme';

export default function CountryScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const { iso2 } = useLocalSearchParams<{ iso2: string }>();
  const q = useCountry(iso2 ?? '');
  const c = q.data;

  if (!c) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: '' }} />
        {q.error ? <Text style={styles.error}>{t('explore.loadFailed')}</Text> : <ActivityIndicator size="large" color={colors.link} />}
      </View>
    );
  }

  const name = lang === 'bn' ? c.name_bn || c.name : c.name;
  const f = c.facts;
  const rows: [string, string][] = [];
  if (f?.capital_en) rows.push([t('explore.capital'), (lang === 'bn' ? f.capital_bn || f.capital_en : f.capital_en) ?? '']);
  if (f?.population)
    rows.push([t('explore.population'), `${fullNumber(f.population, lang)}${f.population_year ? ` (${localDigits(String(f.population_year), lang)})` : ''}`]);
  if (f?.area_km2) rows.push([t('explore.area'), `${fullNumber(f.area_km2, lang)} ${t('explore.km2')}`]);
  if (f?.currencies.length) rows.push([t('explore.currency'), f.currencies.map((x) => `${x.name ?? x.code} (${x.code})`).join(', ')]);
  if (f?.languages.length) rows.push([t('explore.languages'), f.languages.join(', ')]);
  if (f?.calling_codes.length) rows.push([t('explore.callingCode'), localDigits(f.calling_codes.join(', '), lang)]);
  if (c.continent) rows.push([t('explore.continent'), t(`explore.continents.${CONTINENT_KEYS[c.continent] ?? 'asia'}`)]);
  rows.push([t('explore.unStatus'), c.un_member_or_observer ? t('explore.unYes') : t('explore.unNo', { status: c.status ?? '' })]);
  if (c.regions) rows.push([t('explore.regions'), localDigits(String(c.regions), lang)]);
  const description = lang === 'bn' ? f?.description_bn || f?.description_en : f?.description_en;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: name }} />
      <ScrollView contentContainerStyle={styles.body} testID="country-screen">
        <PhotoCard photo={c.photo} title={name} flag={flagEmoji(c.iso2)} width="100%" height={260} />
        {description ? <Text style={styles.description}>{description}</Text> : null}
        {c.iso2 === 'BD' ? (
          <PressableScale haptic="medium" style={styles.bd} onPress={() => router.push('/explore/districts')} testID="country-bd-districts">
            <MaterialIcons name="map" size={20} color={colors.onAccent} />
            <Text style={styles.bdText}>{t('explore.allDistricts')}</Text>
          </PressableScale>
        ) : null}
        <View style={styles.facts}>
          {rows.map(([k, v]) => (
            <View key={k} style={styles.fact}>
              <Text style={styles.factKey}>{k}</Text>
              <Text style={styles.factValue}>{v}</Text>
            </View>
          ))}
        </View>
        {c.cities.length ? (
          <>
            <Text style={styles.section} accessibilityRole="header">
              {t('explore.largestCitiesIn', { name })}
            </Text>
            <View style={styles.grid}>
              {c.cities.map((city) => (
                <View key={city.geonameid} style={styles.cell}>
                  <PhotoCard photo={city.photo} title={city.name} subtitle={city.region} width="100%" height={180} />
                  <Text style={styles.under}>
                    {compactNumber(city.population, lang).toUpperCase()} {t('explore.people').toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
        <Text style={styles.note}>{t('explore.countrySources')}</Text>
        <PhotoCredits photos={[c.photo, ...c.cities.map((x) => x.photo)]} />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.bg },
  error: { ...t.type.callout, color: t.colors.danger },
  body: { padding: 16, paddingBottom: 40 },
  description: { ...t.type.callout, color: t.colors.textSecondary, marginTop: 12 },
  bd: {
    marginTop: 14,
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: t.colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bdText: { ...t.type.headline, color: t.colors.onAccent },
  facts: { marginTop: 16, borderRadius: 20, backgroundColor: t.colors.surface, paddingHorizontal: 16 },
  fact: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  factKey: { ...t.type.footnote, color: t.colors.textSecondary, width: 120 },
  factValue: { ...t.type.callout, color: t.colors.textPrimary, flex: 1, fontWeight: '600' },
  section: { ...t.type.title, color: t.colors.textPrimary, marginTop: 28, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 },
  cell: { width: '48.5%' },
  under: { ...t.type.caption, fontWeight: '700', letterSpacing: 0.5, color: t.colors.textSecondary, marginTop: 8, marginLeft: 4 },
  note: { ...t.type.caption, color: t.colors.textTertiary, marginTop: 20 },
}));
