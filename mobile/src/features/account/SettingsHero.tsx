/**
 * The top of Settings (UI refresh step 13, frame 26): who you are, on the hero card. Your photo, name,
 * username and country; three numbers from your own marks and trips (countries, your country's regions,
 * trips taken) that open Your travels; "Edit profile" and "Friend code".
 *
 * The numbers are the dashboard's own (travelSummary), so the two always agree.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { resolveLanguage } from '../../i18n';
import type { Me } from '../../types';
import { Avatar } from '../../ui/Avatar';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { countryName } from '../geo/countries';
import { DEFAULT_HOME, regionWord } from '../map/home';
import { travelSummary } from '../map/travels';
import { useVisits } from '../map/visits';
import { usePreferences } from '../preferences/store';
import { localToday } from '../trips/dates';
import { usePlanFormat } from '../trips/plan/usePlanFormat';
import { useTrips } from '../trips/queries';

const PHOTO = 64;
const RING = 3;

export function SettingsHero({ me }: { me: Me }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const lang = resolveLanguage(usePreferences((s) => s.language));
  const { data: visits = [] } = useVisits(me.id);
  const { data: trips = [] } = useTrips();
  const today = localToday();
  const home = me.home_country_iso2 ?? DEFAULT_HOME;
  const sum = useMemo(() => travelSummary(visits, home, trips, today), [visits, home, trips, today]);
  const name = me.display_name || me.username || '';
  const country = me.home_country_iso2 ? countryName(me.home_country_iso2, lang) : null;

  // The middle number: your country's regions when the app has them (Bangladesh's divisions), else your cities
  const middle = sum.homeRegions
    ? {
        value: f.n(sum.homeRegions.done),
        of: t('settings.statOf', { total: f.n(sum.homeRegions.total) }),
        label: t(`settings.statRegions.${regionWord(home)}`),
      }
    : { value: f.n(sum.cities), of: null, label: t('settings.statCities', { count: sum.cities }) };
  const cells = [
    { key: 'countries', value: f.n(sum.countries), of: null, label: t('settings.statCountries', { count: sum.countries }), lead: true },
    { key: 'middle', ...middle, lead: false },
    { key: 'trips', value: f.n(sum.trips), of: null, label: t('settings.statTrips', { count: sum.trips }), lead: false },
  ];
  const spoken = `${t('settings.yourTravels')}: ${cells.map((c) => [c.value, c.of, c.label].filter(Boolean).join(' ')).join(', ')}`;

  return (
    <View style={styles.hero} testID="settings-hero">
      <View style={styles.who}>
        <View style={styles.photoRing}>
          <Avatar name={name} id={me.id} uri={me.avatar_url} size={PHOTO} />
        </View>
        <View style={styles.names}>
          <Text style={styles.name} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            {name}
          </Text>
          <Text style={styles.handle} maxFontSizeMultiplier={1.4}>
            {[me.username ? `@${me.username}` : null, country].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      <PressableScale
        pressEffect="opacity"
        haptic="selection"
        onPress={() => router.push('/map/dashboard')}
        style={styles.numbers}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        testID="settings-travels"
      >
        {cells.map((c, i) => (
          <View key={c.key} style={[styles.cell, i > 0 && styles.cellLine]}>
            <Text style={[styles.value, c.lead && { color: colors.highlight }]} maxFontSizeMultiplier={1.3}>
              {c.value}
              {c.of ? <Text style={styles.of}> {c.of}</Text> : null}
            </Text>
            <Text style={styles.label} numberOfLines={2} maxFontSizeMultiplier={1.3}>
              {c.label}
            </Text>
          </View>
        ))}
      </PressableScale>

      <View style={styles.buttons}>
        <PressableScale
          haptic="selection"
          onPress={() => router.push('/settings/profile')}
          style={[styles.button, styles.edit]}
          accessibilityRole="button"
          accessibilityLabel={t('profile.edit')}
          testID="settings-profile"
        >
          <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.onHeroButton} />
          <Text style={styles.editText} maxFontSizeMultiplier={1.3}>
            {t('profile.edit')}
          </Text>
        </PressableScale>
        <PressableScale
          haptic="selection"
          onPress={() => router.push({ pathname: '/friends/add', params: { tab: 'code' } })}
          style={[styles.button, styles.code]}
          accessibilityRole="button"
          accessibilityLabel={t('settings.friendCode')}
          testID="settings-friend-code"
        >
          <MaterialCommunityIcons name="qrcode" size={18} color={colors.onHero} />
          <Text style={styles.codeText} maxFontSizeMultiplier={1.3}>
            {t('settings.friendCode')}
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  hero: {
    marginHorizontal: t.spacing.lg,
    marginBottom: t.spacing.xl,
    padding: 20,
    gap: 16,
    borderRadius: t.radius.hero,
    backgroundColor: t.colors.hero,
    ...t.depth.raised,
  },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photoRing: { padding: RING, borderRadius: (PHOTO + 2 * RING) / 2, backgroundColor: t.colors.onHero },
  names: { flex: 1, gap: 2 },
  name: { fontFamily: t.type.title.fontFamily, fontWeight: 'normal', fontSize: 26, lineHeight: 30, color: t.colors.onHero },
  handle: { fontSize: 14, color: t.colors.onHeroSecondary },
  numbers: { flexDirection: 'row', paddingVertical: 12, borderRadius: 18, backgroundColor: t.colors.heroInset },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 4 },
  cellLine: { borderLeftWidth: 1, borderLeftColor: t.colors.heroInsetLine },
  value: { fontFamily: t.type.title.fontFamily, fontWeight: 'normal', fontSize: 22, lineHeight: 28, color: t.colors.onHero },
  of: { fontFamily: t.type.title.fontFamily, fontSize: 14, color: t.colors.onHeroSecondary },
  label: { fontSize: 12.5, color: t.colors.onHeroSecondary, textAlign: 'center' },
  // Side by side when both labels fit on one line (frame 26); otherwise each takes a full row. A button is as
  // wide as its words and never shrinks to wrap them ("প্রোফাইল সম্পাদনা" at the default text size was squeezed
  // onto two lines), so the row breaks between the buttons instead
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    minWidth: 130,
    minHeight: 46,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  edit: { backgroundColor: t.colors.heroButton },
  editText: { fontSize: 15, fontWeight: '700', color: t.colors.onHeroButton },
  code: { borderWidth: 1.5, borderColor: t.colors.heroOutline },
  codeText: { fontSize: 15, fontWeight: '500', color: t.colors.onHero },
}));
