import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { colors } from '../theme';

/** Shared disclaimer: map lines and travel times are estimates, not road routing. */
export function MapLegendText() {
  return (
    <Text style={styles.caption}>
      Travel times are straight-line estimates at 30 km/h, not road routes.
    </Text>
  );
}

const styles = StyleSheet.create({
  caption: { color: colors.textDim, fontSize: 11, lineHeight: 16 },
});
