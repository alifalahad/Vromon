/**
 * After sign-up: the confirmation link was emailed. Opening it on this phone
 * returns to app/auth/callback.tsx, which signs the user in.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { resendConfirmation } from '../../src/features/auth/actions';
import { AuthScreen, FormError } from '../../src/features/auth/AuthScreen';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { makeStyles, useTheme } from '../../src/ui/theme';

export default function CheckEmailScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const resend = async () => {
    setBusy(true);
    const err = await resendConfirmation(email);
    setBusy(false);
    setError(err);
    setResent(!err);
    if (err) haptics.error();
    else haptics.success();
  };

  return (
    <AuthScreen title={t('auth.checkEmailTitle')}>
      <MaterialCommunityIcons name="email-check-outline" size={72} color={colors.link} style={styles.icon} />
      <Text style={styles.body}>{t('auth.checkEmailBody', { email })}</Text>
      <FormError message={error} />
      {resent ? <Text style={styles.ok}>{t('auth.resent')}</Text> : null}
      <Button variant="secondary" label={t('auth.resend')} onPress={resend} loading={busy} />
      <Button label={t('auth.backToSignIn')} onPress={() => router.replace('/sign-in')} />
    </AuthScreen>
  );
}

const useStyles = makeStyles((t) => ({
  icon: { alignSelf: 'center' },
  body: { ...t.type.body, color: t.colors.textSecondary, lineHeight: 24, textAlign: 'center' },
  ok: { ...t.type.callout, color: t.colors.success, textAlign: 'center' },
}));
