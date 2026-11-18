/**
 * Pick your country (the home country); saves immediately and goes back. The line at the top says what
 * it changes (UI refresh step 13).
 */

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ME_QUERY_KEY, useMe } from '../../src/features/account/useMe';
import { CountryList } from '../../src/features/geo/CountryList';
import { meApi } from '../../src/services/api';
import { haptics } from '../../src/ui/haptics';
import { makeStyles } from '../../src/ui/theme';
import { notify } from '../../src/utils/dialogs';

export default function HomeCountryScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();

  const select = async (code: string) => {
    try {
      queryClient.setQueryData(ME_QUERY_KEY, await meApi.update({ home_country_iso2: code }));
      haptics.success();
      router.back();
    } catch (e) {
      notify(t('common.error'), e instanceof Error ? e.message : '', 'error');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>{t('profile.homeCountryHint')}</Text>
      <CountryList selected={me?.home_country_iso2 ?? null} onSelect={select} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg, paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.sm },
  hint: { ...t.type.footnote, color: t.colors.textSecondary, paddingHorizontal: 4 },
}));
