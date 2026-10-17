/**
 * Edit profile: display name and username (live availability check).
 * Home country has its own picker screen.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text } from 'react-native';

import { ME_QUERY_KEY, useMe } from '../../src/features/account/useMe';
import { UsernameField } from '../../src/features/account/UsernameField';
import { useUsernameCheck } from '../../src/features/account/useUsernameCheck';
import { countryName } from '../../src/features/geo/countries';
import { usePreferences } from '../../src/features/preferences/store';
import { resolveLanguage } from '../../src/i18n';
import { ApiError, meApi } from '../../src/services/api';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { SettingsRow, SettingsSection } from '../../src/ui/SettingsRow';
import { TextField } from '../../src/ui/TextField';
import { makeStyles } from '../../src/ui/theme';

export default function EditProfileScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const lang = resolveLanguage(usePreferences((s) => s.language));
  const { data: me } = useMe();
  const [displayName, setDisplayName] = useState(me?.display_name ?? '');
  const [username, setUsername] = useState(me?.username ?? '');
  const { name, check } = useUsernameCheck(username, me?.username);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const changed = (displayName.trim() || null) !== (me?.display_name ?? null) || name !== me?.username;

  const save = async () => {
    if (check.state !== 'available') return haptics.error();
    setBusy(true);
    setError(null);
    try {
      const updated = await meApi.update({ display_name: displayName.trim() || null, ...(name !== me?.username ? { username: name } : {}) });
      queryClient.setQueryData(ME_QUERY_KEY, updated);
      haptics.success();
      router.back();
    } catch (e) {
      haptics.error();
      setError(e instanceof ApiError && e.status === 409 ? t('onboarding.taken') : e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TextField
        label={t('profile.displayName')}
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={50}
        hint={t('profile.displayNameHint')}
        autoComplete="name"
      />
      <UsernameField value={username} onChangeText={setUsername} check={check} />
      <SettingsSection>
        <SettingsRow
          icon="home-outline"
          title={t('profile.homeCountry')}
          value={countryName(me?.home_country_iso2, lang) ?? t('profile.notSet')}
          onPress={() => router.push('/settings/home-country')}
          last
        />
      </SettingsSection>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label={t('common.save')} onPress={save} loading={busy} disabled={!changed || check.state !== 'available'} />
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  content: { padding: t.spacing.xl, gap: t.spacing.xl },
  error: { ...t.type.callout, color: t.colors.danger },
}));
