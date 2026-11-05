/**
 * Vromon Mobile — Explore tab.
 *
 * Search (districts, countries, cities), then Bangladesh: its facts over Esri's satellite view
 * of the country, its districts by division (photo cards; a district without a photo of its own
 * shows one of its sights, else its satellite view), its GI-registered foods; then the world:
 * continents, the most populous countries and cities. Everything comes from the catalog
 * (GET /explore/*), with sources and photo credits at the bottom; nothing here is sample data.
 */

import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useScrollToTop } from 'expo-router';
import { Image } from 'expo-image';
import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CONTINENT_KEYS,
  compactNumber,
  districtLine,
  localName,
  useBangladesh,
  useCities,
  useContinents,
  useCountries,
  useExploreSearch,
  type CityCard,
  type CountryCard,
  type DistrictCard,
} from '../../src/features/explore/api';
import { PhotoCard, PhotoCredits } from '../../src/features/explore/PhotoCard';
import { flagEmoji } from '../../src/features/geo/countries';
import { localDigits } from '../../src/features/trips/plan/usePlanFormat';
import { PressableScale } from '../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../src/ui/theme';

// Esri's World Imagery over Bangladesh (keyless export, as on the district cards)
const BD_SATELLITE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=87.9,20.5,92.8,26.7&bboxSR=4326&imageSR=3857&size=800,900&format=jpg&f=image';

