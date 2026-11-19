/**
 * "Put this trip on your map?" (docs/ui-refresh step 16, frame 33): on a finished trip of yours while the offer
 * is unanswered, with what it will mark. "Mark visited" and "Not now" are the same answer as the Trips tab's
 * (POST /trips/{id}/mark-visited): answered in one place, it's gone from the other.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';

/** "Marks Cox's Bazar as visited.", "Marks Bandarban and Rangamati as visited." */
export function markLine(places: readonly string[], t: (k: string, o?: Record<string, unknown>) => string): string {
  if (places.length <= 1) return t('after.mapOne', { place: places[0] ?? '' });
  return t('after.mapMany', { list: places.slice(0, -1).join(', '), last: places[places.length - 1] });
}

export function MapOffer({ places, busy, onMark, onNotNow }: { places: readonly string[]; busy: boolean; onMark: () => void; onNotNow: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.card} testID="map-offer">
      <View style={styles.top}>
        <View style={styles.icon}>
          <MaterialCommunityIcons name="map-marker-outline" size={22} color={colors.onMarkTint} />
        </View>
        <View style={styles.texts}>
          <Text style={styles.title} accessibilityRole="header">
            {t('after.mapTitle')}
          </Text>
          <Text style={styles.sub}>{markLine(places, t)}</Text>
        </View>
      </View>
      <View style={styles.buttons}>
        <PressableScale
          haptic="selection"
          onPress={onMark}
          disabled={busy}
          style={[styles.button, styles.mark]}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          testID="map-offer-mark"
        >
          {busy ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Text style={styles.markText}>{t('trips.markYes')}</Text>}
        </PressableScale>
        <PressableScale
          haptic="selection"
          onPress={onNotNow}
          disabled={busy}
          style={[styles.button, styles.later]}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          testID="map-offer-not-now"
        >
          <Text style={styles.laterText}>{t('trips.markNo')}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // Frame 33: a quiet outlined card, 14 inside, rounded 20
  card: { padding: 14, gap: 12, borderRadius: 20, borderWidth: 1, borderColor: t.colors.border },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.markTint },
  texts: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700', color: t.colors.textPrimary },
  sub: { fontSize: 13, color: t.colors.textSecondary },
  buttons: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  mark: { backgroundColor: t.colors.accentStrong },
  markText: { fontSize: 14.5, fontWeight: '500', color: t.colors.onAccent, textAlign: 'center' },
  later: { backgroundColor: t.colors.surfaceInset },
  laterText: { fontSize: 14.5, fontWeight: '500', color: t.colors.textPrimary, textAlign: 'center' },
}));
