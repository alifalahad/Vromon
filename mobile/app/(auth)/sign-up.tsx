/**
 * Create an account with email and password. With "Confirm email" on in Supabase,
 * the user gets a link and lands on the check-your-email screen.
 */

import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from 'react-native';

import { signUpWithEmail } from '../../src/features/auth/actions';
import { AuthScreen, FormError } from '../../src/features/auth/AuthScreen';
import { fieldErrors, signUpSchema } from '../../src/features/auth/schemas';
import { authEnabled } from '../../src/features/auth/session';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { TextField } from '../../src/ui/TextField';
import { TextLink } from '../../src/ui/TextLink';

export default function SignUpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = signUpSchema.safeParse({ email, password, confirm });
    setErrors(fieldErrors(parsed));
    if (!parsed.success) return haptics.error();
    setBusy(true);
    const { error, needsConfirmation } = await signUpWithEmail(parsed.data.email, parsed.data.password);
    setBusy(false);
    setFormError(error);
    if (error) return haptics.error();
    haptics.success();
    if (needsConfirmation) router.replace({ pathname: '/check-email', params: { email: parsed.data.email } });
  };

  const err = (k: string) => (errors[k] ? t(`auth.errors.${errors[k]}`) : null);

  return (
    <AuthScreen title={t('auth.signUpTitle')} subtitle={t('auth.signUpSubtitle')}>
      <FormError message={formError} />
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={err('email')}
      />
      <TextField
        ref={passwordRef}
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
        hint={t('auth.passwordHint')}
        error={err('password')}
      />
      <TextField
        ref={confirmRef}
        label={t('auth.confirmPassword')}
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        returnKeyType="go"
        onSubmitEditing={submit}
        error={err('confirm')}
      />
      <Button label={t('auth.signUp')} onPress={submit} loading={busy} disabled={!authEnabled} />
      <TextLink label={`${t('auth.haveAccount')} ${t('auth.signIn')}`} onPress={() => router.back()} style={{ alignSelf: 'center' }} />
    </AuthScreen>
  );
}
