/**
 * A trip idea (mockup 5): "Let's go to Sreemangal", roughly when, for how long,
 * a note, and I'm in / Maybe / Can't. Under the answers, who said what; at the
 * bottom, "Plan this trip" opens the trip wizard there.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { IdeaCard } from '../../../types';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { usePlanFormat } from '../../trips/plan/usePlanFormat';
import { useCardActions } from './actions';
import { CardButton, CardFrame } from './CardFrame';
import type { CardProps } from './types';

/** The answers' option ids (the server's too) */
export const IDEA_ANSWERS = [
  { id: 1, key: 'in', icon: 'check' },
  { id: 2, key: 'maybe', icon: null },
  { id: 3, key: 'out', icon: null },
] as const;

/** "Early December", "Mid March 2027" (the year only when it isn't this one). */
export function ideaWhen(month: string | null, part: IdeaCard['part'], t: ReturnType<typeof useTranslation>['t'], lang: string, now = new Date()) {
  if (!month) return null;
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  const name = date.toLocaleDateString(lang, y === now.getFullYear() ? { month: 'long' } : { month: 'long', year: 'numeric' });
  return part ? t(`chat.cards.idea.${part}`, { month: name }) : name;
}

export function ideaCardText(data: IdeaCard, t: ReturnType<typeof useTranslation>['t'], lang: string, n: (v: number) => string) {
  const line = [ideaWhen(data.month, data.part, t, lang), data.days ? t('chat.cards.idea.days', { count: data.days, n: n(data.days) }) : null, data.note]
    .filter(Boolean)
    .join(' · ');
  return { title: t('chat.cards.idea.title', { destination: data.destination }), line };
}

export function TripIdeaCard({
  data,
  mine,
  tail,
  footer,
  pending,
  messageId,
  conversationId,
  votes,
  labelPrefix,
  testKey,
  a11yActions,
  onA11yAction,
}: CardProps<IdeaCard>) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const actions = useCardActions();
  const { title, line } = ideaCardText(data, t, i18n.language, f.n);
  const me = actions?.me;
  const chosen = IDEA_ANSWERS.find((a) => !!me && (votes?.[String(a.id)] ?? []).includes(me))?.id ?? null;
  const who = IDEA_ANSWERS.map((a) => {
    const people = votes?.[String(a.id)] ?? [];
    if (!people.length) return null;
    const names = people.map((id) => (id === me ? t('chat.cards.you') : (actions?.names[id] ?? t('chat.cards.someone'))));
    return t('chat.cards.idea.who', { answer: t(`chat.cards.idea.whoLabel.${a.key}`), names: names.join(', ') });
  }).filter(Boolean);

  return (
    <CardFrame
      mine={mine}
      tail={tail}
      tone="idea"
      eyebrow={t('chat.cards.idea.eyebrow')}
      title={title}
      line={line || null}
      map={{ lat: data.lat, lon: data.lon, region: data.region, size: 64 }}
      icon="lightbulb-on-outline"
      label={`${labelPrefix}${t('chat.cards.idea.eyebrow')}. ${title}. ${line}`}
      footer={footer}
      a11yActions={a11yActions}
      onA11yAction={onA11yAction}
      testID={`card-idea-${testKey}`}
    >
      {actions ? (
        <>
          <View style={styles.answers} accessibilityRole="radiogroup" accessibilityLabel={t('chat.cards.idea.question')}>
            {IDEA_ANSWERS.map((a) => (
              <CardButton
                key={a.id}
                label={t(`chat.cards.idea.${a.key}`)}
                icon={a.icon && chosen === a.id ? a.icon : undefined}
                mine={mine}
                selected={chosen === a.id}
                disabled={pending || messageId == null}
                accessibilityRole="radio"
                onPress={() => messageId != null && actions.vote({ id: messageId, conversation_id: conversationId, votes }, chosen === a.id ? [] : [a.id])}
                testID={`card-answer-${a.key}-${testKey}`}
              />
            ))}
          </View>
          {who.length ? (
            <Text style={[styles.who, mine && styles.whoMine]} testID={`card-who-${testKey}`}>
              {who.join(' · ')}
            </Text>
          ) : null}
          <PressableScale
            pressEffect="opacity"
            haptic="light"
            disabled={pending}
            // Everyone else who's in is invited to plan it together (step 7)
            onPress={() =>
              actions.planTrip(
                data.destination,
                undefined,
                (votes?.['1'] ?? []).filter((id) => id !== me),
              )
            }
            style={[styles.plan, mine && styles.planMine]}
            accessibilityRole="button"
            accessibilityLabel={t('chat.cards.idea.planLabel', { destination: data.destination })}
            testID={`card-plan-${testKey}`}
          >
            <Text style={[styles.planText, mine && styles.planTextMine]}>{t('chat.cards.idea.plan')}</Text>
            <MaterialCommunityIcons name="arrow-right" size={18} color={mine ? colors.cardEyebrowMine : colors.onAccentSoft} />
          </PressableScale>
        </>
      ) : null}
    </CardFrame>
  );
}

const useStyles = makeStyles((t) => ({
  answers: { flexDirection: 'row', gap: 6 },
  who: { ...t.type.caption, fontSize: 13, color: t.colors.textSecondary, marginTop: -4 },
  whoMine: { color: t.colors.cardMineText2 },
  plan: {
    minHeight: 48,
    marginHorizontal: -12,
    marginBottom: -4,
    borderTopWidth: 1,
    borderTopColor: t.colors.divider,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  planMine: { borderTopColor: t.colors.cardButtonMine },
  planText: { ...t.type.callout, fontSize: 15, fontWeight: '600', color: t.colors.onAccentSoft },
  planTextMine: { color: t.colors.cardEyebrowMine },
}));
