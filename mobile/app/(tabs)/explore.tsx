/**
 * Vromon Mobile — Explore tab (docs/ui-refresh step 12, frames 18 and 22–24).
 *
 * A fixed header with the search field and the account picture; under it the switch "Your country" | "The
 * world" (remembered while the app is open). Your country is the home country from the profile (Bangladesh
 * until one is chosen); the world is the continents, the countries with the most people and the largest
 * cities. Your own marks show throughout. Search finds districts, countries and cities from either half.
 * Everything comes from the catalog (GET /explore/*) and your marks; nothing here is sample data.
 */

import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useScrollToTop } from 'expo-router';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';

import { useMe } from '../../src/features/account/useMe';
import { localName, useExploreSearch } from '../../src/features/explore/api';
import { PlaceRow, RowCard } from '../../src/features/explore/ExploreParts';
import { useExploreHalf, type ExploreHalf } from '../../src/features/explore/exploreState';
import { cityStatus, countryStatus, districtStatus } from '../../src/features/explore/marks';
import { CityRow, continentName, TheWorld } from '../../src/features/explore/TheWorld';
import { YourCountry } from '../../src/features/explore/YourCountry';
import { flagEmoji } from '../../src/features/geo/countries';
import { DEFAULT_HOME } from '../../src/features/map/home';
import { useVisits } from '../../src/features/map/visits';
import { AccountButton } from '../../src/ui/AccountButton';
import { PressableScale } from '../../src/ui/PressableScale';
import { SegmentedControl } from '../../src/ui/SegmentedControl';
import { TabHeader } from '../../src/ui/TabHeader';
import { makeStyles, useTheme } from '../../src/ui/theme';

export default function ExploreScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const [query, setQuery] = useState('');
  // The header's hairline once something is scrolled under it
  const [scrolled, setScrolled] = useState(false);
  const onScroll = (e: { nativeEvent: { contentOffset: { y: number } } }) => setScrolled(e.nativeEvent.contentOffset.y > 2);
  const { half, setHalf } = useExploreHalf();
  const { data: me } = useMe();
  const home = me?.home_country_iso2 ?? DEFAULT_HOME;
  const { data: visits = [] } = useVisits(me?.id);
  const search = useExploreSearch(query);
  const searching = query.trim().length >= 2;
  const results = search.data;
  const nothing = results && !results.districts.length && !results.countries.length && !results.cities.length;

  return (
    <View style={styles.screen}>
      <TabHeader scrolled={scrolled} account={<AccountButton testID="account-button-explore" />} testID="explore-header">
        <View style={styles.searchField}>
          <MaterialIcons name="search" size={22} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('explore.searchPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            style={styles.searchInput}
            maxFontSizeMultiplier={1.3}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={t('explore.searchPlaceholder')}
            testID="explore-search"
          />
          {query ? (
            <PressableScale haptic="selection" onPress={() => setQuery('')} accessibilityLabel={t('explore.clearSearch')} hitSlop={10}>
              <MaterialIcons name="close" size={20} color={colors.textSecondary} />
            </PressableScale>
          ) : null}
        </View>
      </TabHeader>

      {searching ? (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" onScroll={onScroll} scrollEventThrottle={32} testID="explore-results">
          {search.isLoading ? <ActivityIndicator color={colors.link} style={styles.loading} /> : null}
          {search.error ? <Text style={styles.muted}>{t('explore.loadFailed')}</Text> : null}
          {nothing ? <Text style={styles.muted}>{t('explore.noResults')}</Text> : null}
          {results && !nothing ? (
            <RowCard>
              {[
                ...results.districts.map((d) => (
                  <PlaceRow
                    key={`d-${d.slug}`}
                    icon="map-marker-outline"
                    title={localName(d, lang)}
                    sub={t('explore.divisionTitle', { name: lang === 'bn' ? d.division_bn || d.division_en : d.division_en })}
                    status={districtStatus(visits, d.slug)}
                    onPress={() => router.push({ pathname: '/explore/district/[slug]', params: { slug: d.slug } })}
                    testID={`result-district-${d.slug}`}
                  />
                )),
                ...results.countries.map((c) => (
                  <PlaceRow
                    key={`c-${c.iso2}`}
                    flag={flagEmoji(c.iso2)}
                    title={lang === 'bn' ? c.name_bn || c.name : c.name}
                    sub={continentName(t, c.continent)}
                    status={countryStatus(visits, c.iso2)}
                    onPress={() => router.push({ pathname: '/explore/country/[iso2]', params: { iso2: c.iso2 } })}
                    testID={`result-country-${c.iso2}`}
                  />
                )),
                ...results.cities.map((c) => (
                  <CityRow
                    key={`city-${c.geonameid}`}
                    c={c}
                    status={cityStatus(visits, c.geonameid)}
                    onPress={() => router.push({ pathname: '/explore/country/[iso2]', params: { iso2: c.country_iso2 } })}
                  />
                )),
              ].map((row, i, all) => (i === all.length - 1 ? React.cloneElement(row as React.ReactElement<{ last?: boolean }>, { last: true }) : row))}
            </RowCard>
          ) : null}
        </ScrollView>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={styles.body} onScroll={onScroll} scrollEventThrottle={32} testID="explore-home">
          <SegmentedControl<ExploreHalf>
            compact
            options={[
              { value: 'country', label: t('explore.tabCountry') },
              { value: 'world', label: t('explore.tabWorld') },
            ]}
            value={half}
            onChange={setHalf}
            accessibilityLabel={t('explore.tabsLabel')}
            style={styles.switch}
            testID="explore-switch"
          />
          {half === 'country' ? <YourCountry home={home} visits={visits} /> : <TheWorld visits={visits} home={home} />}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  // Frame 18: the field beside the account picture, a fixed height so the picture never moves
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    borderRadius: 26,
    paddingHorizontal: 16,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    ...t.depth.card,
  },
  searchInput: { flex: 1, fontSize: 15.5, color: t.colors.textPrimary, paddingVertical: 0 },
  body: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 40 },
  switch: { marginBottom: 12 },
  loading: { marginVertical: 24 },
  muted: { ...t.type.callout, color: t.colors.textSecondary, marginTop: 12, marginHorizontal: 4 },
}));
