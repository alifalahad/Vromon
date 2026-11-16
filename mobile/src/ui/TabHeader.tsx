/**
 * A tab's fixed header (docs/ui-refresh steps 9 and 10, frames 15, 18 and 19): the title (or, on Explore,
 * the search field) stays at the top, clear of the status bar, while the page scrolls under it, with a
 * hairline once something is under it. On the right, the tab's own actions (a pill such as "New trip"),
 * then the account picture.
 *
 * The row is 56 dp tall, 8 dp under the status bar, so the 48 dp account button sits 12 dp under it and
 * 8 dp from the right: where the Map tab's floats (AccountButton's ACCOUNT), on every tab.
 */

import React from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LineIcon } from './LineIcon';
import { PressableScale } from './PressableScale';
import { makeStyles, useTheme } from './theme';

/** The header's row, under the status bar, and the line under it (so the row stays 56) */
const ROW = 56;
const HAIRLINE = 1;

export function TabHeader({
  title,
  children,
  scrolled = false,
  actions,
  account,
  testID,
}: {
  title?: string;
  /** In place of the title (Explore's search field) */
  children?: React.ReactNode;
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
    <View
      // A 56 dp row under the status bar, fixed: the 48 dp account button is centred 12 dp under it whatever is beside it,
      // at any text size (the title's line grows with the phone's text size)
      style={[
        styles.header,
        { paddingTop: insets.top + 8, height: insets.top + 8 + ROW + HAIRLINE },
        children ? styles.custom : null,
        account ? styles.withAccount : null,
        scrolled && styles.scrolled,
      ]}
      testID={testID}
    >
      {children ?? (
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.3}>
          {title}
        </Text>
      )}
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
    paddingLeft: t.spacing.xl,
    paddingRight: t.spacing.lg,
    backgroundColor: t.colors.bg,
    borderBottomWidth: HAIRLINE,
    borderBottomColor: 'transparent',
    zIndex: 10,
  },
  custom: { paddingLeft: t.spacing.lg, gap: 6 },
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
