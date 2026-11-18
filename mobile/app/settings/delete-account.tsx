/**
 * Delete account (Google Play requirement): explains what is deleted, asks the
 * user to type their username, confirms once more, then deletes server-side and
 * signs out. In Settings' cards since UI refresh step 13.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useMe } from '../../src/features/account/useMe';
import { signOut } from '../../src/features/auth/actions';
import { meApi } from '../../src/services/api';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { TextField } from '../../src/ui/TextField';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { confirm, notify } from '../../src/utils/dialogs';

export default function DeleteAccountScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { data: me } = useMe();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = !!me?.username && typed.trim().toLowerCase() === me.username;

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await meApi.delete();
      notify(t('deleteAccount.done'), '');
      await signOut(); // the root layout returns to sign-in
    } catch (e) {
      haptics.error();
      setError(e instanceof Error ? e.message : t('common.error'));
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* What goes, said in words on a danger-tinted card, before anything can be typed */}
      <View style={styles.warning} testID="delete-account-warning">
        <View style={styles.warningIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <MaterialCommunityIcons name="alert-outline" size={22} color={colors.danger} />
        </View>
        <Text style={styles.body}>{t('deleteAccount.body')}</Text>
      </View>
      <TextField
        label={t('deleteAccount.typeToConfirm', { username: me?.username ?? '' })}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
        testID="delete-confirm-input"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        variant="danger"
        haptic="medium"
        label={t('deleteAccount.button')}
        loading={busy}
        disabled={!matches}
        onPress={() => confirm(t('deleteAccount.confirmTitle'), t('deleteAccount.confirmBody'), t('deleteAccount.button'), remove, true)}
        testID="delete-account-button"
      />
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  content: { padding: t.spacing.lg, gap: t.spacing.xl },
  warning: { flexDirection: 'row', gap: t.spacing.md, padding: t.spacing.lg, borderRadius: t.radius.card, backgroundColor: t.colors.surface, ...t.depth.card },
  warningIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.dangerBg },
  body: { ...t.type.body, flex: 1, color: t.colors.textPrimary, lineHeight: 24 },
  error: { ...t.type.callout, color: t.colors.danger },
}));
