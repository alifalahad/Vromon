/**
 * Vromon Mobile — a district in Explore.
 *
 * The district's map (the data platform's render: relief, rivers, neighbours, reviewed attractions;
 * tap it for full screen, zoom, save or share), then its names, division,
 * area and neighbours; "Plan a trip" when a trip destination lies in it; its GI-registered
 * foods and products (DPDT register: number, date, source); its attractions with photos; and
 * hotels, those with a room rate first ("from ৳…, as the hotel publishes it", with the date).
 * All from GET /explore/districts/{slug}; nothing here is sample data.
 */

import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Linking, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { districtMapUrl, localName, mapLanguage, useDistrict, useDistrictMaps, type GiFood, type Hotel } from '../../../src/features/explore/api';
import { Image } from 'expo-image';
import { PhotoCard, PhotoCredits } from '../../../src/features/explore/PhotoCard';
import { localDigits } from '../../../src/features/trips/plan/usePlanFormat';
import { PressableScale } from '../../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../../src/ui/theme';

export default function DistrictScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const q = useDistrict(slug ?? '');
  const maps = useDistrictMaps(slug ?? '');
  const mapLang = mapLanguage(maps.data, i18n.language);
  const d = q.data;
  const n = (v: number | string) => localDigits(String(v), lang);

  if (q.isLoading || !d) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        {q.error ? (
          <>
            <Text style={styles.error}>{t('explore.loadFailed')}</Text>
            <PressableScale style={styles.retry} onPress={() => q.refetch()}>
              <Text style={styles.retryText}>{t('explore.retry')}</Text>
            </PressableScale>
          </>
        ) : (
          <ActivityIndicator size="large" color={colors.link} />
        )}
      </View>
    );
  }

  const name = localName(d, lang);
  const other = lang === 'bn' ? d.name_en : d.name_bn;
  const foods = d.foods.filter((f) => f.is_food);
  const products = d.foods.filter((f) => !f.is_food);
  const division = lang === 'bn' ? d.division_bn || d.division_en : d.division_en;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.scroll} testID="district-screen">
        <View style={{ paddingTop: insets.top + 64 }}>
          {mapLang ? (
            <PressableScale
              pressEffect="opacity"
              onPress={() => router.push({ pathname: '/explore/district-map/[slug]', params: { slug: d.slug, name } })}
              accessibilityLabel={t('explore.openMap', { name })}
              testID="district-map-card"
            >
              <Image
                source={{ uri: districtMapUrl(d.slug, mapLang, 'card') }}
                style={styles.mapImage}
                contentFit="cover"
                cachePolicy="disk"
                transition={200}
              />
              <View style={styles.mapHint}>
                <MaterialIcons name="zoom-out-map" size={20} color="#FFFFFF" />
              </View>
            </PressableScale>
          ) : maps.isLoading ? (
            <ActivityIndicator color={colors.link} style={styles.mapLoading} />
          ) : null}
        </View>
        <View style={styles.body}>
          <Text style={styles.title} accessibilityRole="header">
            {name}
          </Text>
          {other ? <Text style={styles.subtitle}>{other}</Text> : null}
          <Text style={styles.meta}>
            {t('explore.districtOf', { division })}
            {d.area_km2 ? `  ·  ${n(Math.round(d.area_km2).toLocaleString('en-US'))} ${t('explore.km2')}` : ''}
            {d.subdistricts.length ? `  ·  ${t('explore.nUpazilas', { count: d.subdistricts.length, n: n(d.subdistricts.length) })}` : ''}
          </Text>

          {d.trip_destinations.map((dest) => (
            <PressableScale
              key={dest.id}
              haptic="medium"
              style={styles.plan}
              onPress={() => router.push({ pathname: '/trip/new', params: { destination: dest.name } })}
              testID="district-plan-trip"
            >
              <MaterialIcons name="luggage" size={20} color={colors.onAccent} />
              <Text style={styles.planText}>{t('explore.planTrip', { place: dest.name })}</Text>
            </PressableScale>
          ))}

          <View style={styles.stats}>
            <Stat value={n(d.counts.attractions)} label={t('explore.statSights')} />
            <Stat value={n(d.counts.gi_foods + d.counts.gi_products)} label={t('explore.statGi')} />
            <Stat value={n(d.counts.hotels)} label={t('explore.statHotels')} />
            <Stat value={n(d.counts.restaurants)} label={t('explore.statRestaurants')} />
          </View>

          <Section title={t('explore.giHere')} />
          {d.foods.length ? (
            <>
              {foods.map((f) => <GiRow key={f.name_bn} food={f} />)}
              {products.length ? <Text style={styles.subhead}>{t('explore.giProducts')}</Text> : null}
              {products.map((f) => <GiRow key={f.name_bn} food={f} />)}
            </>
          ) : (
            <Text style={styles.muted}>{t('explore.noGi')}</Text>
          )}

          {d.attractions.length ? (
            <>
              <Section title={t('explore.sights')} />
              <FlatList
                horizontal
                data={d.attractions.filter((a) => a.photo)}
                keyExtractor={(a) => a.slug}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.carousel}
                renderItem={({ item }) => <PhotoCard photo={item.photo} title={localName(item, lang)} subtitle={item.short_description_en} width={220} height={240} />}
              />
              {d.attractions
                .filter((a) => !a.photo)
                .map((a) => (
                  <View key={a.slug} style={styles.row}>
                    <MaterialIcons name="place" size={20} color={colors.warning} />
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle}>{localName(a, lang)}</Text>
                      {a.short_description_en ? <Text style={styles.muted}>{a.short_description_en}</Text> : null}
                    </View>
                  </View>
                ))}
            </>
          ) : null}

          {d.hotels.length ? (
            <>
              <Section title={t('explore.hotels')} />
              {d.hotels.map((h) => <HotelRow key={h.slug} hotel={h} />)}
              <Text style={styles.note}>{t('explore.hotelNote')}</Text>
            </>
          ) : null}

          {d.neighbors.length ? (
            <>
              <Section title={t('explore.neighbours')} />
              <View style={styles.chips}>
                {d.neighbors.map((nb) => (
                  <PressableScale key={nb.slug} style={styles.chip} onPress={() => router.push({ pathname: '/explore/district/[slug]', params: { slug: nb.slug } })}>
                    <Text style={styles.chipText}>{localName(nb, lang)}</Text>
                  </PressableScale>
                ))}
              </View>
            </>
          ) : null}

          {d.subdistricts.length ? (
            <>
              <Section title={t('explore.upazilas')} />
              <Text style={styles.muted}>{d.subdistricts.map((s) => localName(s, lang)).join(' · ')}</Text>
            </>
          ) : null}

          <PhotoCredits photos={[d.photo?.kind === 'satellite' ? null : d.photo, ...d.attractions.map((a) => a.photo)]} />
          {maps.data?.credits.length ? <Text style={styles.note}>{t('explore.mapCredits', { credits: maps.data.credits.join(' · ') })}</Text> : null}
          <Text style={styles.note}>{t('explore.districtSources')}</Text>
        </View>
      </ScrollView>
      <PressableScale
        style={[styles.back, { top: insets.top + 8 }]}
        onPress={() => router.back()}
        accessibilityLabel={t('explore.back')}
        hitSlop={8}
        testID="district-back"
      >
        <MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} />
      </PressableScale>
    </View>
  );
}

