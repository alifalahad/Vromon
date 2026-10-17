import React from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles } from './theme';

/** Tab-screen header: large bold title under the status bar ("Trips", "Friends"). */
export function LargeTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.spacing.lg + 2,
    paddingBottom: t.spacing.lg,
    backgroundColor: t.colors.bg,
  },
  title: { ...t.type.largeTitle, color: t.colors.textPrimary, flex: 1 },
}));
