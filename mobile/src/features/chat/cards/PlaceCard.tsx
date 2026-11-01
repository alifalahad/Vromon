/**
 * A place card (mockup 5): an attraction, a destination, or a division, city or
 * country from the map. "Want to go" puts it on your Want list (an attraction or a
 * destination by its division, decision C6); an attraction can be added to one of
 * your trips, a destination planned.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { PlaceCard as PlaceData, VisitStatus } from '../../../types';
import { makeStyles, useTheme } from '../../../ui/theme';
import { usePlanFormat } from '../../trips/plan/usePlanFormat';
import { useCardActions } from './actions';
import { CardButton, CardFrame } from './CardFrame';
import type { CardProps } from './types';

type Icon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const ICONS: Record<PlaceData['type'], Icon> = {
  attraction: 'map-marker-star-outline',
  destination: 'map-marker-radius-outline',
  region: 'map-outline',
  city: 'city-variant-outline',
  country: 'earth',
};

const WANT_LABEL: Record<VisitStatus, string> = { want: 'chat.cards.place.onWant', visited: 'chat.cards.place.visited', lived: 'chat.cards.place.lived' };

export function placeCardText(data: PlaceData, t: ReturnType<typeof useTranslation>['t'], lang: string, f: ReturnType<typeof usePlanFormat>) {
  const title = (lang === 'bn' && data.name_bn) || data.name;
  let line: string;
  if (data.type === 'attraction') {
    line = [
      data.category ? t(`interests.${data.category}`, { defaultValue: data.category }) : null,
      data.destination,
      data.hours ? t('chat.cards.place.about', { time: f.duration(data.hours * 60) }) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  } else if (data.type === 'destination') {
    line =
      data.places != null ? t('chat.cards.place.destinationLine', { count: data.places, n: f.n(data.places) }) : t('chat.cards.place.destinationPlannable');
  } else {
    line = t(`chat.cards.place.${data.type}`);
  }
  return { title, line };
}

export function PlaceCard({
  data,
  mine,
  tail,
  footer,
  pending,
  messageId,
  conversationId,
  labelPrefix,
  testKey,
  a11yActions,
  onA11yAction,
}: CardProps<PlaceData>) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const actions = useCardActions();
  const { title, line } = placeCardText(data, t, i18n.language, f);
  const status = actions?.mapStatus(data) ?? null;
  // In a trip room (step 7): a suggestion for the plan, which only the owner adds (C1)
  const suggestion = actions?.room ? data.suggestion : undefined;
  const owner = !!suggestion && actions?.room?.ownerId === actions?.me;
  const decided =
    suggestion?.status === 'added'
      ? t('chat.cards.place.addedToDay', { n: f.n(suggestion.day ?? 0) })
      : suggestion?.status === 'declined'
        ? t('chat.cards.place.notThisTime')
        : suggestion && !owner
          ? t('chat.cards.place.waiting', { name: actions?.room?.ownerName })
          : null;
  const second = suggestion
    ? null
    : data.type === 'attraction' && data.id && data.destination
      ? { label: t('chat.cards.place.addToTrip'), icon: 'plus' as const, run: () => actions?.addToTrip(data) }
      : data.type === 'destination'
        ? { label: t('chat.cards.place.planTrip'), icon: 'map-marker-path' as const, run: () => actions?.planTrip(data.name) }
        : null;
  return (
    <CardFrame
      mine={mine}
      tail={tail}
      tone="place"
      title={title}
      line={line}
      map={data.type === 'attraction' ? null : { lat: data.lat, lon: data.lon, region: data.region, size: 48 }}
      icon={ICONS[data.type] ?? 'map-marker-outline'}
      eyebrow={suggestion ? t('chat.cards.place.suggested') : undefined}
      label={`${labelPrefix}${suggestion ? t('chat.cards.place.suggested') : t('chat.cards.place.eyebrow')}. ${title}. ${line}${decided ? `. ${decided}` : ''}`}
      footer={footer}
      a11yActions={a11yActions}
      onA11yAction={onA11yAction}
      testID={`card-place-${testKey}`}
    >
      {actions && (actions.canWant(data) || second) ? (
        <View style={styles.buttons}>
          {actions.canWant(data) ? (
            <CardButton
              label={status ? t(WANT_LABEL[status]) : t('chat.cards.place.want')}
              icon={status ? 'check' : 'star-outline'}
              mine={mine}
              disabled={pending || !!status}
              onPress={() => actions.wantToGo(data)}
              accessibilityLabel={status ? t(WANT_LABEL[status]) : t('chat.cards.place.wantLabel', { place: title })}
              testID={`card-want-${testKey}`}
            />
          ) : null}
          {second ? (
            <CardButton label={second.label} icon={second.icon} mine={mine} disabled={pending} onPress={second.run} testID={`card-second-${testKey}`} />
          ) : null}
        </View>
      ) : null}
      {actions && suggestion?.status === 'open' && owner ? (
        <View style={styles.buttons}>
          <CardButton
            label={t('chat.cards.place.addToDay')}
            icon="calendar-plus"
            mine={mine}
            disabled={pending || messageId == null}
            onPress={() => messageId != null && actions.addSuggestion({ id: messageId, conversation_id: conversationId }, title)}
            testID={`card-add-day-${testKey}`}
          />
          <CardButton
            label={t('chat.cards.place.notThisTime')}
            mine={mine}
            disabled={pending || messageId == null}
            onPress={() => messageId != null && actions.declineSuggestion({ id: messageId, conversation_id: conversationId })}
            testID={`card-not-now-${testKey}`}
          />
        </View>
      ) : decided ? (
        <View style={styles.decided} testID={`card-suggestion-${testKey}`}>
          {suggestion?.status === 'added' ? <MaterialCommunityIcons name="check" size={16} color={mine ? colors.cardEyebrowMine : colors.success} /> : null}
          <Text style={[styles.decidedText, mine && styles.decidedMine]}>{decided}</Text>
        </View>
      ) : null}
    </CardFrame>
  );
}

const useStyles = makeStyles((t) => ({
  buttons: { flexDirection: 'row', gap: t.spacing.sm },
  decided: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  decidedText: { ...t.type.footnote, color: t.colors.textSecondary, flexShrink: 1 },
  decidedMine: { color: t.colors.cardMineText2 },
}));
