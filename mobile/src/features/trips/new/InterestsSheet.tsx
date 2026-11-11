/**
 * "What do you enjoy?" (new trip, step 2): one row that sums up the picks, and a sheet with the
 * interests in three groups. Taps apply at once; Done (or a swipe down) closes the sheet.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { INTERESTS } from '../../../constants/trip';
import { Button } from '../../../ui/Button';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { useSheetPresentation } from '../../../ui/useSheetPresentation';
import { usePlanFormat } from '../plan/usePlanFormat';
import { topicIcon } from './icons';

type Interest = (typeof INTERESTS)[number];

/** Every interest, once, in the order the sheet shows them */
export const INTEREST_GROUPS: { key: 'outdoors' | 'culture' | 'leisure'; items: Interest[] }[] = [
  { key: 'outdoors', items: ['Nature', 'Beach', 'Scenic', 'Sunset', 'Adventure', 'Wildlife'] },
  { key: 'culture', items: ['History', 'Culture', 'Photography'] },
  { key: 'leisure', items: ['Food', 'Shopping', 'Relaxation', 'Family', 'Nightlife'] },
];

const SHOWN = 3;

/** The row on the step: what's picked so far, or "anything". */
export function InterestsRow({ value, onPress }: { value: readonly string[]; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const names = value.slice(0, SHOWN).map((i) => t(`interests.${i}`));
  const summary = value.length
    ? value.length > SHOWN
      ? t('newTrip.interestsMore', { list: names.join(', '), count: value.length - SHOWN, n: f.n(value.length - SHOWN) })
      : names.join(', ')
    : t('newTrip.interestsAny');
  return (
    <PressableScale
      haptic="selection"
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${t('newTrip.enjoy')} ${summary}`}
      accessibilityHint={t('newTrip.interestsChoose')}
      testID="interests-open"
    >
      <View style={styles.rowIcon}>
        <MaterialCommunityIcons name={value.length ? topicIcon(value[0]) : 'heart-outline'} size={22} color={colors.onAccentSoft} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.rowValue, !value.length && styles.rowValueEmpty]} numberOfLines={2}>
          {summary}
        </Text>
        <Text style={styles.rowHint}>{value.length ? t('newTrip.interestsFirst') : t('newTrip.interestsMix')}</Text>
      </View>
      <Text style={styles.link}>{value.length ? t('newTrip.change') : t('newTrip.interestsChoose')}</Text>
    </PressableScale>
  );
}

export function InterestsSheet({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: readonly string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const insets = useSafeAreaInsets();
  const handleDismiss = useSheetPresentation(ref, visible, onClose);
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />,
    [],
  );
  const toggle = (i: string) => onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i]);

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      accessibilityLabel={t('newTrip.enjoy')}
    >
      <BottomSheetScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]} testID="interests-sheet">
        <View style={styles.titleRow}>
          <Text style={[styles.title, styles.flex]} accessibilityRole="header">
            {t('newTrip.enjoy')}
          </Text>
          {value.length ? (
            <PressableScale pressEffect="opacity" haptic="selection" onPress={() => onChange([])} hitSlop={8} accessibilityRole="button" testID="interests-clear">
              <Text style={styles.link}>{t('newTrip.interestsClear')}</Text>
            </PressableScale>
          ) : null}
        </View>
        <Text style={styles.hint}>{t('newTrip.interestsHint')}</Text>
        {INTEREST_GROUPS.map((g) => (
          <View key={g.key} style={styles.group}>
            <Text style={styles.groupTitle} accessibilityRole="header">
              {t(`newTrip.interestGroups.${g.key}`)}
            </Text>
            <View style={styles.chips}>
              {g.items.map((i) => {
                const on = value.includes(i);
                return (
                  <PressableScale
                    key={i}
                    haptic="selection"
                    onPress={() => toggle(i)}
                    style={[styles.chip, on && styles.chipOn]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    testID={`interest-${i}`}
                  >
                    <MaterialCommunityIcons name={on ? 'check' : topicIcon(i)} size={18} color={on ? colors.onAccent : colors.textSecondary} />
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{t(`interests.${i}`)}</Text>
                  </PressableScale>
                );
              })}
            </View>
          </View>
        ))}
        <Button
          label={value.length ? t('newTrip.interestsDone', { count: value.length, n: f.n(value.length) }) : t('common.done')}
          onPress={() => ref.current?.dismiss()}
          testID="interests-done"
        />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    minHeight: 72,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
    borderRadius: 20,
    backgroundColor: t.colors.surface,
  },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  rowValue: { ...t.type.body, fontWeight: '600', color: t.colors.textPrimary },
  rowValueEmpty: { fontWeight: '400', color: t.colors.textSecondary },
  rowHint: { ...t.type.footnote, color: t.colors.textSecondary, marginTop: 2 },
  link: { ...t.type.callout, fontWeight: '600', color: t.colors.link },
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  content: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.sm, gap: t.spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  title: { ...t.type.title, color: t.colors.textPrimary },
  hint: { ...t.type.callout, color: t.colors.textSecondary, marginTop: -t.spacing.sm },
  group: { gap: t.spacing.sm },
  groupTitle: { ...t.type.footnote, fontWeight: '700', color: t.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: t.radius.chip,
    backgroundColor: t.colors.surfaceInset,
  },
  chipOn: { backgroundColor: t.colors.accentStrong },
  chipText: { ...t.type.callout, fontSize: 15, fontWeight: '600', color: t.colors.textPrimary },
  chipTextOn: { color: t.colors.onAccent },
}));
