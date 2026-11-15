/**
 * New trip, "Getting there" (docs/ui-refresh step 5, frames NewTripWhen and NewTripGettingThere).
 *
 * Optional. Until it's added it's one quiet card; a trip without it is planned as before, and the
 * plan and the budget say the way there isn't counted. Added, it asks where the trip starts:
 *  - "Use my current location", precise: the most accurate fix the phone gives within a few seconds,
 *    named by the server from Vromon's own places ("Near Shahid Hadis Park, Khulna"), with how rough
 *    the fix is ("within about 20 m"); "Adjust on the map" opens the place picker on it. The location
 *    is asked for once, on the tap, and kept only as the trip's start;
 *  - or a city, searched.
 * Once there's a start and a destination: the ways there, as the journey service finds them for these
 * answers (POST /trips/journey-options, nothing saved), Vromon's pick first with its reason; each with
 * its time and its fare for one person, said as sure as it is. "Let Vromon choose by my budget", or
 * one way picked: that is what the trip is built with (newTrip.ts toPayload: transport_modes).
 */

import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { geoApi, tripsApi } from '../../../services/api';
import type { JourneyOption } from '../../../types';
import { LineIcon, type LineIconName } from '../../../ui/LineIcon';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { Toggle } from '../../../ui/Toggle';
import { PlacePicker, type PickedPlace } from '../../places/PlacePicker';
import { CitySearch, type RevealIn } from '../CitySearch';
import { usePlanFormat } from '../plan/usePlanFormat';
import { journeyAnswers, type NewTrip } from './newTrip';

/** How long to wait for a good fix, and what counts as good (metres) */
const FIX_WAIT_MS = 6000;
const GOOD_FIX_M = 25;

const MODE_ICON: Record<JourneyOption['mode'], LineIconName> = { bus: 'bus', train: 'train', plane: 'plane', car: 'car' };

type Fix = { lat: number; lon: number; accuracy: number | null };

/** The most accurate position the phone gives within FIX_WAIT_MS (the first reading is often a rough one). */
export function preciseFix(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    let best: Location.LocationObject | null = null;
    let sub: Location.LocationSubscription | null = null;
    let finished = false;
    const acc = (p: Location.LocationObject | null) => p?.coords.accuracy ?? Number.POSITIVE_INFINITY;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      sub?.remove();
      if (best) resolve({ lat: best.coords.latitude, lon: best.coords.longitude, accuracy: best.coords.accuracy ?? null });
      else
        // Nothing in time: one plain reading
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
          .then((p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy ?? null }))
          .catch(reject);
    };
    const timer = setTimeout(finish, FIX_WAIT_MS);
    Location.watchPositionAsync({ accuracy: Location.Accuracy.Highest, timeInterval: 1000, distanceInterval: 0 }, (p) => {
      if (acc(p) < acc(best)) best = p;
      if (acc(p) <= GOOD_FIX_M) finish();
    })
      .then((s) => {
        sub = s;
        if (finished) s.remove();
      })
      .catch(() => finish());
  });
}

/** "about 20 m", "about 350 m", "about 1.2 km": how rough a fix is, rounded the way people say it. */
export function roughness(metres: number): { n: number; unit: 'm' | 'km' } {
  if (metres < 100) return { n: Math.max(10, Math.round(metres / 10) * 10), unit: 'm' };
  if (metres < 1000) return { n: Math.round(metres / 50) * 50, unit: 'm' };
  return { n: Math.round(metres / 100) / 10, unit: 'km' };
}

