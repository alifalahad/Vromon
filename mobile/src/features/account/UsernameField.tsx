import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { makeStyles, useTheme } from '../../ui/theme';
import { TextField } from '../../ui/TextField';
import type { UsernameCheck } from './useUsernameCheck';

/**
 * Username input with "@" in front and the live check shown inside the field (UI refresh step 13, frame 27):
 * "Yours" (your own, unchanged), "Free", "Taken" or "Checking…", each in words with an icon. A problem with
 * the name itself is said under the field.
 */
export function UsernameField({
  value,
  onChangeText,
  check,
  mine = false,
  onSubmitEditing,
}: {
  value: string;
  onChangeText: (v: string) => void;
  check: UsernameCheck;
  /** The name is the one you already have */
  mine?: boolean;
  onSubmitEditing?: () => void;
}) {
  const { t } = useTranslation();
  const error =
    check.state === 'invalid'
      ? t(`onboarding.problems.${check.problem}`)
      : check.state === 'taken'
        ? t('onboarding.taken')
        : check.state === 'error'
          ? t('common.error')
          : null;
  const status = check.state === 'available' ? (mine ? 'mine' : 'free') : check.state === 'taken' ? 'taken' : check.state === 'checking' ? 'checking' : null;
  return (
    <TextField
      label={t('profile.username')}
      value={value}
      onChangeText={(v) => onChangeText(v.toLowerCase())}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="username-new"
      maxLength={20}
      returnKeyType="next"
      onSubmitEditing={onSubmitEditing}
      prefix="@"
      trailing={status ? <CheckChip status={status} /> : null}
      error={error}
      hint={t('profile.usernameHint')}
      testID="username-input"
    />
  );
}

type Status = 'mine' | 'free' | 'taken' | 'checking';

function CheckChip({ status }: { status: Status }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const good = status === 'mine' || status === 'free';
  const ink = good ? colors.success : status === 'taken' ? colors.danger : colors.textSecondary;
  const tint = good ? colors.successBg : status === 'taken' ? colors.dangerBg : colors.surfaceInset;
  return (
    // Read as its word ("Taken"), not the icon's glyph
    <View style={[styles.chip, { backgroundColor: tint }]} accessible accessibilityLabel={t(`profile.check.${status}`)} accessibilityLiveRegion="polite" testID={`username-${status}`}>
      {status === 'checking' ? (
        <ActivityIndicator size="small" color={ink} />
      ) : (
        <MaterialCommunityIcons name={good ? 'check' : 'close'} size={14} color={ink} />
      )}
      <Text style={[styles.chipText, { color: ink }]} maxFontSizeMultiplier={1.3}>
        {t(`profile.check.${status}`)}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 26, paddingLeft: 8, paddingRight: 10, borderRadius: 13 },
  chipText: { fontSize: 12.5, fontWeight: '700' },
}));
