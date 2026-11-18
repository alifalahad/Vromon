/**
 * Vromon Mobile — a continent in Explore, or the whole world (`world`): its countries or its cities, the most
 * people first, as Explore's rows with your marks (docs/ui-refresh step 12). Countries from Wikidata, cities
 * from GeoNames (places of 15,000 people or more).
 */

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { useMe } from '../../../src/features/account/useMe';
import { useCities, useCountries } from '../../../src/features/explore/api';
import { RowCard } from '../../../src/features/explore/ExploreParts';
import { cityStatus, countryStatus } from '../../../src/features/explore/marks';
import { CityRow, continentName, CountryRow } from '../../../src/features/explore/TheWorld';
import { useVisits } from '../../../src/features/map/visits';
import { SegmentedControl } from '../../../src/ui/SegmentedControl';
import { makeStyles, useTheme } from '../../../src/ui/theme';

export default function ContinentScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const params = useLocalSearchParams<{ name: string; tab?: string }>();
  const world = params.name === 'world';
  const continent = world ? undefined : params.name;
  const [tab, setTab] = useState<'countries' | 'cities'>(params.tab === 'cities' ? 'cities' : 'countries');
  const { data: me } = useMe();
  const { data: visits = [] } = useVisits(me?.id);
  const countries = useCountries(continent);
  const cities = useCities({ continent, limit: world ? 100 : 40 });
  const title = world ? t('explore.world') : continentName(t, continent);
  const q = tab === 'countries' ? countries : cities;
  const openCountry = (iso2: string) => router.push({ pathname: '/explore/country/[iso2]', params: { iso2 } });

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.body} testID="continent-screen">
        <SegmentedControl
          compact
          options={[
            { value: 'countries', label: t('explore.countries') },
            { value: 'cities', label: t('explore.cities') },
          ]}
          value={tab}
          onChange={setTab}
          style={styles.tabs}
          testID="continent-tabs"
        />
        {q.isLoading ? <ActivityIndicator color={colors.link} style={styles.loading} /> : null}
        {q.error ? <Text style={styles.note}>{t('explore.loadFailed')}</Text> : null}
        {tab === 'countries' && countries.data?.length ? (
          <RowCard>
            {countries.data.map((c, i) => (
              <CountryRow
                key={c.iso2}
                c={c}
                name={lang === 'bn' ? c.name_bn || c.name : c.name}
                status={countryStatus(visits, c.iso2)}
                onPress={() => openCountry(c.iso2)}
                last={i === countries.data.length - 1}
              />
            ))}
          </RowCard>
        ) : null}
        {tab === 'cities' && cities.data?.length ? (
          <RowCard>
            {cities.data.map((c, i) => (
              <CityRow key={c.geonameid} c={c} status={cityStatus(visits, c.geonameid)} onPress={() => openCountry(c.country_iso2)} last={i === cities.data.length - 1} />
            ))}
          </RowCard>
        ) : null}
        <Text style={styles.note}>{tab === 'countries' ? t('explore.countriesNote') : t('explore.citiesNote')}</Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  body: { padding: 16, paddingBottom: 40 },
  tabs: { marginBottom: 12 },
  loading: { marginTop: 24 },
  note: { ...t.type.caption, color: t.colors.textTertiary, marginTop: 16, marginHorizontal: 4 },
}));
