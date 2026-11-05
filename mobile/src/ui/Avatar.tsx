import { Image } from 'expo-image';
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

/**
 * One colour per person (from their id), so a list of chats is easy to scan.
 * White initials are at least 4.5:1 on each (contrast.test.ts), in both appearances.
 */
export const AVATAR_COLORS = ['#1F6F5C', '#6A2E8F', '#8A4B14', '#A1365A', '#2D5DB3', '#7B3FA0', '#356B1F', '#B04A1F'] as const;

export function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * The person's profile photo when they added one (`uri`), else their initials in a circle. With an
 * `id` the circle has that person's colour; without one, the strong accent. Decorative: the name is
 * always shown beside it.
 */
export function Avatar({ name, size = 48, id, uri }: { name: string | null | undefined; size?: number; id?: string; uri?: string | null }) {
  const styles = useStyles();
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        cachePolicy="disk"
        transition={150}
        accessibilityIgnoresInvertColors
        importantForAccessibility="no"
      />
    );
  }
  return (
    <View
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }, id ? { backgroundColor: avatarColor(id) } : null]}
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.text, { fontSize: size * 0.36 }]} maxFontSizeMultiplier={1.2}>
        {initials(name)}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // White initials: `accent` is only 4.1:1, too little for 16 px text
  circle: { backgroundColor: t.colors.accentStrong, alignItems: 'center', justifyContent: 'center' },
  text: { color: t.colors.onAccent, fontWeight: '700' },
}));
