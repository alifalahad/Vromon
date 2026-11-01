/**
 * "Where to?" search (trip wizard, step 1): a full-screen search view, as travel
 * apps do on phones (Booking, Airbnb; Material 3's search view), so nothing else
 * competes with it (Baymard).
 *
 * - Before typing: Recent (this device), From your Want list, then every destination
 *   grouped by division.
 * - Typing: one row per destination, best first, at most 8 (whereSearch.ts),
 *   the typed text in bold, and what kind of match it is (an attraction, a district,
 *   a division) in an icon and a second line.
 * - Nothing found: what Vromon covers, a close name when there is one, and the list.
 *
 * Android's Back closes it. Picking an attraction also makes it a must-see.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Destination, Place, Visit } from '../../../types';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { HOME_DISTRICTS, HOME_REGIONS, homeRegionName } from '../../map/geoData';
import { ideasFrom } from '../../map/dockState';
import { usePreferences } from '../../preferences/store';
import { resolveLanguage } from '../../../i18n';
import { usePlanFormat } from '../plan/usePlanFormat';
import { buildIndex, destinationName, didYouMean, searchDestinations, type SearchHit } from './whereSearch';

type Icon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const KIND_ICON: Record<SearchHit['kind'], Icon> = {
  destination: 'map-marker-outline',
  place: 'map-marker-star-outline',
  district: 'map-outline',
  division: 'map-legend',
};

export function DestinationSearch({
  destinations,
  places,
  visits,
  selected,
  today,
  onPick,
  onClose,
}: {
  destinations: readonly Destination[];
  /** Every attraction (for "Ratargul → Sylhet"); empty while loading */
  places: readonly Place[];
  visits: readonly Visit[];
  /** The destination already chosen, if any */
  selected: string;
  today: string;
  onPick: (destination: Destination, placeId?: number) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const insets = useSafeAreaInsets();
  const lang = resolveLanguage(usePreferences((s) => s.language));
  const recentNames = usePreferences((s) => s.recentDestinations);
  const clearRecent = usePreferences((s) => s.clearRecentDestinations);
  const [query, setQuery] = useState('');
  const input = useRef<TextInput>(null);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  const index = useMemo(() => {
    const districts = HOME_DISTRICTS.features.flatMap((fe) =>
      fe.geometry.type === 'Point' && fe.properties.name
        ? [{ name: fe.properties.name, name_bn: fe.properties.name_bn, lon: fe.geometry.coordinates[0], lat: fe.geometry.coordinates[1] }]
        : [],
    );
    const divisions = HOME_REGIONS.features.map((fe) => ({
      code: fe.properties.code,
      name: fe.properties.name,
      name_bn: fe.properties.name_bn,
      lon: fe.properties.label[0],
      lat: fe.properties.label[1],
    }));
    return buildIndex(destinations, places, districts, divisions);
  }, [destinations, places]);

  const hits = useMemo(() => searchDestinations(index, query), [index, query]);
  const typed = query.trim().length > 0;
  const suggestion = typed && hits.length === 0 ? didYouMean(destinations, query) : null;

  const recent = recentNames.map((n) => destinations.find((d) => d.name === n)).filter((d): d is Destination => !!d);
  const wants = ideasFrom(visits, destinations, [], today)
    .map((i) => i.destination)
    .filter((d) => !recent.includes(d));
  const groups = useMemo(() => {
    const byDivision = new Map<string, Destination[]>();
    for (const d of destinations) {
      const key = d.region_code ?? '';
      byDivision.set(key, [...(byDivision.get(key) ?? []), d]);
    }
    return [...byDivision.entries()]
      .map(([code, list]) => ({ code, title: (code && homeRegionName(code, lang)) || t('newTrip.search.otherPlaces'), list: list.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.title.localeCompare(b.title, lang));
  }, [destinations, lang, t]);

  // Under a division heading the division goes without saying
  const subtitle = (d: Destination, withDivision = true) =>
    [
      withDivision && d.region_code ? t('newTrip.search.inDivision', { division: homeRegionName(d.region_code, lang) }) : null,
      t('newTrip.placesCount', { count: d.place_count ?? 0, n: f.n(d.place_count ?? 0) }),
    ]
      .filter(Boolean)
      .join(' · ');

  const row = (key: string, d: Destination, icon: Icon, title: React.ReactNode, sub: string, a11y: string, placeId?: number) => {
    const on = d.name === selected;
    return (
      <PressableScale
        key={key}
        pressEffect="opacity"
        haptic="selection"
        style={styles.row}
        onPress={() => onPick(d, placeId)}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={a11y}
        testID={`where-${key}`}
      >
        <View style={[styles.rowIcon, on && styles.rowIconOn]}>
          <MaterialCommunityIcons name={on ? 'check' : icon} size={22} color={on ? colors.onAccent : colors.link} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {sub}
          </Text>
          {d.checked === false ? <Text style={styles.unchecked}>{t('newTrip.notChecked')}</Text> : null}
        </View>
      </PressableScale>
    );
  };

  const destRow = (key: string, d: Destination, icon: Icon, withDivision = true) => {
    const name = destinationName(d.name, lang);
    const sub = subtitle(d, withDivision);
    return row(key, d, icon, name, sub, `${name}, ${sub}${d.checked === false ? `, ${t('newTrip.notChecked')}` : ''}`);
  };

  const hitRow = (h: SearchHit) => {
    const d = h.destination;
    const name = destinationName(d.name, lang);
    if (h.kind === 'place') {
      const sub = t('newTrip.search.placeIn', { place: name });
      return row(`hit-${d.id}`, d, KIND_ICON.place, <Bold text={h.label} range={h.match} style={styles.bold} />, sub, `${h.label}, ${sub}`, h.placeId);
    }
    if (h.kind === 'district') {
      const sub = t('newTrip.search.nearDistrict', { district: (lang === 'bn' && h.labelBn) || h.label, km: f.n(h.km ?? 0) });
      return row(`hit-${d.id}`, d, KIND_ICON.district, name, sub, `${name}, ${sub}`);
    }
    if (h.kind === 'division') {
      const sub = t('newTrip.search.inDivision', { division: (lang === 'bn' && h.labelBn) || h.label });
      return row(`hit-${d.id}`, d, KIND_ICON.division, name, sub, `${name}, ${sub}`);
    }
    const shown = lang === 'bn' ? name : h.label;
    return row(`hit-${d.id}`, d, KIND_ICON.destination, <Bold text={shown} range={lang === 'bn' ? null : h.match} style={styles.bold} />, subtitle(d), `${shown}, ${subtitle(d)}`);
  };

  return (
    <View style={[styles.overlay, { paddingTop: insets.top + 8 }]} testID="where-search">
      <View style={styles.bar}>
        {/* Back sits inside the bar, as in Material's search view, so the hint has the width */}
        <View style={styles.field}>
          <PressableScale pressEffect="opacity" haptic="selection" onPress={onClose} style={styles.back} accessibilityRole="button" accessibilityLabel={t('newTrip.back')} testID="where-close">
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
          </PressableScale>
          <TextInput
            ref={input}
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={t('newTrip.search.placeholder')}
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => hits[0] && onPick(hits[0].destination, hits[0].kind === 'place' ? hits[0].placeId : undefined)}
            accessibilityLabel={t('newTrip.search.label')}
            testID="where-input"
          />
          {typed ? (
            <PressableScale
              pressEffect="opacity"
              haptic="none"
              hitSlop={10}
              onPress={() => {
                setQuery('');
                input.current?.focus();
              }}
              accessibilityRole="button"
              accessibilityLabel={t('newTrip.search.clear')}
              testID="where-clear"
            >
              <MaterialCommunityIcons name="close-circle" size={20} color={colors.textTertiary} />
            </PressableScale>
          ) : null}
        </View>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {typed ? (
          <>
            {/* Read out as results change; with none, the "nothing matches" title says it */}
            {hits.length > 0 ? (
              <Text style={styles.count} accessibilityLiveRegion="polite" testID="where-count">
                {t('newTrip.search.found', { count: hits.length, n: f.n(hits.length) })}
              </Text>
            ) : null}
            {hits.map(hitRow)}
            {hits.length === 0 ? (
              <View style={styles.empty} testID="where-empty">
                <MaterialCommunityIcons name="map-search-outline" size={40} color={colors.textTertiary} />
                <Text style={styles.emptyTitle} accessibilityLiveRegion="polite">
                  {t('newTrip.search.noMatch', { q: query.trim() })}
                </Text>
                <Text style={styles.emptyBody}>{t('newTrip.search.coverage', { count: destinations.length, n: f.n(destinations.length) })}</Text>
                {suggestion ? (
                  <PressableScale style={styles.suggest} onPress={() => setQuery(suggestion.name)} testID="where-did-you-mean">
                    <Text style={styles.suggestText}>{t('newTrip.search.didYouMean', { name: destinationName(suggestion.name, lang) })}</Text>
                  </PressableScale>
                ) : null}
                <PressableScale pressEffect="opacity" haptic="selection" onPress={() => setQuery('')} hitSlop={8} testID="where-see-all">
                  <Text style={styles.link}>{t('newTrip.search.seeAll')}</Text>
                </PressableScale>
              </View>
            ) : null}
          </>
        ) : (
          <>
            {recent.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>{t('newTrip.search.recent')}</Text>
                  <PressableScale pressEffect="opacity" haptic="light" onPress={clearRecent} hitSlop={10} accessibilityRole="button" testID="where-clear-recent">
                    <Text style={styles.link}>{t('newTrip.search.clearRecent')}</Text>
                  </PressableScale>
                </View>
                {recent.map((d) => destRow(`recent-${d.id}`, d, 'history'))}
              </View>
            ) : null}
            {wants.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('newTrip.search.fromWant')}</Text>
                {wants.slice(0, 3).map((d) => destRow(`want-${d.id}`, d, 'star-outline'))}
              </View>
            ) : null}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('newTrip.search.all', { count: destinations.length, n: f.n(destinations.length) })}</Text>
              {groups.map((g) => (
                <View key={g.code || 'other'}>
                  <Text style={styles.groupTitle}>{g.title}</Text>
                  {g.list.map((d) => destRow(`all-${d.id}`, d, 'map-marker-outline', false))}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** The typed part in bold (NN/g: when the match can be anywhere, emphasise what was typed). */
function Bold({ text, range, style }: { text: string; range: [number, number] | null; style: object }) {
  if (!range) return <>{text}</>;
  return (
    <>
      {text.slice(0, range[0])}
      <Text style={style}>{text.slice(range[0], range[1])}</Text>
      {text.slice(range[1])}
    </>
  );
}

const useStyles = makeStyles((t) => ({
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: t.colors.bg },
  bar: { paddingHorizontal: t.spacing.md, paddingBottom: t.spacing.sm },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    minHeight: 56,
    paddingLeft: t.spacing.xs,
    paddingRight: t.spacing.lg,
    borderRadius: 28,
    backgroundColor: t.colors.surface,
    borderWidth: 1.5,
    borderColor: t.colors.accent,
  },
  input: { flex: 1, ...t.type.body, fontSize: 17, color: t.colors.textPrimary, paddingVertical: 12 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: t.spacing.lg, gap: t.spacing.lg, paddingTop: t.spacing.sm },
  count: { ...t.type.footnote, color: t.colors.textSecondary },
  section: { gap: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { ...t.type.footnote, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: t.colors.textSecondary, paddingVertical: t.spacing.sm },
  groupTitle: { ...t.type.caption, fontWeight: '600', color: t.colors.textTertiary, paddingTop: t.spacing.md, paddingBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 64, paddingVertical: t.spacing.sm },
  rowIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  rowIconOn: { backgroundColor: t.colors.accentStrong },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...t.type.body, fontSize: 17, color: t.colors.textPrimary },
  bold: { fontWeight: '800' },
  rowSub: { ...t.type.footnote, color: t.colors.textSecondary },
  unchecked: { ...t.type.caption, fontWeight: '600', color: t.colors.warning },
  link: { ...t.type.callout, fontWeight: '600', color: t.colors.link },
  empty: { alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.xxl },
  emptyTitle: { ...t.type.headline, color: t.colors.textPrimary, textAlign: 'center' },
  emptyBody: { ...t.type.callout, color: t.colors.textSecondary, textAlign: 'center' },
  suggest: { marginTop: t.spacing.sm, minHeight: 44, paddingHorizontal: t.spacing.xl, borderRadius: 22, backgroundColor: t.colors.accentSoft, justifyContent: 'center' },
  suggestText: { ...t.type.callout, fontWeight: '600', color: t.colors.onAccentSoft },
}));
