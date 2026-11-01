/**
 * A trip card (mockup 5): where, when, how many stops, and "Open plan". Someone
 * else's trip can be copied into your own trips. The card shows the trip as it
 * was when it was sent; Open plan shows it as it is now.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { TripCard } from '../../../types';
import { makeStyles } from '../../../ui/theme';
import { formatRange } from '../../trips/dates';
import { usePlanFormat } from '../../trips/plan/usePlanFormat';
import { useCardActions } from './actions';
import { CardButton, CardFrame } from './CardFrame';
import type { CardProps } from './types';

export function tripCardText(data: TripCard, senderId: string | null, me: string | undefined, t: ReturnType<typeof useTranslation>['t'], lang: string, n: (v: number) => string) {
  const eyebrow =
    data.owner_id === senderId
      ? t('chat.cards.trip.eyebrow')
      : data.owner_id === me
        ? t('chat.cards.trip.yours')
        : t('chat.cards.trip.eyebrowOf', { name: data.owner_name });
  // A card still sending doesn't know the stops yet (-1)
  const plan = data.stops > 0 ? t('chat.cards.trip.stops', { count: data.stops, n: n(data.stops) }) : data.stops === 0 ? t('chat.cards.trip.noPlan') : null;
  const range = data.start_date && data.end_date ? formatRange(data.start_date, data.end_date, lang) : null;
  const line = [range, plan].filter(Boolean).join(' · ');
  return { eyebrow, title: data.destination, line };
}

export function TripPlanCard({ data, mine, tail, footer, senderId, pending, labelPrefix, testKey, a11yActions, onA11yAction }: CardProps<TripCard>) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const actions = useCardActions();
  const { eyebrow, title, line } = tripCardText(data, senderId, actions?.me, t, i18n.language, f.n);
  const theirs = !!actions && data.owner_id !== actions.me;
  return (
    <CardFrame
      mine={mine}
      tail={tail}
      tone="trip"
      eyebrow={eyebrow}
      title={title}
      line={line}
      map={{ lat: data.lat, lon: data.lon, region: data.region, size: 48 }}
      icon="bag-suitcase-outline"
      label={`${labelPrefix}${eyebrow}. ${title}. ${line}`}
      footer={footer}
      a11yActions={a11yActions}
      onA11yAction={onA11yAction}
      testID={`card-trip-${testKey}`}
    >
      {actions ? (
        <View style={styles.buttons}>
          <CardButton
            label={t('chat.cards.trip.open')}
            mine={mine}
            disabled={pending}
            onPress={() => actions.openTrip(data.trip_id)}
            testID={`card-open-${testKey}`}
          />
          {theirs ? (
            <CardButton
              label={t('chat.cards.trip.copy')}
              icon="content-copy"
              mine={mine}
              disabled={pending || actions.copying === data.trip_id}
              onPress={() => actions.copyTrip(data.trip_id)}
              testID={`card-copy-${testKey}`}
            />
          ) : null}
        </View>
      ) : null}
    </CardFrame>
  );
}

const useStyles = makeStyles((t) => ({
  buttons: { flexDirection: 'row', gap: t.spacing.sm },
}));
