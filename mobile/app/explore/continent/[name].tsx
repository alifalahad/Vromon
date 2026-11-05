/**
 * Vromon Mobile — a continent in Explore: Cities | Countries, as photo cards two per row
 * (countries: flag above the name; cities: the name, with the country's flag and name under it).
 * Both by population, largest first (Wikidata for countries, GeoNames for cities).
 */

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { CONTINENT_KEYS, compactNumber, useCities, useCountries } from '../../../src/features/explore/api';
import { PhotoCard, PhotoCredits } from '../../../src/features/explore/PhotoCard';
import { flagEmoji } from '../../../src/features/geo/countries';
import { SegmentedControl } from '../../../src/ui/SegmentedControl';
import { makeStyles, useTheme } from '../../../src/ui/theme';

export default function ContinentScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name: string }>();
  const [tab, setTab] = useState<'cities' | 'countries'>('countries');
  const countries = useCountries(name);
  const cities = useCities({ continent: name, limit: 40 });
  const title = t(`explore.continents.${CONTINENT_KEYS[name ?? ''] ?? 'asia'}`);
  const loading = tab === 'countries' ? countries.isLoading : cities.isLoading;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title }} />
      <View style={styles.tabs}>
        <SegmentedControl
          options={[
            { value: 'cities', label: t('explore.cities') },
            { value: 'countries', label: t('explore.countries') },
          ]}
          value={tab}
          onChange={setTab}
          testID="continent-tabs"
        />
      </View>
      {loading ? <ActivityIndicator color={colors.link} style={styles.loading} /> : null}
      <ScrollView contentContainerStyle={styles.body} testID="continent-screen">
        <View style={styles.grid}>
          {tab === 'countries'
            ? (countries.data ?? []).map((c) => (
                <View key={c.iso2} style={styles.cell}>
                  <PhotoCard
                    photo={c.photo}
                    title={lang === 'bn' ? c.name_bn || c.name : c.name}
                    flag={flagEmoji(c.iso2)}
                    width="100%"
                    height={250}
                    onPress={() => router.push({ pathname: '/explore/country/[iso2]', params: { iso2: c.iso2 } })}
                  />
                  {c.facts?.population ? (
                    <Text style={styles.under}>
                      {compactNumber(c.facts.population, lang).toUpperCase()} {t('explore.people').toUpperCase()}
                    </Text>
                  ) : null}
                </View>
              ))
            : (cities.data ?? []).map((c) => (
                <View key={c.geonameid} style={styles.cell}>
                  <PhotoCard
                    photo={c.photo}
                    title={c.name}
                    subtitle={c.country_name}
                    flag={flagEmoji(c.country_iso2)}
                    width="100%"
                    height={210}
                    onPress={() => router.push({ pathname: '/explore/country/[iso2]', params: { iso2: c.country_iso2 } })}
                  />
                  <Text style={styles.under}>
                    {compactNumber(c.population, lang).toUpperCase()} {t('explore.people').toUpperCase()}
                  </Text>
                </View>
              ))}
        </View>
        <Text style={styles.note}>{tab === 'countries' ? t('explore.countriesNote') : t('explore.citiesNote')}</Text>
        <PhotoCredits photos={tab === 'countries' ? (countries.data ?? []).map((c) => c.photo) : (cities.data ?? []).map((c) => c.photo)} />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  tabs: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  loading: { marginTop: 24 },
  body: { padding: 16, paddingBottom: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 },
  cell: { width: '48.5%' },
  under: { ...t.type.caption, fontWeight: '700', letterSpacing: 0.5, color: t.colors.textSecondary, marginTop: 8, marginLeft: 4 },
  note: { ...t.type.caption, color: t.colors.textTertiary, marginTop: 20 },
}));
