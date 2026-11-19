/**
 * "Plan it again" (docs/ui-refresh step 16, D21): new dates for a copy of a finished trip, before the copy is
 * made and built. The same From and To fields as a new trip (type, or pick on the month grid), first offering
 * as many days as the trip had, from a week after today. The copy keeps the trip's places and choices; its plan
 * is built on its own screen.
 */

import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../ui/Button';
import { haptics } from '../../../ui/haptics';
import { makeStyles } from '../../../ui/theme';
import { useSheetPresentation } from '../../../ui/useSheetPresentation';
import { durationDays, localToday } from '../dates';
import { DateRangeFields } from '../new/DateRangeFields';
import { friendlyRange } from '../plan/timeline';
import { usePlanFormat } from '../plan/usePlanFormat';
import { MAX_TRIP_DAYS } from '../new/newTrip';

const SNAP_POINTS = ['92%'];

export function PlanAgainSheet({
  visible,
  first,
  busy,
  onClose,
  onMake,
}: {
  visible: boolean;
  /** The dates offered first */
  first: { start: string; end: string };
  busy: boolean;
  onClose: () => void;
  onMake: (range: { start: string; end: string }) => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const handleDismiss = useSheetPresentation(ref, visible, onClose);
  const today = localToday();
  const [range, setRange] = useState(first);
  // Each opening starts from the dates offered
  const [shownFor, setShownFor] = useState(visible);
  if (visible !== shownFor) {
    setShownFor(visible);
    if (visible) setRange(first);
  }
  const days = durationDays(range.start, range.end);
  const tooLong = days > MAX_TRIP_DAYS;

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />,
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      // Edge-to-edge Android never resizes the window for the keyboard (as the busy time's sheet)
      android_keyboardInputMode="adjustPan"
      onDismiss={handleDismiss}
      onChange={(index) => {
        if (index >= 0) haptics.selection();
      }}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      accessibilityLabel={t('after.again')}
    >
      <BottomSheetScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        testID="plan-again-sheet"
      >
        <View>
          <Text style={styles.title} accessibilityRole="header">
            {t('after.again')}
          </Text>
          <Text style={styles.sub}>{t('after.againBody')}</Text>
        </View>
        <DateRangeFields start={range.start} end={range.end} onChange={setRange} today={today} />
        <Text style={[styles.length, tooLong && styles.problem]} accessibilityLiveRegion="polite" testID="plan-again-length">
          {tooLong
            ? t('newTrip.errTooLong')
            : `${friendlyRange(range.start, range.end, i18n.language, today)} · ${t('trips.row.days', { count: days, n: f.n(days) })}`}
        </Text>
        <Button
          label={t('after.againGo')}
          icon="content-copy"
          onPress={() => onMake(range)}
          loading={busy}
          disabled={busy || tooLong || range.start < today}
          haptic="medium"
          testID="plan-again-make"
        />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  content: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.md, gap: t.spacing.lg },
  title: { ...t.type.screenTitle, color: t.colors.textPrimary },
  sub: { ...t.type.callout, fontSize: 14.5, color: t.colors.textSecondary, marginTop: 2 },
  length: { ...t.type.callout, fontSize: 14.5, fontWeight: '500', color: t.colors.textPrimary },
  problem: { color: t.colors.danger },
}));
