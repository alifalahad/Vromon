/**
 * Explore's photo card: the place's photo (or Esri's satellite view of a district) with a dark
 * gradient at the bottom, its name, and optionally a flag on top and a line under the name.
 * Without a photo: a plain surface. The photo's credit is listed in the
 * screen's credits (`PhotoCredits`), as its licence asks.
 */

import { Image } from 'expo-image';
import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { PressableScale } from '../../ui/PressableScale';
import { makeStyles } from '../../ui/theme';
import type { ExplorePhoto, Photo } from './api';

export function PhotoCard({
  photo,
  title,
  subtitle,
  flag,
  badge,
  width,
  height,
  onPress,
  style,
  accessibilityLabel,
  testID,
}: {
  photo: ExplorePhoto | Photo | null;
  title: string;
  subtitle?: string | null;
  /** an emoji flag above the name (countries) or beside the subtitle (cities) */
  flag?: string;
  /** a small label in the top corner, e.g. "GI" */
  badge?: string | null;
  width: number | `${number}%`;
  height: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const styles = useStyles();
  const uri = photo?.thumb_url ?? photo?.url ?? null;
  const centred = !subtitle;
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      style={[styles.card, { width, height }, style]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join(', ')}
      testID={testID}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.fill} contentFit="cover" transition={200} cachePolicy="disk" recyclingKey={uri} />
      ) : (
        <View style={[styles.fill, styles.empty]} />
      )}
      <Svg style={styles.fill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity={centred ? 0.15 : 0} />
            <Stop offset="0.45" stopColor="#000" stopOpacity={centred ? 0.25 : 0.05} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.72} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#shade)" />
      </Svg>
      {flag && centred ? <Text style={styles.topFlag}>{flag}</Text> : null}
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <View style={[styles.label, centred && styles.labelCentred]}>
        <Text
          style={[styles.title, centred && styles.titleCentred]}
          numberOfLines={centred ? 1 : 2}
          adjustsFontSizeToFit={centred}
          minimumFontScale={0.6}
          maxFontSizeMultiplier={1.3}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {flag && !centred ? `${flag}  ` : ''}
            {subtitle}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

/** The credits for the photos a screen shows, once each. */
export function PhotoCredits({ photos }: { photos: (ExplorePhoto | Photo | null | undefined)[] }) {
  const styles = useStyles();
  const lines = [...new Set(photos.map((p) => p?.attribution).filter((a): a is string => !!a))];
  if (!lines.length) return null;
  return (
    <View style={styles.credits}>
      <Text style={styles.creditsTitle}>Photo credits</Text>
      {lines.map((l) => (
        <Text key={l} style={styles.creditLine} numberOfLines={2}>
          {l}
        </Text>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { borderRadius: 24, overflow: 'hidden', backgroundColor: t.colors.surfaceInset },
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  empty: { alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surfaceRaised },
  topFlag: { position: 'absolute', top: 16, alignSelf: 'center', fontSize: 30 },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  label: { position: 'absolute', left: 14, right: 14, bottom: 14 },
  labelCentred: { top: 0, justifyContent: 'center', alignItems: 'center' },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  titleCentred: { fontSize: 24, textAlign: 'center' },
  subtitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '500', marginTop: 4, opacity: 0.95 },
  credits: { marginTop: 24, gap: 4, paddingHorizontal: 4 },
  creditsTitle: { ...t.type.footnote, fontWeight: '700', color: t.colors.textSecondary },
  creditLine: { ...t.type.caption, color: t.colors.textTertiary },
}));
