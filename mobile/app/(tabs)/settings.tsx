/**
 * Vromon Mobile — Settings tab (13-settings-rows.jpg).
 *
 * Profile, privacy & friends, preferences and notifications (synced to the
 * account), account, data and About.
 */

import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { useRouter, useScrollToTop } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { ME_QUERY_KEY, useMe } from '../../src/features/account/useMe';
import { signOut } from '../../src/features/auth/actions';
import { authEnabled } from '../../src/features/auth/session';
import { formatFriendCode } from '../../src/features/friends/friendCode';
import { pushAvailable, registerForPush } from '../../src/features/friends/push';
import { countryName } from '../../src/features/geo/countries';
import { mapThemeName } from '../../src/features/mapThemes/resolve';

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
import { Avatar } from '../../src/ui/Avatar';
import { LargeTitle } from '../../src/ui/LargeTitle';
import { OptionSheet } from '../../src/ui/OptionSheet';
import { PressableScale } from '../../src/ui/PressableScale';
import { SettingsRow, SettingsSection, SettingsSwitchRow } from '../../src/ui/SettingsRow';
import { makeStyles } from '../../src/ui/theme';
import { confirm, notify } from '../../src/utils/dialogs';

async function exportMyData() {
  const data = await meApi.export();
  const file = new File(Paths.cache, `vromon-export-${new Date().toISOString().slice(0, 10)}.json`);
  file.create({ overwrite: true });
  file.write(JSON.stringify(data, null, 2));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Vromon data export' });
}

type Sheet = 'language' | 'appearance' | 'units' | null;

export default function SettingsScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const [sheet, setSheet] = useState<Sheet>(null);

  const prefs = usePreferences();
  const language = resolveLanguage(prefs.language);
  const version = Constants.expoConfig?.version ?? '—';
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
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
      <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content}>
        <LargeTitle title={t('settings.title')} />

        {me ? (
          <PressableScale
            style={styles.profile}
            onPress={() => router.push('/settings/profile')}
            accessibilityLabel={`${me.display_name ?? me.username}, ${t('profile.edit')}`}
            testID="settings-profile"
          >
            <Avatar name={me.display_name ?? me.username} size={56} />
            <View style={styles.profileText}>
              <Text style={styles.profileName} numberOfLines={1}>
                {me.display_name ?? me.username}
              </Text>
              <Text style={styles.profileMeta} numberOfLines={1}>
                @{me.username}
                {me.home_country_iso2 ? ` · ${countryName(me.home_country_iso2, language)}` : ''}
              </Text>
            </View>
          </PressableScale>
        ) : null}

        {me ? (
          <SettingsSection title={t('settings.sectionPrivacy')}>
            <SettingsRow
              icon="qrcode"
              title={t('settings.myFriendCode')}
              value={formatFriendCode(me.friend_code)}
              onPress={() => router.push({ pathname: '/friends/add', params: { tab: 'code' } })}
              testID="settings-friend-code"
            />
            <SettingsSwitchRow
              icon="account-search-outline"
              title={t('settings.discoverable')}
              value={me.discoverable}
              onValueChange={setDiscoverable}
              testID="settings-discoverable"
            />
            <SettingsRow
              icon="account-cancel-outline"
              title={t('friends.blockedUsers')}
              onPress={() => router.push('/settings/blocked')}
              last
              testID="settings-blocked"
            />
          </SettingsSection>
        ) : null}

        <SettingsSection title={t('settings.sectionPreferences')}>
          <SettingsRow
            icon="translate"
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
            icon="palette-outline"
            title={t('settings.mapTheme')}
            value={mapThemeName(prefs.mapTheme) ?? t('mapTheme.custom')}
            onPress={() => router.push('/map/theme')}
            testID="settings-map-theme"
          />
          <SettingsSwitchRow
            icon="vibrate"
            title={t('settings.haptics')}
            value={prefs.haptics}
            onValueChange={prefs.setHaptics}
            testID="settings-haptics"
          />
          <SettingsRow
            icon="map-marker-distance"
            title={t('settings.units')}
            value={t(`settings.unitOptions.${prefs.units}`)}
            onPress={() => setSheet('units')}
            last
            testID="settings-units"
          />
        </SettingsSection>

        {me ? (
          <SettingsSection title={t('settings.sectionNotifications')}>
            <SettingsSwitchRow
              icon="account-plus-outline"
              title={t('settings.notifyRequests')}
              value={prefs.notifyFriendRequests}
              onValueChange={(on) => {
                prefs.setNotifyFriendRequests(on);
                if (on) void registerForPush(true);
              }}
              testID="settings-notify-requests"
            />
            <SettingsSwitchRow
              icon="account-check-outline"
              title={t('settings.notifyAccepted')}
              value={prefs.notifyFriendAccepted}
              onValueChange={(on) => {
                prefs.setNotifyFriendAccepted(on);
                if (on) void registerForPush(true);
              }}
              last={pushAvailable()}
              testID="settings-notify-accepted"
            />
            {pushAvailable() ? null : <SettingsRow icon="bell-off-outline" title={t('settings.pushUnavailable')} last />}
          </SettingsSection>
        ) : null}

        {me && authEnabled ? (
          <SettingsSection title={t('settings.sectionAccount')}>
            {me.email ? <SettingsRow icon="email-outline" title={t('profile.email')} value={me.email} /> : null}
            <SettingsRow
              icon="logout"
              title={t('common.signOut')}
              onPress={() => confirm(t('settings.signOutConfirmTitle'), t('settings.signOutConfirmBody'), t('common.signOut'), () => signOut())}
              last
              testID="settings-sign-out"
            />
          </SettingsSection>
        ) : null}

        {me ? (
          <SettingsSection title={t('settings.sectionData')}>
            <SettingsRow icon="download-outline" title={t('settings.export')} value={exporting ? '…' : undefined} onPress={exporting ? undefined : runExport} />
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

        <SettingsSection title={t('settings.sectionAbout')}>
          <SettingsRow icon="information-outline" title={t('settings.version')} value={version} />
          <SettingsRow
            icon="scale-balance"
            title={t('settings.licences')}
            onPress={() => notify(t('settings.licences'), t('map.attribution'))}
            last
            testID="settings-licences"
          />
        </SettingsSection>
      </ScrollView>

      <OptionSheet<Language>
        visible={sheet === 'language'}
        title={t('settings.language')}
        options={LANGUAGES.map((v) => ({ value: v, label: t(`settings.languageNames.${v}`) }))}
        selected={language}
        onSelect={prefs.setLanguage}
        onClose={() => setSheet(null)}
        footnote={t('settings.bnNotice')}
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
  content: { paddingBottom: t.spacing.xxl },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.lg,
    marginHorizontal: t.spacing.lg + 2,
    marginBottom: t.spacing.xxl,
    padding: t.spacing.lg,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surface,
  },
  profileText: { flex: 1, gap: 2 },
  profileName: { ...t.type.headline, fontSize: 19, color: t.colors.textPrimary },
  profileMeta: { ...t.type.callout, color: t.colors.textSecondary },
}));
