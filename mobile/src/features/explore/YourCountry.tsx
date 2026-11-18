/**
 * Explore's "Your country" (docs/ui-refresh step 12, frames 22 and 23): the home country from the profile.
 * No country's name is written into the screen (D15): the card names whichever country is home.
 *
 * Bangladesh: the satellite picture of the country with its facts and how many of its 64 districts you've been
 * to; "Ready to plan" (the places Vromon can plan, in their districts); the districts by division, with your
 * marks; the GI foods; sources and photo credits.
 *
 * Any other country: its picture, facts and your count of cities there, its largest cities, and what you've
 * marked there, from GET /explore/countries/{iso2} and your own marks. Nothing invented: no districts.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import type { Visit } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { flagEmoji } from '../geo/countries';
import { beenCities } from '../map/travels';
import { localDigits } from '../trips/plan/usePlanFormat';
import { compactNumber, localName, useBangladesh, useCountry, type CountryCard } from './api';
import { DistrictGrid, GiCard, PhotoCredits, PhotoShade, PlaceRow, PlanCard, RowCard, SectionHead, Sources } from './ExploreParts';
import { MarkedHere } from './MarkedHere';
import { cityStatus, countrySatellite, districtOrder, districtsBeen, districtStatus, planOrder } from './marks';

/** How many "Ready to plan" cards the tab shows before "See all" */
const PLAN_CARDS = 12;

export function YourCountry({ home, visits }: { home: string; visits: readonly Visit[] }) {
  return home === 'BD' ? <Bangladesh visits={visits} /> : <HomeCountry iso2={home} visits={visits} />;
}

/** "Plan a trip" on a place: New trip with it chosen. */
export function usePlanTrip() {
  const router = useRouter();
  return (name: string) => router.push({ pathname: '/trip/new', params: { destination: name } });
}

function Bangladesh({ visits }: { visits: readonly Visit[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const planTrip = usePlanTrip();
  const bd = useBangladesh();
  const [division, setDivision] = useState<string | null>(null);
  const n = (v: number) => localDigits(String(v), lang);

  const divisions = useMemo(() => bd.data?.divisions ?? [], [bd.data]);
  const all = useMemo(() => new Map(divisions.flatMap((d) => d.districts).map((d) => [d.slug, d])), [divisions]);
  const places = useMemo(() => planOrder(bd.data?.destinations ?? [], all, visits), [bd.data, all, visits]);
  const plannable = useMemo(() => new Set(places.map((p) => p.district_slug)), [places]);
  const shown = division ?? divisions[0]?.slug ?? null;
  const districts = useMemo(() => districtOrder(divisions.find((d) => d.slug === shown)?.districts ?? []), [divisions, shown]);
  const openDistrict = (slug: string) => router.push({ pathname: '/explore/district/[slug]', params: { slug } });

  if (!bd.data) {
    return bd.error ? <LoadFailed onRetry={() => bd.refetch()} /> : <ActivityIndicator color={colors.link} style={styles.loading} />;
  }

  const country = bd.data.country;
  const been = districtsBeen(visits);
  const total = all.size;
  const planShown = places.slice(0, PLAN_CARDS);

  return (
    <>
      <CountryHero
        country={country}
        facts={[t('explore.bdCounts', { divisions: n(divisions.length), districts: n(total) })]}
        progress={{ done: been, total, words: () => t('explore.beenDistricts', { n: '§', total: n(total) }) }}
        button={t('explore.allDistricts')}
        onPress={() => router.push('/explore/districts')}
        testID="explore-bangladesh"
      />

      {places.length ? (
        <>
          <SectionHead
            title={t('explore.readyToPlan')}
            link={t('explore.seeAll', { n: n(places.length) })}
            onLink={() => router.push({ pathname: '/explore/districts', params: { show: 'plan' } })}
            testID="explore-plan-all"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel} style={styles.bleed}>
            {planShown.map((p) => (
              <PlanCard
                key={p.id}
                place={p}
                district={all.get(p.district_slug)}
                status={districtStatus(visits, p.district_slug)}
                onOpen={() => openDistrict(p.district_slug)}
                onPlan={() => planTrip(p.name)}
              />
            ))}
          </ScrollView>
        </>
      ) : null}

      {divisions.length ? (
        <>
          <SectionHead title={t('explore.districtsByDivision')} link={t('explore.allN', { n: n(total) })} onLink={() => router.push('/explore/districts')} />
          <DivisionChips divisions={divisions} shown={shown} onPick={setDivision} />
          <DistrictGrid
            districts={districts}
            statusOf={(slug) => districtStatus(visits, slug)}
            plannable={(slug) => plannable.has(slug)}
            onOpen={(d) => openDistrict(d.slug)}
          />
        </>
      ) : null}

      {bd.data.gi_foods.length ? (
        <>
          <SectionHead title={t('explore.giFoods')} note={t('explore.giNote', { n: n(bd.data.gi_foods.length) })} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel} style={styles.bleed} testID="explore-gi-foods">
            {bd.data.gi_foods.map((f) => {
              const d = f.district_slug ? all.get(f.district_slug) : undefined;
              return (
                <GiCard
                  key={f.name_bn}
                  name={f.name_bn}
                  where={d ? localName(d, lang) : t('explore.wholeCountry')}
                  onPress={d ? () => openDistrict(d.slug) : undefined}
                />
              );
            })}
          </ScrollView>
        </>
      ) : null}

      <Sources lines={[...bd.data.sources, t('explore.satelliteCredit')]} />
      <PhotoCredits photos={[...planShown.map((p) => all.get(p.district_slug)?.photo), ...districts.map((d) => d.photo)]} />
    </>
  );
}

