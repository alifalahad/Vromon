/**
 * "You're sharing your live location" with Stop (friends-chat step 8, mockup 11): under
 * the room's header in the room, and floating at the bottom of every other screen while
 * it runs, so it's never shared without you seeing it.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { usePlanFormat } from '../trips/plan/usePlanFormat';
import { stopLiveShare, useLiveShare } from './liveShare';
import { useMinuteClock, useOpenChat } from './state';

export function LiveShareBar({ variant }: { variant: 'inline' | 'floating' }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const share = useLiveShare((s) => s.share);
  const openChat = useOpenChat((s) => s.id);
  const now = useMinuteClock();
  if (!share) return null;
  // In the room itself, the bar sits under its header instead
  if (variant === 'floating' && openChat === share.conversationId) return null;
  const left = Math.max(0, Math.ceil((Date.parse(share.until) - now.getTime()) / 60_000));
  const line = t('chat.live.left', { room: share.roomName, time: f.duration(left) });
  return (
    <View
      style={[styles.bar, variant === 'floating' && [styles.floating, { bottom: insets.bottom + 92 }]]}
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      testID={`live-share-bar-${variant}`}
    >
      <MaterialCommunityIcons name="crosshairs-gps" size={22} color={colors.onAccentSoft} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {t('chat.live.sharing')}
        </Text>
        <Text style={styles.line} numberOfLines={1}>
          {line}
        </Text>
      </View>
      <PressableScale
        pressEffect="opacity"
        haptic="selection"
        onPress={() => void stopLiveShare(client)}
        style={styles.stop}
        accessibilityRole="button"
        accessibilityLabel={t('chat.live.stopLabel')}
        testID={`live-share-stop-${variant}`}
      >
        <Text style={styles.stopText}>{t('chat.live.stop')}</Text>
      </PressableScale>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  bar: {
    marginHorizontal: t.spacing.md,
    marginTop: t.spacing.sm,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 8,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: t.colors.accentSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
  },
  // Over every other screen: opaque, with a shadow, clear of the tab bar
  floating: { position: 'absolute', left: 0, right: 0, backgroundColor: t.colors.surfaceRaised, elevation: 6, shadowColor: t.colors.shadow, shadowOpacity: 0.3, shadowRadius: 8 },
  text: { flex: 1, gap: 1 },
  title: { ...t.type.footnote, fontWeight: '600', color: t.colors.textPrimary },
  line: { ...t.type.footnote, color: t.colors.textSecondary },
  stop: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.colors.surface, alignItems: 'center', justifyContent: 'center' },
  stopText: { ...t.type.footnote, fontWeight: '700', color: t.colors.danger },
}));
