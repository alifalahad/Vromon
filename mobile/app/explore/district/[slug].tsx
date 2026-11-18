/**
 * Vromon Mobile — a district in Explore (docs/ui-refresh step 12, frame 25).
 *
 * The district's photo across the top with its credit (Esri's satellite picture when it has none), its
 * names, division and area; "Plan a trip here" when Vromon can plan a place in it, and "Mark" (visited, lived,
 * want: the same marks as the map); its four counts, each jumping to its section; its map (the data platform's
 * render) with the districts around it; then its sights, stays (with the room rate a hotel publishes, and the
 * date it was read), places to eat, GI foods and products, neighbours, upazilas and sources.
 * All from GET /explore/districts/{slug} (and its pages of hotels and places to eat) and your own marks.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../../src/features/account/useMe';
import { destinationCard } from '../../../src/features/chat/share';
import {
  districtMapUrl,
  localName,
  mapLanguage,
  useDistrict,
  useDistrictMaps,
  useDistrictPlaces,
  type Attraction,
  type GiFood,
  type Hotel,
  type PlaceKind,
} from '../../../src/features/explore/api';
import { CountCell, MarkChip, PhotoCredits, PhotoShade, PlacePhoto, PlaceRow, RowCard, SectionHead, Sources } from '../../../src/features/explore/ExploreParts';
import { districtCode, districtStatus } from '../../../src/features/explore/marks';
import { usePlanTrip } from '../../../src/features/explore/YourCountry';
import { HOME_DISTRICT_AREAS } from '../../../src/features/map/geoData';
import { useMarkPlace } from '../../../src/features/map/useMarkPlace';
import { clearVisit, useVisits } from '../../../src/features/map/visits';
import { formatRange } from '../../../src/features/trips/dates';
import { localDigits } from '../../../src/features/trips/plan/usePlanFormat';
import type { Destination, VisitStatus } from '../../../src/types';
import { ActionSheet } from '../../../src/ui/ActionSheet';
import { OptionSheet } from '../../../src/ui/OptionSheet';
import { PressableScale } from '../../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../../src/ui/theme';

/** Rows shown before "Show more" (sights without a photo) */
const ROWS = 5;

type Section = 'sheet' | 'sights' | 'stays' | 'eat' | 'upazilas';

