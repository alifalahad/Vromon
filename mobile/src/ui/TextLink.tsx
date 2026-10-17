import React from 'react';
import { Text, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from './PressableScale';
import { makeStyles } from './theme';

/** Standalone text link (not inside a sentence): 48 dp target, light haptic, dims on press. */
export function TextLink({
  label,
  onPress,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <PressableScale pressEffect="opacity" accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={[styles.hit, style]} testID={testID}>
      <Text style={styles.text}>{label}</Text>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  hit: { minHeight: t.sizes.minTouch, justifyContent: 'center' },
  text: { ...t.type.callout, fontWeight: '600', color: t.colors.link },
}));
