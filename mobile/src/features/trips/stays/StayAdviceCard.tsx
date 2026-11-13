/**
 * "Sleep in Mongla for night 3?" (docs/trip-upgrades, step 4): above the day it's about, and in the
 * budget's ways to save. The hotel and its price against the current one, what it saves in money and
 * road time, the move it takes, and [Switch] [Not now] [Don't suggest this] with "Why?".
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { StaySuggestion } from '../../../types';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { useSheetPresentation } from '../../../ui/useSheetPresentation';
import { usePlanFormat } from '../plan/usePlanFormat';
import { adviceA11y, advicePrice, adviceSaves, adviceTitle, whyLines } from './advice';

export function StayAdviceCard({
  suggestion: s,
  destination,
  canAnswer,
  busy,
  onSwitch,
  onNotNow,
  onDismiss,
  onWhy,
}: {
  suggestion: StaySuggestion;
  destination: string;
  /** The trip's owner: the buttons */
  canAnswer: boolean;
  /** Which button is working */
  busy?: 'switch' | 'notNow' | 'dismiss' | null;
  onSwitch: () => void;
  onNotNow: () => void;
  onDismiss: () => void;
  onWhy: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const { saves, move } = adviceSaves(s, t, f);
  const button = (key: 'switch' | 'notNow' | 'dismiss', label: string, onPress: () => void, primary = false) => (
    <PressableScale
      key={key}
      haptic={primary ? 'medium' : 'selection'}
      onPress={onPress}
      disabled={!!busy}
      style={[styles.button, primary && styles.primary, busy && busy !== key && styles.dim]}
      accessibilityRole="button"
      testID={`advice-${key}-${s.id}`}
    >
      {busy === key ? (
        <ActivityIndicator size="small" color={primary ? colors.onAccent : colors.link} />
      ) : (
        <Text style={[styles.buttonText, primary && styles.primaryText]}>{label}</Text>
      )}
    </PressableScale>
  );
  return (
    <View style={styles.card} testID={`advice-${s.id}`}>
      <View style={styles.head} accessible accessibilityLabel={adviceA11y(s, destination, t, f)}>
        <MaterialCommunityIcons name="bed-outline" size={22} color={colors.onAccentSoft} style={styles.icon} />
        <View style={styles.flex}>
          <Text style={styles.title}>{adviceTitle(s, destination, t, f)}</Text>
          <Text style={styles.body}>{advicePrice(s, t, f)}</Text>
          <Text style={styles.saves}>{saves}</Text>
          <Text style={styles.body}>{move}</Text>
        </View>
      </View>
      <PressableScale pressEffect="opacity" haptic="selection" onPress={onWhy} hitSlop={8} style={styles.why} accessibilityRole="button" testID={`advice-why-${s.id}`}>
        <Text style={styles.whyText}>{t('stayAdvice.why')}</Text>
      </PressableScale>
      {canAnswer ? (
        <View style={styles.buttons}>
          {button('switch', t('stayAdvice.switch'), onSwitch, true)}
          {button('notNow', t('stayAdvice.notNow'), onNotNow)}
          {button('dismiss', t('stayAdvice.dismiss'), onDismiss)}
        </View>
      ) : null}
    </View>
  );
}

/** "Why?": how the numbers add up, in plain words */
export function StayAdviceWhy({ suggestion, destination, onClose }: { suggestion: StaySuggestion | null; destination: string; onClose: () => void }) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const insets = useSafeAreaInsets();
  const handleDismiss = useSheetPresentation(ref, suggestion != null, onClose);
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />,
    [],
  );
  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={['70%']}
      enableDynamicSizing={false}
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheet}
      handleIndicatorStyle={styles.handle}
      accessibilityLabel={t('stayAdvice.why')}
    >
      <BottomSheetScrollView contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + 24 }]} testID="advice-why-sheet">
        {suggestion ? (
          <>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              {adviceTitle(suggestion, destination, t, f)}
            </Text>
            {whyLines(suggestion, t, f).map((line, i) => (
              <Text key={i} style={styles.line}>
                {line}
              </Text>
            ))}
          </>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  card: { gap: t.spacing.sm, padding: t.spacing.lg, borderRadius: 20, backgroundColor: t.colors.accentSoft, marginBottom: t.spacing.sm },
  head: { flexDirection: 'row', gap: t.spacing.md },
  icon: { marginTop: 2 },
  title: { ...t.type.headline, color: t.colors.textPrimary },
  body: { ...t.type.callout, color: t.colors.textSecondary, marginTop: 2 },
  saves: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary, marginTop: 4 },
  why: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', marginLeft: 22 + t.spacing.md },
  whyText: { ...t.type.callout, fontWeight: '600', color: t.colors.onAccentSoft },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  button: { minHeight: 44, paddingHorizontal: t.spacing.md, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surface },
  primary: { backgroundColor: t.colors.accentStrong },
  dim: { opacity: 0.5 },
  buttonText: { ...t.type.callout, fontWeight: '600', color: t.colors.link },
  primaryText: { color: t.colors.onAccent },
  sheet: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  sheetContent: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.sm, gap: t.spacing.md },
  sheetTitle: { ...t.type.title, color: t.colors.textPrimary },
  line: { ...t.type.body, color: t.colors.textPrimary },
}));
