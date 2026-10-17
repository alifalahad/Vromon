/**
 * Return point for email-confirmation links and OAuth (vromon://auth/callback?code=…).
 * Exchanges the PKCE code for a session; the root layout then shows the app.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { exchangeCode } from '../../src/features/auth/actions';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { makeStyles, useTheme } from '../../src/ui/theme';

export default function AuthCallbackScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const [failed, setFailed] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !params.code) return;
    started.current = true;
    exchangeCode(params.code).then((error) => {
      if (error) {
        setFailed(error);
      } else {
        haptics.success();
        router.replace('/');
      }
    });
  }, [params.code, params.error_description, router]);

  // A link without a code (e.g. ?error_description=…) failed before reaching the app
  if (!params.code && failed === null) {
    return <Failed message={params.error_description ?? null} />;
  }
  if (failed === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.link} />
        <Text style={styles.body}>{t('auth.callbackWorking')}</Text>
      </View>
    );
  }
  return <Failed message={failed} />;
}

function Failed({ message }: { message: string | null }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  useEffect(() => haptics.error(), []);
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{t('auth.callbackFailed')}</Text>
      <Text style={styles.body}>{message || t('auth.callbackFailedBody')}</Text>
      <Button label={t('auth.backToSignIn')} onPress={() => router.replace('/sign-in')} style={styles.button} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.spacing.lg, padding: t.spacing.xxl, backgroundColor: t.colors.bg },
  title: { ...t.type.title, color: t.colors.textPrimary, textAlign: 'center' },
  body: { ...t.type.body, color: t.colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  button: { alignSelf: 'stretch' },
}));
