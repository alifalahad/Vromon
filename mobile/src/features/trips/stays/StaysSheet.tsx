/**
 * Where you'll stay (docs/trip-upgrades, step 2): one sheet, two pages. The nights: all at once, or
 * night by night. The choices for them: a hotel (Vromon's pick for the budget, or one from the
 * list), with family or friends (picked on the map; no cost), day trips with no night here (no
 * cost), or decide later. Save hands the nights' choices back (the New trip screen keeps them;
 * the trip screen sends them).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { destinationsApi } from '../../../services/api';
import type { Destination, Hotel } from '../../../types';
import { Button } from '../../../ui/Button';
import { haptics } from '../../../ui/haptics';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { useSheetPresentation } from '../../../ui/useSheetPresentation';
import { PlacePicker } from '../../places/PlacePicker';
import { addDays, parseDay } from '../dates';
import { localDigits, usePlanFormat } from '../plan/usePlanFormat';
import { allSame, hotelPick, pickName, samePick, stayIcon, type StayPick } from './stays';

const SNAP_POINTS = ['85%'];

export function StaysSheet({
  visible,
  nights,
  startDate,
  destination,
  picks,
  allowAuto,
  saving,
  onSave,
  onClose,
}: {
  visible: boolean;
  nights: number;
  /** The trip's first day (ISO): names the nights ("Night 1 · Wed 18 Nov") */
  startDate: string;
  destination: Pick<Destination, 'id' | 'name' | 'latitude' | 'longitude'> | null | undefined;
  picks: readonly StayPick[];
  /** A new trip: "Vromon picks a hotel for my budget" is a choice too */
  allowAuto: boolean;
  saving?: boolean;
  onSave: (picks: StayPick[]) => void;
  onClose: () => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const insets = useSafeAreaInsets();
  const handleDismiss = useSheetPresentation(ref, visible, onClose);
  const [draft, setDraft] = useState<StayPick[]>([...picks]);
  // Which nights the choices page is for: all of them, or one (its index); null = the nights page
  const [target, setTarget] = useState<'all' | number | null>(null);
  const [picking, setPicking] = useState(false);

  // A fresh draft each time it opens (set while rendering, not in an effect)
  const [shown, setShown] = useState(visible);
  if (visible !== shown) {
    setShown(visible);
    if (visible) {
      setDraft([...picks]);
      setTarget(nights <= 1 ? 'all' : null);
    }
  }

  const hotels = useQuery({
    queryKey: ['hotels', destination?.id],
    queryFn: () => destinationsApi.hotels(destination!.id),
    enabled: visible && !!destination,
  });
  // Priced hotels first, cheapest first; then the others by rating
  const list = [...(hotels.data ?? [])].sort((a, b) => {
    const pa = a.price_known !== false, pb = b.price_known !== false;
    if (pa !== pb) return pa ? -1 : 1;
    return pa ? a.price_per_night - b.price_per_night : (b.rating ?? 0) - (a.rating ?? 0);
  });

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />,
    [],
  );

  const current: StayPick | null = target === 'all' ? (allSame(draft) ? draft[0] : null) : target != null ? draft[target] : null;
  const choose = (p: StayPick) => {
    haptics.selection();
    setDraft((d) => (target === 'all' ? d.map(() => p) : d.map((x, i) => (i === target ? p : x))));
    setTarget(nights <= 1 ? 'all' : null);
  };
  const nightName = (i: number) =>
    t('stays.night', {
      n: f.n(i + 1),
      date: localDigits(parseDay(addDays(startDate, i)).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' }), i18n.language),
    });
  const changed = draft.some((p, i) => !picks[i] || !samePick(p, picks[i]));
  const homePick = current?.kind === 'home' ? current : null;

  const option = (key: string, icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'], label: string, sub: string | null, on: boolean, onPress: () => void) => (
    <PressableScale
      key={key}
      haptic="none"
      onPress={onPress}
      style={[styles.option, on && styles.optionOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      testID={`stay-${key}`}
    >
      <MaterialCommunityIcons name={icon} size={22} color={on ? colors.onAccentSoft : colors.textSecondary} />
      <View style={styles.flex}>
        <Text style={[styles.optionLabel, on && styles.optionLabelOn]}>{label}</Text>
        {sub ? <Text style={styles.optionSub}>{sub}</Text> : null}
      </View>
      {on ? <MaterialCommunityIcons name="check" size={22} color={colors.link} /> : null}
    </PressableScale>
  );

  return (
    <>
      <BottomSheetModal
        ref={ref}
        snapPoints={SNAP_POINTS}
        enableDynamicSizing={false}
        onDismiss={handleDismiss}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.background}
        handleIndicatorStyle={styles.handle}
        accessibilityLabel={t('stays.title')}
      >
        <BottomSheetScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} testID="stays-sheet">
          {target == null ? (
            <>
              <Text style={styles.title} accessibilityRole="header">
                {t('stays.title')}
              </Text>
              <Text style={styles.hint}>{t('stays.hint')}</Text>
              <PressableScale haptic="selection" onPress={() => setTarget('all')} style={styles.night} accessibilityRole="button" testID="stays-all">
                <MaterialCommunityIcons name={stayIcon(allSame(draft) ? draft[0].kind : 'auto')} size={22} color={colors.textSecondary} />
                <View style={styles.flex}>
                  <Text style={styles.nightName}>{t('stays.allNights', { count: nights, n: f.n(nights) })}</Text>
                  <Text style={styles.optionSub}>{allSame(draft) ? pickName(draft[0], t) : t('stays.differs')}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textTertiary} />
              </PressableScale>
              <Text style={styles.groupTitle}>{t('stays.byNight')}</Text>
              {draft.map((p, i) => (
                <PressableScale key={i} haptic="selection" onPress={() => setTarget(i)} style={styles.night} accessibilityRole="button" testID={`stays-night-${i + 1}`}>
                  <MaterialCommunityIcons name={stayIcon(p.kind)} size={22} color={colors.textSecondary} />
                  <View style={styles.flex}>
                    <Text style={styles.nightName}>{nightName(i)}</Text>
                    <Text style={styles.optionSub} numberOfLines={1}>
                      {pickName(p, t)}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textTertiary} />
                </PressableScale>
              ))}
              <Button
                label={t('common.save')}
                onPress={() => onSave(draft)}
                disabled={!changed || saving}
                loading={saving}
                testID="stays-save"
              />
            </>
          ) : (
            <>
              <View style={styles.titleRow}>
                {nights > 1 ? (
                  <PressableScale pressEffect="opacity" haptic="selection" onPress={() => setTarget(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.back')} testID="stays-back">
                    <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
                  </PressableScale>
                ) : null}
                <Text style={[styles.title, styles.flex]} accessibilityRole="header">
                  {target === 'all' ? (nights > 1 ? t('stays.allNights', { count: nights, n: f.n(nights) }) : t('stays.title')) : nightName(target)}
                </Text>
              </View>
              <View accessibilityRole="radiogroup" style={styles.options}>
                {allowAuto ? option('auto', 'auto-fix', t('stays.auto'), t('stays.autoSub'), current?.kind === 'auto', () => choose({ kind: 'auto' })) : null}
                {option('home', 'home-heart', t('stays.home'), homePick ? (homePick.label ?? t('stays.homePicked')) : t('stays.homeSub'), current?.kind === 'home', () => setPicking(true))}
                {option('none', 'home-import-outline', t('stays.none'), t('stays.noneSub'), current?.kind === 'none', () => choose({ kind: 'none' }))}
                {option('undecided', 'help-circle-outline', t('stays.undecided'), t('stays.undecidedSub'), current?.kind === 'undecided', () => choose({ kind: 'undecided' }))}
              </View>
              <Text style={styles.groupTitle}>{t('stays.hotels')}</Text>
              {hotels.isLoading ? <Text style={styles.optionSub}>{t('stays.loadingHotels')}</Text> : null}
              {!hotels.isLoading && !list.length ? <Text style={styles.optionSub}>{t('stays.noHotels')}</Text> : null}
              {list.map((h: Hotel) =>
                option(
                  `hotel-${h.id}`,
                  'bed-outline',
                  h.name,
                  [h.category ? t(`stays.level.${h.category}`, { defaultValue: h.category }) : null, h.price_known === false ? t('stays.priceUnknown') : t('stays.perNight', { amount: f.money(h.price_per_night) })]
                    .filter(Boolean)
                    .join(' · '),
                  current?.kind === 'hotel' && current.hotelId === h.id,
                  () => choose(hotelPick(h)),
                ),
              )}
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>
      <PlacePicker
        visible={picking}
        title={t('stays.homeTitle')}
        destination={destination?.name}
        initial={homePick ? { lat: homePick.lat, lon: homePick.lon, label: homePick.label } : null}
        center={destination?.latitude != null && destination.longitude != null ? { lat: destination.latitude, lon: destination.longitude } : null}
        namePlaceholder={t('stays.homeName')}
        onClose={() => setPicking(false)}
        onPick={(p) => {
          setPicking(false);
          choose({ kind: 'home', lat: p.lat, lon: p.lon, label: p.label });
        }}
      />
    </>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  content: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.sm, gap: t.spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  title: { ...t.type.title, color: t.colors.textPrimary },
  hint: { ...t.type.callout, color: t.colors.textSecondary },
  groupTitle: { ...t.type.footnote, fontWeight: '700', color: t.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.md },
  night: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 60, borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  nightName: { ...t.type.body, fontWeight: '600', color: t.colors.textPrimary },
  options: { gap: t.spacing.xs },
  option: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 56, paddingHorizontal: t.spacing.md, borderRadius: 14 },
  optionOn: { backgroundColor: t.colors.accentSoft },
  optionLabel: { ...t.type.body, color: t.colors.textPrimary },
  optionLabelOn: { fontWeight: '700', color: t.colors.onAccentSoft },
  optionSub: { ...t.type.footnote, color: t.colors.textSecondary },
}));
