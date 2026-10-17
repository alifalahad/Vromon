import React from 'react';
import { Text, View } from 'react-native';

import { makeStyles } from './theme';

export function initials(name: string | null | undefined): string {
  // Letters and digits only: "Rafi (QA)" → "RQ", not "R("
  const parts = (name ?? '')
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2)).toUpperCase();
}

/** Initials in an accent circle (profile photos arrive in Phase 6). Decorative: the name is always shown beside it. */
export function Avatar({ name, size = 48 }: { name: string | null | undefined; size?: number }) {
  const styles = useStyles();
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]} importantForAccessibility="no-hide-descendants">
      <Text style={[styles.text, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  circle: { backgroundColor: t.colors.accent, alignItems: 'center', justifyContent: 'center' },
  text: { color: t.colors.onAccent, fontWeight: '700' },
}));
