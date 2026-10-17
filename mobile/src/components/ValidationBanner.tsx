/**
 * Shows the independent validator's verdict for the current itinerary.
 *
 * Hard problems are always listed (they cannot be collapsed away). Preference
 * warnings and data limitations (placeholder prices, estimates) are listed
 * separately under "Details".
 */

import React, { useState } from 'react';
import { Text, View } from 'react-native';

import type { ValidationReport } from '../types';
import { PressableScale } from '../ui/PressableScale';
import { makeStyles, useTheme, type ThemeColors } from '../ui/theme';
import { summariseValidation } from '../utils/itinerary';

const tones = (colors: ThemeColors) => ({
  ok: { bg: colors.successBg, fg: colors.success, icon: '✅' },
  warning: { bg: colors.warningBg, fg: colors.warning, icon: '⚠️' },
  error: { bg: colors.dangerBg, fg: colors.danger, icon: '⛔' },
});

export function ValidationBanner({ report, extra }: { report: ValidationReport | null | undefined; extra?: string | null }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const summary = summariseValidation(report);
  const tone = tones(colors)[summary.tone];
  const expandable = summary.soft.length > 0 || summary.info.length > 0;

  return (
    <View style={[styles.banner, { backgroundColor: tone.bg }]}>
      <View style={styles.row} accessibilityRole="header">
        <Text style={styles.icon}>{tone.icon}</Text>
        <Text style={[styles.title, { color: tone.fg }]}>{summary.title}</Text>
      </View>
      {extra ? <Text style={styles.extra}>{extra}</Text> : null}

      {summary.hard.map((m, i) => (
        <Text key={`h${i}`} style={styles.hard}>
          ⛔ {m}
        </Text>
      ))}

      {expandable && (
        <PressableScale
          haptic="selection"
          pressEffect="opacity"
          accessibilityRole="button"
          accessibilityLabel={open ? 'Hide details' : 'Show details'}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((v) => !v)}
          style={styles.toggleRow}
        >
          <Text style={[styles.toggle, { color: tone.fg }]}>
            {open ? 'Hide details' : `Details (${[
              summary.soft.length ? `${summary.soft.length} preference` : '',
              summary.info.length ? `${summary.info.length} data note${summary.info.length > 1 ? 's' : ''}` : '',
            ].filter(Boolean).join(', ')})`}
          </Text>
        </PressableScale>
      )}

      {open && summary.soft.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>Preference warnings</Text>
          {summary.soft.map((m, i) => (
            <Text key={`s${i}`} style={styles.message}>• {m}</Text>
          ))}
        </View>
      )}
      {open && summary.info.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>Data limitations</Text>
          {summary.info.map((m, i) => (
            <Text key={`i${i}`} style={styles.message}>ℹ︎ {m}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  banner: { borderRadius: 16, padding: 14, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { fontSize: 14 },
  title: { flex: 1, fontWeight: '700', fontSize: 13 },
  toggleRow: { paddingVertical: 4 },
  toggle: { fontSize: 12, fontWeight: '600' },
  extra: { color: t.colors.textSecondary, fontSize: 12 },
  hard: { color: t.colors.textPrimary, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  group: { gap: 3 },
  groupTitle: { color: t.colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  message: { color: t.colors.textPrimary, fontSize: 12, lineHeight: 18 },
}));
