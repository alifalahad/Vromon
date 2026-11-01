/**
 * Vromon Mobile — Settings → Chats and privacy (docs/friends-chat-plan.md, step 5;
 * mockup 8). Everything here is saved to the account (PUT /me/settings).
 *
 * - Read receipts are mutual: with them off you don't see anyone's either.
 * - Show my trips to friends (step 6, decisions C3 and C7): off hides your trips from the
 *   On the road strip, the chat header and your profile.
 * - Notifications: messages, trip rooms and friend requests ("Friend requests" covers
 *   requests and accepted ones), and whether a notification shows the message text.
 * - Live location (trip rooms, step 8) is explained here; it's shared only from a trip.
 * - Blocked people, download my chats (part of the data export), delete all my chats
 *   (for you only: the other people keep theirs).
 */

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { exportMyData } from '../../src/features/account/exportData';
import { chatKeys } from '../../src/features/chat/queries';
import { pushAvailable, registerForPush } from '../../src/features/friends/push';
import { usePreferences } from '../../src/features/preferences/store';
import { usePlanFormat } from '../../src/features/trips/plan/usePlanFormat';
import { chatApi } from '../../src/services/api';
import { SettingsRow, SettingsSection, SettingsSwitchRow } from '../../src/ui/SettingsRow';
import { makeStyles } from '../../src/ui/theme';
import { confirm, notify } from '../../src/utils/dialogs';

export default function ChatSettingsScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const prefs = usePreferences();
  const f = usePlanFormat();
  const [busy, setBusy] = useState<'export' | 'clear' | null>(null);

  // Turning a notification on asks for permission the first time
  const notifySwitch = (change: Parameters<typeof prefs.setChat>[0], on: boolean) => {
    prefs.setChat(change);
    if (on) void registerForPush(true);
  };

  const setReadReceipts = (on: boolean) => {
    prefs.setChat({ readReceipts: on });
    // Ticks change in both directions: fetch the chats again once the server has it
    setTimeout(() => void client.invalidateQueries({ queryKey: chatKeys.all }), 1500);
  };

  const download = async () => {
    setBusy('export');
    try {
      await exportMyData();
    } catch (e) {
      notify(t('settings.exportFailed'), e instanceof Error ? e.message : '', 'error');
    } finally {
      setBusy(null);
    }
  };

  const clearAll = () =>
    confirm(
      t('settings.chats.clearTitle'),
      t('settings.chats.clearBody'),
      t('settings.chats.clear'),
      async () => {
        setBusy('clear');
        try {
          const { cleared } = await chatApi.clearAll();
          client.removeQueries({ queryKey: ['chat', 'thread'] });
          await client.invalidateQueries({ queryKey: chatKeys.all });
          notify(t('settings.chats.clearedTitle'), t('settings.chats.cleared', { count: cleared, n: f.n(cleared) }), 'success');
        } catch (e) {
          notify(t('common.error'), e instanceof Error ? e.message : '', 'error');
        } finally {
          setBusy(null);
        }
      },
      true,
    );

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <SettingsSection title={t('settings.chats.sectionPrivacy')}>
        <SettingsSwitchRow
          icon="check-all"
          title={t('settings.chats.readReceipts')}
          value={prefs.readReceipts}
          onValueChange={setReadReceipts}
          testID="settings-read-receipts"
        />
        <SettingsSwitchRow
          icon="map-marker-path"
          title={t('settings.chats.shareTrips')}
          value={prefs.shareTrips}
          onValueChange={(on) => prefs.setChat({ shareTrips: on })}
          last
          testID="settings-share-trips"
        />
      </SettingsSection>
      <Text style={styles.note}>
        {t('settings.chats.readReceiptsNote')}
        {'\n\n'}
        {t('settings.chats.shareTripsNote')}
      </Text>

      <SettingsSection title={t('settings.chats.sectionNotifications')}>
        {pushAvailable() ? null : <SettingsRow icon="bell-off-outline" title={t('settings.pushUnavailable')} />}
        <SettingsSwitchRow
          icon="message-outline"
          title={t('settings.chats.notifyMessages')}
          value={prefs.notifyMessages}
          onValueChange={(on) => notifySwitch({ notifyMessages: on }, on)}
          testID="settings-notify-messages"
        />
        <SettingsSwitchRow
          icon="account-group-outline"
          title={t('settings.chats.notifyTripRooms')}
          value={prefs.notifyTripRooms}
          onValueChange={(on) => notifySwitch({ notifyTripRooms: on }, on)}
          testID="settings-notify-trip-rooms"
        />
        <SettingsSwitchRow
          icon="account-plus-outline"
          title={t('settings.chats.notifyRequests')}
          value={prefs.notifyFriendRequests || prefs.notifyFriendAccepted}
          onValueChange={(on) => notifySwitch({ notifyFriendRequests: on, notifyFriendAccepted: on }, on)}
          testID="settings-notify-requests"
        />
        <SettingsSwitchRow
          icon="text-short"
          title={t('settings.chats.previews')}
          value={prefs.notificationPreviews}
          onValueChange={(on) => prefs.setChat({ notificationPreviews: on })}
          last
          testID="settings-notification-previews"
        />
      </SettingsSection>
      <Text style={styles.note}>{t('settings.chats.previewsNote')}</Text>

      <SettingsSection title={t('settings.chats.sectionLocation')}>
        <View style={styles.explain} testID="settings-live-location">
          <Text style={styles.explainTitle}>{t('settings.chats.liveTitle')}</Text>
          <Text style={styles.explainText}>{t('settings.chats.liveBody')}</Text>
        </View>
      </SettingsSection>

      <SettingsSection title={t('settings.chats.sectionPeople')}>
        <SettingsRow
          icon="account-cancel-outline"
          title={t('friends.blockedUsers')}
          onPress={() => router.push('/settings/blocked')}
          last
          testID="settings-blocked"
        />
      </SettingsSection>

      <SettingsSection title={t('settings.chats.sectionData')}>
        <SettingsRow
          icon="download-outline"
          title={t('settings.chats.download')}
          value={busy === 'export' ? '…' : undefined}
          onPress={busy ? undefined : download}
          testID="settings-download-chats"
        />
        <SettingsRow
          icon="delete-sweep-outline"
          title={t('settings.chats.clear')}
          value={busy === 'clear' ? '…' : undefined}
          onPress={busy ? undefined : clearAll}
          danger
          last
          testID="settings-clear-chats"
        />
      </SettingsSection>
      <Text style={styles.note}>{t('settings.chats.clearNote')}</Text>
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  content: { paddingTop: t.spacing.sm },
  note: { ...t.type.footnote, color: t.colors.textSecondary, paddingHorizontal: t.spacing.xl, marginTop: -t.spacing.lg, marginBottom: t.spacing.xl },
  explain: { paddingHorizontal: t.spacing.xl, paddingVertical: t.spacing.md, gap: t.spacing.xs },
  explainTitle: { ...t.type.headline, color: t.colors.textPrimary },
  explainText: { ...t.type.footnote, color: t.colors.textSecondary },
}));
