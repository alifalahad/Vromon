import React from 'react';
import { Text } from 'react-native';

import { makeStyles } from '../ui/theme';

/** Shared disclaimer: map lines and travel times are estimates, not road routing. */
export function MapLegendText() {
  const styles = useStyles();
  return (
    <Text style={styles.caption}>
      Travel times are straight-line estimates at 30 km/h, not road routes.
    </Text>
  );
}

const useStyles = makeStyles((t) => ({
  caption: { color: t.colors.textTertiary, fontSize: 11, lineHeight: 16 },
}));