export default function ExploreScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const [query, setQuery] = useState('');
  const [division, setDivision] = useState<string | null>(null);

  const bd = useBangladesh();
  const continents = useContinents();
  const countries = useCountries();
  const cities = useCities({ limit: 12 });
  const search = useExploreSearch(query);
  const searching = query.trim().length >= 2;

  const divisions = useMemo(() => bd.data?.divisions ?? [], [bd.data]);
  const shownDivision = division ?? divisions[0]?.slug ?? null;
  const districts = divisions.find((d) => d.slug === shownDivision)?.districts ?? [];
  const allDistricts = useMemo(() => divisions.flatMap((d) => d.districts), [divisions]);
  const districtName = useMemo(() => new Map(allDistricts.map((d) => [d.slug, localName(d, lang)])), [allDistricts, lang]);

  const openDistrict = (d: DistrictCard) => router.push({ pathname: '/explore/district/[slug]', params: { slug: d.slug } });
  const openCountry = (c: CountryCard) => router.push({ pathname: '/explore/country/[iso2]', params: { iso2: c.iso2 } });
  const openCity = (c: CityCard) => router.push({ pathname: '/explore/country/[iso2]', params: { iso2: c.country_iso2 } });
  const countryName = (c: CountryCard) => (lang === 'bn' ? c.name_bn || c.name : c.name);

  const facts = bd.data?.country.facts;
  const shownPhotos = [
    ...districts.map((d) => d.photo),
    ...(countries.data ?? []).slice(0, 10).map((c) => c.photo),
    ...(cities.data ?? []).map((c) => c.photo),
  ];

  return (
    <View style={styles.screen}>
      <View style={[styles.searchBar, { paddingTop: insets.top + 12 }]}>
        <View style={styles.searchField}>
          <MaterialIcons name="search" size={22} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('explore.searchPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            style={styles.searchInput}
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
      </View>

      {searching ? (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {search.isLoading ? <ActivityIndicator color={colors.link} style={styles.loading} /> : null}
          {search.data && !search.data.districts.length && !search.data.countries.length && !search.data.cities.length ? (
            <Text style={styles.muted}>{t('explore.noResults')}</Text>
          ) : null}
          {search.data?.districts.map((d) => (
            <ResultRow key={d.slug} icon="place" title={localName(d, lang)} subtitle={t('explore.districtOf', { division: lang === 'bn' ? d.division_bn || d.division_en : d.division_en })} onPress={() => openDistrict(d)} />
          ))}
          {search.data?.countries.map((c) => (
            <ResultRow key={c.iso2} flag={flagEmoji(c.iso2)} title={countryName(c)} subtitle={c.continent ? t(`explore.continents.${CONTINENT_KEYS[c.continent] ?? 'asia'}`) : ''} onPress={() => openCountry(c)} />
          ))}
          {search.data?.cities.map((c) => (
            <ResultRow key={c.geonameid} flag={flagEmoji(c.country_iso2)} title={c.name} subtitle={[c.region, c.country_name].filter(Boolean).join(', ')} onPress={() => openCity(c)} />
          ))}
        </ScrollView>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={styles.body} testID="explore-home">
          {/* Bangladesh */}
          <PressableScale
            style={styles.hero}
            onPress={() => router.push('/explore/districts')}
            accessibilityRole="button"
            accessibilityLabel={t('explore.bdHeroLabel')}
            testID="explore-bangladesh"
          >
            <Image source={{ uri: BD_SATELLITE }} style={styles.fill} contentFit="cover" cachePolicy="disk" transition={200} />
            <View style={styles.heroShade} />
            <View style={styles.heroText}>
              <Text style={styles.heroFlag}>🇧🇩</Text>
              <Text style={styles.heroTitle}>{t('explore.bangladesh')}</Text>
              {facts ? (
                <Text style={styles.heroLine}>
                  {t('explore.capital')}: {lang === 'bn' ? facts.capital_bn || facts.capital_en : facts.capital_en}
                  {facts.population ? `  ·  ${compactNumber(facts.population, lang)} ${t('explore.people')} (${localDigits(String(facts.population_year ?? ''), lang)})` : ''}
                </Text>
              ) : null}
              {divisions.length ? (
                <Text style={styles.heroLine}>
                  {t('explore.bdCounts', { divisions: localDigits(String(divisions.length), lang), districts: localDigits(String(allDistricts.length), lang) })}
                </Text>
              ) : null}
              <View style={styles.heroButton}>
                <Text style={styles.heroButtonText}>{t('explore.allDistricts')}</Text>
                <MaterialIcons name="chevron-right" size={20} color="#FFFFFF" />
              </View>
            </View>
          </PressableScale>
          {bd.isLoading ? <ActivityIndicator color={colors.link} style={styles.loading} /> : null}
          {bd.error ? <Text style={styles.error}>{t('explore.loadFailed')}</Text> : null}

          {divisions.length ? (
            <>
              <SectionTitle title={t('explore.districtsByDivision')} onMore={() => router.push('/explore/districts')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {divisions.map((d) => (
                  <PressableScale
                    key={d.slug}
                    haptic="selection"
                    style={[styles.chip, shownDivision === d.slug && styles.chipOn]}
                    onPress={() => setDivision(d.slug)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: shownDivision === d.slug }}
                  >
                    <Text style={[styles.chipText, shownDivision === d.slug && styles.chipTextOn]}>{localName(d, lang)}</Text>
                  </PressableScale>
                ))}
              </ScrollView>
              <FlatList
                horizontal
                data={districts}
                keyExtractor={(d) => d.slug}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.carousel}
                renderItem={({ item }) => (
                  <PhotoCard
                    photo={item.photo}
                    title={localName(item, lang)}
                    subtitle={districtLine(item, t, lang)}
                    badge={item.counts.gi_foods + item.counts.gi_products ? `GI ${localDigits(String(item.counts.gi_foods + item.counts.gi_products), lang)}` : null}
                    width={230}
                    height={260}
                    onPress={() => openDistrict(item)}
                    testID={`district-card-${item.slug}`}
                  />
                )}
              />
            </>
          ) : null}

          {bd.data?.gi_foods.length ? (
            <>
              <SectionTitle title={t('explore.giFoods')} />
              <Text style={styles.sectionNote}>{t('explore.giNote')}</Text>
              <View style={styles.giWrap}>
                {bd.data.gi_foods.map((f) => {
                  const where = f.district_slug ? districtName.get(f.district_slug) : t('explore.allBangladesh');
                  return (
                    <PressableScale
                      key={f.name_bn}
                      style={styles.gi}
                      disabled={!f.district_slug}
                      onPress={() => f.district_slug && router.push({ pathname: '/explore/district/[slug]', params: { slug: f.district_slug } })}
                      accessibilityLabel={`${lang === 'bn' ? f.name_bn : f.name_en || f.name_bn}, ${where}`}
                    >
                      <Text style={styles.giName} numberOfLines={2}>
                        {lang === 'bn' ? f.name_bn : f.name_en || f.name_bn}
                      </Text>
                      <Text style={styles.giWhere} numberOfLines={1}>
                        📍 {where}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>
            </>
          ) : null}

          {/* The world */}
          {continents.data?.length ? (
            <>
              <SectionTitle title={t('explore.byContinent')} />
              <View style={styles.grid}>
                {continents.data.map((c) => (
                  <PressableScale
                    key={c.name}
                    style={styles.continent}
                    onPress={() => router.push({ pathname: '/explore/continent/[name]', params: { name: c.name } })}
                    accessibilityLabel={t(`explore.continents.${CONTINENT_KEYS[c.name]}`)}
                    testID={`continent-${CONTINENT_KEYS[c.name]}`}
                  >
                    <Text style={styles.continentName} numberOfLines={1}>
                      {t(`explore.continents.${CONTINENT_KEYS[c.name]}`)}
                    </Text>
                    <Text style={styles.continentFlags}>{c.largest.map((x) => flagEmoji(x.iso2)).join(' ')}</Text>
                    <Text style={styles.continentMeta}>{t('explore.countriesCount', { count: c.countries, n: localDigits(String(c.countries), lang) })}</Text>
                  </PressableScale>
                ))}
              </View>
            </>
          ) : null}

          {countries.data?.length ? (
            <>
              <SectionTitle title={t('explore.populousCountries')} />
              <FlatList
                horizontal
                data={countries.data.slice(0, 10)}
                keyExtractor={(c) => c.iso2}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.carousel}
                renderItem={({ item }) => (
                  <View>
                    <PhotoCard photo={item.photo} title={countryName(item)} flag={flagEmoji(item.iso2)} width={260} height={300} onPress={() => openCountry(item)} />
                    {item.facts?.population ? (
                      <Text style={styles.under}>
                        {compactNumber(item.facts.population, lang).toUpperCase()} {t('explore.people').toUpperCase()}
                      </Text>
                    ) : null}
                  </View>
                )}
              />
            </>
          ) : null}

          {cities.data?.length ? (
            <>
              <SectionTitle title={t('explore.largestCities')} />
              <FlatList
                horizontal
                data={cities.data}
                keyExtractor={(c) => String(c.geonameid)}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.carousel}
                renderItem={({ item }) => (
                  <View>
                    <PhotoCard photo={item.photo} title={item.name} subtitle={item.country_name} flag={flagEmoji(item.country_iso2)} width={260} height={220} onPress={() => openCity(item)} />
                    <Text style={styles.under}>
                      {compactNumber(item.population, lang).toUpperCase()} {t('explore.people').toUpperCase()}
                    </Text>
                  </View>
                )}
              />
            </>
          ) : null}

          {bd.data ? (
            <View style={styles.sources}>
              <Text style={styles.sourcesTitle}>{t('explore.sources')}</Text>
              {bd.data.sources.map((s) => (
                <Text key={s} style={styles.sourceLine}>
                  {s}
                </Text>
              ))}
              <Text style={styles.sourceLine}>{t('explore.satelliteCredit')}</Text>
            </View>
          ) : null}
          <PhotoCredits photos={shownPhotos} />
        </ScrollView>
      )}
    </View>
  );
}

function SectionTitle({ title, onMore }: { title: string; onMore?: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {onMore ? (
        <PressableScale onPress={onMore} hitSlop={12} accessibilityLabel={title}>
          <MaterialIcons name="chevron-right" size={28} color={colors.textSecondary} />
        </PressableScale>
      ) : null}
    </View>
  );
}

function ResultRow({ icon, flag, title, subtitle, onPress }: { icon?: 'place'; flag?: string; title: string; subtitle?: string; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale style={styles.result} onPress={onPress} accessibilityLabel={[title, subtitle].filter(Boolean).join(', ')}>
      {flag ? <Text style={styles.resultFlag}>{flag}</Text> : <MaterialIcons name={icon ?? 'place'} size={24} color={colors.accent} />}
      <View style={styles.resultText}>
        <Text style={styles.resultTitle}>{title}</Text>
        {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
      </View>
      <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  searchBar: { paddingHorizontal: 16, paddingBottom: 10, backgroundColor: t.colors.bg },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 26,
    paddingHorizontal: 16,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  searchInput: { flex: 1, ...t.type.body, color: t.colors.textPrimary, paddingVertical: 10 },
  body: { paddingHorizontal: 16, paddingBottom: 40 },
  loading: { marginVertical: 24 },
  muted: { ...t.type.footnote, color: t.colors.textSecondary },
  error: { ...t.type.callout, color: t.colors.danger, marginTop: 12 },
  hero: { height: 300, borderRadius: 28, overflow: 'hidden', marginTop: 6, backgroundColor: t.colors.surfaceInset },
  heroShade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.38)' },
  heroText: { position: 'absolute', left: 20, right: 20, bottom: 20, gap: 4 },
  heroFlag: { fontSize: 34 },
  heroTitle: { color: '#FFFFFF', fontSize: 32, fontWeight: '800' },
  heroLine: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
  heroButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 20,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
  },
  heroButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, marginBottom: 10 },
  sectionTitle: { ...t.type.title, color: t.colors.textPrimary, flex: 1 },
  sectionNote: { ...t.type.footnote, color: t.colors.textSecondary, marginTop: -4, marginBottom: 10 },
  chips: { gap: 8, paddingBottom: 12 },
  chip: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.colors.surface },
  chipOn: { backgroundColor: t.colors.accent },
  chipText: { ...t.type.callout, fontWeight: '600', color: t.colors.textSecondary },
  chipTextOn: { color: t.colors.onAccent },
  carousel: { gap: 12 },
  under: { ...t.type.caption, fontWeight: '700', letterSpacing: 0.5, color: t.colors.textSecondary, marginTop: 8, marginLeft: 4 },
  giWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  gi: { width: '48.6%', minHeight: 76, borderRadius: 18, padding: 12, backgroundColor: t.colors.surface, justifyContent: 'space-between', gap: 6 },
  giName: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary },
  giWhere: { ...t.type.caption, color: t.colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  continent: { width: '48.6%', minHeight: 104, borderRadius: 22, padding: 16, backgroundColor: t.colors.surface, justifyContent: 'space-between' },
  continentName: { ...t.type.headline, color: t.colors.textPrimary },
  continentFlags: { fontSize: 22, marginTop: 6 },
  continentMeta: { ...t.type.caption, color: t.colors.textSecondary, marginTop: 4 },
  sources: { marginTop: 32, gap: 4, paddingHorizontal: 4 },
  sourcesTitle: { ...t.type.footnote, fontWeight: '700', color: t.colors.textSecondary },
  sourceLine: { ...t.type.caption, color: t.colors.textTertiary },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  resultFlag: { fontSize: 26 },
  resultText: { flex: 1, gap: 2 },
  resultTitle: { ...t.type.body, fontWeight: '600', color: t.colors.textPrimary },
}));
