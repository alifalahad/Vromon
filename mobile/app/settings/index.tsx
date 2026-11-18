/**
 * Vromon Mobile — Settings (UI refresh step 13, frame 26), opened from the account picture on every tab.
 *
 * Who you are first, on the hero card (SettingsHero): your photo, name, travel numbers, Edit profile and
 * your friend code. Then the groups, an icon on every row: Preferences (synced to the account), Privacy and
 * friends, Your data, About. Sign out is its own button at the end, with the email under it; it says what
 * it does today: it ends every session of the account, on every phone.
 */

import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { exportMyData } from '../../src/features/account/exportData';
import { SettingsHero } from '../../src/features/account/SettingsHero';
import { ME_QUERY_KEY, useMe } from '../../src/features/account/useMe';
import { signOut } from '../../src/features/auth/actions';
import { authEnabled } from '../../src/features/auth/session';
import { DEFAULT_HOME } from '../../src/features/map/home';
import { useVisits } from '../../src/features/map/visits';
import { homeMarks, MapThumb } from '../../src/features/mapThemes/MapThumb';
import { mapThemeName } from '../../src/features/mapThemes/resolve';
import { useMapTheme } from '../../src/features/mapThemes/useMapTheme';
import {
  APPEARANCES,
  DISTANCE_UNITS,
  LANGUAGES,
  usePreferences,
  type Appearance,
  type DistanceUnits,
  type Language,
} from '../../src/features/preferences/store';
import { resolveLanguage } from '../../src/i18n';
import { meApi } from '../../src/services/api';
import { Button } from '../../src/ui/Button';
import { OptionSheet } from '../../src/ui/OptionSheet';
import { SettingsRow, SettingsSection, SettingsSwitchRow } from '../../src/ui/SettingsRow';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { confirm, notify } from '../../src/utils/dialogs';

type Sheet = 'language' | 'appearance' | 'units' | null;

