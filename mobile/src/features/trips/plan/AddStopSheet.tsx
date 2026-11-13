/**
 * Add a stop to a day (the "+" in free time, or "Add a stop" at the end of the
 * day). With the box empty: suggestions near the stop before it, best first.
 * Typing searches anything (trip upgrades step 6): Vromon's places, more places
 * Vromon knows nearby, other places from open map data ("Not checked") and
 * addresses, each with how far it is from the stop before. It never ends at
 * "nothing found": "Did you mean", places of the kind you seem to want, and
 * always "Put a pin on the map". Places already in the trip or excluded from
 * it are never offered.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Keyboard, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tripsApi } from '../../../services/api';
import type { AddRef, SearchResponse, SearchResult } from '../../../types';
import { haptics } from '../../../ui/haptics';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { useSheetPresentation } from '../../../ui/useSheetPresentation';
import { kindIcon, kindLabel, PIN_ICON, resultWhat } from '../../places/kinds';
import { NotCheckedBadge } from '../../places/NotCheckedBadge';
import { PlacePicker } from '../../places/PlacePicker';
import { forYou } from './timeline';
import { usePlanFormat } from './usePlanFormat';

export type AddTarget = { dayId: number; position: number; nearItemId?: number };
/** What was picked: its name (for "Added …") and what to send */
export type AddChoice = { name: string; ref: AddRef };

const SNAP_POINTS = ['70%', '92%'];

