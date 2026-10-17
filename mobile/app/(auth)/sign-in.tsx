/**
 * Sign in with email and password, or Google (browser OAuth).
 */

import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TextInput, View } from 'react-native';

import { signInWithEmail, signInWithGoogle } from '../../src/features/auth/actions';
import { AuthScreen, FormError } from '../../src/features/auth/AuthScreen';
import { fieldErrors, signInSchema } from '../../src/features/auth/schemas';
import { authEnabled } from '../../src/features/auth/session';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { TextField } from '../../src/ui/TextField';
import { TextLink } from '../../src/ui/TextLink';
import { makeStyles } from '../../src/ui/theme';

export default function SignInScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(authEnabled ? null : t('auth.notConfigured'));
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);

  const submit = async () => {
    const parsed = signInSchema.safeParse({ email, password });
    setErrors(fieldErrors(parsed));
    if (!parsed.success) return haptics.error();
    setBusy('email');
    const error = await signInWithEmail(parsed.data.email, parsed.data.password);
    setBusy(null);
    setFormError(error);
    if (error) haptics.error();
    else haptics.success(); // the root layout moves on when the session arrives
  };

  const google = async () => {
    setBusy('google');
    const error = await signInWithGoogle();
    setBusy(null);
    setFormError(error);
    if (error) haptics.error();
  };

  return (
    <AuthScreen title={t('auth.signInTitle')} subtitle={t('auth.signInSubtitle')}>
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
        error={errors.email ? t(`auth.errors.${errors.email}`) : null}
        testID="email-input"
      />
      <TextField
        ref={passwordRef}
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        error={errors.password ? t(`auth.errors.${errors.password}`) : null}
        testID="password-input"
      />
      <TextLink label={t('auth.forgot')} onPress={() => router.push('/forgot-password')} style={styles.link} />
      <Button label={t('auth.signIn')} onPress={submit} loading={busy === 'email'} disabled={!authEnabled || !!busy} testID="sign-in-button" />

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t('auth.or')}</Text>
        <View style={styles.dividerLine} />
      </View>
      <Button variant="secondary" label={t('auth.google')} onPress={google} loading={busy === 'google'} disabled={!authEnabled || !!busy} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('auth.noAccount')}</Text>
        <Button variant="secondary" label={t('auth.createAccount')} onPress={() => router.push('/sign-up')} testID="go-sign-up" />
      </View>
    </AuthScreen>
  );
}

const useStyles = makeStyles((t) => ({
  link: { alignSelf: 'flex-end' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: t.colors.divider },
  dividerText: { ...t.type.footnote, color: t.colors.textTertiary },
  footer: { marginTop: t.spacing.xl, gap: t.spacing.sm },
  footerText: { ...t.type.callout, color: t.colors.textSecondary, textAlign: 'center' },
}));
