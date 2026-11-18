/**
 * Vromon Mobile — a country in Explore, laid out as a district's page (docs/ui-refresh step 12): its photo
 * across the top with its credit (Esri's satellite picture of the country when it has none), its name and
 * continent; "Mark" (visited, lived, want: the same marks as the map) and, for Bangladesh, "All districts";
 * Wikidata's facts (capital, population with its year, area, currencies, official languages, calling code,
 * UN membership); its largest cities with your marks.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../../src/features/account/useMe';
import { compactNumber, fullNumber, useCountry } from '../../../src/features/explore/api';
import { MarkChip, PhotoCredits, PhotoShade, PlacePhoto, PlaceRow, RowCard, SectionHead, Sources } from '../../../src/features/explore/ExploreParts';
import { cityStatus, countrySatellite, countryStatus } from '../../../src/features/explore/marks';
import { continentName } from '../../../src/features/explore/TheWorld';
import { flagEmoji } from '../../../src/features/geo/countries';
import { useMarkPlace } from '../../../src/features/map/useMarkPlace';
import { clearVisit, useVisits } from '../../../src/features/map/visits';
import { localDigits } from '../../../src/features/trips/plan/usePlanFormat';
import type { VisitStatus } from '../../../src/types';
import { OptionSheet } from '../../../src/ui/OptionSheet';
import { PressableScale } from '../../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../../src/ui/theme';

export default function CountryScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { iso2 = '' } = useLocalSearchParams<{ iso2: string }>();
  const q = useCountry(iso2);
  const { data: me } = useMe();
  const { data: visits = [] } = useVisits(me?.id);
  const markPlace = useMarkPlace(me?.id ?? '', visits);
  const queryClient = useQueryClient();
  const [marking, setMarking] = useState(false);
  // Past the photo, a strip under the status bar so the page doesn't run under its icons
  const [pastPhoto, setPastPhoto] = useState(false);
  const c = q.data;

  const back = (
    <PressableScale style={[styles.round, { top: insets.top + 8 }]} onPress={() => router.back()} accessibilityLabel={t('explore.back')} hitSlop={4} testID="country-back">
      <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onHeroButton} />
    </PressableScale>
  );

  if (!c) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        {q.error ? <Text style={styles.error}>{t('explore.loadFailed')}</Text> : <ActivityIndicator size="large" color={colors.link} />}
        {back}
      </View>
    );
  }

  const name = lang === 'bn' ? c.name_bn || c.name : c.name;
  const f = c.facts;
  const status = countryStatus(visits, c.iso2);
  const place = { place_type: 'country' as const, place_code: c.iso2, country_iso2: c.iso2 };
  // Wikidata's photo of the country, else Esri's picture of the country itself (not one map tile)
  const satellite = !c.photo || c.photo.kind === 'satellite' ? countrySatellite(c.iso2) : null;
  const credit = satellite || c.photo?.kind === 'satellite' ? t('explore.satelliteEsri') : c.photo?.attribution;
  const rows: [string, string][] = [];
  if (f?.capital_en) rows.push([t('explore.capital'), (lang === 'bn' ? f.capital_bn || f.capital_en : f.capital_en) ?? '']);
  if (f?.population) rows.push([t('explore.population'), `${fullNumber(f.population, lang)}${f.population_year ? ` (${localDigits(String(f.population_year), lang)})` : ''}`]);
  if (f?.area_km2) rows.push([t('explore.area'), `${fullNumber(f.area_km2, lang)} ${t('explore.km2')}`]);
  if (f?.currencies.length) rows.push([t('explore.currency'), f.currencies.map((x) => `${x.name ?? x.code} (${x.code})`).join(', ')]);
  if (f?.languages.length) rows.push([t('explore.languages'), f.languages.join(', ')]);
  if (f?.calling_codes.length) rows.push([t('explore.callingCode'), localDigits(f.calling_codes.join(', '), lang)]);
  rows.push([t('explore.unStatus'), c.un_member_or_observer ? t('explore.unYes') : t('explore.unNo', { status: c.status ?? '' })]);
  if (c.regions) rows.push([t('explore.regions'), localDigits(String(c.regions), lang)]);
  const description = lang === 'bn' ? f?.description_bn || f?.description_en : f?.description_en;
  const line = [continentName(t, c.continent), f?.population ? t('explore.peopleCount', { n: compactNumber(f.population, lang) }) : null].filter(Boolean).join(' · ');

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        onScroll={(e) => setPastPhoto(e.nativeEvent.contentOffset.y > 312 - insets.top - 40)}
        scrollEventThrottle={32}
        testID="country-screen"
      >
        <View style={styles.top}>
          {satellite ? (
            <Image source={{ uri: satellite }} style={styles.fill} contentFit="cover" cachePolicy="disk" transition={200} accessible={false} />
          ) : (
            <PlacePhoto photo={c.photo} style={styles.fill} />
          )}
          <PhotoShade from={0.35} top />
          {credit ? (
            <View style={[styles.credit, { top: insets.top + 60 }]}>
              <Text style={styles.creditText} numberOfLines={2} maxFontSizeMultiplier={1.2}>
                {credit}
              </Text>
            </View>
          ) : null}
          <View style={styles.names}>
            <Text style={styles.flag} accessible={false}>
              {flagEmoji(c.iso2)}
            </Text>
            <Text style={styles.name} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={1.2} accessibilityRole="header">
              {name}
            </Text>
            {line ? (
              <Text style={styles.line} maxFontSizeMultiplier={1.3}>
                {line}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.sheet}>
          <View style={styles.actions}>
            {c.iso2 === 'BD' ? (
              <PressableScale haptic="medium" style={styles.primary} onPress={() => router.push('/explore/districts')} accessibilityRole="button" testID="country-bd-districts">
                <MaterialCommunityIcons name="map-outline" size={20} color={colors.onAccent} />
                <Text style={styles.primaryText} maxFontSizeMultiplier={1.3}>
                  {t('explore.allDistricts')}
                </Text>
              </PressableScale>
            ) : null}
            {me ? (
              <PressableScale
                haptic="selection"
                style={[styles.markButton, c.iso2 !== 'BD' && styles.wide]}
                onPress={() => setMarking(true)}
                accessibilityRole="button"
                accessibilityLabel={status ? `${t(`travels.status.${status}`)}. ${t('explore.markA11y', { name })}` : t('explore.markA11y', { name })}
                testID="country-mark"
              >
                {status ? (
                  <MarkChip status={status} />
                ) : (
                  <>
                    <MaterialCommunityIcons name="bookmark-outline" size={20} color={colors.textPrimary} />
                    <Text style={styles.markText} maxFontSizeMultiplier={1.3}>
                      {t('explore.mark')}
                    </Text>
                  </>
                )}
              </PressableScale>
            ) : null}
          </View>

          {description ? <Text style={styles.description}>{description}</Text> : null}
          <View style={styles.facts}>
            {rows.map(([k, v], i) => (
              <View key={k} style={[styles.fact, i === rows.length - 1 && styles.factLast]}>
                <Text style={styles.factKey}>{k}</Text>
                <Text style={styles.factValue}>{v}</Text>
              </View>
            ))}
          </View>

          {c.cities.length ? (
            <>
              <SectionHead title={t('explore.largestCitiesIn', { name })} />
              <RowCard>
                {c.cities.map((city, i) => (
                  <PlaceRow
                    key={city.geonameid}
                    icon="city-variant-outline"
                    title={city.name}
                    sub={[t('explore.peopleCount', { n: compactNumber(city.population, lang) }), city.region].filter(Boolean).join(' · ')}
                    status={cityStatus(visits, city.geonameid)}
                    last={i === c.cities.length - 1}
                  />
                ))}
              </RowCard>
            </>
          ) : null}
          <Sources lines={[t('explore.countrySources'), ...(credit === t('explore.satelliteEsri') ? [t('explore.satelliteCredit')] : [])]} />
          <PhotoCredits photos={satellite ? [] : [c.photo]} />
        </View>
      </ScrollView>
      {pastPhoto ? <View style={[styles.statusStrip, { height: insets.top }]} /> : null}
      {back}
      <OptionSheet<VisitStatus | 'none'>
        visible={marking}
        title={name}
        options={[
          { value: 'visited', label: t('travels.status.visited') },
          { value: 'lived', label: t('travels.status.lived') },
          { value: 'want', label: t('travels.status.want') },
          ...(status ? [{ value: 'none' as const, label: t('explore.notMarked') }] : []),
        ]}
        selected={status ?? 'none'}
        onSelect={(next) => {
          setMarking(false);
          if (next === status) return;
          if (next === 'none') clearVisit(queryClient, me!.id, place);
          else markPlace(place, next);
        }}
        onClose={() => setMarking(false)}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.bg },
  error: { ...t.type.callout, color: t.colors.danger, textAlign: 'center', paddingHorizontal: 32 },
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  statusStrip: { position: 'absolute', left: 0, top: 0, right: 0, backgroundColor: t.colors.bg },
  top: { height: 312, justifyContent: 'flex-end', backgroundColor: t.colors.hero },
  round: { position: 'absolute', left: 12, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.heroButton, ...t.depth.raised },
  credit: { position: 'absolute', right: 14, maxWidth: '70%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9, backgroundColor: t.colors.heroChip },
  creditText: { fontSize: 10.5, color: t.colors.onHero },
  names: { paddingHorizontal: 20, paddingBottom: 50, gap: 3 },
  flag: { fontSize: 28 },
  name: { fontFamily: t.type.title.fontFamily, fontWeight: 'normal', fontSize: 38, lineHeight: 44, color: t.colors.onPhoto },
  line: { fontSize: 14.5, color: t.colors.onPhotoSecondary },
  sheet: { marginTop: -30, paddingTop: 18, paddingHorizontal: 16, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: t.colors.bg, gap: 12 },
  actions: { flexDirection: 'row', gap: 10 },
  primary: { flex: 1, minHeight: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: t.colors.accentStrong, ...t.depth.raised },
  primaryText: { fontSize: 16, fontWeight: '700', color: t.colors.onAccent },
  markButton: { minHeight: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingLeft: 14, paddingRight: 18, backgroundColor: t.colors.surface, borderWidth: 1.5, borderColor: t.colors.hairline },
  wide: { flex: 1 },
  markText: { fontSize: 15, fontWeight: '500', color: t.colors.textPrimary },
  description: { ...t.type.callout, color: t.colors.textSecondary, marginHorizontal: 4 },
  facts: { borderRadius: 22, backgroundColor: t.colors.surface, paddingHorizontal: 16, ...t.depth.card },
  fact: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  factLast: { borderBottomWidth: 0 },
  factKey: { ...t.type.footnote, color: t.colors.textSecondary, width: 120 },
  factValue: { ...t.type.callout, color: t.colors.textPrimary, flex: 1, fontWeight: '600' },
}));
