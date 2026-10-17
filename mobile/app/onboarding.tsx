/**
 * First run after sign-up: claim a username → (optional) home country → mark the
 * countries you've visited → the app. Visits are saved like any map edit (queued,
 * so a flaky connection doesn't lose them).
 */

import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ME_QUERY_KEY } from '../src/features/account/useMe';
import { UsernameField } from '../src/features/account/UsernameField';
import { useUsernameCheck } from '../src/features/account/useUsernameCheck';
import { CountryList } from '../src/features/geo/CountryList';
import { CountryMultiPicker } from '../src/features/map/CountryMultiPicker';
import { setVisitStatus } from '../src/features/map/visits';
import { ApiError, meApi } from '../src/services/api';
import { Button } from '../src/ui/Button';
import { haptics } from '../src/ui/haptics';
import { makeStyles } from '../src/ui/theme';

const STEPS = 3;

export default function OnboardingScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [input, setInput] = useState('');
  const [country, setCountry] = useState<string | null>(null);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { name, check } = useUsernameCheck(input);

  const next = () => {
    if (check.state !== 'available') return haptics.error();
    setError(null);
    setStep(1);
  };

  const toggleVisited = (code: string) =>
    setVisited((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      const me = await meApi.update({ username: name, ...(country ? { home_country_iso2: country } : {}) });
      for (const code of visited) {
        setVisitStatus(queryClient, me.id, { place_type: 'country', place_code: code, country_iso2: code }, 'visited');
      }
      haptics.success();
      queryClient.setQueryData(ME_QUERY_KEY, me); // the root layout moves on to the app
    } catch (e) {
      haptics.error();
      const taken = e instanceof ApiError && e.status === 409;
      setError(taken ? t('onboarding.taken') : e instanceof Error ? e.message : t('common.error'));
      if (taken) setStep(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 16 }]}>
      <Text style={styles.step}>{t('onboarding.step', { n: step + 1, total: STEPS })}</Text>
      {step === 0 ? (
        <View style={styles.body}>
          <Text style={styles.title} accessibilityRole="header">
            {t('onboarding.usernameTitle')}
          </Text>
          <Text style={styles.subtitle}>{t('onboarding.usernameBody')}</Text>
          <UsernameField value={input} onChangeText={setInput} check={check} onSubmitEditing={next} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.spacer} />
          <Button label={t('common.continue')} onPress={next} disabled={check.state !== 'available'} testID="onboarding-continue" />
        </View>
      ) : step === 1 ? (
        <View style={styles.body}>
          <Text style={styles.title} accessibilityRole="header">
            {t('onboarding.countryTitle')}
          </Text>
          <Text style={styles.subtitle}>{t('onboarding.countryBody')}</Text>
          <CountryList selected={country} onSelect={setCountry} />
          <View style={styles.actions}>
            <Button
              variant="secondary"
              label={t('onboarding.skip')}
              onPress={() => {
                setCountry(null);
                setStep(2);
              }}
              style={styles.flex}
            />
            <Button label={t('common.continue')} onPress={() => setStep(2)} disabled={!country} style={styles.flex} testID="onboarding-country-continue" />
          </View>
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.title} accessibilityRole="header">
            {t('onboarding.visitedTitle')}
          </Text>
          <Text style={styles.subtitle}>{t('onboarding.visitedBody')}</Text>
          <CountryMultiPicker selected={visited} onToggle={toggleVisited} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label={t('onboarding.finish')} onPress={finish} loading={busy} testID="onboarding-finish" />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg, paddingHorizontal: t.spacing.xxl },
  step: { ...t.type.footnote, fontWeight: '600', color: t.colors.textTertiary, marginBottom: t.spacing.sm },
  body: { flex: 1, gap: t.spacing.lg },
  title: { ...t.type.largeTitle, color: t.colors.textPrimary },
  subtitle: { ...t.type.body, color: t.colors.textSecondary, lineHeight: 22 },
  error: { ...t.type.callout, color: t.colors.danger },
  spacer: { flex: 1 },
  actions: { flexDirection: 'row', gap: t.spacing.md },
  flex: { flex: 1 },
}));