export default function DistrictScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  const q = useDistrict(slug);
  const maps = useDistrictMaps(slug);
  const mapLang = mapLanguage(maps.data, lang);
  const { data: me } = useMe();
  const { data: visits = [] } = useVisits(me?.id);
  const markPlace = useMarkPlace(me?.id ?? '', visits);
  const queryClient = useQueryClient();
  const planTrip = usePlanTrip();
  const [marking, setMarking] = useState(false);
  const [choosing, setChoosing] = useState(false);
  // Past the photo, a strip under the status bar so the page doesn't run under its icons
  const [pastPhoto, setPastPhoto] = useState(false);
  const scroll = useRef<ScrollView>(null);
  // Where each section starts on the page, for the counts that jump to them
  const [at, setAt] = useState<Partial<Record<Section, number>>>({});
  const d = q.data;

  const back = (
    <PressableScale style={[styles.round, { top: insets.top + 8, left: 12 }]} onPress={() => router.back()} accessibilityLabel={t('explore.back')} hitSlop={4} testID="district-back">
      <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onHeroButton} />
    </PressableScale>
  );

  if (!d) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        {q.error ? (
          <>
            <Text style={styles.error}>{t('explore.loadFailed')}</Text>
            <PressableScale style={styles.retry} onPress={() => q.refetch()} accessibilityRole="button">
              <Text style={styles.retryText}>{t('explore.retry')}</Text>
            </PressableScale>
          </>
        ) : (
          <ActivityIndicator size="large" color={colors.link} />
        )}
        {back}
      </View>
    );
  }

  const name = localName(d, lang);
  const other = lang === 'bn' ? d.name_en : d.name_bn;
  const division = lang === 'bn' ? d.division_bn || d.division_en : d.division_en;
  const area = d.area_km2 ? `${localDigits(Math.round(d.area_km2).toLocaleString('en-US'), lang)} ${t('explore.km2')}` : null;
  const status = districtStatus(visits, d.slug);
  const place = { place_type: 'district' as const, place_code: districtCode(d.slug), country_iso2: 'BD' };
  const credit = d.photo?.kind === 'satellite' ? t('explore.satelliteEsri') : [d.photo?.caption, d.photo?.attribution].filter(Boolean).join(' · ');
  const dests = d.trip_destinations;
  // A section's place is within the sheet, which starts under the photo; it stops clear of the round buttons
  const jump = (s: Section) => scroll.current?.scrollTo({ y: Math.max(0, (at.sheet ?? 0) + (at[s] ?? 0) - insets.top - 64), animated: true });
  const mark = (s: Section) => (e: { nativeEvent: { layout: { y: number } } }) => {
    const y = e.nativeEvent.layout.y;
    setAt((old) => (old[s] === y ? old : { ...old, [s]: y }));
  };
  const plan = () => (dests.length > 1 ? setChoosing(true) : dests[0] && planTrip(dests[0].name));
  const send = () => {
    const dest = dests.find((x) => x.name === d.name_en) ?? dests[0];
    if (!dest) return;
    const region = HOME_DISTRICT_AREAS.features.find((f) => f.properties.code === place.place_code)?.properties.region ?? null;
    const card = destinationCard({ id: dest.id, name: dest.name, latitude: d.centroid_lat, longitude: d.centroid_lon, region_code: region } as Destination);
    router.push({ pathname: '/share/send', params: { card: JSON.stringify(card) } });
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        onScroll={(e) => setPastPhoto(e.nativeEvent.contentOffset.y > 312 - insets.top - 40)}
        scrollEventThrottle={32}
        testID="district-screen"
      >
        <View style={styles.top}>
          <PlacePhoto photo={d.photo} style={styles.fill} />
          <PhotoShade from={0.35} top />
          <View style={[styles.credit, { top: insets.top + 60 }]}>
            <Text style={styles.creditText} numberOfLines={2} maxFontSizeMultiplier={1.2} testID="district-photo-credit">
              {credit}
            </Text>
          </View>
          <View style={styles.names}>
            <Text style={styles.name} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={1.2} accessibilityRole="header">
              {name}
            </Text>
            <Text style={styles.line} maxFontSizeMultiplier={1.3}>
              {other ? <Text style={lang === 'bn' ? null : styles.bangla}>{other}</Text> : null}
              {[other ? '' : null, division ? t('explore.divisionTitle', { name: division }) : null, area].filter((x) => x !== null).join(' · ')}
            </Text>
          </View>
        </View>

        <View style={styles.sheet} onLayout={mark('sheet')}>
          <View style={styles.actions}>
            {dests.length ? (
              <PressableScale haptic="medium" style={styles.planButton} onPress={plan} accessibilityRole="button" testID="district-plan-trip">
                <MaterialCommunityIcons name="map-marker-path" size={20} color={colors.onAccent} />
                <Text style={styles.planText} maxFontSizeMultiplier={1.3}>
                  {t('explore.planHere')}
                </Text>
              </PressableScale>
            ) : null}
            {me ? (
              <PressableScale
                haptic="selection"
                style={[styles.markButton, !dests.length && styles.markWide]}
                onPress={() => setMarking(true)}
                accessibilityRole="button"
                accessibilityLabel={status ? `${t(`travels.status.${status}`)}. ${t('explore.markA11y', { name })}` : t('explore.markA11y', { name })}
                testID="district-mark"
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

          <View style={styles.counts}>
            <CountCell first value={d.counts.attractions} label={t('explore.statSights')} onPress={d.counts.attractions ? () => jump('sights') : undefined} testID="count-sights" />
            <CountCell value={d.counts.hotels} label={t('explore.statStays')} onPress={d.counts.hotels ? () => jump('stays') : undefined} testID="count-stays" />
            <CountCell value={d.counts.restaurants} label={t('explore.statEat')} onPress={d.counts.restaurants ? () => jump('eat') : undefined} testID="count-eat" />
            <CountCell value={d.subdistricts.length} label={t('explore.upazilas')} onPress={d.subdistricts.length ? () => jump('upazilas') : undefined} testID="count-upazilas" />
          </View>

          {mapLang ? (
            <PressableScale
              pressEffect="opacity"
              style={styles.map}
              onPress={() => router.push({ pathname: '/explore/district-map/[slug]', params: { slug: d.slug, name } })}
              accessibilityRole="button"
              accessibilityLabel={t('explore.openMap', { name })}
              testID="district-map-card"
            >
              <Image source={{ uri: districtMapUrl(d.slug, mapLang, 'card', maps.data?.versions?.[mapLang]) }} style={styles.fill} contentFit="cover" cachePolicy="disk" transition={200} accessible={false} />
              {d.neighbors.length ? (
                <View style={styles.mapChip}>
                  <Text style={styles.mapChipText} numberOfLines={2} maxFontSizeMultiplier={1.2}>
                    {t('explore.nextTo', { names: d.neighbors.map((nb) => localName(nb, lang)).join(', ') })}
                  </Text>
                </View>
              ) : null}
              <View style={styles.mapOpen}>
                <MaterialCommunityIcons name="arrow-expand-all" size={16} color={colors.linkOnWhite} />
                <Text style={styles.mapOpenText} maxFontSizeMultiplier={1.2}>
                  {t('explore.openTheMap')}
                </Text>
              </View>
            </PressableScale>
          ) : null}

          {d.attractions.length ? (
            <View onLayout={mark('sights')}>
              <Sights list={d.attractions} total={d.counts.attractions} />
            </View>
          ) : null}

          {d.counts.hotels ? (
            <View onLayout={mark('stays')}>
              <SectionHead title={t('explore.stays')} note={t('explore.hotelNote')} />
              <Places slug={d.slug} kind="accommodation" first={d.hotels} total={d.counts.hotels} />
            </View>
          ) : null}

          {d.counts.restaurants ? (
            <View onLayout={mark('eat')}>
              <SectionHead title={t('explore.statEat')} />
              <Places slug={d.slug} kind="food" first={d.restaurants} total={d.counts.restaurants} />
            </View>
          ) : null}

          <SectionHead title={t('explore.giHere')} />
          {d.foods.length ? (
            <RowCard>
              {d.foods.map((f, i) => (
                <GiRow key={f.name_bn} food={f} last={i === d.foods.length - 1} />
              ))}
            </RowCard>
          ) : (
            <Text style={styles.muted}>{t('explore.noGi')}</Text>
          )}

          {d.neighbors.length ? (
            <>
              <SectionHead title={t('explore.neighbours')} />
              <View style={styles.chips}>
                {d.neighbors.map((nb) => (
                  <PressableScale
                    key={nb.slug}
                    pressEffect="opacity"
                    style={styles.chip}
                    onPress={() => router.push({ pathname: '/explore/district/[slug]', params: { slug: nb.slug } })}
                    accessibilityRole="button"
                  >
                    <Text style={styles.chipText} maxFontSizeMultiplier={1.3}>
                      {localName(nb, lang)}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </>
          ) : null}

          {d.subdistricts.length ? (
            <View onLayout={mark('upazilas')}>
              <SectionHead title={t('explore.upazilas')} />
              <View style={styles.textCard}>
                <Text style={styles.textCardText}>{d.subdistricts.map((s) => localName(s, lang)).join(' · ')}</Text>
              </View>
            </View>
          ) : null}

          <Sources lines={[t('explore.districtSources'), ...(maps.data?.credits.length ? [t('explore.mapCredits', { credits: maps.data.credits.join(' · ') })] : [])]} />
          <PhotoCredits photos={[d.photo, ...d.attractions.map((a) => a.photo)]} />
        </View>
      </ScrollView>

      {pastPhoto ? <View style={[styles.statusStrip, { height: insets.top }]} /> : null}
      {back}
      {dests.length ? (
        <PressableScale style={[styles.round, { top: insets.top + 8, right: 12 }]} onPress={send} accessibilityLabel={t('chat.share.sendToFriend')} hitSlop={4} testID="district-send">
          <MaterialCommunityIcons name="export-variant" size={20} color={colors.onHeroButton} />
        </PressableScale>
      ) : null}

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
      <ActionSheet
        visible={choosing}
        title={t('explore.planWhere')}
        actions={dests.map((x) => ({ key: String(x.id), label: x.name, icon: 'map-marker-outline' as const, onPress: () => planTrip(x.name) }))}
        onClose={() => setChoosing(false)}
      />
    </View>
  );
}

/** Sights with a photo as cards; the rest as rows, five until "Show all". */
function Sights({ list, total }: { list: Attraction[]; total: number }) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [all, setAll] = useState(false);
  const pictured = list.filter((a) => a.photo);
  const rest = list.filter((a) => !a.photo);
  const rows = all ? rest : rest.slice(0, ROWS);
  const n = (v: number) => localDigits(String(v), lang);
  return (
    <>
      <SectionHead
        title={t('explore.sights')}
        link={!all && rest.length > ROWS ? t('explore.allN', { n: n(total) }) : undefined}
        onLink={() => setAll(true)}
        testID="sights-all"
      />
      {pictured.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel} style={styles.bleed}>
          {pictured.map((a) => (
            <View key={a.slug} style={styles.sight} accessible accessibilityLabel={[localName(a, lang), sightKind(t, a.category)].filter(Boolean).join(', ')}>
              <PlacePhoto photo={a.photo} style={styles.sightPhoto} />
              <View style={styles.sightText}>
                <Text style={styles.sightName} numberOfLines={2} maxFontSizeMultiplier={1.3}>
                  {localName(a, lang)}
                </Text>
                {a.category ? (
                  <Text style={styles.sightKind} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                    {sightKind(t, a.category)}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : null}
      {rows.length ? (
        <View style={pictured.length ? styles.after : null}>
          <RowCard>
            {rows.map((a, i) => (
              <PlaceRow key={a.slug} icon="map-marker-outline" title={localName(a, lang)} sub={[sightKind(t, a.category), lang === 'bn' ? null : a.short_description_en].filter(Boolean).join(' · ')} last={i === rows.length - 1 && (all || rest.length <= ROWS)} />
            ))}
            {!all && rest.length > ROWS ? <MoreRow label={t('explore.showMore', { n: n(rest.length - ROWS) })} onPress={() => setAll(true)} testID="sights-more" /> : null}
          </RowCard>
        </View>
      ) : null}
    </>
  );
}

const sightKind = (t: (k: string, o?: Record<string, unknown>) => string, code: string | null) => (code ? t(`explore.sightKind.${code}`, { defaultValue: '' }) : '');

/** A district's hotels or places to eat: the first page with the district, then 20 more a tap, until the count. */
function Places({ slug, kind, first, total }: { slug: string; kind: PlaceKind; first: Hotel[]; total: number }) {
  const { t, i18n } = useTranslation();
  const [more, setMore] = useState(false);
  const pages = useDistrictPlaces(slug, kind, first.length, more);
  const rows = [...first, ...(pages.data?.pages.flatMap((p) => p.items) ?? [])];
  const left = total - rows.length;
  const n = (v: number) => localDigits(String(v), i18n.language);
  const next = () => (more ? pages.fetchNextPage() : setMore(true));
  return (
    <RowCard>
      {rows.map((h, i) => (
        <PlaceRow
          key={h.slug}
          icon={kind === 'food' ? 'silverware-fork-knife' : 'bed-outline'}
          title={`${localName(h, i18n.language)}${h.official_star_rating ? `  ${'★'.repeat(h.official_star_rating)}` : ''}`}
          sub={kind === 'food' ? eatKind(t, h.category) : stayLine(h, t, i18n.language)}
          onPress={h.website ? () => Linking.openURL(h.website!) : undefined}
          last={i === rows.length - 1 && left <= 0}
          testID={`${kind}-${h.slug}`}
        />
      ))}
      {left > 0 ? (
        <MoreRow
          label={pages.isFetching ? t('explore.loading') : t('explore.showMore', { n: n(Math.min(20, left)) })}
          sub={t('explore.ofTotal', { shown: n(rows.length), total: n(total) })}
          onPress={pages.isFetching ? undefined : next}
          testID={`${kind}-more`}
        />
      ) : null}
    </RowCard>
  );
}

const eatKind = (t: (k: string, o?: Record<string, unknown>) => string, code: string | null) => (code ? t(`explore.eatKind.${code}`, { defaultValue: t('explore.eatKind.restaurant') }) : t('explore.eatKind.restaurant'));

/** "from ৳2,250 a night · checked 5 Nov", or that the hotel publishes no rate. */
function stayLine(h: Hotel, t: (k: string, o?: Record<string, unknown>) => string, lang: string): string {
  const kind = h.category ? t(`stays.kind.${h.category}`, { defaultValue: '' }) : '';
  if (!h.price) return [kind, t('explore.noPrice')].filter(Boolean).join(' · ');
  const amount = localDigits(Math.round(h.price.from_amount).toLocaleString('en-US'), lang);
  const price = h.price.currency === 'BDT' ? `৳${amount}` : `${h.price.currency} ${amount}`;
  return [kind, t('explore.fromNight', { price }), t('explore.checked', { date: localDigits(formatRange(h.price.checked_at.slice(0, 10), h.price.checked_at.slice(0, 10), lang), lang) })].filter(Boolean).join(' · ');
}

function MoreRow({ label, sub, onPress, testID }: { label: string; sub?: string; onPress?: () => void; testID?: string }) {
  const styles = useStyles();
  return (
    <PressableScale pressEffect="opacity" haptic="selection" disabled={!onPress} onPress={onPress} style={styles.more} accessibilityRole="button" testID={testID}>
      <Text style={styles.moreText} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      {sub ? <Text style={styles.moreSub}>{sub}</Text> : null}
    </PressableScale>
  );
}

function GiRow({ food, last }: { food: GiFood; last: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const year = food.gi_application_date ? localDigits(food.gi_application_date.slice(0, 4), lang) : null;
  const sub = [
    food.name_en,
    t(food.is_food ? 'explore.giFood' : 'explore.giProduct'),
    food.gi_registration_no ? t('explore.giNo', { n: localDigits(latinDigits(food.gi_registration_no), lang) }) : null,
    year ? t('explore.giApplied', { year }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <PlaceRow
      icon={food.is_food ? 'food-variant' : 'shopping-outline'}
      title={food.name_bn}
      sub={sub}
      onPress={food.source_url ? () => Linking.openURL(food.source_url!) : undefined}
      last={last}
    />
  );
}

/** The register prints its numbers in Bangla digits */
function latinDigits(text: string): string {
  return text.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: t.colors.bg },
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  statusStrip: { position: 'absolute', left: 0, top: 0, right: 0, backgroundColor: t.colors.bg },
  top: { height: 312, justifyContent: 'flex-end', backgroundColor: t.colors.hero },
  round: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.heroButton,
    ...t.depth.raised,
  },
  credit: { position: 'absolute', right: 14, maxWidth: '70%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9, backgroundColor: t.colors.heroChip },
  creditText: { fontSize: 10.5, color: t.colors.onHero },
  names: { paddingHorizontal: 20, paddingBottom: 50, gap: 3 },
  name: { fontFamily: t.type.title.fontFamily, fontWeight: 'normal', fontSize: 38, lineHeight: 44, color: t.colors.onPhoto },
  line: { fontSize: 14.5, color: t.colors.onPhotoSecondary },
  bangla: { fontFamily: t.type.title.fontFamily, fontWeight: 'normal' },
  sheet: { marginTop: -30, paddingTop: 18, paddingHorizontal: 16, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: t.colors.bg, gap: 12 },
  actions: { flexDirection: 'row', gap: 10 },
  planButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    backgroundColor: t.colors.accentStrong,
    ...t.depth.raised,
  },
  planText: { fontSize: 16, fontWeight: '700', color: t.colors.onAccent },
  markButton: {
    minHeight: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingLeft: 14,
    paddingRight: 18,
    backgroundColor: t.colors.surface,
    borderWidth: 1.5,
    borderColor: t.colors.hairline,
  },
  markWide: { flex: 1 },
  markText: { fontSize: 15, fontWeight: '500', color: t.colors.textPrimary },
  counts: { flexDirection: 'row', paddingVertical: 14, borderRadius: 22, backgroundColor: t.colors.surface, ...t.depth.card },
  map: { height: 176, borderRadius: 22, overflow: 'hidden', backgroundColor: t.colors.surfaceInset, ...t.depth.card },
  mapChip: { position: 'absolute', left: 12, top: 12, right: 12, alignSelf: 'flex-start', flexDirection: 'row' },
  mapChipText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: t.colors.onHeroButton,
    backgroundColor: t.colors.heroButton,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 14,
    overflow: 'hidden',
  },
  mapOpen: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 18,
    backgroundColor: t.colors.heroButton,
    ...t.depth.raised,
  },
  mapOpenText: { fontSize: 13.5, fontWeight: '700', color: t.colors.linkOnWhite },
  bleed: { marginHorizontal: -16 },
  carousel: { gap: 12, paddingHorizontal: 16, paddingBottom: 4 },
  after: { marginTop: 12 },
  sight: { width: 156, borderRadius: 20, overflow: 'hidden', backgroundColor: t.colors.surface, ...t.depth.card },
  sightPhoto: { height: 104 },
  sightText: { paddingTop: 10, paddingHorizontal: 12, paddingBottom: 12, gap: 2 },
  sightName: { fontSize: 15, fontWeight: '700', color: t.colors.textPrimary },
  sightKind: { fontSize: 12.5, color: t.colors.textSecondary },
  more: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.colors.divider },
  moreText: { fontSize: 15, fontWeight: '600', color: t.colors.link },
  moreSub: { fontSize: 12.5, color: t.colors.textSecondary },
  muted: { ...t.type.callout, color: t.colors.textSecondary, marginHorizontal: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: 'center', backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.hairline },
  chipText: { fontSize: 14.5, fontWeight: '500', color: t.colors.textPrimary },
  textCard: { padding: 16, borderRadius: 22, backgroundColor: t.colors.surface, ...t.depth.card },
  textCardText: { ...t.type.callout, lineHeight: 22, color: t.colors.textSecondary },
  error: { ...t.type.callout, color: t.colors.danger, textAlign: 'center' },
  retry: { minHeight: 44, paddingHorizontal: 24, borderRadius: 22, justifyContent: 'center', borderWidth: 1, borderColor: t.colors.accent },
  retryText: { color: t.colors.link, fontWeight: '600' },
}));
