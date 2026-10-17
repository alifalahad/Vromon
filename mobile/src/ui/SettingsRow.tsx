/**
 * Settings list rows (13-settings-rows.jpg): outlined icon, title, muted value,
 * chevron, divider inset to the title.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Switch, Text, View } from 'react-native';

import { haptics } from './haptics';
import { PressableScale } from './PressableScale';
import { makeStyles, useTheme } from './theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const ICON_SIZE = 28;
const ICON_GAP = 18;

export function SettingsSection({ title, children }: { title?: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      {title ? (
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function SettingsRow({
  icon,
  title,
  value,
  onPress,
  last,
  danger,
  testID,
}: {
  icon: IconName;
  title: string;
  value?: string;
  onPress?: () => void;
  last?: boolean;
  /** Destructive action (e.g. Delete account): red icon and title */
  danger?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const content = (
    <>
      <MaterialCommunityIcons name={icon} size={ICON_SIZE} color={danger ? colors.danger : colors.textPrimary} style={styles.icon} />
      <View style={[styles.body, !last && styles.divider]}>
        <Text style={[styles.title, danger && styles.danger]} numberOfLines={1}>
          {title}
        </Text>
        {value ? (
          <Text style={styles.value} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {onPress ? <MaterialCommunityIcons name="chevron-right" size={26} color={colors.textSecondary} /> : null}
      </View>
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={value ? `${title}, ${value}` : title} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <PressableScale
      pressEffect="opacity"
      onPress={onPress}
      style={styles.row}
      accessibilityLabel={value ? `${title}, ${value}` : title}
      testID={testID}
    >
      {content}
    </PressableScale>
  );
}

export function SettingsSwitchRow({
  icon,
  title,
  value,
  onValueChange,
  last,
  testID,
}: {
  icon: IconName;
  title: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  last?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const toggle = (v: boolean) => {
    // Turning haptics on should be felt; turning them off must not buzz.
    onValueChange(v);
    haptics.selection();
  };
  return (
    // The whole 64 dp row is the target (the Switch alone is ~27 dp tall)
    <PressableScale
      pressEffect="opacity"
      haptic="none"
      style={styles.row}
      onPress={() => toggle(!value)}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityState={{ checked: value }}
      testID={testID ? `${testID}-row` : undefined}
    >
      <MaterialCommunityIcons name={icon} size={ICON_SIZE} color={colors.textPrimary} style={styles.icon} />
      <View style={[styles.body, !last && styles.divider]}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Switch
          testID={testID}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          value={value}
          onValueChange={toggle}
          trackColor={{ true: colors.accent, false: colors.surfaceRaised }}
          thumbColor={colors.onAccent}
        />
      </View>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  section: { marginBottom: t.spacing.xl },
  sectionTitle: {
    ...t.type.footnote,
    fontWeight: '600',
    color: t.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: t.spacing.xl,
    paddingBottom: t.spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: t.spacing.xl, minHeight: 64 },
  icon: { marginRight: ICON_GAP },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingRight: t.spacing.lg, gap: t.spacing.sm },
  divider: { borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  title: { ...t.type.body, fontSize: 17, color: t.colors.textPrimary, flex: 1 },
  value: { ...t.type.body, fontSize: 17, color: t.colors.textSecondary, flexShrink: 1 },
  danger: { color: t.colors.danger },
}));
