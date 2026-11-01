/**
 * "On the road" (friends-chat step 6, mockup 1): friends on a trip today or leaving
 * within 14 days, at the top of Chats. A ring shows how far through the trip they
 * are; a dashed ring means it hasn't started. Tap opens your chat with them; hold
 * (or the screen reader action) opens their trip. Nothing shows when nobody's away.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, useWindowDimensions, View, type AccessibilityActionEvent } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { OnTheRoad } from '../../types';
import { Avatar } from '../../ui/Avatar';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { usePlanFormat } from '../trips/plan/usePlanFormat';
import { progress, stripLabel, stripLine } from './onTheRoad';

const ITEM_WIDTH = 92;
const MAX_GROWTH = 1.6;

const SIZE = 64;
const R = 30;
const LENGTH = 2 * Math.PI * R;

/** The ring around a face: solid and partly filled on a trip, dashed before it. */
function Ring({ value }: { value: number | null }) {
  const { colors } = useTheme();
  return (
    <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ position: 'absolute' }}>
      {value == null ? (
        <Circle cx={32} cy={32} r={R} fill="none" stroke={colors.textTertiary} strokeWidth={2} strokeDasharray="4 5" />
      ) : (
        <>
          <Circle cx={32} cy={32} r={R} fill="none" stroke={colors.divider} strokeWidth={3} />
          <Circle
            cx={32}
            cy={32}
            r={R}
            fill="none"
            stroke={colors.accentStrong}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${LENGTH * value} ${LENGTH}`}
            transform="rotate(-90 32 32)"
          />
        </>
      )}
    </Svg>
  );
}

export function OnTheRoadStrip({
  road,
  onOpenChat,
  onOpenTrip,
}: {
  road: OnTheRoad[];
  onOpenChat: (friendId: string) => void;
  onOpenTrip: (tripId: number) => void;
}) {
  const styles = useStyles();
  // Wider with large text, so a place's name wraps between words, not inside one (step 10)
  const { fontScale } = useWindowDimensions();
  const width = Math.round(ITEM_WIDTH * Math.min(Math.max(fontScale, 1), MAX_GROWTH));
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  if (!road.length) return null;

  return (
    <View style={styles.wrap} testID="on-the-road">
      <Text style={styles.title} accessibilityRole="header">
        {t('friends.road.title')}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {road.map(({ friend, trip }) => {
          const name = friend.display_name || friend.username;
          const first = name.split(/\s+/)[0];
          const openTrip = () => onOpenTrip(trip.trip_id);
          return (
            <PressableScale
              key={friend.id}
              pressEffect="scale"
              haptic="selection"
              onPress={() => onOpenChat(friend.id)}
              onLongPress={openTrip}
              delayLongPress={350}
              style={[styles.item, { width }]}
              accessibilityRole="button"
              accessibilityLabel={stripLabel(name, trip, t, i18n.language, f.n)}
              accessibilityHint={t('friends.road.hint')}
              accessibilityActions={[{ name: 'openTrip', label: t('friends.road.openTrip') }]}
              onAccessibilityAction={(e: AccessibilityActionEvent) => e.nativeEvent.actionName === 'openTrip' && openTrip()}
              testID={`road-${friend.username}`}
            >
              <View style={styles.face}>
                <Ring value={progress(trip)} />
                <Avatar name={name} id={friend.id} size={52} />
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {first}
              </Text>
              {/* Two lines: "Bandarban · Sat" and Bangla don't fit in one */}
              <Text style={styles.line} numberOfLines={2}>
                {stripLine(trip, t, i18n.language, f.n)}
              </Text>
            </PressableScale>
          );
        })}
      </ScrollView>
      <View style={styles.rule} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { marginBottom: t.spacing.xs },
  title: {
    ...t.type.footnote,
    fontWeight: '600',
    color: t.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: t.spacing.lg + 2,
    marginTop: t.spacing.sm,
    marginBottom: t.spacing.sm,
  },
  row: { paddingHorizontal: t.spacing.lg, gap: 14 },
  item: { alignItems: 'center', gap: 4 },
  face: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  name: { ...t.type.footnote, fontWeight: '500', color: t.colors.textPrimary, marginTop: 2 },
  line: { ...t.type.caption, fontSize: 12, color: t.colors.textSecondary, textAlign: 'center' },
  rule: { height: 1, backgroundColor: t.colors.divider, marginTop: t.spacing.lg, marginBottom: t.spacing.xs },
}));
