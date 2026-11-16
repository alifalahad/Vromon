/**
 * A tab's fixed header (docs/ui-refresh step 9, frame 15): the title stays at the top, clear of the status
 * bar, while the page scrolls under it, with a hairline once something is under it. On the right, the tab's
 * own actions (a pill such as "New trip"), then a slot for the account picture (step 10).
 */

import React from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LineIcon } from './LineIcon';
import { PressableScale } from './PressableScale';
import { makeStyles, useTheme } from './theme';

export function TabHeader({
  title,
  scrolled = false,
  actions,
  account,
  testID,
}: {
  title: string;
  /** Something is scrolled under the header: show the hairline */
  scrolled?: boolean;
  /** The tab's own buttons, on the right */
  actions?: React.ReactNode;
  /** The account picture, at the far right (step 10) */
  account?: React.ReactNode;
  testID?: string;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 4 }, account ? styles.withAccount : null, scrolled && styles.scrolled]} testID={testID}>
      <Text style={styles.title} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.3}>
        {title}
      </Text>
      {actions}
      {account}
    </View>
  );
}

/** A quiet blue pill in the header ("+ New trip") */
export function HeaderPill({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale haptic="selection" onPress={onPress} hitSlop={4} style={styles.pill} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
      <LineIcon name="plus" size={18} color={colors.link} strokeWidth={2.6} />
      <Text style={styles.pillText} maxFontSizeMultiplier={1.3} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: 56,
    paddingLeft: t.spacing.xl,
    paddingRight: t.spacing.lg,
    paddingBottom: 4,
    backgroundColor: t.colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
    zIndex: 10,
  },
  withAccount: { paddingRight: t.spacing.sm },
  scrolled: { borderBottomColor: t.colors.hairline },
  title: {
    flex: 1,
    fontFamily: t.type.title.fontFamily,
    fontSize: 32,
    lineHeight: 42,
    fontWeight: 'normal',
    includeFontPadding: false,
    color: t.colors.textPrimary,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingLeft: t.spacing.md,
    paddingRight: t.spacing.lg,
    borderRadius: 20,
    backgroundColor: t.colors.accentTint,
  },
  pillText: { fontSize: 14.5, fontWeight: '700', color: t.colors.link },
}));
