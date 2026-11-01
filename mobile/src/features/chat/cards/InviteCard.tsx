/**
 * A trip room invite (friends-chat step 7): the trip, and where you stand with its
 * room. Invited: Join / Not now. In it (or the owner): Open trip room. Left or
 * removed: the card stays, without a way in.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { InviteCard as InviteData } from '../../../types';
import { makeStyles } from '../../../ui/theme';
import { usePlanFormat } from '../../trips/plan/usePlanFormat';
import { useCardActions } from './actions';
import { CardButton, CardFrame } from './CardFrame';
import { tripCardText } from './TripPlanCard';
import type { CardProps } from './types';

export function InviteCard({ data, mine, tail, footer, senderId, pending, labelPrefix, testKey, a11yActions, onA11yAction }: CardProps<InviteData>) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const actions = useCardActions();
  const { line } = tripCardText(data, senderId, actions?.me, t, i18n.language, f.n);
  const status = data.room?.status ?? 'none';
  const roomId = data.room?.conversation_id ?? null;
  const eyebrow = t('chat.cards.invite.eyebrow');
  const title = t('chat.cards.invite.title', { destination: data.destination });
  const state = status === 'none' ? t('chat.cards.invite.notIn') : null;
  const busy = !!actions && actions.joining === data.trip_id;

  return (
    <CardFrame
      mine={mine}
      tail={tail}
      tone="invite"
      eyebrow={eyebrow}
      title={title}
      line={line}
      map={{ lat: data.lat, lon: data.lon, region: data.region, size: 48 }}
      icon="account-group-outline"
      label={`${labelPrefix}${eyebrow}. ${title}. ${line}${state ? `. ${state}` : ''}`}
      footer={footer}
      a11yActions={a11yActions}
      onA11yAction={onA11yAction}
      testID={`card-invite-${testKey}`}
    >
      {actions && status === 'invited' ? (
        <View style={styles.buttons}>
          <CardButton
            label={t('chat.cards.invite.join')}
            mine={mine}
            disabled={pending || busy}
            onPress={() => actions.joinRoom(data.trip_id)}
            testID={`card-join-${testKey}`}
          />
          <CardButton
            label={t('chat.cards.invite.notNow')}
            mine={mine}
            disabled={pending || busy}
            onPress={() => actions.declineRoom(data.trip_id)}
            testID={`card-decline-${testKey}`}
          />
        </View>
      ) : actions && roomId != null ? (
        <CardButton
          label={t('chat.cards.invite.open')}
          mine={mine}
          disabled={pending}
          onPress={() => actions.openRoom(roomId)}
          testID={`card-room-${testKey}`}
        />
      ) : state ? (
        <Text style={[styles.state, mine && styles.stateMine]}>{state}</Text>
      ) : null}
    </CardFrame>
  );
}

const useStyles = makeStyles((t) => ({
  buttons: { flexDirection: 'row', gap: t.spacing.sm },
  state: { ...t.type.footnote, color: t.colors.textSecondary },
  stateMine: { color: t.colors.cardMineText2 },
}));