export function GettingThereSection({ trip, set, reveal }: { trip: NewTrip; set: (change: Partial<NewTrip>) => void; reveal?: RevealIn }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const [adding, setAdding] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<'denied' | 'failed' | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const origin = trip.origin;

  const nameOf = async (lat: number, lon: number) => {
    try {
      return (await geoApi.where(lat, lon, i18n.language)).label;
    } catch {
      return null;
    }
  };

  const locateMe = async () => {
    setLocating(true);
    setLocateError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return setLocateError('denied');
      const fix = await preciseFix();
      const label = (await nameOf(fix.lat, fix.lon)) ?? t('newTrip.start.yourLocation');
      set({ origin: { here: true, lat: fix.lat, lon: fix.lon, label, accuracy: fix.accuracy } });
    } catch {
      setLocateError('failed');
    } finally {
      setLocating(false);
    }
  };

  const adjusted = async (p: PickedPlace) => {
    setAdjusting(false);
    const label = (await nameOf(p.lat, p.lon)) ?? t('newTrip.start.onMapName');
    set({ origin: { here: true, lat: p.lat, lon: p.lon, label, accuracy: null, onMap: true } });
  };

  const header = (
    <View style={styles.h2Row}>
      <Text style={styles.h2} accessibilityRole="header">
        {t('newTrip.gettingThere')}
      </Text>
      <Text style={styles.muted}>{t('newTrip.optional')}</Text>
    </View>
  );

  // Not added: one quiet card (frame NewTripWhen)
  if (!origin && !adding) {
    return (
      <>
        {header}
        <PressableScale
          pressEffect="opacity"
          haptic="selection"
          onPress={() => setAdding(true)}
          style={styles.addCard}
          accessibilityRole="button"
          testID="getting-there-add"
        >
          <View style={styles.iconDot}>
            <LineIcon name="trail" size={20} color={colors.textSecondary} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.addTitle}>{t('newTrip.start.addTitle')}</Text>
            <Text style={styles.small}>{t('newTrip.start.addHint')}</Text>
          </View>
          <Text style={styles.link}>{t('newTrip.start.add')}</Text>
        </PressableScale>
      </>
    );
  }

  // Where from: your location, or a city
  if (!origin) {
    return (
      <>
        {header}
        <View style={styles.card}>
          <PressableScale
            haptic="selection"
            onPress={locateMe}
            disabled={locating}
            style={styles.hereButton}
            accessibilityRole="button"
            accessibilityState={{ busy: locating }}
            testID="origin-here"
          >
            {locating ? <ActivityIndicator color={colors.link} /> : <LineIcon name="crosshair" size={20} color={colors.link} />}
            <Text style={styles.hereText}>{locating ? t('newTrip.start.locating') : t('newTrip.start.useLocation')}</Text>
          </PressableScale>
          {locateError ? (
            <Text style={styles.problem} accessibilityLiveRegion="polite" testID="origin-error">
              {t(`newTrip.start.${locateError}`)}
            </Text>
          ) : null}
          <View style={styles.search}>
            <CitySearch
              label={t('newTrip.fromWhere')}
              reveal={reveal}
              testID="origin-search"
              onPick={(city, country) => set({ origin: { city_geonameid: city.geonameid, label: `${city.name}, ${country}` } })}
            />
          </View>
          <PressableScale
            pressEffect="opacity"
            haptic="selection"
            onPress={() => setAdding(false)}
            style={styles.notNow}
            accessibilityRole="button"
            testID="origin-not-now"
          >
            <Text style={styles.link}>{t('newTrip.start.notNow')}</Text>
          </PressableScale>
        </View>
      </>
    );
  }

  const point = 'here' in origin ? origin : null;
  const where = !point
    ? null
    : point.onMap
      ? t('newTrip.start.setOnMap')
      : point.accuracy != null
        ? t(`newTrip.start.within_${roughness(point.accuracy).unit}`, { n: f.n(roughness(point.accuracy).n) })
        : t('newTrip.start.yourLocation');

  return (
    <>
      {header}
      {/* Starting from (frame NewTripGettingThere) */}
      <View style={styles.startCard} testID="origin-card">
        <View style={styles.startRow}>
          <View style={[styles.iconDot, styles.iconDotOn]}>
            <LineIcon name={point ? 'crosshair' : 'pin'} size={22} color={colors.accent} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>{t('newTrip.start.eyebrow').toUpperCase()}</Text>
            <Text style={styles.startName} testID="origin-name">
              {origin.label}
            </Text>
            {where ? <Text style={styles.small}>{where}</Text> : null}
          </View>
        </View>
        <View style={styles.startActions}>
          {point ? (
            <PressableScale
              pressEffect="opacity"
              haptic="selection"
              onPress={() => setAdjusting(true)}
              style={styles.action}
              accessibilityRole="button"
              testID="origin-adjust"
            >
              <Text style={styles.link}>{t('newTrip.start.adjust')}</Text>
            </PressableScale>
          ) : null}
          <PressableScale
            pressEffect="opacity"
            haptic="selection"
            onPress={() => {
              setAdding(true);
              set({ origin: null, modes: [] });
            }}
            style={styles.action}
            accessibilityRole="button"
            testID="origin-clear"
          >
            <Text style={styles.link}>{t('newTrip.change')}</Text>
          </PressableScale>
        </View>
      </View>
      {trip.destination ? <WaysThere trip={trip} set={set} /> : <Text style={styles.small}>{t('newTrip.ways.needDestination')}</Text>}
      {point ? (
        <PlacePicker
          visible={adjusting}
          title={t('newTrip.start.adjustTitle')}
          initial={{ lat: point.lat, lon: point.lon, label: null }}
          askName={false}
          onPick={adjusted}
          onClose={() => setAdjusting(false)}
        />
      ) : null}
    </>
  );
}

