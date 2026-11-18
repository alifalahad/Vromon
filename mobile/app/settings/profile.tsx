/**
 * Edit profile (UI refresh step 13, frame 27): your photo (ImgBB, via the server), name, username (with
 * its live check inside the field), your country (its own picker, saved at once), the email (shown, not
 * editable here). Save stays at the bottom, and works only when something changed and is valid. Leaving
 * with changes not saved asks first.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import { useHeaderHeight, usePreventRemove } from 'expo-router/react-navigation';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarPicker } from '../../src/features/account/AvatarPicker';
import { ME_QUERY_KEY, useMe } from '../../src/features/account/useMe';
import { UsernameField } from '../../src/features/account/UsernameField';
import { useUsernameCheck } from '../../src/features/account/useUsernameCheck';
import { countryName, flagEmoji } from '../../src/features/geo/countries';
import { usePreferences } from '../../src/features/preferences/store';
import { resolveLanguage } from '../../src/i18n';
import { ApiError, meApi } from '../../src/services/api';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { PressableScale } from '../../src/ui/PressableScale';
import { TextField } from '../../src/ui/TextField';
import { makeStyles, useTheme } from '../../src/ui/theme';

export default function EditProfileScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const lang = resolveLanguage(usePreferences((s) => s.language));
  const { data: me } = useMe();
  const [displayName, setDisplayName] = useState(me?.display_name ?? '');
  const [username, setUsername] = useState(me?.username ?? '');
  const { name, check } = useUsernameCheck(username, me?.username);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // What the form opened with: "changed" mustn't flip when the saved profile comes back from the server
  const [initial] = useState(() => ({ displayName: me?.display_name ?? null, username: me?.username ?? null }));
  // Saved: leave the way "Leave" does, without the question
  const [saved, setSaved] = useState(false);

  const changed = (displayName.trim() || null) !== initial.displayName || name !== initial.username;
  const valid = check.state === 'available';

  // Asking stays on until the screen is gone. Turning it off in the same moment the screen closes made
  // react-native-screens update the closing screen's header and crash ("ScreenStackFragment added into a
  // non-stack container", seen on the phone): after Save the question is skipped, not switched off.
  usePreventRemove(changed, ({ data: { action } }) => {
    if (saved) return navigation.dispatch(action);
    Alert.alert(t('profile.discardTitle'), t('profile.discardBody'), [
      { text: t('profile.keepEditing'), style: 'cancel' },
      { text: t('profile.discard'), style: 'destructive', onPress: () => navigation.dispatch(action) },
    ]);
  });
  useEffect(() => {
    if (saved) router.back();
  }, [saved, router]);

  const save = async () => {
    if (!valid) return haptics.error();
    setBusy(true);
    setError(null);
    try {
      const updated = await meApi.update({ display_name: displayName.trim() || null, ...(name !== me?.username ? { username: name } : {}) });
      queryClient.setQueryData(ME_QUERY_KEY, updated);
      haptics.success();
      setSaved(true);
    } catch (e) {
      haptics.error();
      setError(e instanceof ApiError && e.status === 409 ? t('onboarding.taken') : e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const home = me?.home_country_iso2 ?? null;
  return (
    // Edge to edge, the window doesn't shrink for the keyboard: padding keeps Save above it (as the chat screens do)
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={headerHeight} style={styles.screen}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="profile-screen">
        {me ? <AvatarPicker me={me} /> : null}
        <TextField
          label={t('profile.name')}
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={50}
          hint={t('profile.nameHint')}
          autoComplete="name"
          testID="profile-name"
        />
        <UsernameField value={username} onChangeText={setUsername} check={check} mine={name === me?.username} />

        <View style={styles.group}>
          <Text style={styles.label} nativeID="home-label">
            {t('profile.homeCountry')}
          </Text>
          <PressableScale
            pressEffect="opacity"
            onPress={() => router.push('/settings/home-country')}
            style={styles.country}
            accessibilityRole="button"
            accessibilityLabel={`${t('profile.homeCountry')}, ${countryName(home, lang) ?? t('profile.notSet')}`}
            testID="profile-home-country"
          >
            {home ? (
              <Text style={styles.flag} accessible={false}>
                {flagEmoji(home)}
              </Text>
            ) : null}
            <Text style={styles.countryName}>{countryName(home, lang) ?? t('profile.notSet')}</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
          </PressableScale>
          <Text style={styles.hint}>{t('profile.homeCountryHint')}</Text>
        </View>

        {me?.email ? (
          <View style={styles.email} accessible accessibilityLabel={`${t('profile.emailFixed')}, ${me.email}`} testID="profile-email">
            <MaterialCommunityIcons name="email-outline" size={20} color={colors.textSecondary} />
            <View style={styles.emailText}>
              <Text style={styles.emailLabel}>{t('profile.emailFixed')}</Text>
              <Text style={styles.emailValue}>{me.email}</Text>
            </View>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      {/* Save stays at the bottom, out of the scroll */}
      <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
        <Button label={t('common.save')} onPress={save} loading={busy} disabled={!changed || !valid} testID="profile-save" />
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  content: { paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxl, gap: 14 },
  group: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: t.colors.textSecondary, paddingLeft: 4 },
  country: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    paddingRight: 10,
    borderRadius: t.radius.control,
    borderWidth: 1.5,
    borderColor: t.colors.hairline,
    backgroundColor: t.colors.surface,
  },
  flag: { fontSize: 22 },
  countryName: { flex: 1, fontSize: 16.5, color: t.colors.textPrimary },
  hint: { ...t.type.footnote, color: t.colors.textSecondary, paddingLeft: 4 },
  email: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, borderRadius: t.radius.control, backgroundColor: t.colors.surfaceInset },
  emailText: { flex: 1, gap: 1 },
  emailLabel: { fontSize: 12.5, color: t.colors.textSecondary },
  emailValue: { fontSize: 15.5, color: t.colors.textPrimary },
  error: { ...t.type.callout, color: t.colors.danger, paddingHorizontal: 4 },
  bar: { paddingTop: 10, paddingHorizontal: t.spacing.lg, backgroundColor: t.colors.bg },
}));