/** The division chips over the district cards (frame 23). */
export function DivisionChips({
  divisions,
  shown,
  onPick,
  all,
}: {
  divisions: readonly { slug: string; name_en: string | null; name_bn: string | null }[];
  shown: string | null;
  onPick: (slug: string | null) => void;
  /** A first chip for every division ("All") */
  all?: string;
}) {
  const styles = useStyles();
  const { i18n } = useTranslation();
  const chips = [
    ...(all ? [{ slug: null as string | null, label: all }] : []),
    ...divisions.map((d) => ({ slug: d.slug as string | null, label: localName(d, i18n.language) })),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.bleed} accessibilityRole="tablist">
      {chips.map((c) => {
        const on = c.slug === shown;
        return (
          <PressableScale
            key={c.slug ?? 'all'}
            haptic="selection"
            pressEffect="opacity"
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => onPick(c.slug)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            testID={`division-${c.slug ?? 'all'}`}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]} maxFontSizeMultiplier={1.3}>
              {c.label}
            </Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

/**
 * The hero (frame 22): the satellite picture of the country itself, "Your country" over its name, its facts,
 * how far you've got (the number in the highlight colour), and its button.
 */
function CountryHero({
  country,
  facts,
  progress,
  line,
  button,
  onPress,
  testID,
}: {
  country: CountryCard;
  facts: string[];
  progress?: { done: number; total: number; words: () => string };
  /** In place of the progress bar */
  line?: string;
  button: string;
  onPress: () => void;
  testID: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const name = lang === 'bn' ? country.name_bn || country.name : country.name;
  const f = country.facts;
  const capital = f?.capital_en ? (lang === 'bn' ? f.capital_bn || f.capital_en : f.capital_en) : null;
  const factLine = [
    capital ? t('explore.capitalIs', { name: capital }) : null,
    f?.population ? t('explore.peopleCount', { n: compactNumber(f.population, lang) }) : null,
    ...facts,
  ]
    .filter(Boolean)
    .join(' · ');
  const picture = countrySatellite(country.iso2);
  const [before, after] = progress ? progress.words().split('§') : ['', ''];
  const spoken = [t('explore.yourCountry'), name, factLine, progress ? progress.words().replace('§', localDigits(String(progress.done), lang)) : line, button]
    .filter(Boolean)
    .join(', ');
  return (
    <PressableScale onPress={onPress} style={styles.hero} accessibilityRole="button" accessibilityLabel={spoken} testID={testID}>
      {picture ? <Image source={{ uri: picture }} style={styles.fill} contentFit="cover" cachePolicy="disk" transition={200} accessible={false} /> : null}
      <PhotoShade from={0.25} />
      {picture ? (
        <View style={styles.heroCredit}>
          <Text style={styles.heroCreditText} maxFontSizeMultiplier={1.2}>
            {t('explore.satelliteEsri')}
          </Text>
        </View>
      ) : null}
      <View style={styles.heroText}>
        <View style={styles.eyebrow}>
          <Text style={styles.flag} accessible={false}>
            {flagEmoji(country.iso2)}
          </Text>
          <Text style={styles.eyebrowText} maxFontSizeMultiplier={1.3}>
            {t('explore.yourCountry').toUpperCase()}
          </Text>
        </View>
        <Text style={styles.heroName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={1.2}>
          {name}
        </Text>
        {factLine ? (
          <Text style={styles.heroFacts} maxFontSizeMultiplier={1.3}>
            {factLine}
          </Text>
        ) : null}
        <View style={styles.heroRow}>
          <View style={styles.heroProgress}>
            {progress ? (
              <>
                <Text style={styles.heroCount} maxFontSizeMultiplier={1.3} testID={`${testID}-count`}>
                  {before}
                  <Text style={{ color: colors.highlight, fontWeight: '700' }}>{localDigits(String(progress.done), lang)}</Text>
                  {after}
                </Text>
                <View style={styles.bar}>
                  <View style={styles.barTrack} />
                  {/* Nothing filled at 0: the small minimum only keeps one district from being invisible */}
                  {progress.done ? <View style={[styles.barFill, { width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }]} /> : null}
                </View>
              </>
            ) : line ? (
              <Text style={styles.heroCount} maxFontSizeMultiplier={1.3} testID={`${testID}-count`}>
                {line}
              </Text>
            ) : null}
          </View>
          <View style={styles.heroButton}>
            <Text style={styles.heroButtonText} maxFontSizeMultiplier={1.2}>
              {button}
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.onHeroButton} />
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

/** Any home country other than Bangladesh: its facts and cities, and what you've marked there. */
function HomeCountry({ iso2, visits }: { iso2: string; visits: readonly Visit[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const q = useCountry(iso2);
  const c = q.data;
  if (!c) return q.error ? <LoadFailed onRetry={() => q.refetch()} /> : <ActivityIndicator color={colors.link} style={styles.loading} />;

  const name = lang === 'bn' ? c.name_bn || c.name : c.name;
  const cities = beenCities(visits, { country: iso2 }).length;
  return (
    <>
      <CountryHero
        country={c}
        facts={[]}
        line={cities ? t('explore.beenCities', { count: cities, n: localDigits(String(cities), lang) }) : t('explore.markOnMap')}
        button={t('explore.yourTravelsHere')}
        onPress={() => router.push({ pathname: '/map/country/[iso2]', params: { iso2 } })}
        testID="explore-home-country"
      />
      <SectionHead title={t('explore.markedHere')} />
      <MarkedHere country={iso2} />
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
                testID={`home-city-${city.geonameid}`}
              />
            ))}
          </RowCard>
        </>
      ) : null}
      <SectionHead title={t('explore.aboutCountry', { name })} />
      <RowCard>
        <PlaceRow
          flag={flagEmoji(iso2)}
          title={t('explore.factsAbout', { name })}
          sub={t('explore.factsLine')}
          onPress={() => router.push({ pathname: '/explore/country/[iso2]', params: { iso2 } })}
          last
          testID="home-country-facts"
        />
      </RowCard>
      <Sources lines={[t('explore.countrySources'), t('explore.satelliteCredit')]} />
    </>
  );
}

export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.failed}>
      <Text style={styles.failedText}>{t('explore.loadFailed')}</Text>
      <PressableScale pressEffect="opacity" onPress={onRetry} style={styles.retry} accessibilityRole="button">
        <Text style={styles.retryText}>{t('explore.retry')}</Text>
      </PressableScale>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  loading: { marginVertical: 32 },
  bleed: { marginHorizontal: -16 },
  carousel: { gap: 12, paddingHorizontal: 16, paddingBottom: 4 },
  chips: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    justifyContent: 'center',
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.hairline,
  },
  chipOn: { backgroundColor: t.colors.textPrimary, borderColor: t.colors.textPrimary },
  chipText: { fontSize: 14.5, fontWeight: '500', color: t.colors.textPrimary },
  chipTextOn: { fontWeight: '700', color: t.colors.bg },
  hero: { minHeight: 296, borderRadius: t.radius.hero, overflow: 'hidden', backgroundColor: t.colors.hero, justifyContent: 'flex-end', ...t.depth.raised },
  heroCredit: {
    position: 'absolute',
    right: 12,
    top: 12,
    minHeight: 22,
    paddingHorizontal: 9,
    borderRadius: 11,
    justifyContent: 'center',
    backgroundColor: t.colors.heroChip,
  },
  heroCreditText: { fontSize: 11, color: t.colors.onHero },
  heroText: { paddingHorizontal: 20, paddingBottom: 18, paddingTop: 96, gap: 6 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flag: { fontSize: 22 },
  eyebrowText: { fontSize: 11.5, fontWeight: '700', letterSpacing: 1.4, color: t.colors.onPhotoSecondary },
  heroName: { fontFamily: t.type.title.fontFamily, fontWeight: 'normal', fontSize: 36, lineHeight: 42, marginTop: 2, color: t.colors.onPhoto },
  heroFacts: { fontSize: 13.5, color: t.colors.onPhotoSecondary },
  heroRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  heroProgress: { flex: 1, minWidth: 160, gap: 6 },
  heroCount: { fontSize: 13, fontWeight: '500', color: t.colors.onPhoto },
  bar: { height: 5, borderRadius: 3, overflow: 'hidden', flexDirection: 'row' },
  barTrack: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: t.colors.onPhoto, opacity: 0.28 },
  barFill: { minWidth: 14, borderRadius: 3, backgroundColor: t.colors.highlight },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingLeft: 16,
    paddingRight: 10,
    borderRadius: 22,
    backgroundColor: t.colors.heroButton,
  },
  heroButtonText: { fontSize: 14.5, fontWeight: '700', color: t.colors.onHeroButton },
  failed: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  failedText: { ...t.type.callout, color: t.colors.danger, textAlign: 'center' },
  retry: { minHeight: 44, paddingHorizontal: 24, borderRadius: 22, justifyContent: 'center', borderWidth: 1, borderColor: t.colors.accent },
  retryText: { color: t.colors.link, fontWeight: '600' },
}));