/** "11 h 20 min · about ৳1,450": the time, and the fare as sure as it is (for one person; a car, for the car). */
export function fareText(o: JourneyOption, t: TFunction, money: (n: number) => string): string {
  const priced = o.legs.filter((l) => l.fare != null);
  if (!priced.length) return t('newTrip.ways.fareUnknown');
  const byVehicle = priced.every((l) => l.fare_per === 'vehicle');
  const amount = money(byVehicle ? priced.reduce((sum, l) => sum + (l.fare ?? 0), 0) : o.cost_per_person);
  const key = `${o.all_official ? 'fare' : 'about'}${byVehicle ? 'Vehicle' : ''}`;
  const part = priced.length < o.legs.length ? t('newTrip.ways.partUnpriced') : '';
  return `${t(`newTrip.ways.${key}`, { amount })}${part}`;
}

function WaysThere({ trip, set }: { trip: NewTrip; set: (change: Partial<NewTrip>) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const answers = journeyAnswers(trip);
  // Asked again when the destination, the start, the travellers or the budget change (and the dates)
  const ways = useQuery({
    queryKey: ['journey-options', answers, trip.start, trip.end],
    queryFn: () => tripsApi.journeyOptions(answers!),
    enabled: answers !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const auto = trip.modes.length === 0;
  const options: JourneyOption[] = ways.data?.options ?? [];
  const chosen = auto ? options.find((o) => o.recommended)?.mode : trip.modes[0];

  return (
    <View style={styles.card} testID="ways-card">
      <View style={styles.waysHead}>
        <Text style={styles.waysTitle} accessibilityRole="header">
          {t('newTrip.ways.title')}
        </Text>
        {ways.data ? <Text style={styles.small}>{t('newTrip.ways.subtitle', { from: ways.data.from, to: ways.data.to })}</Text> : null}
      </View>

      {ways.isPending ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.link} />
          <Text style={styles.small}>{t('newTrip.ways.finding')}</Text>
        </View>
      ) : !options.length ? (
        <Text style={styles.noWay} accessibilityLiveRegion="polite" testID="ways-none">
          {ways.isError && !isNotFound(ways.error) ? t('newTrip.ways.failed') : t('newTrip.ways.none')}
        </Text>
      ) : (
        <>
          <View style={styles.autoRow}>
            <Text style={[styles.autoText, styles.flex]} nativeID="ways-auto-label">
              {t('newTrip.ways.auto')}
            </Text>
            <Toggle
              value={auto}
              onValueChange={(on) => set({ modes: on ? [] : chosen ? [chosen] : [] })}
              accessibilityLabel={t('newTrip.ways.auto')}
              testID="ways-auto"
            />
          </View>
          <View accessibilityRole="radiogroup">
            {options.map((o, i) => (
              <WayRow key={o.mode} option={o} on={o.mode === chosen} last={i === options.length - 1} onPress={() => set({ modes: [o.mode] })} />
            ))}
          </View>
          <Text style={styles.footnote}>{t('newTrip.ways.aboutMeans')}</Text>
        </>
      )}
      {ways.data?.missing.length ? <Text style={styles.footnote}>{t('journey.noLaunch')}</Text> : null}
      {ways.isFetching && !ways.isPending ? <ActivityIndicator style={styles.refreshing} color={colors.textTertiary} /> : null}
    </View>
  );
}

const isNotFound = (e: unknown) => {
  const status = (e as { response?: { status?: number } } | null)?.response?.status;
  return status === 404 || status === 422;
};

function WayRow({ option: o, on, last, onPress }: { option: JourneyOption; on: boolean; last: boolean; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const name = t(`newTrip.travelModes.${o.mode}`);
  const line = `${f.duration(o.minutes)} · ${fareText(o, t, f.money)}`;
  const train = o.legs.find((l) => l.mode === 'train' && l.depart);
  const why =
    o.recommended && o.reason_code
      ? t(`newTrip.ways.reason.${o.reason_code}`)
      : o.mode === 'train' && train?.depart
        ? t('newTrip.ways.trainAt', { time: f.time(train.depart) })
        : o.mode === 'plane'
          ? t('newTrip.ways.checkAirline')
          : null;
  return (
    <PressableScale
      pressEffect="opacity"
      haptic="selection"
      onPress={onPress}
      style={[styles.way, !last && styles.wayDivider]}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={[name, o.recommended ? t('newTrip.ways.pick') : null, line, why].filter(Boolean).join(', ')}
      testID={`way-${o.mode}`}
    >
      <View style={[styles.iconDot, o.recommended && styles.iconDotPick]}>
        <LineIcon name={MODE_ICON[o.mode]} size={22} color={o.recommended ? colors.success : colors.textSecondary} />
      </View>
      <View style={styles.flex}>
        <View style={styles.wayNameRow}>
          <Text style={styles.wayName}>{name}</Text>
          {o.recommended ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{t('newTrip.ways.pick')}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.wayLine}>{line}</Text>
        {why ? <Text style={styles.small}>{why}</Text> : null}
      </View>
      <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  h2Row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: t.spacing.sm, marginTop: t.spacing.md },
  h2: { ...t.type.title, color: t.colors.textPrimary },
  muted: { ...t.type.footnote, color: t.colors.textSecondary },
  small: { ...t.type.footnote, color: t.colors.textSecondary },
  link: { ...t.type.callout, fontSize: 14.5, fontWeight: '500', color: t.colors.link },
  card: { borderRadius: t.radius.card, backgroundColor: t.colors.surface, ...t.depth.card, overflow: 'hidden' },
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    minHeight: 66,
    paddingLeft: 14,
    paddingRight: t.spacing.md,
    paddingVertical: t.spacing.sm,
    borderRadius: t.radius.card,
    borderWidth: 1.5,
    borderColor: t.colors.hairline,
    backgroundColor: t.colors.surface,
  },
  addTitle: { ...t.type.callout, fontSize: 15.5, fontWeight: '500', color: t.colors.textPrimary },
  iconDot: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.colors.surfaceInset, alignItems: 'center', justifyContent: 'center' },
  iconDotOn: { backgroundColor: t.colors.accentTint },
  iconDotPick: { backgroundColor: t.colors.successBg },
  hereButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.sm,
    minHeight: 48,
    margin: t.spacing.md,
    marginBottom: 0,
    borderRadius: t.radius.control,
    backgroundColor: t.colors.accentTint,
  },
  hereText: { ...t.type.callout, fontWeight: '600', color: t.colors.onAccentSoft },
  problem: { ...t.type.footnote, color: t.colors.danger, paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.sm },
  search: { paddingHorizontal: t.spacing.md, paddingTop: t.spacing.md },
  notNow: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: t.spacing.lg },
  startCard: {
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surface,
    ...t.depth.card,
    paddingTop: 14,
    paddingLeft: 14,
    paddingRight: t.spacing.sm,
    paddingBottom: t.spacing.xs,
  },
  startRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  eyebrow: { ...t.type.caption, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.9, color: t.colors.textSecondary },
  startName: { ...t.type.body, fontSize: 16.5, fontWeight: '500', color: t.colors.textPrimary },
  startActions: { flexDirection: 'row', gap: t.spacing.xs, paddingLeft: 40 },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: t.spacing.md },
  waysHead: { paddingTop: 14, paddingHorizontal: t.spacing.lg, paddingBottom: 10, gap: 2 },
  waysTitle: { ...t.type.callout, fontSize: 16.5, fontWeight: '700', color: t.colors.textPrimary },
  loading: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.lg },
  noWay: { ...t.type.callout, color: t.colors.textSecondary, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.lg },
  autoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    minHeight: 50,
    marginHorizontal: t.spacing.sm,
    paddingLeft: t.spacing.md,
    paddingRight: t.spacing.sm,
    borderRadius: 14,
    backgroundColor: t.colors.bg,
  },
  autoText: { ...t.type.callout, fontSize: 14.5, color: t.colors.textPrimary },
  way: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 70, paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm },
  wayDivider: { borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  wayNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: t.spacing.sm },
  wayName: { ...t.type.callout, fontSize: 15.5, fontWeight: '700', color: t.colors.textPrimary },
  wayLine: { ...t.type.footnote, fontSize: 14, color: t.colors.textPrimary },
  badge: { minHeight: 20, paddingHorizontal: t.spacing.sm, borderRadius: 10, backgroundColor: t.colors.successBg, justifyContent: 'center' },
  badgeText: { ...t.type.caption, fontSize: 11.5, fontWeight: '700', color: t.colors.success },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: t.colors.switchOff, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: t.colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.colors.accent },
  footnote: {
    ...t.type.caption,
    fontSize: 12.5,
    color: t.colors.textSecondary,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: t.colors.divider,
  },
  refreshing: { position: 'absolute', right: t.spacing.lg, top: 16 },
}));
