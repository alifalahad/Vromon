/**
 * "Not checked": a place from outside Vromon's checked data (trip upgrades step 6). Results from the
 * places index and the address search, and the stops made from them, on cards, the map and Today.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '../../ui/theme';
import { planColors } from '../trips/plan/colors';

export function NotCheckedBadge({ testID, style }: { testID?: string; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const theme = useTheme();
  const colors = planColors(theme);
  const { t } = useTranslation();
  return (
    <View style={[styles.badge, { backgroundColor: colors.unchecked }, style]} testID={testID}>
      <Text style={[styles.text, { color: colors.onUnchecked }]} maxFontSizeMultiplier={1.4}>
        {t('search.notChecked')}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  badge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  text: { fontSize: 12, fontWeight: '700' },
}));
