/**
 * A poll: a question with 2–6 answers. Tap an answer to choose it (tap it again to
 * take it back); a poll that allows several toggles each. Every answer shows how
 * many chose it, with a bar.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { PollCard as PollData } from '../../../types';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { usePlanFormat } from '../../trips/plan/usePlanFormat';
import { useCardActions } from './actions';
import { CardFrame } from './CardFrame';
import type { CardProps } from './types';

export function PollCard({ data, mine, tail, footer, pending, messageId, conversationId, votes, labelPrefix, testKey, a11yActions, onA11yAction }: CardProps<PollData>) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const actions = useCardActions();
  const me = actions?.me;
  const options = data.options ?? [];
  const count = (id: number) => (votes?.[String(id)] ?? []).length;
  const mineChosen = options.filter((o) => !!me && (votes?.[String(o.id)] ?? []).includes(me)).map((o) => o.id);
  const voters = new Set(Object.values(votes ?? {}).flat()).size;
  const most = Math.max(1, ...options.map((o) => count(o.id)));
  const eyebrow = data.multiple ? t('chat.cards.poll.eyebrowAny') : t('chat.cards.poll.eyebrow');

  const choose = (id: number) => {
    if (!actions || messageId == null) return;
    const on = mineChosen.includes(id);
    const next = data.multiple ? (on ? mineChosen.filter((o) => o !== id) : [...mineChosen, id]) : on ? [] : [id];
    actions.vote({ id: messageId, conversation_id: conversationId, votes: votes ?? {} }, next);
  };

  return (
    <CardFrame
      mine={mine}
      tail={tail}
      tone="poll"
      eyebrow={eyebrow}
      title={data.question}
      line={voters ? t('chat.cards.poll.voters', { count: voters, n: f.n(voters) }) : t('chat.cards.poll.noVotes')}
      icon="poll"
      label={`${labelPrefix}${eyebrow}. ${data.question}`}
      footer={footer}
      a11yActions={a11yActions}
      onA11yAction={onA11yAction}
      testID={`card-poll-${testKey}`}
    >
      <View style={styles.options} accessibilityRole={data.multiple ? undefined : 'radiogroup'}>
        {options.map((o) => {
          const on = mineChosen.includes(o.id);
          const n = count(o.id);
          return (
            <PressableScale
              key={o.id}
              pressEffect="opacity"
              haptic="selection"
              disabled={!actions || pending || messageId == null}
              onPress={() => choose(o.id)}
              style={[styles.option, mine ? styles.optionMine : styles.optionTheirs, on && styles.optionOn]}
              accessibilityRole={data.multiple ? 'checkbox' : 'radio'}
              accessibilityState={{ checked: on, disabled: !actions || pending }}
              accessibilityLabel={t('chat.cards.poll.option', { text: o.text, votes: t('chat.cards.poll.votes', { count: n, n: f.n(n) }) })}
              testID={`card-option-${o.id}-${testKey}`}
            >
              <View style={[styles.bar, { width: `${(n / most) * 100}%` }, n === 0 && styles.barEmpty]} />
              <MaterialCommunityIcons
                name={data.multiple ? (on ? 'checkbox-marked' : 'checkbox-blank-outline') : on ? 'radiobox-marked' : 'radiobox-blank'}
                size={20}
                color={on ? colors.onAccentSoft : colors.textSecondary}
              />
              <Text style={styles.optionText} numberOfLines={2}>
                {o.text}
              </Text>
              <Text style={styles.count}>{f.n(n)}</Text>
            </PressableScale>
          );
        })}
      </View>
    </CardFrame>
  );
}

const useStyles = makeStyles((t) => ({
  options: { gap: 6 },
  option: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  optionTheirs: { backgroundColor: t.colors.surfaceRaised },
  optionMine: { backgroundColor: t.colors.cardButtonMine },
  optionOn: { borderWidth: 1.5, borderColor: t.colors.onAccentSoft },
  // How many chose it, behind the text
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: t.colors.accentSoft },
  barEmpty: { width: 0 },
  optionText: { ...t.type.callout, flex: 1, fontSize: 15, color: t.colors.textPrimary },
  count: { ...t.type.callout, fontSize: 14, fontWeight: '600', color: t.colors.textPrimary },
}));