export default function SettingsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<Sheet>(null);

  const prefs = usePreferences();
  const language = resolveLanguage(prefs.language);
  const version = Constants.expoConfig?.version ?? '—';
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const { data: visits = [] } = useVisits(me?.id);
  const mapTheme = useMapTheme();
  const [exporting, setExporting] = useState(false);

  const setDiscoverable = async (discoverable: boolean) => {
    if (!me) return;
    queryClient.setQueryData(ME_QUERY_KEY, { ...me, discoverable }); // optimistic
    try {
      queryClient.setQueryData(ME_QUERY_KEY, await meApi.update({ discoverable }));
    } catch (e) {
      queryClient.setQueryData(ME_QUERY_KEY, me);
      notify(t('common.error'), e instanceof Error ? e.message : '', 'error');
    }
  };

  const runExport = async () => {
    setExporting(true);
    try {
      await exportMyData();
    } catch (e) {
      notify(t('settings.exportFailed'), e instanceof Error ? e.message : '', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]} testID="settings-screen">
        {me ? <SettingsHero me={me} /> : null}

        <SettingsSection title={t('settings.sectionPreferences')} tone="blue">
          <SettingsRow
            icon="web"
            title={t('settings.language')}
            value={t(`settings.languageNames.${language}`)}
            onPress={() => setSheet('language')}
            testID="settings-language"
          />
          <SettingsRow
            icon="weather-night"
            title={t('settings.appearance')}
            value={t(`settings.appearanceOptions.${prefs.appearance}`)}
            onPress={() => setSheet('appearance')}
            testID="settings-appearance"
          />
          <SettingsRow
            icon="map-outline"
            title={t('settings.mapTheme')}
            value={mapThemeName(prefs.mapTheme) ?? t('mapTheme.custom')}
            // A small picture of the chosen theme, with your marks
            accessory={
              <MapThumb
                home={me?.home_country_iso2 ?? DEFAULT_HOME}
                look={mapTheme}
                marks={homeMarks(visits, me?.home_country_iso2 ?? DEFAULT_HOME)}
                width={34}
                height={24}
                ring={colors.accent}
                hairline={colors.hairline}
                ground={colors.surface}
              />
            }
            onPress={() => router.push('/map/theme')}
            testID="settings-map-theme"
          />
          <SettingsRow
            icon="ruler"
            title={t('settings.units')}
            value={t(`settings.unitOptions.${prefs.units}`)}
            onPress={() => setSheet('units')}
            testID="settings-units"
          />
          <SettingsSwitchRow icon="vibrate" title={t('settings.haptics')} value={prefs.haptics} onValueChange={prefs.setHaptics} last testID="settings-haptics" />
        </SettingsSection>

        {me ? (
          <SettingsSection title={t('settings.sectionPrivacy')} tone="green">
            <SettingsSwitchRow
              icon="account-search-outline"
              title={t('settings.discoverable')}
              value={me.discoverable}
              onValueChange={setDiscoverable}
              testID="settings-discoverable"
            />
            <SettingsRow
              icon="message-outline"
              title={t('settings.chats.title')}
              subtitle={t('settings.chatsLine')}
              onPress={() => router.push('/settings/chats')}
              last
              testID="settings-chats"
            />
          </SettingsSection>
        ) : null}

        {me ? (
          <SettingsSection title={t('settings.sectionData')} tone="grey">
            <SettingsRow
              icon="download-outline"
              title={t('settings.export')}
              value={exporting ? '…' : undefined}
              onPress={exporting ? undefined : runExport}
              testID="settings-export"
            />
            <SettingsRow
              icon="delete-outline"
              title={t('settings.deleteAccount')}
              onPress={() => router.push('/settings/delete-account')}
              danger
              last
              testID="settings-delete-account"
            />
          </SettingsSection>
        ) : null}

        <SettingsSection title={t('settings.sectionAbout')} tone="grey">
          <SettingsRow
            icon="file-document-outline"
            title={t('settings.licences')}
            onPress={() => notify(t('settings.licences'), t('map.attribution'))}
            testID="settings-licences"
          />
          <SettingsRow icon="information-outline" title={t('settings.version')} value={version} last testID="settings-version" />
        </SettingsSection>

        {/* Sign out: its own button, apart from the rows, and it says what it does before it does it */}
        {me && authEnabled ? (
          <View style={styles.signOut}>
            <Button
              variant="outline"
              icon="logout"
              label={t('common.signOut')}
              onPress={() => confirm(t('settings.signOutConfirmTitle'), t('settings.signOutConfirmBody'), t('common.signOut'), () => signOut(), true)}
              testID="settings-sign-out"
            />
            {me.email ? <Text style={styles.signedInAs}>{t('settings.signedInAs', { email: me.email })}</Text> : null}
          </View>
        ) : null}
      </ScrollView>

      <OptionSheet<Language>
        visible={sheet === 'language'}
        title={t('settings.language')}
        options={LANGUAGES.map((v) => ({ value: v, label: t(`settings.languageNames.${v}`) }))}
        selected={language}
        onSelect={prefs.setLanguage}
        onClose={() => setSheet(null)}
      />
      <OptionSheet<Appearance>
        visible={sheet === 'appearance'}
        title={t('settings.appearance')}
        options={APPEARANCES.map((v) => ({ value: v, label: t(`settings.appearanceOptions.${v}`) }))}
        selected={prefs.appearance}
        onSelect={prefs.setAppearance}
        onClose={() => setSheet(null)}
      />
      <OptionSheet<DistanceUnits>
        visible={sheet === 'units'}
        title={t('settings.units')}
        options={DISTANCE_UNITS.map((v) => ({ value: v, label: t(`settings.unitOptions.${v}`) }))}
        selected={prefs.units}
        onSelect={prefs.setUnits}
        onClose={() => setSheet(null)}
      />
    </>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  content: { paddingTop: t.spacing.sm },
  signOut: { marginHorizontal: t.spacing.lg, marginTop: t.spacing.sm, gap: t.spacing.sm },
  signedInAs: { ...t.type.footnote, color: t.colors.textSecondary, textAlign: 'center' },
}));
