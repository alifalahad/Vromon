import React from 'react';
import { useTranslation } from 'react-i18next';

import { TextField } from '../../ui/TextField';
import type { UsernameCheck } from './useUsernameCheck';

/** Username input showing the live check result under it. */
export function UsernameField({
  value,
  onChangeText,
  check,
  onSubmitEditing,
}: {
  value: string;
  onChangeText: (v: string) => void;
  check: UsernameCheck;
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
      error={error}
      ok={check.state === 'available' ? t('onboarding.available') : null}
      hint={check.state === 'checking' ? t('onboarding.checking') : t('onboarding.usernameHint')}
      testID="username-input"
    />
  );
}
