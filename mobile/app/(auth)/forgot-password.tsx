/**
 * Request a password-reset link. The link opens app/auth/reset-password.tsx.
 * The confirmation never says whether the email has an account.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { sendPasswordReset } from '../../src/features/auth/actions';
import { AuthScreen, FormError } from '../../src/features/auth/AuthScreen';
import { emailOnlySchema, fieldErrors } from '../../src/features/auth/schemas';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { TextField } from '../../src/ui/TextField';
import { makeStyles } from '../../src/ui/theme';

export default function ForgotPasswordScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = emailOnlySchema.safeParse({ email });
    const errs = fieldErrors(parsed);
    setFieldError(errs.email ? t(`auth.errors.${errs.email}`) : null);
    if (!parsed.success) return haptics.error();
    setBusy(true);
    const err = await sendPasswordReset(parsed.data.email);
    setBusy(false);
    setError(err);
    if (err) return haptics.error();
    haptics.success();
    setSentTo(parsed.data.email);
  };

  return (
    <AuthScreen title={t('auth.forgotTitle')} subtitle={t('auth.forgotBody')}>
      <FormError message={error} />
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        returnKeyType="send"
        onSubmitEditing={submit}
        error={fieldError}
      />
      {sentTo ? <Text style={styles.ok}>{t('auth.linkSent', { email: sentTo })}</Text> : null}
      <Button label={t('auth.sendLink')} onPress={submit} loading={busy} />
    </AuthScreen>
  );
}

const useStyles = makeStyles((t) => ({
  ok: { ...t.type.callout, color: t.colors.success, lineHeight: 22 },
}));