function Section({ title }: { title: string }) {
  const styles = useStyles();
  return (
    <Text style={styles.section} accessibilityRole="header">
      {title}
    </Text>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function GiRow({ food }: { food: GiFood }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const date = food.gi_application_date ? localDigits(food.gi_application_date.slice(0, 4), lang) : null;
  return (
    <PressableScale
      style={styles.gi}
      disabled={!food.source_url}
      onPress={() => food.source_url && Linking.openURL(food.source_url)}
      accessibilityLabel={`${food.name_bn}${food.name_en ? `, ${food.name_en}` : ''}`}
    >
      <MaterialIcons name={food.is_food ? 'restaurant' : 'local-mall'} size={24} color={colors.success} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{food.name_bn}</Text>
        {food.name_en ? <Text style={styles.muted}>{food.name_en}</Text> : null}
        <Text style={styles.giMeta}>
          {t('explore.giRegistered')}
          {food.gi_registration_no ? ` · ${t('explore.giNo', { n: localDigits(latinDigits(food.gi_registration_no), lang) })}` : ''}
          {date ? ` · ${t('explore.giApplied', { year: date })}` : ''}
        </Text>
      </View>
      {food.source_url ? <MaterialIcons name="open-in-new" size={18} color={colors.textTertiary} /> : null}
    </PressableScale>
  );
}

/** The register prints its numbers in Bangla digits */
function latinDigits(text: string): string {
  return text.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}

function HotelRow({ hotel }: { hotel: Hotel }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const price = hotel.price;
  const amount = price ? localDigits(Math.round(price.from_amount).toLocaleString('en-US'), lang) : null;
  return (
    <PressableScale
      style={styles.row}
      disabled={!hotel.website}
      onPress={() => hotel.website && Linking.openURL(hotel.website)}
      accessibilityLabel={localName(hotel, lang)}
    >
      <MaterialIcons name="hotel" size={20} color={colors.accent} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>
          {localName(hotel, lang)}
          {hotel.official_star_rating ? `  ${'★'.repeat(hotel.official_star_rating)}` : ''}
        </Text>
        {price ? (
          <Text style={styles.price}>
            {t('explore.fromPrice', { price: price.currency === 'BDT' ? `৳${amount}` : `${price.currency} ${amount}` })}
            <Text style={styles.muted}>
              {'  '}
              {price.room} · {t('explore.checked', { date: localDigits(price.checked_at.slice(0, 10), lang) })}
            </Text>
          </Text>
        ) : (
          <Text style={styles.muted}>{t('explore.noPrice')}</Text>
        )}
        {hotel.address ? (
          <Text style={styles.muted} numberOfLines={1}>
            {hotel.address}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: t.colors.bg },
  scroll: { paddingBottom: 40 },
  mapImage: { width: '100%', aspectRatio: 0.8, backgroundColor: '#F4EFE6' },
  mapLoading: { height: 300 },
  mapHint: {
    position: 'absolute',
    right: 10,
    top: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 18,
    padding: 8,
  },
  body: { paddingHorizontal: 16, paddingTop: 16 },
  back: {
    position: 'absolute',
    left: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.surface,
    elevation: 3,
  },
  title: { ...t.type.largeTitle, color: t.colors.textPrimary },
  subtitle: { ...t.type.title, fontWeight: '500', color: t.colors.textSecondary, marginTop: 2 },
  meta: { ...t.type.footnote, color: t.colors.textSecondary, marginTop: 8 },
  plan: {
    marginTop: 16,
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: t.colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  planText: { ...t.type.headline, color: t.colors.onAccent },
  stats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  stat: { flex: 1, borderRadius: 16, paddingVertical: 12, alignItems: 'center', backgroundColor: t.colors.surface },
  statValue: { ...t.type.title, color: t.colors.textPrimary },
  statLabel: { ...t.type.caption, color: t.colors.textSecondary, marginTop: 2 },
  section: { ...t.type.title, color: t.colors.textPrimary, marginTop: 28, marginBottom: 10 },
  subhead: { ...t.type.headline, color: t.colors.textSecondary, marginTop: 12, marginBottom: 6 },
  muted: { ...t.type.footnote, color: t.colors.textSecondary },
  note: { ...t.type.caption, color: t.colors.textTertiary, marginTop: 10 },
  error: { ...t.type.callout, color: t.colors.danger, textAlign: 'center' },
  retry: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 999, borderWidth: 1, borderColor: t.colors.accent },
  retryText: { color: t.colors.link, fontWeight: '600' },
  gi: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: t.colors.surface, marginBottom: 8 },
  giMeta: { ...t.type.caption, color: t.colors.success, marginTop: 4, fontWeight: '600' },
  carousel: { gap: 12, paddingBottom: 8 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...t.type.body, fontWeight: '600', color: t.colors.textPrimary },
  price: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.colors.surface },
  chipText: { ...t.type.callout, fontWeight: '600', color: t.colors.textPrimary },
}));
