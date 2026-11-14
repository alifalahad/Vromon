/**
 * The pieces of "Your travels" (docs/ui-refresh step 2, frames 3–5): number tiles, list rows with
 * the status as a word, the empty state, and a card for a group of rows.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { VisitStatus } from '../../types';
import { Button } from '../../ui/Button';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { useMapTheme } from '../mapThemes/useMapTheme';

type Icon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** A number on the dashboard; it opens the list behind it. `of` and `fraction` add "of 8" and a bar. */
export function Tile({
  icon,
  value,
  of,
  label,
  fraction,
  tone = 'blue',
  onPress,
  testID,
}: {
  icon: Icon;
  value: string;
  of?: string;
  label: string;
  fraction?: number;
  tone?: 'blue' | 'warm' | 'green';
  onPress: () => void;
  testID: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const map = useMapTheme();
  const tint = tone === 'blue' ? colors.accentTint : tone === 'green' ? colors.successBg : colors.warningBg;
  const ink = tone === 'blue' ? colors.onAccentSoft : tone === 'green' ? colors.success : colors.warning;
  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      style={styles.tile}
      accessibilityRole="button"
      accessibilityLabel={[value, of, label].filter(Boolean).join(' ')}
      testID={testID}
    >
      <View style={styles.tileTop}>
        <View style={[styles.tileIcon, { backgroundColor: tint }]}>
          <MaterialCommunityIcons name={icon} size={20} color={ink} />
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
      </View>
      <Text style={styles.tileValue} maxFontSizeMultiplier={1.4}>
        {value}
        {of ? <Text style={styles.tileOf}> {of}</Text> : null}
      </Text>
      <View style={styles.tileLabelRow}>
        <Text style={styles.tileLabel} numberOfLines={2}>
          {label}
        </Text>
        {fraction != null ? (
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.round(Math.min(1, fraction) * 100)}%`, backgroundColor: map.status.visited }]} />
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

/** A status as a coloured dot and a word: colour is never the only signal. */
export function StatusChip({ status, here = false }: { status: VisitStatus; here?: boolean }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const map = useMapTheme();
  return (
    <View style={styles.chip}>
      <View style={[styles.chipDot, { backgroundColor: map.status[status] }]} />
      <Text style={styles.chipText}>{t(here ? `travels.here.${status}` : `travels.status.${status}`)}</Text>
    </View>
  );
}

/** One row in a list: a dot in the place's colour, the name, a second line, what's on the right. */
export function TravelRow({
  name,
  sub,
  status,
  right,
  onPress,
  accessibilityHint,
  last,
  testID,
}: {
  name: string;
  sub?: string | null;
  /** null: not marked (a hollow dot) */
  status?: VisitStatus | null;
  right?: React.ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
  last?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const map = useMapTheme();
  const body = (
    <>
      {status !== undefined ? (
        <View style={[styles.dot, status ? { backgroundColor: map.status[status] } : styles.dotEmpty]} />
      ) : null}
      <View style={styles.rowText}>
        <Text style={styles.rowName}>{name}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {right}
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} /> : null}
    </>
  );
  return (
    <View style={[!last && styles.rowLine]}>
      {onPress ? (
        <PressableScale pressEffect="opacity" haptic="selection" onPress={onPress} style={styles.row} accessibilityRole="button" accessibilityHint={accessibilityHint} testID={testID}>
          {body}
        </PressableScale>
      ) : (
        <View style={styles.row} testID={testID}>
          {body}
        </View>
      )}
    </View>
  );
}

/** A white card holding rows. */
export function Card({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.card}>{children}</View>;
}

/** Nothing in a list yet: what to do about it (frame 5). */
export function EmptyList({ icon, title, body, action, onAction, testID }: { icon: Icon; title: string; body: string; action?: string; onAction?: () => void; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.empty} testID={testID}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name={icon} size={34} color={colors.onAccentSoft} />
      </View>
      <Text style={styles.emptyTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action && onAction ? <Button label={action} onPress={onAction} style={styles.emptyButton} /> : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  tile: { flex: 1, gap: 10, padding: 14, paddingLeft: 16, borderRadius: t.radius.card, backgroundColor: t.colors.surface, ...t.depth.card },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tileValue: { ...t.type.title, fontSize: 28, lineHeight: 32, color: t.colors.textPrimary },
  tileOf: { ...t.type.title, fontSize: 16, color: t.colors.textSecondary },
  tileLabelRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  tileLabel: { ...t.type.footnote, fontSize: 13.5, color: t.colors.textSecondary, flexShrink: 1 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: t.colors.surfaceInset, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: t.colors.surfaceInset },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { ...t.type.caption, fontSize: 12.5, fontWeight: '700', color: t.colors.textPrimary },
  card: { borderRadius: t.radius.card, backgroundColor: t.colors.surface, ...t.depth.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 64, paddingVertical: t.spacing.sm, paddingLeft: t.spacing.lg, paddingRight: t.spacing.md },
  rowLine: { borderBottomWidth: 1, borderBottomColor: t.colors.divider, marginLeft: 0 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dotEmpty: { borderWidth: 2, borderColor: t.colors.textTertiary },
  rowText: { flex: 1, gap: 2 },
  rowName: { ...t.type.body, fontWeight: '500', color: t.colors.textPrimary },
  rowSub: { ...t.type.footnote, color: t.colors.textSecondary },
  empty: { alignItems: 'center', gap: 10, paddingHorizontal: t.spacing.xxl, paddingTop: 32, paddingBottom: 28, borderRadius: t.radius.card, backgroundColor: t.colors.surface, ...t.depth.card },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: t.colors.accentTint, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { ...t.type.title, color: t.colors.textPrimary, textAlign: 'center' },
  emptyBody: { ...t.type.callout, lineHeight: 22, color: t.colors.textSecondary, textAlign: 'center' },
  emptyButton: { marginTop: 10, alignSelf: 'stretch' },
}));