export function AddStopSheet({
  tripId,
  destination,
  target,
  center,
  onClose,
  onAdd,
}: {
  tripId: number;
  destination: string;
  target: AddTarget | null;
  /** Where "Put a pin on the map" opens before a search has found the area: the stop before, or the day's first */
  center?: { lat: number; lon: number } | null;
  onClose: () => void;
  onAdd: (choice: AddChoice, target: AddTarget) => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const insets = useSafeAreaInsets();
  const handleDismiss = useSheetPresentation(ref, !!target, onClose);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  // What the box shows when it's made again: empty, or a "Did you mean" name
  const [seed, setSeed] = useState('');
  // A new key makes the box again (empty for the next time the sheet opens, or a name tapped below)
  const [inputKey, setInputKey] = useState(0);
  const [picking, setPicking] = useState(false);
  const picked = useRef<AddChoice | null>(null);
  // Remembered so the pick can be added after the sheet has closed (target is cleared then)
  const lastTarget = useRef<AddTarget | null>(null);
  useEffect(() => {
    if (target) lastTarget.current = target;
  }, [target]);

  // Search after a short pause in typing
  useEffect(() => {
    const id = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text]);
  const searching = query.length > 0;
  // Addresses only once typing has paused a little longer: each lookup is a call to the address service
  const [addressQuery, setAddressQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setAddressQuery(query), 700);
    return () => clearTimeout(id);
  }, [query]);

  const suggestions = useQuery({
    queryKey: ['suggestions', tripId, target?.dayId, target?.nearItemId],
    queryFn: () => tripsApi.suggestions(tripId, target!.dayId, { near_item_id: target?.nearItemId }),
    enabled: !!target && !searching,
  });
  // The places first (fast); the old results stay on screen while the next ones load
  const found = useQuery({
    queryKey: ['search', tripId, target?.dayId, target?.nearItemId, query],
    queryFn: () => tripsApi.search(tripId, target!.dayId, { q: query, near_item_id: target?.nearItemId, part: 'places' }),
    enabled: !!target && searching,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const wantAddresses = searching && addressQuery === query && !found.isPlaceholderData && !!found.data?.addresses_wanted;
  // …then addresses, only when the places found little: a spinner for this part only
  const addresses = useQuery({
    queryKey: ['search-addresses', tripId, target?.dayId, target?.nearItemId, query],
    queryFn: async ({ signal }): Promise<SearchResponse> => {
      const params = { q: query, near_item_id: target?.nearItemId, part: 'addresses' as const };
      const res = await tripsApi.search(tripId, target!.dayId, params);
      if (res.geocoder !== 'wait' || !res.retry_after) return res;
      // One address search per person every 2 seconds: ask again when it's allowed, unless typing went on
      await new Promise((resolve) => setTimeout(resolve, res.retry_after! * 1000 + 100));
      if (signal.aborted) return res;
      return tripsApi.search(tripId, target!.dayId, params);
    },
    enabled: !!target && wantAddresses,
    staleTime: 5 * 60_000,
  });

  const data = searching ? found.data : undefined;
  const addressGroup = wantAddresses ? addresses.data?.groups.find((g) => g.key === 'addresses') : undefined;
  const groups = data ? [...data.groups.filter((g) => g.key !== 'addresses'), ...(addressGroup ? [addressGroup] : [])] : [];
  const nothing = !!data && !found.isPlaceholderData && groups.length === 0 && !(wantAddresses && addresses.isFetching);
  // "Did you mean" and the kind near you only while nothing was found (an address may still turn up)
  const fallbacks = !!data && groups.length === 0;
  const pinCenter = data?.near ? { lat: data.near.lat, lon: data.near.lon } : center ?? null;

  const choose = (choice: AddChoice) => {
    picked.current = choice;
    Keyboard.dismiss();
    ref.current?.dismiss();
  };
  const searchFor = (name: string) => {
    haptics.selection();
    setSeed(name);
    setText(name);
    setQuery(name);
    setInputKey((k) => k + 1);
  };

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />,
    [],
  );

  const resultRow = (r: SearchResult) => {
    const away = data?.near.name ? t('search.fromPlace', { km: f.km(r.distance_km), place: data.near.name }) : t('search.awayKm', { km: f.km(r.distance_km) });
    const meta = [resultWhat(r, t), away].filter(Boolean).join(' · ');
    return (
      <PressableScale
        key={r.id}
        style={styles.row}
        onPress={() => choose({ name: r.name, ref: r.ref })}
        accessibilityRole="button"
        accessibilityLabel={[r.name, meta, r.address, r.checked ? null : t('search.notCheckedA11y')].filter(Boolean).join('. ')}
        testID={`search-result-${r.id}`}
      >
        <View style={styles.icon}>
          <MaterialCommunityIcons name={r.kind ? kindIcon(r.kind) : 'binoculars'} size={20} color={colors.textSecondary} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.name}>{r.name}</Text>
          <Text style={styles.meta}>{meta}</Text>
          {r.address && r.address !== r.name ? (
            <Text style={styles.meta} numberOfLines={1}>
              {r.address}
            </Text>
          ) : null}
          {r.checked ? null : <NotCheckedBadge testID={`search-unchecked-${r.id}`} />}
        </View>
        <View style={styles.plus}>
          <MaterialCommunityIcons name="plus" size={22} color={colors.link} />
        </View>
      </PressableScale>
    );
  };

  return (
    <>
      <BottomSheetModal
        ref={ref}
        snapPoints={SNAP_POINTS}
        enableDynamicSizing={false}
        keyboardBehavior="extend"
        android_keyboardInputMode="adjustResize"
        onDismiss={() => {
          handleDismiss();
          setText('');
          setQuery('');
          setSeed('');
          setInputKey((k) => k + 1);
          const choice = picked.current;
          const where = lastTarget.current;
          picked.current = null;
          if (choice && where) onAdd(choice, where);
        }}
        onChange={(index) => {
          if (index >= 0) haptics.selection();
        }}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.background}
        handleIndicatorStyle={styles.handle}
        accessibilityLabel={t('plan.addTitle')}
      >
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {t('plan.addTitle')}
          </Text>
          <View style={styles.search}>
            <MaterialCommunityIcons name="magnify" size={22} color={colors.textSecondary} />
            {/* Not a controlled input: rewriting the text on every key confuses some keyboards' predictions */}
            <BottomSheetTextInput
              key={inputKey}
              defaultValue={seed}
              onChangeText={setText}
              placeholder={t('search.placeholder')}
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              accessibilityLabel={t('search.placeholder')}
              testID="add-search"
              returnKeyType="search"
            />
          </View>
        </View>
        <BottomSheetScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
          {searching ? (
            <>
              {found.isLoading && <ActivityIndicator color={colors.link} style={styles.loading} />}
              {found.isError && <Text style={styles.error}>{(found.error as Error).message}</Text>}
              {groups.map((g) => (
                <View key={g.key} style={styles.group} testID={`search-group-${g.key}`}>
                  <Text style={styles.groupTitle} accessibilityRole="header">
                    {t(`search.groups.${g.key}`)}
                  </Text>
                  {g.results.map(resultRow)}
                </View>
              ))}
              {wantAddresses && addresses.isFetching ? (
                <View style={styles.pending} testID="search-addresses-loading">
                  <ActivityIndicator color={colors.link} size="small" />
                  <Text style={styles.muted}>{t('search.lookingUpAddresses')}</Text>
                </View>
              ) : null}
              {nothing ? <Text style={styles.muted}>{t('search.nothingFound', { q: query })}</Text> : null}
              {fallbacks && data?.did_you_mean.length ? (
                <View style={styles.group}>
                  <Text style={styles.groupTitle} accessibilityRole="header">
                    {t('search.didYouMean')}
                  </Text>
                  <View style={styles.chips}>
                    {data.did_you_mean.map((name) => (
                      <PressableScale
                        key={name}
                        style={styles.chip}
                        pressEffect="opacity"
                        onPress={() => searchFor(name)}
                        accessibilityRole="button"
                        accessibilityLabel={t('search.didYouMeanA11y', { name })}
                        testID={`did-you-mean-${name}`}
                      >
                        <Text style={styles.chipText}>{name}</Text>
                      </PressableScale>
                    ))}
                  </View>
                </View>
              ) : null}
              {fallbacks && data?.kind_results?.results.length ? (
                <View style={styles.group} testID="search-kind-results">
                  <Text style={styles.groupTitle} accessibilityRole="header">
                    {t('search.kindNear', { kinds: kindLabel(data.kind_results.kind, t, 2) ?? t('search.placesLikeThis') })}
                  </Text>
                  {data.kind_results.results.map(resultRow)}
                </View>
              ) : null}
            </>
          ) : (
            <>
              {suggestions.isLoading && <ActivityIndicator color={colors.link} style={styles.loading} />}
              {suggestions.isError && <Text style={styles.error}>{(suggestions.error as Error).message}</Text>}
              {suggestions.data?.length === 0 && <Text style={styles.muted}>{t('plan.noSuggestions', { dest: destination })}</Text>}
              {suggestions.data?.map((s) => {
                const tag = forYou(s.recommendation_reasons);
                const price =
                  s.place.cost_known === false
                    ? t('plan.priceUnknown')
                    : s.place.estimated_cost
                      ? t('plan.perPerson', { amount: f.money(s.place.estimated_cost) })
                      : t('plan.priceFree');
                const meta = [s.place.category, price, s.distance_km != null ? t('plan.awayKm', { km: f.km(s.distance_km) }) : null].filter(Boolean).join(' · ');
                return (
                  <PressableScale
                    key={s.place.id}
                    style={styles.row}
                    onPress={() => choose({ name: s.place.name, ref: { place_id: s.place.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.place.name}. ${meta}`}
                    testID={`add-place-${s.place.id}`}
                  >
                    <View style={styles.rowText}>
                      <Text style={styles.name}>{s.place.name}</Text>
                      <Text style={styles.meta}>{meta}</Text>
                      {tag ? <Text style={styles.tag}>{t('plan.forYou', { what: tag })}</Text> : null}
                    </View>
                    <View style={styles.plus}>
                      <MaterialCommunityIcons name="plus" size={22} color={colors.link} />
                    </View>
                  </PressableScale>
                );
              })}
            </>
          )}
          {/* Never a dead end: a place that isn't listed anywhere */}
          <PressableScale
            style={[styles.row, styles.pinRow]}
            onPress={() => {
              Keyboard.dismiss();
              setPicking(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${t('search.pin')}. ${t('search.pinHint')}`}
            testID="search-pin"
          >
            <View style={styles.icon}>
              <MaterialCommunityIcons name={PIN_ICON} size={22} color={colors.link} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.name, styles.link]}>{t('search.pin')}</Text>
              <Text style={styles.meta}>{t('search.pinHint')}</Text>
            </View>
          </PressableScale>
        </BottomSheetScrollView>
      </BottomSheetModal>
      <PlacePicker
        visible={picking}
        title={t('search.pinTitle')}
        destination={destination}
        center={pinCenter}
        namePlaceholder={t('search.pinName')}
        onClose={() => setPicking(false)}
        onPick={(p) => {
          setPicking(false);
          const name = p.label?.trim() || t('search.pinDefault');
          choose({ name, ref: { pin: { lat: p.lat, lon: p.lon, name } } });
        }}
      />
    </>
  );
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  header: { paddingHorizontal: t.spacing.lg + 2, gap: t.spacing.md, paddingBottom: t.spacing.sm },
  title: { ...t.type.title, color: t.colors.textPrimary },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: 48,
    paddingHorizontal: t.spacing.md,
    borderRadius: 14,
    backgroundColor: t.scheme === 'dark' ? t.colors.bg : t.colors.surfaceInset,
  },
  input: { flex: 1, ...t.type.body, color: t.colors.textPrimary, paddingVertical: t.spacing.sm },
  body: { paddingHorizontal: t.spacing.lg, gap: t.spacing.sm },
  loading: { marginTop: t.spacing.lg },
  error: { ...t.type.callout, color: t.colors.danger },
  muted: { ...t.type.callout, color: t.colors.textSecondary },
  group: { gap: t.spacing.sm },
  groupTitle: { ...t.type.footnote, fontWeight: '700', color: t.colors.textSecondary, marginTop: t.spacing.sm, textTransform: 'uppercase' },
  pending: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  chip: { minHeight: 48, justifyContent: 'center', paddingHorizontal: t.spacing.md, borderRadius: 24, backgroundColor: t.colors.accentSoft },
  chipText: { ...t.type.callout, color: t.colors.onAccentSoft, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    padding: t.spacing.md,
    borderRadius: 16,
    backgroundColor: t.scheme === 'dark' ? t.colors.bg : '#F3F3F5',
  },
  pinRow: { marginTop: t.spacing.sm },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surface },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: t.colors.textPrimary },
  link: { color: t.colors.link },
  meta: { fontSize: 13, color: t.colors.textSecondary },
  tag: { fontSize: 13, color: t.colors.link },
  plus: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.accentSoft },
}));
