/**
 * Five stars to tap. For a screen reader the row is one adjustable control: swipe up or down to change
 * the stars (no need to find each star).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';

const WORDS = ['', 'poor', 'fair', 'good', 'veryGood', 'excellent'] as const;

/** "Very good" for 4 stars (the words "Rate this plan" uses) */
export function starWord(n: number, t: (key: string) => string): string {
  return n >= 1 && n <= 5 ? t(`feedback.words.${WORDS[n]}`) : '';
}

export function Stars({
  value,
  onChange,
  size = 36,
  label,
  testID,
}: {
  value: number;
  /** Without it, the stars are only shown */
  onChange?: (n: number) => void;
  size?: number;
  label: string;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const now = value ? t('review.starsOf', { n: value, word: starWord(value, t) }) : t('review.notRated');
  const icons = [1, 2, 3, 4, 5].map((n) => (
    <MaterialCommunityIcons key={n} name={n <= value ? 'star' : 'star-outline'} size={size} color={n <= value ? colors.warning : colors.textTertiary} />
  ));
  if (!onChange) {
    return (
      <View style={styles.row} accessible accessibilityLabel={`${label}: ${now}`} testID={testID}>
        {icons}
      </View>
    );
  }
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 5, now: value, text: now }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onChange(Math.min(5, value + 1));
        else if (e.nativeEvent.actionName === 'decrement' && value > 1) onChange(value - 1);
      }}
      testID={testID}
    >
      {icons.map((icon, i) => (
        <PressableScale
          key={i}
          haptic="selection"
          onPress={() => onChange(i + 1)}
          hitSlop={6}
          style={styles.star}
          testID={testID ? `${testID}-${i + 1}` : undefined}
        >
          {icon}
        </PressableScale>
      ))}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  star: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
}));
