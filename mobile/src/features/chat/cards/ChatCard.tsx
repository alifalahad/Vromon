/**
 * A card in a chat: the right component for its kind, or "No longer available"
 * when the server says the viewer can't see what it points at any more.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

import type {
  CardKind,
  CheckinCard as CheckinData,
  IdeaCard,
  InviteCard as InviteData,
  LateCard as LateData,
  LiveCard as LiveData,
  PlaceCard as PlaceData,
  PollCard as PollData,
  TripCard,
} from '../../../types';
import { CardFrame } from './CardFrame';
import { InviteCard } from './InviteCard';
import { CheckinCard, LateCard, LiveCard } from './OnTripCards';
import { PlaceCard } from './PlaceCard';
import { PollCard } from './PollCard';
import { TripIdeaCard } from './TripIdeaCard';
import { TripPlanCard } from './TripPlanCard';
import type { CardProps } from './types';

export function ChatCard({ kind, payload, ...props }: Omit<CardProps<unknown>, 'data'> & { kind: CardKind; payload: Record<string, unknown> | null }) {
  const { t } = useTranslation();
  const data = payload ?? {};
  if (data.available === false) {
    const eyebrow = t(`chat.cards.${kind}.eyebrow`);
    return (
      <CardFrame
        mine={props.mine}
        tail={props.tail}
        tone={kind}
        eyebrow={eyebrow}
        title={t('chat.cards.unavailable')}
        line={t('chat.cards.unavailableBody')}
        icon="eye-off-outline"
        label={`${props.labelPrefix}${eyebrow}. ${t('chat.cards.unavailable')}`}
        footer={props.footer}
        testID={`card-unavailable-${props.testKey}`}
        a11yActions={props.a11yActions}
        onA11yAction={props.onA11yAction}
      />
    );
  }
  switch (kind) {
    case 'trip':
      return <TripPlanCard {...props} data={data as unknown as TripCard} />;
    case 'place':
      return <PlaceCard {...props} data={data as unknown as PlaceData} />;
    case 'idea':
      return <TripIdeaCard {...props} data={data as unknown as IdeaCard} />;
    case 'poll':
      return <PollCard {...props} data={data as unknown as PollData} />;
    case 'invite':
      return <InviteCard {...props} data={data as unknown as InviteData} />;
    case 'checkin':
      return <CheckinCard {...props} data={data as unknown as CheckinData} />;
    case 'late':
      return <LateCard {...props} data={data as unknown as LateData} />;
    case 'live':
      return <LiveCard {...props} data={data as unknown as LiveData} />;
  }
}
