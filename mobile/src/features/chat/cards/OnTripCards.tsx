/**
 * On the trip, in its room (friends-chat step 8, mockup 11):
 * - "I'm here": the stop it snapped to and how early or late, or roughly where;
 * - "Running late": by how much, for which stop, and "Sent from Today";
 * - a live location: a small map and the time left while it runs (with View, and Stop
 *   on your own), then only that it ended.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Text, View } from 'react-native';

import type { CheckinCard as CheckinData, LateCard as LateData, LiveCard as LiveData } from '../../../types';
import { makeStyles } from '../../../ui/theme';
import { dateFormat } from '../../../utils/dateFormat';
import { usePlanFormat } from '../../trips/plan/usePlanFormat';
import { useLiveShare } from '../liveShare';
import { useCardActions } from './actions';
import { CardButton, CardFrame } from './CardFrame';
import type { CardProps } from './types';

type T = ReturnType<typeof useTranslation>['t'];

/** "Reached Lawachara National Park", "9:40 am · planned for 9:30" */
export function checkinText(data: CheckinData, t: T, time: (hhmm: string) => string, n: (v: number) => string) {
  const title = data.stop
    ? t('chat.cards.checkin.reached', { place: data.stop })
    : data.near
      ? t('chat.cards.checkin.near', { place: data.near })
      : t('chat.cards.checkin.here');
  const when = data.time ? time(data.time) : '';
  const vsPlan =
    data.planned == null || data.late_by == null
      ? null
      : Math.abs(data.late_by) <= 5
        ? t('chat.cards.checkin.onTime')
        : t('chat.cards.checkin.planned', { time: time(data.planned) });
  return { title, line: [when, vsPlan].filter(Boolean).join(' · ') };
}

export function CheckinCard({ data, mine, tail, footer, labelPrefix, testKey, a11yActions, onA11yAction }: CardProps<CheckinData>) {
  const { t } = useTranslation();
  const f = usePlanFormat();
  const { title, line } = checkinText(data, t, f.time, f.n);
  return (
    <CardFrame
      mine={mine}
      tail={tail}
      tone="checkin"
      eyebrow={t('chat.cards.checkin.eyebrow')}
      title={title}
      line={line || null}
      icon="flag-outline"
      label={`${labelPrefix}${title}. ${line}`}
      footer={footer}
      a11yActions={a11yActions}
      onA11yAction={onA11yAction}
      testID={`card-checkin-${testKey}`}
    />
  );
}

export function lateText(data: LateData, t: T, n: (v: number) => string) {
  const title = data.stop
    ? t('chat.cards.late.forStop', { n: n(data.minutes), place: data.stop })
    : t('chat.cards.late.title', { n: n(data.minutes) });
  return { title, line: data.source === 'today' ? t('chat.cards.late.fromToday') : null };
}

export function LateCard({ data, mine, tail, footer, labelPrefix, testKey, a11yActions, onA11yAction }: CardProps<LateData>) {
  const { t } = useTranslation();
  const f = usePlanFormat();
  const { title, line } = lateText(data, t, f.n);
  return (
    <CardFrame
      mine={mine}
      tail={tail}
      tone="late"
      eyebrow={t('chat.cards.late.eyebrow')}
      title={title}
      line={line}
      icon="clock-alert-outline"
      label={`${labelPrefix}${title}${line ? `. ${line}` : ''}`}
      footer={footer}
      a11yActions={a11yActions}
      onA11yAction={onA11yAction}
      testID={`card-late-${testKey}`}
    />
  );
}

export function LiveCard({ data, mine, tail, footer, conversationId, labelPrefix, testKey, a11yActions, onA11yAction }: CardProps<LiveData>) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const actions = useCardActions();
  const sharing = useLiveShare((s) => s.share?.conversationId === conversationId);
  const until = data.until ? dateFormat(i18n.language, { hour: 'numeric', minute: '2-digit' }).format(new Date(data.until)) : '';
  const active = data.active && data.lat != null && data.lon != null;
  const title = active ? t('chat.cards.live.title') : t('chat.cards.live.ended');
  const line = active ? [data.near ? t('chat.cards.live.near', { place: data.near }) : null, t('chat.cards.live.until', { time: until })].filter(Boolean).join(' · ') : null;
  return (
    <CardFrame
      mine={mine}
      tail={tail}
      tone="live"
      eyebrow={t('chat.cards.live.eyebrow')}
      title={title}
      line={line}
      map={active ? { lat: data.lat, lon: data.lon, size: 64 } : null}
      icon="crosshairs-gps"
      label={`${labelPrefix}${title}${line ? `. ${line}` : ''}`}
      footer={footer}
      a11yActions={a11yActions}
      onA11yAction={onA11yAction}
      testID={`card-live-${testKey}`}
    >
      {active ? (
        <View style={styles.buttons}>
          <CardButton
            label={t('chat.cards.live.view')}
            icon="map-outline"
            mine={mine}
            // Opens the phone's maps app at the point; nothing is sent anywhere else
            onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${data.lat},${data.lon}`)}
            testID={`card-live-view-${testKey}`}
          />
          {mine && sharing && actions ? (
            <CardButton label={t('chat.live.stop')} mine={mine} onPress={actions.stopLive} testID={`card-live-stop-${testKey}`} />
          ) : null}
        </View>
      ) : (
        <Text style={[styles.ended, mine && styles.endedMine]}>{t('chat.cards.live.endedLine')}</Text>
      )}
    </CardFrame>
  );
}

const useStyles = makeStyles((t) => ({
  buttons: { flexDirection: 'row', gap: t.spacing.sm },
  ended: { ...t.type.footnote, color: t.colors.textSecondary },
  endedMine: { color: t.colors.cardMineText2 },
}));
