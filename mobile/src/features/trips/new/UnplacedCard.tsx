/**
 * A must-see that doesn't fit: why, and the choices. Take the nearest time that
 * fits, choose another time, or leave it out. Nothing is dropped without asking.
 * Shown when a plan is built and on the trip screen.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MustSee, Place, Unplaced } from '../../../types';
import { Button } from '../../../ui/Button';
import { haptics } from '../../../ui/haptics';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { TimeSheet } from '../../../ui/TimeSheet';
import { useSheetPresentation } from '../../../ui/useSheetPresentation';
import { MustSeeCard } from './MustDosEditor';
import { timesBetween, withTime } from './newTrip';
import { useMustDoText } from './useMustDoText';

const EXACT_TIMES = timesBetween('06:00', '22:00');

export function UnplacedCard({
  unplaced: u,
  place,
  days,
  busy,
  onChoose,
  testID,
}: {
  unplaced: Unplaced;
  place?: Place;
  days: number;
  /** While a choice is being applied */
  busy?: boolean;
  /** The new rule for this must-see, or null to leave it out */
  onChoose: (rule: MustSee | null) => void;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const text = useMustDoText();
  const [choosing, setChoosing] = useState(false);
  // A fresh sheet (and draft) each time it opens
  const [chooseKey, setChooseKey] = useState(0);
  const rule: MustSee = { place_id: u.place_id, day: u.day, when: u.when, at: u.at };

  return (
    <Animated.View entering={FadeInDown.duration(240)} style={styles.card} accessibilityLiveRegion="polite" testID={testID}>
      <View style={styles.head}>
        <MaterialCommunityIcons name="alert-outline" size={22} color={colors.warning} style={styles.icon} />
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            {text.doesntFit(u)}
          </Text>
          <Text style={styles.reason}>{text.reason(u.reason)}</Text>
        </View>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.link} style={styles.loading} />
      ) : (
        <View style={styles.choices}>
          {u.suggestion && (
            <PressableScale
              haptic="medium"
              onPress={() => onChoose({ place_id: u.place_id, day: u.suggestion!.day, when: null, at: u.suggestion!.at })}
              style={[styles.choice, styles.primary]}
              accessibilityRole="button"
              accessibilityLabel={`${text.suggestionTitle(u)}, ${text.suggestionDetail(u)}`}
              testID="fix-suggestion"
            >
              <Text style={styles.primaryText}>{text.suggestionTitle(u)}</Text>
              <Text style={styles.primaryDetail}>{text.suggestionDetail(u)}</Text>
            </PressableScale>
          )}
          <PressableScale haptic="selection" onPress={() => {
              setChooseKey((k) => k + 1);
              setChoosing(true);
            }} style={[styles.choice, styles.secondary]} accessibilityRole="button" testID="fix-other">
            <Text style={styles.secondaryText}>{t('mustDos.anotherTime')}</Text>
          </PressableScale>
          <PressableScale haptic="selection" onPress={() => onChoose(null)} style={[styles.choice, styles.outline]} accessibilityRole="button" testID="fix-leave-out">
            <Text style={styles.secondaryText}>{t('mustDos.leaveOut')}</Text>
          </PressableScale>
        </View>
      )}
      <ChooseTimeSheet
        key={chooseKey}
        visible={choosing}
        must={rule}
        place={place}
        name={u.name}
        days={days}
        onClose={() => setChoosing(false)}
        onApply={onChoose}
      />
    </Animated.View>
  );
}

/** Choose a must-see's day and time, then apply it. */
export function ChooseTimeSheet({
  visible,
  must,
  place,
  name,
  days,
  onClose,
  onApply,
}: {
  visible: boolean;
  must: MustSee;
  place?: Place;
  name: string;
  days: number;
  onClose: () => void;
  onApply: (rule: MustSee) => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<MustSee>(must);
  const [exact, setExact] = useState(false);
  const applied = useRef<MustSee | null>(null);
  const handleDismiss = useSheetPresentation(ref, visible, onClose);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />,
    [],
  );

  return (
    <>
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        onChange={(index) => {
          if (index >= 0) {
            haptics.selection();
          }
        }}
        onDismiss={() => {
          handleDismiss();
          const rule = applied.current;
          applied.current = null;
          if (rule) onApply(rule);
        }}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheet}
        handleIndicatorStyle={styles.handle}
        accessibilityLabel={t('mustDos.chooseTitle', { name })}
      >
        <BottomSheetScrollView contentContainerStyle={[styles.sheetBody, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            {t('mustDos.chooseTitle', { name })}
          </Text>
          <MustSeeCard
            must={draft}
            place={place}
            name={name}
            days={days}
            open
            onToggle={() => {}}
            onDay={(day) => setDraft((d) => withTime(d, { day }))}
            onWhen={(when) => setDraft((d) => withTime(d, { when, at: null }))}
            onExact={() => setExact(true)}
          />
          <Button
            label={t('mustDos.apply')}
            onPress={() => {
              applied.current = draft;
              ref.current?.dismiss();
            }}
            testID="fix-apply"
          />
        </BottomSheetScrollView>
      </BottomSheetModal>
      <TimeSheet
        visible={exact}
        title={t('newTrip.exactTitle', { name })}
        times={EXACT_TIMES}
        selected={draft.at}
        onClose={() => setExact(false)}
        onSelect={(at) => at && setDraft((d) => withTime(d, { at }))}
        testID="fix-exact"
      />
    </>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.colors.surface,
    borderRadius: 20,
    padding: t.spacing.lg,
    gap: t.spacing.md,
    borderWidth: 1.5,
    borderColor: t.colors.warning,
  },
  head: { flexDirection: 'row', gap: t.spacing.md },
  icon: { marginTop: 1 },
  flex: { flex: 1, gap: 4 },
  title: { ...t.type.body, fontWeight: '700', color: t.colors.textPrimary },
  reason: { ...t.type.callout, fontSize: 14, lineHeight: 20, color: t.colors.textSecondary },
  loading: { paddingVertical: t.spacing.lg },
  choices: { gap: t.spacing.sm },
  choice: { minHeight: 48, borderRadius: 14, paddingHorizontal: t.spacing.lg, justifyContent: 'center' },
  primary: { backgroundColor: t.colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing.sm },
  primaryText: { ...t.type.callout, fontWeight: '700', color: t.colors.onAccent, flexShrink: 1 },
  primaryDetail: { ...t.type.footnote, fontSize: 14, color: t.colors.onAccent },
  secondary: { backgroundColor: t.colors.surfaceInset },
  outline: { borderWidth: 1, borderColor: t.colors.border },
  secondaryText: { ...t.type.callout, fontWeight: '600', color: t.colors.textPrimary },
  sheet: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  sheetBody: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.sm, gap: t.spacing.lg },
  sheetTitle: { ...t.type.title, color: t.colors.textPrimary },
}));
