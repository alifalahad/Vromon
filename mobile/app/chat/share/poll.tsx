/**
 * A poll for a chat (the share sheet's Poll tile): a question and 2–6 answers, one
 * answer each unless "Allow more than one answer" is on. The server's limits are
 * checked here first: 200 characters for the question, 80 for an answer, no repeats.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../../src/features/account/useMe';
import { pollCard, pollProblem, sendCard } from '../../../src/features/chat/share';
import { usePlanFormat } from '../../../src/features/trips/plan/usePlanFormat';
import { Button } from '../../../src/ui/Button';
import { PressableScale } from '../../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../../src/ui/theme';
import { Toggle } from '../../../src/ui/Toggle';

const MAX_QUESTION = 200;
const MAX_OPTION = 80;
const MAX_OPTIONS = 6;

export default function SharePollScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const client = useQueryClient();
  const { chat } = useLocalSearchParams<{ chat: string }>();
  const me = useMe().data;
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const problem = pollProblem(question, options);

  const send = () => {
    if (!me || problem) return;
    const answers = options.map((o) => o.trim()).filter(Boolean);
    sendCard(client, me.id, Number(chat), pollCard(question.trim(), answers, multiple));
    router.back();
  };

  return (
    // Under a header: the keyboard is measured from the screen's top, so the header counts too
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={headerHeight} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.label} accessibilityRole="header">
          {t('chat.share.pollQuestion')}
        </Text>
        <TextInput
          autoComplete="off"
          importantForAutofill="no"
          value={question}
          onChangeText={setQuestion}
          placeholder={t('chat.share.pollQuestionPlaceholder')}
          placeholderTextColor={colors.textTertiary}
          maxLength={MAX_QUESTION}
          multiline
          style={styles.input}
          accessibilityLabel={t('chat.share.pollQuestion')}
          testID="poll-question"
        />
        <Text style={styles.label} accessibilityRole="header">
          {t('chat.share.pollAnswers')}
        </Text>
        {options.map((value, i) => (
          <View key={i} style={styles.optionRow}>
            <TextInput
              autoComplete="off"
              importantForAutofill="no"
              value={value}
              onChangeText={(text) => setOptions((cur) => cur.map((o, j) => (j === i ? text : o)))}
              placeholder={t('chat.share.pollOption', { n: f.n(i + 1) })}
              placeholderTextColor={colors.textTertiary}
              maxLength={MAX_OPTION}
              style={[styles.input, styles.optionInput]}
              accessibilityLabel={t('chat.share.pollOption', { n: f.n(i + 1) })}
              testID={`poll-option-${i + 1}`}
            />
            {options.length > 2 ? (
              <PressableScale
                pressEffect="opacity"
                haptic="light"
                onPress={() => setOptions((cur) => cur.filter((_, j) => j !== i))}
                style={styles.remove}
                accessibilityRole="button"
                accessibilityLabel={t('chat.share.pollRemoveOption', { n: f.n(i + 1) })}
                testID={`poll-remove-${i + 1}`}
              >
                <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
              </PressableScale>
            ) : null}
          </View>
        ))}
        {options.length < MAX_OPTIONS ? (
          <Button label={t('chat.share.pollAddOption')} variant="secondary" onPress={() => setOptions((cur) => [...cur, ''])} testID="poll-add" />
        ) : null}
        <View style={styles.switchRow}>
          <Text style={styles.switchText}>{t('chat.share.pollMultiple')}</Text>
          <Toggle
            value={multiple}
            onValueChange={setMultiple}
            accessibilityLabel={t('chat.share.pollMultiple')}
            testID="poll-multiple"
          />
        </View>
        {problem && problem !== 'empty' ? <Text style={styles.problem}>{t(`chat.share.pollProblem.${problem}`)}</Text> : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button label={t('chat.share.send')} onPress={send} disabled={!!problem} testID="poll-send" />
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  body: { padding: t.spacing.lg, gap: t.spacing.sm },
  label: { ...t.type.footnote, fontWeight: '600', color: t.colors.textSecondary, textTransform: 'uppercase', marginTop: t.spacing.md },
  input: {
    ...t.type.body,
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: t.colors.textPrimary,
    backgroundColor: t.colors.surface,
  },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  optionInput: { flex: 1 },
  remove: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  switchRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, marginTop: t.spacing.md },
  switchText: { ...t.type.body, flex: 1, color: t.colors.textPrimary },
  problem: { ...t.type.footnote, color: t.colors.danger },
  footer: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.sm },
}));
