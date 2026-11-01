/**
 * Report… a message (step 5, mockup 7): why, and a note if you like. The report keeps
 * a copy of the message, so it can be looked at even after it's unsent. Reporting it
 * again changes nothing; the person isn't told. The chat says "Report sent" once this
 * screen has closed.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useChatNotice } from '../../src/features/chat/state';
import { chatApi } from '../../src/services/api';
import type { ReportReason } from '../../src/types';
import { Button } from '../../src/ui/Button';
import { PressableScale } from '../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { notify } from '../../src/utils/dialogs';

const REPORT_REASONS: ReportReason[] = ['spam', 'harassment', 'inappropriate', 'scam', 'other'];
const MAX_NOTE = 500;

export default function ReportScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { message, name } = useLocalSearchParams<{ message: string; name?: string }>();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const send = () => {
    if (!reason) return;
    setSending(true);
    chatApi
      .report(Number(message), reason, note.trim())
      .then(() => {
        useChatNotice.setState({ notice: t('chat.report.sent') });
        router.back();
      })
      .catch((e: unknown) => {
        setSending(false);
        notify(t('common.error'), e instanceof Error ? e.message : t('chat.report.failed'), 'error');
      });
  };

  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={headerHeight} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>{t('chat.report.intro', { name: name || t('chat.cards.someone') })}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('chat.report.why')}>
          {REPORT_REASONS.map((r) => {
            const on = reason === r;
            return (
              <PressableScale
                key={r}
                pressEffect="opacity"
                haptic="selection"
                onPress={() => setReason(r)}
                style={styles.row}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={t(`chat.report.reasons.${r}`)}
                testID={`report-reason-${r}`}
              >
                <MaterialCommunityIcons name={on ? 'radiobox-marked' : 'radiobox-blank'} size={24} color={on ? colors.accentStrong : colors.textSecondary} />
                <Text style={styles.rowText}>{t(`chat.report.reasons.${r}`)}</Text>
              </PressableScale>
            );
          })}
        </View>
        <Text style={styles.label}>{t('chat.report.note')}</Text>
        <TextInput
          autoComplete="off"
          importantForAutofill="no"
          value={note}
          onChangeText={setNote}
          placeholder={t('chat.report.notePlaceholder')}
          placeholderTextColor={colors.textTertiary}
          maxLength={MAX_NOTE}
          multiline
          style={styles.input}
          accessibilityLabel={t('chat.report.note')}
          testID="report-note"
        />
        <Text style={styles.hint}>{t('chat.report.private')}</Text>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button label={t('chat.report.send')} variant="danger" onPress={send} disabled={!reason || sending} testID="report-send" />
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  body: { padding: t.spacing.lg, gap: t.spacing.sm },
  intro: { ...t.type.body, color: t.colors.textSecondary, marginBottom: t.spacing.sm },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  rowText: { ...t.type.body, flex: 1, color: t.colors.textPrimary },
  label: { ...t.type.footnote, fontWeight: '600', color: t.colors.textSecondary, textTransform: 'uppercase', marginTop: t.spacing.md },
  input: {
    ...t.type.body,
    minHeight: 96,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: t.colors.textPrimary,
    backgroundColor: t.colors.surface,
    textAlignVertical: 'top',
  },
  hint: { ...t.type.footnote, color: t.colors.textSecondary },
  footer: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.sm },
}));
