/**
 * Return point for password-reset links (vromon://auth/reset-password?code=…):
 * exchanges the code (a short "recovery" session), then sets the new password.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from 'react-native';

import { exchangeCode, setNewPassword } from '../../src/features/auth/actions';
import { AuthScreen, FormError } from '../../src/features/auth/AuthScreen';
import { fieldErrors, newPasswordSchema } from '../../src/features/auth/schemas';
import { useAuth } from '../../src/features/auth/session';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { TextField } from '../../src/ui/TextField';
import { notify } from '../../src/utils/dialogs';

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const confirmRef = useRef<TextInput>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [ready, setReady] = useState(!code);
  const [busy, setBusy] = useState(false);
  const exchanged = useRef(false);

  useEffect(() => {
    if (!code || exchanged.current) return;
    exchanged.current = true;
    exchangeCode(code).then((error) => {
      if (error) {
        setFormError(`${t('auth.callbackFailed')}. ${t('auth.callbackFailedBody')}`);
        haptics.error();
      } else setReady(true);
    });
  }, [code, t]);

  const submit = async () => {
    const parsed = newPasswordSchema.safeParse({ password, confirm });
    setErrors(fieldErrors(parsed));
    if (!parsed.success) return haptics.error();
    setBusy(true);
    const error = await setNewPassword(parsed.data.password);
    setBusy(false);
    setFormError(error);
    if (error) return haptics.error();
    useAuth.setState({ recovering: false });
    notify(t('auth.passwordSaved'), '', 'success');
    router.replace('/');
  };

  const err = (k: string) => (errors[k] ? t(`auth.errors.${errors[k]}`) : null);

  return (
    <AuthScreen title={t('auth.resetTitle')}>
      <FormError message={formError} />
      <TextField
        label={t('auth.newPassword')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
        hint={t('auth.passwordHint')}
        error={err('password')}
        editable={ready}
      />
      <TextField
        ref={confirmRef}
        label={t('auth.confirmPassword')}
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        returnKeyType="go"
        onSubmitEditing={submit}
        error={err('confirm')}
        editable={ready}
      />
      <Button label={t('auth.savePassword')} onPress={submit} loading={busy} disabled={!ready} />
    </AuthScreen>
  );
}
