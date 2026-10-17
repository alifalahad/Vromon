/**
 * A card in the Map Theme carousel: colour stripes (Themes, Colors) or a map
 * thumbnail (Styles) above the name. The selected card has an accent border.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Image, Text, View, type ImageSourcePropType } from 'react-native';

import { PressableScale } from '../../ui/PressableScale';
import { makeStyles } from '../../ui/theme';

export const CARD = { stripesWidth: 116, imageWidth: 160, previewHeight: 100, gap: 12 } as const;

export function ThemeCard({
  name,
  stripes,
  image,
  selected,
  locked,
  lockedLabel,
  onPress,
  testID,
}: {
  name: string;
  stripes?: readonly string[];
  image?: ImageSourcePropType;
  selected: boolean;
  /** Premium item while locks are on (decision D2) */
  locked?: boolean;
  lockedLabel?: string;
  onPress: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <PressableScale
      haptic="selection"
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={locked && lockedLabel ? `${name}, ${lockedLabel}` : name}
      style={[styles.card, { width: image ? CARD.imageWidth : CARD.stripesWidth }, selected && styles.selected]}
      onPress={onPress}
      testID={testID}
    >
      <View style={styles.preview}>
        {image ? (
          <Image source={image} style={styles.image} resizeMode="cover" />
        ) : (
          (stripes ?? []).map((c, i) => <View key={i} style={[styles.stripe, { backgroundColor: c }]} />)
        )}
        {locked ? (
          <View style={styles.lock}>
            <MaterialCommunityIcons name="lock" size={16} color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    overflow: 'hidden',
  },
  selected: { borderColor: t.colors.accent },
  preview: { height: CARD.previewHeight, flexDirection: 'row' },
  stripe: { flex: 1 },
  image: { width: '100%', height: '100%' },
  lock: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...t.type.body, fontSize: 17, color: t.colors.textSecondary, paddingHorizontal: 14, paddingVertical: 12 },
}));
