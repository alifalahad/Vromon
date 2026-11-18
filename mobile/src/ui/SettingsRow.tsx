/**
 * Settings rows (UI refresh step 13, frame 26): a group is a white card under a small label; each row has
 * an icon on a tinted circle (the group's colour), its title (and a second line), its value, a chevron.
 * Every settings screen draws its rows here, so they all look and behave the same.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { createContext, useContext } from 'react';
import { Text, View } from 'react-native';

import { haptics } from './haptics';
import { PressableScale } from './PressableScale';
import { makeStyles, useTheme, type Theme } from './theme';
import { Toggle } from './Toggle';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** A group's colour: Preferences blue, Privacy green, Your data and About grey */
export type SettingsTone = 'blue' | 'green' | 'grey';

const ICON_CIRCLE = 36;
const ICON_SIZE = 20;

const ToneContext = createContext<SettingsTone>('blue');

function iconColours(colors: Theme['colors'], tone: SettingsTone, danger?: boolean): { tint: string; ink: string } {
  if (danger) return { tint: colors.dangerBg, ink: colors.danger };
  if (tone === 'green') return { tint: colors.successBg, ink: colors.success };
  if (tone === 'grey') return { tint: colors.surfaceInset, ink: colors.textSecondary };
  return { tint: colors.accentTint, ink: colors.onAccentSoft };
}

export function SettingsSection({
  title,
  tone = 'blue',
  footnote,
  children,
  testID,
}: {
  title?: string;
  tone?: SettingsTone;
  /** A line under the card that explains its rows */
  footnote?: string;
  children: React.ReactNode;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.section} testID={testID}>
      {title ? (
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title.toUpperCase()}
        </Text>
      ) : null}
      <ToneContext.Provider value={tone}>
        <View style={styles.card}>{children}</View>
      </ToneContext.Provider>
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}

function RowIcon({ icon, danger }: { icon: IconName; danger?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { tint, ink } = iconColours(colors, useContext(ToneContext), danger);
  return (
    // Decoration: the row's words say what it is
    <View style={[styles.iconCircle, { backgroundColor: tint }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <MaterialCommunityIcons name={icon} size={ICON_SIZE} color={ink} />
    </View>
  );
}

export function SettingsRow({
  icon,
  title,
  subtitle,
  value,
  accessory,
  onPress,
  last,
  danger,
  testID,
}: {
  icon: IconName;
  title: string;
  /** A second line under the title ("Read receipts, notifications, blocked people") */
  subtitle?: string;
  value?: string;
  /** Something drawn before the value (the map theme's picture) */
  accessory?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
  /** Destructive (Delete account): the danger colour, and the words say what it does */
  danger?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const label = [title, subtitle, value].filter(Boolean).join(', ');
  const content = (
    <>
      <RowIcon icon={icon} danger={danger} />
      <View style={[styles.body, !last && styles.divider]}>
        <View style={styles.texts}>
          <View style={styles.titles}>
            <Text style={[styles.title, danger && styles.danger]}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {accessory || value ? (
            <View style={styles.valueRow}>
              {accessory}
              {value ? (
                <Text style={styles.value} numberOfLines={1}>
                  {value}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        {onPress ? <MaterialCommunityIcons name="chevron-right" size={20} color={danger ? colors.danger : colors.textTertiary} /> : null}
      </View>
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={label} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <PressableScale pressEffect="opacity" onPress={onPress} style={styles.row} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
      {content}
    </PressableScale>
  );
}

export function SettingsSwitchRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  last,
  testID,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  last?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  const toggle = (v: boolean) => {
    // Turning haptics on should be felt; turning them off must not buzz.
    onValueChange(v);
    haptics.selection();
  };
  return (
    // The whole row is the target (the switch alone is ~27 dp tall), and one switch for TalkBack
    <PressableScale
      pressEffect="opacity"
      haptic="none"
      style={styles.row}
      onPress={() => toggle(!value)}
      accessibilityRole="switch"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ checked: value }}
      testID={testID ? `${testID}-row` : undefined}
    >
      <RowIcon icon={icon} />
      <View style={[styles.body, !last && styles.divider]}>
        <View style={styles.titles}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Toggle testID={testID} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden value={value} onValueChange={toggle} />
      </View>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  section: { marginBottom: t.spacing.lg, marginHorizontal: t.spacing.lg },
  sectionTitle: { fontSize: 12.5, fontWeight: '700', letterSpacing: 0.8, color: t.colors.textSecondary, marginHorizontal: 4, marginBottom: t.spacing.sm },
  card: { borderRadius: t.radius.card, backgroundColor: t.colors.surface, overflow: 'hidden', ...t.depth.card },
  footnote: { ...t.type.footnote, lineHeight: 18, color: t.colors.textSecondary, marginHorizontal: 4, marginTop: t.spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: t.spacing.md, minHeight: 54 },
  iconCircle: { width: ICON_CIRCLE, height: ICON_CIRCLE, borderRadius: ICON_CIRCLE / 2, alignItems: 'center', justifyContent: 'center', marginRight: t.spacing.md },
  // The line under a row starts at its title (frame 26: 60 dp in), not under the icon
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 54, paddingVertical: t.spacing.sm, paddingRight: t.spacing.md, gap: t.spacing.sm },
  divider: { borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  texts: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: t.spacing.sm, rowGap: 2 },
  titles: { flexShrink: 1, flexGrow: 1, gap: 1 },
  title: { fontSize: 15.5, color: t.colors.textPrimary },
  subtitle: { fontSize: 13, lineHeight: 17, color: t.colors.textSecondary },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, flexShrink: 1, marginLeft: 'auto' },
  value: { fontSize: 14.5, color: t.colors.textSecondary, flexShrink: 1 },
  danger: { color: t.colors.danger, fontWeight: '500' },
}));
